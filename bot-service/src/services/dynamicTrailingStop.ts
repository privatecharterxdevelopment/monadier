/**
 * Two-stage in-profit SL:
 * Stage 1 (+0.2% ROE): lock +0.1% ROE fixed — stop does not chase peak yet.
 * Stage 2 (peak ≥ +2% ROE): ratchet peak − 0.1% ROE gap until trail cross.
 */
import { config } from '../config';
import { logger } from '../utils/logger';
import { signalEngine, type Candle } from './signalEngine';
import { classifyCoinTier, type CoinTier } from './coinTier';
import { hlCoinToBinanceSymbol } from './hlSymbols';

export type TrailPhase = 'idle' | 'armed' | 'profit_lock' | 'trailing';

export type DynamicTrailRecord = {
  phase: TrailPhase;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
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
  trailCloseDeferUntil: number | null;
  trailCloseDeferCount: number;
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
  totalHoldMs: number;
  stopLossPct: number;
  record: DynamicTrailRecord | null;
  trailDistanceMult?: number;
  trailCloseDeferred?: boolean;
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
    trailCloseDeferUntil: null,
    trailCloseDeferCount: 0,
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

/** Stop price for a given locked ROE% on margin. */
export function stopPxForRoePct(
  direction: 'LONG' | 'SHORT',
  entryPrice: number,
  absSize: number,
  collateralUsd: number,
  lockRoePct: number
): number {
  if (absSize <= 0 || entryPrice <= 0 || collateralUsd <= 0) {
    return direction === 'LONG' ? 0 : Number.POSITIVE_INFINITY;
  }
  const lockPnlUsd = collateralUsd * (lockRoePct / 100);
  const move = lockPnlUsd / absSize;
  return direction === 'LONG' ? entryPrice + move : entryPrice - move;
}

/** Stage 2 lock — max(floor, peak − gap). */
export function profitTrailLockRoePct(peakPnlUsd: number, collateralUsd: number): number {
  const cfg = config.hyperliquid.dynamicTrail;
  const peakRoe = roePct(peakPnlUsd, collateralUsd);
  const floor = cfg.armMinRoePct;
  const gap = cfg.trailGapRoePct;
  return Math.max(floor, peakRoe - gap);
}

/** Stage 1 lock — fixed min ROE once green. */
export function profitLockStage1RoePct(): number {
  return config.hyperliquid.dynamicTrail.armMinRoePct;
}

export function resolveProfitTrailLockRoe(
  phase: TrailPhase,
  peakPnlUsd: number,
  collateralUsd: number
): number {
  if (phase === 'profit_lock' || phase === 'trailing') {
    return profitTrailLockRoePct(peakPnlUsd, collateralUsd);
  }
  return 0;
}

export function shouldUpgradeToFullTrail(peakPnlUsd: number, collateralUsd: number): boolean {
  if (collateralUsd <= 0) return false;
  return roePct(peakPnlUsd, collateralUsd) >= config.hyperliquid.dynamicTrail.fullTrailArmRoePct;
}

export function shouldArmProfitTrail(peakPnlUsd: number, collateralUsd: number): boolean {
  if (peakPnlUsd <= 0 || collateralUsd <= 0) return false;
  const cfg = config.hyperliquid.dynamicTrail;
  if (cfg.armMinProfitUsd > 0 && peakPnlUsd < cfg.armMinProfitUsd) return false;
  return roePct(peakPnlUsd, collateralUsd) >= cfg.breakevenArmRoePct;
}

/** Profit trail closes only while green — never in red. */
export function shouldExecuteProfitTrailClose(pnlUsd: number): boolean {
  if (pnlUsd <= 0) return false;
  const minClose = config.hyperliquid.dynamicTrail.profitTrailMinClosePnlUsd;
  if (minClose > 0 && pnlUsd < minClose) return false;
  return true;
}

/** Close while uPnL is still green once profit retraces to the locked ROE (don't wait for red). */
export function shouldCloseProfitTrailInGreen(
  rec: DynamicTrailRecord,
  input: Pick<TrailTickInput, 'pnlUsd' | 'collateralUsd' | 'direction' | 'markPrice'>
): boolean {
  if (rec.phase !== 'profit_lock' && rec.phase !== 'trailing') return false;
  if (!shouldExecuteProfitTrailClose(input.pnlUsd)) return false;

  const lockRoe = resolveProfitTrailLockRoe(
    rec.phase,
    rec.highestPnlSinceEntry,
    input.collateralUsd
  );
  const currentRoe = roePct(input.pnlUsd, input.collateralUsd);
  if (currentRoe <= lockRoe + 0.04) return true;

  if (rec.currentTrailStop == null) return false;
  return isTrailStopCrossed(input.direction, input.markPrice, rec.currentTrailStop);
}

/** @deprecated */
export function shouldArmBreakevenProtection(
  pnlUsd: number,
  collateralUsd: number,
  _timeInProfitMs: number,
  _totalHoldMs: number,
  _feesUsd = 0
): boolean {
  return shouldArmProfitTrail(pnlUsd, collateralUsd);
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

/** @deprecated */
export function shouldUpgradeToTrailing(pnlUsd: number, collateralUsd: number): boolean {
  return shouldArmProfitTrail(pnlUsd, collateralUsd);
}

/** @deprecated */
export function shouldArmProfitProtection(
  pnlUsd: number,
  collateralUsd: number,
  _feesUsd: number,
  _timeInProfitMs: number
): boolean {
  return shouldArmProfitTrail(pnlUsd, collateralUsd);
}

function updateFavorableExtreme(
  direction: 'LONG' | 'SHORT',
  current: number,
  mark: number
): number {
  if (direction === 'LONG') return Math.max(current, mark);
  return Math.min(current, mark);
}

/** Peak uPnL implied by best favorable price since entry (survives brief HL uPnL dips). */
function peakPnlFromExtreme(
  direction: 'LONG' | 'SHORT',
  entryPrice: number,
  absSize: number,
  extremePx: number
): number {
  if (absSize <= 0 || entryPrice <= 0) return 0;
  return direction === 'LONG'
    ? (extremePx - entryPrice) * absSize
    : (entryPrice - extremePx) * absSize;
}

function ratchetStop(
  direction: 'LONG' | 'SHORT',
  currentStop: number | null,
  candidate: number
): number {
  if (currentStop == null) return candidate;
  return direction === 'LONG'
    ? Math.max(currentStop, candidate)
    : Math.min(currentStop, candidate);
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
    /* fallback */
  }
  return pctDistance;
}

function formatAnalytics(rec: DynamicTrailRecord, mark: number): string {
  return [
    `phase=${rec.phase}`,
    `trailStop=${rec.currentTrailStop?.toFixed(6) ?? '—'}`,
    `mark=${mark.toFixed(6)}`,
    `peakPnl=$${rec.highestPnlSinceEntry.toFixed(4)}`,
  ].join(' · ');
}

function refreshProfitTrailStop(
  rec: DynamicTrailRecord,
  input: TrailTickInput
): void {
  const lockRoe = resolveProfitTrailLockRoe(
    rec.phase,
    rec.highestPnlSinceEntry,
    input.collateralUsd
  );
  const stopPx = stopPxForRoePct(
    input.direction,
    input.entryPrice,
    input.absSize,
    input.collateralUsd,
    lockRoe
  );
  rec.currentTrailStop = ratchetStop(input.direction, rec.currentTrailStop, stopPx);
  rec.lastTrailDistancePx = 0;
}

function tryProfitTrailGreenClose(
  rec: DynamicTrailRecord,
  input: TrailTickInput,
  stageLabel: string
): TrailTickResult | null {
  if (rec.lossSlArmed) return null;
  refreshProfitTrailStop(rec, input);
  if (!shouldCloseProfitTrailInGreen(rec, input)) {
    if (
      rec.currentTrailStop != null &&
      isTrailStopCrossed(input.direction, input.markPrice, rec.currentTrailStop) &&
      input.pnlUsd <= 0
    ) {
      logger.info('HL profit trail hold — stop crossed in red (no loss close)', {
        coin: input.coin,
        direction: input.direction,
        stage: stageLabel,
        pnlUsd: input.pnlUsd.toFixed(4),
        mark: input.markPrice.toFixed(6),
        stop: rec.currentTrailStop.toFixed(6),
      });
    }
    return null;
  }

  const lockRoe = resolveProfitTrailLockRoe(
    rec.phase,
    rec.highestPnlSinceEntry,
    input.collateralUsd
  );
  const detail = `PROFIT TRAIL ${stageLabel} · lock +${lockRoe.toFixed(2)}% ROE · ${input.direction} ${input.coin} · uPnL $${input.pnlUsd.toFixed(2)} (peak $${rec.highestPnlSinceEntry.toFixed(2)}) · ${formatAnalytics(rec, input.markPrice)}`;
  return {
    record: rec,
    shouldClose: true,
    exitReason: 'trailing_stop',
    closeDetail: detail,
  };
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
  const peakFromExtreme = peakPnlFromExtreme(
    input.direction,
    input.entryPrice,
    input.absSize,
    rec.highestPriceSinceEntry
  );
  rec.highestPnlSinceEntry = Math.max(
    rec.highestPnlSinceEntry,
    input.pnlUsd,
    peakFromExtreme
  );
  if (rec.highestPnlSinceEntry > rec.maxRunup) rec.maxRunup = rec.highestPnlSinceEntry;

  if (input.pnlUsd > 0) {
    if (rec.profitSinceAt == null) rec.profitSinceAt = input.nowMs;
    rec.timeInProfitMs = input.nowMs - rec.profitSinceAt;
  } else if (rec.phase === 'idle') {
    rec.profitSinceAt = null;
    rec.timeInProfitMs = 0;
  }

  const noClose = {
    shouldClose: false as const,
    exitReason: '',
    closeDetail: '',
  };

  // —— In-profit ratchet trail ——
  if (rec.phase === 'trailing' && !rec.lossSlArmed) {
    const greenClose = tryProfitTrailGreenClose(rec, input, 'S2');
    if (greenClose) return greenClose;
    return { record: rec, ...noClose };
  }

  if (rec.phase === 'profit_lock' && !rec.lossSlArmed) {
    if (shouldUpgradeToFullTrail(rec.highestPnlSinceEntry, input.collateralUsd)) {
      rec.phase = 'trailing';
      refreshProfitTrailStop(rec, input);
      logger.info('HL profit trail stage 2 armed', {
        coin: input.coin,
        direction: input.direction,
        peakRoe: roePct(rec.highestPnlSinceEntry, input.collateralUsd).toFixed(3),
        stop: rec.currentTrailStop?.toFixed(6),
      });
    }
    const greenClose = tryProfitTrailGreenClose(rec, input, 'S1');
    if (greenClose) return greenClose;
    return { record: rec, ...noClose };
  }

  // —— Arm trail when green — ratchet from first arm ——
  if (
    rec.phase === 'idle' &&
    shouldArmProfitTrail(rec.highestPnlSinceEntry, input.collateralUsd)
  ) {
    rec.phase = 'trailing';
    rec.trailArmedAt = input.nowMs;
    rec.estimatedFeesUsd = feesUsd;
    refreshProfitTrailStop(rec, input);
    logger.info('HL profit trail armed', {
      coin: input.coin,
      direction: input.direction,
      roe: roePct(rec.highestPnlSinceEntry, input.collateralUsd).toFixed(3),
      lockRoe: resolveProfitTrailLockRoe(
        rec.phase,
        rec.highestPnlSinceEntry,
        input.collateralUsd
      ).toFixed(3),
      stop: rec.currentTrailStop?.toFixed(6),
      pnlUsd: input.pnlUsd.toFixed(4),
      peakPnlUsd: rec.highestPnlSinceEntry.toFixed(4),
    });
    const greenClose = tryProfitTrailGreenClose(rec, input, 'ARM');
    if (greenClose) return greenClose;
    return { record: rec, ...noClose };
  }

  // Loss SL trail while red — disabled in profit-only mode (user must set SL% explicitly).

  // Fell back below arm threshold while never armed — stay idle
  if (
    rec.phase === 'idle' &&
    input.pnlUsd > 0 &&
    !shouldArmProfitTrail(rec.highestPnlSinceEntry, input.collateralUsd)
  ) {
    return { record: rec, ...noClose };
  }

  return { record: rec, ...noClose };
}

export function trailRecordToLegacyPeak(rec: DynamicTrailRecord): number {
  return rec.highestPnlSinceEntry;
}
