/**
 * Price-based dynamic trailing stop — 3 phases:
 * 1 idle (no stop), 2 arm at profit threshold (entry + fees + buffer), 3 ATR/% trail ratchet.
 */
import { config } from '../config';
import { logger } from '../utils/logger';
import { signalEngine, type Candle } from './signalEngine';
import { classifyCoinTier, type CoinTier } from './coinTier';
import { hlCoinToBinanceSymbol } from './hlSymbols';

export type TrailPhase = 'idle' | 'pending' | 'armed' | 'trailing';

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
  /** Exchange-confirmed profit stop (restart reconstruct / never loosen). */
  confirmedExchangeStopPx?: number | null;
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

/** Min locked uPnL at the profit stop / trail close — avoids fee-red fills (LIT −$0.04). */
export function minProfitLockUsd(notionalUsd: number, leverage = 1): number {
  const cfg = config.hyperliquid.dynamicTrail;
  const fees = estimateRoundTripFeesUsd(Math.max(0, notionalUsd));
  let floor = Math.max(
    config.hyperliquid.minProfitCloseUsd,
    fees * cfg.minProfitCloseFeesMult
  );
  if (leverage >= 40) floor *= 1.85;
  else if (leverage >= 25) floor *= 1.5;
  else if (leverage >= 15) floor *= 1.2;
  return floor;
}

export function markFromPosition(entryPx: number, szi: number, pnlUsd: number): number {
  if (!Number.isFinite(entryPx) || Math.abs(szi) < 1e-12) return entryPx;
  return entryPx + pnlUsd / szi;
}

function roePct(pnlUsd: number, collateralUsd: number): number {
  if (collateralUsd <= 0) return 0;
  return (pnlUsd / collateralUsd) * 100;
}

/** Activation attempt — any green uPnL. Placement may still be PENDING if no gap. */
export function shouldArmProfitProtection(
  pnlUsd: number,
  _collateralUsd: number,
  feesUsd: number,
  notionalUsd = 0
): boolean {
  const notional = notionalUsd > 0 ? notionalUsd : Math.max(feesUsd * 200, 1);
  const minLock = minProfitLockUsd(notional);
  return netPnlAfterCosts(pnlUsd, notional, feesUsd) >= minLock;
}

/** Profit-side of entry and away from mark — no ROE / fee / BE floor. */
export function profitStopPlaceable(opts: {
  direction: 'LONG' | 'SHORT';
  stopPx: number;
  markPx: number;
  entryPx: number;
  tickSize?: number;
}): boolean {
  const { direction, stopPx, markPx, entryPx } = opts;
  if (!(stopPx > 0) || !(markPx > 0) || !(entryPx > 0)) return false;
  const gap = minProfitTrailGapPx(markPx, opts.tickSize ?? 0);
  if (direction === 'LONG') {
    return stopPx > entryPx && stopPx <= markPx - gap;
  }
  return stopPx < entryPx && stopPx >= markPx + gap;
}

export function firstPlaceableProfitStopPx(opts: {
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  markPrice: number;
  absSize: number;
  feesUsd: number;
  fundingUsd?: number;
  tickSize?: number;
}): number | null {
  const be = breakevenPlusFeesStopPx(
    opts.direction,
    opts.entryPrice,
    opts.absSize,
    opts.feesUsd,
    opts.fundingUsd ?? 0,
    0,
    opts.tickSize ?? 0
  );
  const gap = minProfitTrailGapPx(opts.markPrice, opts.tickSize ?? 0);
  const glue =
    opts.direction === 'LONG'
      ? opts.markPrice - gap
      : opts.markPrice + gap;
  const candidates =
    opts.direction === 'LONG'
      ? [be, glue].filter((px) => px > opts.entryPrice)
      : [be, glue].filter((px) => px < opts.entryPrice);
  for (const stopPx of candidates) {
    if (
      profitStopPlaceable({
        direction: opts.direction,
        stopPx,
        markPx: opts.markPrice,
        entryPx: opts.entryPrice,
        tickSize: opts.tickSize,
      })
    ) {
      return stopPx;
    }
  }
  return null;
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

function clampStopToProfitSideOfEntry(
  direction: 'LONG' | 'SHORT',
  stopPx: number,
  entryPx: number
): number {
  const eps = Math.max(entryPx * 1e-8, 1e-8);
  if (direction === 'LONG') return Math.max(stopPx, entryPx + eps);
  return Math.min(stopPx, entryPx - eps);
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

export function seedTrailFromConfirmedProfitStop(
  rec: DynamicTrailRecord,
  direction: 'LONG' | 'SHORT',
  confirmedPx: number | null | undefined,
  nowMs: number
): DynamicTrailRecord {
  if (confirmedPx == null || !(confirmedPx > 0)) return rec;
  rec.currentTrailStop = clampStopToProfitSideOfEntry(
    direction,
    ratchetStop(direction, rec.currentTrailStop, confirmedPx),
    rec.entryPrice
  );
  if (rec.phase === 'idle' || rec.phase === 'pending') {
    rec.phase = 'armed';
    rec.trailArmedAt = rec.trailArmedAt ?? nowMs;
  }
  return rec;
}

export async function evaluateDynamicTrail(
  input: TrailTickInput
): Promise<TrailTickResult> {
  const feesUsd = estimateRoundTripFeesUsd(input.notionalUsd);
  const minLockUsd = minProfitLockUsd(input.notionalUsd);
  const cfgTrail = config.hyperliquid.dynamicTrail;
  const netPnlUsd = netPnlAfterCosts(input.pnlUsd, input.notionalUsd, feesUsd);
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
  if (input.confirmedExchangeStopPx != null && input.confirmedExchangeStopPx > 0) {
    rec = seedTrailFromConfirmedProfitStop(
      rec,
      input.direction,
      input.confirmedExchangeStopPx,
      input.nowMs
    );
  }
  const tick = input.tickSize ?? 0;
  const placeable = firstPlaceableProfitStopPx({
    direction: input.direction,
    entryPrice: input.entryPrice,
    markPrice: input.markPrice,
    absSize: input.absSize,
    feesUsd,
    fundingUsd: input.fundingUsd ?? 0,
    tickSize: tick,
  });

  if (input.pnlUsd <= 0 || netPnlUsd < minLockUsd) {
    if (rec.phase === 'pending') rec.phase = rec.currentTrailStop != null ? 'armed' : 'idle';
    return {
      record: rec,
      shouldClose: false,
      exitReason: '',
      closeDetail: '',
    };
  }

  if (
    rec.profitSinceAt != null &&
    input.nowMs - rec.profitSinceAt < (cfgTrail.armMinProfitHoldMs ?? 0)
  ) {
    return {
      record: rec,
      shouldClose: false,
      exitReason: '',
      closeDetail: 'PROFIT_HOLD_ARM',
    };
  }

  // Green: try to place immediately. No time/ROE/fee activation gates.
  if (placeable == null && rec.currentTrailStop == null) {
    rec.phase = 'pending';
    return {
      record: rec,
      shouldClose: false,
      exitReason: '',
      closeDetail: 'PROFIT_SL_PENDING',
    };
  }

  const justArmed = rec.currentTrailStop == null;
  if (placeable != null) {
    rec.currentTrailStop = clampStopToProfitSideOfEntry(
      input.direction,
      ratchetStop(input.direction, rec.currentTrailStop, placeable),
      input.entryPrice
    );
  }
  if (justArmed || rec.phase === 'idle' || rec.phase === 'pending') {
    rec.phase = 'armed';
    rec.trailArmedAt = rec.trailArmedAt ?? input.nowMs;
    logger.info('HL profit SL armed', {
      coin: input.coin,
      direction: input.direction,
      entry: input.entryPrice.toFixed(6),
      stop: rec.currentTrailStop!.toFixed(6),
      pnlUsd: input.pnlUsd.toFixed(4),
    });
  }

  const trailDist = await resolveTrailDistancePx(input.coin, input.markPrice);
  rec.lastTrailDistancePx = trailDist;
  const trailCandidate =
    input.direction === 'LONG'
      ? rec.highestPriceSinceEntry - trailDist
      : rec.highestPriceSinceEntry + trailDist;
  rec.currentTrailStop = clampStopToProfitSideOfEntry(
    input.direction,
    ratchetStop(input.direction, rec.currentTrailStop, trailCandidate),
    input.entryPrice
  );
  rec.phase = 'trailing';

  const lockAtStop =
    rec.currentTrailStop != null
      ? lockedPnlAtStopPx(
          input.direction,
          input.entryPrice,
          input.absSize,
          rec.currentTrailStop
        )
      : 0;
  const minActiveMs = Math.max(0, cfgTrail.trailMinActiveBeforeCloseMs ?? 0);
  const peakOk =
    rec.maxRunup <= 0 ||
    input.pnlUsd >= rec.maxRunup * (cfgTrail.minPeakRemainFracBeforeClose ?? 0);

  if (
    rec.currentTrailStop != null &&
    isTrailStopCrossed(input.direction, input.markPrice, rec.currentTrailStop) &&
    input.pnlUsd > 0 &&
    netPnlUsd >= minLockUsd &&
    lockAtStop >= minLockUsd &&
    rec.timeInProfitMs >= minActiveMs &&
    peakOk &&
    (!cfgTrail.neverRedAfterArm || netPnlUsd > 0)
  ) {
    const detail = `TRAILING STOP · ${input.direction} ${input.coin} · ${formatAnalytics(rec, input.markPrice)}`;
    return {
      record: rec,
      shouldClose: true,
      exitReason: 'trailing_stop',
      closeDetail: detail,
    };
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
  return shouldArmProfitProtection(
    input.pnlUsd,
    input.collateralUsd ?? 0,
    input.feesUsd,
    input.notionalUsd ?? 0
  );
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
