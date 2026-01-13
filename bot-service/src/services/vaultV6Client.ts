import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
  type PublicClient,
  type WalletClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrum } from 'viem/chains';
import { config } from '../config';
import { logger } from '../utils/logger';

/**
 * MonadierTradingVaultV6 Client
 *
 * Features:
 * - Isolated Margin (per-position collateral)
 * - 20x Max Leverage via Aave V3
 * - Chainlink Oracle integration
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
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'token', type: 'address' }
    ],
    name: 'hasOpenPosition',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'token', type: 'address' }
    ],
    name: 'canOpenPosition',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'token', type: 'address' }
    ],
    name: 'getCooldownRemaining',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'token', type: 'address' }],
    name: 'getOraclePrice',
    outputs: [{ name: 'price', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'token', type: 'address' }
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
    name: 'getMaxLeverage',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'pure',
    type: 'function'
  },
  {
    inputs: [],
    name: 'accumulatedFees',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'getContractInfo',
    outputs: [
      { name: 'tvl', type: 'uint256' },
      { name: 'platformFees', type: 'uint256' },
      { name: 'baseFee', type: 'uint256' },
      { name: 'successFee', type: 'uint256' },
      { name: 'poolFee', type: 'uint24' },
      { name: 'minBalance', type: 'uint256' },
      { name: 'maxLeverage', type: 'uint256' }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  // ============ WRITE FUNCTIONS - LONG ============
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
    outputs: [{ name: 'tokenOut', type: 'uint256' }],
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
    outputs: [{ name: 'returnAmount', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  // ============ WRITE FUNCTIONS - SHORT ============
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
    outputs: [{ name: 'returnAmount', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  // ============ AUTOMATED TRIGGERS ============
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
  // ============ OWNER FUNCTIONS ============
  {
    inputs: [],
    name: 'withdrawFees',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  }
] as const;

// Arbitrum V6 addresses
export const ARBITRUM_V6_CONFIG = {
  USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as `0x${string}`,
  WETH: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1' as `0x${string}`,
  WBTC: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f' as `0x${string}`,
  ARB: '0x912CE59144191C1204E64559FE8253a0e49E6548' as `0x${string}`,
  // V6 Vault address (deployed 2025-01-13)
  VAULT_V6: (process.env.ARBITRUM_VAULT_V6_ADDRESS || '0xceD685CDbcF9056CdbD0F37fFE9Cd8152851D13A') as `0x${string}`,
};

// Token symbol to address mapping
export const TOKEN_ADDRESSES: Record<string, `0x${string}`> = {
  'WETH': ARBITRUM_V6_CONFIG.WETH,
  'WBTC': ARBITRUM_V6_CONFIG.WBTC,
  'ARB': ARBITRUM_V6_CONFIG.ARB,
  'ETH': ARBITRUM_V6_CONFIG.WETH, // Alias
};

export interface V6Position {
  isLong: boolean;
  isActive: boolean;
  tokenAmount: bigint;
  entryPrice: bigint; // 8 decimals (Chainlink)
  collateral: bigint; // 6 decimals (USDC)
  borrowedAmount: bigint;
  leverage: bigint;
  stopLossPrice: bigint;
  takeProfitPrice: bigint;
  openedAt: bigint;
  liquidationPrice: bigint;
}

export interface V6TradeParams {
  userAddress: `0x${string}`;
  tokenAddress: `0x${string}`;
  collateralUsdc: bigint; // Amount in USDC (6 decimals)
  leverage: number; // 1-20
  stopLossPercent: number; // e.g., 500 = 5%
  takeProfitPercent: number; // e.g., 1000 = 10%
  minAmountOut: bigint; // Slippage protection
  isLong: boolean;
}

export interface V6TradeResult {
  success: boolean;
  txHash?: string;
  amountOut?: string;
  error?: string;
}

export class VaultV6Client {
  private publicClient: PublicClient;
  private walletClient: WalletClient;
  private vaultAddress: `0x${string}`;
  private botAccount = privateKeyToAccount(config.botPrivateKey);

  constructor(vaultAddress?: `0x${string}`) {
    this.vaultAddress = vaultAddress || ARBITRUM_V6_CONFIG.VAULT_V6;

    const chainConfig = config.chains[42161]; // Arbitrum

    this.publicClient = createPublicClient({
      chain: arbitrum,
      transport: http(chainConfig?.rpcUrl || 'https://arb1.arbitrum.io/rpc')
    }) as PublicClient;

    this.walletClient = createWalletClient({
      account: this.botAccount,
      chain: arbitrum,
      transport: http(chainConfig?.rpcUrl || 'https://arb1.arbitrum.io/rpc')
    }) as WalletClient;

    logger.info('VaultV6Client initialized', { vaultAddress: this.vaultAddress });
  }

  // ============ READ FUNCTIONS ============

  async getUserBalance(userAddress: `0x${string}`): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.vaultAddress,
      abi: VAULT_V6_ABI,
      functionName: 'balances',
      args: [userAddress]
    });
  }

  async isAutoTradeEnabled(userAddress: `0x${string}`): Promise<boolean> {
    return await this.publicClient.readContract({
      address: this.vaultAddress,
      abi: VAULT_V6_ABI,
      functionName: 'autoTradeEnabled',
      args: [userAddress]
    });
  }

  async getPosition(userAddress: `0x${string}`, tokenAddress: `0x${string}`): Promise<V6Position> {
    const result = await this.publicClient.readContract({
      address: this.vaultAddress,
      abi: VAULT_V6_ABI,
      functionName: 'getPosition',
      args: [userAddress, tokenAddress]
    });

    return {
      isLong: result.isLong,
      isActive: result.isActive,
      tokenAmount: result.tokenAmount,
      entryPrice: result.entryPrice,
      collateral: result.collateral,
      borrowedAmount: result.borrowedAmount,
      leverage: result.leverage,
      stopLossPrice: result.stopLossPrice,
      takeProfitPrice: result.takeProfitPrice,
      openedAt: result.openedAt,
      liquidationPrice: result.liquidationPrice
    };
  }

  async hasOpenPosition(userAddress: `0x${string}`, tokenAddress: `0x${string}`): Promise<boolean> {
    return await this.publicClient.readContract({
      address: this.vaultAddress,
      abi: VAULT_V6_ABI,
      functionName: 'hasOpenPosition',
      args: [userAddress, tokenAddress]
    });
  }

  async canOpenPosition(userAddress: `0x${string}`, tokenAddress: `0x${string}`): Promise<boolean> {
    return await this.publicClient.readContract({
      address: this.vaultAddress,
      abi: VAULT_V6_ABI,
      functionName: 'canOpenPosition',
      args: [userAddress, tokenAddress]
    });
  }

  async getCooldownRemaining(userAddress: `0x${string}`, tokenAddress: `0x${string}`): Promise<number> {
    const remaining = await this.publicClient.readContract({
      address: this.vaultAddress,
      abi: VAULT_V6_ABI,
      functionName: 'getCooldownRemaining',
      args: [userAddress, tokenAddress]
    });
    return Number(remaining);
  }

  async getOraclePrice(tokenAddress: `0x${string}`): Promise<number> {
    const price = await this.publicClient.readContract({
      address: this.vaultAddress,
      abi: VAULT_V6_ABI,
      functionName: 'getOraclePrice',
      args: [tokenAddress]
    });
    // Price has 8 decimals (Chainlink)
    return parseFloat(formatUnits(price, 8));
  }

  async getPositionPnL(userAddress: `0x${string}`, tokenAddress: `0x${string}`): Promise<{ pnl: number; pnlPercent: number }> {
    const [pnl, pnlPercent] = await this.publicClient.readContract({
      address: this.vaultAddress,
      abi: VAULT_V6_ABI,
      functionName: 'getPositionPnL',
      args: [userAddress, tokenAddress]
    });
    return {
      pnl: parseFloat(formatUnits(pnl, 6)), // USDC decimals
      pnlPercent: Number(pnlPercent) / 100 // Convert basis points to percent
    };
  }

  async checkPositionStatus(userAddress: `0x${string}`, tokenAddress: `0x${string}`): Promise<{ shouldClose: boolean; reason: string }> {
    const [shouldClose, reason] = await this.publicClient.readContract({
      address: this.vaultAddress,
      abi: VAULT_V6_ABI,
      functionName: 'checkPositionStatus',
      args: [userAddress, tokenAddress]
    });
    return { shouldClose, reason };
  }

  async getContractInfo(): Promise<{
    tvl: string;
    fees: string;
    maxLeverage: number;
  }> {
    const info = await this.publicClient.readContract({
      address: this.vaultAddress,
      abi: VAULT_V6_ABI,
      functionName: 'getContractInfo'
    });
    return {
      tvl: formatUnits(info[0], 6),
      fees: formatUnits(info[1], 6),
      maxLeverage: Number(info[6])
    };
  }

  // ============ WRITE FUNCTIONS ============

  async openLong(params: V6TradeParams): Promise<V6TradeResult> {
    try {
      logger.info('Opening LONG position', {
        user: params.userAddress.slice(0, 10),
        token: params.tokenAddress.slice(0, 10),
        collateral: formatUnits(params.collateralUsdc, 6),
        leverage: params.leverage,
        sl: params.stopLossPercent / 100 + '%',
        tp: params.takeProfitPercent / 100 + '%'
      });

      const { request } = await this.publicClient.simulateContract({
        address: this.vaultAddress,
        abi: VAULT_V6_ABI,
        functionName: 'openLong',
        args: [
          params.userAddress,
          params.tokenAddress,
          params.collateralUsdc,
          BigInt(params.leverage),
          BigInt(params.stopLossPercent),
          BigInt(params.takeProfitPercent),
          params.minAmountOut
        ],
        account: this.botAccount
      });

      const hash = await this.walletClient.writeContract(request);
      const receipt = await this.publicClient.waitForTransactionReceipt({ hash });

      logger.info('LONG position opened', { hash, status: receipt.status });

      return {
        success: receipt.status === 'success',
        txHash: hash
      };
    } catch (err: any) {
      logger.error('Failed to open LONG', { error: err.message });
      return { success: false, error: err.message };
    }
  }

  async closeLong(userAddress: `0x${string}`, tokenAddress: `0x${string}`, minUsdcOut: bigint = 0n): Promise<V6TradeResult> {
    try {
      logger.info('Closing LONG position', {
        user: userAddress.slice(0, 10),
        token: tokenAddress.slice(0, 10)
      });

      const { request } = await this.publicClient.simulateContract({
        address: this.vaultAddress,
        abi: VAULT_V6_ABI,
        functionName: 'closeLong',
        args: [userAddress, tokenAddress, minUsdcOut],
        account: this.botAccount
      });

      const hash = await this.walletClient.writeContract(request);
      const receipt = await this.publicClient.waitForTransactionReceipt({ hash });

      logger.info('LONG position closed', { hash, status: receipt.status });

      return {
        success: receipt.status === 'success',
        txHash: hash
      };
    } catch (err: any) {
      logger.error('Failed to close LONG', { error: err.message });
      return { success: false, error: err.message };
    }
  }

  async openShort(params: V6TradeParams): Promise<V6TradeResult> {
    try {
      logger.info('Opening SHORT position', {
        user: params.userAddress.slice(0, 10),
        token: params.tokenAddress.slice(0, 10),
        collateral: formatUnits(params.collateralUsdc, 6),
        leverage: params.leverage,
        sl: params.stopLossPercent / 100 + '%',
        tp: params.takeProfitPercent / 100 + '%'
      });

      const { request } = await this.publicClient.simulateContract({
        address: this.vaultAddress,
        abi: VAULT_V6_ABI,
        functionName: 'openShort',
        args: [
          params.userAddress,
          params.tokenAddress,
          params.collateralUsdc,
          BigInt(params.leverage),
          BigInt(params.stopLossPercent),
          BigInt(params.takeProfitPercent),
          params.minAmountOut
        ],
        account: this.botAccount
      });

      const hash = await this.walletClient.writeContract(request);
      const receipt = await this.publicClient.waitForTransactionReceipt({ hash });

      logger.info('SHORT position opened', { hash, status: receipt.status });

      return {
        success: receipt.status === 'success',
        txHash: hash
      };
    } catch (err: any) {
      logger.error('Failed to open SHORT', { error: err.message });
      return { success: false, error: err.message };
    }
  }

  async closeShort(userAddress: `0x${string}`, tokenAddress: `0x${string}`, maxUsdcIn: bigint = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')): Promise<V6TradeResult> {
    try {
      logger.info('Closing SHORT position', {
        user: userAddress.slice(0, 10),
        token: tokenAddress.slice(0, 10)
      });

      const { request } = await this.publicClient.simulateContract({
        address: this.vaultAddress,
        abi: VAULT_V6_ABI,
        functionName: 'closeShort',
        args: [userAddress, tokenAddress, maxUsdcIn],
        account: this.botAccount
      });

      const hash = await this.walletClient.writeContract(request);
      const receipt = await this.publicClient.waitForTransactionReceipt({ hash });

      logger.info('SHORT position closed', { hash, status: receipt.status });

      return {
        success: receipt.status === 'success',
        txHash: hash
      };
    } catch (err: any) {
      logger.error('Failed to close SHORT', { error: err.message });
      return { success: false, error: err.message };
    }
  }

  // ============ AUTOMATED TRIGGERS ============

  async executeStopLoss(userAddress: `0x${string}`, tokenAddress: `0x${string}`): Promise<V6TradeResult> {
    try {
      logger.info('Executing STOP-LOSS', {
        user: userAddress.slice(0, 10),
        token: tokenAddress.slice(0, 10)
      });

      const { request } = await this.publicClient.simulateContract({
        address: this.vaultAddress,
        abi: VAULT_V6_ABI,
        functionName: 'executeStopLoss',
        args: [userAddress, tokenAddress],
        account: this.botAccount
      });

      const hash = await this.walletClient.writeContract(request);
      const receipt = await this.publicClient.waitForTransactionReceipt({ hash });

      logger.info('STOP-LOSS executed', { hash, status: receipt.status });

      return {
        success: receipt.status === 'success',
        txHash: hash
      };
    } catch (err: any) {
      logger.error('Failed to execute stop-loss', { error: err.message });
      return { success: false, error: err.message };
    }
  }

  async executeTakeProfit(userAddress: `0x${string}`, tokenAddress: `0x${string}`): Promise<V6TradeResult> {
    try {
      logger.info('Executing TAKE-PROFIT', {
        user: userAddress.slice(0, 10),
        token: tokenAddress.slice(0, 10)
      });

      const { request } = await this.publicClient.simulateContract({
        address: this.vaultAddress,
        abi: VAULT_V6_ABI,
        functionName: 'executeTakeProfit',
        args: [userAddress, tokenAddress],
        account: this.botAccount
      });

      const hash = await this.walletClient.writeContract(request);
      const receipt = await this.publicClient.waitForTransactionReceipt({ hash });

      logger.info('TAKE-PROFIT executed', { hash, status: receipt.status });

      return {
        success: receipt.status === 'success',
        txHash: hash
      };
    } catch (err: any) {
      logger.error('Failed to execute take-profit', { error: err.message });
      return { success: false, error: err.message };
    }
  }

  async liquidatePosition(userAddress: `0x${string}`, tokenAddress: `0x${string}`): Promise<V6TradeResult> {
    try {
      logger.warn('LIQUIDATING position', {
        user: userAddress.slice(0, 10),
        token: tokenAddress.slice(0, 10)
      });

      const { request } = await this.publicClient.simulateContract({
        address: this.vaultAddress,
        abi: VAULT_V6_ABI,
        functionName: 'liquidatePosition',
        args: [userAddress, tokenAddress],
        account: this.botAccount
      });

      const hash = await this.walletClient.writeContract(request);
      const receipt = await this.publicClient.waitForTransactionReceipt({ hash });

      logger.warn('Position LIQUIDATED', { hash, status: receipt.status });

      return {
        success: receipt.status === 'success',
        txHash: hash
      };
    } catch (err: any) {
      logger.error('Failed to liquidate', { error: err.message });
      return { success: false, error: err.message };
    }
  }

  // ============ HELPER FUNCTIONS ============

  /**
   * Check all positions for a user across all supported tokens
   * and execute any triggered SL/TP/liquidations
   */
  async monitorPositions(userAddress: `0x${string}`): Promise<void> {
    const tokens = [ARBITRUM_V6_CONFIG.WETH, ARBITRUM_V6_CONFIG.WBTC, ARBITRUM_V6_CONFIG.ARB];

    for (const token of tokens) {
      try {
        const hasPosition = await this.hasOpenPosition(userAddress, token);
        if (!hasPosition) continue;

        const { shouldClose, reason } = await this.checkPositionStatus(userAddress, token);

        if (shouldClose) {
          logger.info('Position trigger detected', {
            user: userAddress.slice(0, 10),
            token: token.slice(0, 10),
            reason
          });

          switch (reason) {
            case 'stoploss':
              await this.executeStopLoss(userAddress, token);
              break;
            case 'takeprofit':
              await this.executeTakeProfit(userAddress, token);
              break;
            case 'liquidation':
              await this.liquidatePosition(userAddress, token);
              break;
          }
        }
      } catch (err: any) {
        logger.error('Error monitoring position', {
          user: userAddress.slice(0, 10),
          token: token.slice(0, 10),
          error: err.message
        });
      }
    }
  }

  /**
   * Get token address from symbol
   */
  getTokenAddress(symbol: string): `0x${string}` | undefined {
    return TOKEN_ADDRESSES[symbol.toUpperCase()];
  }
}

// Export singleton instance
export const vaultV6Client = new VaultV6Client();
