import { config } from '../config';
import { logger } from '../utils/logger';

export type HlPerpLiquidity = {
  coin: string;
  markPx: number;
  dayVolumeUsd: number;
  openInterestUsd: number;
};

export type HlLiquidUniverse = {
  /** Coins passing volume/OI filters, sorted by 24h notional volume (desc). */
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

function passesLiquidityGate(m: HlPerpLiquidity): boolean {
  const minVol = config.hyperliquid.minDayVolumeUsd;
  const minOi = config.hyperliquid.minOpenInterestUsd;
  return (
    m.markPx > 0 &&
    m.dayVolumeUsd >= minVol &&
    m.openInterestUsd >= minOi
  );
}

/** HL perps with real liquidity — used for bot scan/open universe. */
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

  const liquid = all
    .filter(passesLiquidityGate)
    .sort((a, b) => b.dayVolumeUsd - a.dayVolumeUsd);

  const maxScan = config.hyperliquid.maxLiquidScanUniverse;
  const trimmed = maxScan > 0 ? liquid.slice(0, maxScan) : liquid;

  const universe: HlLiquidUniverse = {
    coins: trimmed.map((m) => m.coin),
    markets: trimmed,
    fetchedAt: Date.now(),
  };

  cached = universe;

  logger.info('HL liquid universe built', {
    listed: all.length,
    passedFilters: liquid.length,
    scanning: trimmed.length,
    minDayVolumeUsd: config.hyperliquid.minDayVolumeUsd,
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
  return getHlLiquidityForCoin(universe, coin) != null;
}
