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

export async function fetchHlCandles(
  coin: string,
  interval: HlInterval,
  lookbackMs = 7 * 24 * 60 * 60 * 1000
): Promise<HlCandleBar[]> {
  const endTime = Date.now();
  const startTime = endTime - lookbackMs;
  const rows = await hlInfo<HlCandle[]>({
    type: 'candleSnapshot',
    req: { coin, interval, startTime, endTime },
  });
  return rows.map(candleToBar).sort((a, b) => a.time - b.time);
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
