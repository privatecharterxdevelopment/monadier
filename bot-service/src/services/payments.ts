import { createPublicClient, http, parseAbi, formatUnits } from 'viem';
import { base } from 'viem/chains';
import { createClient } from '@supabase/supabase-js';
import { config, ChainId } from '../config';
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
  private clients: Map<number, ReturnType<typeof createPublicClient>> = new Map();
  private processedTxs: Set<string> = new Set();
  private isMonitoring = false;

  constructor() {
    this.supabase = createClient(
      config.supabaseUrl,
      config.supabaseServiceKey
    );

    // Initialize clients for each chain
    this.initializeClients();
  }

  private initializeClients() {
    // Base (main chain for payments)
    this.clients.set(8453, createPublicClient({
      chain: base,
      transport: http(config.chains[8453].rpcUrl)
    }));

    logger.info('Payment service initialized', {
      treasury: config.treasuryAddress,
      chains: [8453]
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
    logger.info('Starting payment monitoring...');

    // Monitor Base chain (primary payment chain)
    await this.monitorChain(8453);
  }

  /**
   * Monitor a specific chain for USDC transfers to treasury
   */
  private async monitorChain(chainId: ChainId) {
    const client = this.clients.get(chainId);
    const usdcAddress = config.usdcAddresses[chainId as keyof typeof config.usdcAddresses];

    if (!client || !usdcAddress) {
      logger.error('Cannot monitor chain - missing client or USDC address', { chainId });
      return;
    }

    logger.info('Monitoring USDC transfers', {
      chain: config.chains[chainId].name,
      usdc: usdcAddress,
      treasury: config.treasuryAddress
    });

    // Watch for Transfer events to treasury
    client.watchContractEvent({
      address: usdcAddress as `0x${string}`,
      abi: ERC20_ABI,
      eventName: 'Transfer',
      args: {
        to: config.treasuryAddress
      },
      onLogs: async (logs) => {
        for (const log of logs) {
          await this.handleTransfer(log, chainId);
        }
      },
      onError: (error) => {
        logger.error('Error watching transfers', { chainId, error: error.message });
      }
    });
  }

  /**
   * Handle incoming USDC transfer
   */
  private async handleTransfer(log: any, chainId: number) {
    const txHash = log.transactionHash;

    // Skip if already processed
    if (this.processedTxs.has(txHash)) {
      return;
    }
    this.processedTxs.add(txHash);

    const from = log.args.from?.toLowerCase();
    const value = log.args.value;
    const amount = parseFloat(formatUnits(value, 6)); // USDC has 6 decimals

    logger.info('Incoming USDC transfer detected', {
      txHash,
      from,
      amount,
      chainId
    });

    // Process the payment
    await this.processPayment({
      txHash,
      from,
      amount,
      chainId,
      timestamp: new Date()
    });
  }

  /**
   * Process a payment and activate subscription
   */
  async processPayment(payment: PaymentRecord): Promise<boolean> {
    try {
      // 1. Find user by wallet address
      const { data: subscription, error: subError } = await this.supabase
        .from('subscriptions')
        .select('*, profiles!inner(email)')
        .eq('wallet_address', payment.from)
        .single();

      if (subError || !subscription) {
        // Try to find pending payment request
        const { data: pendingPayment } = await this.supabase
          .from('pending_payments')
          .select('*')
          .eq('wallet_address', payment.from)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (pendingPayment) {
          return await this.activateFromPending(payment, pendingPayment);
        }

        logger.warn('No subscription or pending payment found for wallet', {
          wallet: payment.from,
          amount: payment.amount
        });
        return false;
      }

      // 2. Determine plan based on amount
      const plan = this.determinePlan(payment.amount);
      if (!plan) {
        logger.warn('Unknown payment amount - cannot determine plan', {
          amount: payment.amount,
          wallet: payment.from
        });
        return false;
      }

      // 3. Update subscription
      const endDate = this.calculateEndDate(plan.billingCycle);

      const { error: updateError } = await this.supabase
        .from('subscriptions')
        .update({
          plan_tier: plan.tier,
          billing_cycle: plan.billingCycle,
          status: 'active',
          start_date: new Date().toISOString(),
          end_date: endDate.toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('wallet_address', payment.from);

      if (updateError) {
        logger.error('Failed to update subscription', { error: updateError });
        return false;
      }

      // 4. Record payment
      await this.recordPayment(payment, subscription.user_id, plan);

      logger.info('Subscription activated!', {
        wallet: payment.from,
        plan: plan.tier,
        billingCycle: plan.billingCycle,
        amount: payment.amount,
        txHash: payment.txHash
      });

      return true;
    } catch (err) {
      logger.error('Error processing payment', { error: err, payment });
      return false;
    }
  }

  /**
   * Activate subscription from pending payment request
   */
  private async activateFromPending(payment: PaymentRecord, pending: any): Promise<boolean> {
    try {
      const endDate = this.calculateEndDate(pending.billing_cycle);

      // Update or create subscription
      const { error } = await this.supabase
        .from('subscriptions')
        .upsert({
          user_id: pending.user_id,
          wallet_address: payment.from,
          plan_tier: pending.plan_tier,
          billing_cycle: pending.billing_cycle,
          status: 'active',
          start_date: new Date().toISOString(),
          end_date: endDate.toISOString(),
          daily_trades_used: 0,
          total_trades_used: 0,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });

      if (error) {
        logger.error('Failed to activate subscription from pending', { error });
        return false;
      }

      // Mark pending payment as completed
      await this.supabase
        .from('pending_payments')
        .update({
          status: 'completed',
          tx_hash: payment.txHash,
          completed_at: new Date().toISOString()
        })
        .eq('id', pending.id);

      // Record payment
      await this.recordPayment(payment, pending.user_id, {
        tier: pending.plan_tier,
        billingCycle: pending.billing_cycle
      });

      logger.info('Subscription activated from pending payment', {
        userId: pending.user_id,
        plan: pending.plan_tier,
        amount: payment.amount
      });

      return true;
    } catch (err) {
      logger.error('Error activating from pending', { error: err });
      return false;
    }
  }

  /**
   * Determine subscription plan from payment amount
   * EXACT match required - USDC has no transfer fees
   */
  private determinePlan(amount: number): { tier: string; billingCycle: string } | null {
    const { subscriptionPrices } = config;

    // EXACT match - no tolerance. We want our full payment.
    // Starter
    if (amount === subscriptionPrices.starter.monthly) {
      return { tier: 'starter', billingCycle: 'monthly' };
    }
    if (amount === subscriptionPrices.starter.yearly) {
      return { tier: 'starter', billingCycle: 'yearly' };
    }

    // Pro
    if (amount === subscriptionPrices.pro.monthly) {
      return { tier: 'pro', billingCycle: 'monthly' };
    }
    if (amount === subscriptionPrices.pro.yearly) {
      return { tier: 'pro', billingCycle: 'yearly' };
    }

    // Elite
    if (amount === subscriptionPrices.elite.monthly) {
      return { tier: 'elite', billingCycle: 'monthly' };
    }
    if (amount === subscriptionPrices.elite.yearly) {
      return { tier: 'elite', billingCycle: 'yearly' };
    }

    return null;
  }

  /**
   * Calculate subscription end date
   */
  private calculateEndDate(billingCycle: string): Date {
    const now = new Date();
    if (billingCycle === 'monthly') {
      now.setMonth(now.getMonth() + 1);
    } else if (billingCycle === 'yearly') {
      now.setFullYear(now.getFullYear() + 1);
    } else {
      // Lifetime
      now.setFullYear(now.getFullYear() + 100);
    }
    return now;
  }

  /**
   * Record payment in database
   */
  private async recordPayment(payment: PaymentRecord, userId: string, plan: { tier: string; billingCycle: string }) {
    try {
      await this.supabase.from('payments').insert({
        user_id: userId,
        amount: Math.round(payment.amount * 100), // Store in cents
        currency: 'usdc',
        status: 'succeeded',
        plan_tier: plan.tier,
        billing_cycle: plan.billingCycle,
        stripe_payment_id: payment.txHash, // Using this field for tx hash
        chain_id: payment.chainId,
        wallet_address: payment.from
      });
    } catch (err) {
      logger.error('Failed to record payment', { error: err });
    }
  }

  /**
   * Manually verify a transaction
   */
  async verifyTransaction(txHash: string, chainId: number = 8453): Promise<boolean> {
    const client = this.clients.get(chainId);
    if (!client) {
      logger.error('No client for chain', { chainId });
      return false;
    }

    try {
      const receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });

      if (receipt.status !== 'success') {
        logger.warn('Transaction failed', { txHash });
        return false;
      }

      // Parse logs to find USDC transfer
      const usdcAddress = config.usdcAddresses[chainId as keyof typeof config.usdcAddresses]?.toLowerCase();

      for (const log of receipt.logs) {
        if (log.address.toLowerCase() === usdcAddress) {
          // This is a USDC transfer
          const to = `0x${log.topics[2]?.slice(26)}`.toLowerCase();

          if (to === config.treasuryAddress.toLowerCase()) {
            // Transfer to treasury - process it
            const amount = parseFloat(formatUnits(BigInt(log.data), 6));
            const from = `0x${log.topics[1]?.slice(26)}`.toLowerCase();

            return await this.processPayment({
              txHash,
              from,
              amount,
              chainId,
              timestamp: new Date()
            });
          }
        }
      }

      logger.warn('No USDC transfer to treasury found in tx', { txHash });
      return false;
    } catch (err) {
      logger.error('Error verifying transaction', { txHash, error: err });
      return false;
    }
  }

  /**
   * Create a pending payment record (called when user initiates payment)
   */
  async createPendingPayment(userId: string, walletAddress: string, planTier: string, billingCycle: string, expectedAmount: number): Promise<string | null> {
    try {
      const { data, error } = await this.supabase
        .from('pending_payments')
        .insert({
          user_id: userId,
          wallet_address: walletAddress.toLowerCase(),
          plan_tier: planTier,
          billing_cycle: billingCycle,
          expected_amount: expectedAmount,
          status: 'pending'
        })
        .select('id')
        .single();

      if (error) {
        logger.error('Failed to create pending payment', { error });
        return null;
      }

      return data.id;
    } catch (err) {
      logger.error('Error creating pending payment', { error: err });
      return null;
    }
  }
}

export const paymentService = new PaymentService();
