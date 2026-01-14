// Vault Integration for MonadierTradingVault Smart Contract
import { parseUnits, formatUnits, type PublicClient, type WalletClient } from 'viem';

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

// ARBITRUM ONLY - V7 GMX Vault (25x-50x Leverage)
// V7: GMX Perpetuals, TRUE 25x-50x Leverage, Keeper execution
export const VAULT_ADDRESSES: Record<number, `0x${string}` | null> = {
  42161: '0x9879792a47725d5b18633e1395BC4a7A06c750df',  // Arbitrum - V7 GMX LIVE
};

export const VAULT_V2_ADDRESSES: Record<number, `0x${string}` | null> = {
  42161: null,  // Using V7
};

export const VAULT_V3_ADDRESSES: Record<number, `0x${string}` | null> = {
  42161: null,  // Using V7
};

export const VAULT_V4_ADDRESSES: Record<number, `0x${string}` | null> = {
  42161: null,  // Using V7
};

export const VAULT_V5_ADDRESSES: Record<number, `0x${string}` | null> = {
  42161: null,  // Using V7
};

export const VAULT_V6_ADDRESSES: Record<number, `0x${string}` | null> = {
  42161: '0xceD685CDbcF9056CdbD0F37fFE9Cd8152851D13A',  // Arbitrum - DEPRECATED (V6)
};

// V7: GMX Perpetuals - TRUE 25x-50x Leverage
export const VAULT_V7_ADDRESSES: Record<number, `0x${string}` | null> = {
  42161: '0x9879792a47725d5b18633e1395BC4a7A06c750df',  // Arbitrum - V7 GMX LIVE
};

// USDC addresses - Arbitrum only
export const USDC_ADDRESSES: Record<number, `0x${string}`> = {
  42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',  // Arbitrum (Native USDC)
};

// USDC decimals (6 for all chains)
export const USDC_DECIMALS = 6;

// Platform fee structure - Arbitrum V7 GMX
// V7: 0.1% base fee on TOTAL position (collateral × leverage) + 10% success fee
export const PLATFORM_FEES = {
  ARBITRUM_CHAIN_ID: 42161,
  // V7 fees (Arbitrum) - 0.1% on total position size
  V7_BASE_FEE_BPS: 10,    // 0.1% base fee on TOTAL position
  V7_SUCCESS_FEE_BPS: 1000, // 10% of profit
  MAX_LEVERAGE_STANDARD: 25, // Standard users: 1x-25x
  MAX_LEVERAGE_ELITE: 50, // Elite users (manually unlocked): 1x-50x
  // Legacy V6 reference
  V6_BASE_FEE_BPS: 10,
  V6_SUCCESS_FEE_BPS: 1000,
  MAX_LEVERAGE: 25, // Default max leverage
} as const;

/**
 * Get platform fee for Arbitrum V7 GMX
 * @param chainId Chain ID (only 42161 supported)
 * @returns Fee in basis points and percentage
 */
export function getPlatformFeeForChain(chainId: number): {
  bps: number;
  percent: number;
  percentFormatted: string;
  isV7: boolean;
  successFeeBps?: number;
  successFeePercent?: number;
  maxLeverage?: number;
  maxLeverageElite?: number;
} {
  // V7 fee structure: 0.1% on TOTAL position + 10% success fee
  const bps = PLATFORM_FEES.V7_BASE_FEE_BPS;
  const percent = bps / 100;
  return {
    bps,
    percent,
    percentFormatted: `${percent.toFixed(1)}% on position + 10% profit`,
    isV7: true,
    successFeeBps: PLATFORM_FEES.V7_SUCCESS_FEE_BPS,
    successFeePercent: 10,
    maxLeverage: PLATFORM_FEES.MAX_LEVERAGE_STANDARD,
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
 * Vault client for interacting with MonadierTradingVault
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

    // Prefer V7 > V6 > V5 > V4 > V3 > V2 > V1
    const vaultAddr = VAULT_V7_ADDRESSES[chainId] || VAULT_V6_ADDRESSES[chainId] || VAULT_V5_ADDRESSES[chainId] || VAULT_V4_ADDRESSES[chainId] || VAULT_V3_ADDRESSES[chainId] || VAULT_V2_ADDRESSES[chainId] || VAULT_ADDRESSES[chainId];
    if (!vaultAddr) {
      throw new Error(`Vault not deployed on chain ${chainId}`);
    }
    this.vaultAddress = vaultAddr;

    const usdcAddr = USDC_ADDRESSES[chainId];
    if (!usdcAddr) {
      throw new Error(`USDC not configured for chain ${chainId}`);
    }
    this.usdcAddress = usdcAddr;
  }

  /**
   * Check if vault is available on this chain
   */
  static isAvailable(chainId: number): boolean {
    return VAULT_V7_ADDRESSES[chainId] !== null || VAULT_V6_ADDRESSES[chainId] !== null || VAULT_V5_ADDRESSES[chainId] !== null || VAULT_V4_ADDRESSES[chainId] !== null || VAULT_V3_ADDRESSES[chainId] !== null || VAULT_V2_ADDRESSES[chainId] !== null || VAULT_ADDRESSES[chainId] !== null;
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
        chain: null,
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
      chain: null,
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
      chain: null,
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
      chain: null,
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
      chain: null,
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
      chain: null,
      account: userAddress
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
      chain: null,
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
   * Set all trading settings (V7 compatible)
   * V7 uses setTradingSettings() instead of separate setRiskLevel()
   */
  async setTradingSettings(
    userAddress: `0x${string}`,
    autoTrade: boolean,
    riskLevelPercent: number,
    maxLeverage: number = 10,
    stopLossPercent: number = 5,
    takeProfitPercent: number = 10
  ): Promise<`0x${string}`> {
    const setTradingSettingsAbi = [{
      inputs: [
        { name: '_autoTrade', type: 'bool' },
        { name: '_riskLevelBps', type: 'uint256' },
        { name: '_maxLeverage', type: 'uint256' },
        { name: '_defaultStopLoss', type: 'uint256' },
        { name: '_defaultTakeProfit', type: 'uint256' }
      ],
      name: 'setTradingSettings',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function'
    }] as const;

    const riskBps = BigInt(Math.round(riskLevelPercent * 100));
    const slBps = BigInt(Math.round(stopLossPercent * 100));
    const tpBps = BigInt(Math.round(takeProfitPercent * 100));

    const hash = await this.walletClient.writeContract({
      address: this.vaultAddress,
      abi: setTradingSettingsAbi,
      functionName: 'setTradingSettings',
      args: [autoTrade, riskBps, BigInt(maxLeverage), slBps, tpBps],
      chain: null,
      account: userAddress
    });

    return hash;
  }

  /**
   * Set risk level (1-100%) - V7 compatible wrapper
   * Calls setTradingSettings with current autoTrade state
   */
  async setRiskLevel(percent: number, userAddress: `0x${string}`): Promise<`0x${string}`> {
    if (percent < 1 || percent > 100) {
      throw new Error('Risk level must be between 1% and 100%');
    }

    // Get current settings first
    const status = await this.getUserStatus(userAddress);

    // Call setTradingSettings with updated risk level
    return this.setTradingSettings(
      userAddress,
      status.autoTradeEnabled,
      percent,
      10, // default leverage
      5,  // default SL
      10  // default TP
    );
  }

  /**
   * Get user's vault status (V7 GMX compatible)
   * V7 has: balances mapping + getUserSettings() function
   */
  async getUserStatus(userAddress: `0x${string}`): Promise<VaultUserStatus> {
    try {
      // V7 ABI for getUserSettings
      const getUserSettingsAbi = [{
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
          name: '',
          type: 'tuple'
        }],
        stateMutability: 'view',
        type: 'function'
      }] as const;

      const [balance, settings] = await Promise.all([
        this.publicClient.readContract({
          address: this.vaultAddress,
          abi: [{ inputs: [{ name: 'user', type: 'address' }], name: 'balances', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' }] as const,
          functionName: 'balances',
          args: [userAddress]
        }),
        this.publicClient.readContract({
          address: this.vaultAddress,
          abi: getUserSettingsAbi,
          functionName: 'getUserSettings',
          args: [userAddress]
        })
      ]);

      // Default risk level is 5% (500 bps) if not set
      const effectiveRiskBps = Number(settings.riskLevelBps) || 500;

      // Calculate max trade size locally: balance * riskLevel%
      const maxTrade = (balance * BigInt(effectiveRiskBps)) / BigInt(10000);

      return {
        balance,
        balanceFormatted: formatUnits(balance, USDC_DECIMALS),
        autoTradeEnabled: settings.autoTradeEnabled,
        riskLevelBps: effectiveRiskBps,
        riskLevelPercent: effectiveRiskBps / 100,
        maxTradeSize: maxTrade,
        maxTradeSizeFormatted: formatUnits(maxTrade, USDC_DECIMALS),
        timeToNextTrade: 0,
        canTrade: true
      };
    } catch (err) {
      // Fallback: return empty status
      console.error('Failed to load vault status:', err);
      return {
        balance: 0n,
        balanceFormatted: '0',
        autoTradeEnabled: false,
        riskLevelBps: 500,
        riskLevelPercent: 5,
        maxTradeSize: 0n,
        maxTradeSizeFormatted: '0',
        timeToNextTrade: 0,
        canTrade: false
      };
    }
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
      ...getPlatformFeeForChain(this.chainId),
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
