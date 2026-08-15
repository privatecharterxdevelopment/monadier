/**
 * Price-based dynamic trailing stop — 4 phases:
 * 1 idle, 2 armed (breakeven+fees from 8% ROE), 3 trailing (ATR/% ratchet from 15% ROE). Fee gate blocks scratch closes.
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

/**
 * Hard gate: scratch winners that don't clear open+close fees become net losers.
 * Require uPnL ≥ round-trip fees × minProfitCloseFeesMult before any profit exit.
 */
export function profitClearsFeeGate(pnlUsd: number, feesUsd: number): boolean {
  const mult = Math.max(1, config.hyperliquid.dynamicTrail.minProfitCloseFeesMult || 4);
  const need = Math.max(0.5, feesUsd * mult);
  return pnlUsd >= need;
}

function blockIfFeesNotCleared(
  result: TrailTickResult,
  pnlUsd: number,
  feesUsd: number,
  coin: string
): TrailTickResult {
  if (!result.shouldClose) return result;
  if (result.exitReason === 'stop_loss') return result;
  if (profitClearsFeeGate(pnlUsd, feesUsd)) return result;
  const mult = Math.max(1, config.hyperliquid.dynamicTrail.minProfitCloseFeesMult || 4);
  logger.info('HL profit close blocked — uPnL does not clear fees', {
    coin,
    reason: result.exitReason,
    pnlUsd: pnlUsd.toFixed(4),
    feesUsd: feesUsd.toFixed(4),
    needUsd: (feesUsd * mult).toFixed(4),
    mult,
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
  collateralUsd: number,
  timeInProfitMs: number,
  totalHoldMs: number
): boolean {
  const cfg = config.hyperliquid.dynamicTrail;
  const holdOk =
    timeInProfitMs >= cfg.armMinProfitHoldMs ||
    totalHoldMs >= cfg.maxHoldBeforeSlTrailMs;
  if (!holdOk) return false;
  if (pnlUsd <= 0 || collateralUsd <= 0) return false;
  return roePct(pnlUsd, collateralUsd) >= cfg.breakevenArmRoePct;
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
 * Hard profit-lock floor — guaranteed floor price at peak uPnL × (1 − dropFrac).
 * Scales with the peak (leverage-agnostic), ratchets up only. Returns null until the
 * peak ROE reaches the breakeven arm level so tiny noise peaks don't scratch.
 */
function peakProfitFloorStopPx(
  direction: 'LONG' | 'SHORT',
  entryPrice: number,
  absSize: number,
  collateralUsd: number,
  peakPnlUsd: number
): number | null {
  const cfg = config.hyperliquid.dynamicTrail;
  if (collateralUsd <= 0 || absSize <= 0 || peakPnlUsd <= 0) return null;
  const peakRoe = (peakPnlUsd / collateralUsd) * 100;
  if (peakRoe < cfg.breakevenArmRoePct) return null;
  const baseDrop = cfg.profitFloorPeakDropFrac;
  const dropRaw =
    direction === 'LONG' ? cfg.longProfitFloorPeakDropFrac || baseDrop : baseDrop;
  const dropFrac = Math.min(0.95, Math.max(0.05, dropRaw));
  const floorPnlUsd = peakPnlUsd * (1 - dropFrac);
  const move = floorPnlUsd / absSize;
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

function trailTooYoungToClose(
  rec: DynamicTrailRecord,
  nowMs: number,
  trailMult: number
): boolean {
  const cfg = config.hyperliquid.dynamicTrail;
  let minMs = cfg.trailMinActiveBeforeCloseMs;
  if (rec.direction === 'LONG') {
    minMs = Math.round(minMs * Math.max(1, cfg.longTrailMinActiveMult || 1));
  }
  if (!rec.trailArmedAt || minMs <= 0) return false;
  if (nowMs - rec.trailArmedAt < minMs) {
    return trailMult >= 0.95;
  }
  return false;
}

/** LONGs: once green, breathe for longMinGreenHoldMs before any profit exit. */
function longGreenTooYoungToClose(rec: DynamicTrailRecord, pnlUsd: number): boolean {
  if (rec.direction !== 'LONG' || pnlUsd <= 0) return false;
  const minMs = Math.max(0, config.hyperliquid.dynamicTrail.longMinGreenHoldMs || 0);
  return minMs > 0 && rec.timeInProfitMs < minMs;
}

/** LONGs skip stage-1 BE close only when explicitly enabled. */
function longBlocksBreakevenLockClose(direction: 'LONG' | 'SHORT'): boolean {
  return (
    direction === 'LONG' &&
    config.hyperliquid.dynamicTrail.longSkipBreakevenLockClose === true
  );
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
  return blockIfFeesNotCleared(result, input.pnlUsd, feesUsd, input.coin);
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

  // Phase 1 — idle: arm profit protection after 30s continuously profitable, or arm
  // the loss SL% after the separate max-hold threshold (2 min default).
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
        holdMs: input.totalHoldMs,
      });
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

  // Hard peak profit-lock floor — same rules for LONG and SHORT (tight to peak).
  if (rec.phase === 'armed' || rec.phase === 'trailing') {
    const floorStop = peakProfitFloorStopPx(
      input.direction,
      input.entryPrice,
      input.absSize,
      input.collateralUsd,
      rec.highestPnlSinceEntry
    );
    if (floorStop != null) {
      rec.currentTrailStop = ratchetStop(
        input.direction,
        rec.currentTrailStop ?? floorStop,
        floorStop
      );
      if (
        input.pnlUsd > 0 &&
        isTrailStopCrossed(input.direction, input.markPrice, floorStop) &&
        !longGreenTooYoungToClose(rec, input.pnlUsd) &&
        !trailTooYoungToClose(rec, input.nowMs, 1) &&
        !longPeakTooSmallToTrailClose(
          input.direction,
          rec.highestPnlSinceEntry,
          input.collateralUsd
        )
      ) {
        const dropUsed =
          input.direction === 'LONG'
            ? cfg.longProfitFloorPeakDropFrac || cfg.profitFloorPeakDropFrac
            : cfg.profitFloorPeakDropFrac;
        const lockPct = (1 - Math.min(0.95, Math.max(0.05, dropUsed))) * 100;
        const detail = `PEAK PROFIT FLOOR · ${input.direction} ${input.coin} · lock ${lockPct.toFixed(0)}% of peak · peak $${rec.highestPnlSinceEntry.toFixed(4)} → $${input.pnlUsd.toFixed(4)} · ${formatAnalytics(rec, input.markPrice)}`;
        return {
          record: rec,
          shouldClose: true,
          exitReason: 'profit_lock',
          closeDetail: detail,
        };
      }
    }
  }

  // Phase 2 — breakeven lock: fixed stop, no tight ATR trail until ~5% ROE.
  if (rec.phase === 'armed' && rec.currentTrailStop != null) {
    const beStop = breakevenPlusFeesStopPx(
      input.direction,
      input.entryPrice,
      input.absSize,
      feesUsd
    );
    rec.currentTrailStop = ratchetStop(input.direction, rec.currentTrailStop, beStop);

    if (shouldUpgradeToTrailing(input.pnlUsd, input.collateralUsd, input.direction)) {
      rec.phase = 'trailing';
      logger.info('HL trailing stop armed (stage 2)', {
        coin: input.coin,
        direction: input.direction,
        roe: roePct(input.pnlUsd, input.collateralUsd).toFixed(2),
        pnlUsd: input.pnlUsd.toFixed(4),
        peakPnlUsd: rec.highestPnlSinceEntry.toFixed(4),
      });
    } else if (
      !longBlocksBreakevenLockClose(input.direction) &&
      input.pnlUsd > 0 &&
      isTrailStopCrossed(input.direction, input.markPrice, rec.currentTrailStop) &&
      !longGreenTooYoungToClose(rec, input.pnlUsd)
    ) {
      const peakRoe = roePct(rec.highestPnlSinceEntry, input.collateralUsd);
      const minPeakUsd = Math.max(
        feesUsd * 12,
        input.collateralUsd * (cfg.breakevenArmRoePct / 100) * 1.1
      );
      // Once peak ROE reached the arm level, honor the breakeven lock (user wants early
      // profit protection). Only skip locking for winners that never reached the arm ROE.
      if (
        peakRoe < cfg.breakevenArmRoePct &&
        rec.highestPnlSinceEntry < minPeakUsd &&
        peakRoe < cfg.armMinRoePct
      ) {
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
      !trailTooYoungToClose(rec, input.nowMs, trailMult) &&
      !longGreenTooYoungToClose(rec, input.pnlUsd) &&
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
      !trailTooYoungToClose(rec, input.nowMs, trailMult) &&
      input.pnlUsd > 0 &&
      !longGreenTooYoungToClose(rec, input.pnlUsd) &&
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
