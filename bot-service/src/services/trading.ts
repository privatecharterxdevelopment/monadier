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
    inputs: [{ name: 'user', type: 'address' }],
    name: 'lastTradeTime',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'tradeCooldown',
    outputs: [{ name: '', type: 'uint256' }],
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
  },
  // Fee withdrawal
  {
    inputs: [],
    name: 'accumulatedFees',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'withdrawFees',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  }
] as const;

// Uniswap V3 Quoter ABI for price quotes (Arbitrum)
const QUOTER_V3_ABI = [
  {
    inputs: [
      {
        components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'fee', type: 'uint24' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' }
        ],
        name: 'params',
        type: 'tuple'
      }
    ],
    name: 'quoteExactInputSingle',
    outputs: [
      { name: 'amountOut', type: 'uint256' },
      { name: 'sqrtPriceX96After', type: 'uint160' },
      { name: 'initializedTicksCrossed', type: 'uint32' },
      { name: 'gasEstimate', type: 'uint256' }
    ],
    stateMutability: 'nonpayable',
    type: 'function'
  }
] as const;

// Fee tiers to try for Uniswap V3 (0.05%, 0.3%, 1%)
const FEE_TIERS = [500, 3000, 10000] as const;

// Chain mapping
const CHAINS: Record<ChainId, Chain> = {
  8453: base,
  1: mainnet,
  137: polygon,
  42161: arbitrum,
  56: bsc
};

// Base chain addresses (Uniswap V2)
const BASE_CONFIG = {
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`,
  WETH: '0x4200000000000000000000000000000000000006' as `0x${string}`,
  ROUTER: '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24' as `0x${string}`
};

// Arbitrum chain addresses (Uniswap V3 - 0.05% pools)
const ARBITRUM_CONFIG = {
  USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as `0x${string}`,
  WETH: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1' as `0x${string}`,
  WBTC: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f' as `0x${string}`,
  ARB: '0x912CE59144191C1204E64559FE8253a0e49E6548' as `0x${string}`,
  SWAP_ROUTER: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45' as `0x${string}`, // Uniswap V3 SwapRouter02
  QUOTER_V2: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e' as `0x${string}`, // Uniswap V3 QuoterV2
  POOL_FEE: 500 // 0.05% fee tier
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
  riskReward?: number; // Risk/reward ratio
}

export interface TradeResult {
  success: boolean;
  txHash?: string;
  amountIn?: string;
  amountOut?: string;
  positionId?: string;
  error?: string;
  pendingApproval?: boolean;
  approvalId?: string;
  message?: string;
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

      // Use best vault address available
      // Prefer V5 > V4 > V3 > V2 > V1
      const vaultAddress = (chainConfig as any).vaultV5Address || (chainConfig as any).vaultV4Address || (chainConfig as any).vaultV3Address || (chainConfig as any).vaultV2Address || chainConfig.vaultAddress;
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

      const version = (chainConfig as any).vaultV5Address ? 'V5' : (chainConfig as any).vaultV4Address ? 'V4' : (chainConfig as any).vaultV3Address ? 'V3' : (chainConfig as any).vaultV2Address ? 'V2' : 'V1';
      logger.info(`Initialized ${version} client for ${chainConfig.name}`, { chainId, vaultAddress });
    }
  }

  /**
   * Get best vault address for a chain (prefers V5 > V4 > V3 > V2 > V1)
   */
  private getV2VaultAddress(chainId: ChainId): `0x${string}` | undefined {
    const chainConfig = config.chains[chainId] as any;
    // Prefer V5 (Uniswap V3, new fees) > V4 (100% risk) > V3 (secure) > V2 > V1
    return chainConfig?.vaultV5Address || chainConfig?.vaultV4Address || chainConfig?.vaultV3Address || chainConfig?.vaultV2Address || chainConfig?.vaultAddress;
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
      const [balance, autoTradeEnabled, riskLevel, canTradeNow, lastTradeTime] = await Promise.all([
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
        }),
        clients.public.readContract({
          address: vaultAddress,
          abi: VAULT_V2_ABI,
          functionName: 'lastTradeTime',
          args: [userAddress]
        }).catch(() => 0n) // Fallback if function doesn't exist
      ]);

      // Debug: Log on-chain rate limit info when canTradeNow is false
      if (!canTradeNow) {
        const lastTradeTimestamp = Number(lastTradeTime);
        const now = Math.floor(Date.now() / 1000);
        const secondsSinceLastTrade = now - lastTradeTimestamp;
        logger.info('On-chain rate limit active', {
          userAddress: userAddress.slice(0, 10),
          lastTradeTime: lastTradeTimestamp > 0 ? new Date(lastTradeTimestamp * 1000).toISOString() : 'unknown',
          secondsSinceLastTrade,
          canTradeNow
        });
      }

      // Also check database for auto_trade_enabled (in case on-chain is out of sync)
      const dbAutoTrade = await subscriptionService.getAutoTradeStatus(userAddress);

      // Trust database OR on-chain (either one being true means user wants auto-trade)
      const effectiveAutoTrade = autoTradeEnabled || dbAutoTrade;

      // AUTO-SYNC: If on-chain autoTrade is enabled but no vault_settings exists, create it!
      // This ensures users who enabled auto-trade on-chain are properly tracked
      if (autoTradeEnabled && !dbAutoTrade) {
        logger.info('Auto-syncing vault_settings from on-chain state', {
          userAddress: userAddress.slice(0, 10),
          chainId,
          onChainAutoTrade: autoTradeEnabled
        });
        await subscriptionService.syncVaultSettings(userAddress, chainId, {
          autoTradeEnabled: true,
          balance: formatUnits(balance, 6),
          riskLevel: Number(riskLevel)
        });
      }

      return {
        balance,
        balanceFormatted: formatUnits(balance, 6),
        autoTradeEnabled: effectiveAutoTrade,
        riskLevel: Number(riskLevel),
        canTradeNow
      };
    } catch (err) {
      logger.error('Failed to get vault status', { chainId, userAddress, error: err });
      return null;
    }
  }

  /**
   * Get current token price in USDC via Uniswap V3 Quoter (Arbitrum)
   */
  async getTokenPrice(chainId: ChainId, tokenAddress: `0x${string}`): Promise<number | null> {
    const clients = this.clients.get(chainId);
    if (!clients) return null;

    // Only Arbitrum is supported
    if (chainId !== 42161) {
      logger.warn('getTokenPrice only supports Arbitrum', { chainId });
      return null;
    }

    try {
      // Get price for 1 token via Uniswap V3 Quoter
      const oneToken = parseUnits('1', 18); // Assume 18 decimals

      // Try each fee tier until we get a quote
      for (const fee of FEE_TIERS) {
        try {
          const result = await clients.public.simulateContract({
            address: ARBITRUM_CONFIG.QUOTER_V2,
            abi: QUOTER_V3_ABI,
            functionName: 'quoteExactInputSingle',
            args: [{
              tokenIn: tokenAddress,
              tokenOut: ARBITRUM_CONFIG.USDC,
              amountIn: oneToken,
              fee,
              sqrtPriceLimitX96: 0n
            }]
          });

          const amountOut = result.result[0];
          if (amountOut > 0n) {
            return parseFloat(formatUnits(amountOut, 6));
          }
        } catch {
          // Try next fee tier
          continue;
        }
      }

      // Fallback: Try going through WETH if direct quote fails
      if (tokenAddress.toLowerCase() !== ARBITRUM_CONFIG.WETH.toLowerCase()) {
        for (const fee of FEE_TIERS) {
          try {
            // Token -> WETH
            const wethResult = await clients.public.simulateContract({
              address: ARBITRUM_CONFIG.QUOTER_V2,
              abi: QUOTER_V3_ABI,
              functionName: 'quoteExactInputSingle',
              args: [{
                tokenIn: tokenAddress,
                tokenOut: ARBITRUM_CONFIG.WETH,
                amountIn: oneToken,
                fee,
                sqrtPriceLimitX96: 0n
              }]
            });

            const wethAmount = wethResult.result[0];
            if (wethAmount > 0n) {
              // WETH -> USDC
              const usdcResult = await clients.public.simulateContract({
                address: ARBITRUM_CONFIG.QUOTER_V2,
                abi: QUOTER_V3_ABI,
                functionName: 'quoteExactInputSingle',
                args: [{
                  tokenIn: ARBITRUM_CONFIG.WETH,
                  tokenOut: ARBITRUM_CONFIG.USDC,
                  amountIn: wethAmount,
                  fee: 500, // WETH/USDC usually uses 0.05%
                  sqrtPriceLimitX96: 0n
                }]
              });

              const usdcAmount = usdcResult.result[0];
              if (usdcAmount > 0n) {
                return parseFloat(formatUnits(usdcAmount, 6));
              }
            }
          } catch {
            continue;
          }
        }
      }

      logger.warn('Could not get token price from any fee tier', { tokenAddress });
      return null;
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

    // 4. SAFETY: Check for orphaned tokens and AUTO-CLEANUP
    // This catches edge cases where contract has tokens but database doesn't know
    const onChainTokenBalance = await this.getOnChainTokenBalance(chainId, userAddress, signal.tokenAddress as `0x${string}`);
    if (onChainTokenBalance && onChainTokenBalance > 0n) {
      logger.warn('Orphaned tokens detected - AUTO-CLEANUP starting', {
        userAddress,
        token: signal.tokenSymbol,
        onChainBalance: formatUnits(onChainTokenBalance, 18)
      });

      // AUTO-CLEANUP: Sell orphaned tokens back to USDC
      try {
        const cleanupResult = await this.cleanupOrphanedTokens(chainId, userAddress, signal.tokenAddress as `0x${string}`, onChainTokenBalance);
        if (cleanupResult.success) {
          logger.info('Orphaned tokens cleaned up successfully', {
            userAddress,
            token: signal.tokenSymbol,
            usdcRecovered: cleanupResult.usdcRecovered
          });
          // Continue with new position after cleanup
        } else {
          logger.error('Failed to cleanup orphaned tokens', {
            userAddress,
            token: signal.tokenSymbol,
            error: cleanupResult.error
          });
          return { success: false, error: 'Failed to cleanup orphaned tokens: ' + cleanupResult.error };
        }
      } catch (cleanupErr: any) {
        logger.error('Orphaned token cleanup crashed', { error: cleanupErr.message });
        return { success: false, error: 'Orphaned token cleanup failed' };
      }
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

    // 5a. Check if user has ask_permission enabled
    const userSettings = await subscriptionService.getUserTradingSettings(userAddress, chainId);
    if (userSettings.askPermission) {
      // Create pending approval instead of executing trade
      const tradeAmountUsdc = parseFloat(formatUnits(tradeAmount, 6));
      const currentPrice = await this.getTokenPrice(chainId, signal.tokenAddress as `0x${string}`);

      const approvalId = await subscriptionService.createPendingApproval({
        walletAddress: userAddress,
        chainId,
        tokenAddress: signal.tokenAddress,
        tokenSymbol: signal.tokenSymbol,
        direction: signal.direction,
        amountUsdc: tradeAmountUsdc,
        entryPrice: currentPrice || 0,
        confidence: signal.confidence,
        riskReward: signal.riskReward || 1.5,
        analysisSummary: `${signal.tokenSymbol} ${signal.direction} - ${signal.confidence}% confidence`
      });

      if (approvalId) {
        logger.info('Trade requires approval - pending', {
          approvalId,
          userAddress: userAddress.slice(0, 10),
          token: signal.tokenSymbol,
          amount: tradeAmountUsdc
        });
        return {
          success: true,
          pendingApproval: true,
          approvalId,
          message: 'Trade pending user approval'
        };
      }
      return { success: false, error: 'Failed to create approval request' };
    }

    // 6. Execute openPosition on V2 vault
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
   * Execute a pre-approved trade (bypasses ask_permission check)
   */
  async executeApprovedTrade(
    chainId: ChainId,
    userAddress: `0x${string}`,
    signal: TradeSignal
  ): Promise<TradeResult> {
    const clients = this.clients.get(chainId);
    const vaultAddress = this.getV2VaultAddress(chainId);

    if (!clients || !vaultAddress) {
      return { success: false, error: 'Chain not configured' };
    }

    // 1. Check subscription permission (still required)
    const permission = await subscriptionService.canTrade(userAddress);
    if (!permission.allowed) {
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

    // 3. Check for existing positions
    const hasExisting = await positionService.hasAnyActivePosition(
      userAddress,
      chainId,
      signal.tokenAddress
    );
    if (hasExisting) {
      return { success: false, error: 'Existing position for this token' };
    }

    // 4. Safety: Verify on-chain balance is 0
    const onChainTokenBalance = await this.getOnChainTokenBalance(chainId, userAddress, signal.tokenAddress as `0x${string}`);
    if (onChainTokenBalance && onChainTokenBalance > 0n) {
      return { success: false, error: 'On-chain tokens exist - cannot open new position' };
    }

    // 5. Calculate trade amount
    const riskBps = vaultStatus.riskLevel || 500;
    const maxTradeSize = (vaultStatus.balance * BigInt(riskBps)) / 10000n;
    const tradeAmount = signal.suggestedAmount > maxTradeSize ? maxTradeSize : signal.suggestedAmount;

    if (tradeAmount === 0n) {
      return { success: false, error: 'Trade amount too small' };
    }

    // 6. Execute trade (NO ask_permission check - already approved)
    try {
      logger.info('Executing approved trade', {
        chainId,
        userAddress: userAddress.slice(0, 10),
        token: signal.tokenSymbol,
        amountIn: formatUnits(tradeAmount, 6)
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
      const receipt = await clients.public.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== 'success') {
        return { success: false, error: 'Transaction reverted' };
      }

      // 7. Get current price and record position
      const currentPrice = await this.getTokenPrice(chainId, signal.tokenAddress as `0x${string}`);
      const entryPrice = currentPrice || 0;
      const entryAmount = parseFloat(formatUnits(tradeAmount, 6));
      const estimatedTokens = entryPrice > 0 ? entryAmount / entryPrice : 0;

      // Get user TP/SL settings
      const userSettings = await subscriptionService.getUserTradingSettings(userAddress, chainId);

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
        trailingStopPercent: userSettings.stopLossPercent,
        takeProfitPercent: userSettings.takeProfitPercent,
        profitLockPercent: signal.profitLockPercent
      });

      // 8. Record trade
      await subscriptionService.recordTrade(userAddress);

      logger.info('Approved trade executed successfully', {
        txHash,
        positionId: position?.id,
        entryPrice
      });

      return {
        success: true,
        txHash,
        positionId: position?.id,
        amountIn: formatUnits(tradeAmount, 6)
      };
    } catch (err: any) {
      logger.error('Approved trade execution failed', { error: err.message });
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
    closeReason: 'trailing_stop' | 'take_profit' | 'manual' | 'stop_loss' | 'emergency_close' | 'signal_reversal'
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

        // === FIXED STOP-LOSS CHECK (1.5%) - USE BINANCE PRICE ===
        const direction = position.direction || 'LONG';

        // Get Binance price for accurate stop-loss (matches UI!)
        let binancePrice = currentPrice;
        try {
          const symbol = position.token_symbol === 'WETH' ? 'ETHUSDT' : position.token_symbol + 'USDT';
          const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
          const data = await res.json();
          if (data.price) binancePrice = parseFloat(data.price);
        } catch (e) {
          // Fallback to on-chain price
        }

        const lossPercent = direction === 'LONG'
          ? ((position.entry_price - binancePrice) / position.entry_price) * 100
          : ((binancePrice - position.entry_price) / position.entry_price) * 100;

        const MAX_LOSS_PERCENT = 1.5; // Fixed stop-loss at 1.5%

        // Log position check with Binance price
        logger.info('Position check', {
          positionId: position.id.slice(0, 8),
          direction,
          entryPrice: position.entry_price,
          binancePrice,
          lossPercent: lossPercent.toFixed(2) + '%',
          stopAt: MAX_LOSS_PERCENT + '%',
          willStop: lossPercent >= MAX_LOSS_PERCENT
        });

        if (lossPercent >= MAX_LOSS_PERCENT) {
          logger.warn('🛑 STOP-LOSS HIT - Cutting losses at 1.5%!', {
            positionId: position.id,
            token: position.token_symbol,
            direction,
            lossPercent: lossPercent.toFixed(2) + '%',
            entryPrice: position.entry_price,
            currentPrice,
            maxLoss: MAX_LOSS_PERCENT + '%'
          });

          await this.closePosition(chainId, position, 'stop_loss');
          continue;
        }

        // === SIGNAL REVERSAL CHECK ===
        // If signal flips opposite to our position AND we're in loss, cut losses early!
        const isInLoss = lossPercent > 0;

        if (isInLoss) {
          // Get current market signal
          const { analyzeMarket } = await import('./market');
          const analysis = await analyzeMarket(chainId, position.token_address as `0x${string}`, 'risky');

          if (analysis && analysis.direction !== direction && analysis.confidence >= 60) {
            logger.warn('🔄 SIGNAL REVERSAL - Cutting losses!', {
              positionId: position.id,
              token: position.token_symbol,
              positionDirection: direction,
              newSignal: analysis.direction,
              signalConfidence: analysis.confidence,
              lossPercent: lossPercent.toFixed(2) + '%',
              entryPrice: position.entry_price,
              currentPrice
            });

            await this.closePosition(chainId, position, 'signal_reversal');
            continue;
          }
        }

        // Update trailing stop based on direction (direction already defined above)
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
    const addresses = await subscriptionService.getAutoTradeUsers(chainId);
    return addresses as `0x${string}`[];
  }

  /**
   * Check and withdraw accumulated fees from vault
   * Fees are automatically sent to treasury address
   */
  async withdrawAccumulatedFees(chainId: ChainId): Promise<{ success: boolean; amount?: string; error?: string }> {
    const clients = this.clients.get(chainId);
    const vaultAddress = this.getV2VaultAddress(chainId);

    if (!clients || !vaultAddress) {
      return { success: false, error: 'Chain not configured' };
    }

    try {
      // Check accumulated fees
      const fees = await clients.public.readContract({
        address: vaultAddress,
        abi: VAULT_V2_ABI,
        functionName: 'accumulatedFees'
      });

      if (fees === 0n) {
        return { success: true, amount: '0' };
      }

      const feeAmount = formatUnits(fees, 6);
      logger.info('Withdrawing accumulated fees', { chainId, amount: feeAmount });

      // Withdraw fees to treasury
      const txHash = await clients.wallet.writeContract({
        address: vaultAddress,
        abi: VAULT_V2_ABI,
        functionName: 'withdrawFees',
        args: [],
        chain: CHAINS[chainId],
        account: this.botAccount
      });

      // Wait for confirmation
      const receipt = await clients.public.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== 'success') {
        return { success: false, error: 'Transaction reverted' };
      }

      logger.info('Fees withdrawn successfully', { chainId, amount: feeAmount, txHash });
      return { success: true, amount: feeAmount };
    } catch (err: any) {
      logger.error('Failed to withdraw fees', { chainId, error: err.message });
      return { success: false, error: err.message };
    }
  }

  /**
   * Get current accumulated fees
   */
  async getAccumulatedFees(chainId: ChainId): Promise<string> {
    const clients = this.clients.get(chainId);
    const vaultAddress = this.getV2VaultAddress(chainId);

    if (!clients || !vaultAddress) return '0';

    try {
      const fees = await clients.public.readContract({
        address: vaultAddress,
        abi: VAULT_V2_ABI,
        functionName: 'accumulatedFees'
      });
      return formatUnits(fees, 6);
    } catch {
      return '0';
    }
  }

  /**
   * AUTO-CLEANUP orphaned tokens - sell them back to USDC
   * This prevents the "on-chain tokens exist without database record" error
   */
  async cleanupOrphanedTokens(
    chainId: ChainId,
    userAddress: `0x${string}`,
    tokenAddress: `0x${string}`,
    tokenAmount: bigint
  ): Promise<{ success: boolean; usdcRecovered?: string; error?: string }> {
    const clients = this.clients.get(chainId);
    const vaultAddress = this.getV2VaultAddress(chainId);

    if (!clients || !vaultAddress) {
      return { success: false, error: 'Chain not configured' };
    }

    try {
      logger.info('Cleaning up orphaned tokens', {
        userAddress: userAddress.slice(0, 10),
        tokenAddress: tokenAddress.slice(0, 10),
        amount: formatUnits(tokenAmount, 18)
      });

      // Sell orphaned tokens back to USDC with 0 minAmountOut (accept any price for cleanup)
      const txHash = await clients.wallet.writeContract({
        address: vaultAddress,
        abi: VAULT_V2_ABI,
        functionName: 'closePosition',
        args: [userAddress, tokenAddress, tokenAmount, 0n],
        chain: CHAINS[chainId],
        account: this.botAccount
      });

      logger.info('Orphaned token cleanup TX sent', { txHash });

      const receipt = await clients.public.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== 'success') {
        return { success: false, error: 'Cleanup transaction reverted' };
      }

      // Estimate USDC recovered (rough estimate)
      const usdcRecovered = 'unknown';

      logger.info('Orphaned tokens cleaned up', {
        userAddress: userAddress.slice(0, 10),
        txHash
      });

      return { success: true, usdcRecovered };
    } catch (err: any) {
      logger.error('Failed to cleanup orphaned tokens', {
        userAddress,
        tokenAddress,
        error: err.message
      });
      return { success: false, error: err.message };
    }
  }
}

export const tradingService = new TradingService();
