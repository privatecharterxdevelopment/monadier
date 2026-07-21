import { hlInfoPost } from './hlInfoClient';
import { toNum } from './parse';
import type {
  HlAssetCtx,
  HlAssetMeta,
  HlCandle,
  HlCandleBar,
  HlInterval,
  HlL2Book,
  HlMarketSnapshot,
  HlRecentTrade,
} from './types';

async function hlInfo<T>(body: Record<string, unknown>): Promise<T> {
  return hlInfoPost<T>(body);
}

export function candleToBar(c: HlCandle): HlCandleBar {
  return {
    time: Math.floor(c.t / 1000),
    open: toNum(c.o),
    high: toNum(c.h),
    low: toNum(c.l),
    close: toNum(c.c),
    volume: toNum(c.v),
  };
}

import { chartHistoryStartMs, chartIntervalMs } from './chartZoom';

/**
 * HL candleSnapshot is rate-limited hard. Loading Jan→now on 1m used to require
 * ~60 sequential pages and blanked charts with 500s. One page (~4.5k bars) is
 * enough for a solid trading view; older history is optional / scrollable later.
 */
const HL_CANDLE_PAGE_BARS = 4500;
/** Default chart paint: a single request. Never stampede /info. */
const HL_CANDLE_PRIMARY_PAGES = 1;
/** Optional deeper backfill — keep low so coin switches stay snappy. */
const HL_CANDLE_MAX_PAGES = 3;

export type FetchHlCandlesOptions = {
  /** Max snapshot pages (1 page ≈ instant paint). Default 1. */
  maxPages?: number;
};

export async function fetchHlCandles(
  coin: string,
  interval: HlInterval,
  lookbackMs?: number,
  opts?: FetchHlCandlesOptions
): Promise<HlCandleBar[]> {
  const stepMs = chartIntervalMs(interval);
  const endTime = Date.now();
  const historyFloor = chartHistoryStartMs();
  const startFromLookback =
    lookbackMs != null && lookbackMs > 0 ? endTime - lookbackMs : historyFloor;
  const desiredStart = Math.min(historyFloor, startFromLookback);

  const maxPages = Math.max(1, Math.min(HL_CANDLE_MAX_PAGES, opts?.maxPages ?? HL_CANDLE_PRIMARY_PAGES));
  // Cap how far back we ask so we never schedule dozens of pages.
  const maxSpanMs = maxPages * HL_CANDLE_PAGE_BARS * stepMs;
  const startTime = Math.max(desiredStart, endTime - maxSpanMs);

  const byTime = new Map<number, HlCandleBar>();
  let chunkEnd = endTime;
  let pages = 0;

  while (chunkEnd > startTime && pages < maxPages) {
    pages += 1;
    const chunkStart = Math.max(startTime, chunkEnd - HL_CANDLE_PAGE_BARS * stepMs);
    let rows: HlCandle[] = [];
    try {
      const raw = await hlInfo<HlCandle[] | null>({
        type: 'candleSnapshot',
        req: { coin, interval, startTime: chunkStart, endTime: chunkEnd },
      });
      rows = Array.isArray(raw) ? raw : [];
    } catch (err) {
      // First page must surface the error; later pages keep what we already have.
      if (byTime.size === 0) throw err;
      break;
    }
    if (!rows.length) break;
    for (const row of rows) {
      const bar = candleToBar(row);
      byTime.set(bar.time, bar);
    }
    if (pages >= maxPages) break;
    const earliest = Math.min(...rows.map((r) => r.t));
    if (!(earliest > 0) || earliest <= chunkStart + stepMs) break;
    chunkEnd = earliest - 1;
    if (chunkEnd <= startTime) break;
  }

  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

export async function fetchHlOrderBook(coin: string): Promise<HlL2Book> {
  return hlInfo<HlL2Book>({ type: 'l2Book', coin });
}

type MetaResponse = [{ universe: HlAssetMeta[] }, HlAssetCtx[]];

export async function fetchHlMarketSnapshot(coin: string): Promise<HlMarketSnapshot | null> {
  const raw = await hlInfo<unknown>({ type: 'metaAndAssetCtxs' });
  if (!Array.isArray(raw) || raw.length < 2) return null;

  const meta = raw[0] as { universe?: HlAssetMeta[] };
  const ctxs = raw[1] as HlAssetCtx[];
  if (!Array.isArray(meta?.universe) || !Array.isArray(ctxs)) return null;

  const idx = meta.universe.findIndex((a) => a.name === coin && !a.isDelisted);
  if (idx < 0) return null;
  const asset = meta.universe[idx];
  const ctx = ctxs[idx];
  if (!asset || !ctx) return null;

  const markPx = toNum(ctx.markPx);
  const prevDayPx = toNum(ctx.prevDayPx);
  const change24hAbs = markPx - prevDayPx;
  const change24hPct = prevDayPx > 0 ? (change24hAbs / prevDayPx) * 100 : 0;
  const openInterestCoin = toNum(ctx.openInterest);
  return {
    coin,
    markPx,
    midPx: toNum(ctx.midPx) || markPx,
    oraclePx: toNum(ctx.oraclePx) || markPx,
    prevDayPx,
    change24hAbs,
    change24hPct,
    fundingRate: toNum(ctx.funding),
    dayVolumeUsd: toNum(ctx.dayNtlVlm),
    openInterestUsd: openInterestCoin > 0 && markPx > 0 ? openInterestCoin * markPx : 0,
    maxLeverage: toNum(asset.maxLeverage),
  };
}

export async function fetchHlRecentTrades(coin: string): Promise<HlRecentTrade[]> {
  const rows = await hlInfo<HlRecentTrade[]>({ type: 'recentTrades', coin });
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, 50).map((t) => ({
    coin: String(t.coin ?? coin),
    side: String(t.side ?? ''),
    px: String(t.px ?? '0'),
    sz: String(t.sz ?? '0'),
    time: toNum(t.time),
  }));
}
