import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
  parseEther,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrum } from 'viem/chains';
import { config } from '../config';
import { logger } from '../utils/logger';
import { subscriptionService } from './subscription';
import { positionService } from './positions';

/**
 * V7 GMX Trading Service
 *
 * Uses GMX Perpetuals for TRUE 20x-50x leverage
 * - No Aave limitations
 * - Direct perpetual positions on GMX
 * - Keeper-based execution
 */

// GMX Contract Addresses on Arbitrum
const GMX_ADDRESSES = {
  vault: '0x489ee077994B6658eAfA855C308275EAd8097C4A' as `0x${string}`,
  router: '0xaBBc5F99639c9B6bCb58544ddf04EFA6802F4064' as `0x${string}`,
  positionRouter: '0xb87a436B93fFE9D75c5cFA7bAcFff96430b09868' as `0x${string}`,
  orderBook: '0x09f77E8A13De9a35a7231028187e9fD5DB8a2ACB' as `0x${string}`,
};

// Token Addresses
const TOKENS = {
  USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as `0x${string}`,
  WETH: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1' as `0x${string}`,
  WBTC: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f' as `0x${string}`,
};

// V7 Vault ABI
const VAULT_V7_ABI = [
  // Read functions
  {
    inputs: [{ name: 'user', type: 'address' }],
    name: 'balances',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'user', type: 'address' }],
    name: 'getUserSettings',
    outputs: [{
      components: [
        { name: 'autoTradeEnabled', type: 'bool' },
        { name: 'riskLevelBps', type: 'uint256' },
        { name: 'maxLeverage', type: 'uint256' },
        { name: 'defaultStopLoss', type: 'uint256' },
        { name: 'defaultTakeProfit', type: 'uint256' }
      ],
      type: 'tuple'
    }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'indexToken', type: 'address' }
    ],
    name: 'getPosition',
    outputs: [{
      components: [
        { name: 'isActive', type: 'bool' },
        { name: 'isLong', type: 'bool' },
        { name: 'indexToken', type: 'address' },
        { name: 'collateral', type: 'uint256' },
        { name: 'sizeDelta', type: 'uint256' },
        { name: 'leverage', type: 'uint256' },
        { name: 'entryPrice', type: 'uint256' },
        { name: 'stopLossPrice', type: 'uint256' },
        { name: 'takeProfitPrice', type: 'uint256' },
        { name: 'openedAt', type: 'uint256' },
        { name: 'positionKey', type: 'bytes32' }
      ],
      type: 'tuple'
    }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'indexToken', type: 'address' }
    ],
    name: 'checkPositionTrigger',
    outputs: [
      { name: 'shouldClose', type: 'bool' },
      { name: 'reason', type: 'string' }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'indexToken', type: 'address' }
    ],
    name: 'getPositionPnL',
    outputs: [
      { name: 'pnl', type: 'int256' },
      { name: 'pnlPercent', type: 'int256' }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'getExecutionFee',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'token', type: 'address' }],
    name: 'getPrice',
    outputs: [
      { name: 'maxPrice', type: 'uint256' },
      { name: 'minPrice', type: 'uint256' }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  // Write functions
  {
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'indexToken', type: 'address' },
      { name: 'collateralAmount', type: 'uint256' },
      { name: 'leverage', type: 'uint256' },
      { name: 'isLong', type: 'bool' },
      { name: 'stopLossBps', type: 'uint256' },
      { name: 'takeProfitBps', type: 'uint256' }
    ],
    name: 'openPosition',
    outputs: [{ name: 'requestKey', type: 'bytes32' }],
    stateMutability: 'payable',
    type: 'function'
  },
  {
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'indexToken', type: 'address' }
    ],
    name: 'closePosition',
    outputs: [{ name: 'requestKey', type: 'bytes32' }],
    stateMutability: 'payable',
    type: 'function'
  },
  {
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'indexToken', type: 'address' },
      { name: 'receivedAmount', type: 'uint256' },
      { name: 'reason', type: 'string' }
    ],
    name: 'finalizeClose',
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
  },
  {
    inputs: [],
    name: 'accumulatedFees',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const;

// GMX Vault ABI for price reads
const GMX_VAULT_ABI = [
  {
    inputs: [{ name: '_token', type: 'address' }],
    name: 'getMaxPrice',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: '_token', type: 'address' }],
    name: 'getMinPrice',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const;

export interface V7TradeSignal {
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

export interface V7TradeResult {
  success: boolean;
  txHash?: string;
  requestKey?: string;
  error?: string;
  collateral?: string;
  leverage?: number;
}

// V7 Vault Address on Arbitrum
const V7_VAULT_ADDRESS = (config.chains[42161] as any).vaultV7Address || '0x712B3A0cFD00674a15c5D235e998F71709112675';

export class TradingV7GMXService {
  private botAccount = privateKeyToAccount(config.botPrivateKey);
  private publicClient;
  private walletClient;
  private v7VaultAddress: `0x${string}`;

  constructor(vaultAddress?: `0x${string}`) {
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

    // V7 vault address from config
    this.v7VaultAddress = vaultAddress || V7_VAULT_ADDRESS as `0x${string}`;

    logger.info('TradingV7GMXService initialized', {
      gmxVault: GMX_ADDRESSES.vault,
      v7Vault: this.v7VaultAddress,
      bot: this.botAccount.address
    });
  }

  /**
   * Set V7 vault address after deployment
   */
  setVaultAddress(address: `0x${string}`) {
    this.v7VaultAddress = address;
    logger.info('V7 Vault address set', { address });
  }

  /**
   * Get user's V7 vault status
   */
  async getUserVaultStatus(userAddress: `0x${string}`) {
    try {
      const [balance, settings] = await Promise.all([
        this.publicClient.readContract({
          address: this.v7VaultAddress,
          abi: VAULT_V7_ABI,
          functionName: 'balances',
          args: [userAddress]
        }),
        this.publicClient.readContract({
          address: this.v7VaultAddress,
          abi: VAULT_V7_ABI,
          functionName: 'getUserSettings',
          args: [userAddress]
        })
      ]);

      return {
        balance,
        balanceFormatted: formatUnits(balance, 6),
        autoTradeEnabled: settings.autoTradeEnabled,
        riskLevelBps: Number(settings.riskLevelBps),
        maxLeverage: Number(settings.maxLeverage),
        defaultStopLoss: Number(settings.defaultStopLoss),
        defaultTakeProfit: Number(settings.defaultTakeProfit)
      };
    } catch (err) {
      logger.error('Failed to get V7 vault status', { userAddress, error: err });
      return null;
    }
  }

  /**
   * Get GMX execution fee required
   */
  async getExecutionFee(): Promise<bigint> {
    try {
      const fee = await this.publicClient.readContract({
        address: this.v7VaultAddress,
        abi: VAULT_V7_ABI,
        functionName: 'getExecutionFee'
      });
      return fee;
    } catch {
      // Default GMX execution fee (~0.0003 ETH)
      return parseEther('0.0003');
    }
  }

  /**
   * Get token price from GMX
   */
  async getTokenPrice(tokenAddress: `0x${string}`): Promise<{ max: number; min: number } | null> {
    try {
      const [maxPrice, minPrice] = await Promise.all([
        this.publicClient.readContract({
          address: GMX_ADDRESSES.vault,
          abi: GMX_VAULT_ABI,
          functionName: 'getMaxPrice',
          args: [tokenAddress]
        }),
        this.publicClient.readContract({
          address: GMX_ADDRESSES.vault,
          abi: GMX_VAULT_ABI,
          functionName: 'getMinPrice',
          args: [tokenAddress]
        })
      ]);

      // GMX prices have 30 decimals
      return {
        max: parseFloat(formatUnits(maxPrice, 30)),
        min: parseFloat(formatUnits(minPrice, 30))
      };
    } catch (err) {
      logger.error('Failed to get GMX price', { tokenAddress, error: err });
      return null;
    }
  }

  /**
   * Check if user has an active position
   */
  async hasOpenPosition(userAddress: `0x${string}`, tokenAddress: `0x${string}`): Promise<boolean> {
    try {
      const position = await this.publicClient.readContract({
        address: this.v7VaultAddress,
        abi: VAULT_V7_ABI,
        functionName: 'getPosition',
        args: [userAddress, tokenAddress]
      });
      return position.isActive;
    } catch {
      return false;
    }
  }

  /**
   * Open a leveraged position via GMX
   */
  async openPosition(
    userAddress: `0x${string}`,
    signal: V7TradeSignal
  ): Promise<V7TradeResult> {
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

      // Get execution fee
      const executionFee = await this.getExecutionFee();

      // Get current price for logging
      const price = await this.getTokenPrice(signal.tokenAddress);

      // Convert percent to basis points
      const stopLossBps = BigInt(Math.round(signal.stopLossPercent * 100));
      const takeProfitBps = BigInt(Math.round(signal.takeProfitPercent * 100));

      logger.info('Opening GMX position', {
        user: userAddress.slice(0, 10),
        token: signal.tokenSymbol,
        direction: signal.direction,
        collateral: formatUnits(signal.collateralAmount, 6),
        leverage: signal.leverage + 'x',
        price: price?.max,
        executionFee: formatUnits(executionFee, 18)
      });

      // Execute openPosition with ETH for execution fee
      const txHash = await this.walletClient.writeContract({
        address: this.v7VaultAddress,
        abi: VAULT_V7_ABI,
        functionName: 'openPosition',
        args: [
          userAddress,
          signal.tokenAddress,
          signal.collateralAmount,
          BigInt(signal.leverage),
          signal.direction === 'LONG',
          stopLossBps,
          takeProfitBps
        ],
        value: executionFee,
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
        direction: signal.direction,
        entryPrice: price?.max || 0,
        entryAmount,
        tokenAmount: 0, // GMX handles this
        txHash,
        trailingStopPercent: signal.stopLossPercent,
        takeProfitPercent: signal.takeProfitPercent,
        isLeveraged: true,
        leverageMultiplier: signal.leverage,
        collateralAmount: entryAmount,
        borrowedAmount: 0 // GMX handles leverage internally
      });

      // Record trade
      await subscriptionService.recordTrade(userAddress);

      logger.info('GMX position opened successfully', {
        txHash,
        positionId: position?.id,
        user: userAddress.slice(0, 10),
        token: signal.tokenSymbol,
        direction: signal.direction,
        leverage: signal.leverage + 'x'
      });

      return {
        success: true,
        txHash,
        collateral: formatUnits(signal.collateralAmount, 6),
        leverage: signal.leverage
      };
    } catch (err: any) {
      logger.error('Failed to open GMX position', { error: err.message });
      return { success: false, error: err.message };
    }
  }

  /**
   * Close a position via GMX
   */
  async closePosition(
    userAddress: `0x${string}`,
    tokenAddress: `0x${string}`,
    closeReason: string
  ): Promise<V7TradeResult> {
    try {
      // Get execution fee
      const executionFee = await this.getExecutionFee();

      logger.info('Closing GMX position', {
        user: userAddress.slice(0, 10),
        token: tokenAddress.slice(0, 10),
        reason: closeReason
      });

      // Execute closePosition with ETH for execution fee
      const txHash = await this.walletClient.writeContract({
        address: this.v7VaultAddress,
        abi: VAULT_V7_ABI,
        functionName: 'closePosition',
        args: [userAddress, tokenAddress],
        value: executionFee,
        chain: arbitrum,
        account: this.botAccount
      });

      const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== 'success') {
        return { success: false, error: 'Transaction reverted' };
      }

      logger.info('GMX close position requested', {
        txHash,
        user: userAddress.slice(0, 10),
        reason: closeReason
      });

      return { success: true, txHash };
    } catch (err: any) {
      logger.error('Failed to close GMX position', { error: err.message });
      return { success: false, error: err.message };
    }
  }

  /**
   * Check and execute SL/TP triggers
   */
  async checkAndExecuteTriggers(
    userAddress: `0x${string}`,
    tokenAddress: `0x${string}`
  ): Promise<{ triggered: boolean; reason?: string }> {
    try {
      const [shouldClose, reason] = await this.publicClient.readContract({
        address: this.v7VaultAddress,
        abi: VAULT_V7_ABI,
        functionName: 'checkPositionTrigger',
        args: [userAddress, tokenAddress]
      });

      if (!shouldClose) {
        return { triggered: false };
      }

      logger.warn(`GMX ${reason.toUpperCase()} triggered`, {
        user: userAddress.slice(0, 10),
        token: tokenAddress.slice(0, 10)
      });

      // Execute close
      const result = await this.closePosition(userAddress, tokenAddress, reason);

      if (result.success) {
        logger.info(`GMX ${reason} executed successfully`, {
          txHash: result.txHash,
          user: userAddress.slice(0, 10)
        });
        return { triggered: true, reason };
      }

      return { triggered: false };
    } catch (err: any) {
      logger.error('Failed to check GMX triggers', { error: err.message });
      return { triggered: false };
    }
  }

  /**
   * Get all auto-trade users
   */
  async getAutoTradeUsers(): Promise<`0x${string}`[]> {
    const addresses = await subscriptionService.getAutoTradeUsers(42161);
    return addresses as `0x${string}`[];
  }

  /**
   * Withdraw accumulated fees
   */
  async withdrawFees(): Promise<{ success: boolean; amount?: string }> {
    try {
      const fees = await this.publicClient.readContract({
        address: this.v7VaultAddress,
        abi: VAULT_V7_ABI,
        functionName: 'accumulatedFees'
      });

      if (fees === 0n) {
        return { success: true, amount: '0' };
      }

      const txHash = await this.walletClient.writeContract({
        address: this.v7VaultAddress,
        abi: VAULT_V7_ABI,
        functionName: 'withdrawFees',
        args: [],
        chain: arbitrum,
        account: this.botAccount
      });

      await this.publicClient.waitForTransactionReceipt({ hash: txHash });

      const amount = formatUnits(fees, 6);
      logger.info('V7 Fees withdrawn', { amount, txHash });

      return { success: true, amount };
    } catch (err: any) {
      return { success: false };
    }
  }
}

// Export singleton (will need vault address set after deployment)
export const tradingV7GMXService = new TradingV7GMXService();

// Export token addresses
export const V7_TOKENS = TOKENS;
export const GMX_CONTRACTS = GMX_ADDRESSES;
