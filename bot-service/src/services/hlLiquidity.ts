import { config } from '../config';
import { logger } from '../utils/logger';
import { isBotTradeCoin } from './botTradeUniverse';

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
export function passesOpenLiquidityGate(m: HlPerpLiquidity): boolean {
  const minVol = config.hyperliquid.minDayVolumeUsd;
  const minOi = config.hyperliquid.minOpenInterestUsd;
  if (m.markPx <= 0) return false;
  if (minVol > 0 && m.dayVolumeUsd < minVol) return false;
  if (minOi > 0 && m.openInterestUsd < minOi) return false;
  return true;
}

function buildUniverseFromMetaCtxs(
  meta: { universe?: AssetMeta[] },
  ctxs: AssetCtx[]
): HlLiquidUniverse {
  const all: HlPerpLiquidity[] = [];
  (meta.universe ?? []).forEach((asset, i) => {
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
    .filter((m) => isBotTradeCoin(m.coin))
    .sort((a, b) => b.dayVolumeUsd - a.dayVolumeUsd);

  const maxScan = config.hyperliquid.maxLiquidScanUniverse;
  const trimmed = maxScan > 0 ? scannable.slice(0, maxScan) : scannable;

  return {
    coins: trimmed.map((m) => m.coin),
    markets: trimmed,
    fetchedAt: Date.now(),
  };
}

/** HL perps — scan universe is all listed coins; open floors are optional. */
export async function fetchHlLiquidUniverse(force = false): Promise<HlLiquidUniverse> {
  const ttl = config.hyperliquid.liquidUniverseCacheMs;
  const staleMaxMs = Math.max(ttl * 30, 180_000);
  if (!force && cached && Date.now() - cached.fetchedAt < ttl) {
    return cached;
  }

  const prior = cached;

  let res: Response;
  try {
    res = await fetch(config.hyperliquid.infoUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
    });
  } catch (err) {
    if (prior && Date.now() - prior.fetchedAt < staleMaxMs) {
      logger.warn('HL metaAndAssetCtxs network error — stale liquid universe', {
        error: err instanceof Error ? err.message : String(err),
        ageMs: Date.now() - prior.fetchedAt,
      });
      return prior;
    }
    throw err;
  }

  if (!res.ok) {
    if (prior && Date.now() - prior.fetchedAt < staleMaxMs) {
      logger.warn('HL metaAndAssetCtxs fetch failed — stale liquid universe', {
        status: res.status,
        ageMs: Date.now() - prior.fetchedAt,
      });
      return prior;
    }
    throw new Error(`HL metaAndAssetCtxs fetch failed (${res.status})`);
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

  const universe = buildUniverseFromMetaCtxs(meta, ctxs);
  cached = universe;

  const openEligible = universe.markets.filter(passesOpenLiquidityGate).length;

  logger.info('HL liquid universe built', {
    listed: universe.markets.length,
    scanning: universe.markets.length,
    openEligible,
    minDayVolumeUsd: config.hyperliquid.minDayVolumeUsd,
    minOpenInterestUsd: config.hyperliquid.minOpenInterestUsd,
    topCoin: universe.markets[0]?.coin,
    topVolM: universe.markets[0]
      ? (universe.markets[0].dayVolumeUsd / 1e6).toFixed(1)
      : '0',
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
