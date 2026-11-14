/**
 * Same-coin anti-flip + wallet-wide post-close cooldown.
 * In-memory + trade_history fallback (survives Railway restarts).
 */
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

export type CoinCloseMem = { direction: 'LONG' | 'SHORT'; at: number };

const hlLastCloseByCoin = new Map<string, CoinCloseMem>();
/** Wallet-wide pause — bot / manual closes only (not HL exchange triggers). */
const hlLastBotCloseByWallet = new Map<string, number>();

const EXCHANGE_CLOSE_REASON =
  /^(profit_sl_exchange|stop_loss_exchange|emergency_sl_exchange|exchange_close_|liquidation)/i;

export function isExchangeTriggeredCloseReason(reason: string | null | undefined): boolean {
  const r = String(reason ?? '').trim();
  if (!r) return false;
  const stem = r.toLowerCase().split(' ‖ ')[0]?.trim() ?? r.toLowerCase();
  return EXCHANGE_CLOSE_REASON.test(stem);
}

function coinCloseKey(wallet: string, coin: string): string {
  return `${wallet.toLowerCase()}:${coin.toUpperCase()}`;
}

function rememberWalletBotClose(wallet: string, atMs: number): void {
  const key = wallet.toLowerCase();
  const prev = hlLastBotCloseByWallet.get(key) ?? 0;
  if (atMs > prev) hlLastBotCloseByWallet.set(key, atMs);
}

export function rememberCoinClose(
  wallet: string,
  coin: string,
  direction: 'LONG' | 'SHORT',
  atMs = Date.now(),
  opts?: { skipWalletReentry?: boolean }
): void {
  hlLastCloseByCoin.set(coinCloseKey(wallet, coin), { direction, at: atMs });
  if (!opts?.skipWalletReentry) rememberWalletBotClose(wallet, atMs);
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

async function lastWalletBotCloseFromDb(wallet: string): Promise<number> {
  const { data, error } = await supabase
    .from('trade_history')
    .select('closed_at, close_reason')
    .eq('wallet_address', wallet.toLowerCase())
    .eq('execution_venue', 'hyperliquid')
    .not('closed_at', 'is', null)
    .order('closed_at', { ascending: false })
    .limit(24);

  if (error || !data?.length) return 0;
  for (const row of data) {
    if (isExchangeTriggeredCloseReason(String(row.close_reason ?? ''))) continue;
    const at = new Date(String(row.closed_at)).getTime();
    if (Number.isFinite(at)) return at;
  }
  return 0;
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
    rememberWalletBotClose(wallet, fromDb.at);
    return fromDb;
  }
  return null;
}

export type SameCoinBlockOpts = {
  /** Validated REVERSAL_LONG may flip vs a recent SHORT sooner than 10m. */
  reversalLong?: boolean;
};

export function isSameCoinOpenBlockedSync(
  wallet: string,
  coin: string,
  direction: 'LONG' | 'SHORT',
  opts?: SameCoinBlockOpts
): { blocked: boolean; reason?: string } {
  const mem = hlLastCloseByCoin.get(coinCloseKey(wallet, coin));
  if (!mem) return { blocked: false };
  return evaluateBlock(mem, coin, direction, opts);
}

/**
 * Wallet-wide 10m still applies to SHORT / TREND_LONG / other coins.
 * REVERSAL_LONG may skip stacking that 10m only when the wallet's last close
 * *is* this coin's SHORT (2m opposite floor already applied).
 */
export function isOpenCooldownBlocked(
  wallet: string,
  coin: string,
  direction: 'LONG' | 'SHORT',
  opts?: SameCoinBlockOpts
): { blocked: boolean; reason?: string; guard: 'none' | 'same-coin' | 'wallet' } {
  const coinGate = isSameCoinOpenBlockedSync(wallet, coin, direction, opts);
  if (coinGate.blocked) {
    return { blocked: true, reason: coinGate.reason, guard: 'same-coin' };
  }
  const walletTs = hlLastBotCloseByWallet.get(wallet.toLowerCase()) ?? 0;
  const walletGate = evaluateWalletReentry(walletTs);
  if (!walletGate.blocked) {
    return { blocked: false, guard: 'none' };
  }
  const mem = hlLastCloseByCoin.get(coinCloseKey(wallet, coin));
  const reversalVsThisShort =
    Boolean(opts?.reversalLong) &&
    direction === 'LONG' &&
    mem?.direction === 'SHORT' &&
    walletTs > 0 &&
    Math.abs(walletTs - mem.at) <= 1_000;
  if (reversalVsThisShort) {
    return { blocked: false, guard: 'none' };
  }
  return {
    blocked: true,
    reason: walletGate.reason,
    guard: 'wallet',
  };
}

export async function isSameCoinOpenBlocked(
  wallet: string,
  coin: string,
  direction: 'LONG' | 'SHORT',
  opts?: SameCoinBlockOpts
): Promise<{ blocked: boolean; reason?: string }> {
  const mem = await resolveCoinCloseMem(wallet, coin);
  if (!mem) return { blocked: false };
  return evaluateBlock(mem, coin, direction, opts);
}

export function evaluateWalletReentry(lastCloseAt: number, now = Date.now()): {
  blocked: boolean;
  reason?: string;
  waitMs: number;
} {
  const cooldownMs = config.hyperliquid.reentryCooldownMs;
  if (!(cooldownMs > 0) || !(lastCloseAt > 0)) {
    return { blocked: false, waitMs: 0 };
  }
  const elapsed = now - lastCloseAt;
  if (elapsed >= cooldownMs) return { blocked: false, waitMs: 0 };
  const waitMs = cooldownMs - elapsed;
  const waitMin = Math.max(1, Math.ceil(waitMs / 60_000));
  return {
    blocked: true,
    waitMs,
    reason: `wait ${waitMin}m after last close before any new open (wallet cooldown)`,
  };
}

/** Bot/manual close — drives wallet-wide HL_REENTRY_COOLDOWN_MS. */
export async function resolveWalletLastBotCloseMs(wallet: string): Promise<number> {
  const key = wallet.toLowerCase();
  const mem = hlLastBotCloseByWallet.get(key) ?? 0;
  if (mem > 0) return mem;
  const fromDb = await lastWalletBotCloseFromDb(wallet);
  if (fromDb > 0) {
    hlLastBotCloseByWallet.set(key, fromDb);
    return fromDb;
  }
  return 0;
}

/** @deprecated use resolveWalletLastBotCloseMs */
export async function resolveWalletLastCloseMs(wallet: string): Promise<number> {
  return resolveWalletLastBotCloseMs(wallet);
}

function evaluateBlock(
  mem: CoinCloseMem,
  coin: string,
  direction: 'LONG' | 'SHORT',
  opts?: SameCoinBlockOpts
): { blocked: boolean; reason?: string } {
  const elapsed = Date.now() - mem.at;
  const minReentry = config.hyperliquid.sameCoinReentryMinMs;
  const sameDirection = mem.direction === direction;
  const reversalFlip =
    Boolean(opts?.reversalLong) &&
    direction === 'LONG' &&
    mem.direction === 'SHORT';
  const blockOpposite = reversalFlip
    ? config.hyperliquid.reversalOppositeMinMs
    : config.hyperliquid.blockOppositeSameCoinMs;

  // Same-direction anti-churn uses sameCoinReentryMinMs. REVERSAL_LONG uses the shorter opposite floor.
  if (sameDirection && minReentry > 0 && elapsed < minReentry) {
    const waitMin = Math.max(1, Math.ceil((minReentry - elapsed) / 60_000));
    return {
      blocked: true,
      reason: `${coin} — re-entry blocked ${waitMin}m after close (same coin, anti-churn)`,
    };
  }
  if (
    blockOpposite > 0 &&
    mem.direction !== direction &&
    elapsed < blockOpposite
  ) {
    const waitMin = Math.max(1, Math.ceil((blockOpposite - elapsed) / 60_000));
    const code = reversalFlip ? 'LONG_COOLDOWN_ACTIVE' : 'anti-flip';
    return {
      blocked: true,
      reason:
        `${coin} — no ${direction} for ~${waitMin}m after ${mem.direction} close ` +
        `(${code}; other pairs OK)`,
    };
  }
  return { blocked: false };
}

export async function isOpenCooldownBlockedAsync(
  wallet: string,
  coin: string,
  direction: 'LONG' | 'SHORT',
  opts?: SameCoinBlockOpts
): Promise<{ blocked: boolean; reason?: string; guard: 'none' | 'same-coin' | 'wallet' }> {
  const mem = await resolveCoinCloseMem(wallet, coin);
  if (mem) {
    const coinGate = evaluateBlock(mem, coin, direction, opts);
    if (coinGate.blocked) {
      return { blocked: true, reason: coinGate.reason, guard: 'same-coin' };
    }
  }
  const walletTs = await resolveWalletLastBotCloseMs(wallet);
  const walletGate = evaluateWalletReentry(walletTs);
  if (!walletGate.blocked) {
    return { blocked: false, guard: 'none' };
  }
  const memSync = hlLastCloseByCoin.get(coinCloseKey(wallet, coin));
  const reversalVsThisShort =
    Boolean(opts?.reversalLong) &&
    direction === 'LONG' &&
    memSync?.direction === 'SHORT' &&
    walletTs > 0 &&
    memSync &&
    Math.abs(walletTs - memSync.at) <= 1_000;
  if (reversalVsThisShort) {
    return { blocked: false, guard: 'none' };
  }
  return {
    blocked: true,
    reason: walletGate.reason,
    guard: 'wallet',
  };
}

/** Warm in-memory cache from DB for one wallet (one query per trading cycle). */
export async function warmCoinCloseCacheForWallet(wallet: string): Promise<void> {
  const lookbackMs = Math.max(
    config.hyperliquid.blockOppositeSameCoinMs,
    config.hyperliquid.sameCoinReentryMinMs,
    config.hyperliquid.reentryCooldownMs
  );
  const since = new Date(Date.now() - lookbackMs - 60_000).toISOString();

  const { data, error } = await supabase
    .from('trade_history')
    .select('token_symbol, direction, closed_at, close_reason')
    .eq('wallet_address', wallet.toLowerCase())
    .eq('execution_venue', 'hyperliquid')
    .gte('closed_at', since)
    .order('closed_at', { ascending: false });

  if (error || !data?.length) return;

  const seen = new Set<string>();
  for (const row of data) {
    const at = new Date(String(row.closed_at)).getTime();
    const coin = String(row.token_symbol ?? '').toUpperCase();
    if (!coin || seen.has(coin)) continue;
    seen.add(coin);
    const dir = String(row.direction ?? '').toUpperCase();
    if (dir !== 'LONG' && dir !== 'SHORT') continue;
    if (!Number.isFinite(at)) continue;
    const exchange = isExchangeTriggeredCloseReason(String(row.close_reason ?? ''));
    rememberCoinClose(wallet, coin, dir, at, { skipWalletReentry: exchange });
  }
}
