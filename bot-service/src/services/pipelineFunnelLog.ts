import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { config } from '../config';
import { logger } from '../utils/logger';
import type { MacroRegime } from './marketRegime';
import type { PipelineFunnelDirection, PipelineFunnelStage } from './pipelineFunnelReasons';

export type FunnelLogRow = {
  cycle_id: string;
  coin: string;
  stage: PipelineFunnelStage;
  direction: PipelineFunnelDirection;
  passed: boolean;
  skip_reason?: string | null;
  macro_regime?: string | null;
  wallet_address?: string | null;
};

type CycleMeta = {
  activeBots: number;
  globalSignals: number;
  durationMs: number;
};

let supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient | null {
  if (!config.supabaseUrl || !config.supabaseServiceKey) return null;
  if (!supabase) {
    supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);
  }
  return supabase;
}

/** Per-cycle funnel recorder — buffers rows and flushes in one batch. */
export class PipelineFunnelRecorder {
  readonly cycleId: string;
  private readonly buffer: FunnelLogRow[] = [];
  private macroRegime: MacroRegime | null = null;
  private completed = false;

  constructor(cycleId: string) {
    this.cycleId = cycleId;
  }

  setMacroRegime(regime: MacroRegime): void {
    this.macroRegime = regime;
  }

  log(row: Omit<FunnelLogRow, 'cycle_id' | 'macro_regime'> & { macro_regime?: string | null }): void {
    if (this.completed) return;
    this.buffer.push({
      cycle_id: this.cycleId,
      macro_regime: row.macro_regime ?? this.macroRegime,
      ...row,
    });
  }

  async flush(meta: CycleMeta): Promise<void> {
    if (this.completed) return;
    this.completed = true;

    const client = getSupabase();
    if (!client) {
      logger.debug('Pipeline funnel: Supabase unavailable — skip persist');
      return;
    }

    try {
      const { error: cycleErr } = await client
        .from('trading_cycles')
        .update({
          completed_at: new Date().toISOString(),
          active_bots: meta.activeBots,
          global_signals: meta.globalSignals,
          duration_ms: meta.durationMs,
        })
        .eq('id', this.cycleId);
      if (cycleErr) {
        logger.warn('Pipeline funnel: trading_cycles update failed', { error: cycleErr.message });
        return;
      }

      if (this.buffer.length === 0) return;

      const chunkSize = 500;
      for (let i = 0; i < this.buffer.length; i += chunkSize) {
        const chunk = this.buffer.slice(i, i + chunkSize);
        const { error } = await client.from('pipeline_funnel_log').insert(chunk);
        if (error) {
          logger.warn('Pipeline funnel: log insert failed', {
            error: error.message,
            chunk: i / chunkSize,
            rows: chunk.length,
          });
          return;
        }
      }

      logger.debug('Pipeline funnel persisted', {
        cycleId: this.cycleId.slice(0, 8),
        rows: this.buffer.length,
      });
    } catch (err: unknown) {
      logger.warn('Pipeline funnel flush error', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

export function createTradingCycleId(): string {
  return randomUUID();
}

export async function insertTradingCycleStart(cycleId: string): Promise<void> {
  const client = getSupabase();
  if (!client) return;
  const { error } = await client.from('trading_cycles').insert({
    id: cycleId,
    started_at: new Date().toISOString(),
  });
  if (error) {
    logger.debug('trading_cycles start insert skipped', { error: error.message });
  }
}

export type FunnelStatsQuery = {
  startCycleId?: string;
  endCycleId?: string;
  sinceHours?: number;
};

export async function queryPipelineFunnelStats(opts: FunnelStatsQuery = {}): Promise<{
  byStage: Array<{
    stage: string;
    direction: string;
    passed_count: number;
    failed_count: number;
    total_count: number;
  }>;
  skipRanking: Array<{ skip_reason: string; direction: string; n: number }>;
}> {
  const client = getSupabase();
  if (!client) {
    return { byStage: [], skipRanking: [] };
  }

  const sinceHours = opts.sinceHours ?? 24;
  const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000).toISOString();

  let stageQuery = client
    .from('pipeline_funnel_by_stage')
    .select('stage, direction, passed_count, failed_count, total_count');

  if (opts.startCycleId) stageQuery = stageQuery.gte('cycle_id', opts.startCycleId);
  if (opts.endCycleId) stageQuery = stageQuery.lte('cycle_id', opts.endCycleId);

  const { data: stageRows, error: stageErr } = await stageQuery;
  if (stageErr) {
    logger.warn('pipeline_funnel_by_stage query failed', { error: stageErr.message });
  }

  const { data: skipRows, error: skipErr } = await client
    .from('pipeline_funnel_skip_ranking')
    .select('skip_reason, direction, n')
    .order('n', { ascending: false })
    .limit(100);

  if (skipErr) {
    logger.warn('pipeline_funnel_skip_ranking query failed', { error: skipErr.message });
  }

  void since;
  return {
    byStage: (stageRows ?? []) as Array<{
      stage: string;
      direction: string;
      passed_count: number;
      failed_count: number;
      total_count: number;
    }>,
    skipRanking: (skipRows ?? []) as Array<{ skip_reason: string; direction: string; n: number }>,
  };
}

export type FunnelWalletRow = {
  stage: string;
  direction: string;
  coin: string;
  passed: boolean;
  skip_reason: string | null;
  recorded_at: string;
};

/** Latest funnel rows for a wallet (admin diagnosis). */
export async function fetchRecentFunnelForWallet(
  walletAddress: string,
  limit = 15
): Promise<FunnelWalletRow[]> {
  const client = getSupabase();
  if (!client) return [];

  const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const wallet = walletAddress.toLowerCase();

  const { data, error } = await client
    .from('pipeline_funnel_log')
    .select('stage, direction, coin, passed, skip_reason, recorded_at')
    .eq('wallet_address', wallet)
    .gte('recorded_at', since)
    .order('recorded_at', { ascending: false })
    .limit(limit);

  if (error) {
    logger.debug('fetchRecentFunnelForWallet failed', { error: error.message });
    return [];
  }

  return (data ?? []) as FunnelWalletRow[];
}
