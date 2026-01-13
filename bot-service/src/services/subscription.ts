import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { config } from '../config';
import { logger } from '../utils/logger';

export interface UserSubscription {
  userId: string;
  walletAddress: string;
  planTier: 'free' | 'starter' | 'pro' | 'elite' | 'desktop';
  status: 'active' | 'expired' | 'cancelled';
  dailyTradesUsed: number;
  dailyTradesResetAt: Date;
  totalTradesUsed: number; // For free tier: lifetime trade count
  endDate: Date;
  timezone: string; // User's timezone for daily reset (e.g., 'America/New_York')
}

export interface TradePermission {
  allowed: boolean;
  reason?: string;
  dailyTradesRemaining: number;
  planTier: string;
}

export interface UserTradingSettings {
  takeProfitPercent: number;
  stopLossPercent: number;
  askPermission: boolean;
}

export class SubscriptionService {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(
      config.supabaseUrl,
      config.supabaseServiceKey
    );
  }

  /**
   * Get user_id from user_wallets table (supports multiple wallets per user)
   */
  async getUserIdFromWallet(walletAddress: string): Promise<string | null> {
    try {
      const wallet = walletAddress.toLowerCase();

      // First try user_wallets table (new system - multiple wallets per user)
      const { data: userWallet } = await this.supabase
        .from('user_wallets')
        .select('user_id')
        .eq('wallet_address', wallet)
        .single();

      if (userWallet?.user_id) {
        return userWallet.user_id;
      }

      // Fallback: check subscriptions.wallet_address (legacy)
      const { data: sub } = await this.supabase
        .from('subscriptions')
        .select('user_id')
        .eq('wallet_address', wallet)
        .single();

      return sub?.user_id || null;
    } catch (err) {
      logger.debug('getUserIdFromWallet lookup failed', { walletAddress, error: err });
      return null;
    }
  }

  /**
   * Get user subscription by wallet address
   * NEW: First looks up user via user_wallets table, then gets subscription by user_id
   * This supports multiple wallets per user!
   */
  async getSubscription(walletAddress: string): Promise<UserSubscription | null> {
    try {
      const wallet = walletAddress.toLowerCase();

      // Step 1: Find user_id via user_wallets or subscription
      const userId = await this.getUserIdFromWallet(wallet);

      if (!userId) {
        logger.debug('No user found for wallet', { wallet: wallet.slice(0, 10) });
        return null;
      }

      // Step 2: Get subscription by user_id (not wallet!)
      const { data, error } = await this.supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active')
        .single();

      if (error || !data) {
        // Fallback: try direct wallet lookup (legacy)
        const { data: legacyData, error: legacyError } = await this.supabase
          .from('subscriptions')
          .select('*')
          .eq('wallet_address', wallet)
          .single();

        if (legacyError || !legacyData) {
          logger.debug('No subscription found for user', { userId: userId.slice(0, 8), wallet: wallet.slice(0, 10) });
          return null;
        }

        return {
          userId: legacyData.user_id,
          walletAddress: wallet, // Use current wallet, not stored one
          planTier: legacyData.plan_tier,
          status: legacyData.status,
          dailyTradesUsed: legacyData.daily_trades_used,
          dailyTradesResetAt: new Date(legacyData.daily_trades_reset_at),
          totalTradesUsed: legacyData.total_trades_used || 0,
          endDate: new Date(legacyData.end_date),
          timezone: legacyData.timezone || 'UTC'
        };
      }

      logger.debug('Found subscription via user_id', {
        userId: userId.slice(0, 8),
        wallet: wallet.slice(0, 10),
        planTier: data.plan_tier
      });

      return {
        userId: data.user_id,
        walletAddress: wallet, // Use current wallet, not stored one
        planTier: data.plan_tier,
        status: data.status,
        dailyTradesUsed: data.daily_trades_used,
        dailyTradesResetAt: new Date(data.daily_trades_reset_at),
        totalTradesUsed: data.total_trades_used || 0,
        endDate: new Date(data.end_date),
        timezone: data.timezone || 'UTC'
      };
    } catch (err) {
      logger.error('Failed to get subscription', { walletAddress, error: err });
      return null;
    }
  }

  /**
   * Check if user can make a trade
   */
  async canTrade(walletAddress: string): Promise<TradePermission> {
    const subscription = await this.getSubscription(walletAddress);

    // No subscription found
    if (!subscription) {
      return {
        allowed: false,
        reason: 'No active subscription found',
        dailyTradesRemaining: 0,
        planTier: 'none'
      };
    }

    // Check if subscription is active
    if (subscription.status !== 'active') {
      return {
        allowed: false,
        reason: `Subscription is ${subscription.status}`,
        dailyTradesRemaining: 0,
        planTier: subscription.planTier
      };
    }

    // Check if subscription is expired
    const now = new Date();
    if (now > subscription.endDate) {
      return {
        allowed: false,
        reason: 'Subscription has expired',
        dailyTradesRemaining: 0,
        planTier: subscription.planTier
      };
    }

    // Free tier: check total trades limit (2 trades total, then subscription required)
    if (subscription.planTier === 'free') {
      const FREE_TIER_TOTAL_LIMIT = 2;
      const totalUsed = subscription.totalTradesUsed || 0;

      if (totalUsed >= FREE_TIER_TOTAL_LIMIT) {
        return {
          allowed: false,
          reason: `Free trial ended. You've used your ${FREE_TIER_TOTAL_LIMIT} free trades. Subscribe to continue!`,
          dailyTradesRemaining: 0,
          planTier: subscription.planTier
        };
      }

      // Free tier can trade (within limit)
      return {
        allowed: true,
        dailyTradesRemaining: FREE_TIER_TOTAL_LIMIT - totalUsed,
        planTier: subscription.planTier
      };
    }

    // Get trade limits for this tier
    const limits = config.subscriptionLimits[subscription.planTier];
    if (!limits) {
      return {
        allowed: false,
        reason: 'Invalid subscription tier',
        dailyTradesRemaining: 0,
        planTier: subscription.planTier
      };
    }

    // Reset daily trades if needed
    if (now > subscription.dailyTradesResetAt) {
      await this.resetDailyTrades(subscription.userId, subscription.timezone);
      subscription.dailyTradesUsed = 0;
    }

    // Check daily trade limit (unlimited = -1)
    const dailyLimit = limits.dailyTrades;
    const dailyTradesRemaining = dailyLimit === -1
      ? -1 // Unlimited
      : Math.max(0, dailyLimit - subscription.dailyTradesUsed);

    if (dailyLimit !== -1 && dailyTradesRemaining <= 0) {
      return {
        allowed: false,
        reason: 'Daily trade limit reached',
        dailyTradesRemaining: 0,
        planTier: subscription.planTier
      };
    }

    return {
      allowed: true,
      dailyTradesRemaining,
      planTier: subscription.planTier
    };
  }

  /**
   * Record a trade (increment daily and total counters)
   */
  async recordTrade(walletAddress: string): Promise<boolean> {
    try {
      const subscription = await this.getSubscription(walletAddress);
      if (!subscription) return false;

      const newDailyCount = subscription.dailyTradesUsed + 1;
      const newTotalCount = (subscription.totalTradesUsed || 0) + 1;

      const { error } = await this.supabase
        .from('subscriptions')
        .update({
          daily_trades_used: newDailyCount,
          total_trades_used: newTotalCount,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', subscription.userId);

      if (error) {
        logger.error('Failed to record trade', { walletAddress, error });
        return false;
      }

      logger.info('Trade recorded', {
        walletAddress,
        dailyCount: newDailyCount,
        totalCount: newTotalCount,
        planTier: subscription.planTier
      });

      return true;
    } catch (err) {
      logger.error('Error recording trade', { error: err });
      return false;
    }
  }

  /**
   * Reset daily trades counter
   * Calculates next midnight in user's timezone
   */
  private async resetDailyTrades(userId: string, timezone: string = 'UTC'): Promise<void> {
    // Calculate next midnight in user's timezone
    const nextResetAt = this.getNextMidnight(timezone);

    await this.supabase
      .from('subscriptions')
      .update({
        daily_trades_used: 0,
        daily_trades_reset_at: nextResetAt.toISOString()
      })
      .eq('user_id', userId);

    logger.info('Daily trades reset', { userId, timezone, nextReset: nextResetAt.toISOString() });
  }

  /**
   * Calculate next midnight in a given timezone
   */
  private getNextMidnight(timezone: string): Date {
    try {
      // Get current time in user's timezone
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });

      // Get parts in user's timezone
      const parts = formatter.formatToParts(now);
      const get = (type: string) => parts.find(p => p.type === type)?.value || '0';

      // Calculate tomorrow's date in user's timezone
      const year = parseInt(get('year'));
      const month = parseInt(get('month')) - 1;
      const day = parseInt(get('day')) + 1;

      // Create a Date at midnight tomorrow in user's timezone
      // This requires converting from user's local midnight to UTC
      const userMidnight = new Date(Date.UTC(year, month, day, 0, 0, 0));

      // Get the offset for this timezone at that time
      const testDate = new Date(year, month, day, 0, 0, 0);
      const utcTime = testDate.toLocaleString('en-US', { timeZone: 'UTC' });
      const tzTime = testDate.toLocaleString('en-US', { timeZone: timezone });
      const offset = new Date(utcTime).getTime() - new Date(tzTime).getTime();

      // Adjust for timezone offset
      return new Date(userMidnight.getTime() + offset);
    } catch (err) {
      // Fallback to UTC if timezone is invalid
      logger.warn('Invalid timezone, falling back to UTC', { timezone, error: err });
      const tomorrow = new Date();
      tomorrow.setUTCHours(0, 0, 0, 0);
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      return tomorrow;
    }
  }

  /**
   * Get user's custom TP/SL settings from vault_settings
   */
  async getUserTradingSettings(walletAddress: string, chainId: number): Promise<UserTradingSettings> {
    try {
      const { data, error } = await this.supabase
        .from('vault_settings')
        .select('take_profit_percent, stop_loss_percent, ask_permission')
        .eq('wallet_address', walletAddress.toLowerCase())
        .eq('chain_id', chainId)
        .single();

      if (error || !data) {
        // Return defaults if not found
        return { takeProfitPercent: 5, stopLossPercent: 1, askPermission: false };
      }

      return {
        takeProfitPercent: data.take_profit_percent || 5,
        stopLossPercent: data.stop_loss_percent || 1,
        askPermission: data.ask_permission || false
      };
    } catch (err) {
      logger.error('Failed to get user trading settings', { walletAddress, error: err });
      return { takeProfitPercent: 5, stopLossPercent: 1, askPermission: false };
    }
  }

  /**
   * Create a pending trade approval (when ask_permission is enabled)
   */
  async createPendingApproval(params: {
    walletAddress: string;
    chainId: number;
    tokenAddress: string;
    tokenSymbol: string;
    direction: 'LONG' | 'SHORT';
    amountUsdc: number;
    entryPrice: number;
    confidence: number;
    riskReward: number;
    analysisSummary: string;
  }): Promise<string | null> {
    try {
      // First get user_id from wallet
      const { data: sub } = await this.supabase
        .from('subscriptions')
        .select('user_id')
        .eq('wallet_address', params.walletAddress.toLowerCase())
        .single();

      if (!sub?.user_id) {
        logger.error('No user found for wallet', { wallet: params.walletAddress });
        return null;
      }

      // Expire any existing pending approvals for this user
      await this.supabase
        .from('pending_trade_approvals')
        .update({ status: 'expired' })
        .eq('user_id', sub.user_id)
        .eq('status', 'pending');

      // Create new pending approval
      const { data, error } = await this.supabase
        .from('pending_trade_approvals')
        .insert({
          user_id: sub.user_id,
          wallet_address: params.walletAddress.toLowerCase(),
          chain_id: params.chainId,
          token_address: params.tokenAddress,
          token_symbol: params.tokenSymbol,
          direction: params.direction,
          amount_usdc: params.amountUsdc,
          entry_price: params.entryPrice,
          confidence: params.confidence,
          risk_reward: params.riskReward,
          analysis_summary: params.analysisSummary,
          status: 'pending',
          expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString() // 5 minutes
        })
        .select('id')
        .single();

      if (error) {
        logger.error('Failed to create pending approval', { error });
        return null;
      }

      logger.info('Created pending trade approval', {
        id: data.id,
        wallet: params.walletAddress.slice(0, 10),
        token: params.tokenSymbol,
        direction: params.direction,
        amount: params.amountUsdc
      });

      return data.id;
    } catch (err) {
      logger.error('Error creating pending approval', { error: err });
      return null;
    }
  }

  /**
   * Get all approved trades waiting for execution
   */
  async getApprovedTrades(): Promise<Array<{
    id: string;
    walletAddress: string;
    chainId: number;
    tokenAddress: string;
    tokenSymbol: string;
    direction: 'LONG' | 'SHORT';
    amountUsdc: number;
  }>> {
    try {
      const { data, error } = await this.supabase
        .from('pending_trade_approvals')
        .select('*')
        .eq('status', 'approved')
        .order('responded_at', { ascending: true });

      if (error || !data) {
        return [];
      }

      return data.map(d => ({
        id: d.id,
        walletAddress: d.wallet_address,
        chainId: d.chain_id,
        tokenAddress: d.token_address,
        tokenSymbol: d.token_symbol,
        direction: d.direction as 'LONG' | 'SHORT',
        amountUsdc: parseFloat(d.amount_usdc)
      }));
    } catch (err) {
      logger.error('Error getting approved trades', { error: err });
      return [];
    }
  }

  /**
   * Mark a pending approval as executed
   */
  async markApprovalExecuted(approvalId: string, txHash?: string): Promise<void> {
    try {
      await this.supabase
        .from('pending_trade_approvals')
        .update({
          status: 'executed',
          executed_at: new Date().toISOString()
        })
        .eq('id', approvalId);
    } catch (err) {
      logger.error('Error marking approval executed', { error: err, approvalId });
    }
  }

  /**
   * Expire old pending approvals
   */
  async expireOldApprovals(): Promise<void> {
    try {
      await this.supabase
        .from('pending_trade_approvals')
        .update({ status: 'expired' })
        .eq('status', 'pending')
        .lt('expires_at', new Date().toISOString());
    } catch (err) {
      logger.error('Error expiring approvals', { error: err });
    }
  }

  /**
   * Get auto-trade status from database for a user
   */
  async getAutoTradeStatus(walletAddress: string): Promise<boolean> {
    try {
      const { data } = await this.supabase
        .from('vault_settings')
        .select('auto_trade_enabled')
        .eq('wallet_address', walletAddress.toLowerCase())
        .single();

      return data?.auto_trade_enabled || false;
    } catch {
      return false;
    }
  }

  /**
   * Sync vault_settings from on-chain state
   * Creates or updates vault_settings when on-chain autoTrade is enabled
   */
  async syncVaultSettings(walletAddress: string, chainId: number, settings: {
    autoTradeEnabled: boolean;
    balance: string;
    riskLevel: number;
  }): Promise<void> {
    try {
      const wallet = walletAddress.toLowerCase();

      // Upsert vault_settings
      const { error } = await this.supabase
        .from('vault_settings')
        .upsert({
          wallet_address: wallet,
          chain_id: chainId,
          auto_trade_enabled: settings.autoTradeEnabled,
          risk_level: settings.riskLevel || 100,
          // Default TP/SL
          take_profit_percent: 5,
          stop_loss_percent: 1.5,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'wallet_address,chain_id'
        });

      if (error) {
        logger.error('Failed to sync vault_settings', { wallet, chainId, error });
      } else {
        logger.info('Vault settings synced from on-chain state', {
          wallet: wallet.slice(0, 10),
          chainId,
          autoTrade: settings.autoTradeEnabled,
          balance: settings.balance
        });
      }
    } catch (err) {
      logger.error('Error syncing vault_settings', { walletAddress, error: err });
    }
  }

  /**
   * Check if user has an active bot ban (24h after manual close)
   * Returns ban end time if banned, null if not banned
   */
  async getBotBanStatus(walletAddress: string, chainId: number): Promise<{ isBanned: boolean; bannedUntil: Date | null; remainingMs: number }> {
    try {
      const { data } = await this.supabase
        .from('vault_settings')
        .select('bot_banned_until')
        .eq('wallet_address', walletAddress.toLowerCase())
        .eq('chain_id', chainId)
        .single();

      if (!data?.bot_banned_until) {
        return { isBanned: false, bannedUntil: null, remainingMs: 0 };
      }

      const bannedUntil = new Date(data.bot_banned_until);
      const now = new Date();
      const remainingMs = bannedUntil.getTime() - now.getTime();

      if (remainingMs <= 0) {
        // Ban expired - clear it
        await this.supabase
          .from('vault_settings')
          .update({ bot_banned_until: null })
          .eq('wallet_address', walletAddress.toLowerCase())
          .eq('chain_id', chainId);

        return { isBanned: false, bannedUntil: null, remainingMs: 0 };
      }

      return { isBanned: true, bannedUntil, remainingMs };
    } catch (err) {
      logger.error('Error checking bot ban status', { walletAddress, error: err });
      return { isBanned: false, bannedUntil: null, remainingMs: 0 };
    }
  }

  /**
   * Get all users with auto-trade enabled for a specific chain
   * NEW: Combines vault_settings + subscribed users + ALL user_wallets
   * This ensures users with multiple wallets are found!
   */
  async getAutoTradeUsers(chainId?: number): Promise<string[]> {
    try {
      const allAddresses = new Set<string>();

      // 1. Get users from vault_settings (those who explicitly enabled auto-trade in UI)
      let vaultQuery = this.supabase
        .from('vault_settings')
        .select('wallet_address')
        .eq('auto_trade_enabled', true);

      if (chainId) {
        vaultQuery = vaultQuery.eq('chain_id', chainId);
      }

      const { data: vaultData } = await vaultQuery;
      if (vaultData) {
        vaultData.forEach(d => {
          if (d.wallet_address) allAddresses.add(d.wallet_address.toLowerCase());
        });
      }

      // 2. Get all subscribed users
      const { data: subData } = await this.supabase
        .from('subscriptions')
        .select('user_id, wallet_address')
        .eq('status', 'active')
        .neq('plan_tier', 'free');

      if (subData) {
        // Add wallet from subscription
        subData.forEach(d => {
          if (d.wallet_address) allAddresses.add(d.wallet_address.toLowerCase());
        });

        // 3. NEW: Also get ALL wallets for each subscribed user from user_wallets
        const userIds = subData.map(d => d.user_id).filter(Boolean);
        if (userIds.length > 0) {
          const { data: userWallets } = await this.supabase
            .from('user_wallets')
            .select('wallet_address')
            .in('user_id', userIds);

          if (userWallets) {
            userWallets.forEach(w => {
              if (w.wallet_address) allAddresses.add(w.wallet_address.toLowerCase());
            });
            logger.debug('Added wallets from user_wallets table', {
              count: userWallets.length
            });
          }
        }
      }

      const addresses = Array.from(allAddresses);

      if (addresses.length > 0) {
        logger.info('Found potential auto-trade users', {
          chainId,
          fromVaultSettings: vaultData?.length || 0,
          fromSubscriptions: subData?.length || 0,
          totalUnique: addresses.length,
          wallets: addresses.map(a => a?.slice(0, 10))
        });
      }

      return addresses;
    } catch (err) {
      logger.error('Failed to get auto-trade users', { error: err });
      return [];
    }
  }

  /**
   * Ensure all vault_settings users have subscriptions
   * Creates elite subscriptions for users with auto-trade but no subscription
   */
  async ensureSubscriptionsForVaultUsers(): Promise<void> {
    try {
      // Get all users with auto-trade enabled
      const { data: vaultUsers } = await this.supabase
        .from('vault_settings')
        .select('wallet_address')
        .eq('auto_trade_enabled', true);

      if (!vaultUsers || vaultUsers.length === 0) return;

      for (const user of vaultUsers) {
        const wallet = user.wallet_address.toLowerCase();

        // Check if subscription exists
        const { data: existing } = await this.supabase
          .from('subscriptions')
          .select('id')
          .eq('wallet_address', wallet)
          .single();

        if (!existing) {
          // Find an elite subscription without a wallet address, or any active subscription we can upgrade
          const { data: unlinkedSub } = await this.supabase
            .from('subscriptions')
            .select('id, wallet_address, plan_tier')
            .is('wallet_address', null)
            .eq('status', 'active')
            .limit(1)
            .single();

          if (unlinkedSub) {
            // Link this wallet to the unlinked subscription and upgrade to elite
            const { error } = await this.supabase
              .from('subscriptions')
              .update({
                wallet_address: wallet,
                plan_tier: 'elite'
              })
              .eq('id', unlinkedSub.id);

            if (!error) {
              logger.info('Linked wallet to existing subscription and upgraded to elite', { wallet: wallet.slice(0, 10) });
            } else {
              logger.error('Failed to link wallet to subscription', { wallet: wallet.slice(0, 10), error });
            }
          } else {
            // No unlinked subscription found - log warning
            logger.warn('No unlinked subscription found for vault user - they need to purchase a subscription', { wallet: wallet.slice(0, 10) });
          }
        }
      }
    } catch (err) {
      logger.error('Failed to ensure subscriptions for vault users', { error: err });
    }
  }
}

export const subscriptionService = new SubscriptionService();
