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
  oid?: number;
  fee?: string | number;
};

/** One position close = all its fills (same coin + side, same oid or within 3s). */
export type AggregatedClose = {
  coin: string;
  direction: 'LONG' | 'SHORT';
  /** Last fill time of the close. */
  t: number;
  grossPnl: number;
  feeUsd: number;
  /** gross − close fees (same as bot close path / fetchHlCloseNetPnlUsd). */
  netPnl: number;
  size: number;
  /** Size-weighted exit price. */
  exitPx: number;
  /** Individual fill closedPnl — used to dedupe rows written before this fix. */
  partPnls: number[];
  lastFill: HlFill;
};

const CLOSE_GROUP_GAP_MS = 3_000;

/**
 * Group close fills into closes. Bug fixed: HL splits one close into several fills
 * (e.g. ADA 783 + 949) — previously only one fill landed in trade_history (−3.56 of −7.88).
 */
export function aggregateCloseFills(fills: HlFill[]): AggregatedClose[] {
  const rows = fills
    .map((f) => ({
      f,
      t: Number(f.time ?? 0),
      pnl: Number(f.closedPnl ?? 0),
      coin: String(f.coin ?? '').toUpperCase(),
      direction: fillDirection(f),
    }))
    .filter(
      (r) =>
        r.coin &&
        Number.isFinite(r.t) &&
        Number.isFinite(r.pnl) &&
        r.direction != null &&
        isCloseDir(String(r.f.dir ?? ''), r.pnl)
    )
    .sort((a, b) => a.t - b.t);

  const out: AggregatedClose[] = [];
  const open = new Map<string, { agg: AggregatedClose; oid?: number; pxSz: number }>();
  for (const r of rows) {
    const key = `${r.coin}:${r.direction}`;
    const px = Number(r.f.px ?? 0);
    const sz = Math.abs(Number(r.f.sz ?? 0));
    const fee = Number(r.f.fee ?? 0);
    const cur = open.get(key);
    const sameClose =
      cur &&
      ((r.f.oid != null && cur.oid != null && r.f.oid === cur.oid) ||
        r.t - cur.agg.t <= CLOSE_GROUP_GAP_MS);
    if (cur && sameClose) {
      cur.agg.t = r.t;
      cur.agg.grossPnl += r.pnl;
      cur.agg.feeUsd += Number.isFinite(fee) ? fee : 0;
      cur.agg.size += sz;
      cur.pxSz += px * sz;
      cur.agg.partPnls.push(r.pnl);
      cur.agg.lastFill = r.f;
      continue;
    }
    const agg: AggregatedClose = {
      coin: r.coin,
      direction: r.direction as 'LONG' | 'SHORT',
      t: r.t,
      grossPnl: r.pnl,
      feeUsd: Number.isFinite(fee) ? fee : 0,
      netPnl: 0,
      size: sz,
      exitPx: px,
      partPnls: [r.pnl],
      lastFill: r.f,
    };
    const slot = { agg, oid: r.f.oid, pxSz: px * sz };
    open.set(key, slot);
    out.push(agg);
    (agg as AggregatedClose & { _slot?: typeof slot })._slot = slot;
  }
  for (const a of out) {
    const slot = (a as AggregatedClose & { _slot?: { pxSz: number } })._slot;
    if (slot && a.size > 0) a.exitPx = slot.pxSz / a.size;
    delete (a as AggregatedClose & { _slot?: unknown })._slot;
    const round = (n: number) => Math.round(n * 1e6) / 1e6;
    a.grossPnl = round(a.grossPnl);
    a.feeUsd = round(a.feeUsd);
    a.netPnl = round(a.grossPnl - a.feeUsd);
  }
  return out;
}

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
  /** Single-fill PnLs of this close — rows written by the old one-fill backfill. */
  partPnls?: number[];
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
    if (!Number.isFinite(rowPnl)) continue;
    if (Math.abs(rowPnl - opts.pnl) < 0.12) return true;
    if ((opts.partPnls ?? []).some((p) => Math.abs(rowPnl - p) < 0.01)) return true;
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

function fillLooksLikeStopOrder(fill: HlFill): boolean {
  const dir = String(fill.dir ?? '').toLowerCase();
  return /stop|trigger|liquidat/i.test(dir);
}

/** Don't call every red HL fill "SL" — only when the fill looks like a stop/trigger. */
function inferExchangeCloseReason(
  pnl: number,
  direction: 'LONG' | 'SHORT',
  fill: HlFill
): string {
  const stopLike = fillLooksLikeStopOrder(fill);
  if (stopLike && pnl > 0.001) return 'profit_sl_exchange';
  if (stopLike && pnl < -0.001) return 'stop_loss_exchange';
  if (pnl < -0.001) return `exchange_close_${direction.toLowerCase()}_loss`;
  if (pnl > 0.001) return `exchange_close_${direction.toLowerCase()}_profit`;
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
  const closes = aggregateCloseFills(fills).filter(
    (c) => c.coin === coin && c.direction === opts.direction && c.t >= now - lookbackMs
  );
  const best = closes.length ? closes[closes.length - 1] : null;

  if (!best) {
    logger.debug('HL exchange close backfill — no close fill yet', {
      user: wallet.slice(0, 10),
      coin,
    });
    return;
  }

  const recorded = await recordAggregatedClose(wallet, best);
  if (!recorded) return;

  logger.info('HL exchange-trigger close recorded', {
    user: wallet.slice(0, 10),
    coin,
    direction: opts.direction,
    fills: best.partPnls.length,
    grossPnl: best.grossPnl.toFixed(4),
    netPnl: best.netPnl.toFixed(4),
    at: new Date(best.t).toISOString(),
  });
}

const walletSweepAt = new Map<string, number>();
const SWEEP_MS = 12 * 60_000;

/** Live leverage for the coin from HL, else 10 (display only — PnL comes from fills). */
async function liveLeverageForCoin(wallet: string, coin: string): Promise<number> {
  try {
    const res = await fetch(config.hyperliquid.infoUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'activeAssetData', user: wallet, coin }),
    });
    if (!res.ok) return 10;
    const j = (await res.json()) as { leverage?: { value?: number } };
    const v = Number(j?.leverage?.value);
    return Number.isFinite(v) && v >= 1 ? v : 10;
  } catch {
    return 10;
  }
}

async function recordAggregatedClose(wallet: string, c: AggregatedClose): Promise<boolean> {
  if (!(c.exitPx > 0) || !(c.size > 0)) return false;
  if (
    await closeAlreadyKnown({
      wallet,
      coin: c.coin,
      closedAtMs: c.t,
      pnl: c.netPnl,
      partPnls: [...c.partPnls, c.grossPnl],
    })
  ) {
    return false;
  }

  const entryPx = entryFromClose({
    direction: c.direction,
    exitPx: c.exitPx,
    size: c.size,
    pnl: c.grossPnl,
  });
  const reason = inferExchangeCloseReason(c.grossPnl, c.direction, c.lastFill);
  const leverage = await liveLeverageForCoin(wallet, c.coin);
  const collateralUsd = entryPx > 0 ? (c.size * entryPx) / leverage : 0;

  await recordHlBotClose({
    walletAddress: wallet,
    reason,
    snapshot: {
      coin: c.coin,
      direction: c.direction,
      entryPx,
      exitPx: c.exitPx,
      size: c.size,
      leverage,
      unrealizedPnlUsd: c.netPnl,
      collateralUsd,
    },
    closedAt: new Date(c.t).toISOString(),
  });
  rememberCoinClose(wallet, c.coin, c.direction, c.t, { skipWalletReentry: true });
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
  for (const c of aggregateCloseFills(fills)) {
    if (c.t < now - lookbackMs) continue;
    const did = await recordAggregatedClose(wallet, c);
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