import { config } from '../config';
import { logger } from '../utils/logger';

/** Bot trade universe floor — 24h HL notional USD. Manual perps ignore this. */
export const BOT_MIN_DAY_VOLUME_USD = 2_500_000;

/**
 * Platform hard-delist — never scan or open, even if 24h volume clears the floor.
 * Keep in sync with frontend `BOT_EXCLUDED_HL_COINS` (CRV, CASHCAT).
 */
export const BOT_EXCLUDED_HL_COINS = new Set(['CRV', 'CASHCAT']);

export function isBotExcludedHlCoin(coin: string): boolean {
  return BOT_EXCLUDED_HL_COINS.has(coin.trim().toUpperCase().replace(/-PERP$/i, ''));
}

export type HlPerpLiquidity = {
  coin: string;
  markPx: number;
  dayVolumeUsd: number;
  openInterestUsd: number;
};

export type HlLiquidUniverse = {
  /** Bot-eligible HL perps (volume floor), sorted by 24h notional volume (desc). */
  coins: string[];
  markets: HlPerpLiquidity[];
  fetchedAt: number;
};

type AssetMeta = {
  name: string;
  isDelisted?: boolean;
  maxLeverage?: number;
};

type AssetCtx = {
  markPx?: string;
  openInterest?: string;
  dayNtlVlm?: string;
};

let cached: HlLiquidUniverse | null = null;

function toNum(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function botMinDayVolumeUsd(): number {
  const configured = config.hyperliquid.minDayVolumeUsd;
  if (Number.isFinite(configured) && configured > 0) return configured;
  return BOT_MIN_DAY_VOLUME_USD;
}

/** Bot scan universe — live mark + 24h volume floor (never illiquids like AXS). */
function passesBotScanUniverse(m: HlPerpLiquidity): boolean {
  if (isBotExcludedHlCoin(m.coin)) return false;
  if (m.markPx <= 0) return false;
  return m.dayVolumeUsd >= botMinDayVolumeUsd();
}

/** Bot open floor — same volume rule as scan. */
export function passesOpenLiquidityGate(m: HlPerpLiquidity): boolean {
  if (isBotExcludedHlCoin(m.coin)) return false;
  const minVol = botMinDayVolumeUsd();
  const minOi = config.hyperliquid.minOpenInterestUsd;
  if (m.markPx <= 0) return false;
  if (m.dayVolumeUsd < minVol) return false;
  if (minOi > 0 && m.openInterestUsd < minOi) return false;
  return true;
}

/** HL perps — bot scan/open universe is ≥ $2.5M 24h volume. Manual trading unrestricted. */
export async function fetchHlLiquidUniverse(force = false): Promise<HlLiquidUniverse> {
  const ttl = config.hyperliquid.liquidUniverseCacheMs;
  if (!force && cached && Date.now() - cached.fetchedAt < ttl) {
    return cached;
  }

  const res = await fetch(config.hyperliquid.infoUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
  });
  if (!res.ok) {
    throw new Error('HL metaAndAssetCtxs fetch failed');
  }

  const raw = (await res.json()) as unknown;
  if (!Array.isArray(raw) || raw.length < 2) {
    throw new Error('HL metaAndAssetCtxs invalid response');
  }

  const meta = raw[0] as { universe?: AssetMeta[] };
  const ctxs = raw[1] as AssetCtx[];
  if (!Array.isArray(meta?.universe) || !Array.isArray(ctxs)) {
    throw new Error('HL metaAndAssetCtxs missing universe');
  }

  const all: HlPerpLiquidity[] = [];
  meta.universe.forEach((asset, i) => {
    if (!asset?.name || asset.isDelisted) return;
    const ctx = ctxs[i];
    if (!ctx) return;
    const markPx = toNum(ctx.markPx);
    const openInterestCoin = toNum(ctx.openInterest);
    const dayVolumeUsd = toNum(ctx.dayNtlVlm);
    const openInterestUsd =
      openInterestCoin > 0 && markPx > 0 ? openInterestCoin * markPx : 0;
    all.push({
      coin: asset.name,
      markPx,
      dayVolumeUsd,
      openInterestUsd,
    });
  });

  const scannable = all
    .filter(passesBotScanUniverse)
    .sort((a, b) => b.dayVolumeUsd - a.dayVolumeUsd);

  const maxScan = config.hyperliquid.maxLiquidScanUniverse;
  const trimmed = maxScan > 0 ? scannable.slice(0, maxScan) : scannable;

  const universe: HlLiquidUniverse = {
    coins: trimmed.map((m) => m.coin.toUpperCase()),
    markets: trimmed.map((m) => ({ ...m, coin: m.coin.toUpperCase() })),
    fetchedAt: Date.now(),
  };

  cached = universe;

  const openEligible = trimmed.filter(passesOpenLiquidityGate).length;

  logger.info('HL bot trade universe built', {
    listed: all.length,
    botEligible: trimmed.length,
    openEligible,
    minDayVolumeUsd: botMinDayVolumeUsd(),
    minOpenInterestUsd: config.hyperliquid.minOpenInterestUsd,
    coins: universe.coins,
    topCoin: universe.coins[0],
    topVolM: trimmed[0] ? (trimmed[0].dayVolumeUsd / 1e6).toFixed(1) : '0',
  });

  return universe;
}

export function getHlLiquidityForCoin(
  universe: HlLiquidUniverse,
  coin: string
): HlPerpLiquidity | undefined {
  const key = coin.toUpperCase();
  return universe.markets.find((m) => m.coin.toUpperCase() === key);
}

export function isHlCoinLiquid(
  universe: HlLiquidUniverse,
  coin: string
): boolean {
  const row = getHlLiquidityForCoin(universe, coin);
  return row != null && passesOpenLiquidityGate(row);
}
