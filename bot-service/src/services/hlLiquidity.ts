import { config } from '../config';
import { logger } from '../utils/logger';

export type HlPerpLiquidity = {
  coin: string;
  markPx: number;
  dayVolumeUsd: number;
  openInterestUsd: number;
};

export type HlLiquidUniverse = {
  /** All active HL perps in scan universe, sorted by 24h notional volume (desc). */
  coins: string[];
  markets: HlPerpLiquidity[];
  fetchedAt: number;
  /**
   * The day-volume floor actually enforced this cycle. Equals the configured
   * HL_MIN_DAY_VOLUME_USD, but clamped down whenever that value would exclude the
   * top HL_MIN_TRADABLE_UNIVERSE perps — a stale/too-high Railway floor (e.g. $5M,
   * which nukes everything but BTC/ETH/SOL) can never silently kill the universe.
   */
  minDayVolumeUsdEffective: number;
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

/** Every listed HL perp with a live mark — full scan universe. */
function passesScanUniverse(m: HlPerpLiquidity): boolean {
  return m.markPx > 0;
}

/** Optional open-time floor — only when env sets minDayVolumeUsd / minOpenInterestUsd > 0. */
export function passesOpenLiquidityGate(m: HlPerpLiquidity, minVolOverride?: number): boolean {
  const minVol = minVolOverride ?? config.hyperliquid.minDayVolumeUsd;
  const minOi = config.hyperliquid.minOpenInterestUsd;
  if (m.markPx <= 0) return false;
  if (minVol > 0 && m.dayVolumeUsd < minVol) return false;
  if (minOi > 0 && m.openInterestUsd < minOi) return false;
  return true;
}

/**
 * Clamp the configured day-volume floor so it never excludes the top `minKeep`
 * most-liquid perps. `scannable` must be sorted by 24h volume descending.
 */
export function resolveEffectiveDayVolumeFloor(
  scannable: HlPerpLiquidity[],
  configuredFloor: number,
  minKeep: number
): number {
  if (configuredFloor <= 0 || minKeep <= 0 || scannable.length < minKeep) {
    return Math.max(0, configuredFloor);
  }
  const keepFloor = scannable[minKeep - 1]?.dayVolumeUsd ?? 0;
  return configuredFloor > keepFloor ? keepFloor : configuredFloor;
}

/** HL perps — scan universe is all listed coins; open floors are optional. */
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
    .filter(passesScanUniverse)
    .sort((a, b) => b.dayVolumeUsd - a.dayVolumeUsd);

  const maxScan = config.hyperliquid.maxLiquidScanUniverse;
  const trimmed = maxScan > 0 ? scannable.slice(0, maxScan) : scannable;

  const configuredFloor = config.hyperliquid.minDayVolumeUsd;
  const minKeep = config.hyperliquid.minTradableUniverse;
  const minDayVolumeUsdEffective = resolveEffectiveDayVolumeFloor(
    scannable,
    configuredFloor,
    minKeep
  );

  const universe: HlLiquidUniverse = {
    coins: trimmed.map((m) => m.coin),
    markets: trimmed,
    fetchedAt: Date.now(),
    minDayVolumeUsdEffective,
  };

  cached = universe;

  const openEligible = trimmed.filter((m) =>
    passesOpenLiquidityGate(m, minDayVolumeUsdEffective)
  ).length;

  if (minDayVolumeUsdEffective < configuredFloor) {
    logger.warn('HL day-volume floor clamped — configured value would starve the universe', {
      configuredFloorM: (configuredFloor / 1e6).toFixed(2),
      effectiveFloorM: (minDayVolumeUsdEffective / 1e6).toFixed(2),
      minKeep,
      openEligible,
    });
  }

  logger.info('HL liquid universe built', {
    listed: all.length,
    scanning: trimmed.length,
    openEligible,
    minDayVolumeUsd: configuredFloor,
    minDayVolumeUsdEffective,
    minOpenInterestUsd: config.hyperliquid.minOpenInterestUsd,
    topCoin: trimmed[0]?.coin,
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
  return row != null && passesOpenLiquidityGate(row, universe.minDayVolumeUsdEffective);
}

export type HlLiquidityStatus =
  | { liquid: true; reason: string }
  | { liquid: false; kind: 'missing' | 'below_floor'; reason: string };

/**
 * Precise liquidity verdict — separates a data/mapping miss ("missing": no HL row
 * or no mark) from an env-floor rejection ("below_floor": real volume/OI under the
 * configured minimum). Surfaces the exact configured floor so a stale Railway
 * HL_MIN_DAY_VOLUME_USD is visible in the block log, not hidden behind a generic bucket.
 */
export function hlCoinLiquidityStatus(
  universe: HlLiquidUniverse,
  coin: string
): HlLiquidityStatus {
  const key = coin.toUpperCase();
  const row = getHlLiquidityForCoin(universe, coin);
  if (row == null) {
    return {
      liquid: false,
      kind: 'missing',
      reason: `${key}: no HL perp row in scan universe (mapping/listing miss)`,
    };
  }
  if (row.markPx <= 0) {
    return {
      liquid: false,
      kind: 'missing',
      reason: `${key}: no live HL mark price (data miss)`,
    };
  }

  const minVol = universe.minDayVolumeUsdEffective;
  const minOi = config.hyperliquid.minOpenInterestUsd;
  const volM = row.dayVolumeUsd / 1e6;

  if (minVol > 0 && row.dayVolumeUsd < minVol) {
    return {
      liquid: false,
      kind: 'below_floor',
      reason: `${key}: 24h volume $${volM.toFixed(2)}M below floor $${(minVol / 1e6).toFixed(2)}M (HL_MIN_DAY_VOLUME_USD)`,
    };
  }
  if (minOi > 0 && row.openInterestUsd < minOi) {
    return {
      liquid: false,
      kind: 'below_floor',
      reason: `${key}: open interest $${(row.openInterestUsd / 1e6).toFixed(2)}M below floor $${(minOi / 1e6).toFixed(2)}M (HL_MIN_OPEN_INTEREST_USD)`,
    };
  }

  return { liquid: true, reason: `${key}: liquid ($${volM.toFixed(2)}M/24h)` };
}
