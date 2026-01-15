// Vault Integration for MonadierTradingVault Smart Contract
import { parseUnits, formatUnits, type PublicClient, type WalletClient } from 'viem';
import { arbitrum } from 'viem/chains';

// Vault ABI (core functions only)
export const VAULT_ABI = [
  // Deposit/Withdraw
  {
    inputs: [{ name: 'amount', type: 'uint256' }],
    name: 'deposit',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  // V3: Deposit ETH and auto-swap to USDC
  {
    inputs: [{ name: 'minUsdcOut', type: 'uint256' }],
    name: 'depositETH',
    outputs: [],
    stateMutability: 'payable',
    type: 'function'
  },
  {
    inputs: [{ name: 'amount', type: 'uint256' }],
    name: 'withdraw',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [],
    name: 'withdrawAll',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  // V3: Emergency close position (user can close without bot)
  {
    inputs: [{ name: 'token', type: 'address' }],
    name: 'emergencyClosePosition',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  // V3: Get user positions
  {
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'tokens', type: 'address[]' }
    ],
    name: 'getUserPositions',
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
    stateMutability: 'view',
    type: 'function'
  },
  // V3: Get token balance
  {
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'token', type: 'address' }
    ],
    name: 'getTokenBalance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  // Auto-trade
  {
    inputs: [{ name: 'enabled', type: 'bool' }],
    name: 'setAutoTrade',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [],
    name: 'emergencyStopAutoTrade',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  // Risk level
  {
    inputs: [{ name: 'riskLevelBps', type: 'uint256' }],
    name: 'setRiskLevel',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  // View functions
  {
    inputs: [{ name: 'user', type: 'address' }],
    name: 'getBalance',
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
    inputs: [{ name: 'user', type: 'address' }],
    name: 'getRiskLevelPercent',
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
    name: 'getMaxTradeSize',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'user', type: 'address' }],
    name: 'timeUntilNextTrade',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'user', type: 'address' }],
    name: 'getUserStatus',
    outputs: [
      { name: 'balance', type: 'uint256' },
      { name: 'autoTradeOn', type: 'bool' },
      { name: 'riskLevelBps', type: 'uint256' },
      { name: 'maxTrade', type: 'uint256' },
      { name: 'timeToNextTrade', type: 'uint256' },
      { name: 'canTrade', type: 'bool' }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'getVaultStats',
    outputs: [
      { name: 'tvl', type: 'uint256' },
      { name: 'totalFees', type: 'uint256' },
      { name: 'isPaused', type: 'bool' },
      { name: 'pauseTimeRemaining', type: 'uint256' }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      { name: 'tokenOut', type: 'address' },
      { name: 'amountIn', type: 'uint256' },
      { name: 'useWrappedPath', type: 'bool' }
    ],
    name: 'getExpectedOutput',
    outputs: [
      { name: 'expectedOut', type: 'uint256' },
      { name: 'fee', type: 'uint256' }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  // Constants
  {
    inputs: [],
    name: 'USDC',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'TREASURY_ADDRESS',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'CHAIN_ID',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'BASE_CHAIN_ID',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'BASE_CHAIN_FEE',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'OTHER_CHAIN_FEE',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'getPlatformFee',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'getPlatformFeePercent',
    outputs: [
      { name: 'whole', type: 'uint256' },
      { name: 'decimal', type: 'uint256' }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'MAX_RISK_LEVEL',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'totalValueLocked',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const;

// V8 ABI - User Control + Trailing Stop + On-chain Position Reading
export const VAULT_V8_ABI = [
  // User close position (V8.2)
  {
    inputs: [{ name: 'token', type: 'address' }],
    name: 'userClosePosition',
    outputs: [],
    stateMutability: 'payable',
    type: 'function'
  },
  // Cancel auto-features (V8.2)
  {
    inputs: [{ name: 'token', type: 'address' }],
    name: 'cancelAutoFeatures',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  // Get position from chain (V8)
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
        { name: 'stopLoss', type: 'uint256' },
        { name: 'takeProfit', type: 'uint256' },
        { name: 'timestamp', type: 'uint256' },
        { name: 'requestKey', type: 'bytes32' },
        { name: 'highestPrice', type: 'uint256' },
        { name: 'lowestPrice', type: 'uint256' },
        { name: 'trailingSlBps', type: 'uint256' },
        { name: 'trailingActivated', type: 'bool' },
        { name: 'autoFeaturesEnabled', type: 'bool' }
      ],
      name: '',
      type: 'tuple'
    }],
    stateMutability: 'view',
    type: 'function'
  },
  // Get trailing stop info (V8.2)
  {
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'token', type: 'address' }
    ],
    name: 'getTrailingStopInfo',
    outputs: [
      { name: 'hasTrailingStop', type: 'bool' },
      { name: 'isActivated', type: 'bool' },
      { name: 'trailingBps', type: 'uint256' },
      { name: 'trackedPrice', type: 'uint256' },
      { name: 'currentStopLoss', type: 'uint256' }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  // Get execution fee
  {
    inputs: [],
    name: 'getExecutionFee',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  // Get withdrawable amount (V8.1)
  {
    inputs: [{ name: 'user', type: 'address' }],
    name: 'getWithdrawable',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  // Get health status (V8.1)
  {
    inputs: [],
    name: 'getHealthStatus',
    outputs: [
      { name: 'realBalance', type: 'uint256' },
      { name: 'totalValueLocked', type: 'uint256' },
      { name: 'accumulatedFees', type: 'uint256' },
      { name: 'isSolvent', type: 'bool' },
      { name: 'surplus', type: 'int256' }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  // User balance
  {
    inputs: [{ name: 'user', type: 'address' }],
    name: 'balances',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  // Settings
  {
    inputs: [{ name: 'user', type: 'address' }],
    name: 'getSettings',
    outputs: [{
      components: [
        { name: 'autoTradeEnabled', type: 'bool' },
        { name: 'riskBps', type: 'uint256' },
        { name: 'maxLeverage', type: 'uint256' },
        { name: 'stopLossBps', type: 'uint256' },
        { name: 'takeProfitBps', type: 'uint256' }
      ],
      name: '',
      type: 'tuple'
    }],
    stateMutability: 'view',
    type: 'function'
  },
  // Deposit
  {
    inputs: [{ name: 'amount', type: 'uint256' }],
    name: 'deposit',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  // Withdraw
  {
    inputs: [{ name: 'amount', type: 'uint256' }],
    name: 'withdraw',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  // Set auto trade
  {
    inputs: [{ name: 'enabled', type: 'bool' }],
    name: 'setAutoTrade',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  // Set settings
  {
    inputs: [
      { name: 'riskBps', type: 'uint256' },
      { name: 'maxLeverage', type: 'uint256' },
      { name: 'stopLossBps', type: 'uint256' },
      { name: 'takeProfitBps', type: 'uint256' }
    ],
    name: 'setSettings',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  }
] as const;

// GMX Vault interface for price fetching
export const GMX_VAULT_ABI = [
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

// GMX Vault address for price fetching
export const GMX_VAULT_ADDRESS = '0x489ee077994B6658eAfA855C308275EAd8097C4A' as const;

// Token addresses
export const TOKEN_ADDRESSES = {
  WETH: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1' as const,
  WBTC: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f' as const,
  USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as const,
};

// On-chain position interface
export interface OnChainPosition {
  isActive: boolean;
  isLong: boolean;
  token: string;
  collateral: bigint;
  size: bigint;
  leverage: bigint;
  entryPrice: bigint;
  stopLoss: bigint;
  takeProfit: bigint;
  timestamp: bigint;
  requestKey: string;
  highestPrice: bigint;
  lowestPrice: bigint;
  trailingSlBps: bigint;
  trailingActivated: boolean;
  autoFeaturesEnabled: boolean;
}

// ERC20 ABI for USDC approval
export const ERC20_APPROVE_ABI = [
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' }
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const;

// ============================================
// V9 VAULT - BULLETPROOF EDITION
// GMX Perpetuals, userInstantClose, emergencyWithdraw, reconcile
// ============================================
export const VAULT_ADDRESS: `0x${string}` = '0x6c8ec04889c63ed696f13Bc3B9B74d69354A4fFB';
export const VAULT_CHAIN_ID = 42161; // Arbitrum Only

// USDC addresses - Arbitrum only
export const USDC_ADDRESSES: Record<number, `0x${string}`> = {
  42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',  // Arbitrum (Native USDC)
};

// USDC decimals (6 for all chains)
export const USDC_DECIMALS = 6;

// Platform fee structure - V8 GMX
// 0.1% base fee on TOTAL position (collateral × leverage) + 10% success fee
export const PLATFORM_FEES = {
  BASE_FEE_BPS: 10,       // 0.1% base fee on TOTAL position
  SUCCESS_FEE_BPS: 1000,  // 10% of profit
  MAX_LEVERAGE: 25,       // Standard users: 1x-25x
  MAX_LEVERAGE_ELITE: 50, // Elite users: 1x-50x
} as const;

/**
 * Get platform fee for V8 GMX Vault
 */
export function getPlatformFee(): {
  bps: number;
  percent: number;
  percentFormatted: string;
  successFeeBps: number;
  successFeePercent: number;
  maxLeverage: number;
  maxLeverageElite: number;
} {
  return {
    bps: PLATFORM_FEES.BASE_FEE_BPS,
    percent: PLATFORM_FEES.BASE_FEE_BPS / 100,
    percentFormatted: '0.1% on position + 10% profit',
    successFeeBps: PLATFORM_FEES.SUCCESS_FEE_BPS,
    successFeePercent: 10,
    maxLeverage: PLATFORM_FEES.MAX_LEVERAGE,
    maxLeverageElite: PLATFORM_FEES.MAX_LEVERAGE_ELITE
  };
}

// Risk level presets
export const RISK_PRESETS = {
  conservative: { bps: 100, percent: 1, label: 'Conservative (1%)' },
  low: { bps: 500, percent: 5, label: 'Low (5%)' },
  medium: { bps: 1500, percent: 15, label: 'Medium (15%)' },
  high: { bps: 3000, percent: 30, label: 'High (30%)' },
  maximum: { bps: 10000, percent: 100, label: 'All-In (100%)' },
} as const;

export interface VaultUserStatus {
  balance: bigint;
  balanceFormatted: string;
  autoTradeEnabled: boolean;
  riskLevelBps: number;
  riskLevelPercent: number;
  maxTradeSize: bigint;
  maxTradeSizeFormatted: string;
  timeToNextTrade: number;
  canTrade: boolean;
}

export interface VaultStats {
  tvl: bigint;
  tvlFormatted: string;
  totalFees: bigint;
  totalFeesFormatted: string;
  isPaused: boolean;
  pauseTimeRemaining: number;
}

/**
 * Vault client for interacting with V8 GMX Vault
 */
export class VaultClient {
  private publicClient: PublicClient;
  private walletClient: WalletClient;
  private chainId: number;
  private vaultAddress: `0x${string}`;
  private usdcAddress: `0x${string}`;

  constructor(
    publicClient: PublicClient,
    walletClient: WalletClient,
    chainId: number
  ) {
    this.publicClient = publicClient;
    this.walletClient = walletClient;
    this.chainId = chainId;

    // V8 Only - Arbitrum
    if (chainId !== VAULT_CHAIN_ID) {
      throw new Error(`Vault only available on Arbitrum (chain ${VAULT_CHAIN_ID})`);
    }
    this.vaultAddress = VAULT_ADDRESS;
    this.usdcAddress = USDC_ADDRESSES[VAULT_CHAIN_ID];
  }

  /**
   * Check if vault is available on this chain
   */
  static isAvailable(chainId: number): boolean {
    return chainId === VAULT_CHAIN_ID;
  }

  /**
   * Deposit USDC to vault
   */
  async deposit(amount: string, userAddress: `0x${string}`): Promise<`0x${string}`> {
    const amountWei = parseUnits(amount, USDC_DECIMALS);

    // First check/set approval
    const allowance = await this.publicClient.readContract({
      address: this.usdcAddress,
      abi: ERC20_APPROVE_ABI,
      functionName: 'allowance',
      args: [userAddress, this.vaultAddress]
    });

    if (allowance < amountWei) {
      // Approve exact amount
      const approveTx = await this.walletClient.writeContract({
        address: this.usdcAddress,
        abi: ERC20_APPROVE_ABI,
        functionName: 'approve',
        args: [this.vaultAddress, amountWei],
        chain: arbitrum,
        account: userAddress
      });

      // Wait for approval
      await this.publicClient.waitForTransactionReceipt({ hash: approveTx });
    }

    // Deposit to vault
    const hash = await this.walletClient.writeContract({
      address: this.vaultAddress,
      abi: VAULT_ABI,
      functionName: 'deposit',
      args: [amountWei],
      chain: arbitrum,
      account: userAddress
    });

    return hash;
  }

  /**
   * Deposit ETH to vault (auto-swaps to USDC)
   * @param ethAmount ETH amount in ether units (e.g., "0.01" for 0.01 ETH)
   * @param minUsdcOut Minimum USDC to receive (slippage protection) in USDC units
   * @param userAddress User's wallet address
   */
  async depositETH(ethAmount: string, minUsdcOut: string, userAddress: `0x${string}`): Promise<`0x${string}`> {
    const ethWei = parseUnits(ethAmount, 18); // ETH has 18 decimals
    const minUsdcWei = parseUnits(minUsdcOut, USDC_DECIMALS);

    const hash = await this.walletClient.writeContract({
      address: this.vaultAddress,
      abi: VAULT_ABI,
      functionName: 'depositETH',
      args: [minUsdcWei],
      chain: arbitrum,
      account: userAddress,
      value: ethWei,
      gas: 200000n // Higher gas for swap
    });

    return hash;
  }

  /**
   * Withdraw USDC from vault
   */
  async withdraw(amount: string, userAddress: `0x${string}`): Promise<`0x${string}`> {
    const amountWei = parseUnits(amount, USDC_DECIMALS);

    const hash = await this.walletClient.writeContract({
      address: this.vaultAddress,
      abi: VAULT_ABI,
      functionName: 'withdraw',
      args: [amountWei],
      chain: arbitrum,
      account: userAddress,
      gas: 150000n // Explicit gas limit to avoid estimation issues
    });

    return hash;
  }

  /**
   * Withdraw all funds from vault
   * V7 doesn't have withdrawAll(), so we get balance and call withdraw(balance)
   */
  async withdrawAll(userAddress: `0x${string}`): Promise<`0x${string}`> {
    // Get current balance first
    const balance = await this.getBalance(userAddress);
    const balanceWei = parseUnits(balance, USDC_DECIMALS);

    if (balanceWei === 0n) {
      throw new Error('No balance to withdraw');
    }

    // Call withdraw with full balance (works for V7 and older vaults)
    const hash = await this.walletClient.writeContract({
      address: this.vaultAddress,
      abi: VAULT_ABI,
      functionName: 'withdraw',
      args: [balanceWei],
      chain: arbitrum,
      account: userAddress,
      gas: 200000n // Higher gas for safety
    });

    return hash;
  }

  /**
   * Enable/disable auto-trading (V7 compatible)
   */
  async setAutoTrade(enabled: boolean, userAddress: `0x${string}`): Promise<`0x${string}`> {
    const setAutoTradeAbi = [{
      inputs: [{ name: 'enabled', type: 'bool' }],
      name: 'setAutoTrade',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function'
    }] as const;

    const hash = await this.walletClient.writeContract({
      address: this.vaultAddress,
      abi: setAutoTradeAbi,
      functionName: 'setAutoTrade',
      args: [enabled],
      chain: arbitrum,
      account: userAddress,
      gas: 100000n // Fixed gas limit to prevent crazy estimates
    });

    return hash;
  }

  /**
   * Emergency stop auto-trading (V7: just calls setAutoTrade(false))
   */
  async emergencyStop(userAddress: `0x${string}`): Promise<`0x${string}`> {
    return this.setAutoTrade(false, userAddress);
  }

  /**
   * Emergency close position - USER CAN CLOSE WITHOUT BOT (V3 only)
   * @param tokenAddress The token to sell back to USDC
   * @param userAddress User's wallet address
   */
  async emergencyClosePosition(tokenAddress: `0x${string}`, userAddress: `0x${string}`): Promise<`0x${string}`> {
    const hash = await this.walletClient.writeContract({
      address: this.vaultAddress,
      abi: VAULT_ABI,
      functionName: 'emergencyClosePosition',
      args: [tokenAddress],
      chain: arbitrum,
      account: userAddress,
      gas: 300000n // Higher gas for swap
    });

    return hash;
  }

  /**
   * Get user's token balance in vault
   */
  async getTokenBalance(userAddress: `0x${string}`, tokenAddress: `0x${string}`): Promise<bigint> {
    try {
      const balance = await this.publicClient.readContract({
        address: this.vaultAddress,
        abi: VAULT_ABI,
        functionName: 'getTokenBalance',
        args: [userAddress, tokenAddress]
      });
      return balance as bigint;
    } catch {
      return 0n;
    }
  }

  /**
   * Set all trading settings (V8 compatible)
   * V8 Contract: setSettings(riskBps, maxLeverage, stopLossBps, takeProfitBps)
   * Note: autoTrade is handled separately via setAutoTrade()
   */
  async setTradingSettings(
    userAddress: `0x${string}`,
    _autoTrade: boolean, // Ignored - use setAutoTrade() separately
    riskLevelPercent: number,
    maxLeverage: number = 10,
    stopLossPercent: number = 5,
    takeProfitPercent: number = 10
  ): Promise<`0x${string}`> {
    // V8 Contract: setSettings(riskBps, maxLeverage, stopLossBps, takeProfitBps)
    const setSettingsAbi = [{
      inputs: [
        { name: 'riskBps', type: 'uint256' },
        { name: 'maxLeverage', type: 'uint256' },
        { name: 'stopLossBps', type: 'uint256' },
        { name: 'takeProfitBps', type: 'uint256' }
      ],
      name: 'setSettings',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function'
    }] as const;

    const riskBps = BigInt(Math.round(riskLevelPercent * 100));
    const slBps = BigInt(Math.round(stopLossPercent * 100));
    const tpBps = BigInt(Math.round(takeProfitPercent * 100));

    const hash = await this.walletClient.writeContract({
      address: this.vaultAddress,
      abi: setSettingsAbi,
      functionName: 'setSettings',
      args: [riskBps, BigInt(maxLeverage), slBps, tpBps],
      chain: arbitrum,
      account: userAddress,
      gas: 100000n // Fixed gas limit
    });

    return hash;
  }

  /**
   * Set risk level (1-100%) - V8 uses setSettings()
   * V8 Contract: setSettings(riskBps, maxLeverage, stopLossBps, takeProfitBps)
   */
  async setRiskLevel(percent: number, userAddress: `0x${string}`): Promise<`0x${string}`> {
    if (percent < 1 || percent > 100) {
      throw new Error('Risk level must be between 1% and 100%');
    }

    const riskBps = percent * 100; // Convert percent to basis points (5% = 500 bps)

    // V8 Contract uses setSettings(riskBps, maxLeverage, stopLossBps, takeProfitBps)
    const setSettingsAbi = [{
      inputs: [
        { name: 'riskBps', type: 'uint256' },
        { name: 'maxLeverage', type: 'uint256' },
        { name: 'stopLossBps', type: 'uint256' },
        { name: 'takeProfitBps', type: 'uint256' }
      ],
      name: 'setSettings',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function'
    }] as const;

    const hash = await this.walletClient.writeContract({
      address: this.vaultAddress,
      abi: setSettingsAbi,
      functionName: 'setSettings',
      args: [BigInt(riskBps), 10n, 500n, 1000n], // risk, 10x leverage, 5% SL, 10% TP defaults
      chain: arbitrum,
      account: userAddress,
      gas: 100000n // Fixed gas limit
    });

    return hash;
  }

  /**
   * Get user's vault status (V8 compatible)
   * V8 has: balances mapping + getSettings(address) returning Settings struct
   */
  async getUserStatus(userAddress: `0x${string}`): Promise<VaultUserStatus> {
    // First get balance - this should always work
    let balance = 0n;
    try {
      balance = await this.publicClient.readContract({
        address: this.vaultAddress,
        abi: [{ inputs: [{ name: 'user', type: 'address' }], name: 'balances', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' }] as const,
        functionName: 'balances',
        args: [userAddress]
      });
    } catch (err) {
      console.error('Failed to read vault balance:', err);
    }

    // V8: Get settings via getSettings(address) which returns Settings struct
    let autoTradeEnabled = false;
    let riskLevelBps = 500; // Default 5%

    try {
      // V8 Contract: getSettings(address) returns (Settings memory)
      // Settings = { autoTradeEnabled, riskBps, maxLeverage, stopLossBps, takeProfitBps }
      const getSettingsAbi = [{
        inputs: [{ name: 'user', type: 'address' }],
        name: 'getSettings',
        outputs: [{
          components: [
            { name: 'autoTradeEnabled', type: 'bool' },
            { name: 'riskBps', type: 'uint256' },
            { name: 'maxLeverage', type: 'uint256' },
            { name: 'stopLossBps', type: 'uint256' },
            { name: 'takeProfitBps', type: 'uint256' }
          ],
          name: '',
          type: 'tuple'
        }],
        stateMutability: 'view',
        type: 'function'
      }] as const;

      const settings = await this.publicClient.readContract({
        address: this.vaultAddress,
        abi: getSettingsAbi,
        functionName: 'getSettings',
        args: [userAddress]
      }) as { autoTradeEnabled: boolean; riskBps: bigint; maxLeverage: bigint; stopLossBps: bigint; takeProfitBps: bigint };

      autoTradeEnabled = settings.autoTradeEnabled;
      if (settings.riskBps > 0n) {
        riskLevelBps = Number(settings.riskBps);
      }
    } catch (err) {
      console.error('Failed to read vault settings:', err);
      // Use defaults if getSettings fails
    }

    // Calculate max trade size locally: balance * riskLevel%
    const maxTrade = (balance * BigInt(riskLevelBps)) / BigInt(10000);

    return {
      balance,
      balanceFormatted: formatUnits(balance, USDC_DECIMALS),
      autoTradeEnabled,
      riskLevelBps,
      riskLevelPercent: riskLevelBps / 100,
      maxTradeSize: maxTrade,
      maxTradeSizeFormatted: formatUnits(maxTrade, USDC_DECIMALS),
      timeToNextTrade: 0,
      canTrade: true
    };
  }

  /**
   * Get vault statistics
   */
  async getVaultStats(): Promise<VaultStats> {
    const [tvl, totalFees, isPaused, pauseTimeRemaining] =
      await this.publicClient.readContract({
        address: this.vaultAddress,
        abi: VAULT_ABI,
        functionName: 'getVaultStats',
        args: []
      });

    return {
      tvl,
      tvlFormatted: formatUnits(tvl, USDC_DECIMALS),
      totalFees,
      totalFeesFormatted: formatUnits(totalFees, USDC_DECIMALS),
      isPaused,
      pauseTimeRemaining: Number(pauseTimeRemaining)
    };
  }

  /**
   * Get expected output for a trade
   */
  async getExpectedOutput(
    tokenOut: `0x${string}`,
    amountIn: string,
    useWrappedPath: boolean = true
  ): Promise<{ expectedOut: bigint; fee: bigint }> {
    const amountWei = parseUnits(amountIn, USDC_DECIMALS);

    const [expectedOut, fee] = await this.publicClient.readContract({
      address: this.vaultAddress,
      abi: VAULT_ABI,
      functionName: 'getExpectedOutput',
      args: [tokenOut, amountWei, useWrappedPath]
    });

    return { expectedOut, fee };
  }

  /**
   * Get platform fee from contract
   * @returns Fee in basis points and formatted percentage
   */
  async getPlatformFee(): Promise<{
    bps: number;
    percent: number;
    percentFormatted: string;
    isArbitrum: boolean;
  }> {
    const feeBps = await this.publicClient.readContract({
      address: this.vaultAddress,
      abi: VAULT_ABI,
      functionName: 'getPlatformFee',
      args: []
    });

    const bps = Number(feeBps);
    const percent = bps / 100;
    const isArbitrum = this.chainId === PLATFORM_FEES.ARBITRUM_CHAIN_ID;

    return {
      bps,
      percent,
      percentFormatted: `${percent.toFixed(1)}%`,
      isArbitrum
    };
  }

  /**
   * Get platform fee without contract call (uses local constants)
   */
  getPlatformFeeLocal(): {
    bps: number;
    percent: number;
    percentFormatted: string;
    isArbitrum: boolean;
  } {
    return {
      ...getPlatformFee(),
      isArbitrum: this.chainId === PLATFORM_FEES.ARBITRUM_CHAIN_ID
    };
  }
}

/**
 * Create a VaultClient instance
 */
export function createVaultClient(
  publicClient: PublicClient,
  walletClient: WalletClient,
  chainId: number
): VaultClient | null {
  if (!VaultClient.isAvailable(chainId)) {
    return null;
  }
  return new VaultClient(publicClient, walletClient, chainId);
}

// ============ V8 ON-CHAIN POSITION HELPERS ============

/**
 * Get positions directly from V8 contract (on-chain, not DB)
 */
export async function getOnChainPositions(
  publicClient: PublicClient,
  userAddress: `0x${string}`
): Promise<{ weth: OnChainPosition | null; wbtc: OnChainPosition | null }> {
  const vaultAddress = VAULT_ADDRESS;
  if (!vaultAddress) return { weth: null, wbtc: null };

  try {
    const [wethPos, wbtcPos] = await Promise.all([
      publicClient.readContract({
        address: vaultAddress,
        abi: VAULT_V8_ABI,
        functionName: 'getPosition',
        args: [userAddress, TOKEN_ADDRESSES.WETH]
      }),
      publicClient.readContract({
        address: vaultAddress,
        abi: VAULT_V8_ABI,
        functionName: 'getPosition',
        args: [userAddress, TOKEN_ADDRESSES.WBTC]
      })
    ]);

    return {
      weth: (wethPos as OnChainPosition).isActive ? wethPos as OnChainPosition : null,
      wbtc: (wbtcPos as OnChainPosition).isActive ? wbtcPos as OnChainPosition : null
    };
  } catch (err) {
    console.error('Failed to fetch on-chain positions:', err);
    return { weth: null, wbtc: null };
  }
}

/**
 * Get GMX price for a token (30 decimals)
 */
export async function getGMXPrice(
  publicClient: PublicClient,
  token: 'WETH' | 'WBTC',
  type: 'max' | 'min' = 'max'
): Promise<bigint> {
  try {
    const tokenAddress = TOKEN_ADDRESSES[token];
    const price = await publicClient.readContract({
      address: GMX_VAULT_ADDRESS,
      abi: GMX_VAULT_ABI,
      functionName: type === 'max' ? 'getMaxPrice' : 'getMinPrice',
      args: [tokenAddress]
    });
    return price as bigint;
  } catch (err) {
    console.error(`Failed to get GMX ${type} price for ${token}:`, err);
    return 0n;
  }
}

/**
 * Calculate live P/L for a position using GMX prices
 * Returns P/L in USDC (6 decimals)
 */
export function calculateLivePnL(
  position: OnChainPosition,
  currentPrice: bigint
): { pnl: bigint; pnlPercent: number; pnlFormatted: string } {
  if (!position.isActive || currentPrice === 0n) {
    return { pnl: 0n, pnlPercent: 0, pnlFormatted: '0.00' };
  }

  const entryPrice = position.entryPrice;
  const collateral = position.collateral;
  const leverage = position.leverage;

  // GMX prices are 30 decimals, collateral is 6 decimals
  // P/L = collateral * leverage * (currentPrice - entryPrice) / entryPrice
  // For LONG: profit when price goes up
  // For SHORT: profit when price goes down

  let priceDelta: bigint;
  if (position.isLong) {
    priceDelta = currentPrice - entryPrice;
  } else {
    priceDelta = entryPrice - currentPrice;
  }

  // Calculate P/L: (collateral * leverage * priceDelta) / entryPrice
  // Result will be in USDC (6 decimals)
  const pnl = (collateral * leverage * priceDelta) / entryPrice;

  // Calculate percentage: (pnl / collateral) * 100
  const pnlPercent = collateral > 0n
    ? Number((pnl * 10000n) / collateral) / 100
    : 0;

  // Format for display (USDC has 6 decimals)
  const pnlFloat = Number(pnl) / 1e6;
  const pnlFormatted = (pnlFloat >= 0 ? '+' : '') + pnlFloat.toFixed(2);

  return { pnl, pnlPercent, pnlFormatted };
}

/**
 * Format GMX price (30 decimals) to human readable USD
 */
export function formatGMXPrice(price: bigint): string {
  const priceFloat = Number(price) / 1e30;
  return priceFloat.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * Format position stop loss / take profit
 */
export function formatSLTP(position: OnChainPosition): {
  stopLoss: string;
  takeProfit: string;
  trailingInfo: string | null;
} {
  const slPrice = Number(position.stopLoss) / 1e30;
  const tpPrice = Number(position.takeProfit) / 1e30;

  const stopLoss = position.stopLoss > 0n
    ? '$' + slPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })
    : 'Not set';

  const takeProfit = position.takeProfit > 0n
    ? '$' + tpPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })
    : 'Not set';

  let trailingInfo: string | null = null;
  if (position.trailingSlBps > 0n) {
    const trailingPercent = Number(position.trailingSlBps) / 100;
    if (position.trailingActivated) {
      const trackedPrice = position.isLong ? position.highestPrice : position.lowestPrice;
      const trackedFormatted = formatGMXPrice(trackedPrice);
      trailingInfo = `Trailing ${trailingPercent}% (Active, tracked: ${trackedFormatted})`;
    } else {
      trailingInfo = `Trailing ${trailingPercent}% (Waiting for 0.6% profit)`;
    }
  }

  return { stopLoss, takeProfit, trailingInfo };
}

/**
 * User close position (V8)
 */
export async function userClosePosition(
  walletClient: WalletClient,
  publicClient: PublicClient,
  userAddress: `0x${string}`,
  token: 'WETH' | 'WBTC'
): Promise<`0x${string}`> {
  const vaultAddress = VAULT_ADDRESS;
  if (!vaultAddress) throw new Error('V8 vault not available');

  // Get execution fee
  const execFee = await publicClient.readContract({
    address: vaultAddress,
    abi: VAULT_V8_ABI,
    functionName: 'getExecutionFee'
  }) as bigint;

  // Close position
  const hash = await walletClient.writeContract({
    address: vaultAddress,
    abi: VAULT_V8_ABI,
    functionName: 'userClosePosition',
    args: [TOKEN_ADDRESSES[token]],
    value: execFee,
    chain: arbitrum,
    account: userAddress
  });

  return hash;
}

/**
 * Cancel auto-features (disable SL/TP/trailing)
 */
export async function cancelAutoFeatures(
  walletClient: WalletClient,
  userAddress: `0x${string}`,
  token: 'WETH' | 'WBTC'
): Promise<`0x${string}`> {
  const vaultAddress = VAULT_ADDRESS;
  if (!vaultAddress) throw new Error('V8 vault not available');

  const hash = await walletClient.writeContract({
    address: vaultAddress,
    abi: VAULT_V8_ABI,
    functionName: 'cancelAutoFeatures',
    args: [TOKEN_ADDRESSES[token]],
    chain: arbitrum,
    account: userAddress
  });

  return hash;
}
