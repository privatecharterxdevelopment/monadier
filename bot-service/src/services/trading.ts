import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
  type PublicClient,
  type WalletClient,
  type Chain
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base, mainnet, polygon, arbitrum, bsc } from 'viem/chains';
import { config, ChainId } from '../config';
import { logger } from '../utils/logger';
import { subscriptionService } from './subscription';
import { positionService, Position } from './positions';

// V2 Vault ABI (position-based trading)
const VAULT_V2_ABI = [
  // Read functions
  {
    inputs: [{ name: 'user', type: 'address' }],
    name: 'autoTradeEnabled',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'user', type: 'address' }],
    name: 'balances',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'user', type: 'address' }],
    name: 'userRiskLevel',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'user', type: 'address' }],
    name: 'canTradeNow',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'token', type: 'address' }
    ],
    name: 'tokenBalances',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  // V2 Trading functions
  {
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'usdcAmount', type: 'uint256' },
      { name: 'minTokenOut', type: 'uint256' }
    ],
    name: 'openPosition',
    outputs: [{ name: 'tokenOut', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'tokenAmount', type: 'uint256' },
      { name: 'minUsdcOut', type: 'uint256' }
    ],
    name: 'closePosition',
    outputs: [{ name: 'usdcOut', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'minUsdcOut', type: 'uint256' }
    ],
    name: 'closeFullPosition',
    outputs: [{ name: 'usdcOut', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [],
    name: 'getPlatformFee',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const;

// Uniswap V2 Router ABI for price quotes
const ROUTER_ABI = [
  {
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'path', type: 'address[]' }
    ],
    name: 'getAmountsOut',
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const;

// Chain mapping
const CHAINS: Record<ChainId, Chain> = {
  8453: base,
  1: mainnet,
  137: polygon,
  42161: arbitrum,
  56: bsc
};

// Base chain addresses
const BASE_CONFIG = {
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`,
  WETH: '0x4200000000000000000000000000000000000006' as `0x${string}`,
  ROUTER: '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24' as `0x${string}`
};

export interface TradeSignal {
  direction: 'LONG' | 'SHORT';
  confidence: number;
  tokenAddress: string;
  tokenSymbol: string;
  suggestedAmount: bigint;
  minAmountOut: bigint;
  reason: string;
}

export interface TradeResult {
  success: boolean;
  txHash?: string;
  amountIn?: string;
  amountOut?: string;
  positionId?: string;
  error?: string;
}

export class TradingService {
  private botAccount = privateKeyToAccount(config.botPrivateKey);
  private clients: Map<ChainId, { public: PublicClient; wallet: WalletClient }> = new Map();

  constructor() {
    this.initializeClients();
  }

  private initializeClients() {
    for (const [chainIdStr, chainConfig] of Object.entries(config.chains)) {
      const chainId = parseInt(chainIdStr) as ChainId;
      const chain = CHAINS[chainId];

      // Use V2 vault address if available
      const vaultAddress = (chainConfig as any).vaultV2Address || chainConfig.vaultAddress;
      if (!chain || !vaultAddress) continue;

      const publicClient = createPublicClient({
        chain,
        transport: http(chainConfig.rpcUrl)
      });

      const walletClient = createWalletClient({
        account: this.botAccount,
        chain,
        transport: http(chainConfig.rpcUrl)
      });

      this.clients.set(chainId, {
        public: publicClient as PublicClient,
        wallet: walletClient as WalletClient
      });

      logger.info(`Initialized V2 client for ${chainConfig.name}`, { chainId, vaultAddress });
    }
  }

  /**
   * Get V2 vault address for a chain
   */
  private getV2VaultAddress(chainId: ChainId): `0x${string}` | undefined {
    const chainConfig = config.chains[chainId] as any;
    return chainConfig?.vaultV2Address || chainConfig?.vaultAddress;
  }

  /**
   * Get user's vault status
   */
  async getUserVaultStatus(chainId: ChainId, userAddress: `0x${string}`) {
    const clients = this.clients.get(chainId);
    const vaultAddress = this.getV2VaultAddress(chainId);

    if (!clients || !vaultAddress) {
      return null;
    }

    try {
      const [balance, autoTradeEnabled, riskLevel, canTradeNow] = await Promise.all([
        clients.public.readContract({
          address: vaultAddress,
          abi: VAULT_V2_ABI,
          functionName: 'balances',
          args: [userAddress]
        }),
        clients.public.readContract({
          address: vaultAddress,
          abi: VAULT_V2_ABI,
          functionName: 'autoTradeEnabled',
          args: [userAddress]
        }),
        clients.public.readContract({
          address: vaultAddress,
          abi: VAULT_V2_ABI,
          functionName: 'userRiskLevel',
          args: [userAddress]
        }),
        clients.public.readContract({
          address: vaultAddress,
          abi: VAULT_V2_ABI,
          functionName: 'canTradeNow',
          args: [userAddress]
        })
      ]);

      return {
        balance,
        balanceFormatted: formatUnits(balance, 6),
        autoTradeEnabled,
        riskLevel: Number(riskLevel),
        canTradeNow
      };
    } catch (err) {
      logger.error('Failed to get vault status', { chainId, userAddress, error: err });
      return null;
    }
  }

  /**
   * Get current token price in USDC
   */
  async getTokenPrice(chainId: ChainId, tokenAddress: `0x${string}`): Promise<number | null> {
    const clients = this.clients.get(chainId);
    if (!clients) return null;

    try {
      // Get price for 1 token via Uniswap router
      const oneToken = parseUnits('1', 18); // Assume 18 decimals

      // Path: Token -> WETH -> USDC
      const path = [tokenAddress, BASE_CONFIG.WETH, BASE_CONFIG.USDC];

      const amounts = await clients.public.readContract({
        address: BASE_CONFIG.ROUTER,
        abi: ROUTER_ABI,
        functionName: 'getAmountsOut',
        args: [oneToken, path]
      });

      const usdcAmount = amounts[amounts.length - 1];
      return parseFloat(formatUnits(usdcAmount, 6));
    } catch (err) {
      logger.error('Failed to get token price', { tokenAddress, error: err });
      return null;
    }
  }

  /**
   * Open a position (buy tokens and hold)
   */
  async openPosition(
    chainId: ChainId,
    userAddress: `0x${string}`,
    signal: TradeSignal
  ): Promise<TradeResult> {
    const clients = this.clients.get(chainId);
    const vaultAddress = this.getV2VaultAddress(chainId);

    if (!clients || !vaultAddress) {
      return { success: false, error: 'Chain not configured' };
    }

    // 1. Check subscription permission
    const permission = await subscriptionService.canTrade(userAddress);
    if (!permission.allowed) {
      logger.warn('Trade blocked by subscription', {
        userAddress,
        reason: permission.reason,
        planTier: permission.planTier
      });
      return { success: false, error: permission.reason };
    }

    // 2. Check vault status
    const vaultStatus = await this.getUserVaultStatus(chainId, userAddress);
    if (!vaultStatus) {
      return { success: false, error: 'Failed to get vault status' };
    }

    if (!vaultStatus.autoTradeEnabled) {
      return { success: false, error: 'Auto-trade not enabled' };
    }

    if (!vaultStatus.canTradeNow) {
      return { success: false, error: 'Rate limit - wait 30 seconds' };
    }

    if (vaultStatus.balance === 0n) {
      return { success: false, error: 'No balance in vault' };
    }

    // 3. Check for existing position in this token
    const hasPosition = await positionService.hasOpenPosition(
      userAddress,
      chainId,
      signal.tokenAddress
    );
    if (hasPosition) {
      return { success: false, error: 'Already have open position in this token' };
    }

    // 4. Calculate trade amount based on risk level
    const riskBps = vaultStatus.riskLevel || 500; // Default 5%
    const maxTradeSize = (vaultStatus.balance * BigInt(riskBps)) / 10000n;
    const tradeAmount = signal.suggestedAmount > maxTradeSize
      ? maxTradeSize
      : signal.suggestedAmount;

    if (tradeAmount === 0n) {
      return { success: false, error: 'Trade amount too small' };
    }

    // 5. Execute openPosition on V2 vault
    try {
      logger.info('Opening position', {
        chainId,
        userAddress,
        token: signal.tokenAddress,
        amountIn: formatUnits(tradeAmount, 6),
        confidence: signal.confidence
      });

      const txHash = await clients.wallet.writeContract({
        address: vaultAddress,
        abi: VAULT_V2_ABI,
        functionName: 'openPosition',
        args: [
          userAddress,
          signal.tokenAddress as `0x${string}`,
          tradeAmount,
          signal.minAmountOut
        ],
        chain: CHAINS[chainId],
        account: this.botAccount
      });

      // Wait for confirmation
      const receipt = await clients.public.waitForTransactionReceipt({
        hash: txHash
      });

      if (receipt.status !== 'success') {
        return { success: false, error: 'Transaction reverted' };
      }

      // 6. Get current token price
      const currentPrice = await this.getTokenPrice(chainId, signal.tokenAddress as `0x${string}`);
      if (!currentPrice) {
        logger.warn('Could not get token price for position tracking');
      }

      // 7. Record position in database with trailing stop
      const entryPrice = currentPrice || 0;
      const entryAmount = parseFloat(formatUnits(tradeAmount, 6));

      // Estimate tokens received (we'd need to parse logs for exact amount)
      const estimatedTokens = entryPrice > 0 ? entryAmount / entryPrice : 0;

      const position = await positionService.openPosition({
        walletAddress: userAddress,
        chainId,
        tokenAddress: signal.tokenAddress,
        tokenSymbol: signal.tokenSymbol,
        entryPrice,
        entryAmount,
        tokenAmount: estimatedTokens,
        txHash,
        trailingStopPercent: 1.0 // Default 1% trailing stop
      });

      // 8. Record the trade in subscription
      await subscriptionService.recordTrade(userAddress);

      logger.info('Position opened successfully', {
        chainId,
        userAddress,
        txHash,
        positionId: position?.id,
        entryPrice,
        amountIn: formatUnits(tradeAmount, 6)
      });

      return {
        success: true,
        txHash,
        positionId: position?.id,
        amountIn: formatUnits(tradeAmount, 6)
      };
    } catch (err: any) {
      logger.error('Position open failed', {
        chainId,
        userAddress,
        error: err.message
      });
      return { success: false, error: err.message };
    }
  }

  /**
   * Close a position (sell tokens back to USDC)
   */
  async closePosition(
    chainId: ChainId,
    position: Position,
    closeReason: 'trailing_stop' | 'take_profit' | 'manual' | 'stop_loss'
  ): Promise<TradeResult> {
    const clients = this.clients.get(chainId);
    const vaultAddress = this.getV2VaultAddress(chainId);

    if (!clients || !vaultAddress) {
      return { success: false, error: 'Chain not configured' };
    }

    try {
      const userAddress = position.wallet_address as `0x${string}`;
      const tokenAddress = position.token_address as `0x${string}`;

      logger.info('Closing position', {
        positionId: position.id,
        userAddress,
        token: position.token_symbol,
        closeReason
      });

      // Close full position with 0.5% slippage tolerance
      const currentPrice = await this.getTokenPrice(chainId, tokenAddress);
      const tokenValue = position.token_amount * (currentPrice || position.entry_price);
      const minUsdcOut = parseUnits(
        (tokenValue * 0.995).toFixed(6), // 0.5% slippage
        6
      );

      const txHash = await clients.wallet.writeContract({
        address: vaultAddress,
        abi: VAULT_V2_ABI,
        functionName: 'closeFullPosition',
        args: [userAddress, tokenAddress, minUsdcOut],
        chain: CHAINS[chainId],
        account: this.botAccount
      });

      // Wait for confirmation
      const receipt = await clients.public.waitForTransactionReceipt({
        hash: txHash
      });

      if (receipt.status !== 'success') {
        await positionService.markFailed(position.id, 'Transaction reverted');
        return { success: false, error: 'Transaction reverted' };
      }

      // Update position in database
      const exitPrice = currentPrice || position.entry_price;
      const exitAmount = position.token_amount * exitPrice * 0.99; // Account for fees

      await positionService.closePosition({
        positionId: position.id,
        exitPrice,
        exitAmount,
        txHash,
        closeReason
      });

      logger.info('Position closed successfully', {
        positionId: position.id,
        txHash,
        exitPrice,
        closeReason
      });

      return {
        success: true,
        txHash,
        amountOut: exitAmount.toFixed(2)
      };
    } catch (err: any) {
      logger.error('Position close failed', {
        positionId: position.id,
        error: err.message
      });
      await positionService.markFailed(position.id, err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Monitor open positions and update trailing stops
   */
  async monitorPositions(chainId: ChainId): Promise<void> {
    const positions = await positionService.getAllOpenPositions(chainId);

    if (positions.length === 0) return;

    logger.info(`Monitoring ${positions.length} open positions on chain ${chainId}`);

    for (const position of positions) {
      try {
        const tokenAddress = position.token_address as `0x${string}`;
        const currentPrice = await this.getTokenPrice(chainId, tokenAddress);

        if (!currentPrice) {
          logger.warn('Could not get price for position', {
            positionId: position.id,
            token: position.token_symbol
          });
          continue;
        }

        // Check if we should close (price hit trailing stop)
        if (positionService.shouldClose(position, currentPrice)) {
          logger.info('Trailing stop triggered!', {
            positionId: position.id,
            token: position.token_symbol,
            entryPrice: position.entry_price,
            currentPrice,
            trailingStop: position.trailing_stop_price,
            highestPrice: position.highest_price
          });

          await this.closePosition(chainId, position, 'trailing_stop');
          continue;
        }

        // Update trailing stop if price went higher
        if (currentPrice > position.highest_price) {
          const profitPercent = ((currentPrice - position.entry_price) / position.entry_price) * 100;

          logger.info('Price increased, updating trailing stop', {
            positionId: position.id,
            token: position.token_symbol,
            oldHigh: position.highest_price,
            newHigh: currentPrice,
            profitPercent: profitPercent.toFixed(2) + '%'
          });

          await positionService.updateTrailingStop(position.id, currentPrice);
        }
      } catch (err) {
        logger.error('Error monitoring position', {
          positionId: position.id,
          error: err
        });
      }
    }
  }

  /**
   * Get all users with auto-trade enabled on a chain
   */
  async getAutoTradeUsers(chainId: ChainId): Promise<`0x${string}`[]> {
    const addresses = await subscriptionService.getAutoTradeUsers();
    return addresses as `0x${string}`[];
  }
}

export const tradingService = new TradingService();
