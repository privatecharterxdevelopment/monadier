import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from '../utils/logger';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

export type HlOpenGatePass = {
  gate: string;
  code: string;
  reason: string;
};

export type HlOpenAuditRow = {
  id: number;
  recorded_at: string;
  wallet_address: string;
  coin: string;
  direction: string;
  entry_px: number | null;
  leverage: number | null;
  notional_usd: number | null;
  confidence: number | null;
  bot_mode: string | null;
  gates_passed: HlOpenGatePass[];
  analysis_text: string;
  signal_snapshot: Record<string, unknown> | null;
};

/** Persist successful open analysis — never throws to trading loop. */
export async function recordHlOpenAudit(params: {
  walletAddress: string;
  coin: string;
  direction: 'LONG' | 'SHORT';
  entryPx: number;
  leverage: number;
  notionalUsd: number;
  confidence: number;
  botMode: string;
  gatesPassed: HlOpenGatePass[];
  analysisText: string;
  signalSnapshot?: Record<string, unknown>;
}): Promise<void> {
  const wallet = params.walletAddress.toLowerCase();
  const coin = params.coin.toUpperCase();
  const analysis = params.analysisText.slice(0, 24_000);
  const gates = params.gatesPassed.slice(0, 64).map((g) => ({
    gate: String(g.gate).slice(0, 64),
    code: String(g.code).slice(0, 64),
    reason: String(g.reason).slice(0, 2000),
  }));

  try {
    const { error } = await supabase.from('hl_open_audits').insert({
      wallet_address: wallet,
      coin,
      direction: params.direction,
      entry_px: Number.isFinite(params.entryPx) ? params.entryPx : null,
      leverage: Math.round(params.leverage),
      notional_usd: params.notionalUsd,
      confidence: Math.round(params.confidence),
      bot_mode: params.botMode.slice(0, 32),
      gates_passed: gates,
      analysis_text: analysis,
      signal_snapshot: params.signalSnapshot ?? null,
      source: 'bot',
    });
    if (error) {
      logger.warn('HL open audit insert failed', {
        wallet: wallet.slice(0, 10),
        coin,
        error: error.message,
      });
    }
  } catch (err: unknown) {
    logger.warn('HL open audit insert error', {
      wallet: wallet.slice(0, 10),
      coin,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function fetchRecentHlOpenAudits(
  walletAddress: string,
  limit = 40
): Promise<HlOpenAuditRow[]> {
  const wallet = walletAddress.toLowerCase();
  const capped = Math.min(100, Math.max(1, Math.floor(limit) || 40));

  const { data, error } = await supabase
    .from('hl_open_audits')
    .select(
      'id, recorded_at, wallet_address, coin, direction, entry_px, leverage, notional_usd, confidence, bot_mode, gates_passed, analysis_text, signal_snapshot'
    )
    .eq('wallet_address', wallet)
    .order('recorded_at', { ascending: false })
    .limit(capped);

  if (error) {
    logger.warn('HL open audits read failed', {
      wallet: wallet.slice(0, 10),
      error: error.message,
    });
    return [];
  }

  return (data ?? []).map((row) => ({
    ...row,
    gates_passed: Array.isArray(row.gates_passed)
      ? (row.gates_passed as HlOpenGatePass[])
      : [],
  })) as HlOpenAuditRow[];
}
