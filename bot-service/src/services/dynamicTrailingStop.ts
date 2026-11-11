/**
 * Price-based dynamic trailing stop — 3 phases:
 * 1 idle (no stop), 2 arm at profit threshold (entry + fees + buffer), 3 ATR/% trail ratchet.
 */
import { config } from '../config';
import { logger } from '../utils/logger';
import { signalEngine, type Candle } from './signalEngine';
import { classifyCoinTier, type CoinTier } from './coinTier';
import { hlCoinToBinanceSymbol } from './hlSymbols';

export type TrailPhase = 'idle' | 'armed' | 'trailing';

export type DynamicTrailRecord = {
  phase: TrailPhase;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  /** Max mark for LONG, min mark for SHORT (favorable extreme). */
  highestPriceSinceEntry: number;
  highestPnlSinceEntry: number;
  currentTrailStop: number | null;
  trailArmedAt: number | null;
  profitSinceAt: number | null;
  maxRunup: number;
  openedAt: number;
  estimatedFeesUsd: number;
  lastTrailDistancePx: number;
  timeInProfitMs: number;
  lossSlArmed?: boolean;
  trailCloseDeferUntil?: number | null;
  trailCloseDeferCount?: number;
};

export type TrailTickInput = {
  coin: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  markPrice: number;
  pnlUsd: number;
  absSize: number;
  notionalUsd: number;
  collateralUsd: number;
  nowMs: number;
  record: DynamicTrailRecord | null;
  totalHoldMs?: number;
  stopLossPct?: number;
  fundingUsd?: number;
  tickSize?: number;
  szDecimals?: number;
};

export type TrailTickResult = {
  record: DynamicTrailRecord;
  shouldClose: boolean;
  exitReason: string;
  closeDetail: string;
};

function emptyRecord(
  direction: 'LONG' | 'SHORT',
  entryPrice: number,
  markPrice: number,
  nowMs: number,
  feesUsd: number
): DynamicTrailRecord {
  return {
    phase: 'idle',
    direction,
    entryPrice,
    highestPriceSinceEntry: markPrice,
    highestPnlSinceEntry: 0,
    currentTrailStop: null,
    trailArmedAt: null,
    profitSinceAt: null,
    maxRunup: 0,
    openedAt: nowMs,
    estimatedFeesUsd: feesUsd,
    lastTrailDistancePx: 0,
    timeInProfitMs: 0,
  };
}

export function estimateRoundTripFeesUsd(notionalUsd: number): number {
  const bps = config.hyperliquid.dynamicTrail.estimatedFeeBpsPerSide;
  return notionalUsd * (bps / 10_000) * 2;
}

export function markFromPosition(entryPx: number, szi: number, pnlUsd: number): number {
  if (!Number.isFinite(entryPx) || Math.abs(szi) < 1e-12) return entryPx;
  return entryPx + pnlUsd / szi;
}

function roePct(pnlUsd: number, collateralUsd: number): number {
  if (collateralUsd <= 0) return 0;
  return (pnlUsd / collateralUsd) * 100;
}

export function shouldArmProfitProtection(
  pnlUsd: number,
  collateralUsd: number,
  feesUsd: number
): boolean {
  const cfg = config.hyperliquid.dynamicTrail;
  const roe = roePct(pnlUsd, collateralUsd);
  const minNet = feesUsd * Math.max(1, cfg.minProfitCloseFeesMult);
  if (pnlUsd < minNet) return false;
  return pnlUsd >= feesUsd * cfg.armFeesMultiplier || roe >= cfg.armMinRoePct;
}

export function netPnlAfterCosts(
  pnlUsd: number,
  notionalUsd: number,
  feesUsd: number
): number {
  const slipBps = config.hyperliquid.dynamicTrail.slippageBufferBps;
  const slip = Math.max(0, notionalUsd) * (slipBps / 10_000);
  return pnlUsd - feesUsd - slip;
}

export function breakevenPlusFeesStopPx(
  direction: 'LONG' | 'SHORT',
  entryPrice: number,
  absSize: number,
  feesUsd: number,
  fundingUsd = 0,
  notionalUsd = 0,
  tickSize = 0,
  _szDecimals = 0
): number {
  void notionalUsd;
  void _szDecimals;
  const cfg = config.hyperliquid.dynamicTrail;
  const bufferUsd = Math.max(
    feesUsd * cfg.breakevenBufferFeesMult,
    entryPrice * absSize * (cfg.breakevenBufferPct / 100)
  );
  const fundingCost = Number.isFinite(fundingUsd) ? Math.max(0, -fundingUsd) : 0;
  const move = (feesUsd + bufferUsd + fundingCost) / absSize;
  let stop = direction === 'LONG' ? entryPrice + move : entryPrice - move;
  const gap = minProfitTrailGapPx(entryPrice, tickSize);
  if (direction === 'LONG') stop = Math.max(stop, entryPrice + gap);
  else stop = Math.min(stop, entryPrice - gap);
  return stop;
}

function updateFavorableExtreme(
  direction: 'LONG' | 'SHORT',
  current: number,
  mark: number
): number {
  if (direction === 'LONG') return Math.max(current, mark);
  return Math.min(current, mark);
}

export function ratchetStop(
  direction: 'LONG' | 'SHORT',
  currentStop: number | null,
  candidate: number
): number {
  if (currentStop == null) return candidate;
  return direction === 'LONG'
    ? Math.max(currentStop, candidate)
    : Math.min(currentStop, candidate);
}

function clampStopToProfitSide(
  direction: 'LONG' | 'SHORT',
  stopPx: number,
  breakevenPx: number
): number {
  if (direction === 'LONG') return Math.max(stopPx, breakevenPx);
  return Math.min(stopPx, breakevenPx);
}

export function isTrailStopCrossed(
  direction: 'LONG' | 'SHORT',
  markPrice: number,
  stopPx: number
): boolean {
  if (!Number.isFinite(stopPx) || stopPx <= 0) return false;
  return direction === 'LONG' ? markPrice <= stopPx : markPrice >= stopPx;
}

function tierTrailPct(tier: CoinTier): number {
  const cfg = config.hyperliquid.dynamicTrail;
  if (tier === 'major') return cfg.majorTrailPct;
  if (tier === 'mid') return cfg.midTrailPct;
  return cfg.cautiousTrailPct;
}

export function calculateATR(candles: Candle[], period = 14): number {
  const closed = candles.slice(0, -1);
  if (closed.length < period + 1) return 0;

  const trs: number[] = [];
  for (let i = closed.length - period; i < closed.length; i += 1) {
    const c = closed[i];
    const prev = closed[i - 1];
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - prev.close),
      Math.abs(c.low - prev.close)
    );
    trs.push(tr);
  }
  if (trs.length === 0) return 0;
  return trs.reduce((s, v) => s + v, 0) / trs.length;
}

const atrCache = new Map<string, { at: number; atr: number; mark: number }>();

export async function resolveTrailDistancePx(
  coin: string,
  markPrice: number
): Promise<number> {
  const cfg = config.hyperliquid.dynamicTrail;
  const tier = classifyCoinTier(coin).tier;
  const pctFallback = tierTrailPct(tier);
  const pctDistance = markPrice * pctFallback;

  if (!cfg.useAtr) return pctDistance;

  const cacheKey = `${coin}:${cfg.atrTimeframe}`;
  const cached = atrCache.get(cacheKey);
  if (cached && Date.now() - cached.at < cfg.atrCacheMs) {
    const fromAtr = cached.atr * cfg.atrMultiplier;
    return Math.max(fromAtr, pctDistance * cfg.atrMinPctOfFallback);
  }

  try {
    const symbol = hlCoinToBinanceSymbol(coin);
    const candles = await signalEngine.fetchCandles(
      symbol,
      cfg.atrTimeframe,
      cfg.atrPeriod + 20
    );
    const atr = calculateATR(candles, cfg.atrPeriod);
    atrCache.set(cacheKey, { at: Date.now(), atr, mark: markPrice });
    if (atr > 0) {
      return Math.max(atr * cfg.atrMultiplier, pctDistance * cfg.atrMinPctOfFallback);
    }
  } catch {
    /* fallback to tier % */
  }
  return pctDistance;
}

function formatAnalytics(rec: DynamicTrailRecord, mark: number): string {
  return [
    `phase=${rec.phase}`,
    `highestPrice=${rec.highestPriceSinceEntry.toFixed(6)}`,
    `highestPnl=$${rec.highestPnlSinceEntry.toFixed(4)}`,
    `trailStop=${rec.currentTrailStop?.toFixed(6) ?? '—'}`,
    `mark=${mark.toFixed(6)}`,
    `armedAt=${rec.trailArmedAt ? new Date(rec.trailArmedAt).toISOString() : '—'}`,
    `timeInProfitMs=${rec.timeInProfitMs}`,
    `maxRunup=$${rec.maxRunup.toFixed(4)}`,
    `trailDistPx=${rec.lastTrailDistancePx.toFixed(6)}`,
  ].join(' · ');
}

export async function evaluateDynamicTrail(
  input: TrailTickInput
): Promise<TrailTickResult> {
  const cfg = config.hyperliquid.dynamicTrail;
  const feesUsd = estimateRoundTripFeesUsd(input.notionalUsd);
  let rec =
    input.record ??
    emptyRecord(
      input.direction,
      input.entryPrice,
      input.markPrice,
      input.nowMs,
      feesUsd
    );

  rec.highestPriceSinceEntry = updateFavorableExtreme(
    input.direction,
    rec.highestPriceSinceEntry,
    input.markPrice
  );

  if (input.pnlUsd > rec.highestPnlSinceEntry) {
    rec.highestPnlSinceEntry = input.pnlUsd;
  }
  if (input.pnlUsd > rec.maxRunup) {
    rec.maxRunup = input.pnlUsd;
  }

  if (input.pnlUsd > 0) {
    if (rec.profitSinceAt == null) rec.profitSinceAt = input.nowMs;
    rec.timeInProfitMs = input.nowMs - rec.profitSinceAt;
  } else if (rec.phase === 'idle') {
    rec.profitSinceAt = null;
    rec.timeInProfitMs = 0;
  }

  rec.estimatedFeesUsd = feesUsd;
  const bePx = breakevenPlusFeesStopPx(
    input.direction,
    input.entryPrice,
    input.absSize,
    feesUsd,
    input.fundingUsd ?? 0,
    input.notionalUsd,
    input.tickSize ?? 0,
    input.szDecimals ?? 0
  );
  const holdMs = rec.timeInProfitMs;
  const armHold = cfg.armMinProfitHoldMs;
  const minActive = cfg.trailMinActiveBeforeCloseMs;
  const roe = roePct(input.pnlUsd, input.collateralUsd);
  const peakRoe = roePct(rec.highestPnlSinceEntry, input.collateralUsd);
  const net = netPnlAfterCosts(input.pnlUsd, input.notionalUsd, feesUsd);
  const minCloseNet = feesUsd * Math.max(1, cfg.minProfitCloseFeesMult);

  // IDLE — wait for green hold + fee-covered profit. Do not skip to trailing.
  if (rec.phase === 'idle') {
    const ready =
      holdMs >= armHold &&
      shouldArmProfitProtection(input.pnlUsd, input.collateralUsd, feesUsd);
    if (!ready) {
      return {
        record: rec,
        shouldClose: false,
        exitReason: '',
        closeDetail: '',
      };
    }
    rec.phase = 'armed';
    rec.trailArmedAt = input.nowMs;
    rec.currentTrailStop = clampStopToProfitSide(input.direction, bePx, bePx);
    logger.info('HL dynamic trail armed', {
      coin: input.coin,
      direction: input.direction,
      entry: input.entryPrice.toFixed(6),
      initialStop: rec.currentTrailStop.toFixed(6),
      pnlUsd: input.pnlUsd.toFixed(4),
      roe: roe.toFixed(2),
    });
    return {
      record: rec,
      shouldClose: false,
      exitReason: '',
      closeDetail: '',
    };
  }

  rec.currentTrailStop = clampStopToProfitSide(
    input.direction,
    rec.currentTrailStop ?? bePx,
    bePx
  );

  const stage2Roe =
    input.direction === 'LONG' ? cfg.longTrailArmRoePct : cfg.breakevenArmRoePct;
  const longPeakOk =
    input.direction !== 'LONG' || peakRoe >= cfg.longMinPeakRoePctBeforeTrailClose;
  const canTrail = rec.phase === 'trailing' || (roe >= stage2Roe && longPeakOk);

  if (canTrail && rec.currentTrailStop != null) {
    rec.phase = 'trailing';
    const trailDist = await resolveTrailDistancePx(input.coin, input.markPrice);
    rec.lastTrailDistancePx = trailDist;
    const trailCandidate =
      input.direction === 'LONG'
        ? rec.highestPriceSinceEntry - trailDist
        : rec.highestPriceSinceEntry + trailDist;
    rec.currentTrailStop = clampStopToProfitSide(
      input.direction,
      ratchetStop(input.direction, rec.currentTrailStop, trailCandidate),
      bePx
    );
  }

  if (
    rec.currentTrailStop != null &&
    isTrailStopCrossed(input.direction, input.markPrice, rec.currentTrailStop)
  ) {
    const armedAt = rec.trailArmedAt ?? input.nowMs;
    const activeMs = input.nowMs - armedAt;
    const longGreenOk =
      input.direction !== 'LONG' || holdMs >= cfg.longMinGreenHoldMs;
    const minActiveOk = activeMs >= minActive;
    const neverRed = cfg.neverRedAfterArm !== false;
    const profitableEnough = net >= minCloseNet && (!neverRed || input.pnlUsd > 0);
    if (minActiveOk && longGreenOk && profitableEnough) {
      const detail = `TRAILING STOP · ${input.direction} ${input.coin} · ${formatAnalytics(rec, input.markPrice)} · net$${net.toFixed(4)}`;
      return {
        record: rec,
        shouldClose: true,
        exitReason: 'trailing_stop',
        closeDetail: detail,
      };
    }
  }

  return {
    record: rec,
    shouldClose: false,
    exitReason: '',
    closeDetail: '',
  };
}

export function trailRecordToLegacyPeak(rec: DynamicTrailRecord): number {
  return rec.highestPnlSinceEntry;
}

export function profitProtectionStage(
  rec: Pick<DynamicTrailRecord, 'phase' | 'lossSlArmed'>
): 0 | 1 | 2 {
  if (rec.lossSlArmed) return 0;
  if (rec.phase === 'trailing') return 2;
  if (rec.phase === 'armed') return 1;
  return 0;
}

export function minProfitTrailGapPx(markPrice: number, tickSize = 0): number {
  const fromTick = Math.max(0, tickSize) * 2;
  return Math.max(fromTick, markPrice * 0.0004);
}

export function lockedPnlAtStopPx(
  direction: 'LONG' | 'SHORT',
  entryPrice: number,
  absSize: number,
  stopPx: number
): number {
  if (!(entryPrice > 0) || !(absSize > 0) || !(stopPx > 0)) return 0;
  return direction === 'LONG'
    ? (stopPx - entryPrice) * absSize
    : (entryPrice - stopPx) * absSize;
}

export function lossStopPricePx(
  direction: 'LONG' | 'SHORT',
  entryPrice: number,
  absSize: number,
  collateralUsd: number,
  slPct: number
): number {
  if (slPct <= 0 || absSize <= 0 || entryPrice <= 0) {
    return direction === 'LONG' ? 0 : Number.POSITIVE_INFINITY;
  }
  const maxLossUsd = collateralUsd * (slPct / 100);
  const priceMove = maxLossUsd / absSize;
  return direction === 'LONG' ? entryPrice - priceMove : entryPrice + priceMove;
}

export function shouldArmBreakevenProtection(input: {
  direction: 'LONG' | 'SHORT';
  pnlUsd: number;
  markPrice: number;
  entryPrice: number;
  absSize: number;
  feesUsd: number;
  timeInProfitMs?: number;
  collateralUsd?: number;
  notionalUsd?: number;
  fundingUsd?: number;
  tickSize?: number;
  szDecimals?: number;
}): boolean {
  return shouldArmProfitProtection(input.pnlUsd, input.collateralUsd ?? 0, input.feesUsd);
}

export function resolveEffectiveTrailProfile(leverage = 1) {
  const trail = config.hyperliquid.dynamicTrail as typeof config.hyperliquid.dynamicTrail & {
    breakevenArmRoePct?: number;
    armMinProfitHoldMs?: number;
    trailMinActiveBeforeCloseMs?: number;
  };
  return {
    breakevenArmRoePct: trail.breakevenArmRoePct ?? trail.armMinRoePct,
    armMinRoePct: trail.armMinRoePct,
    armFeesMultiplier: trail.armFeesMultiplier,
    armMinProfitHoldMs: trail.armMinProfitHoldMs ?? 0,
    trailMinActiveBeforeCloseMs: trail.trailMinActiveBeforeCloseMs ?? 0,
    majorTrailPct: trail.majorTrailPct,
    midTrailPct: trail.midTrailPct,
    cautiousTrailPct: trail.cautiousTrailPct,
    highLev: leverage >= 40,
    leverage,
  };
}
