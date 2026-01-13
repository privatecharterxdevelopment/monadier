import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrum } from 'viem/chains';
import { config } from '../config';
import { logger } from '../utils/logger';
import { subscriptionService } from './subscription';
import { positionService, Position } from './positions';

/**
 * V6 Trading Service
 *
 * Uses MonadierTradingVaultV6 with:
 * - Isolated Margin (per-position collateral)
 * - 20x Max Leverage via Aave V3
 * - Chainlink Oracles for accurate pricing
 * - On-chain Stop-Loss & Take-Profit
 * - Long and Short positions
 */

// V6 Vault ABI
const VAULT_V6_ABI = [
  // ============ READ FUNCTIONS ============
  {
    inputs: [{ name: 'user', type: 'address' }],
    name: 'balances',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'user', type: 'address' }],
    name: 'autoTradeEnabled',
    outputs: [{ name: '', type: 'bool' }],
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
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'token', type: 'address' }
    ],
    name: 'getPosition',
    outputs: [{
      components: [
        { name: 'isLong', type: 'bool' },
        { name: 'isActive', type: 'bool' },
        { name: 'tokenAmount', type: 'uint256' },
        { name: 'entryPrice', type: 'uint256' },
        { name: 'collateral', type: 'uint256' },
        { name: 'borrowedAmount', type: 'uint256' },
        { name: 'leverage', type: 'uint256' },
        { name: 'stopLossPrice', type: 'uint256' },
        { name: 'takeProfitPrice', type: 'uint256' },
        { name: 'openedAt', type: 'uint256' },
        { name: 'liquidationPrice', type: 'uint256' }
      ],
      name: '',
      type: 'tuple'
    }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'token', type: 'address' }],
    name: 'getOraclePrice',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'token', type: 'address' }
    ],
    name: 'checkPositionStatus',
    outputs: [
      { name: 'shouldClose', type: 'bool' },
      { name: 'reason', type: 'string' }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'accumulatedFees',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  // ============ WRITE FUNCTIONS ============
  {
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'collateralAmount', type: 'uint256' },
      { name: 'leverage', type: 'uint256' },
      { name: 'stopLossPercent', type: 'uint256' },
      { name: 'takeProfitPercent', type: 'uint256' },
      { name: 'minTokenOut', type: 'uint256' }
    ],
    name: 'openLong',
    outputs: [{ name: 'tokenAmount', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'minUsdcOut', type: 'uint256' }
    ],
    name: 'closeLong',
    outputs: [{ name: 'usdcOut', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'collateralAmount', type: 'uint256' },
      { name: 'leverage', type: 'uint256' },
      { name: 'stopLossPercent', type: 'uint256' },
      { name: 'takeProfitPercent', type: 'uint256' },
      { name: 'minUsdcOut', type: 'uint256' }
    ],
    name: 'openShort',
    outputs: [{ name: 'usdcReceived', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'maxUsdcIn', type: 'uint256' }
    ],
    name: 'closeShort',
    outputs: [{ name: 'usdcSpent', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'token', type: 'address' }
    ],
    name: 'executeStopLoss',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'token', type: 'address' }
    ],
    name: 'executeTakeProfit',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'token', type: 'address' }
    ],
    name: 'liquidatePosition',
    outputs: [],
    stateMutability: 'nonpayable',
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

// V6 Vault address on Arbitrum
const V6_VAULT_ADDRESS = '0xceD685CDbcF9056CdbD0F37fFE9Cd8152851D13A' as `0x${string}`;

// Token addresses on Arbitrum
const ARBITRUM_TOKENS = {
  USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as `0x${string}`,
  WETH: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1' as `0x${string}`,
  WBTC: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f' as `0x${string}`,
  ARB: '0x912CE59144191C1204E64559FE8253a0e49E6548' as `0x${string}`,
};

export interface V6TradeSignal {
  direction: 'LONG' | 'SHORT';
  confidence: number;
  tokenAddress: `0x${string}`;
  tokenSymbol: string;
  collateralAmount: bigint;
  leverage: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  reason: string;
}

export interface V6TradeResult {
  success: boolean;
  txHash?: string;
  positionId?: string;
  error?: string;
  collateral?: string;
  leverage?: number;
}

export class TradingV6Service {
  private botAccount = privateKeyToAccount(config.botPrivateKey);
  private publicClient;
  private walletClient;

  constructor() {
    const rpcUrl = config.chains[42161].rpcUrl;

    this.publicClient = createPublicClient({
      chain: arbitrum,
      transport: http(rpcUrl)
    });

    this.walletClient = createWalletClient({
      account: this.botAccount,
      chain: arbitrum,
      transport: http(rpcUrl)
    });

    logger.info('TradingV6Service initialized', {
      vault: V6_VAULT_ADDRESS,
      bot: this.botAccount.address
    });
  }

  /**
   * Get user's V6 vault status
   */
  async getUserVaultStatus(userAddress: `0x${string}`) {
    try {
      const [balance, autoTradeEnabled, riskLevel] = await Promise.all([
        this.publicClient.readContract({
          address: V6_VAULT_ADDRESS,
          abi: VAULT_V6_ABI,
          functionName: 'balances',
          args: [userAddress]
        }),
        this.publicClient.readContract({
          address: V6_VAULT_ADDRESS,
          abi: VAULT_V6_ABI,
          functionName: 'autoTradeEnabled',
          args: [userAddress]
        }),
        this.publicClient.readContract({
          address: V6_VAULT_ADDRESS,
          abi: VAULT_V6_ABI,
          functionName: 'userRiskLevel',
          args: [userAddress]
        })
      ]);

      // Sync with database
      const dbAutoTrade = await subscriptionService.getAutoTradeStatus(userAddress);
      const effectiveAutoTrade = autoTradeEnabled || dbAutoTrade;

      return {
        balance,
        balanceFormatted: formatUnits(balance, 6),
        autoTradeEnabled: effectiveAutoTrade,
        riskLevel: Number(riskLevel),
        canTradeNow: true // V6 has per-token cooldown, handled separately
      };
    } catch (err) {
      logger.error('Failed to get V6 vault status', { userAddress, error: err });
      return null;
    }
  }

  /**
   * Get token price from Chainlink oracle
   */
  async getTokenPrice(tokenAddress: `0x${string}`): Promise<number | null> {
    try {
      const price = await this.publicClient.readContract({
        address: V6_VAULT_ADDRESS,
        abi: VAULT_V6_ABI,
        functionName: 'getOraclePrice',
        args: [tokenAddress]
      });
      return parseFloat(formatUnits(price, 8));
    } catch (err) {
      logger.error('Failed to get oracle price', { tokenAddress, error: err });
      return null;
    }
  }

  /**
   * Check if user has an active position for a token
   */
  async hasOpenPosition(userAddress: `0x${string}`, tokenAddress: `0x${string}`): Promise<boolean> {
    try {
      const position = await this.publicClient.readContract({
        address: V6_VAULT_ADDRESS,
        abi: VAULT_V6_ABI,
        functionName: 'getPosition',
        args: [userAddress, tokenAddress]
      });
      return position.isActive;
    } catch {
      return false;
    }
  }

  /**
   * Get on-chain position details
   */
  async getOnChainPosition(userAddress: `0x${string}`, tokenAddress: `0x${string}`) {
    try {
      const position = await this.publicClient.readContract({
        address: V6_VAULT_ADDRESS,
        abi: VAULT_V6_ABI,
        functionName: 'getPosition',
        args: [userAddress, tokenAddress]
      });
      return position;
    } catch {
      return null;
    }
  }

  /**
   * Open a LONG position
   */
  async openLong(
    userAddress: `0x${string}`,
    signal: V6TradeSignal
  ): Promise<V6TradeResult> {
    try {
      // Check subscription
      const permission = await subscriptionService.canTrade(userAddress);
      if (!permission.allowed) {
        return { success: false, error: permission.reason };
      }

      // Check vault status
      const vaultStatus = await this.getUserVaultStatus(userAddress);
      if (!vaultStatus || !vaultStatus.autoTradeEnabled) {
        return { success: false, error: 'Auto-trade not enabled' };
      }

      if (vaultStatus.balance === 0n) {
        return { success: false, error: 'No balance in vault' };
      }

      // Check for existing position
      const hasPosition = await this.hasOpenPosition(userAddress, signal.tokenAddress);
      if (hasPosition) {
        return { success: false, error: 'Already have position for this token' };
      }

      // Get current price from oracle (for logging only)
      const currentPrice = await this.getTokenPrice(signal.tokenAddress);
      if (!currentPrice) {
        return { success: false, error: 'Failed to get oracle price' };
      }

      // Convert percent to basis points (5% = 500 bps)
      // Contract calculates prices internally from these percentages
      const stopLossBps = BigInt(Math.round(signal.stopLossPercent * 100));
      const takeProfitBps = BigInt(Math.round(signal.takeProfitPercent * 100));

      logger.info('Opening LONG position', {
        user: userAddress.slice(0, 10),
        token: signal.tokenSymbol,
        collateral: formatUnits(signal.collateralAmount, 6),
        leverage: signal.leverage + 'x',
        currentPrice,
        stopLossBps: stopLossBps.toString(),
        takeProfitBps: takeProfitBps.toString()
      });

      // Execute openLong - contract expects percent in basis points
      const txHash = await this.walletClient.writeContract({
        address: V6_VAULT_ADDRESS,
        abi: VAULT_V6_ABI,
        functionName: 'openLong',
        args: [
          userAddress,
          signal.tokenAddress,
          signal.collateralAmount,
          BigInt(signal.leverage),
          stopLossBps,
          takeProfitBps,
          0n // minTokenOut - accept any for now
        ],
        chain: arbitrum,
        account: this.botAccount
      });

      // Wait for confirmation
      const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== 'success') {
        return { success: false, error: 'Transaction reverted' };
      }

      // Record in database
      const entryAmount = parseFloat(formatUnits(signal.collateralAmount, 6));
      const position = await positionService.openPosition({
        walletAddress: userAddress,
        chainId: 42161,
        tokenAddress: signal.tokenAddress,
        tokenSymbol: signal.tokenSymbol,
        direction: 'LONG',
        entryPrice: currentPrice,
        entryAmount,
        tokenAmount: entryAmount / currentPrice, // Estimated
        txHash,
        trailingStopPercent: signal.stopLossPercent,
        takeProfitPercent: signal.takeProfitPercent,
        isLeveraged: signal.leverage > 1,
        leverageMultiplier: signal.leverage,
        collateralAmount: entryAmount,
        borrowedAmount: entryAmount * (signal.leverage - 1)
      });

      // Record trade
      await subscriptionService.recordTrade(userAddress);

      logger.info('LONG position opened successfully', {
        txHash,
        positionId: position?.id,
        user: userAddress.slice(0, 10),
        token: signal.tokenSymbol,
        leverage: signal.leverage + 'x'
      });

      return {
        success: true,
        txHash,
        positionId: position?.id,
        collateral: formatUnits(signal.collateralAmount, 6),
        leverage: signal.leverage
      };
    } catch (err: any) {
      logger.error('Failed to open LONG', { error: err.message });
      return { success: false, error: err.message };
    }
  }

  /**
   * Open a SHORT position
   */
  async openShort(
    userAddress: `0x${string}`,
    signal: V6TradeSignal
  ): Promise<V6TradeResult> {
    try {
      // Check subscription
      const permission = await subscriptionService.canTrade(userAddress);
      if (!permission.allowed) {
        return { success: false, error: permission.reason };
      }

      // Check vault status
      const vaultStatus = await this.getUserVaultStatus(userAddress);
      if (!vaultStatus || !vaultStatus.autoTradeEnabled) {
        return { success: false, error: 'Auto-trade not enabled' };
      }

      if (vaultStatus.balance === 0n) {
        return { success: false, error: 'No balance in vault' };
      }

      // Check for existing position
      const hasPosition = await this.hasOpenPosition(userAddress, signal.tokenAddress);
      if (hasPosition) {
        return { success: false, error: 'Already have position for this token' };
      }

      // Get current price from oracle (for logging only)
      const currentPrice = await this.getTokenPrice(signal.tokenAddress);
      if (!currentPrice) {
        return { success: false, error: 'Failed to get oracle price' };
      }

      // Convert percent to basis points (5% = 500 bps)
      // Contract calculates prices internally from these percentages
      const stopLossBps = BigInt(Math.round(signal.stopLossPercent * 100));
      const takeProfitBps = BigInt(Math.round(signal.takeProfitPercent * 100));

      logger.info('Opening SHORT position', {
        user: userAddress.slice(0, 10),
        token: signal.tokenSymbol,
        collateral: formatUnits(signal.collateralAmount, 6),
        leverage: signal.leverage + 'x',
        currentPrice,
        stopLossBps: stopLossBps.toString(),
        takeProfitBps: takeProfitBps.toString()
      });

      // Execute openShort - contract expects percent in basis points
      const txHash = await this.walletClient.writeContract({
        address: V6_VAULT_ADDRESS,
        abi: VAULT_V6_ABI,
        functionName: 'openShort',
        args: [
          userAddress,
          signal.tokenAddress,
          signal.collateralAmount,
          BigInt(signal.leverage),
          stopLossBps,
          takeProfitBps,
          0n // minUsdcOut - accept any for now
        ],
        chain: arbitrum,
        account: this.botAccount
      });

      // Wait for confirmation
      const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== 'success') {
        return { success: false, error: 'Transaction reverted' };
      }

      // Record in database
      const entryAmount = parseFloat(formatUnits(signal.collateralAmount, 6));
      const position = await positionService.openPosition({
        walletAddress: userAddress,
        chainId: 42161,
        tokenAddress: signal.tokenAddress,
        tokenSymbol: signal.tokenSymbol,
        direction: 'SHORT',
        entryPrice: currentPrice,
        entryAmount,
        tokenAmount: 0, // SHORT doesn't hold tokens
        txHash,
        trailingStopPercent: signal.stopLossPercent,
        takeProfitPercent: signal.takeProfitPercent,
        isLeveraged: signal.leverage > 1,
        leverageMultiplier: signal.leverage,
        collateralAmount: entryAmount,
        borrowedAmount: entryAmount * (signal.leverage - 1)
      });

      // Record trade
      await subscriptionService.recordTrade(userAddress);

      logger.info('SHORT position opened successfully', {
        txHash,
        positionId: position?.id,
        user: userAddress.slice(0, 10),
        token: signal.tokenSymbol,
        leverage: signal.leverage + 'x'
      });

      return {
        success: true,
        txHash,
        positionId: position?.id,
        collateral: formatUnits(signal.collateralAmount, 6),
        leverage: signal.leverage
      };
    } catch (err: any) {
      logger.error('Failed to open SHORT', { error: err.message });
      return { success: false, error: err.message };
    }
  }

  /**
   * Close a position manually
   */
  async closePosition(
    userAddress: `0x${string}`,
    tokenAddress: `0x${string}`,
    closeReason: string
  ): Promise<V6TradeResult> {
    try {
      const position = await this.getOnChainPosition(userAddress, tokenAddress);
      if (!position || !position.isActive) {
        return { success: false, error: 'No active position' };
      }

      const isLong = position.isLong;
      let txHash: `0x${string}`;

      if (isLong) {
        txHash = await this.walletClient.writeContract({
          address: V6_VAULT_ADDRESS,
          abi: VAULT_V6_ABI,
          functionName: 'closeLong',
          args: [userAddress, tokenAddress, 0n], // 0 minUsdcOut
          chain: arbitrum,
          account: this.botAccount
        });
      } else {
        // For SHORT, use max uint for maxUsdcIn
        const maxUsdcIn = parseUnits('1000000', 6); // 1M USDC max
        txHash = await this.walletClient.writeContract({
          address: V6_VAULT_ADDRESS,
          abi: VAULT_V6_ABI,
          functionName: 'closeShort',
          args: [userAddress, tokenAddress, maxUsdcIn],
          chain: arbitrum,
          account: this.botAccount
        });
      }

      const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== 'success') {
        return { success: false, error: 'Transaction reverted' };
      }

      // Update database position
      const currentPrice = await this.getTokenPrice(tokenAddress);
      const dbPositions = await positionService.getOpenPositions(userAddress, 42161);
      const dbPosition = dbPositions.find(p =>
        p.token_address.toLowerCase() === tokenAddress.toLowerCase()
      );

      if (dbPosition && currentPrice) {
        await positionService.closePosition({
          positionId: dbPosition.id,
          exitPrice: currentPrice,
          exitAmount: parseFloat(formatUnits(position.collateral, 6)),
          txHash,
          closeReason: closeReason as any
        });
      }

      logger.info('Position closed', {
        txHash,
        user: userAddress.slice(0, 10),
        direction: isLong ? 'LONG' : 'SHORT',
        reason: closeReason
      });

      return { success: true, txHash };
    } catch (err: any) {
      logger.error('Failed to close position', { error: err.message });
      return { success: false, error: err.message };
    }
  }

  /**
   * Check and execute SL/TP/Liquidation for all positions
   * Called by the position monitor
   */
  async checkAndExecuteTriggers(
    userAddress: `0x${string}`,
    tokenAddress: `0x${string}`
  ): Promise<{ triggered: boolean; reason?: string }> {
    try {
      const [shouldClose, reason] = await this.publicClient.readContract({
        address: V6_VAULT_ADDRESS,
        abi: VAULT_V6_ABI,
        functionName: 'checkPositionStatus',
        args: [userAddress, tokenAddress]
      });

      if (!shouldClose) {
        return { triggered: false };
      }

      logger.warn(`V6 ${reason.toUpperCase()} triggered`, {
        user: userAddress.slice(0, 10),
        token: tokenAddress.slice(0, 10)
      });

      let txHash: `0x${string}`;

      switch (reason) {
        case 'stoploss':
          txHash = await this.walletClient.writeContract({
            address: V6_VAULT_ADDRESS,
            abi: VAULT_V6_ABI,
            functionName: 'executeStopLoss',
            args: [userAddress, tokenAddress],
            chain: arbitrum,
            account: this.botAccount
          });
          break;

        case 'takeprofit':
          txHash = await this.walletClient.writeContract({
            address: V6_VAULT_ADDRESS,
            abi: VAULT_V6_ABI,
            functionName: 'executeTakeProfit',
            args: [userAddress, tokenAddress],
            chain: arbitrum,
            account: this.botAccount
          });
          break;

        case 'liquidation':
          txHash = await this.walletClient.writeContract({
            address: V6_VAULT_ADDRESS,
            abi: VAULT_V6_ABI,
            functionName: 'liquidatePosition',
            args: [userAddress, tokenAddress],
            chain: arbitrum,
            account: this.botAccount
          });
          break;

        default:
          return { triggered: false };
      }

      await this.publicClient.waitForTransactionReceipt({ hash: txHash });

      // Update database
      const dbPositions = await positionService.getOpenPositions(userAddress, 42161);
      const dbPosition = dbPositions.find(p =>
        p.token_address.toLowerCase() === tokenAddress.toLowerCase()
      );

      if (dbPosition) {
        const currentPrice = await this.getTokenPrice(tokenAddress);
        await positionService.closePosition({
          positionId: dbPosition.id,
          exitPrice: currentPrice || dbPosition.entry_price,
          exitAmount: dbPosition.entry_amount,
          txHash,
          closeReason: reason as any
        });
      }

      logger.info(`V6 ${reason} executed successfully`, {
        txHash,
        user: userAddress.slice(0, 10)
      });

      return { triggered: true, reason };
    } catch (err: any) {
      logger.error('Failed to execute trigger', { error: err.message });
      return { triggered: false };
    }
  }

  /**
   * Withdraw accumulated fees
   */
  async withdrawFees(): Promise<{ success: boolean; amount?: string }> {
    try {
      const fees = await this.publicClient.readContract({
        address: V6_VAULT_ADDRESS,
        abi: VAULT_V6_ABI,
        functionName: 'accumulatedFees'
      });

      if (fees === 0n) {
        return { success: true, amount: '0' };
      }

      const txHash = await this.walletClient.writeContract({
        address: V6_VAULT_ADDRESS,
        abi: VAULT_V6_ABI,
        functionName: 'withdrawFees',
        args: [],
        chain: arbitrum,
        account: this.botAccount
      });

      await this.publicClient.waitForTransactionReceipt({ hash: txHash });

      const amount = formatUnits(fees, 6);
      logger.info('V6 Fees withdrawn', { amount, txHash });

      return { success: true, amount };
    } catch (err: any) {
      return { success: false };
    }
  }

  /**
   * Get all auto-trade users
   */
  async getAutoTradeUsers(): Promise<`0x${string}`[]> {
    const addresses = await subscriptionService.getAutoTradeUsers(42161);
    return addresses as `0x${string}`[];
  }
}

// Export singleton
export const tradingV6Service = new TradingV6Service();

// Export token addresses
export const V6_TOKENS = ARBITRUM_TOKENS;
export { V6_VAULT_ADDRESS };
