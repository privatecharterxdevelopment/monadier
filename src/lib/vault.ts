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

// Vault addresses by chain (V1 - instant trades)
export const VAULT_ADDRESSES: Record<number, `0x${string}` | null> = {
  1: null,      // Ethereum - not deployed yet
  56: null,     // BNB Chain - not deployed yet
  42161: null,  // Arbitrum - not deployed yet
  8453: '0xceD685CDbcF9056CdbD0F37fFE9Cd8152851D13A',   // Base - LIVE (V1)
  137: null,    // Polygon - not deployed yet
};

// V2 Vault addresses (position holding, trailing stops)
export const VAULT_V2_ADDRESSES: Record<number, `0x${string}` | null> = {
  1: null,      // Ethereum - not deployed yet
  56: null,     // BNB Chain - not deployed yet
  42161: null,  // Arbitrum - not deployed yet
  8453: '0x5eF29B4348d31c311918438e92a5fae7641Bc00a',   // Base - LIVE (V2)
  137: null,    // Polygon - not deployed yet
};

// V3 Vault addresses (secure - user can emergency close + ETH deposit)
export const VAULT_V3_ADDRESSES: Record<number, `0x${string}` | null> = {
  1: null,      // Ethereum - not deployed yet
  56: null,     // BNB Chain - not deployed yet
  42161: null,  // Arbitrum - not deployed yet
  8453: '0xAd1F46B955b783c142ea9D2d3F221Ac2F3D63e79',   // Base - OLD V3
  137: null,    // Polygon - not deployed yet
};

// V4 Vault addresses (V3 + 100% risk level support)
export const VAULT_V4_ADDRESSES: Record<number, `0x${string}` | null> = {
  1: null,      // Ethereum - not deployed yet
  56: null,     // BNB Chain - not deployed yet
  42161: null,  // Arbitrum - not deployed yet
  8453: '0x08Afb514255187d664d6b250D699Edc51491E803',   // Base - LIVE (V4)
  137: null,    // Polygon - not deployed yet
};

// USDC addresses by chain
export const USDC_ADDRESSES: Record<number, `0x${string}`> = {
  1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',      // Ethereum
  56: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',     // BNB Chain
  42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',  // Arbitrum (Native)
  8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',   // Base (Native)
  137: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',    // Polygon (Native)
};

// USDC decimals (6 for all chains)
export const USDC_DECIMALS = 6;

// Platform fee structure (basis points)
export const PLATFORM_FEES = {
  BASE_CHAIN_ID: 8453,
  BASE_FEE_BPS: 100,      // 1.0% on Base
  OTHER_FEE_BPS: 350,     // 3.5% on other chains
} as const;

/**
 * Get platform fee for a chain
 * @param chainId Chain ID
 * @returns Fee in basis points and percentage
 */
export function getPlatformFeeForChain(chainId: number): {
  bps: number;
  percent: number;
  percentFormatted: string;
} {
  const isBase = chainId === PLATFORM_FEES.BASE_CHAIN_ID;
  const bps = isBase ? PLATFORM_FEES.BASE_FEE_BPS : PLATFORM_FEES.OTHER_FEE_BPS;
  const percent = bps / 100;

  return {
    bps,
    percent,
    percentFormatted: `${percent.toFixed(1)}%`
  };
}

// Risk level presets
export const RISK_PRESETS = {
  conservative: { bps: 100, percent: 1, label: 'Conservative (1%)' },
  low: { bps: 500, percent: 5, label: 'Low (5%)' },
  medium: { bps: 1500, percent: 15, label: 'Medium (15%)' },
  high: { bps: 3000, percent: 30, label: 'High (30%)' },
  maximum: { bps: 5000, percent: 50, label: 'Maximum (50%)' },
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

    // Prefer V4 > V3 > V2 > V1
    const vaultAddr = VAULT_V4_ADDRESSES[chainId] || VAULT_V3_ADDRESSES[chainId] || VAULT_V2_ADDRESSES[chainId] || VAULT_ADDRESSES[chainId];
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
    return VAULT_V4_ADDRESSES[chainId] !== null || VAULT_V3_ADDRESSES[chainId] !== null || VAULT_V2_ADDRESSES[chainId] !== null || VAULT_ADDRESSES[chainId] !== null;
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
   */
  async withdrawAll(userAddress: `0x${string}`): Promise<`0x${string}`> {
    const hash = await this.walletClient.writeContract({
      address: this.vaultAddress,
      abi: VAULT_ABI,
      functionName: 'withdrawAll',
      args: [],
      chain: null,
      account: userAddress,
      gas: 150000n // Explicit gas limit to avoid estimation issues
    });

    return hash;
  }

  /**
   * Enable/disable auto-trading
   */
  async setAutoTrade(enabled: boolean, userAddress: `0x${string}`): Promise<`0x${string}`> {
    const hash = await this.walletClient.writeContract({
      address: this.vaultAddress,
      abi: VAULT_ABI,
      functionName: 'setAutoTrade',
      args: [enabled],
      chain: null,
      account: userAddress
    });

    return hash;
  }

  /**
   * Emergency stop auto-trading
   */
  async emergencyStop(userAddress: `0x${string}`): Promise<`0x${string}`> {
    const hash = await this.walletClient.writeContract({
      address: this.vaultAddress,
      abi: VAULT_ABI,
      functionName: 'emergencyStopAutoTrade',
      args: [],
      chain: null,
      account: userAddress
    });

    return hash;
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
   * Set risk level (1-100%)
   */
  async setRiskLevel(percent: number, userAddress: `0x${string}`): Promise<`0x${string}`> {
    if (percent < 1 || percent > 100) {
      throw new Error('Risk level must be between 1% and 100%');
    }

    const bps = BigInt(percent * 100);

    const hash = await this.walletClient.writeContract({
      address: this.vaultAddress,
      abi: VAULT_ABI,
      functionName: 'setRiskLevel',
      args: [bps],
      chain: null,
      account: userAddress
    });

    return hash;
  }

  /**
   * Get user's vault status (compatible with V1 and V2)
   */
  async getUserStatus(userAddress: `0x${string}`): Promise<VaultUserStatus> {
    // Try individual calls first (works on V2)
    // V2 has public mappings: balances, autoTradeEnabled, userRiskLevel
    // And view functions: canTradeNow, getMaxTradeSize
    try {
      const [balance, autoTradeOn, riskLevelBps, canTrade, maxTrade] = await Promise.all([
        this.publicClient.readContract({
          address: this.vaultAddress,
          abi: [{ inputs: [{ name: 'user', type: 'address' }], name: 'balances', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' }] as const,
          functionName: 'balances',
          args: [userAddress]
        }),
        this.publicClient.readContract({
          address: this.vaultAddress,
          abi: [{ inputs: [{ name: 'user', type: 'address' }], name: 'autoTradeEnabled', outputs: [{ name: '', type: 'bool' }], stateMutability: 'view', type: 'function' }] as const,
          functionName: 'autoTradeEnabled',
          args: [userAddress]
        }),
        this.publicClient.readContract({
          address: this.vaultAddress,
          abi: [{ inputs: [{ name: 'user', type: 'address' }], name: 'userRiskLevel', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' }] as const,
          functionName: 'userRiskLevel',
          args: [userAddress]
        }),
        this.publicClient.readContract({
          address: this.vaultAddress,
          abi: [{ inputs: [{ name: 'user', type: 'address' }], name: 'canTradeNow', outputs: [{ name: '', type: 'bool' }], stateMutability: 'view', type: 'function' }] as const,
          functionName: 'canTradeNow',
          args: [userAddress]
        }),
        this.publicClient.readContract({
          address: this.vaultAddress,
          abi: [{ inputs: [{ name: 'user', type: 'address' }], name: 'getMaxTradeSize', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' }] as const,
          functionName: 'getMaxTradeSize',
          args: [userAddress]
        })
      ]);

      // Default risk level is 5% (500 bps) if not set
      const effectiveRiskBps = Number(riskLevelBps) || 500;

      return {
        balance,
        balanceFormatted: formatUnits(balance, USDC_DECIMALS),
        autoTradeEnabled: autoTradeOn,
        riskLevelBps: effectiveRiskBps,
        riskLevelPercent: effectiveRiskBps / 100,
        maxTradeSize: maxTrade,
        maxTradeSizeFormatted: formatUnits(maxTrade, USDC_DECIMALS),
        timeToNextTrade: 0, // V2 doesn't track this per-user externally
        canTrade
      };
    } catch (err) {
      // Fallback to V1 getUserStatus if individual calls fail
      const [balance, autoTradeOn, riskLevelBps, maxTrade, timeToNextTrade, canTrade] =
        await this.publicClient.readContract({
          address: this.vaultAddress,
          abi: VAULT_ABI,
          functionName: 'getUserStatus',
          args: [userAddress]
        });

      return {
        balance,
        balanceFormatted: formatUnits(balance, USDC_DECIMALS),
        autoTradeEnabled: autoTradeOn,
        riskLevelBps: Number(riskLevelBps),
        riskLevelPercent: Number(riskLevelBps) / 100,
        maxTradeSize: maxTrade,
        maxTradeSizeFormatted: formatUnits(maxTrade, USDC_DECIMALS),
        timeToNextTrade: Number(timeToNextTrade),
        canTrade
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
    isBaseChain: boolean;
  }> {
    const feeBps = await this.publicClient.readContract({
      address: this.vaultAddress,
      abi: VAULT_ABI,
      functionName: 'getPlatformFee',
      args: []
    });

    const bps = Number(feeBps);
    const percent = bps / 100;
    const isBaseChain = this.chainId === PLATFORM_FEES.BASE_CHAIN_ID;

    return {
      bps,
      percent,
      percentFormatted: `${percent.toFixed(1)}%`,
      isBaseChain
    };
  }

  /**
   * Get platform fee without contract call (uses local constants)
   */
  getPlatformFeeLocal(): {
    bps: number;
    percent: number;
    percentFormatted: string;
    isBaseChain: boolean;
  } {
    return {
      ...getPlatformFeeForChain(this.chainId),
      isBaseChain: this.chainId === PLATFORM_FEES.BASE_CHAIN_ID
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
