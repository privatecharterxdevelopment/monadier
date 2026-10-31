import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from '../utils/logger';
import { fetchHlPerpFundingSnapshot } from './hlInfo';
import { subscriptionService } from './subscription';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

/** Share of Monadier success fee paid to direct referrer (20% of fee = 2% of profit at 10% fee). */
export const REFERRAL_SHARE_OF_SUCCESS_FEE_PCT = 20;

export const MIN_REFERRAL_QUALIFY_USD = 20;

export function platformSuccessFeePct(): number {
  return Math.round(config.hyperliquid.successFeeBps / 100);
}

export function calculateReferralShareUsd(successFeeUsd: number): number {
  if (!Number.isFinite(successFeeUsd) || successFeeUsd <= 0) return 0;
  const share = (successFeeUsd * REFERRAL_SHARE_OF_SUCCESS_FEE_PCT) / 100;
  return Math.round(share * 1e6) / 1e6;
}

async function getReferrerWalletSnapshot(referrerId: string): Promise<string | null> {
  const { data: primary } = await supabase
    .from('user_wallets')
    .select('wallet_address')
    .eq('user_id', referrerId)
    .eq('is_primary', true)
    .maybeSingle();

  if (primary?.wallet_address) return String(primary.wallet_address).toLowerCase();

  const { data: anyWallet } = await supabase
    .from('user_wallets')
    .select('wallet_address')
    .eq('user_id', referrerId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (anyWallet?.wallet_address) return String(anyWallet.wallet_address).toLowerCase();

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('wallet_address')
    .eq('user_id', referrerId)
    .not('wallet_address', 'is', null)
    .limit(1)
    .maybeSingle();

  return sub?.wallet_address ? String(sub.wallet_address).toLowerCase() : null;
}

async function advanceQualificationState(
  referredUserId: string,
  state: 'wallet_connected' | 'funded' | 'bot_started'
): Promise<void> {
  const { error } = await supabase.rpc('set_referral_qualification_state', {
    p_referred_user_id: referredUserId,
    p_state: state,
  });
  if (error) {
    logger.debug('set_referral_qualification_state skipped', {
      referredUserId: referredUserId.slice(0, 8),
      state,
      error: error.message,
    });
  }
}

/**
 * Accrue affiliate earnings when a referred user closes a profitable bot trade.
 * No-op on losses, missing referrer, unqualified referral, or fraud.
 */
export async function accrueReferralEarning(params: {
  walletAddress: string;
  tradeId: string | null;
  profitUsd: number;
  successFeeUsd: number;
}): Promise<void> {
  if (params.profitUsd <= 0 || params.successFeeUsd <= 0) return;

  const wallet = params.walletAddress.toLowerCase();
  const referredUserId = await subscriptionService.getUserIdFromWallet(wallet);
  if (!referredUserId) return;

  const { data: referral, error: refErr } = await supabase
    .from('referral_rewards')
    .select('id, referrer_id, qualified_at, status, fraud_flag')
    .eq('referred_id', referredUserId)
    .maybeSingle();

  if (refErr || !referral?.referrer_id) return;
  if (referral.fraud_flag) {
    logger.debug('Referral earning skip: fraud flag', { wallet: wallet.slice(0, 10) });
    return;
  }
  if (referral.status === 'pending') {
    logger.debug('Referral earning skip: referred user not qualified', {
      wallet: wallet.slice(0, 10),
    });
    return;
  }

  const shareUsd = calculateReferralShareUsd(params.successFeeUsd);
  if (shareUsd <= 0) return;

  const referrerWallet = await getReferrerWalletSnapshot(referral.referrer_id);

  const { error: insertErr } = await supabase.from('referral_earnings').insert({
    referrer_id: referral.referrer_id,
    referred_user_id: referredUserId,
    trade_id: params.tradeId,
    profit_usd: params.profitUsd,
    success_fee_usd: params.successFeeUsd,
    platform_success_fee_pct: platformSuccessFeePct(),
    referral_share_pct: REFERRAL_SHARE_OF_SUCCESS_FEE_PCT,
    referral_share_usd: shareUsd,
    referrer_wallet_address: referrerWallet,
    status: 'pending',
  });

  if (insertErr) {
    if (insertErr.code === '23505') {
      logger.debug('Referral earning already recorded for trade', {
        tradeId: params.tradeId,
      });
      return;
    }
    logger.warn('Referral earning insert failed', {
      wallet: wallet.slice(0, 10),
      error: insertErr.message,
    });
    return;
  }

  logger.info('Referral earning accrued', {
    referrer: String(referral.referrer_id).slice(0, 8),
    wallet: wallet.slice(0, 10),
    referrerWallet: referrerWallet?.slice(0, 10) ?? 'none',
    shareUsd: shareUsd.toFixed(4),
    profitUsd: params.profitUsd.toFixed(4),
  });
}

/**
 * Qualify referral when referred user has HL wallet funded and bot started or traded.
 */
export async function tryQualifyReferral(
  walletAddress: string,
  opts?: {
    botStarted?: boolean;
    profitableTrade?: boolean;
    tradeExecuted?: boolean;
    tradeId?: string | null;
  }
): Promise<boolean> {
  const wallet = walletAddress.toLowerCase();
  const referredUserId = await subscriptionService.getUserIdFromWallet(wallet);
  if (!referredUserId) return false;

  const { data: pending } = await supabase
    .from('referral_rewards')
    .select('id, fraud_flag')
    .eq('referred_id', referredUserId)
    .eq('status', 'pending')
    .maybeSingle();

  if (!pending || pending.fraud_flag) return false;

  await advanceQualificationState(referredUserId, 'wallet_connected');

  const funding = await fetchHlPerpFundingSnapshot(wallet);
  if (funding.tradablePerpUsd < MIN_REFERRAL_QUALIFY_USD) {
    return false;
  }

  await advanceQualificationState(referredUserId, 'funded');

  let activityOk = Boolean(opts?.botStarted || opts?.profitableTrade || opts?.tradeExecuted);
  if (!activityOk) {
    const { data: vs } = await supabase
      .from('vault_settings')
      .select('auto_trade_enabled')
      .eq('wallet_address', wallet)
      .eq('chain_id', config.arbitrum.chainId)
      .maybeSingle();
    activityOk = Boolean(vs?.auto_trade_enabled);
  }

  if (!activityOk) return false;

  if (opts?.botStarted) {
    await advanceQualificationState(referredUserId, 'bot_started');
  }
  if (opts?.tradeExecuted) {
    await advanceQualificationState(referredUserId, 'bot_started');
  }

  const { data: qualified, error } = await supabase.rpc('qualify_referral_for_trading', {
    p_referred_user_id: referredUserId,
    p_trade_id: opts?.tradeId ?? null,
  });

  if (error) {
    logger.warn('qualify_referral_for_trading failed', {
      wallet: wallet.slice(0, 10),
      error: error.message,
    });
    return false;
  }

  if (qualified) {
    logger.info('Referral qualified', {
      referredUserId: referredUserId.slice(0, 8),
      wallet: wallet.slice(0, 10),
      tradeId: opts?.tradeId ?? null,
    });
  }

  return Boolean(qualified);
}
