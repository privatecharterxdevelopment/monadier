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
  takeProfitPercent: number; // Dynamic TP based on market
  trailingStopPercent: number; // Dynamic SL based on market
  profitLockPercent?: number; // Min profit % before stop activates (0.2% for aggressive)
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
      // Prefer V3 > V2 > V1
      const vaultAddress = (chainConfig as any).vaultV3Address || (chainConfig as any).vaultV2Address || chainConfig.vaultAddress;
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

      const version = (chainConfig as any).vaultV3Address ? 'V3' : (chainConfig as any).vaultV2Address ? 'V2' : 'V1';
      logger.info(`Initialized ${version} client for ${chainConfig.name}`, { chainId, vaultAddress });
    }
  }

  /**
   * Get best vault address for a chain (prefers V3 > V2 > V1)
   */
  private getV2VaultAddress(chainId: ChainId): `0x${string}` | undefined {
    const chainConfig = config.chains[chainId] as any;
    // Prefer V3 (secure with user emergency close) > V2 > V1
    return chainConfig?.vaultV3Address || chainConfig?.vaultV2Address || chainConfig?.vaultAddress;
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

      // If token is WETH, use direct path to USDC
      // Otherwise use Token -> WETH -> USDC
      const isWeth = tokenAddress.toLowerCase() === BASE_CONFIG.WETH.toLowerCase();
      const path = isWeth
        ? [tokenAddress, BASE_CONFIG.USDC]
        : [tokenAddress, BASE_CONFIG.WETH, BASE_CONFIG.USDC];

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

    // 3. CRITICAL: Check for existing positions (prevents overlap bug)
    const hasExisting = await positionService.hasAnyActivePosition(
      userAddress,
      chainId,
      signal.tokenAddress
    );
    if (hasExisting) {
      return { success: false, error: 'Existing position for this token - wait for it to close' };
    }

    // 4. SAFETY: Verify on-chain balance is 0 before opening
    // This catches edge cases where contract has tokens but database doesn't know
    const onChainTokenBalance = await this.getOnChainTokenBalance(chainId, userAddress, signal.tokenAddress as `0x${string}`);
    if (onChainTokenBalance && onChainTokenBalance > 0n) {
      logger.error('On-chain tokens exist but no database position - sync needed', {
        userAddress,
        token: signal.tokenSymbol,
        onChainBalance: formatUnits(onChainTokenBalance, 18)
      });
      return { success: false, error: 'On-chain tokens exist without database record - cannot open new position' };
    }

    // 5. Calculate trade amount based on risk level
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

      // 7a. Get user's custom TP/SL settings (overrides dynamic analysis)
      const userSettings = await subscriptionService.getUserTradingSettings(userAddress, chainId);
      const finalTakeProfit = userSettings.takeProfitPercent;
      const finalStopLoss = userSettings.stopLossPercent;

      logger.info('Using user TP/SL settings', {
        userAddress: userAddress.slice(0, 10),
        userTP: finalTakeProfit + '%',
        userSL: finalStopLoss + '%',
        signalTP: signal.takeProfitPercent + '%',
        signalSL: signal.trailingStopPercent + '%'
      });

      const position = await positionService.openPosition({
        walletAddress: userAddress,
        chainId,
        tokenAddress: signal.tokenAddress,
        tokenSymbol: signal.tokenSymbol,
        direction: signal.direction,
        entryPrice,
        entryAmount,
        tokenAmount: estimatedTokens,
        txHash,
        trailingStopPercent: finalStopLoss, // Use user's stop loss
        takeProfitPercent: finalTakeProfit, // Use user's take profit
        profitLockPercent: signal.profitLockPercent // 0.2% for aggressive, 0.5% default
      });

      logger.info('Position opened with user TP/SL', {
        takeProfitPercent: finalTakeProfit + '%',
        trailingStopPercent: finalStopLoss + '%',
        profitLock: (signal.profitLockPercent || 0.5) + '%'
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
   * Get user's on-chain token balance in the vault
   */
  async getOnChainTokenBalance(
    chainId: ChainId,
    userAddress: `0x${string}`,
    tokenAddress: `0x${string}`
  ): Promise<bigint | null> {
    const clients = this.clients.get(chainId);
    const vaultAddress = this.getV2VaultAddress(chainId);

    if (!clients || !vaultAddress) {
      return null;
    }

    try {
      const balance = await clients.public.readContract({
        address: vaultAddress,
        abi: VAULT_V2_ABI,
        functionName: 'tokenBalances',
        args: [userAddress, tokenAddress]
      });
      return balance;
    } catch (err) {
      logger.error('Failed to get on-chain token balance', { userAddress, tokenAddress, error: err });
      return null;
    }
  }

  /**
   * Close a position (sell tokens back to USDC)
   */
  async closePosition(
    chainId: ChainId,
    position: Position,
    closeReason: 'trailing_stop' | 'take_profit' | 'manual' | 'stop_loss' | 'emergency_close'
  ): Promise<TradeResult> {
    const clients = this.clients.get(chainId);
    const vaultAddress = this.getV2VaultAddress(chainId);

    if (!clients || !vaultAddress) {
      return { success: false, error: 'Chain not configured' };
    }

    try {
      const userAddress = position.wallet_address as `0x${string}`;
      const tokenAddress = position.token_address as `0x${string}`;

      // Verify on-chain token balance BEFORE attempting to close
      const onChainBalance = await this.getOnChainTokenBalance(chainId, userAddress, tokenAddress);

      if (onChainBalance === null || onChainBalance === 0n) {
        // State mismatch: Supabase says open, but on-chain has no tokens
        logger.error('State mismatch: No on-chain token balance', {
          positionId: position.id,
          userAddress,
          token: position.token_symbol,
          supabaseStatus: position.status,
          onChainBalance: onChainBalance?.toString() || 'null'
        });

        // SYNC FIX: Mark ALL positions for this token as failed (not just this one)
        // This prevents orphaned positions when the contract closes everything at once
        await positionService.syncPositionsWithChain(userAddress, chainId, tokenAddress);

        return { success: false, error: 'State mismatch: On-chain balance is 0. All positions for this token have been synced.' };
      }

      logger.info('Closing position', {
        positionId: position.id,
        userAddress,
        token: position.token_symbol,
        closeReason,
        onChainBalance: formatUnits(onChainBalance, 18)
      });

      // Try to close with increasing slippage tolerance if needed
      const currentPrice = await this.getTokenPrice(chainId, tokenAddress);
      const tokenValue = position.token_amount * (currentPrice || position.entry_price);

      // Slippage levels to try: 5%, 10%, 15%, 20% (crypto is volatile!)
      const slippageLevels = [0.95, 0.90, 0.85, 0.80];
      let txHash: `0x${string}` | null = null;
      let lastError: string = '';

      for (const slippageMultiplier of slippageLevels) {
        const minUsdcOut = parseUnits(
          (tokenValue * slippageMultiplier).toFixed(6),
          6
        );

        const slippagePercent = ((1 - slippageMultiplier) * 100).toFixed(0);
        logger.info(`Attempting close with ${slippagePercent}% slippage`, {
          positionId: position.id,
          minUsdcOut: formatUnits(minUsdcOut, 6)
        });

        try {
          txHash = await clients.wallet.writeContract({
            address: vaultAddress,
            abi: VAULT_V2_ABI,
            functionName: 'closeFullPosition',
            args: [userAddress, tokenAddress, minUsdcOut],
            chain: CHAINS[chainId],
            account: this.botAccount
          });

          // If we get here, the transaction was submitted successfully
          break;
        } catch (attemptErr: any) {
          lastError = attemptErr.message || 'Unknown error';
          const isSlippageError = lastError.includes('INSUFFICIENT_OUTPUT_AMOUNT') ||
                                   lastError.includes('slippage') ||
                                   lastError.includes('output amount');

          if (isSlippageError && slippageMultiplier !== slippageLevels[slippageLevels.length - 1]) {
            logger.warn(`Slippage error with ${slippagePercent}%, trying higher slippage`, {
              positionId: position.id,
              error: lastError
            });
            continue; // Try next slippage level
          }

          // Not a slippage error or we've exhausted all levels
          throw attemptErr;
        }
      }

      if (!txHash) {
        await positionService.markFailed(position.id, `All slippage levels failed: ${lastError}`);
        return { success: false, error: `Failed to close: ${lastError}` };
      }

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
      // Calculate exit amount based on token amount and current price
      // Uniswap fees are already deducted from the actual swap, no need to multiply by 0.99
      const exitAmount = position.token_amount * exitPrice;

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
        // Check for emergency close first
        if (position.status === 'closing') {
          logger.info('🚨 Emergency close requested!', {
            positionId: position.id,
            token: position.token_symbol,
            direction: position.direction || 'LONG'
          });
          await this.closePosition(chainId, position, 'emergency_close');
          continue;
        }

        const tokenAddress = position.token_address as `0x${string}`;
        const currentPrice = await this.getTokenPrice(chainId, tokenAddress);

        if (!currentPrice) {
          logger.warn('Could not get price for position', {
            positionId: position.id,
            token: position.token_symbol
          });
          continue;
        }

        // Check if we should close (TP hit or trailing stop triggered)
        const closeCheck = positionService.shouldClose(position, currentPrice);
        if (closeCheck.close && closeCheck.reason) {
          logger.info(`${closeCheck.reason === 'take_profit' ? '🎯 Take Profit' : '📉 Trailing Stop'} triggered!`, {
            positionId: position.id,
            token: position.token_symbol,
            direction: position.direction || 'LONG',
            entryPrice: position.entry_price,
            currentPrice,
            trailingStop: position.trailing_stop_price,
            takeProfit: position.take_profit_price
          });

          await this.closePosition(chainId, position, closeCheck.reason);
          continue;
        }

        // Update trailing stop based on direction
        const direction = position.direction || 'LONG';
        const shouldUpdateStop = direction === 'LONG'
          ? currentPrice > position.highest_price
          : currentPrice < (position.lowest_price || position.entry_price);

        if (shouldUpdateStop) {
          const profitPercent = direction === 'LONG'
            ? ((currentPrice - position.entry_price) / position.entry_price) * 100
            : ((position.entry_price - currentPrice) / position.entry_price) * 100;

          logger.info(`${direction} position price moved favorably`, {
            positionId: position.id,
            token: position.token_symbol,
            direction,
            currentPrice,
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
