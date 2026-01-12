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
   * Get user subscription by wallet address
   */
  async getSubscription(walletAddress: string): Promise<UserSubscription | null> {
    try {
      const { data, error } = await this.supabase
        .from('subscriptions')
        .select('*')
        .eq('wallet_address', walletAddress.toLowerCase())
        .single();

      if (error || !data) {
        return null;
      }

      return {
        userId: data.user_id,
        walletAddress: data.wallet_address,
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
        .select('take_profit_percent, stop_loss_percent')
        .eq('wallet_address', walletAddress.toLowerCase())
        .eq('chain_id', chainId)
        .single();

      if (error || !data) {
        // Return defaults if not found
        return { takeProfitPercent: 5, stopLossPercent: 1 };
      }

      return {
        takeProfitPercent: data.take_profit_percent || 5,
        stopLossPercent: data.stop_loss_percent || 1
      };
    } catch (err) {
      logger.error('Failed to get user trading settings', { walletAddress, error: err });
      return { takeProfitPercent: 5, stopLossPercent: 1 };
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
   * Get all users with auto-trade enabled
   * Falls back to subscriptions table if vault_settings is empty
   */
  async getAutoTradeUsers(): Promise<string[]> {
    try {
      // First try vault_settings
      const { data: vaultData } = await this.supabase
        .from('vault_settings')
        .select('wallet_address')
        .eq('auto_trade_enabled', true);

      if (vaultData && vaultData.length > 0) {
        return vaultData.map(d => d.wallet_address);
      }

      // Fallback: get all users with active paid subscriptions
      // They might have auto-trade enabled on-chain
      const { data: subData } = await this.supabase
        .from('subscriptions')
        .select('wallet_address')
        .eq('status', 'active')
        .neq('plan_tier', 'free');

      if (subData && subData.length > 0) {
        const addresses = subData.map(d => d.wallet_address).filter(Boolean);
        logger.info('Using subscriptions fallback for auto-trade users', {
          count: subData.length,
          withWallet: addresses.length,
          addresses: addresses.slice(0, 5) // Log first 5
        });
        return addresses;
      }

      return [];
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
