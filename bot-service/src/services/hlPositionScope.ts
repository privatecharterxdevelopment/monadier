/**
 * Whether a live HL position is bot-managed vs user manual (Perps tab).
 * User manual trades count toward max slots but must never be auto-closed
 * for trail, excluded-coin flat, or bot entry pressure.
 */
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from '../utils/logger';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

type Scope = 'bot_managed' | 'user_manual';

type CacheEntry = { at: number; latestOpenSource: Map<string, string> };
const cache = new Map<string, CacheEntry>();
const CACHE_MS = 12_000;

function walletKey(wallet: string): string {
  return wallet.toLowerCase();
}

export function coinKey(coin: string): string {
  return coin.trim().toUpperCase().replace(/-PERP$/i, '');
}

async function latestOpenSourceByCoin(wallet: string): Promise<Map<string, string>> {
  const wk = walletKey(wallet);
  const hit = cache.get(wk);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.latestOpenSource;

  const latest = new Map<string, string>();
  try {
    const { data, error } = await supabase
      .from('hl_bot_chart_markers')
      .select('coin, event_type, source, event_ts')
      .eq('wallet_address', wk)
      .in('event_type', ['open', 'close'])
      .order('event_ts', { ascending: false })
      .limit(600);
    if (error) {
      logger.warn('HL position scope markers load failed', { error: error.message });
      return hit?.latestOpenSource ?? latest;
    }
    for (const row of data ?? []) {
      const coin = coinKey(String(row.coin ?? ''));
      if (!coin || latest.has(coin)) continue;
      if (row.event_type === 'close') continue;
      latest.set(coin, String(row.source ?? 'bot'));
    }
    cache.set(wk, { at: Date.now(), latestOpenSource: latest });
    return latest;
  } catch (err) {
    logger.warn('HL position scope markers error', {
      error: err instanceof Error ? err.message : String(err),
    });
    return hit?.latestOpenSource ?? latest;
  }
}

export function invalidateHlPositionScopeCache(wallet: string): void {
  cache.delete(walletKey(wallet));
}

/**
 * Latest open marker source=manual → user manual.
 * source=bot (or unknown) with a bot open marker → bot_managed.
 * No open marker → user_manual (fail-safe: never auto-close untagged HL size).
 */
export async function resolveHlPositionScope(
  wallet: string,
  coin: string
): Promise<Scope> {
  const ck = coinKey(coin);
  const sources = await latestOpenSourceByCoin(wallet);
  const src = sources.get(ck);
  if (!src) return 'user_manual';
  if (src.toLowerCase() === 'manual') return 'user_manual';
  return 'bot_managed';
}

export async function isUserManualHlPosition(wallet: string, coin: string): Promise<boolean> {
  return (await resolveHlPositionScope(wallet, coin)) === 'user_manual';
}
