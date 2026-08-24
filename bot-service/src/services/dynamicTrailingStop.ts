/**
 * Price-based dynamic trailing stop:
 * 1 idle → 2 armed after 2m continuous green (in-profit peak floor, never through entry)
 * 3 trailing (ATR/% ratchet from 15% ROE SHORT / 22% LONG).
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
  /** Armed via max-hold loss SL% (allows red exit after 2 min). */
  lossSlArmed?: boolean;
  /** Defer dynamic trail close while candles/thesis still favor direction. */
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
  /** Widen (>1) or tighten (<1) ATR/% trail from live run analysis. */
  trailDistanceMult?: number;
  /** Skip close while defer window active (set by monitor after candle analysis). */
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

/** Profit exits must stay net green after fees — never harvest a cents stub. */
export function profitCloseNeedUsd(feesUsd: number, collateralUsd = 0): number {
  const trail = config.hyperliquid.dynamicTrail;
  const raw = trail.minProfitCloseFeesMult;
  const mult = Number.isFinite(raw) && raw >= 1 ? raw : 1.5;
  const minUsd = Math.max(0.75, config.hyperliquid.minProfitCloseUsd || 0.75);
  const vsMargin =
    collateralUsd > 1 ? Math.min(6, collateralUsd * 0.03) : 0;
  return Math.max(minUsd, Math.max(0, feesUsd) * mult, vsMargin);
}

export function profitClearsFeeGate(
  pnlUsd: number,
  feesUsd: number,
  peakPnlUsd = 0,
  collateralUsd = 0
): boolean {
  if (!(pnlUsd > 0)) return false;
  const need = profitCloseNeedUsd(feesUsd, collateralUsd);
  if (pnlUsd < need) return false;
  return true;
}

function blockIfFeesNotCleared(
  result: TrailTickResult,
  pnlUsd: number,
  feesUsd: number,
  coin: string,
  peakPnlUsd: number,
  collateralUsd = 0
): TrailTickResult {
  if (!result.shouldClose) return result;
  if (result.exitReason === 'stop_loss') return result;
  if (profitClearsFeeGate(pnlUsd, feesUsd, peakPnlUsd, collateralUsd)) return result;
  logger.info('HL profit close blocked — leftover too small vs fees/peak', {
    coin,
    reason: result.exitReason,
    pnlUsd: pnlUsd.toFixed(4),
    feesUsd: feesUsd.toFixed(4),
    needUsd: profitCloseNeedUsd(feesUsd, collateralUsd).toFixed(4),
    peakPnlUsd: peakPnlUsd.toFixed(4),
  });
  return {
    record: result.record,
    shouldClose: false,
    exitReason: '',
    closeDetail: '',
  };
}


export function markFromPosition(entryPx: number, szi: number, pnlUsd: number): number {
  if (!Number.isFinite(entryPx) || Math.abs(szi) < 1e-12) return entryPx;
  return entryPx + pnlUsd / szi;
}

function roePct(pnlUsd: number, collateralUsd: number): number {
  if (collateralUsd <= 0) return 0;
  return (pnlUsd / collateralUsd) * 100;
}

export function shouldArmBreakevenProtection(
  pnlUsd: number,
  _collateralUsd: number,
  timeInProfitMs: number,
  _totalHoldMs: number
): boolean {
  if (pnlUsd <= 0) return false;
  const cfgMs = config.hyperliquid.dynamicTrail.armMinProfitHoldMs;
  const armMs = Math.min(30_000, Math.max(5_000, Number.isFinite(cfgMs) ? cfgMs : 30_000));
  return timeInProfitMs >= armMs;
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

export function shouldUpgradeToTrailing(
  pnlUsd: number,
  collateralUsd: number,
  direction: 'LONG' | 'SHORT' = 'SHORT'
): boolean {
  if (pnlUsd <= 0 || collateralUsd <= 0) return false;
  const cfg = config.hyperliquid.dynamicTrail;
  const longArm =
    cfg.longTrailArmRoePct > 0 ? cfg.longTrailArmRoePct : cfg.armMinRoePct;
  const need = direction === 'LONG' ? Math.max(cfg.armMinRoePct, longArm) : cfg.armMinRoePct;
  return roePct(pnlUsd, collateralUsd) >= need;
}

/** LONGs: trail / peak-floor / peak-grab only after a real run (peak ROE). */
function longPeakTooSmallToTrailClose(
  direction: 'LONG' | 'SHORT',
  peakPnlUsd: number,
  collateralUsd: number
): boolean {
  if (direction !== 'LONG') return false;
  const minRoe = config.hyperliquid.dynamicTrail.longMinPeakRoePctBeforeTrailClose || 0;
  if (minRoe <= 0) return false;
  return roePct(peakPnlUsd, collateralUsd) < minRoe;
}

/** @deprecated use shouldArmBreakevenProtection / shouldUpgradeToTrailing */
export function shouldArmProfitProtection(
  pnlUsd: number,
  collateralUsd: number,
  _feesUsd: number,
  timeInProfitMs: number
): boolean {
  return (
    shouldUpgradeToTrailing(pnlUsd, collateralUsd) &&
    timeInProfitMs >= config.hyperliquid.dynamicTrail.armMinProfitHoldMs
  );
}

function hasBreakevenLock(
  direction: 'LONG' | 'SHORT',
  markPrice: number,
  entryPrice: number,
  absSize: number,
  feesUsd: number
): boolean {
  const lockPx = breakevenPlusFeesStopPx(direction, entryPrice, absSize, feesUsd);
  return direction === 'LONG' ? markPrice >= lockPx : markPrice <= lockPx;
}

function breakevenPlusFeesStopPx(
  direction: 'LONG' | 'SHORT',
  entryPrice: number,
  absSize: number,
  feesUsd: number
): number {
  const cfg = config.hyperliquid.dynamicTrail;
  const bufferUsd = Math.max(
    feesUsd * cfg.breakevenBufferFeesMult,
    entryPrice * absSize * (cfg.breakevenBufferPct / 100)
  );
  const move = (feesUsd + bufferUsd) / absSize;
  return direction === 'LONG' ? entryPrice + move : entryPrice - move;
}

/**
 * Same giveback for BTC and alts — rungs are peak-ROE, not USD vs $0.75.
 * A $26 BTC peak at 28% leftover is a $13 close; a $1 alt at L1 was a $0.45 snipe.
 * Lock = % of peak only. If that leftover is still below min-close, no floor yet.
 */
function stagedProfitLock(
  peakPnlUsd: number,
  feesUsd: number,
  direction: 'LONG' | 'SHORT',
  phase: TrailPhase,
  collateralUsd = 0
): { level: 'fee' | 'partial' | 'core' | 'runner'; keepFrac: number; lockUsd: number } | null {
  const need = profitCloseNeedUsd(feesUsd, collateralUsd);
  if (!(peakPnlUsd > 0) || !(need > 0)) return null;
  const peakRoe = roePct(peakPnlUsd, collateralUsd);
  let level: 'fee' | 'partial' | 'core' | 'runner';
  let keepFrac: number;
  if (peakRoe < 10) {
    level = 'partial';
    keepFrac = 0.72;
  } else if (peakRoe < 22) {
    level = 'core';
    keepFrac = 0.65;
  } else {
    level = 'runner';
    keepFrac = phase === 'trailing' && direction === 'LONG' ? 0.58 : 0.62;
  }
  const lockUsd = peakPnlUsd * keepFrac;
  // No stop until a hit would actually be a real take (same bar for every coin).
  if (lockUsd < need) return null;
  return { level, keepFrac, lockUsd };
}

/**
 * In-profit stop from staged lock. Always ≥ fee cover so a pullback cannot
 * close net-red. Tiny peaks sit on L1; runners sit further from the print.
 */
export function peakProfitFloorStopPx(
  direction: 'LONG' | 'SHORT',
  entryPrice: number,
  absSize: number,
  peakPnlUsd: number,
  feesUsd: number,
  phase: TrailPhase,
  collateralUsd = 0
): { px: number; level: string; lockUsd: number; keepFrac: number } | null {
  if (entryPrice <= 0 || absSize <= 0) return null;
  const staged = stagedProfitLock(peakPnlUsd, feesUsd, direction, phase, collateralUsd);
  if (staged == null) return null;
  const lockUsd = staged.lockUsd;
  if (!(lockUsd > 0)) return null;
  const move = lockUsd / absSize;
  const px = direction === 'LONG' ? entryPrice + move : entryPrice - move;
  return {
    px,
    level: staged?.level ?? 'fee',
    lockUsd,
    keepFrac: staged?.keepFrac ?? 1,
  };
}

function updateFavorableExtreme(
  direction: 'LONG' | 'SHORT',
  current: number,
  mark: number
): number {
  if (direction === 'LONG') return Math.max(current, mark);
  return Math.min(current, mark);
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

function trailTooYoungToClose(
  rec: DynamicTrailRecord,
  nowMs: number,
  _trailMult: number,
  peakPnlUsd = 0,
  feesUsd = 0,
  collateralUsd = 0
): boolean {
  const cfg = config.hyperliquid.dynamicTrail;
  let minMs = cfg.trailMinActiveBeforeCloseMs;
  minMs = Math.round(minMs * Math.max(1, cfg.longTrailMinActiveMult || 1));
  if (!rec.trailArmedAt || minMs <= 0) return false;
  const need = profitCloseNeedUsd(feesUsd, collateralUsd);
  // Real take already in hand — don't wait 3m while the winner dumps to red.
  if (peakPnlUsd >= need * 2) return false;
  return nowMs - rec.trailArmedAt < minMs;
}

/** Once green, breathe before any profit exit — LONG and SHORT. */
function longGreenTooYoungToClose(
  rec: DynamicTrailRecord,
  pnlUsd: number,
  peakPnlUsd = 0,
  feesUsd = 0,
  collateralUsd = 0
): boolean {
  if (pnlUsd <= 0) return false;
  const need = profitCloseNeedUsd(feesUsd, collateralUsd);
  if (peakPnlUsd >= need * 2) return false;
  const minMs = Math.min(
    240_000,
    Math.max(0, config.hyperliquid.dynamicTrail.longMinGreenHoldMs || 0)
  );
  return minMs > 0 && rec.timeInProfitMs < minMs;
}

function directionTrailDistanceMult(direction: 'LONG' | 'SHORT', biasMult: number): number {
  const cfg = config.hyperliquid.dynamicTrail;
  const longRoom =
    direction === 'LONG' ? Math.max(1, cfg.longTrailDistanceMult || 1) : 1;
  // Cap leaves room for LONG dist mult ~2.15 × mild bias widen.
  return Math.max(0.75, Math.min(2.8, biasMult * longRoom));
}

export async function evaluateDynamicTrail(
  input: TrailTickInput
): Promise<TrailTickResult> {
  const result = await evaluateDynamicTrailInner(input);
  const feesUsd = estimateRoundTripFeesUsd(input.notionalUsd);
  const peakPnlUsd = Math.max(
    result.record.highestPnlSinceEntry,
    input.pnlUsd,
    0
  );
  return blockIfFeesNotCleared(
    result,
    input.pnlUsd,
    feesUsd,
    input.coin,
    peakPnlUsd,
    input.collateralUsd
  );
}

async function evaluateDynamicTrailInner(
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

  // Phase 1 — idle: after 2m continuous green, arm an in-profit peak floor.
  // Loss SL% still arms after max-hold while red (if the user set an SL).
  if (rec.phase === 'idle') {
    const maxSlDue = input.totalHoldMs >= cfg.maxHoldBeforeSlTrailMs;

    if (
      shouldArmBreakevenProtection(
        input.pnlUsd,
        input.collateralUsd,
        rec.timeInProfitMs,
        input.totalHoldMs
      )
    ) {
      const initialStop = peakProfitFloorStopPx(
        input.direction,
        input.entryPrice,
        input.absSize,
        rec.highestPnlSinceEntry,
        feesUsd,
        'armed',
        input.collateralUsd
      );
      if (initialStop == null) {
        return {
          record: rec,
          shouldClose: false,
          exitReason: '',
          closeDetail: '',
        };
      }
      rec.phase = 'armed';
      rec.trailArmedAt = input.nowMs;
      rec.currentTrailStop = initialStop.px;
      rec.estimatedFeesUsd = feesUsd;
      logger.info('HL in-profit floor armed (stage 1)', {
        coin: input.coin,
        direction: input.direction,
        entry: input.entryPrice.toFixed(6),
        mark: input.markPrice.toFixed(6),
        floorStop: initialStop.px.toFixed(6),
        lockLevel: initialStop.level,
        lockUsd: initialStop.lockUsd.toFixed(4),
        keepFrac: initialStop.keepFrac,
        pnlUsd: input.pnlUsd.toFixed(4),
        peakPnlUsd: rec.highestPnlSinceEntry.toFixed(4),
        feesUsd: feesUsd.toFixed(4),
        roe: roePct(input.pnlUsd, input.collateralUsd).toFixed(2),
        timeInProfitMs: rec.timeInProfitMs,
        holdMs: input.totalHoldMs,
      });
      // Never close on the arm tick — let the stop ratchet with the peak first.
      return {
        record: rec,
        shouldClose: false,
        exitReason: '',
        closeDetail: '',
      };
    }

    if (maxSlDue && input.pnlUsd <= 0 && input.stopLossPct > 0) {
      const lossStop = lossStopPricePx(
        input.direction,
        input.entryPrice,
        input.absSize,
        input.collateralUsd,
        input.stopLossPct
      );
      rec.phase = 'armed';
      rec.lossSlArmed = true;
      rec.trailArmedAt = input.nowMs;
      rec.currentTrailStop = lossStop;
      rec.estimatedFeesUsd = feesUsd;
      logger.info('HL loss SL trail armed (max hold)', {
        coin: input.coin,
        direction: input.direction,
        entry: input.entryPrice.toFixed(6),
        mark: input.markPrice.toFixed(6),
        lossStop: lossStop.toFixed(6),
        slPct: input.stopLossPct,
        pnlUsd: input.pnlUsd.toFixed(4),
        holdMs: input.totalHoldMs,
      });
      return {
        record: rec,
        shouldClose: false,
        exitReason: '',
        closeDetail: '',
      };
    }

    return {
      record: rec,
      shouldClose: false,
      exitReason: '',
      closeDetail: '',
    };
  }

  // Loss SL trail — ratchet stop on bounces, close when SL crossed (after min active ms).
  if (rec.phase === 'armed' && rec.lossSlArmed && rec.currentTrailStop != null) {
    const trailMult = directionTrailDistanceMult(
      input.direction,
      input.trailDistanceMult ?? 1
    );
    const trailDist =
      (await resolveTrailDistancePx(input.coin, input.markPrice)) * trailMult;
    rec.lastTrailDistancePx = trailDist;
    const favorableCandidate =
      input.direction === 'LONG'
        ? rec.highestPriceSinceEntry - trailDist
        : rec.highestPriceSinceEntry + trailDist;
    rec.currentTrailStop = ratchetStop(
      input.direction,
      rec.currentTrailStop,
      favorableCandidate
    );

    if (
      isTrailStopCrossed(input.direction, input.markPrice, rec.currentTrailStop) &&
      !trailTooYoungToClose(rec, input.nowMs, trailMult)
    ) {
      const detail = `LOSS SL TRAIL · ${input.direction} ${input.coin} · ${formatAnalytics(rec, input.markPrice)}`;
      return {
        record: rec,
        shouldClose: true,
        exitReason: 'stop_loss',
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

  // Staged in-profit floors — L1 covers fees; L4 still leaves runner air.
  if (rec.phase === 'armed' || rec.phase === 'trailing') {
    const floorStop = peakProfitFloorStopPx(
      input.direction,
      input.entryPrice,
      input.absSize,
      rec.highestPnlSinceEntry,
      feesUsd,
      rec.phase,
      input.collateralUsd
    );
    if (floorStop != null) {
      const candidate = floorStop.px;
      const wouldCross = isTrailStopCrossed(
        input.direction,
        input.markPrice,
        candidate
      );
      const closeSafe = profitClearsFeeGate(
        input.pnlUsd,
        feesUsd,
        rec.highestPnlSinceEntry,
        input.collateralUsd
      );
      // Don't snap the floor through mark on a leftover that wouldn't clear fees.
      if (!wouldCross || closeSafe) {
        rec.currentTrailStop = candidate;
      }
      const activeFloor = rec.currentTrailStop ?? candidate;
      if (
        closeSafe &&
        isTrailStopCrossed(input.direction, input.markPrice, activeFloor) &&
        !longGreenTooYoungToClose(
          rec,
          input.pnlUsd,
          rec.highestPnlSinceEntry,
          feesUsd,
          input.collateralUsd
        ) &&
        !trailTooYoungToClose(
          rec,
          input.nowMs,
          1,
          rec.highestPnlSinceEntry,
          feesUsd,
          input.collateralUsd
        ) &&
        !(
          rec.phase === 'trailing' &&
          longPeakTooSmallToTrailClose(
            input.direction,
            rec.highestPnlSinceEntry,
            input.collateralUsd
          )
        )
      ) {
        const detail = `PEAK PROFIT FLOOR ${floorStop.level.toUpperCase()} · ${input.direction} ${input.coin} · lock $${floorStop.lockUsd.toFixed(4)} (${(floorStop.keepFrac * 100).toFixed(0)}% of peak, ≥ fees) · peak $${rec.highestPnlSinceEntry.toFixed(4)} → $${input.pnlUsd.toFixed(4)} · ${formatAnalytics(rec, input.markPrice)}`;
        return {
          record: rec,
          shouldClose: true,
          exitReason: 'profit_lock',
          closeDetail: detail,
        };
      }
    } else if (rec.phase === 'armed' && !rec.lossSlArmed) {
      // Peak too small for a real take — drop a stale cents floor, don't snipe.
      rec.currentTrailStop = null;
    }
  }

  // Phase 2 — armed: keep the in-profit floor. Only merge BE+fees once price
  // is actually past that lock (otherwise BE sits on the wrong side of mark).
  if (rec.phase === 'armed' && rec.currentTrailStop != null) {
    const beStop = breakevenPlusFeesStopPx(
      input.direction,
      input.entryPrice,
      input.absSize,
      feesUsd
    );
    if (
      hasBreakevenLock(
        input.direction,
        input.markPrice,
        input.entryPrice,
        input.absSize,
        feesUsd
      )
    ) {
      rec.currentTrailStop = ratchetStop(input.direction, rec.currentTrailStop, beStop);
    }

    if (shouldUpgradeToTrailing(input.pnlUsd, input.collateralUsd, input.direction)) {
      rec.phase = 'trailing';
      logger.info('HL trailing stop armed (stage 2)', {
        coin: input.coin,
        direction: input.direction,
        roe: roePct(input.pnlUsd, input.collateralUsd).toFixed(2),
        pnlUsd: input.pnlUsd.toFixed(4),
        peakPnlUsd: rec.highestPnlSinceEntry.toFixed(4),
      });
    } else {
      return {
        record: rec,
        shouldClose: false,
        exitReason: '',
        closeDetail: '',
      };
    }
  }

  // Phase 3 — ratchet trail (only moves in profit direction).
  if (rec.phase === 'trailing' && rec.currentTrailStop != null) {
    const trailMult = directionTrailDistanceMult(
      input.direction,
      input.trailDistanceMult ?? 1
    );
    const trailDist =
      (await resolveTrailDistancePx(input.coin, input.markPrice)) * trailMult;
    rec.lastTrailDistancePx = trailDist;
    const trailCandidate =
      input.direction === 'LONG'
        ? rec.highestPriceSinceEntry - trailDist
        : rec.highestPriceSinceEntry + trailDist;
    rec.currentTrailStop = ratchetStop(
      input.direction,
      rec.currentTrailStop,
      trailCandidate
    );

    if (input.trailCloseDeferred) {
      return {
        record: rec,
        shouldClose: false,
        exitReason: '',
        closeDetail: '',
      };
    }

    const peakFracBase = config.hyperliquid.profitPeakDropFraction;
    // LONGs get extra giveback room so stage-2 trail can run with explosions.
    // Still capped — stages are not skipped; grab only after a real peak retrace.
    const peakFrac =
      input.direction === 'LONG'
        ? Math.min(0.82, peakFracBase * 1.2)
        : peakFracBase;
    const peakMinFees = config.hyperliquid.profitPeakMinFeesMult;
    const runWiden =
      trailMult >= 1.12 ? (trailMult >= 1.5 ? 1.45 : 1.2) : 1;
    if (
      rec.highestPnlSinceEntry >= feesUsd * peakMinFees &&
      rec.highestPnlSinceEntry >= Math.max(input.collateralUsd * 0.02, feesUsd * 15) &&
      input.pnlUsd > 0 &&
      peakFrac > 0 &&
      rec.timeInProfitMs >= cfg.armMinProfitHoldMs &&
      !trailTooYoungToClose(
        rec,
        input.nowMs,
        trailMult,
        rec.highestPnlSinceEntry,
        feesUsd,
        input.collateralUsd
      ) &&
      !longGreenTooYoungToClose(
        rec,
        input.pnlUsd,
        rec.highestPnlSinceEntry,
        feesUsd,
        input.collateralUsd
      ) &&
      !longPeakTooSmallToTrailClose(
        input.direction,
        rec.highestPnlSinceEntry,
        input.collateralUsd
      )
    ) {
      const drop = rec.highestPnlSinceEntry - input.pnlUsd;
      const minDrop = Math.max(feesUsd, rec.highestPnlSinceEntry * peakFrac * runWiden);
      if (drop >= minDrop) {
        const detail = `PEAK PROFIT GRAB · ${input.direction} ${input.coin} · peak $${rec.highestPnlSinceEntry.toFixed(4)} → $${input.pnlUsd.toFixed(4)}`;
        return {
          record: rec,
          shouldClose: true,
          exitReason: 'profit_grab_peak',
          closeDetail: detail,
        };
      }
    }

    if (
      isTrailStopCrossed(input.direction, input.markPrice, rec.currentTrailStop) &&
      !trailTooYoungToClose(
        rec,
        input.nowMs,
        trailMult,
        rec.highestPnlSinceEntry,
        feesUsd,
        input.collateralUsd
      ) &&
      input.pnlUsd > 0 &&
      !longGreenTooYoungToClose(
        rec,
        input.pnlUsd,
        rec.highestPnlSinceEntry,
        feesUsd,
        input.collateralUsd
      ) &&
      !longPeakTooSmallToTrailClose(
        input.direction,
        rec.highestPnlSinceEntry,
        input.collateralUsd
      )
    ) {
      const detail = `TRAILING STOP · ${input.direction} ${input.coin} · ${formatAnalytics(rec, input.markPrice)}`;
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

/** Compatibility for bot-status trail readout (Jun-26 engine has a single trail profile). */
export function resolveEffectiveTrailProfile(leverage = 1) {
  const trail = config.hyperliquid.dynamicTrail;
  return {
    breakevenArmRoePct: trail.breakevenArmRoePct,
    armMinRoePct: trail.armMinRoePct,
    armFeesMultiplier: trail.armFeesMultiplier,
    armMinProfitHoldMs: trail.armMinProfitHoldMs,
    trailMinActiveBeforeCloseMs: trail.trailMinActiveBeforeCloseMs,
    majorTrailPct: trail.majorTrailPct,
    midTrailPct: trail.midTrailPct,
    cautiousTrailPct: trail.cautiousTrailPct,
    highLev: leverage >= 40,
    leverage,
  };
}
