/**
 * When a perp vanishes without closeMarketPosition (HL profit-SL / emergency trigger),
 * record trade_history + chart marker so dock History "Why" is populated.
 */
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from '../utils/logger';
import { recordHlBotClose } from './hlSuccessFees';
import { rememberCoinClose } from './hlCoinCloseGuard';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

const inflight = new Set<string>();

type HlFill = {
  coin?: string;
  dir?: string;
  side?: string;
  px?: string | number;
  sz?: string | number;
  closedPnl?: string | number;
  time?: number;
  tid?: number;
};

function isCloseDir(dir: string, pnl: number): boolean {
  if (/^open/i.test(dir)) return false;
  if (/^close/i.test(dir) || /long\s*>\s*short|short\s*>\s*long/i.test(dir)) return true;
  return pnl !== 0;
}

function fillDirection(fill: HlFill): 'LONG' | 'SHORT' | null {
  const d = String(fill.dir ?? '').toLowerCase();
  if (d.includes('long') && !d.includes('short')) return 'LONG';
  if (d.includes('short') && !d.includes('long')) return 'SHORT';
  if (d.includes('long') && d.includes('short')) {
    if (d.startsWith('long')) return 'LONG';
    if (d.startsWith('short')) return 'SHORT';
  }
  const isBuy = String(fill.side ?? '') === 'B';
  if (/^open/i.test(d)) return isBuy ? 'LONG' : 'SHORT';
  return isBuy ? 'SHORT' : 'LONG';
}

function entryFromClose(opts: {
  direction: 'LONG' | 'SHORT';
  exitPx: number;
  size: number;
  pnl: number;
}): number {
  const sz = opts.size;
  if (!(sz > 0)) return opts.exitPx;
  if (opts.direction === 'SHORT') return opts.exitPx + opts.pnl / sz;
  return opts.exitPx - opts.pnl / sz;
}

async function fetchRecentFills(wallet: string): Promise<HlFill[]> {
  const res = await fetch(config.hyperliquid.infoUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'userFills', user: wallet }),
  });
  if (!res.ok) return [];
  const fills = (await res.json()) as HlFill[];
  return Array.isArray(fills) ? fills : [];
}

async function closeAlreadyKnown(opts: {
  wallet: string;
  coin: string;
  closedAtMs: number;
  pnl: number;
}): Promise<boolean> {
  const from = new Date(opts.closedAtMs - 120_000).toISOString();
  const to = new Date(opts.closedAtMs + 120_000).toISOString();

  const { data: th, error: thErr } = await supabase
    .from('trade_history')
    .select('id, profit_loss, close_reason')
    .eq('wallet_address', opts.wallet)
    .eq('token_symbol', opts.coin)
    .gte('closed_at', from)
    .lte('closed_at', to)
    .limit(5);
  if (thErr) {
    logger.warn('HL exchange close dedupe trade_history failed', { error: thErr.message });
    return true;
  }
  for (const row of th ?? []) {
    const rowPnl = Number(row.profit_loss);
    if (Number.isFinite(rowPnl) && Math.abs(rowPnl - opts.pnl) < 0.12) return true;
  }

  const { data: mk, error: mkErr } = await supabase
    .from('hl_bot_chart_markers')
    .select('id')
    .eq('wallet_address', opts.wallet)
    .eq('coin', opts.coin)
    .eq('event_type', 'close')
    .gte('event_ts', from)
    .lte('event_ts', to)
    .limit(1);
  if (mkErr) {
    logger.warn('HL exchange close dedupe marker failed', { error: mkErr.message });
    return false;
  }
  if ((mk ?? []).length > 0) return true;

  return false;
}

function inferExchangeCloseReason(pnl: number, direction: 'LONG' | 'SHORT'): string {
  if (pnl > 0.001) return 'profit_sl_exchange';
  if (pnl < -0.001) return 'stop_loss_exchange';
  return `exchange_close_${direction.toLowerCase()}`;
}

async function recordExchangeVanishedClose(opts: {
  wallet: string;
  coin: string;
  direction: 'LONG' | 'SHORT';
}): Promise<void> {
  const wallet = opts.wallet.toLowerCase();
  const coin = opts.coin.toUpperCase();
  const lookbackMs = 8 * 60_000;
  const now = Date.now();

  const fills = await fetchRecentFills(wallet);
  let best: { fill: HlFill; t: number; pnl: number } | null = null;

  for (const f of fills) {
    const fCoin = String(f.coin ?? '').toUpperCase();
    if (fCoin !== coin) continue;
    const t = Number(f.time ?? 0);
    if (!Number.isFinite(t) || t < now - lookbackMs) continue;
    const pnl = Number(f.closedPnl ?? 0);
    const dir = String(f.dir ?? '');
    if (!isCloseDir(dir, pnl)) continue;
    const fd = fillDirection(f);
    if (fd !== opts.direction) continue;
    if (!best || t > best.t) best = { fill: f, t, pnl };
  }

  if (!best) {
    logger.debug('HL exchange close backfill — no close fill yet', {
      user: wallet.slice(0, 10),
      coin,
    });
    return;
  }

  const exitPx = Number(best.fill.px ?? 0);
  const size = Math.abs(Number(best.fill.sz ?? 0));
  if (!(exitPx > 0) || !(size > 0)) return;

  if (await closeAlreadyKnown({ wallet, coin, closedAtMs: best.t, pnl: best.pnl })) return;

  const entryPx = entryFromClose({
    direction: opts.direction,
    exitPx,
    size,
    pnl: best.pnl,
  });
  const reason = inferExchangeCloseReason(best.pnl, opts.direction);
  const closedAt = new Date(best.t).toISOString();
  const leverage = 10;
  const collateralUsd = entryPx > 0 ? (size * entryPx) / leverage : 0;

  await recordHlBotClose({
    walletAddress: wallet,
    reason,
    snapshot: {
      coin,
      direction: opts.direction,
      entryPx,
      exitPx,
      size,
      leverage,
      unrealizedPnlUsd: best.pnl,
      collateralUsd,
    },
    closedAt,
  });

  rememberCoinClose(wallet, coin, opts.direction, best.t);

  logger.info('HL exchange-trigger close recorded', {
    user: wallet.slice(0, 10),
    coin,
    direction: opts.direction,
    reason,
    pnl: best.pnl.toFixed(4),
    at: closedAt,
  });
}

const walletSweepAt = new Map<string, number>();
const SWEEP_MS = 12 * 60_000;

async function recordFillCloseIfMissing(
  wallet: string,
  fill: HlFill,
  direction: 'LONG' | 'SHORT'
): Promise<boolean> {
  const coin = String(fill.coin ?? '').toUpperCase();
  const t = Number(fill.time ?? 0);
  const pnl = Number(fill.closedPnl ?? 0);
  const exitPx = Number(fill.px ?? 0);
  const size = Math.abs(Number(fill.sz ?? 0));
  if (!coin || !Number.isFinite(t) || !(exitPx > 0) || !(size > 0)) return false;
  if (await closeAlreadyKnown({ wallet, coin, closedAtMs: t, pnl })) return false;

  const entryPx = entryFromClose({ direction, exitPx, size, pnl });
  const reason = inferExchangeCloseReason(pnl, direction);
  const closedAt = new Date(t).toISOString();
  const leverage = 10;
  const collateralUsd = entryPx > 0 ? (size * entryPx) / leverage : 0;

  await recordHlBotClose({
    walletAddress: wallet,
    reason,
    snapshot: {
      coin,
      direction,
      entryPx,
      exitPx,
      size,
      leverage,
      unrealizedPnlUsd: pnl,
      collateralUsd,
    },
    closedAt,
  });
  rememberCoinClose(wallet, coin, direction, t);
  return true;
}

/** Periodic sweep — fills missing rows for exchange fills (incl. before this deploy). */
export async function syncWalletMissingExchangeCloses(
  walletRaw: string,
  opts: { lookbackMs?: number; throttle?: boolean } = {}
): Promise<number> {
  const wallet = walletRaw.toLowerCase();
  const lookbackMs = opts.lookbackMs ?? 72 * 60 * 60 * 1000;
  const throttle = opts.throttle !== false;
  const now = Date.now();
  if (throttle) {
    const prev = walletSweepAt.get(wallet) ?? 0;
    if (now - prev < SWEEP_MS) return 0;
  }
  walletSweepAt.set(wallet, now);

  const fills = await fetchRecentFills(wallet);
  let recorded = 0;
  for (const f of fills) {
    const t = Number(f.time ?? 0);
    if (!Number.isFinite(t) || t < now - lookbackMs) continue;
    const pnl = Number(f.closedPnl ?? 0);
    const dir = String(f.dir ?? '');
    if (!isCloseDir(dir, pnl)) continue;
    const direction = fillDirection(f);
    if (!direction) continue;
    const marker = await import('./hlChartMarkers');
    void marker;
    const did = await recordFillCloseIfMissing(wallet, f, direction);
    if (did) recorded += 1;
  }
  if (recorded > 0) {
    logger.info('HL exchange close sweep recorded', {
      user: wallet.slice(0, 10),
      recorded,
    });
  }
  return recorded;
}

/** Fire-and-forget after syncVanishedHlOpens detects a flat coin. */
export function queueExchangeCloseBackfill(
  wallet: string,
  coin: string,
  direction: 'LONG' | 'SHORT'
): void {
  const key = `${wallet.toLowerCase()}:${coin.toUpperCase()}`;
  if (inflight.has(key)) return;
  inflight.add(key);
  void recordExchangeVanishedClose({ wallet, coin, direction })
    .catch((err) => {
      logger.warn('HL exchange close backfill failed', {
        user: wallet.slice(0, 10),
        coin,
        error: err instanceof Error ? err.message : String(err),
      });
    })
    .finally(() => {
      setTimeout(() => inflight.delete(key), 3_000);
    });
}