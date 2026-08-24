/**
 * Same-coin anti-flip — in-memory + trade_history fallback (survives Railway restarts).
 */
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { pendingImpulseFadeAllows } from './impulseFadeSequence';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

export type CoinCloseMem = { direction: 'LONG' | 'SHORT'; at: number };

const hlLastCloseByCoin = new Map<string, CoinCloseMem>();

function coinCloseKey(wallet: string, coin: string): string {
  return `${wallet.toLowerCase()}:${coin.toUpperCase()}`;
}

export function rememberCoinClose(
  wallet: string,
  coin: string,
  direction: 'LONG' | 'SHORT',
  atMs = Date.now()
): void {
  hlLastCloseByCoin.set(coinCloseKey(wallet, coin), { direction, at: atMs });
}

async function lastCoinCloseFromDb(
  wallet: string,
  coin: string
): Promise<CoinCloseMem | null> {
  const { data, error } = await supabase
    .from('trade_history')
    .select('direction, closed_at')
    .eq('wallet_address', wallet.toLowerCase())
    .eq('token_symbol', coin.toUpperCase())
    .eq('execution_venue', 'hyperliquid')
    .not('closed_at', 'is', null)
    .order('closed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.closed_at) return null;
  const dir = String(data.direction).toUpperCase();
  if (dir !== 'LONG' && dir !== 'SHORT') return null;
  const at = new Date(data.closed_at).getTime();
  if (!Number.isFinite(at)) return null;
  return { direction: dir, at };
}

async function resolveCoinCloseMem(
  wallet: string,
  coin: string
): Promise<CoinCloseMem | null> {
  const key = coinCloseKey(wallet, coin);
  const mem = hlLastCloseByCoin.get(key);
  if (mem) return mem;

  const fromDb = await lastCoinCloseFromDb(wallet, coin);
  if (fromDb) {
    hlLastCloseByCoin.set(key, fromDb);
    return fromDb;
  }
  return null;
}

export function isSameCoinOpenBlockedSync(
  wallet: string,
  coin: string,
  direction: 'LONG' | 'SHORT'
): { blocked: boolean; reason?: string } {
  if (pendingImpulseFadeAllows(wallet, coin, direction)) return { blocked: false };
  const mem = hlLastCloseByCoin.get(coinCloseKey(wallet, coin));
  if (!mem) return { blocked: false };
  return evaluateBlock(mem, coin, direction);
}

export async function isSameCoinOpenBlocked(
  wallet: string,
  coin: string,
  direction: 'LONG' | 'SHORT'
): Promise<{ blocked: boolean; reason?: string }> {
  if (pendingImpulseFadeAllows(wallet, coin, direction)) return { blocked: false };
  const mem = await resolveCoinCloseMem(wallet, coin);
  if (!mem) return { blocked: false };
  return evaluateBlock(mem, coin, direction);
}

function evaluateBlock(
  mem: CoinCloseMem,
  coin: string,
  direction: 'LONG' | 'SHORT'
): { blocked: boolean; reason?: string } {
  const elapsed = Date.now() - mem.at;
  const minReentry = config.hyperliquid.sameCoinReentryMinMs;
  const blockOpposite = config.hyperliquid.blockOppositeSameCoinMs;

  if (minReentry > 0 && elapsed < minReentry) {
    const waitSec = Math.ceil((minReentry - elapsed) / 1000);
    return {
      blocked: true,
      reason: `${coin} — re-entry blocked ${waitSec}s after close (anti-churn)`,
    };
  }
  if (
    blockOpposite > 0 &&
    mem.direction !== direction &&
    elapsed < blockOpposite
  ) {
    const waitMin = Math.ceil((blockOpposite - elapsed) / 60_000);
    return {
      blocked: true,
      reason:
        `${coin} — no ${direction} for ~${waitMin}m after ${mem.direction} close ` +
        `(anti-flip; other pairs OK)`,
    };
  }
  return { blocked: false };
}

/** Warm in-memory cache from DB for one wallet (one query per trading cycle). */
export async function warmCoinCloseCacheForWallet(wallet: string): Promise<void> {
  const since = new Date(
    Date.now() -
      Math.max(
        config.hyperliquid.blockOppositeSameCoinMs,
        config.hyperliquid.sameCoinReentryMinMs
      ) -
      60_000
  ).toISOString();

  const { data, error } = await supabase
    .from('trade_history')
    .select('token_symbol, direction, closed_at')
    .eq('wallet_address', wallet.toLowerCase())
    .eq('execution_venue', 'hyperliquid')
    .gte('closed_at', since)
    .order('closed_at', { ascending: false });

  if (error || !data?.length) return;

  const seen = new Set<string>();
  for (const row of data) {
    const coin = String(row.token_symbol ?? '').toUpperCase();
    if (!coin || seen.has(coin)) continue;
    seen.add(coin);
    const dir = String(row.direction ?? '').toUpperCase();
    if (dir !== 'LONG' && dir !== 'SHORT') continue;
    const at = new Date(String(row.closed_at)).getTime();
    if (!Number.isFinite(at)) continue;
    rememberCoinClose(wallet, coin, dir, at);
  }
}
