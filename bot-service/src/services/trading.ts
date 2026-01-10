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

// Vault ABI (essential functions only)
const VAULT_ABI = [
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
      { name: 'tokenOut', type: 'address' },
      { name: 'amountIn', type: 'uint256' },
      { name: 'minAmountOut', type: 'uint256' },
      { name: 'useWrappedPath', type: 'bool' }
    ],
    name: 'executeTrade',
    outputs: [{ name: 'amountOut', type: 'uint256' }],
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

// Chain mapping
const CHAINS: Record<ChainId, Chain> = {
  8453: base,
  1: mainnet,
  137: polygon,
  42161: arbitrum,
  56: bsc
};

export interface TradeSignal {
  direction: 'LONG' | 'SHORT';
  confidence: number;
  tokenAddress: string;
  suggestedAmount: bigint;
  minAmountOut: bigint;
  reason: string;
}

export interface TradeResult {
  success: boolean;
  txHash?: string;
  amountIn?: string;
  amountOut?: string;
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

      if (!chain || !chainConfig.vaultAddress) continue;

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

      logger.info(`Initialized client for ${chainConfig.name}`, { chainId });
    }
  }

  /**
   * Get user's vault status
   */
  async getUserVaultStatus(chainId: ChainId, userAddress: `0x${string}`) {
    const clients = this.clients.get(chainId);
    const vaultAddress = config.chains[chainId]?.vaultAddress;

    if (!clients || !vaultAddress) {
      return null;
    }

    try {
      const [balance, autoTradeEnabled, riskLevel, canTradeNow] = await Promise.all([
        clients.public.readContract({
          address: vaultAddress,
          abi: VAULT_ABI,
          functionName: 'balances',
          args: [userAddress]
        }),
        clients.public.readContract({
          address: vaultAddress,
          abi: VAULT_ABI,
          functionName: 'autoTradeEnabled',
          args: [userAddress]
        }),
        clients.public.readContract({
          address: vaultAddress,
          abi: VAULT_ABI,
          functionName: 'userRiskLevel',
          args: [userAddress]
        }),
        clients.public.readContract({
          address: vaultAddress,
          abi: VAULT_ABI,
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
   * Execute a trade for a user
   */
  async executeTrade(
    chainId: ChainId,
    userAddress: `0x${string}`,
    signal: TradeSignal
  ): Promise<TradeResult> {
    const clients = this.clients.get(chainId);
    const vaultAddress = config.chains[chainId]?.vaultAddress;

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

    // 3. Calculate trade amount based on risk level
    const riskBps = vaultStatus.riskLevel || 500; // Default 5%
    const maxTradeSize = (vaultStatus.balance * BigInt(riskBps)) / 10000n;
    const tradeAmount = signal.suggestedAmount > maxTradeSize
      ? maxTradeSize
      : signal.suggestedAmount;

    if (tradeAmount === 0n) {
      return { success: false, error: 'Trade amount too small' };
    }

    // 4. Execute the trade
    try {
      logger.info('Executing trade', {
        chainId,
        userAddress,
        tokenOut: signal.tokenAddress,
        amountIn: formatUnits(tradeAmount, 6),
        direction: signal.direction,
        confidence: signal.confidence
      });

      const txHash = await clients.wallet.writeContract({
        address: vaultAddress,
        abi: VAULT_ABI,
        functionName: 'executeTrade',
        args: [
          userAddress,
          signal.tokenAddress as `0x${string}`,
          tradeAmount,
          signal.minAmountOut,
          true // Use wrapped path for better liquidity
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

      // 5. Record the trade in subscription
      await subscriptionService.recordTrade(userAddress);

      logger.info('Trade executed successfully', {
        chainId,
        userAddress,
        txHash,
        amountIn: formatUnits(tradeAmount, 6)
      });

      return {
        success: true,
        txHash,
        amountIn: formatUnits(tradeAmount, 6)
      };
    } catch (err: any) {
      logger.error('Trade execution failed', {
        chainId,
        userAddress,
        error: err.message
      });
      return { success: false, error: err.message };
    }
  }

  /**
   * Get all users with auto-trade enabled on a chain
   */
  async getAutoTradeUsers(chainId: ChainId): Promise<`0x${string}`[]> {
    // This would typically query events or use a subgraph
    // For now, we use Supabase
    const addresses = await subscriptionService.getAutoTradeUsers();
    return addresses as `0x${string}`[];
  }
}

export const tradingService = new TradingService();
