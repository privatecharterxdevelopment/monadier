/**
 * Durable audit of HL open attempts blocked by a gate.
 * Debounced so a SIDEWAYS LONG candidate does not insert every 1s cycle.
 */
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from '../utils/logger';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

/** Min ms between identical wallet+coin+direction+gate inserts. */
const DEBOUNCE_MS = Number(process.env.HL_OPEN_BLOCK_DEBOUNCE_MS || 5 * 60_000);

const lastWriteAt = new Map<string, number>();

export type HlOpenBlockGate =
  | 'anti_flip'
  | 'direction_profile'
  | 'long_confirmation'
  | 'no_mark_price'
  | 'invalid_size'
  | 'cautious_confidence'
  | 'news'
  | 'fresh_pump'
  | 'pre_open_candles'
  | 'scalp_align'
  | 'macro_beta'
  | 'pump_short'
  | 'mega_pair'
  | 'perp_context'
  | 'pump_sweep'
  | 'entry_location'
  | 'entry_momentum'
  | 'htf_sr'
  | 'llm_confirm'
  | 'llm_disagreement'
  | 'order_error'
  | 'open_exception'
  | 'margin'
  | 'liquidity'
  | 'notional'
  | 'other';

export type HlOpenBlockInput = {
  walletAddress: string;
  coin: string;
  direction: 'LONG' | 'SHORT';
  gate: HlOpenBlockGate | string;
  reason: string;
  h1Trend?: string | null;
  confidence?: number | null;
  notionalUsd?: number | null;
  leverage?: number | null;
};

function debounceKey(p: HlOpenBlockInput): string {
  return [
    p.walletAddress.toLowerCase(),
    p.coin.toUpperCase(),
    p.direction,
    String(p.gate),
  ].join(':');
}

/** Fire-and-forget insert — never throws to callers. */
export async function recordHlOpenBlock(params: HlOpenBlockInput): Promise<void> {
  const wallet = params.walletAddress.toLowerCase();
  const coin = params.coin.toUpperCase();
  const gate = String(params.gate || 'other').slice(0, 64);
  const reason = (params.reason || 'blocked').slice(0, 2000);
  const key = debounceKey({ ...params, walletAddress: wallet, coin, gate });

  const now = Date.now();
  const prev = lastWriteAt.get(key) ?? 0;
  if (now - prev < DEBOUNCE_MS) return;
  lastWriteAt.set(key, now);

  try {
    const { error } = await supabase.from('hl_open_blocks').insert({
      wallet_address: wallet,
      coin,
      direction: params.direction,
      gate,
      reason,
      h1_trend: params.h1Trend ?? null,
      confidence:
        params.confidence != null && Number.isFinite(params.confidence)
          ? Math.round(params.confidence)
          : null,
      notional_usd:
        params.notionalUsd != null && Number.isFinite(params.notionalUsd)
          ? params.notionalUsd
          : null,
      leverage:
        params.leverage != null && Number.isFinite(params.leverage)
          ? Math.round(params.leverage)
          : null,
      source: 'bot',
    });

    if (error) {
      logger.warn('HL open block insert failed', {
        wallet: wallet.slice(0, 10),
        coin,
        gate,
        error: error.message,
      });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn('HL open block insert error', {
      wallet: wallet.slice(0, 10),
      coin,
      gate,
      error: msg,
    });
  }
}

export type HlOpenBlockRow = {
  id: number;
  recorded_at: string;
  wallet_address: string;
  coin: string;
  direction: string;
  gate: string;
  reason: string;
  h1_trend: string | null;
  confidence: number | null;
  notional_usd: number | null;
  leverage: number | null;
};

/** Recent blocks for a wallet — used by bot-status / diagnosis. */
export async function fetchRecentHlOpenBlocks(
  walletAddress: string,
  limit = 40
): Promise<HlOpenBlockRow[]> {
  const wallet = walletAddress.toLowerCase();
  const capped = Math.min(100, Math.max(1, Math.floor(limit) || 40));

  const { data, error } = await supabase
    .from('hl_open_blocks')
    .select(
      'id, recorded_at, wallet_address, coin, direction, gate, reason, h1_trend, confidence, notional_usd, leverage'
    )
    .eq('wallet_address', wallet)
    .order('recorded_at', { ascending: false })
    .limit(capped);

  if (error) {
    logger.warn('HL open blocks read failed', {
      wallet: wallet.slice(0, 10),
      error: error.message,
    });
    return [];
  }

  return (data ?? []) as HlOpenBlockRow[];
}
