/**
 * Price-based dynamic trailing stop — 4 phases:
 * 1 idle, 2 armed (breakeven+fees only ~2% ROE), 3 trailing (ATR/% ratchet ~4.5% ROE).
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
  collateralUsd: number,
  timeInProfitMs: number
): boolean {
  const cfg = config.hyperliquid.dynamicTrail;
  if (timeInProfitMs < cfg.armMinProfitHoldMs) return false;
  if (pnlUsd <= 0 || collateralUsd <= 0) return false;
  return roePct(pnlUsd, collateralUsd) >= cfg.breakevenArmRoePct;
}

export function shouldUpgradeToTrailing(
  pnlUsd: number,
  collateralUsd: number
): boolean {
  if (pnlUsd <= 0 || collateralUsd <= 0) return false;
  return roePct(pnlUsd, collateralUsd) >= config.hyperliquid.dynamicTrail.armMinRoePct;
}

/** @deprecated use shouldArmBreakevenProtection / shouldUpgradeToTrailing */
export function shouldArmProfitProtection(
  pnlUsd: number,
  collateralUsd: number,
  _feesUsd: number,
  timeInProfitMs: number
): boolean {
  return shouldUpgradeToTrailing(pnlUsd, collateralUsd) && timeInProfitMs >= config.hyperliquid.dynamicTrail.armMinProfitHoldMs;
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

function trailTooYoungToClose(rec: DynamicTrailRecord, nowMs: number, trailMult: number): boolean {
  const minMs = config.hyperliquid.dynamicTrail.trailMinActiveBeforeCloseMs;
  if (!rec.trailArmedAt || minMs <= 0) return false;
  if (nowMs - rec.trailArmedAt < minMs) {
    return trailMult >= 0.95;
  }
  return false;
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

  // Phase 1 — idle: no stop until ~2% ROE + min hold.
  if (rec.phase === 'idle') {
    if (!shouldArmBreakevenProtection(input.pnlUsd, input.collateralUsd, rec.timeInProfitMs)) {
      return {
        record: rec,
        shouldClose: false,
        exitReason: '',
        closeDetail: '',
      };
    }

    if (
      !hasBreakevenLock(
        input.direction,
        input.markPrice,
        input.entryPrice,
        input.absSize,
        feesUsd
      )
    ) {
      return {
        record: rec,
        shouldClose: false,
        exitReason: '',
        closeDetail: '',
      };
    }

    const initialStop = breakevenPlusFeesStopPx(
      input.direction,
      input.entryPrice,
      input.absSize,
      feesUsd
    );
    rec.phase = 'armed';
    rec.trailArmedAt = input.nowMs;
    rec.currentTrailStop = initialStop;
    rec.estimatedFeesUsd = feesUsd;
    logger.info('HL breakeven lock armed (stage 1)', {
      coin: input.coin,
      direction: input.direction,
      entry: input.entryPrice.toFixed(6),
      mark: input.markPrice.toFixed(6),
      breakevenStop: initialStop.toFixed(6),
      pnlUsd: input.pnlUsd.toFixed(4),
      roe: roePct(input.pnlUsd, input.collateralUsd).toFixed(2),
      trailAtRoe: cfg.armMinRoePct,
    });
    return {
      record: rec,
      shouldClose: false,
      exitReason: '',
      closeDetail: '',
    };
  }

  // Phase 2 — breakeven only: fixed stop, no tight trail until ~4.5% ROE.
  if (rec.phase === 'armed' && rec.currentTrailStop != null) {
    const beStop = breakevenPlusFeesStopPx(
      input.direction,
      input.entryPrice,
      input.absSize,
      feesUsd
    );
    rec.currentTrailStop = ratchetStop(input.direction, rec.currentTrailStop, beStop);

    if (shouldUpgradeToTrailing(input.pnlUsd, input.collateralUsd)) {
      rec.phase = 'trailing';
      logger.info('HL trailing stop armed (stage 2)', {
        coin: input.coin,
        direction: input.direction,
        roe: roePct(input.pnlUsd, input.collateralUsd).toFixed(2),
        pnlUsd: input.pnlUsd.toFixed(4),
        peakPnlUsd: rec.highestPnlSinceEntry.toFixed(4),
      });
    } else if (
      input.pnlUsd > 0 &&
      isTrailStopCrossed(input.direction, input.markPrice, rec.currentTrailStop)
    ) {
      const peakRoe = roePct(rec.highestPnlSinceEntry, input.collateralUsd);
      const minPeakUsd = Math.max(
        feesUsd * 12,
        input.collateralUsd * (cfg.breakevenArmRoePct / 100) * 1.1
      );
      // Don't scratch tiny winners on breakeven noise — let trends develop to full trail.
      if (rec.highestPnlSinceEntry < minPeakUsd && peakRoe < cfg.armMinRoePct) {
        logger.info('HL breakeven lock skipped — winner too small to lock', {
          coin: input.coin,
          direction: input.direction,
          pnlUsd: input.pnlUsd.toFixed(4),
          peakUsd: rec.highestPnlSinceEntry.toFixed(4),
          minPeakUsd: minPeakUsd.toFixed(4),
          peakRoe: peakRoe.toFixed(2),
        });
        rec.phase = 'idle';
        rec.trailArmedAt = null;
        rec.currentTrailStop = null;
        return {
          record: rec,
          shouldClose: false,
          exitReason: '',
          closeDetail: '',
        };
      }
      const detail = `BREAKEVEN LOCK · ${input.direction} ${input.coin} · ${formatAnalytics(rec, input.markPrice)}`;
      return {
        record: rec,
        shouldClose: true,
        exitReason: 'profit_lock',
        closeDetail: detail,
      };
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
    const trailCap = input.direction === 'LONG' ? 2.25 : 2;
    const trailMult = Math.max(0.75, Math.min(trailCap, input.trailDistanceMult ?? 1));
    let trailDist =
      (await resolveTrailDistancePx(input.coin, input.markPrice)) * trailMult;

    // ATR/% on BTC can be $800–$1500 while a 5–10% ROE winner only moved $50–$150.
    // Cap trail gap to a fraction of the favorable excursion so the stop actually
    // locks peak profit instead of sitting at breakeven forever.
    const excursionPx =
      input.direction === 'LONG'
        ? Math.max(0, rec.highestPriceSinceEntry - input.entryPrice)
        : Math.max(0, input.entryPrice - rec.highestPriceSinceEntry);
    if (excursionPx > 0) {
      const peakFrac =
        input.direction === 'LONG'
          ? config.hyperliquid.profitTrailMinPeakFractionLong
          : config.hyperliquid.profitTrailMinPeakFraction;
      const maxGapPx = Math.max(
        excursionPx * peakFrac,
        input.markPrice * 0.00015 // ~0.015% noise floor
      );
      if (trailDist > maxGapPx) {
        logger.debug('HL trail distance capped to peak excursion', {
          coin: input.coin,
          atrDist: trailDist.toFixed(4),
          capped: maxGapPx.toFixed(4),
          excursionPx: excursionPx.toFixed(4),
        });
        trailDist = maxGapPx;
      }
    }

    rec.lastTrailDistancePx = trailDist;
    const trailCandidate =
      input.direction === 'LONG'
        ? rec.highestPriceSinceEntry - trailDist
        : rec.highestPriceSinceEntry + trailDist;

    // Also ratchet a peak-PnL lock: keep (1 - peakDropFrac) of peak uPnL.
    const peakFrac =
      input.direction === 'LONG'
        ? config.hyperliquid.profitPeakDropFractionLong
        : config.hyperliquid.profitPeakDropFraction;
    const lockPnlUsd = Math.max(
      0,
      rec.highestPnlSinceEntry * (1 - Math.max(0.2, Math.min(0.65, peakFrac)))
    );
    const peakLockStop =
      input.absSize > 0 && lockPnlUsd > 0
        ? input.direction === 'LONG'
          ? input.entryPrice + lockPnlUsd / input.absSize
          : input.entryPrice - lockPnlUsd / input.absSize
        : null;

    let candidate = trailCandidate;
    if (peakLockStop != null && Number.isFinite(peakLockStop)) {
      candidate =
        input.direction === 'LONG'
          ? Math.max(trailCandidate, peakLockStop)
          : Math.min(trailCandidate, peakLockStop);
    }

    rec.currentTrailStop = ratchetStop(
      input.direction,
      rec.currentTrailStop,
      candidate
    );

    if (input.trailCloseDeferred) {
      // Hard overshoot past stop — do not keep deferring into a scratch win.
      const stop = rec.currentTrailStop;
      const overshootPx =
        stop != null && Number.isFinite(stop)
          ? input.direction === 'LONG'
            ? stop - input.markPrice
            : input.markPrice - stop
          : 0;
      const deepPastStop = overshootPx > Math.max(trailDist * 0.25, input.markPrice * 0.0002);
      const gaveBackHalf =
        rec.highestPnlSinceEntry > 0 &&
        input.pnlUsd < rec.highestPnlSinceEntry * 0.5;
      if (!deepPastStop && !gaveBackHalf) {
        return {
          record: rec,
          shouldClose: false,
          exitReason: '',
          closeDetail: '',
        };
      }
    }

    const peakMinFees = config.hyperliquid.profitPeakMinFeesMult;
    const runWiden =
      trailMult >= 1.12 ? (trailMult >= 1.5 ? 1.45 : 1.2) : 1;
    if (
      rec.highestPnlSinceEntry >= feesUsd * Math.min(peakMinFees, 3) &&
      rec.highestPnlSinceEntry >= Math.max(input.collateralUsd * 0.015, feesUsd * 2) &&
      input.pnlUsd > 0 &&
      peakFrac > 0 &&
      rec.timeInProfitMs >= cfg.armMinProfitHoldMs &&
      !trailTooYoungToClose(rec, input.nowMs, trailMult)
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
      !trailTooYoungToClose(rec, input.nowMs, trailMult) &&
      input.pnlUsd > 0
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
