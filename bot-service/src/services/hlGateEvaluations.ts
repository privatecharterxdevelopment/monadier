/**
 * Persist full gate-evaluation rows for overlap diagnostics.
 * One evaluation_id = one open attempt; one row per gate in the diagnostic set.
 */
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from '../utils/logger';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

/** Min ms between identical wallet+coin+direction evaluation batches. */
const DEBOUNCE_MS = Number(process.env.HL_GATE_EVAL_DEBOUNCE_MS || 5 * 60_000);
const lastWriteAt = new Map<string, number>();

export type GateEvalRow = {
  gate: string;
  wouldBlock: boolean;
  enforced: boolean;
  didBlock: boolean;
  reason: string;
};

export type RecordGateEvaluationBatchInput = {
  evaluationId: string;
  walletAddress: string;
  coin: string;
  direction: 'LONG' | 'SHORT';
  h1Trend?: string | null;
  confidence?: number | null;
  notionalUsd?: number | null;
  leverage?: number | null;
  rows: GateEvalRow[];
};

function debounceKey(p: RecordGateEvaluationBatchInput): string {
  return [
    p.walletAddress.toLowerCase(),
    p.coin.toUpperCase(),
    p.direction,
  ].join(':');
}

/** Fire-and-forget — never throws to callers. */
export async function recordGateEvaluationBatch(
  params: RecordGateEvaluationBatchInput
): Promise<void> {
  if (!params.rows.length) return;

  const wallet = params.walletAddress.toLowerCase();
  const coin = params.coin.toUpperCase();
  const key = debounceKey({ ...params, walletAddress: wallet, coin });
  const now = Date.now();
  const prev = lastWriteAt.get(key) ?? 0;
  if (now - prev < DEBOUNCE_MS) return;
  lastWriteAt.set(key, now);

  const inserts = params.rows.map((r) => ({
    evaluation_id: params.evaluationId,
    wallet_address: wallet,
    coin,
    direction: params.direction,
    gate: String(r.gate).slice(0, 64),
    would_block: r.wouldBlock,
    enforced: r.enforced,
    did_block: r.didBlock,
    reason: (r.reason || '').slice(0, 2000),
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
  }));

  try {
    const { error } = await supabase.from('hl_gate_evaluations').insert(inserts);
    if (error) {
      logger.warn('HL gate evaluation insert failed', {
        wallet: wallet.slice(0, 10),
        coin,
        evaluationId: params.evaluationId.slice(0, 8),
        error: error.message,
      });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn('HL gate evaluation insert error', {
      wallet: wallet.slice(0, 10),
      coin,
      error: msg,
    });
  }
}
