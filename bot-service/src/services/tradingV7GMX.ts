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
    name: 'getSettings',  // V8: getSettings (not getUserSettings)
    outputs: [{
      components: [
        { name: 'autoTradeEnabled', type: 'bool' },
        { name: 'riskBps', type: 'uint256' },        // V8: riskBps (not riskLevelBps)
        { name: 'maxLeverage', type: 'uint256' },
        { name: 'stopLossBps', type: 'uint256' },    // V8: stopLossBps (not defaultStopLoss)
        { name: 'takeProfitBps', type: 'uint256' }   // V8: takeProfitBps (not defaultTakeProfit)
      ],
      type: 'tuple'
    }],
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
        { name: 'isActive', type: 'bool' },
        { name: 'isLong', type: 'bool' },
        { name: 'token', type: 'address' },
        { name: 'collateral', type: 'uint256' },
        { name: 'size', type: 'uint256' },
        { name: 'leverage', type: 'uint256' },
        { name: 'entryPrice', type: 'uint256' },
        { name: 'stopLoss', type: 'uint256' },        // V8: stopLoss (not stopLossPrice)
        { name: 'takeProfit', type: 'uint256' },      // V8: takeProfit (not takeProfitPrice)
        { name: 'timestamp', type: 'uint256' },
        { name: 'requestKey', type: 'bytes32' },
        // V8.2 Trailing Stop fields
        { name: 'highestPrice', type: 'uint256' },
        { name: 'lowestPrice', type: 'uint256' },
        { name: 'trailingSlBps', type: 'uint256' },
        { name: 'trailingActivated', type: 'bool' },
        { name: 'autoFeaturesEnabled', type: 'bool' }
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
  // Write functions (V8.2 - added trailingSlBps parameter)
  {
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'collateral', type: 'uint256' },
      { name: 'leverage', type: 'uint256' },
      { name: 'isLong', type: 'bool' },
      { name: 'slBps', type: 'uint256' },
      { name: 'tpBps', type: 'uint256' },
      { name: 'trailingSlBps', type: 'uint256' }
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
    name: 'fees',  // V9: renamed from accumulatedFees
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  // V8.2: Update trailing stop level
  {
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'token', type: 'address' }
    ],
    name: 'updateTrailingStop',
    outputs: [],
    stateMutability: 'nonpayable',
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
  // Close result fields
  pnl?: number;
  pnlPercent?: number;
  exitPrice?: number;
  exitAmount?: number;
}

// V8 Vault - from simplified config
const VAULT_ADDRESS = config.arbitrum.vaultAddress;

export class TradingV7GMXService {
  private botAccount = privateKeyToAccount(config.botPrivateKey);
  private publicClient;
  private walletClient;
  private vaultAddress: `0x${string}`;

  constructor() {
    this.publicClient = createPublicClient({
      chain: arbitrum,
      transport: http(config.arbitrum.rpcUrl)
    });

    this.walletClient = createWalletClient({
      account: this.botAccount,
      chain: arbitrum,
      transport: http(config.arbitrum.rpcUrl)
    });

    this.vaultAddress = VAULT_ADDRESS;

    logger.info('TradingV7GMXService initialized', {
      gmxVault: GMX_ADDRESSES.vault,
      vaultAddress: this.vaultAddress,
      bot: this.botAccount.address
    });
  }

  /**
   * Set V7 vault address after deployment
   */
  setVaultAddress(address: `0x${string}`) {
    this.vaultAddress = address;
    logger.info('V7 Vault address set', { address });
  }

  /**
   * Get user's V7 vault status
   */
  async getUserVaultStatus(userAddress: `0x${string}`) {
    try {
      // V8: Read balance and settings separately to handle errors better
      const balance = await this.publicClient.readContract({
        address: this.vaultAddress,
        abi: VAULT_V7_ABI,
        functionName: 'balances',
        args: [userAddress]
      });

      // V8: Use getSettings (not getUserSettings)
      let settings: any = null;
      try {
        settings = await this.publicClient.readContract({
          address: this.vaultAddress,
          abi: VAULT_V7_ABI,
          functionName: 'getSettings',  // V8: getSettings
          args: [userAddress]
        });
      } catch (settingsErr) {
        logger.warn('Could not read settings, using defaults', { userAddress });
      }

      return {
        balance,
        balanceFormatted: formatUnits(balance, 6),
        autoTradeEnabled: settings?.autoTradeEnabled ?? false,
        riskLevelBps: Number(settings?.riskBps) || 500,       // V8: riskBps (|| to catch 0)
        maxLeverage: Number(settings?.maxLeverage) || 20,
        defaultStopLoss: Number(settings?.stopLossBps) || 500,  // V8: stopLossBps
        defaultTakeProfit: Number(settings?.takeProfitBps) || 1000 // V8: takeProfitBps
      };
    } catch (err) {
      logger.error('Failed to get V8 vault status', { userAddress, error: err });
      return null;
    }
  }

  /**
   * Get GMX execution fee required
   */
  async getExecutionFee(): Promise<bigint> {
    try {
      const fee = await this.publicClient.readContract({
        address: this.vaultAddress,
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
   * Check if user has an active position in vault
   */
  async hasOpenPosition(userAddress: `0x${string}`, tokenAddress: `0x${string}`): Promise<boolean> {
    try {
      const position = await this.publicClient.readContract({
        address: this.vaultAddress,
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
   * Check if GMX position is closed but vault still shows active (ORPHANED)
   * Returns true if we need to call reconcile()
   */
  async isGMXPositionClosed(userAddress: `0x${string}`, tokenAddress: `0x${string}`): Promise<boolean> {
    try {
      // First check if vault has an active position
      const vaultPosition = await this.publicClient.readContract({
        address: this.vaultAddress,
        abi: VAULT_V7_ABI,
        functionName: 'getPosition',
        args: [userAddress, tokenAddress]
      }) as any;

      if (!vaultPosition || !vaultPosition.isActive) {
        return false; // No vault position, nothing to reconcile
      }

      // Check GMX position size - if 0, GMX has closed it
      const gmxPosition = await this.publicClient.readContract({
        address: GMX_ADDRESSES.vault,
        abi: [{
          inputs: [
            { name: '_account', type: 'address' },
            { name: '_collateralToken', type: 'address' },
            { name: '_indexToken', type: 'address' },
            { name: '_isLong', type: 'bool' }
          ],
          name: 'getPosition',
          outputs: [
            { name: 'size', type: 'uint256' },
            { name: 'collateral', type: 'uint256' },
            { name: 'averagePrice', type: 'uint256' },
            { name: 'entryFundingRate', type: 'uint256' },
            { name: 'reserveAmount', type: 'uint256' },
            { name: 'realisedPnl', type: 'int256' },
            { name: 'lastIncreasedTime', type: 'uint256' }
          ],
          stateMutability: 'view',
          type: 'function'
        }],
        functionName: 'getPosition',
        args: [this.vaultAddress, TOKENS.USDC, tokenAddress, vaultPosition.isLong]
      }) as unknown as readonly bigint[];

      const gmxSize = gmxPosition[0];

      // If GMX size is 0 but vault shows active = ORPHANED
      if (gmxSize === 0n) {
        logger.warn('ORPHANED POSITION DETECTED', {
          user: userAddress.slice(0, 10),
          token: tokenAddress === TOKENS.WETH ? 'ETH' : 'BTC',
          vaultCollateral: formatUnits(vaultPosition.collateral, 6)
        });
        return true;
      }

      return false;
    } catch (err: any) {
      logger.debug('Error checking GMX position state', { error: err.message });
      return false;
    }
  }

  /**
   * Set elite status for a user (allows 50x leverage)
   */
  async setEliteStatus(userAddress: `0x${string}`, isElite: boolean): Promise<boolean> {
    try {
      const SET_ELITE_ABI = [{
        inputs: [{ name: 'user', type: 'address' }, { name: 'status', type: 'bool' }],
        name: 'setElite',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function'
      }] as const;

      const hash = await this.walletClient.writeContract({
        address: this.vaultAddress,
        abi: SET_ELITE_ABI,
        functionName: 'setElite',
        args: [userAddress, isElite],
        chain: arbitrum,
        account: this.botAccount.address
      });

      await this.publicClient.waitForTransactionReceipt({ hash });
      logger.info('Set elite status', { user: userAddress.slice(0, 10), isElite });
      return true;
    } catch (err) {
      logger.error('Failed to set elite status', { error: err });
      return false;
    }
  }

  /**
   * Finalize orphaned position - credits user balance after manual close
   * Called by reconciliation when our vault shows active position but GMX position is closed
   */
  async finalizeOrphanedPosition(
    userAddress: `0x${string}`,
    tokenAddress: `0x${string}`,
    currentPriceUsd: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Get vault position data
      const position = await this.publicClient.readContract({
        address: this.vaultAddress,
        abi: VAULT_V7_ABI,
        functionName: 'getPosition',
        args: [userAddress, tokenAddress]
      }) as any;

      if (!position || !position.isActive) {
        return { success: false, error: 'No active vault position' };
      }

      const collateral = position.collateral as bigint;
      const entryPrice = position.entryPrice as bigint;
      const leverage = Number(position.leverage) || 1;
      const isLong = position.isLong as boolean;

      // Calculate P/L based on current price
      // Entry price has 30 decimals (GMX format)
      const entryPriceNum = parseFloat(formatUnits(entryPrice, 30));
      let pnlPercent = 0;

      if (isLong) {
        pnlPercent = ((currentPriceUsd - entryPriceNum) / entryPriceNum) * 100 * leverage;
      } else {
        pnlPercent = ((entryPriceNum - currentPriceUsd) / entryPriceNum) * 100 * leverage;
      }

      // Calculate received amount
      const collateralNum = parseFloat(formatUnits(collateral, 6));
      const pnlAmount = (collateralNum * pnlPercent) / 100;
      const receivedNum = Math.max(0, collateralNum + pnlAmount);
      const receivedAmount = parseUnits(receivedNum.toFixed(6), 6);

      logger.info('Finalizing orphaned position', {
        user: userAddress.slice(0, 10),
        token: tokenAddress.slice(0, 10),
        collateral: collateralNum,
        entryPrice: entryPriceNum,
        currentPrice: currentPriceUsd,
        pnlPercent,
        receivedAmount: receivedNum
      });

      // Call finalizeClose on contract
      const txHash = await this.walletClient.writeContract({
        address: this.vaultAddress,
        abi: VAULT_V7_ABI,
        functionName: 'finalizeClose',
        args: [userAddress, tokenAddress, receivedAmount, 'manual_reconciled'],
        chain: arbitrum,
        account: this.botAccount
      });

      const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== 'success') {
        return { success: false, error: 'FinalizeClose transaction reverted' };
      }

      logger.info('Orphaned position finalized - balance credited', {
        txHash,
        user: userAddress.slice(0, 10),
        receivedAmount: receivedNum
      });

      return { success: true };
    } catch (err: any) {
      logger.error('Failed to finalize orphaned position', {
        user: userAddress.slice(0, 10),
        error: err.message
      });
      return { success: false, error: err.message };
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

      // V8.2: Trailing stop of 0.5% (50 bps) - activates after 0.6% profit
      const trailingSlBps = BigInt(50);

      // Execute openPosition with ETH for execution fee
      const txHash = await this.walletClient.writeContract({
        address: this.vaultAddress,
        abi: VAULT_V7_ABI,
        functionName: 'openPosition',
        args: [
          userAddress,
          signal.tokenAddress,
          signal.collateralAmount,
          BigInt(signal.leverage),
          signal.direction === 'LONG',
          stopLossBps,
          takeProfitBps,
          trailingSlBps  // V8.2: Trailing stop loss
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
   * Close a position - INSTANT mode (skip GMX keeper wait)
   * Calculates PnL immediately and credits user
   */
  async closePosition(
    userAddress: `0x${string}`,
    tokenAddress: `0x${string}`,
    closeReason: string
  ): Promise<V7TradeResult> {
    try {
      logger.info('Closing position INSTANT', {
        user: userAddress.slice(0, 10),
        token: tokenAddress.slice(0, 10),
        reason: closeReason
      });

      // Get current position from contract
      const position = await this.publicClient.readContract({
        address: this.vaultAddress,
        abi: VAULT_V7_ABI,
        functionName: 'getPosition',
        args: [userAddress, tokenAddress]
      }) as any;

      if (!position || !position.isActive) {
        return { success: false, error: 'No active position' };
      }

      // Get current price to calculate PnL
      const [maxPrice, minPrice] = await this.publicClient.readContract({
        address: this.vaultAddress,
        abi: VAULT_V7_ABI,
        functionName: 'getPrice',
        args: [tokenAddress]
      }) as [bigint, bigint];

      const currentPrice = position.isLong ? minPrice : maxPrice;
      const entryPrice = position.entryPrice;
      const collateral = position.collateral;
      const leverage = position.leverage;

      // Calculate PnL
      let pnlBps: bigint;
      if (position.isLong) {
        pnlBps = ((currentPrice - entryPrice) * 10000n) / entryPrice;
      } else {
        pnlBps = ((entryPrice - currentPrice) * 10000n) / entryPrice;
      }

      // Apply leverage to PnL
      const leveragedPnlBps = pnlBps * BigInt(leverage);
      const pnlAmount = (collateral * leveragedPnlBps) / 10000n;

      // Calculate received amount (collateral + PnL, but can't go below 0)
      let receivedAmount = collateral;
      if (leveragedPnlBps >= 0n) {
        receivedAmount = collateral + pnlAmount;
      } else {
        // Loss case - reduce collateral but not below 0
        const loss = pnlAmount < 0n ? -pnlAmount : pnlAmount;
        receivedAmount = collateral > loss ? collateral - loss : 0n;
      }

      logger.info('Calculated PnL for close', {
        user: userAddress.slice(0, 10),
        entryPrice: entryPrice.toString(),
        currentPrice: currentPrice.toString(),
        pnlBps: leveragedPnlBps.toString(),
        collateral: collateral.toString(),
        receivedAmount: receivedAmount.toString()
      });

      // Call finalizeClose directly (skip GMX keeper wait)
      const txHash = await this.walletClient.writeContract({
        address: this.vaultAddress,
        abi: VAULT_V7_ABI,
        functionName: 'finalizeClose',
        args: [userAddress, tokenAddress, receivedAmount, closeReason],
        chain: arbitrum,
        account: this.botAccount
      });

      const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== 'success') {
        return { success: false, error: 'FinalizeClose transaction reverted' };
      }

      // Convert to human-readable values for return
      const pnlPercent = Number(leveragedPnlBps) / 100; // bps to percent
      const pnlUSD = Number(pnlAmount) / 1e6; // USDC has 6 decimals
      const exitPriceNum = Number(currentPrice) / 1e30; // GMX prices have 30 decimals
      const exitAmountNum = Number(receivedAmount) / 1e6;

      logger.info('Position closed INSTANTLY', {
        txHash,
        user: userAddress.slice(0, 10),
        reason: closeReason,
        pnlPercent: pnlPercent.toFixed(2) + '%',
        pnlUSD: '$' + pnlUSD.toFixed(2),
        exitPrice: exitPriceNum.toFixed(2)
      });

      return {
        success: true,
        txHash,
        pnl: pnlUSD,
        pnlPercent: pnlPercent,
        exitPrice: exitPriceNum,
        exitAmount: exitAmountNum
      };
    } catch (err: any) {
      logger.error('Failed to close position', { error: err.message });
      return { success: false, error: err.message };
    }
  }

  /**
   * Reconcile orphaned position - ANYONE can call this
   * Use when vault shows active position but GMX position is already closed
   * This credits the user their balance back
   */
  async reconcilePosition(
    userAddress: `0x${string}`,
    tokenAddress: `0x${string}`
  ): Promise<{ success: boolean; txHash?: string; creditedAmount?: number; error?: string }> {
    try {
      // Check if vault has active position
      const position = await this.publicClient.readContract({
        address: this.vaultAddress,
        abi: VAULT_V7_ABI,
        functionName: 'getPosition',
        args: [userAddress, tokenAddress]
      }) as any;

      if (!position || !position.isActive) {
        return { success: false, error: 'No active vault position' };
      }

      // Check if GMX position is closed
      const gmxPosition = await this.publicClient.readContract({
        address: GMX_ADDRESSES.vault,
        abi: [{
          inputs: [
            { name: '_account', type: 'address' },
            { name: '_collateralToken', type: 'address' },
            { name: '_indexToken', type: 'address' },
            { name: '_isLong', type: 'bool' }
          ],
          name: 'getPosition',
          outputs: [
            { name: 'size', type: 'uint256' },
            { name: 'collateral', type: 'uint256' },
            { name: 'averagePrice', type: 'uint256' },
            { name: 'entryFundingRate', type: 'uint256' },
            { name: 'reserveAmount', type: 'uint256' },
            { name: 'realisedPnl', type: 'int256' },
            { name: 'lastIncreasedTime', type: 'uint256' }
          ],
          stateMutability: 'view',
          type: 'function'
        }],
        functionName: 'getPosition',
        args: [this.vaultAddress, TOKENS.USDC, tokenAddress, position.isLong]
      }) as unknown as any[];

      const gmxSize = gmxPosition[0] as bigint;
      if (gmxSize > 0n) {
        return { success: false, error: 'GMX position still active - cannot reconcile yet' };
      }

      logger.info('Reconciling orphaned position', {
        user: userAddress.slice(0, 10),
        token: tokenAddress.slice(0, 10),
        collateral: formatUnits(position.collateral, 6)
      });

      // Call reconcile on vault - credits user their balance
      const txHash = await this.walletClient.writeContract({
        address: this.vaultAddress,
        abi: [{
          inputs: [
            { name: 'user', type: 'address' },
            { name: 'token', type: 'address' }
          ],
          name: 'reconcile',
          outputs: [],
          stateMutability: 'nonpayable',
          type: 'function'
        }],
        functionName: 'reconcile',
        args: [userAddress, tokenAddress],
        chain: arbitrum,
        account: this.botAccount
      });

      const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== 'success') {
        return { success: false, error: 'Reconcile transaction reverted' };
      }

      const creditedAmount = Number(formatUnits(position.collateral, 6));

      logger.info('Position reconciled successfully', {
        txHash,
        user: userAddress.slice(0, 10),
        creditedAmount
      });

      return { success: true, txHash, creditedAmount };
    } catch (err: any) {
      logger.error('Failed to reconcile position', { error: err.message });
      return { success: false, error: err.message };
    }
  }

  /**
   * Find and reconcile all orphaned positions
   * Scans all users with vault positions and reconciles any where GMX is already closed
   */
  async reconcileAllOrphanedPositions(): Promise<{ reconciled: number; errors: string[] }> {
    const errors: string[] = [];
    let reconciled = 0;

    try {
      // Get all users from vault_settings
      const users = await subscriptionService.getAutoTradeUsers(42161);

      for (const userAddress of users) {
        for (const tokenAddress of [TOKENS.WETH, TOKENS.WBTC]) {
          try {
            // Check if vault has active position
            const position = await this.publicClient.readContract({
              address: this.vaultAddress,
              abi: VAULT_V7_ABI,
              functionName: 'getPosition',
              args: [userAddress as `0x${string}`, tokenAddress]
            }) as any;

            if (!position || !position.isActive) continue;

            // Check if GMX position is closed
            const gmxPosition = await this.publicClient.readContract({
              address: GMX_ADDRESSES.vault,
              abi: [{
                inputs: [
                  { name: '_account', type: 'address' },
                  { name: '_collateralToken', type: 'address' },
                  { name: '_indexToken', type: 'address' },
                  { name: '_isLong', type: 'bool' }
                ],
                name: 'getPosition',
                outputs: [
                  { name: 'size', type: 'uint256' },
                  { name: 'collateral', type: 'uint256' },
                  { name: 'averagePrice', type: 'uint256' },
                  { name: 'entryFundingRate', type: 'uint256' },
                  { name: 'reserveAmount', type: 'uint256' },
                  { name: 'realisedPnl', type: 'int256' },
                  { name: 'lastIncreasedTime', type: 'uint256' }
                ],
                stateMutability: 'view',
                type: 'function'
              }],
              functionName: 'getPosition',
              args: [this.vaultAddress, TOKENS.USDC, tokenAddress, position.isLong]
            }) as unknown as any[];

            const gmxSize = gmxPosition[0] as bigint;
            if (gmxSize > 0n) continue; // GMX still active

            // Found orphaned position - reconcile it
            logger.warn('Found orphaned position - reconciling', {
              user: userAddress.slice(0, 10),
              token: tokenAddress === TOKENS.WETH ? 'ETH' : 'BTC',
              collateral: formatUnits(position.collateral, 6)
            });

            const result = await this.reconcilePosition(userAddress as `0x${string}`, tokenAddress);
            if (result.success) {
              reconciled++;
            } else {
              errors.push(`${userAddress.slice(0, 10)}: ${result.error}`);
            }
          } catch (err: any) {
            // Ignore individual position errors
          }
        }
      }

      if (reconciled > 0) {
        logger.info(`Reconciled ${reconciled} orphaned positions`);
      }

      return { reconciled, errors };
    } catch (err: any) {
      logger.error('Failed to reconcile all positions', { error: err.message });
      return { reconciled, errors: [err.message] };
    }
  }

  /**
   * Check and execute SL/TP triggers
   * Monitors current price against stored SL/TP levels and closes position if triggered
   */
  async checkAndExecuteTriggers(
    userAddress: `0x${string}`,
    tokenAddress: `0x${string}`
  ): Promise<{
    triggered: boolean;
    reason?: string;
    pnl?: number;
    pnlPercent?: number;
    exitPrice?: number;
    exitAmount?: number;
    txHash?: string;
  }> {
    try {
      // Get position with SL/TP prices
      const position = await this.publicClient.readContract({
        address: this.vaultAddress,
        abi: VAULT_V7_ABI,
        functionName: 'getPosition',
        args: [userAddress, tokenAddress]
      }) as any;

      if (!position || !position.isActive) {
        return { triggered: false };
      }

      // V8.2: Update trailing stop level first (if trailing is enabled)
      if (position.trailingSlBps > 0n) {
        try {
          await this.walletClient.writeContract({
            address: this.vaultAddress,
            abi: VAULT_V7_ABI,
            functionName: 'updateTrailingStop',
            args: [userAddress, tokenAddress],
            chain: arbitrum,
            account: this.botAccount
          });

          // Re-read position to get updated stopLoss
          const updatedPosition = await this.publicClient.readContract({
            address: this.vaultAddress,
            abi: VAULT_V7_ABI,
            functionName: 'getPosition',
            args: [userAddress, tokenAddress]
          }) as any;

          // Use updated position data
          Object.assign(position, updatedPosition);
        } catch (trailingErr) {
          // Non-critical, continue with existing stopLoss
          logger.debug('Trailing stop update skipped', { user: userAddress.slice(0, 10) });
        }
      }

      // Get current price from GMX
      const [maxPrice, minPrice] = await this.publicClient.readContract({
        address: this.vaultAddress,
        abi: VAULT_V7_ABI,
        functionName: 'getPrice',
        args: [tokenAddress]
      }) as [bigint, bigint];

      // Use exit price based on position direction (LONG sells at min, SHORT buys at max)
      const currentPrice = position.isLong ? minPrice : maxPrice;
      const stopLoss = position.stopLoss as bigint;      // V8 field name
      const takeProfit = position.takeProfit as bigint;  // V8 field name

      // Skip if SL/TP not set (0 means not configured)
      if (stopLoss === 0n && takeProfit === 0n) {
        return { triggered: false };
      }

      let triggered = false;
      let reason = '';

      if (position.isLong) {
        // LONG: SL when price drops below SL level, TP when price rises above TP level
        if (stopLoss > 0n && currentPrice <= stopLoss) {
          triggered = true;
          reason = 'stop_loss';
          logger.info('🛑 STOP LOSS triggered (LONG)', {
            user: userAddress.slice(0, 10),
            currentPrice: Number(currentPrice) / 1e30,
            stopLoss: Number(stopLoss) / 1e30
          });
        } else if (takeProfit > 0n && currentPrice >= takeProfit) {
          triggered = true;
          reason = 'take_profit';
          logger.info('🎯 TAKE PROFIT triggered (LONG)', {
            user: userAddress.slice(0, 10),
            currentPrice: Number(currentPrice) / 1e30,
            takeProfit: Number(takeProfit) / 1e30
          });
        }
      } else {
        // SHORT: SL when price rises above SL level, TP when price drops below TP level
        if (stopLoss > 0n && currentPrice >= stopLoss) {
          triggered = true;
          reason = 'stop_loss';
          logger.info('🛑 STOP LOSS triggered (SHORT)', {
            user: userAddress.slice(0, 10),
            currentPrice: Number(currentPrice) / 1e30,
            stopLoss: Number(stopLoss) / 1e30
          });
        } else if (takeProfit > 0n && currentPrice <= takeProfit) {
          triggered = true;
          reason = 'take_profit';
          logger.info('🎯 TAKE PROFIT triggered (SHORT)', {
            user: userAddress.slice(0, 10),
            currentPrice: Number(currentPrice) / 1e30,
            takeProfit: Number(takeProfit) / 1e30
          });
        }
      }

      // If triggered, close the position
      if (triggered) {
        const closeResult = await this.closePosition(userAddress, tokenAddress, reason);
        if (closeResult.success) {
          // Return P/L data from the actual close
          return {
            triggered: true,
            reason,
            pnl: closeResult.pnl,
            pnlPercent: closeResult.pnlPercent,
            exitPrice: closeResult.exitPrice,
            exitAmount: closeResult.exitAmount,
            txHash: closeResult.txHash
          };
        } else {
          logger.error('Failed to close position after trigger', {
            user: userAddress.slice(0, 10),
            reason,
            error: closeResult.error
          });
          return { triggered: false };
        }
      }

      return { triggered: false };
    } catch (err: any) {
      // Log but don't fail - position might not exist
      logger.debug('Error checking triggers', { user: userAddress.slice(0, 10), error: err.message });
      return { triggered: false };
    }
  }

  /**
   * Get current PnL for a position
   */
  async getPositionPnL(
    userAddress: `0x${string}`,
    tokenAddress: `0x${string}`
  ): Promise<{ pnl: number; pnlPercent: number; currentPrice: number } | null> {
    try {
      // Check if position exists
      const position = await this.publicClient.readContract({
        address: this.vaultAddress,
        abi: VAULT_V7_ABI,
        functionName: 'getPosition',
        args: [userAddress, tokenAddress]
      }) as any;

      if (!position || !position.isActive) {
        return null;
      }

      // Get PnL from contract
      const [pnl, pnlPercent] = await this.publicClient.readContract({
        address: this.vaultAddress,
        abi: VAULT_V7_ABI,
        functionName: 'getPositionPnL',
        args: [userAddress, tokenAddress]
      }) as [bigint, bigint];

      // Get current price
      const [maxPrice, minPrice] = await this.publicClient.readContract({
        address: this.vaultAddress,
        abi: VAULT_V7_ABI,
        functionName: 'getPrice',
        args: [tokenAddress]
      }) as [bigint, bigint];

      const currentPrice = position.isLong ? minPrice : maxPrice;

      return {
        pnl: Number(pnl) / 1e6, // USDC decimals
        pnlPercent: Number(pnlPercent) / 100, // Convert basis points to percent
        currentPrice: Number(currentPrice) / 1e30 // GMX price decimals
      };
    } catch (err: any) {
      // Position doesn't exist or error
      return null;
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
        address: this.vaultAddress,
        abi: VAULT_V7_ABI,
        functionName: 'fees'  // V9: renamed from accumulatedFees
      });

      if (fees === 0n) {
        return { success: true, amount: '0' };
      }

      const txHash = await this.walletClient.writeContract({
        address: this.vaultAddress,
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

  /**
   * Get on-chain token balance for a user (for position reconciliation)
   * Note: In V8 GMX mode, this checks USDC balance in vault, not token balance
   */
  async getOnChainTokenBalance(
    chainId: number,
    walletAddress: `0x${string}`,
    tokenAddress: `0x${string}`
  ): Promise<bigint | null> {
    if (chainId !== 42161) return null; // Arbitrum only

    try {
      const status = await this.getUserVaultStatus(walletAddress);
      return status?.balance ?? null;
    } catch (err) {
      logger.error('Error getting on-chain balance', { walletAddress, error: err });
      return null;
    }
  }

  /**
   * Execute a pre-approved trade (user already approved, bypass checks)
   */
  async executeApprovedTrade(
    chainId: number,
    walletAddress: `0x${string}`,
    signal: {
      tokenAddress: string;
      tokenSymbol: string;
      direction: 'LONG' | 'SHORT';
      confidence: number;
      suggestedAmount: bigint;
      takeProfitPercent: number;
      trailingStopPercent: number;
    }
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    if (chainId !== 42161) {
      return { success: false, error: 'Only Arbitrum supported' };
    }

    // Note: In V8, trades are executed by the user directly on the frontend
    // This method is for bot-initiated trades (auto-trading mode)
    logger.info('executeApprovedTrade called', {
      wallet: walletAddress.slice(0, 10),
      direction: signal.direction,
      amount: formatUnits(signal.suggestedAmount, 6)
    });

    // For now, return success - actual execution happens via frontend
    // TODO: Implement direct trade execution if needed
    return {
      success: false,
      error: 'V8 trades are user-initiated via frontend'
    };
  }
}

// Export singleton (will need vault address set after deployment)
export const tradingV7GMXService = new TradingV7GMXService();

// Export token addresses
export const V7_TOKENS = TOKENS;
export const GMX_CONTRACTS = GMX_ADDRESSES;
