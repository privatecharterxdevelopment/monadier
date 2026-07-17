import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { config } from '../config';
import { logger } from '../utils/logger';
import { normalizeHlBotStrategy } from './hlBotStrategy';
import { normalizeNewsTradeMode, type NewsTradeMode } from './newsTradeMode';

/** 0 = disabled — bot uses profit-lock trail only unless user sets a % TP. */
function normalizeHlTakeProfitPercent(raw: number | null | undefined): number {
  if (raw == null || !Number.isFinite(Number(raw))) {
    return config.hyperliquid.defaultTakeProfitPercent;
  }
  const v = Number(raw);
  if (v <= 0) return 0;
  return v;
}

/** 0 = disabled — bot never auto-closes at a loss unless user sets SL %. */
function normalizeHlStopLossPercent(raw: number | null | undefined): number {
  if (raw == null || !Number.isFinite(Number(raw))) {
    return 0;
  }
  const v = Number(raw);
  if (v <= 0) return 0;
  // Legacy DB: save RPC wrote GREATEST(0.1, 0) when user picked "Off".
  if (Math.abs(v - 0.1) < 1e-9) return 0;
  return v;
}

function normalizeHlProfitLockPercent(raw: number | null | undefined): number {
  const fallback = config.hyperliquid.defaultProfitLockPercent;
  if (raw == null || !Number.isFinite(Number(raw))) return fallback;
  const v = Number(raw);
  if (v > 0 && v < 1.5) return fallback;
  return v;
}

function normalizeHlLeverage(raw: number | null | undefined): number {
  if (raw == null || !Number.isFinite(Number(raw)) || Number(raw) <= 0) return 5;
  return Number(raw);
}

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
  profitLockPercent: number;
  askPermission: boolean;
  leverageMultiplier: number; // 1.0 = no leverage, 2.0 = 2x, 3.0 = 3x max
  riskLevelBps: number; // Risk in basis points (5000 = 50%)
  autoTradeEnabled: boolean;
  hlBotStrategy: 'standard' | 'profit_grabber';
  newsTradeMode: NewsTradeMode;
  /** 0 = disabled — bot skips opens if closed-trade win rate is lower */
  minWinRatePercent: number;
  minTradesForWinRateGate: number;
  promptWithdrawAfterClose: boolean;
  /** Concurrent HL bot slots (2 or 3). Risk % split across slots. */
  maxConcurrentPositions: number;
  /** Spot USDC reserved for AI betting; 0 = trading uses full balance. */
  autoBettingBudgetUsd: number;
}

/** Clamp user slot preference to 2–3 within platform ceiling. */
export function normalizeMaxConcurrentPositions(
  raw: number | null | undefined,
  platformMax = config.hyperliquid.maxConcurrentPositions
): number {
  const ceiling = Math.max(2, Math.min(3, Math.floor(platformMax) || 3));
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 2) return 2;
  return Math.min(ceiling, Math.max(2, Math.floor(n)));
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

      // vault_settings.user_id (bot saves settings here even when user_wallets link failed)
      const { data: vaultRow } = await this.supabase
        .from('vault_settings')
        .select('user_id')
        .eq('wallet_address', wallet)
        .eq('chain_id', 42161)
        .maybeSingle();

      if (vaultRow?.user_id) {
        return vaultRow.user_id;
      }

      // profiles.wallet_address
      const { data: profile } = await this.supabase
        .from('profiles')
        .select('id')
        .eq('wallet_address', wallet)
        .maybeSingle();

      if (profile?.id) {
        return profile.id;
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

  /** Create a free active subscription when user exists but row is missing (common after wallet-only signup). */
  async ensureActiveSubscriptionForUser(
    userId: string,
    walletAddress?: string
  ): Promise<boolean> {
    const { data: existing } = await this.supabase
      .from('subscriptions')
      .select('id, status')
      .eq('user_id', userId)
      .maybeSingle();

    if (existing?.id && existing.status === 'active') {
      return true;
    }

    const endDate = new Date();
    endDate.setFullYear(endDate.getFullYear() + 100);

    const payload: Record<string, unknown> = {
      user_id: userId,
      plan_tier: 'free',
      billing_cycle: 'lifetime',
      status: 'active',
      start_date: new Date().toISOString(),
      end_date: endDate.toISOString(),
      auto_renew: false,
      daily_trades_used: 0,
      total_trades_used: 0,
    };
    if (walletAddress) {
      payload.wallet_address = walletAddress.toLowerCase();
    }

    const { error } = await this.supabase.from('subscriptions').upsert(payload, {
      onConflict: 'user_id',
    });

    if (error && !error.message.includes('duplicate')) {
      logger.warn('ensureActiveSubscriptionForUser failed', {
        userId: userId.slice(0, 8),
        error: error.message,
      });
      return false;
    }
    return true;
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
   * Subscriptions are retired. Trading is gated by HL agent approval + balance only.
   */
  async canTrade(_walletAddress: string): Promise<TradePermission> {
    return {
      allowed: true,
      dailyTradesRemaining: -1,
      planTier: 'free',
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
   * Get user's total trade count (for progressive position unlocking)
   */
  async getUserTradeCount(walletAddress: string): Promise<number> {
    try {
      const subscription = await this.getSubscription(walletAddress);
      return subscription?.totalTradesUsed || 0;
    } catch {
      return 0;
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
   * Get user's custom TP/SL/Leverage settings from vault_settings
   */
  async getUserTradingSettings(walletAddress: string, chainId: number): Promise<UserTradingSettings> {
    try {
      const { data, error } = await this.supabase
        .from('vault_settings')
        .select(
          'auto_trade_enabled, take_profit_percent, stop_loss_percent, ask_permission, leverage_multiplier, risk_level_bps, min_win_rate_percent, min_trades_for_win_rate_gate, prompt_withdraw_after_close, hl_bot_strategy, news_trade_mode, max_concurrent_positions, auto_betting_budget_usd'
        )
        .eq('wallet_address', walletAddress.toLowerCase())
        .eq('chain_id', chainId)
        .single();

      if (error || !data) {
        // Column may be missing pre-migration — retry without new fields.
        if (error?.message && /max_concurrent_positions|auto_betting_budget_usd/i.test(error.message)) {
          const legacy = await this.supabase
            .from('vault_settings')
            .select(
              'auto_trade_enabled, take_profit_percent, stop_loss_percent, ask_permission, leverage_multiplier, risk_level_bps, min_win_rate_percent, min_trades_for_win_rate_gate, prompt_withdraw_after_close, hl_bot_strategy, news_trade_mode'
            )
            .eq('wallet_address', walletAddress.toLowerCase())
            .eq('chain_id', chainId)
            .maybeSingle();
          if (legacy.data) {
            const row = legacy.data;
            const slPct = normalizeHlStopLossPercent(
              row.stop_loss_percent != null ? Number(row.stop_loss_percent) : null
            );
            return {
              takeProfitPercent: normalizeHlTakeProfitPercent(
                row.take_profit_percent != null ? Number(row.take_profit_percent) : null
              ),
              stopLossPercent: slPct,
              profitLockPercent: normalizeHlProfitLockPercent(null),
              askPermission: row.ask_permission || false,
              leverageMultiplier: normalizeHlLeverage(
                row.leverage_multiplier != null ? Number(row.leverage_multiplier) : null
              ),
              riskLevelBps: row.risk_level_bps || 500,
              autoTradeEnabled: Boolean(row.auto_trade_enabled),
              minWinRatePercent: Number(row.min_win_rate_percent) || 0,
              minTradesForWinRateGate: Number(row.min_trades_for_win_rate_gate) || 5,
              promptWithdrawAfterClose: Boolean(row.prompt_withdraw_after_close),
              hlBotStrategy: normalizeHlBotStrategy(row.hl_bot_strategy as string | null),
              newsTradeMode: normalizeNewsTradeMode(row.news_trade_mode as string | null),
              maxConcurrentPositions: 2,
              autoBettingBudgetUsd: 0,
            };
          }
        }

        // No canonical-chain row — fall back to any HL row (legacy Base 8453 settings).
        const fallback = await this.supabase
          .from('vault_settings')
          .select(
            'auto_trade_enabled, take_profit_percent, stop_loss_percent, ask_permission, leverage_multiplier, risk_level_bps, min_win_rate_percent, min_trades_for_win_rate_gate, prompt_withdraw_after_close, hl_bot_strategy, news_trade_mode, max_concurrent_positions, auto_betting_budget_usd, chain_id'
          )
          .eq('wallet_address', walletAddress.toLowerCase())
          .or('execution_venue.eq.hyperliquid,execution_venue.is.null')
          .order('auto_trade_enabled', { ascending: false })
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (fallback.data) {
          const row = fallback.data;
          const slPct = normalizeHlStopLossPercent(
            row.stop_loss_percent != null ? Number(row.stop_loss_percent) : null
          );
          logger.info('✅ Loaded user vault_settings from sibling chain (legacy)', {
            wallet: walletAddress.slice(0, 10),
            requestedChainId: chainId,
            fromChain: row.chain_id,
            autoTrade: Boolean(row.auto_trade_enabled),
          });
          return {
            takeProfitPercent: normalizeHlTakeProfitPercent(
              row.take_profit_percent != null ? Number(row.take_profit_percent) : null
            ),
            stopLossPercent: slPct,
            profitLockPercent: normalizeHlProfitLockPercent(null),
            askPermission: row.ask_permission || false,
            leverageMultiplier: normalizeHlLeverage(
              row.leverage_multiplier != null ? Number(row.leverage_multiplier) : null
            ),
            riskLevelBps: row.risk_level_bps || 500,
            autoTradeEnabled: Boolean(row.auto_trade_enabled),
            minWinRatePercent: Number(row.min_win_rate_percent) || 0,
            minTradesForWinRateGate: Number(row.min_trades_for_win_rate_gate) || 5,
            promptWithdrawAfterClose: Boolean(row.prompt_withdraw_after_close),
            hlBotStrategy: normalizeHlBotStrategy(row.hl_bot_strategy as string | null),
            newsTradeMode: normalizeNewsTradeMode(row.news_trade_mode as string | null),
            maxConcurrentPositions: normalizeMaxConcurrentPositions(
              (row as { max_concurrent_positions?: number }).max_concurrent_positions
            ),
            autoBettingBudgetUsd: Math.max(
              0,
              Number((row as { auto_betting_budget_usd?: number }).auto_betting_budget_usd) || 0
            ),
          };
        }

        // Return defaults if not found
        logger.warn('⚠️ No vault_settings found - using DEFAULTS', {
          wallet: walletAddress.slice(0, 10),
          chainId,
          defaultTP: '0% (off)',
          defaultSL: '0% (off — per-user, user can set)',
          defaultLeverage: '5x',
          defaultRisk: '5%',
          error: error?.message
        });
        return {
          takeProfitPercent: config.hyperliquid.defaultTakeProfitPercent,
          stopLossPercent: config.hyperliquid.defaultStopLossPercent,
          profitLockPercent: config.hyperliquid.defaultProfitLockPercent,
          askPermission: false,
          leverageMultiplier: 5.0,
          riskLevelBps: 500,
          autoTradeEnabled: false,
          minWinRatePercent: 0,
          minTradesForWinRateGate: 5,
          promptWithdrawAfterClose: false,
          hlBotStrategy: 'standard',
          newsTradeMode: 'filter',
          maxConcurrentPositions: 2,
          autoBettingBudgetUsd: 0,
        };
      }

      const slPct = normalizeHlStopLossPercent(
        data.stop_loss_percent != null ? Number(data.stop_loss_percent) : null
      );

      logger.info('✅ Loaded user vault_settings from DB', {
        wallet: walletAddress.slice(0, 10),
        chainId,
        TP: data.take_profit_percent + '%',
        SL: slPct + '%',
        leverage: (data.leverage_multiplier || 1.0) + 'x',
        risk: (data.risk_level_bps || 500) / 100 + '%',
        maxSlots: normalizeMaxConcurrentPositions(
          (data as { max_concurrent_positions?: number }).max_concurrent_positions
        ),
        bettingBudget: Number((data as { auto_betting_budget_usd?: number }).auto_betting_budget_usd) || 0,
      });

      return {
        takeProfitPercent: normalizeHlTakeProfitPercent(
          data.take_profit_percent != null ? Number(data.take_profit_percent) : null
        ),
        stopLossPercent: slPct,
        profitLockPercent: normalizeHlProfitLockPercent(null),
        askPermission: data.ask_permission || false,
        leverageMultiplier: normalizeHlLeverage(
          data.leverage_multiplier != null ? Number(data.leverage_multiplier) : null
        ),
        riskLevelBps: data.risk_level_bps || 500,
        autoTradeEnabled: Boolean(data.auto_trade_enabled),
        minWinRatePercent: Number(data.min_win_rate_percent) || 0,
        minTradesForWinRateGate: Number(data.min_trades_for_win_rate_gate) || 5,
        promptWithdrawAfterClose: Boolean(data.prompt_withdraw_after_close),
        hlBotStrategy: normalizeHlBotStrategy(data.hl_bot_strategy as string | null),
        newsTradeMode: normalizeNewsTradeMode(data.news_trade_mode as string | null),
        maxConcurrentPositions: normalizeMaxConcurrentPositions(
          (data as { max_concurrent_positions?: number }).max_concurrent_positions
        ),
        autoBettingBudgetUsd: Math.max(
          0,
          Number((data as { auto_betting_budget_usd?: number }).auto_betting_budget_usd) || 0
        ),
      };
    } catch (err) {
      logger.error('Failed to get user trading settings', { walletAddress, error: err });
      return {
        takeProfitPercent: config.hyperliquid.defaultTakeProfitPercent,
        stopLossPercent: 0,
        profitLockPercent: config.hyperliquid.defaultProfitLockPercent,
        askPermission: false,
        leverageMultiplier: 5.0,
        riskLevelBps: 500,
        autoTradeEnabled: false,
        minWinRatePercent: 0,
        minTradesForWinRateGate: 5,
        promptWithdrawAfterClose: false,
        hlBotStrategy: 'standard',
        newsTradeMode: 'filter',
        maxConcurrentPositions: 2,
        autoBettingBudgetUsd: 0,
      };
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

  async disableAutoTrade(walletAddress: string, chainId: number): Promise<void> {
    const wallet = walletAddress.toLowerCase();
    const { error } = await this.supabase
      .from('vault_settings')
      .upsert(
        {
          wallet_address: wallet,
          chain_id: chainId,
          auto_trade_enabled: false,
          updated_at: new Date().toISOString(),
          synced_at: new Date().toISOString(),
        },
        { onConflict: 'wallet_address,chain_id' }
      );
    if (error) {
      logger.error('Failed to disable auto-trade', { wallet, chainId, error });
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
          stop_loss_percent: 0,
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
   * Legacy Base (8453) / other-chain rows sometimes still have auto_trade=true while the
   * HL bot only reads Arbitrum (42161). Promote orphan ON flags to 42161, then clear
   * sibling-chain ON so discovery and UI agree.
   */
  async healHlAutoTradeChainSplit(canonicalChainId = 42161): Promise<{
    promoted: number;
    cleared: number;
  }> {
    let promoted = 0;
    let cleared = 0;
    try {
      const { data: strayOn, error } = await this.supabase
        .from('vault_settings')
        .select(
          'wallet_address, chain_id, execution_venue, take_profit_percent, stop_loss_percent, ask_permission, leverage_multiplier, risk_level_bps, min_win_rate_percent, min_trades_for_win_rate_gate, hl_bot_strategy, news_trade_mode, max_concurrent_positions, user_id, auto_betting_budget_usd'
        )
        .eq('auto_trade_enabled', true)
        .neq('chain_id', canonicalChainId)
        .or('execution_venue.eq.hyperliquid,execution_venue.is.null');

      if (error) {
        logger.warn('healHlAutoTradeChainSplit: stray query failed', { error: error.message });
        return { promoted, cleared };
      }

      for (const row of strayOn ?? []) {
        const wallet = String(row.wallet_address ?? '').toLowerCase();
        if (!wallet) continue;

        const { data: canonical } = await this.supabase
          .from('vault_settings')
          .select('wallet_address, auto_trade_enabled')
          .eq('wallet_address', wallet)
          .eq('chain_id', canonicalChainId)
          .maybeSingle();

        // Only promote when there is no canonical row — if canonical exists (even OFF),
        // it is the source of truth and the stray ON is stale.
        if (!canonical) {
          const payload: Record<string, unknown> = {
            wallet_address: wallet,
            chain_id: canonicalChainId,
            execution_venue: 'hyperliquid',
            auto_trade_enabled: true,
            take_profit_percent: row.take_profit_percent,
            stop_loss_percent: row.stop_loss_percent,
            ask_permission: row.ask_permission ?? false,
            leverage_multiplier: row.leverage_multiplier ?? 5,
            risk_level_bps: row.risk_level_bps ?? 500,
            min_win_rate_percent: row.min_win_rate_percent ?? 0,
            min_trades_for_win_rate_gate: row.min_trades_for_win_rate_gate ?? 5,
            hl_bot_strategy: row.hl_bot_strategy ?? 'standard',
            news_trade_mode: row.news_trade_mode ?? 'filter',
            updated_at: new Date().toISOString(),
            synced_at: new Date().toISOString(),
          };
          if (row.user_id) payload.user_id = row.user_id;
          if (row.max_concurrent_positions != null) {
            payload.max_concurrent_positions = row.max_concurrent_positions;
          }
          if (row.auto_betting_budget_usd != null) {
            payload.auto_betting_budget_usd = row.auto_betting_budget_usd;
          }

          const { error: upsertErr } = await this.supabase
            .from('vault_settings')
            .upsert(payload, { onConflict: 'wallet_address,chain_id' });
          if (upsertErr) {
            logger.warn('healHlAutoTradeChainSplit: promote failed', {
              wallet: wallet.slice(0, 10),
              error: upsertErr.message,
            });
          } else {
            promoted += 1;
            logger.info('healHlAutoTradeChainSplit: promoted auto-trade to canonical chain', {
              wallet: wallet.slice(0, 10),
              fromChain: row.chain_id,
              toChain: canonicalChainId,
            });
          }
        }
      }

      const { data: clearedRows, error: clearErr } = await this.supabase
        .from('vault_settings')
        .update({
          auto_trade_enabled: false,
          updated_at: new Date().toISOString(),
        })
        .eq('auto_trade_enabled', true)
        .neq('chain_id', canonicalChainId)
        .select('wallet_address');

      if (clearErr) {
        logger.warn('healHlAutoTradeChainSplit: clear failed', { error: clearErr.message });
      } else {
        cleared = clearedRows?.length ?? 0;
        if (cleared > 0) {
          logger.info('healHlAutoTradeChainSplit: cleared sibling-chain auto-trade flags', {
            cleared,
            canonicalChainId,
          });
        }
      }
    } catch (err) {
      logger.warn('healHlAutoTradeChainSplit failed', { error: err });
    }
    return { promoted, cleared };
  }

  private hlAutoTradeHealAt = 0;

  /**
   * Wallets with auto-trade ON only (Hyperliquid path).
   * Does not include inactive subscribers — critical at 1M+ signups.
   *
   * Canonical chain is Arbitrum (42161). Legacy Base (8453) ON flags are healed into
   * 42161 when no canonical row exists; if 42161 exists it wins (even when OFF).
   */
  async getAutoTradeUsers(chainId?: number): Promise<string[]> {
    try {
      const canonicalChainId = chainId ?? 42161;

      // Self-heal at most once per 5 minutes so stray Base ON rows cannot hide forever.
      const now = Date.now();
      if (now - this.hlAutoTradeHealAt > 5 * 60_000) {
        this.hlAutoTradeHealAt = now;
        void this.healHlAutoTradeChainSplit(canonicalChainId);
      }

      // Treat NULL venue as hyperliquid (legacy rows) — .eq('hyperliquid') alone drops them.
      const { data, error } = await this.supabase
        .from('vault_settings')
        .select('wallet_address, chain_id, auto_trade_enabled, execution_venue')
        .eq('auto_trade_enabled', true)
        .or('execution_venue.eq.hyperliquid,execution_venue.is.null');

      if (error) {
        logger.error('Failed to get auto-trade users', { error });
        return [];
      }

      const onByWallet = new Map<string, { canonicalOn: boolean; hasCanonical: boolean; otherOn: boolean }>();
      for (const row of data ?? []) {
        const w = row.wallet_address?.toLowerCase();
        if (!w) continue;
        const cur = onByWallet.get(w) ?? {
          canonicalOn: false,
          hasCanonical: false,
          otherOn: false,
        };
        if (Number(row.chain_id) === canonicalChainId) {
          cur.hasCanonical = true;
          cur.canonicalOn = true;
        } else {
          cur.otherOn = true;
        }
        onByWallet.set(w, cur);
      }

      // Wallets with canonical OFF also need to suppress stray other-chain ON.
      // Re-check canonical rows for wallets that only appeared via other chains.
      const maybeStale = [...onByWallet.entries()]
        .filter(([, v]) => v.otherOn && !v.hasCanonical)
        .map(([w]) => w);

      if (maybeStale.length > 0) {
        const { data: canonicalRows } = await this.supabase
          .from('vault_settings')
          .select('wallet_address, auto_trade_enabled')
          .eq('chain_id', canonicalChainId)
          .in('wallet_address', maybeStale);

        for (const row of canonicalRows ?? []) {
          const w = row.wallet_address?.toLowerCase();
          if (!w) continue;
          const cur = onByWallet.get(w);
          if (!cur) continue;
          cur.hasCanonical = true;
          cur.canonicalOn = Boolean(row.auto_trade_enabled);
          onByWallet.set(w, cur);
        }
      }

      const addresses = [...onByWallet.entries()]
        .filter(([, v]) => (v.hasCanonical ? v.canonicalOn : v.otherOn))
        .map(([w]) => w);

      if (addresses.length > 0) {
        logger.info('Active HL auto-trade wallets', {
          chainId: canonicalChainId,
          count: addresses.length,
        });
      }

      return addresses;
    } catch (err) {
      logger.error('Failed to get auto-trade users', { error: err });
      return [];
    }
  }

  /**
   * Ensure every profile has a free-tier subscription (safe — never auto-upgrades to elite).
   */
  async ensureFreeSubscriptionsForMissingUsers(): Promise<void> {
    try {
      const { data: profiles, error: profileError } = await this.supabase
        .from('profiles')
        .select('id');

      if (profileError || !profiles?.length) {
        if (profileError) {
          logger.error('ensureFreeSubscriptions: profiles query failed', { error: profileError });
        }
        return;
      }

      let created = 0;
      for (const row of profiles) {
        const { data: existing } = await this.supabase
          .from('subscriptions')
          .select('id')
          .eq('user_id', row.id)
          .maybeSingle();

        if (existing?.id) continue;

        const endDate = new Date();
        endDate.setFullYear(endDate.getFullYear() + 100);

        const { error: insertError } = await this.supabase.from('subscriptions').insert({
          user_id: row.id,
          plan_tier: 'free',
          billing_cycle: 'lifetime',
          status: 'active',
          start_date: new Date().toISOString(),
          end_date: endDate.toISOString(),
          auto_renew: false,
          daily_trades_used: 0,
          total_trades_used: 0,
        });

        if (!insertError) {
          created++;
        } else if (!insertError.message.includes('duplicate')) {
          logger.warn('ensureFreeSubscriptions: insert failed', {
            userId: row.id.slice(0, 8),
            error: insertError.message,
          });
        }
      }

      if (created > 0) {
        logger.info('Created missing free subscriptions', { count: created });
      }
    } catch (err) {
      logger.error('ensureFreeSubscriptionsForMissingUsers failed', { error: err });
    }
  }

  /**
   * @deprecated Was auto-upgrading vault users to elite — use ensureFreeSubscriptionsForMissingUsers instead.
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
