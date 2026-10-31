import { PublicClient, WalletClient, formatUnits, parseUnits } from 'viem';
import { DexRouter, createDexRouter, ERC20_ABI, SwapResult } from './router';

export interface GridLevel {
  price: number;
  type: 'buy' | 'sell';
  amount: bigint;
  filled: boolean;
  txHash?: `0x${string}`;
  filledAt?: number;
  profit?: number;
}

export interface GridBotConfig {
  tokenBase: `0x${string}`;      // Token to trade (e.g., WETH)
  tokenQuote: `0x${string}`;     // Quote token (e.g., USDT)
  upperPrice: number;            // Upper grid bound
  lowerPrice: number;            // Lower grid bound
  gridCount: number;             // Number of grid levels
  investmentAmount: bigint;      // Total investment in quote token
  slippagePercent: number;       // Slippage tolerance
}

export interface GridBotState {
  isRunning: boolean;
  config: GridBotConfig;
  levels: GridLevel[];
  totalInvested: bigint;
  totalProfit: bigint;
  tradesExecuted: number;
  lastCheck: number;
  trades: TradeRecord[];
}

export interface TradeRecord {
  timestamp: number;
  type: 'buy' | 'sell';
  price: number;
  amountIn: string;
  amountOut: string;
  txHash: `0x${string}`;
  gasCost: string;
  profit?: string;
}

export class GridBot {
  private publicClient: PublicClient;
  private walletClient: WalletClient;
  private chainId: number;
  private router: DexRouter;
  private state: GridBotState | null = null;
  private checkInterval: NodeJS.Timeout | null = null;
  private onTradeCallback?: (trade: TradeRecord) => void;
  private onStateChangeCallback?: (state: GridBotState) => void;
  private userAddress: `0x${string}`;

  constructor(
    publicClient: PublicClient,
    walletClient: WalletClient,
    chainId: number,
    userAddress: `0x${string}`
  ) {
    this.publicClient = publicClient;
    this.walletClient = walletClient;
    this.chainId = chainId;
    this.userAddress = userAddress;
    this.router = createDexRouter(publicClient, walletClient, chainId);
  }

  /**
   * Initialize grid bot with configuration
   */
  async initialize(config: GridBotConfig): Promise<GridBotState> {
    // Calculate grid levels
    const priceStep = (config.upperPrice - config.lowerPrice) / (config.gridCount - 1);
    const amountPerLevel = config.investmentAmount / BigInt(config.gridCount);

    const levels: GridLevel[] = [];

    for (let i = 0; i < config.gridCount; i++) {
      const price = config.lowerPrice + (priceStep * i);
      levels.push({
        price,
        type: i < config.gridCount / 2 ? 'buy' : 'sell',
        amount: amountPerLevel,
        filled: false
      });
    }

    this.state = {
      isRunning: false,
      config,
      levels,
      totalInvested: config.investmentAmount,
      totalProfit: 0n,
      tradesExecuted: 0,
      lastCheck: Date.now(),
      trades: []
    };

    return this.state;
  }

  /**
   * Get current market price from DEX
   */
  async getCurrentPrice(): Promise<number> {
    if (!this.state) throw new Error('Bot not initialized');

    const { tokenBase, tokenQuote } = this.state.config;

    // Get decimals
    const baseDecimals = await this.publicClient.readContract({
      address: tokenBase,
      abi: ERC20_ABI,
      functionName: 'decimals'
    });

    const quoteDecimals = await this.publicClient.readContract({
      address: tokenQuote,
      abi: ERC20_ABI,
      functionName: 'decimals'
    });

    // Get quote for 1 base token
    const oneBase = parseUnits('1', baseDecimals);

    try {
      const quote = await this.router.getQuote(tokenBase, tokenQuote, oneBase);
      return parseFloat(formatUnits(quote.amountOut, quoteDecimals));
    } catch (error) {
      console.error('Error getting price:', error);
      throw error;
    }
  }

  /**
   * Execute a real buy order on DEX
   */
  async executeBuy(level: GridLevel): Promise<SwapResult> {
    if (!this.state) throw new Error('Bot not initialized');

    const { tokenBase, tokenQuote, slippagePercent } = this.state.config;

    // Swap quote tokens for base tokens
    const result = await this.router.executeSwap({
      tokenIn: tokenQuote,
      tokenOut: tokenBase,
      amountIn: level.amount,
      slippagePercent,
      recipient: this.userAddress
    });

    return result;
  }

  /**
   * Execute a real sell order on DEX
   */
  async executeSell(level: GridLevel): Promise<SwapResult> {
    if (!this.state) throw new Error('Bot not initialized');

    const { tokenBase, tokenQuote, slippagePercent } = this.state.config;

    // Swap base tokens for quote tokens
    const result = await this.router.executeSwap({
      tokenIn: tokenBase,
      tokenOut: tokenQuote,
      amountIn: level.amount,
      slippagePercent,
      recipient: this.userAddress
    });

    return result;
  }

  /**
   * Check price and execute orders if conditions are met
   */
  async checkAndExecute(): Promise<TradeRecord | null> {
    if (!this.state || !this.state.isRunning) return null;

    try {
      const currentPrice = await this.getCurrentPrice();
      this.state.lastCheck = Date.now();

      // Find unfilled levels that should be executed
      for (const level of this.state.levels) {
        if (level.filled) continue;

        let shouldExecute = false;
        let tradeType: 'buy' | 'sell' = level.type;

        if (level.type === 'buy' && currentPrice <= level.price) {
          // Price dropped to buy level
          shouldExecute = true;
        } else if (level.type === 'sell' && currentPrice >= level.price) {
          // Price rose to sell level
          shouldExecute = true;
        }

        if (shouldExecute) {
          console.log(`Executing ${tradeType} at price ${level.price}, current: ${currentPrice}`);

          try {
            const result = level.type === 'buy'
              ? await this.executeBuy(level)
              : await this.executeSell(level);

            // Get decimals for formatting
            const { tokenBase, tokenQuote } = this.state.config;
            const baseDecimals = await this.publicClient.readContract({
              address: tokenBase,
              abi: ERC20_ABI,
              functionName: 'decimals'
            });
            const quoteDecimals = await this.publicClient.readContract({
              address: tokenQuote,
              abi: ERC20_ABI,
              functionName: 'decimals'
            });

            // Mark level as filled
            level.filled = true;
            level.txHash = result.txHash;
            level.filledAt = Date.now();

            // Calculate profit for sell orders
            let profit: string | undefined;
            if (level.type === 'sell') {
              // Find corresponding buy level
              const buyLevel = this.state.levels.find(l =>
                l.type === 'buy' && l.filled && l.price < level.price
              );
              if (buyLevel) {
                const profitAmount = result.amountOut - level.amount;
                profit = formatUnits(profitAmount, quoteDecimals);
                this.state.totalProfit += profitAmount;
              }
            }

            // Record trade
            const trade: TradeRecord = {
              timestamp: Date.now(),
              type: level.type,
              price: currentPrice,
              amountIn: formatUnits(result.amountIn, level.type === 'buy' ? quoteDecimals : baseDecimals),
              amountOut: formatUnits(result.amountOut, level.type === 'buy' ? baseDecimals : quoteDecimals),
              txHash: result.txHash,
              gasCost: formatUnits(result.gasCostWei, 18),
              profit
            };

            this.state.trades.push(trade);
            this.state.tradesExecuted++;

            // Flip the level type for next round
            level.type = level.type === 'buy' ? 'sell' : 'buy';
            level.filled = false;

            // Callbacks
            if (this.onTradeCallback) {
              this.onTradeCallback(trade);
            }
            if (this.onStateChangeCallback) {
              this.onStateChangeCallback(this.state);
            }

            return trade;
          } catch (error) {
            console.error(`Failed to execute ${tradeType}:`, error);
            // Continue to next level
          }
        }
      }

      return null;
    } catch (error) {
      console.error('Check and execute error:', error);
      return null;
    }
  }

  /**
   * Start the grid bot
   */
  start(intervalMs: number = 10000): void {
    if (!this.state) throw new Error('Bot not initialized');

    this.state.isRunning = true;

    // Run immediately
    this.checkAndExecute();

    // Then run on interval
    this.checkInterval = setInterval(() => {
      this.checkAndExecute();
    }, intervalMs);

    if (this.onStateChangeCallback) {
      this.onStateChangeCallback(this.state);
    }
  }

  /**
   * Stop the grid bot
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    if (this.state) {
      this.state.isRunning = false;

      if (this.onStateChangeCallback) {
        this.onStateChangeCallback(this.state);
      }
    }
  }

  /**
   * Execute a single manual trade
   */
  async executeManualTrade(
    type: 'buy' | 'sell',
    amountIn: bigint
  ): Promise<TradeRecord> {
    if (!this.state) throw new Error('Bot not initialized');

    const { tokenBase, tokenQuote, slippagePercent } = this.state.config;
    const currentPrice = await this.getCurrentPrice();

    let result: SwapResult;

    if (type === 'buy') {
      result = await this.router.executeSwap({
        tokenIn: tokenQuote,
        tokenOut: tokenBase,
        amountIn,
        slippagePercent,
        recipient: this.userAddress
      });
    } else {
      result = await this.router.executeSwap({
        tokenIn: tokenBase,
        tokenOut: tokenQuote,
        amountIn,
        slippagePercent,
        recipient: this.userAddress
      });
    }

    // Get decimals
    const baseDecimals = await this.publicClient.readContract({
      address: tokenBase,
      abi: ERC20_ABI,
      functionName: 'decimals'
    });
    const quoteDecimals = await this.publicClient.readContract({
      address: tokenQuote,
      abi: ERC20_ABI,
      functionName: 'decimals'
    });

    const trade: TradeRecord = {
      timestamp: Date.now(),
      type,
      price: currentPrice,
      amountIn: formatUnits(result.amountIn, type === 'buy' ? quoteDecimals : baseDecimals),
      amountOut: formatUnits(result.amountOut, type === 'buy' ? baseDecimals : quoteDecimals),
      txHash: result.txHash,
      gasCost: formatUnits(result.gasCostWei, 18)
    };

    if (this.state) {
      this.state.trades.push(trade);
      this.state.tradesExecuted++;
    }

    if (this.onTradeCallback) {
      this.onTradeCallback(trade);
    }

    return trade;
  }

  /**
   * Get current state
   */
  getState(): GridBotState | null {
    return this.state;
  }

  /**
   * Set callback for trade events
   */
  onTrade(callback: (trade: TradeRecord) => void): void {
    this.onTradeCallback = callback;
  }

  /**
   * Set callback for state changes
   */
  onStateChange(callback: (state: GridBotState) => void): void {
    this.onStateChangeCallback = callback;
  }

  /**
   * Get total P&L
   */
  getTotalPnL(): { profit: bigint; trades: number; gasCosts: bigint } {
    if (!this.state) {
      return { profit: 0n, trades: 0, gasCosts: 0n };
    }

    let gasCosts = 0n;
    for (const trade of this.state.trades) {
      gasCosts += parseUnits(trade.gasCost, 18);
    }

    return {
      profit: this.state.totalProfit - gasCosts,
      trades: this.state.tradesExecuted,
      gasCosts
    };
  }
}

/**
 * Create a grid bot instance
 */
export function createGridBot(
  publicClient: PublicClient,
  walletClient: WalletClient,
  chainId: number,
  userAddress: `0x${string}`
): GridBot {
  return new GridBot(publicClient, walletClient, chainId, userAddress);
}
