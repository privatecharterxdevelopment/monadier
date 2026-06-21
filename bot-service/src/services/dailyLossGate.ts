import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from '../utils/logger';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

export type DailyLossGateResult = {
  allowed: boolean;
  reason?: string;
  todayPnlUsd?: number;
  limitUsd?: number;
};

function startOfUtcDayIso(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

/** Sum realized HL PnL since UTC midnight (trade_history). */
export async function getTodayRealizedPnlUsd(
  walletAddress: string,
  chainId: number
): Promise<number> {
  const since = startOfUtcDayIso();
  const wallet = walletAddress.toLowerCase();

  const { data, error } = await supabase
    .from('trade_history')
    .select('profit_loss')
    .eq('wallet_address', wallet)
    .eq('chain_id', chainId)
    .eq('execution_venue', 'hyperliquid')
    .gte('closed_at', since)
    .not('profit_loss', 'is', null);

  if (error) {
    logger.warn('Daily loss gate: trade_history read failed', { error: error.message });
    return 0;
  }

  return (data ?? []).reduce((sum, row) => sum + Number(row.profit_loss ?? 0), 0);
}

export async function checkDailyLossGate(
  walletAddress: string,
  chainId: number,
  accountUsd: number
): Promise<DailyLossGateResult> {
  const cfg = config.hyperliquid.dailyLoss;
  if (!cfg.enabled) return { allowed: true };

  const todayPnl = await getTodayRealizedPnlUsd(walletAddress, chainId);
  const pctCap =
    accountUsd > 0 && cfg.maxPctOfAccount > 0
      ? accountUsd * cfg.maxPctOfAccount
      : cfg.maxUsd;
  const limitUsd = Math.max(cfg.maxUsd, pctCap);

  if (todayPnl <= -limitUsd) {
    return {
      allowed: false,
      todayPnlUsd: todayPnl,
      limitUsd,
      reason: `Daily loss limit hit: $${todayPnl.toFixed(2)} today (max −$${limitUsd.toFixed(2)}) — no new opens`,
    };
  }

  return { allowed: true, todayPnlUsd: todayPnl, limitUsd };
}

export async function maybePauseAfterLossClose(
  walletAddress: string,
  chainId: number,
  accountUsd: number,
  closePnlUsd: number
): Promise<void> {
  if (closePnlUsd >= 0) return;

  const gate = await checkDailyLossGate(walletAddress, chainId, accountUsd);
  if (gate.allowed) return;

  const pauseMs = config.hyperliquid.dailyLoss.pauseMs;
  const until = new Date(Date.now() + pauseMs);

  const { error } = await supabase
    .from('vault_settings')
    .update({ bot_banned_until: until.toISOString() })
    .eq('wallet_address', walletAddress.toLowerCase())
    .eq('chain_id', chainId);

  if (error) {
    logger.warn('Daily loss pause: could not set bot_banned_until', {
      wallet: walletAddress.slice(0, 10),
      error: error.message,
    });
    return;
  }

  logger.warn('HL bot paused — daily loss limit', {
    wallet: walletAddress.slice(0, 10),
    todayPnl: gate.todayPnlUsd?.toFixed(2),
    limitUsd: gate.limitUsd?.toFixed(2),
    pausedUntil: until.toISOString(),
  });
}
