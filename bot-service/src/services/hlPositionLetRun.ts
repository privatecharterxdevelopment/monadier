/**
 * Per-wallet + per-coin “let run” prefs.
 * true  → never auto-close (manual Close only)
 * false → force trail/TP even when global letRunAll is on
 * missing → follow global / coin / longLetRun defaults
 */
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from '../utils/logger';
import { getRuntimeLetRunAll } from './hlRuntimePolicy';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

type PrefMap = Map<string, boolean>;
type CacheEntry = { at: number; prefs: PrefMap };
const cache = new Map<string, CacheEntry>();
const CACHE_MS = 15_000;

function walletKey(wallet: string): string {
  return wallet.toLowerCase();
}

function coinKey(coin: string): string {
  return coin.trim().toUpperCase();
}

async function loadPrefs(wallet: string): Promise<PrefMap> {
  const wk = walletKey(wallet);
  const hit = cache.get(wk);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.prefs;

  try {
    const { data, error } = await supabase
      .from('hl_position_let_run')
      .select('coin, let_run')
      .eq('wallet_address', wk);
    if (error) {
      logger.warn('HL let-run prefs load failed', { error: error.message });
      return hit?.prefs ?? new Map();
    }
    const prefs: PrefMap = new Map();
    for (const row of data ?? []) {
      const c = coinKey(String(row.coin ?? ''));
      if (!c) continue;
      prefs.set(c, Boolean(row.let_run));
    }
    cache.set(wk, { at: Date.now(), prefs });
    return prefs;
  } catch (err) {
    logger.warn('HL let-run prefs error', {
      error: err instanceof Error ? err.message : String(err),
    });
    return hit?.prefs ?? new Map();
  }
}

/** Effective let-run for this position (runtime global + per-user override). */
export async function resolvePositionLetRun(opts: {
  wallet: string;
  coin: string;
  direction: 'LONG' | 'SHORT';
  /** Ignored when runtime policy exists — kept for call-site compat. */
  letRunAll?: boolean;
  letRunCoin: boolean;
  longLetRun: boolean;
}): Promise<{ letRun: boolean; source: string; letRunAll: boolean }> {
  const letRunAll = await getRuntimeLetRunAll();
  const prefs = await loadPrefs(opts.wallet);
  const pref = prefs.get(coinKey(opts.coin));
  if (pref === true) return { letRun: true, source: 'user_on', letRunAll };
  if (pref === false) return { letRun: false, source: 'user_off', letRunAll };
  if (letRunAll) return { letRun: true, source: 'all', letRunAll };
  if (opts.letRunCoin) return { letRun: true, source: 'coin', letRunAll };
  if (opts.direction === 'LONG' && opts.longLetRun) {
    return { letRun: true, source: 'long', letRunAll };
  }
  return { letRun: false, source: 'trail', letRunAll };
}

export async function setUserPositionLetRun(
  wallet: string,
  coin: string,
  letRun: boolean
): Promise<{ ok: boolean; error?: string }> {
  const wk = walletKey(wallet);
  const ck = coinKey(coin);
  if (!wk || !ck) return { ok: false, error: 'wallet and coin required' };

  try {
    const { error } = await supabase.from('hl_position_let_run').upsert(
      {
        wallet_address: wk,
        coin: ck,
        let_run: letRun,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'wallet_address,coin' }
    );
    if (error) return { ok: false, error: error.message };
    cache.delete(wk);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function listUserPositionLetRun(
  wallet: string
): Promise<Record<string, boolean>> {
  const prefs = await loadPrefs(wallet);
  const out: Record<string, boolean> = {};
  for (const [c, v] of prefs) out[c] = v;
  return out;
}

export async function listAllPositionLetRunPrefs(): Promise<
  Array<{ wallet: string; coin: string; letRun: boolean }>
> {
  try {
    const { data, error } = await supabase
      .from('hl_position_let_run')
      .select('wallet_address, coin, let_run');
    if (error) {
      logger.warn('HL let-run list-all failed', { error: error.message });
      return [];
    }
    return (data ?? []).map((r) => ({
      wallet: String(r.wallet_address ?? '').toLowerCase(),
      coin: coinKey(String(r.coin ?? '')),
      letRun: Boolean(r.let_run),
    }));
  } catch {
    return [];
  }
}
