import { createPublicClient, http, parseAbi, formatUnits } from 'viem';
import { arbitrum } from 'viem/chains';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from '../utils/logger';

// ERC20 Transfer event ABI
const ERC20_ABI = parseAbi([
  'event Transfer(address indexed from, address indexed to, uint256 value)'
]);

interface PaymentRecord {
  txHash: string;
  from: string;
  amount: number;
  chainId: number;
  timestamp: Date;
  planTier?: string;
  billingCycle?: string;
}

interface PendingPayment {
  id: string;
  userId: string;
  walletAddress: string;
  planTier: string;
  billingCycle: string;
  expectedAmount: number;
  createdAt: Date;
}

export class PaymentService {
  private supabase;
  private publicClient;
  private processedTxs: Set<string> = new Set();
  private isMonitoring = false;

  constructor() {
    this.supabase = createClient(
      config.supabaseUrl,
      config.supabaseServiceKey
    );

    // Arbitrum only
    this.publicClient = createPublicClient({
      chain: arbitrum,
      transport: http(config.arbitrum.rpcUrl)
    });

    logger.info('Payment service initialized', {
      treasury: config.treasuryAddress,
      chain: 'Arbitrum'
    });
  }

  /**
   * Start monitoring treasury for incoming payments
   */
  async startMonitoring() {
    if (this.isMonitoring) {
      logger.warn('Payment monitoring already running');
      return;
    }

    this.isMonitoring = true;
    logger.info('Starting payment monitoring on Arbitrum...');

    // Monitor Arbitrum for USDC transfers
    await this.monitorPayments();
  }

  /**
   * Monitor for USDC transfers to treasury
   */
  private async monitorPayments() {
    const usdcAddress = config.arbitrum.usdcAddress;

    logger.info('Monitoring USDC transfers', {
      chain: 'Arbitrum',
      usdc: usdcAddress,
      treasury: config.treasuryAddress
    });

    // Watch for Transfer events to treasury
    this.publicClient.watchContractEvent({
      address: usdcAddress,
      abi: ERC20_ABI,
      eventName: 'Transfer',
      args: {
        to: config.treasuryAddress
      },
      onLogs: async (logs) => {
        for (const log of logs) {
          await this.processPayment(log, config.arbitrum.chainId);
        }
      },
      onError: (error) => {
        logger.error('Payment monitoring error', { error: error.message });
      }
    });
  }

  /**
   * Process an incoming payment
   */
  private async processPayment(log: any, chainId: number) {
    const txHash = log.transactionHash;

    // Skip if already processed
    if (this.processedTxs.has(txHash)) {
      return;
    }

    this.processedTxs.add(txHash);

    const from = log.args.from as string;
    const value = log.args.value as bigint;
    const amount = parseFloat(formatUnits(value, 6)); // USDC has 6 decimals

    logger.info('Payment received', {
      from: from.slice(0, 10),
      amount,
      txHash: txHash.slice(0, 10),
      chain: 'Arbitrum'
    });

    // Check if this matches a pending payment
    await this.matchPendingPayment(from, amount, txHash, chainId);
  }

  /**
   * Match payment with pending subscription
   */
  private async matchPendingPayment(
    from: string,
    amount: number,
    txHash: string,
    chainId: number
  ) {
    try {
      // Find pending payment from this wallet
      const { data: pending } = await this.supabase
        .from('pending_payments')
        .select('*')
        .eq('wallet_address', from.toLowerCase())
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!pending) {
        logger.info('No pending payment found for wallet', { from: from.slice(0, 10) });
        return;
      }

      // Check if amount matches (with 1% tolerance)
      const tolerance = pending.expected_amount * 0.01;
      if (Math.abs(amount - pending.expected_amount) > tolerance) {
        logger.warn('Payment amount mismatch', {
          expected: pending.expected_amount,
          received: amount
        });
        return;
      }

      // Update pending payment to confirmed
      await this.supabase
        .from('pending_payments')
        .update({
          status: 'confirmed',
          tx_hash: txHash,
          confirmed_at: new Date().toISOString()
        })
        .eq('id', pending.id);

      // Activate subscription
      await this.activateSubscription(pending);

      logger.info('Payment confirmed and subscription activated', {
        userId: pending.user_id,
        plan: pending.plan_tier
      });

    } catch (err) {
      logger.error('Error matching payment', { error: err });
    }
  }

  /**
   * Activate subscription after payment confirmation
   */
  private async activateSubscription(pending: any) {
    const now = new Date();
    const expiresAt = new Date(now);

    if (pending.billing_cycle === 'yearly') {
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    } else {
      expiresAt.setMonth(expiresAt.getMonth() + 1);
    }

    // Create subscription record
    await this.supabase.from('subscriptions').insert({
      user_id: pending.user_id,
      plan_tier: pending.plan_tier,
      billing_cycle: pending.billing_cycle,
      status: 'active',
      amount_paid: pending.expected_amount,
      started_at: now.toISOString(),
      expires_at: expiresAt.toISOString()
    });

    // Update user's membership tier in profiles
    await this.supabase
      .from('profiles')
      .update({ membership_tier: pending.plan_tier })
      .eq('id', pending.user_id);
  }

  /**
   * Create a pending payment record
   */
  async createPendingPayment(
    userId: string,
    walletAddress: string,
    planTier: string,
    billingCycle: 'monthly' | 'yearly'
  ): Promise<{ amount: number; treasury: string }> {
    const prices = config.subscriptionPrices[planTier as keyof typeof config.subscriptionPrices];
    const amount = billingCycle === 'yearly' ? prices.yearly : prices.monthly;

    await this.supabase.from('pending_payments').insert({
      user_id: userId,
      wallet_address: walletAddress.toLowerCase(),
      plan_tier: planTier,
      billing_cycle: billingCycle,
      expected_amount: amount,
      status: 'pending'
    });

    return {
      amount,
      treasury: config.treasuryAddress
    };
  }

  /**
   * Check payment status
   */
  async checkPaymentStatus(userId: string): Promise<'pending' | 'confirmed' | 'none'> {
    const { data } = await this.supabase
      .from('pending_payments')
      .select('status')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    return data?.status || 'none';
  }
}

export const paymentService = new PaymentService();
