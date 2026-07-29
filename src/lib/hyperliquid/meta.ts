import { HttpTransport, InfoClient } from '@nktkas/hyperliquid';
import type { HlAssetMeta } from './types';

let assetIndexCache: Map<string, number> | null = null;
let assetMetaCache: HlAssetMeta[] | null = null;
/** UPPERCASE perp name → HL's canonical name (e.g. "KBONK" → "kBONK"). */
let canonicalNameCache: Map<string, string> | null = null;

const transport = new HttpTransport();
const info = new InfoClient({ transport });

/** Populate asset index cache from a markets fetch (avoids duplicate meta calls). */
export function warmHlMetaCache(universe: HlAssetMeta[] | undefined | null) {
  if (!Array.isArray(universe)) return;
  assetMetaCache = universe;
  assetIndexCache = new Map();
  canonicalNameCache = new Map();
  universe.forEach((a, i) => {
    if (a?.name) {
      assetIndexCache!.set(a.name, i);
      // k-prefixed perps (kBONK, kPEPE, kSHIB…) break under blanket toUpperCase()
      // upstream. Keep a case-insensitive index so "KBONK" still resolves to "kBONK".
      canonicalNameCache!.set(a.name.toUpperCase(), a.name);
    }
  });
}

async function ensureMetaCache(): Promise<void> {
  if (!assetIndexCache || !canonicalNameCache) {
    const meta = await info.meta();
    warmHlMetaCache(meta.universe);
  }
}

/** Resolve a UI/user coin symbol to HL's canonical perp name (handles k-prefix / casing). */
export function resolveHlCoinName(coin: string): string | null {
  if (!canonicalNameCache) return null;
  if (assetIndexCache?.has(coin)) return coin;
  return canonicalNameCache.get(coin.trim().toUpperCase()) ?? null;
}

export async function getHlAssetIndex(coin: string): Promise<number> {
  await ensureMetaCache();
  let idx = assetIndexCache!.get(coin);
  if (idx === undefined) {
    const canonical = canonicalNameCache!.get(coin.trim().toUpperCase());
    if (canonical) idx = assetIndexCache!.get(canonical);
  }
  if (idx === undefined) throw new Error(`Unknown perp: ${coin}`);
  return idx;
}

export async function getHlAssetMeta(coin: string): Promise<HlAssetMeta> {
  await getHlAssetIndex(coin);
  const canonical = canonicalNameCache!.get(coin.trim().toUpperCase()) ?? coin;
  const meta = assetMetaCache?.find((a) => a.name === canonical);
  if (!meta || meta.isDelisted) throw new Error(`Unknown perp: ${coin}`);
  return meta;
}

export function formatHlSize(size: number, szDecimals: number): string {
  if (!Number.isFinite(size) || size <= 0) return '0';
  const factor = 10 ** szDecimals;
  // Math.round — bare Math.floor truncates float noise (0.5105*1e4 → 5104.999… → 0.5104)
  // and leaves residual open size after reduce-only closes.
  const rounded = Math.round(size * factor) / factor;
  if (rounded <= 0) {
    const minLot = 1 / factor;
    return minLot.toFixed(szDecimals).replace(/\.?0+$/, '') || '0';
  }
  return rounded.toFixed(szDecimals).replace(/\.?0+$/, '') || '0';
}

/** Reduce-only close — ceil so UI closes never leave dust either. */
export function formatHlCloseSize(size: number, szDecimals: number): string {
  if (!Number.isFinite(size) || size <= 0) return '0';
  const factor = 10 ** szDecimals;
  let rounded = Math.ceil(size * factor - 1e-12) / factor;
  if (rounded <= 0) rounded = 1 / factor;
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
