import { HttpTransport, InfoClient } from '@nktkas/hyperliquid';
import type { HlAssetMeta } from './types';

let assetIndexCache: Map<string, number> | null = null;
let assetMetaCache: HlAssetMeta[] | null = null;

const transport = new HttpTransport();
const info = new InfoClient({ transport });

/** Populate asset index cache from a markets fetch (avoids duplicate meta calls). */
export function warmHlMetaCache(universe: HlAssetMeta[] | undefined | null) {
  if (!Array.isArray(universe)) return;
  assetMetaCache = universe;
  assetIndexCache = new Map();
  universe.forEach((a, i) => {
    if (a?.name) assetIndexCache!.set(a.name, i);
  });
}

export async function getHlAssetIndex(coin: string): Promise<number> {
  if (!assetIndexCache) {
    const meta = await info.meta();
    warmHlMetaCache(meta.universe);
  }
  const idx = assetIndexCache.get(coin);
  if (idx === undefined) throw new Error(`Unknown perp: ${coin}`);
  return idx;
}

export async function getHlAssetMeta(coin: string): Promise<HlAssetMeta> {
  await getHlAssetIndex(coin);
  const meta = assetMetaCache?.find((a) => a.name === coin);
  if (!meta || meta.isDelisted) throw new Error(`Unknown perp: ${coin}`);
  return meta;
}

export function formatHlSize(size: number, szDecimals: number): string {
  const factor = 10 ** szDecimals;
  const rounded = Math.floor(size * factor) / factor;
  return rounded.toFixed(szDecimals).replace(/\.?0+$/, '') || '0';
}

/** HL perp prices: max 5 sig figs, max (6 - szDecimals) decimal places. */
export function formatHlPrice(price: number, szDecimals = 0, isSpot = false): string {
  const maxDecimals = Math.max(0, (isSpot ? 8 : 6) - szDecimals);
  if (price > 100_000) return String(Math.round(price));
  const sig = Number.parseFloat(price.toPrecision(5));
  const rounded = Number(sig.toFixed(maxDecimals));
  let s = rounded.toFixed(maxDecimals);
  if (s.includes('.')) s = s.replace(/\.?0+$/, '');
  return s;
}
