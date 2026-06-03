import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from '../utils/logger';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

export interface WinRateGateResult {
  allowed: boolean;
  reason?: string;
  winRate?: number;
  closedTrades?: number;
  wins?: number;
  minRequired?: number;
}

/**
 * Optional gate: do not open new trades if historical win rate is below user threshold.
 * min_win_rate_percent = 0 disables the gate.
 */
export async function checkWinRateGate(
  walletAddress: string,
  chainId: number,
  minWinRatePercent: number,
  minTradesRequired: number
): Promise<WinRateGateResult> {
  if (!minWinRatePercent || minWinRatePercent <= 0) {
    return { allowed: true };
  }

  const { data: closed, error } = await supabase
    .from('positions')
    .select('profit_loss')
    .eq('wallet_address', walletAddress.toLowerCase())
    .eq('chain_id', chainId)
    .eq('status', 'closed')
    .not('profit_loss', 'is', null)
    .order('closed_at', { ascending: false })
    .limit(100);

  if (error) {
    logger.warn('Win rate gate: could not read positions', { error: error.message });
    return { allowed: true };
  }

  const rows = closed ?? [];
  if (rows.length < minTradesRequired) {
    return {
      allowed: true,
      closedTrades: rows.length,
      reason: `Insufficient history (${rows.length}/${minTradesRequired}) — win rate gate skipped`,
    };
  }

  const wins = rows.filter((r) => (r.profit_loss as number) > 0).length;
  const winRate = (wins / rows.length) * 100;

  if (winRate < minWinRatePercent) {
    return {
      allowed: false,
      winRate,
      closedTrades: rows.length,
      wins,
      minRequired: minWinRatePercent,
      reason: `Win rate ${winRate.toFixed(1)}% below minimum ${minWinRatePercent}% (${wins}/${rows.length} wins)`,
    };
  }

  return {
    allowed: true,
    winRate,
    closedTrades: rows.length,
    wins,
    minRequired: minWinRatePercent,
  };
}
