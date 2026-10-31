/**
 * Runtime bot policy (Supabase) — flips instantly from Admin panel, no Railway.
 */
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from '../utils/logger';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

let cached: { at: number; letRunAll: boolean } | null = null;
const CACHE_MS = 5_000;

export async function getRuntimeLetRunAll(): Promise<boolean> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.letRunAll;
  try {
    const { data, error } = await supabase
      .from('hl_bot_runtime_policy')
      .select('let_run_all')
      .eq('id', 1)
      .maybeSingle();
    if (error) {
      logger.warn('HL runtime policy load failed — using config.letRunAll', {
        error: error.message,
      });
      return config.hyperliquid.letRunAll;
    }
    if (!data) return config.hyperliquid.letRunAll;
    const letRunAll = Boolean(data.let_run_all);
    cached = { at: Date.now(), letRunAll };
    return letRunAll;
  } catch (err) {
    logger.warn('HL runtime policy error', {
      error: err instanceof Error ? err.message : String(err),
    });
    return config.hyperliquid.letRunAll;
  }
}

export async function setRuntimeLetRunAll(
  letRunAll: boolean,
  updatedBy = 'admin'
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('hl_bot_runtime_policy').upsert(
      {
        id: 1,
        let_run_all: letRunAll,
        updated_at: new Date().toISOString(),
        updated_by: updatedBy,
      },
      { onConflict: 'id' }
    );
    if (error) return { ok: false, error: error.message };
    cached = { at: Date.now(), letRunAll };
    logger.info('HL runtime letRunAll set', { letRunAll, updatedBy });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function clearRuntimePolicyCache(): void {
  cached = null;
}
