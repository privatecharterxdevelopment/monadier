import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
  parseEther,
  parseAbi,
  getAddress,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrum } from 'viem/chains';
import { config } from '../config';
import { logger } from '../utils/logger';
import { subscriptionService } from './subscription';
import { positionService } from './positions';
import {
  fetchGmxPerpPosition,
  getGmxMarkPrice,
  calculateGmxUnrealizedPnl,
  gmxPriceToNumber,
  gmxPnlToUsd,
  gmxPnlBpsToPercent,
} from './gmxMath';
import { gmxRequestTracker } from './gmxRequestTracker';

/**
 * GMX vault trading service (MonadierTradingVault V11 on Arbitrum).
 *
 * File name `tradingV7GMX` is legacy — all calls use config.arbitrum.vaultAddress (V11).
 * GMX V1 perps via PositionRouter; settlement waits for keeper before finalizeClose.
 */

// GMX Contract Addresses on Arbitrum
const GMX_ADDRESSES = {
  vault: '0x489ee077994B6658eAfA855C308275EAd8097C4A' as `0x${string}`,
  router: '0xaBBc5F99639c9B6bCb58544ddf04EFA6802F4064' as `0x${string}`,
  positionRouter: '0xb87a436B93fFE9D75c5cFA7bAcFff96430b09868' as `0x${string}`,
  orderBook: '0x09f77E8A13De9a35a7231028187e9fD5DB8a2ACB' as `0x${string}`,
};

// GMX keeper polling — wait for decrease execution before finalizeClose
const GMX_CLOSE_POLL_INTERVAL_MS = 3_000;
const GMX_CLOSE_TIMEOUT_MS = 120_000;
const GMX_OPEN_POLL_INTERVAL_MS = 3_000;
const GMX_OPEN_TIMEOUT_MS = 120_000;
const GMX_DECREASE_RETRY_ATTEMPTS = 3;
const GMX_DECREASE_RETRY_DELAY_MS = 2_000;

// Token Addresses
const TOKENS = {
  USDC: getAddress('0xaf88d065e77c8cC2239327C5EDb3A432268e5831'),
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
  {
    inputs: [],
    name: 'getHealthStatus',
    outputs: [
      { name: 'realBalance', type: 'uint256' },
      { name: 'totalValueLocked', type: 'uint256' },
      { name: 'isSolvent', type: 'bool' },
      { name: 'surplus', type: 'int256' }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'token', type: 'address' }
    ],
    name: 'reconcile',
    outputs: [],
    stateMutability: 'nonpayable',
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

const USDC_ERC20_ABI = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
]);

const GMX_POSITION_ABI = parseAbi([
  'function getPosition(address _account, address _collateralToken, address _indexToken, bool _isLong) view returns (uint256 size, uint256 collateral, uint256 averagePrice, uint256 entryFundingRate, uint256 reserveAmount, int256 realisedPnl, uint256 lastIncreasedTime)',
]);

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
  /** How P/L and received were derived */
  settlementSource?: 'vault_usdc_delta' | 'reconcile' | 'orphan_finalize';
  gmxExecuted?: boolean;
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

    logger.info('TradingGmxVaultService initialized (V11)', {
      gmxVault: GMX_ADDRESSES.vault,
      vaultAddress: this.vaultAddress,
      bot: this.botAccount.address,
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
      const vaultPosition = await this.publicClient.readContract({
        address: this.vaultAddress,
        abi: VAULT_V7_ABI,
        functionName: 'getPosition',
        args: [userAddress, tokenAddress]
      }) as any;

      if (!vaultPosition?.isActive) {
        return false;
      }

      const gmxSize = await this.getGmxPositionSize(tokenAddress, vaultPosition.isLong);
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

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async getVaultUsdcBalance(): Promise<bigint> {
    return this.publicClient.readContract({
      address: TOKENS.USDC,
      abi: USDC_ERC20_ABI,
      functionName: 'balanceOf',
      args: [this.vaultAddress],
    });
  }

  private async getVaultHealth(): Promise<{
    realBalance: bigint;
    tvl: bigint;
    isSolvent: boolean;
    surplus: bigint;
  }> {
    const [realBalance, tvl, isSolvent, surplus] = await this.publicClient.readContract({
      address: this.vaultAddress,
      abi: VAULT_V7_ABI,
      functionName: 'getHealthStatus',
    }) as [bigint, bigint, boolean, bigint];

    return { realBalance, tvl, isSolvent, surplus };
  }

  private async getGmxPositionSize(tokenAddress: `0x${string}`, isLong: boolean): Promise<bigint> {
    const gmxPosition = await this.publicClient.readContract({
      address: GMX_ADDRESSES.vault,
      abi: GMX_POSITION_ABI,
      functionName: 'getPosition',
      args: [this.vaultAddress, TOKENS.USDC, tokenAddress, isLong],
    });
    return gmxPosition[0];
  }

  /**
   * Poll until GMX perp size is zero (keeper executed decrease).
   */
  private async waitForGmxClose(
    tokenAddress: `0x${string}`,
    isLong: boolean,
    timeoutMs = GMX_CLOSE_TIMEOUT_MS
  ): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const size = await this.getGmxPositionSize(tokenAddress, isLong);
      if (size === 0n) {
        return true;
      }
      await this.sleep(GMX_CLOSE_POLL_INTERVAL_MS);
    }
    return false;
  }

  /**
   * Poll until GMX perp size is non-zero (keeper executed increase).
   */
  private async waitForGmxOpen(
    tokenAddress: `0x${string}`,
    isLong: boolean,
    timeoutMs = GMX_OPEN_TIMEOUT_MS
  ): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const size = await this.getGmxPositionSize(tokenAddress, isLong);
      if (size > 0n) {
        return true;
      }
      await this.sleep(GMX_OPEN_POLL_INTERVAL_MS);
    }
    return false;
  }

  /**
   * USDC returned to vault from GMX close (measured between decrease submit and settlement).
   */
  private computeReceivedFromBalanceDelta(
    balanceBefore: bigint,
    balanceAfter: bigint,
    collateral: bigint
  ): bigint {
    const delta = balanceAfter > balanceBefore ? balanceAfter - balanceBefore : 0n;
    if (delta === 0n) {
      return collateral;
    }
    const maxReasonable = collateral * 3n;
    if (delta > maxReasonable) {
      logger.warn('USDC delta exceeds sanity cap — capping received', {
        delta: formatUnits(delta, 6),
        cap: formatUnits(maxReasonable, 6),
      });
      return maxReasonable;
    }
    return delta;
  }

  /**
   * Cap finalizeClose `received` so we never credit more USDC than is actually in the vault.
   */
  private async computeMaxSettleableReceived(collateral: bigint): Promise<bigint> {
    const { realBalance, tvl, surplus } = await this.getVaultHealth();
    if (surplus <= 0n) {
      return collateral;
    }
    const fromSurplus = collateral + surplus;
    const maxFromBalance = realBalance > tvl ? realBalance - tvl + collateral : collateral;
    const capped = fromSurplus < maxFromBalance ? fromSurplus : maxFromBalance;
    return capped > collateral ? capped : collateral;
  }

  private async syncTrailingStop(
    userAddress: `0x${string}`,
    tokenAddress: `0x${string}`
  ): Promise<void> {
    try {
      await this.walletClient.writeContract({
        address: this.vaultAddress,
        abi: VAULT_V7_ABI,
        functionName: 'updateTrailingStop',
        args: [userAddress, tokenAddress],
        chain: arbitrum,
        account: this.botAccount,
      });
    } catch (err: any) {
      logger.debug('updateTrailingStop skipped', { reason: err.message?.slice(0, 80) });
    }
  }

  /**
   * Submit GMX decrease via vault keeperClosePosition (requires on-chain SL/TP hit).
   */
  private async requestGmxDecrease(
    userAddress: `0x${string}`,
    tokenAddress: `0x${string}`
  ): Promise<{ submitted: boolean; txHash?: string; error?: string }> {
    try {
      const executionFee = await this.getExecutionFee();
      const closeHash = await this.walletClient.writeContract({
        address: this.vaultAddress,
        abi: VAULT_V7_ABI,
        functionName: 'closePosition',
        args: [userAddress, tokenAddress],
        value: executionFee,
        chain: arbitrum,
        account: this.botAccount,
      });
      const receipt = await this.publicClient.waitForTransactionReceipt({ hash: closeHash });
      if (receipt.status !== 'success') {
        return { submitted: false, error: 'Decrease transaction reverted' };
      }
      return { submitted: true, txHash: closeHash };
    } catch (err: any) {
      return { submitted: false, error: err.message };
    }
  }

  /**
   * GMX already flat but vault position still active — settle from vault USDC accounting.
   */
  private async settleAfterGmxAlreadyClosed(
    userAddress: `0x${string}`,
    tokenAddress: `0x${string}`,
    closeReason: string,
    collateral: bigint,
    isLong: boolean
  ): Promise<V7TradeResult> {
    logger.info('Settling orphan — GMX already closed', {
      user: userAddress.slice(0, 10),
      token: tokenAddress.slice(0, 10),
      reason: closeReason,
    });

    const health = await this.getVaultHealth();
    if (health.surplus <= 0n) {
      logger.warn('Vault deficit — using reconcile() (collateral only)', {
        surplus: formatUnits(health.surplus, 6),
      });
      const reconciled = await this.reconcilePosition(userAddress, tokenAddress);
      if (!reconciled.success) {
        return { success: false, error: reconciled.error };
      }
      return {
        success: true,
        txHash: reconciled.txHash,
        pnl: 0,
        pnlPercent: 0,
        exitAmount: reconciled.creditedAmount,
        settlementSource: 'reconcile',
        gmxExecuted: true,
      };
    }

    const receivedAmount = await this.computeMaxSettleableReceived(collateral);
    return this.finalizePositionClose(
      userAddress,
      tokenAddress,
      closeReason,
      collateral,
      isLong,
      receivedAmount,
      false,
      'orphan_finalize'
    );
  }

  /**
   * Credit user via finalizeClose after GMX settlement — never call before GMX size is 0.
   */
  private async finalizePositionClose(
    userAddress: `0x${string}`,
    tokenAddress: `0x${string}`,
    closeReason: string,
    collateral: bigint,
    isLong: boolean,
    receivedAmount: bigint,
    gmxDecreaseSubmitted: boolean,
    settlementSource: V7TradeResult['settlementSource'] = 'vault_usdc_delta'
  ): Promise<V7TradeResult> {
    const [maxPrice, minPrice] = await this.publicClient.readContract({
      address: this.vaultAddress,
      abi: VAULT_V7_ABI,
      functionName: 'getPrice',
      args: [tokenAddress],
    }) as [bigint, bigint];
    const currentPrice = isLong ? minPrice : maxPrice;

    const gmxAtClose = await fetchGmxPerpPosition(tokenAddress, isLong);
    if (gmxAtClose && gmxAtClose.size > 0n) {
      logger.warn('finalizeClose while GMX size still > 0 — aborting', {
        user: userAddress.slice(0, 10),
        gmxSize: gmxAtClose.size.toString(),
      });
      return { success: false, error: 'GMX position still open — cannot finalizeClose yet' };
    }

    logger.info('finalizeClose with settlement-based received', {
      user: userAddress.slice(0, 10),
      received: formatUnits(receivedAmount, 6),
      collateral: formatUnits(collateral, 6),
      gmxDecreaseSubmitted,
      settlementSource,
    });

    const txHash = await this.walletClient.writeContract({
      address: this.vaultAddress,
      abi: VAULT_V7_ABI,
      functionName: 'finalizeClose',
      args: [userAddress, tokenAddress, receivedAmount, closeReason],
      chain: arbitrum,
      account: this.botAccount,
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== 'success') {
      return { success: false, error: 'FinalizeClose transaction reverted' };
    }

    const pnlRaw = receivedAmount > collateral ? receivedAmount - collateral : 0n;
    const loss = receivedAmount < collateral ? collateral - receivedAmount : 0n;
    const pnlSigned = receivedAmount >= collateral ? pnlRaw : -loss;
    const pnlUSD = Number(pnlSigned) / 1e6;
    const pnlPercent =
      collateral > 0n ? (Number(pnlSigned) / Number(collateral)) * 100 : 0;

    logger.info('Position settled on-chain', {
      txHash,
      user: userAddress.slice(0, 10),
      reason: closeReason,
      pnlUSD: pnlUSD.toFixed(2),
      exitAmount: formatUnits(receivedAmount, 6),
    });

    return {
      success: true,
      txHash,
      pnl: pnlUSD,
      pnlPercent,
      exitPrice: Number(currentPrice) / 1e30,
      exitAmount: Number(receivedAmount) / 1e6,
      settlementSource,
      gmxExecuted: true,
    };
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

      const isLong = signal.direction === 'LONG';
      const onChainPosition = await this.publicClient.readContract({
        address: this.vaultAddress,
        abi: VAULT_V7_ABI,
        functionName: 'getPosition',
        args: [userAddress, signal.tokenAddress],
      }) as any;

      const ZERO_REQUEST_KEY =
        '0x0000000000000000000000000000000000000000000000000000000000000000';
      const requestKeyRaw = onChainPosition?.requestKey as string | undefined;
      const requestKey =
        requestKeyRaw && requestKeyRaw !== ZERO_REQUEST_KEY ? requestKeyRaw : undefined;

      const trackerId = await gmxRequestTracker.recordSubmitted({
        walletAddress: userAddress,
        tokenAddress: signal.tokenAddress,
        requestType: 'increase',
        requestKey,
        direction: signal.direction,
        submitTxHash: txHash,
        vaultCollateral: onChainPosition?.collateral as bigint | undefined,
      });

      const gmxOpened = await this.waitForGmxOpen(signal.tokenAddress, isLong);
      if (!gmxOpened) {
        await gmxRequestTracker.markTimeout(
          trackerId,
          'GMX keeper did not execute increase within timeout'
        );
        return {
          success: false,
          error: 'GMX keeper did not open position within timeout — DB row not created',
          txHash,
          requestKey,
        };
      }

      const gmxPos = await fetchGmxPerpPosition(signal.tokenAddress, isLong);
      if (gmxPos && trackerId) {
        await gmxRequestTracker.markGmxExecuted(trackerId, {
          size: gmxPos.size,
          averagePrice: gmxPos.averagePrice,
          collateral: gmxPos.collateral,
        });
      }

      const entryPrice =
        gmxPos && gmxPos.averagePrice > 0n
          ? gmxPriceToNumber(gmxPos.averagePrice)
          : price?.max || 0;
      const entryAmount = parseFloat(
        formatUnits(
          gmxPos?.collateral ?? onChainPosition?.collateral ?? signal.collateralAmount,
          6
        )
      );

      const position = await positionService.openPosition({
        walletAddress: userAddress,
        chainId: 42161,
        tokenAddress: signal.tokenAddress,
        tokenSymbol: signal.tokenSymbol,
        direction: signal.direction,
        entryPrice,
        entryAmount,
        tokenAmount: 0,
        txHash,
        trailingStopPercent: signal.stopLossPercent,
        takeProfitPercent: signal.takeProfitPercent,
        isLeveraged: true,
        leverageMultiplier: signal.leverage,
        collateralAmount: entryAmount,
        borrowedAmount: 0,
      });

      await subscriptionService.recordTrade(userAddress);

      logger.info('GMX position opened (keeper executed)', {
        txHash,
        positionId: position?.id,
        user: userAddress.slice(0, 10),
        token: signal.tokenSymbol,
        entryPrice,
        entryAmount,
        gmxSize: gmxPos?.size.toString(),
      });

      return {
        success: true,
        txHash,
        requestKey,
        gmxExecuted: true,
        collateral: formatUnits(gmxPos?.collateral ?? signal.collateralAmount, 6),
        leverage: signal.leverage,
      };
    } catch (err: any) {
      logger.error('Failed to open GMX position', { error: err.message });
      return { success: false, error: err.message };
    }
  }

  /**
   * Close a position: submit GMX decrease, wait for keeper execution, then finalizeClose
   * using measured vault USDC — never finalize with estimated getPositionPnL.
   */
  async closePosition(
    userAddress: `0x${string}`,
    tokenAddress: `0x${string}`,
    closeReason: string
  ): Promise<V7TradeResult> {
    try {
      logger.info('Closing position (settlement-based)', {
        user: userAddress.slice(0, 10),
        token: tokenAddress.slice(0, 10),
        reason: closeReason,
      });

      const position = await this.publicClient.readContract({
        address: this.vaultAddress,
        abi: VAULT_V7_ABI,
        functionName: 'getPosition',
        args: [userAddress, tokenAddress],
      }) as any;

      if (!position?.isActive) {
        return { success: false, error: 'No active position' };
      }

      const collateral = position.collateral as bigint;
      const isLong = position.isLong as boolean;

      const trackerId = await gmxRequestTracker.recordSubmitted({
        walletAddress: userAddress,
        tokenAddress,
        requestType: 'decrease',
        direction: isLong ? 'LONG' : 'SHORT',
        vaultCollateral: collateral,
      });

      if (await this.isGMXPositionClosed(userAddress, tokenAddress)) {
        if (trackerId) {
          await gmxRequestTracker.markGmxExecuted(trackerId, {
            size: 0n,
            averagePrice: 0n,
            collateral: 0n,
          });
        }
        const orphanResult = await this.settleAfterGmxAlreadyClosed(
          userAddress,
          tokenAddress,
          closeReason,
          collateral,
          isLong
        );
        if (orphanResult.success && trackerId) {
          await gmxRequestTracker.markVaultFinalized(trackerId, {
            finalizeTxHash: orphanResult.txHash,
            receivedAmount: orphanResult.exitAmount
              ? BigInt(Math.round(orphanResult.exitAmount * 1e6))
              : undefined,
            pnlUsdc: orphanResult.pnl
              ? BigInt(Math.round(orphanResult.pnl * 1e6))
              : undefined,
          });
        } else if (!orphanResult.success) {
          await gmxRequestTracker.markFailed(trackerId, orphanResult.error ?? 'orphan settle failed');
        }
        return orphanResult;
      }

      const balanceBefore = await this.getVaultUsdcBalance();
      await this.syncTrailingStop(userAddress, tokenAddress);

      let gmxDecreaseSubmitted = false;
      for (let attempt = 1; attempt <= GMX_DECREASE_RETRY_ATTEMPTS; attempt++) {
        const decrease = await this.requestGmxDecrease(userAddress, tokenAddress);
        if (decrease.submitted) {
          gmxDecreaseSubmitted = true;
          logger.info('GMX decrease submitted', {
            user: userAddress.slice(0, 10),
            txHash: decrease.txHash,
            attempt,
          });
          break;
        }
        logger.warn('GMX decrease not submitted (keeper SL/TP)', {
          user: userAddress.slice(0, 10),
          attempt,
          error: decrease.error?.slice(0, 120),
        });
        if (attempt < GMX_DECREASE_RETRY_ATTEMPTS) {
          await this.sleep(GMX_DECREASE_RETRY_DELAY_MS);
          await this.syncTrailingStop(userAddress, tokenAddress);
        }
      }

      const gmxSettled = await this.waitForGmxClose(tokenAddress, isLong);
      if (!gmxSettled) {
        await gmxRequestTracker.markTimeout(
          trackerId,
          'GMX keeper did not close position within timeout'
        );
        return {
          success: false,
          error: 'GMX keeper did not close position within timeout — finalizeClose skipped',
        };
      }

      const gmxAfterClose = await fetchGmxPerpPosition(tokenAddress, isLong);
      if (trackerId && gmxAfterClose) {
        await gmxRequestTracker.markGmxExecuted(trackerId, {
          size: gmxAfterClose.size,
          averagePrice: gmxAfterClose.averagePrice,
          collateral: gmxAfterClose.collateral,
        });
      }

      const balanceAfter = await this.getVaultUsdcBalance();
      let receivedAmount = this.computeReceivedFromBalanceDelta(
        balanceBefore,
        balanceAfter,
        collateral
      );

      const maxSettleable = await this.computeMaxSettleableReceived(collateral);
      if (receivedAmount > maxSettleable) {
        logger.warn('Capping received to vault settleable amount', {
          received: formatUnits(receivedAmount, 6),
          maxSettleable: formatUnits(maxSettleable, 6),
        });
        receivedAmount = maxSettleable;
      }

      const settled = await this.finalizePositionClose(
        userAddress,
        tokenAddress,
        closeReason,
        collateral,
        isLong,
        receivedAmount,
        gmxDecreaseSubmitted,
        'vault_usdc_delta'
      );

      if (settled.success && trackerId) {
        await gmxRequestTracker.markVaultFinalized(trackerId, {
          finalizeTxHash: settled.txHash,
          usdcDelta: balanceAfter > balanceBefore ? balanceAfter - balanceBefore : 0n,
          receivedAmount,
          pnlUsdc: settled.pnl != null ? BigInt(Math.round(settled.pnl * 1e6)) : undefined,
        });
      } else if (!settled.success) {
        await gmxRequestTracker.markFailed(trackerId, settled.error ?? 'finalize failed');
      }

      return settled;
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

      const gmxSize = await this.getGmxPositionSize(tokenAddress, position.isLong);
      if (gmxSize > 0n) {
        return { success: false, error: 'GMX position still active - cannot reconcile yet' };
      }

      logger.info('Reconciling orphaned position', {
        user: userAddress.slice(0, 10),
        token: tokenAddress.slice(0, 10),
        collateral: formatUnits(position.collateral, 6)
      });

      const txHash = await this.walletClient.writeContract({
        address: this.vaultAddress,
        abi: VAULT_V7_ABI,
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
      const position = await this.publicClient.readContract({
        address: this.vaultAddress,
        abi: VAULT_V7_ABI,
        functionName: 'getPosition',
        args: [userAddress, tokenAddress],
      }) as any;

      if (!position || !position.isActive) {
        return null;
      }

      const isLong = position.isLong as boolean;
      const gmxPos = await fetchGmxPerpPosition(tokenAddress, isLong);
      if (!gmxPos || gmxPos.size === 0n) {
        return { pnl: 0, pnlPercent: 0, currentPrice: 0 };
      }

      const markPrice = await getGmxMarkPrice(tokenAddress, isLong);
      const unrealized = calculateGmxUnrealizedPnl(gmxPos, markPrice);

      return {
        pnl: gmxPnlToUsd(unrealized.pnl),
        pnlPercent: gmxPnlBpsToPercent(unrealized.pnlPercentBps),
        currentPrice: gmxPriceToNumber(markPrice),
      };
    } catch (err: any) {
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

/** Preferred name — same singleton, V11 vault. */
export const tradingGmxVaultService = tradingV7GMXService;

// Export token addresses
export const V7_TOKENS = TOKENS;
export const GMX_TOKENS = TOKENS;
export const GMX_CONTRACTS = GMX_ADDRESSES;
