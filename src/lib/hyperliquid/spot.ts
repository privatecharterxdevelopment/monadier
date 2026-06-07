import { HttpTransport, InfoClient } from '@nktkas/hyperliquid';
import { HL_INFO_URL } from './constants';
import { toNum } from './parse';
import type { HlAssetMeta, HlCandle, HlCandleBar, HlInterval, HlL2Book, HlRecentTrade } from './types';
import { candleToBar } from './api';

export type HlSpotToken = {
  name: string;
  szDecimals: number;
  index: number;
};

export type HlSpotPair = {
  name: string;
  index: number;
  tokens: [number, number];
  isCanonical?: boolean;
};

export type HlSpotMarket = {
  name: string;
  displayName: string;
  index: number;
  baseToken: string;
  quoteToken: string;
  szDecimals: number;
  markPx: number;
  change24hPct: number;
  dayVolumeUsd: number;
};

export type HlSpotMarketSnapshot = {
  coin: string;
  displayName: string;
  markPx: number;
  midPx: number;
  prevDayPx: number;
  change24hPct: number;
  change24hAbs: number;
  dayVolumeUsd: number;
  szDecimals: number;
};

type SpotCtx = {
  prevDayPx?: string;
  dayNtlVlm?: string;
  markPx?: string;
  midPx?: string;
  coin?: string;
};

let spotMetaCache: {
  universe: HlSpotPair[];
  tokens: HlSpotToken[];
  tokenByIndex: Map<number, HlSpotToken>;
  displayByName: Map<string, string>;
} | null = null;

let spotAssetIndexCache: Map<string, number> | null = null;
let spotAssetMetaCache: Map<string, HlAssetMeta> | null = null;

const transport = new HttpTransport();
const info = new InfoClient({ transport });

async function hlInfo<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch(HL_INFO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Hyperliquid API ${res.status}`);
  return res.json() as Promise<T>;
}

function resolveDisplayName(
  pair: HlSpotPair,
  tokenByIndex: Map<number, HlSpotToken>
): string {
  if (pair.name.includes('/')) return pair.name;
  const base = tokenByIndex.get(pair.tokens[0])?.name ?? '?';
  const quote = tokenByIndex.get(pair.tokens[1])?.name ?? '?';
  return `${base}/${quote}`;
}

export function warmHlSpotMetaCache(meta: {
  universe?: HlSpotPair[];
  tokens?: HlSpotToken[];
}) {
  if (!Array.isArray(meta?.universe) || !Array.isArray(meta?.tokens)) return;

  const tokenByIndex = new Map<number, HlSpotToken>();
  for (const t of meta.tokens) {
    if (t?.name != null) tokenByIndex.set(t.index, t);
  }

  const displayByName = new Map<string, string>();
  for (const pair of meta.universe) {
    if (pair?.name) displayByName.set(pair.name, resolveDisplayName(pair, tokenByIndex));
  }

  spotMetaCache = {
    universe: meta.universe,
    tokens: meta.tokens,
    tokenByIndex,
    displayByName,
  };

  spotAssetIndexCache = new Map();
  spotAssetMetaCache = new Map();

  for (const pair of meta.universe) {
    if (!pair?.name) continue;
    const base = tokenByIndex.get(pair.tokens[0]);
    const szDecimals = toNum(base?.szDecimals, 0);
    spotAssetIndexCache.set(pair.name, 10_000 + pair.index);
    spotAssetMetaCache.set(pair.name, {
      name: pair.name,
      szDecimals,
      maxLeverage: 1,
    });
  }
}

async function ensureSpotMeta() {
  if (spotMetaCache) return spotMetaCache;
  const raw = await info.spotMeta();
  warmHlSpotMetaCache(raw as { universe: HlSpotPair[]; tokens: HlSpotToken[] });
  return spotMetaCache!;
}

export function getSpotDisplayName(coin: string): string {
  return spotMetaCache?.displayByName.get(coin) ?? coin;
}

/** Spot asset index for order placement (10000 + universe index). */
export async function getHlSpotAssetIndex(coin: string): Promise<number> {
  await ensureSpotMeta();
  const idx = spotAssetIndexCache?.get(coin);
  if (idx === undefined) throw new Error(`Unknown spot market: ${coin}`);
  return idx;
}

export async function getHlSpotAssetMeta(coin: string): Promise<HlAssetMeta> {
  await ensureSpotMeta();
  const meta = spotAssetMetaCache?.get(coin);
  if (!meta) throw new Error(`Unknown spot market: ${coin}`);
  return meta;
}

function buildSpotMarket(
  pair: HlSpotPair,
  ctx: SpotCtx | undefined,
  tokenByIndex: Map<number, HlSpotToken>,
  displayByName: Map<string, string>
): HlSpotMarket | null {
  if (!pair?.name || !ctx) return null;
  const markPx = toNum(ctx.markPx);
  const prevDayPx = toNum(ctx.prevDayPx);
  const change24hPct = prevDayPx > 0 ? ((markPx - prevDayPx) / prevDayPx) * 100 : 0;
  const base = tokenByIndex.get(pair.tokens[0]);
  return {
    name: pair.name,
    displayName: displayByName.get(pair.name) ?? pair.name,
    index: pair.index,
    baseToken: base?.name ?? '',
    quoteToken: tokenByIndex.get(pair.tokens[1])?.name ?? 'USDC',
    szDecimals: toNum(base?.szDecimals, 0),
    markPx,
    change24hPct,
    dayVolumeUsd: toNum(ctx.dayNtlVlm),
  };
}

/** Active spot markets sorted by 24h volume. */
export async function fetchHlSpotMarkets(): Promise<HlSpotMarket[]> {
  const [meta, ctxs] = await info.spotMetaAndAssetCtxs();
  warmHlSpotMetaCache(meta as { universe: HlSpotPair[]; tokens: HlSpotToken[] });
  const cache = spotMetaCache!;

  return meta.universe
    .map((pair, i) =>
      buildSpotMarket(pair as HlSpotPair, ctxs[i] as SpotCtx, cache.tokenByIndex, cache.displayByName)
    )
    .filter((m): m is HlSpotMarket => m != null && m.dayVolumeUsd > 0)
    .sort((a, b) => b.dayVolumeUsd - a.dayVolumeUsd);
}

export async function fetchHlSpotMarketSnapshot(coin: string): Promise<HlSpotMarketSnapshot | null> {
  const [meta, ctxs] = await info.spotMetaAndAssetCtxs();
  warmHlSpotMetaCache(meta as { universe: HlSpotPair[]; tokens: HlSpotToken[] });

  const idx = meta.universe.findIndex((p) => p.name === coin);
  if (idx < 0) return null;

  const pair = meta.universe[idx] as HlSpotPair;
  const ctx = ctxs[idx] as SpotCtx;
  if (!ctx) return null;

  const markPx = toNum(ctx.markPx);
  const prevDayPx = toNum(ctx.prevDayPx);
  const change24hAbs = markPx - prevDayPx;
  const change24hPct = prevDayPx > 0 ? (change24hAbs / prevDayPx) * 100 : 0;
  const base = spotMetaCache!.tokenByIndex.get(pair.tokens[0]);

  return {
    coin,
    displayName: getSpotDisplayName(coin),
    markPx,
    midPx: toNum(ctx.midPx) || markPx,
    prevDayPx,
    change24hAbs,
    change24hPct,
    dayVolumeUsd: toNum(ctx.dayNtlVlm),
    szDecimals: toNum(base?.szDecimals, 0),
  };
}

export async function fetchHlSpotCandles(
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

export async function fetchHlSpotOrderBook(coin: string): Promise<HlL2Book> {
  return hlInfo<HlL2Book>({ type: 'l2Book', coin });
}

export async function fetchHlSpotRecentTrades(coin: string): Promise<HlRecentTrade[]> {
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

/** USDC ⇄ USDE spot pair identifier. */
export const USDE_USDC_SPOT_COIN = '@150';

export function isHlSpotCoin(coin: string): boolean {
  return coin.includes('/') || coin.startsWith('@');
}
