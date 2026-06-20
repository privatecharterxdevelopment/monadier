import { hlInfoPost } from './hlInfoClient';
import { warmHlMetaCache } from './meta';
import { toNum } from './parse';
import type { HlAssetCtx, HlAssetMeta } from './types';

export type HlMarket = {
  name: string;
  maxLeverage: number;
  szDecimals: number;
  markPx: number;
  change24hPct: number;
  dayVolumeUsd: number;
  fundingRate: number;
  openInterestUsd: number;
};

type MetaResponse = [{ universe: HlAssetMeta[] }, HlAssetCtx[]];

async function hlInfo<T>(body: Record<string, unknown>): Promise<T> {
  return hlInfoPost<T>(body);
}

function buildMarket(asset: HlAssetMeta, ctx: HlAssetCtx | undefined): HlMarket | null {
  if (!asset?.name || asset.isDelisted || !ctx) return null;
  const markPx = toNum(ctx.markPx);
  const prevDayPx = toNum(ctx.prevDayPx);
  const change24hPct = prevDayPx > 0 ? ((markPx - prevDayPx) / prevDayPx) * 100 : 0;
  const openInterestCoin = toNum(ctx.openInterest);
  return {
    name: asset.name,
    maxLeverage: toNum(asset.maxLeverage),
    szDecimals: toNum(asset.szDecimals, 0),
    markPx,
    change24hPct,
    dayVolumeUsd: toNum(ctx.dayNtlVlm),
    fundingRate: toNum(ctx.funding),
    openInterestUsd: openInterestCoin > 0 && markPx > 0 ? openInterestCoin * markPx : 0,
  };
}

function parseMetaResponse(raw: unknown): MetaResponse | null {
  if (!Array.isArray(raw) || raw.length < 2) return null;
  const meta = raw[0] as { universe?: HlAssetMeta[] };
  const ctxs = raw[1] as HlAssetCtx[];
  if (!Array.isArray(meta?.universe) || !Array.isArray(ctxs)) return null;
  return [meta, ctxs];
}

/** All active Hyperliquid perps, sorted by 24h volume (desc). */
export async function fetchHlMarkets(): Promise<HlMarket[]> {
  const parsed = parseMetaResponse(await hlInfo<unknown>({ type: 'metaAndAssetCtxs' }));
  if (!parsed) return [];

  const [meta, ctxs] = parsed;
  warmHlMetaCache(meta.universe);

  const markets = meta.universe
    .map((asset, i) => buildMarket(asset, ctxs[i]))
    .filter((m): m is HlMarket => m != null)
    .sort((a, b) => b.dayVolumeUsd - a.dayVolumeUsd);

  return markets;
}

/** Mark prices for specific coins (e.g. open positions) in one API call. */
export async function fetchHlMarkPrices(coins: string[]): Promise<Record<string, number>> {
  const unique = [...new Set(coins.filter(Boolean))];
  if (unique.length === 0) return {};

  const parsed = parseMetaResponse(await hlInfo<unknown>({ type: 'metaAndAssetCtxs' }));
  if (!parsed) return {};

  const [meta, ctxs] = parsed;
  const indexByName = new Map<string, number>();
  meta.universe.forEach((a, i) => {
    if (!a.isDelisted && a.name) indexByName.set(a.name, i);
  });

  const out: Record<string, number> = {};
  for (const coin of unique) {
    const idx = indexByName.get(coin);
    if (idx == null) continue;
    const px = toNum(ctxs[idx]?.markPx);
    if (px > 0) out[coin] = px;
  }
  return out;
}
