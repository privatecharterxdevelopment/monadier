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

export function formatHlPrice(price: number): string {
  if (price >= 1000) return price.toFixed(1);
  if (price >= 100) return price.toFixed(2);
  return price.toFixed(4);
}
