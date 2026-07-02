/**
 * Two-stage in-profit SL:
 * Stage 1 (+1.5% ROE arm): lock min ROE (≥0.4% or minNet-derived) — stop does not chase peak yet.
 * Stage 2 (peak ≥ +2% ROE): ratchet peak − gap until trail cross.
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

/** Tier-based exit slippage estimate (bps on notional). */
export function exitSlippageBpsForCoin(coin: string): number {
  const cfg = config.hyperliquid.dynamicTrail;
  const { tier } = classifyCoinTier(coin);
  if (tier === 'major') return cfg.exitSlippageBpsMajor;
  if (tier === 'mid') return cfg.exitSlippageBpsMid;
  return cfg.exitSlippageBpsCautious;
}

/** Dynamic floor: max(round-trip fees×2, 0.25% notional, configured USD min). */
export function minNetProfitFloorUsd(notionalUsd: number): number {
  const cfg = config.hyperliquid.dynamicTrail;
  const fromFees = estimateRoundTripFeesUsd(notionalUsd) * cfg.armFeesMultiplier;
  const fromNotional = notionalUsd * cfg.minNetNotionalPct;
  return Math.max(fromFees, fromNotional, cfg.profitTrailMinNetPnlUsd);
}

/** One-way exit cost: taker fee + tier slippage on market close. */
export function estimateExitCostUsd(notionalUsd: number, coin = ''): number {
  if (notionalUsd <= 0) return 0;
  const cfg = config.hyperliquid.dynamicTrail;
  const exitFee = notionalUsd * (cfg.estimatedFeeBpsPerSide / 10_000);
  const slipBps = coin ? exitSlippageBpsForCoin(coin) : cfg.estimatedSlippageBps;
  const slippage = notionalUsd * (slipBps / 10_000);
  return exitFee + slippage;
}

export function expectedNetPnlUsd(
  unrealizedPnlUsd: number,
  notionalUsd: number,
  coin = ''
): number {
  return unrealizedPnlUsd - estimateExitCostUsd(notionalUsd, coin);
}

/** Profit exit may only close when expected net after costs exceeds dynamic floor. */
export function passesProfitExitNetGate(
  unrealizedPnlUsd: number,
  notionalUsd: number,
  coin = ''
): boolean {
  if (notionalUsd <= 0) return unrealizedPnlUsd > 0;
  const floor = minNetProfitFloorUsd(notionalUsd);
  if (floor <= 0) return unrealizedPnlUsd > 0;
  return expectedNetPnlUsd(unrealizedPnlUsd, notionalUsd, coin) >= floor;
}

/** @deprecated Use passesProfitExitNetGate */
export function passesProfitTrailNetGate(
  unrealizedPnlUsd: number,
  notionalUsd: number,
  coin = ''
): boolean {
  return passesProfitExitNetGate(unrealizedPnlUsd, notionalUsd, coin);
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

/** Stage 2 lock — max(floor, peak − gap). gapMult widens on strong runs. */
export function profitTrailLockRoePct(
  peakPnlUsd: number,
  collateralUsd: number,
  gapMult = 1
): number {
  const cfg = config.hyperliquid.dynamicTrail;
  const peakRoe = roePct(peakPnlUsd, collateralUsd);
  const floor = cfg.armMinRoePct;
  const gap = cfg.trailGapRoePct * Math.max(1, gapMult);
  return Math.max(floor, peakRoe - gap);
}

/** Stage 1 lock — min ROE once green; scales with minNet floor when collateral known. */
export function profitLockStage1RoePct(
  collateralUsd = 0,
  notionalUsd = 0,
  coin = ''
): number {
  const cfgMin = config.hyperliquid.dynamicTrail.armMinRoePct;
  if (collateralUsd <= 0 || notionalUsd <= 0) return cfgMin;
  const grossNeeded =
    minNetProfitFloorUsd(notionalUsd) + estimateExitCostUsd(notionalUsd, coin);
  const roeFromFloor = (grossNeeded / collateralUsd) * 100;
  return Math.max(cfgMin, roeFromFloor);
}

export function resolveProfitTrailLockRoe(
  phase: TrailPhase,
  peakPnlUsd: number,
  collateralUsd: number,
  gapMult = 1,
  opts?: { notionalUsd?: number; coin?: string }
): number {
  if (phase === 'profit_lock') {
    return profitLockStage1RoePct(
      collateralUsd,
      opts?.notionalUsd ?? 0,
      opts?.coin ?? ''
    );
  }
  if (phase === 'trailing') return profitTrailLockRoePct(peakPnlUsd, collateralUsd, gapMult);
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

/** Profit trail closes only when gross green and expected net after exit costs passes floor. */
export function shouldExecuteProfitTrailClose(
  pnlUsd: number,
  notionalUsd = 0,
  coin = ''
): boolean {
  if (pnlUsd <= 0) return false;
  const minClose = config.hyperliquid.dynamicTrail.profitTrailMinClosePnlUsd;
  if (minClose > 0 && pnlUsd < minClose) return false;
  if (notionalUsd > 0 && !passesProfitExitNetGate(pnlUsd, notionalUsd, coin)) return false;
  return true;
}

/** Close in green: S2 hard exit on stop/lock breach; S1 on stop only; soft S2 pullback optional. */
export function shouldCloseProfitTrailInGreen(
  rec: DynamicTrailRecord,
  input: Pick<
    TrailTickInput,
    | 'coin'
    | 'pnlUsd'
    | 'collateralUsd'
    | 'direction'
    | 'markPrice'
    | 'nowMs'
    | 'trailDistanceMult'
    | 'notionalUsd'
  >
): boolean {
  if (rec.phase !== 'profit_lock' && rec.phase !== 'trailing') return false;
  if (!shouldExecuteProfitTrailClose(input.pnlUsd, input.notionalUsd, input.coin)) return false;

  const cfg = config.hyperliquid.dynamicTrail;
  const armedMs =
    rec.trailArmedAt != null ? input.nowMs - rec.trailArmedAt : 0;

  const peak = rec.highestPnlSinceEntry;
  const gapMult = input.trailDistanceMult ?? 1;
  const lockRoe = resolveProfitTrailLockRoe(
    rec.phase,
    peak,
    input.collateralUsd,
    gapMult,
    { notionalUsd: input.notionalUsd, coin: input.coin }
  );
  const stopCrossed =
    rec.currentTrailStop != null &&
    isTrailStopCrossed(input.direction, input.markPrice, rec.currentTrailStop);
  const currentRoe = roePct(input.pnlUsd, input.collateralUsd);

  // Stage 2 hard exit: ratchet stop or locked ROE breach — no arm-hold or retrace gate.
  if (rec.phase === 'trailing' && (stopCrossed || currentRoe <= lockRoe)) {
    return true;
  }

  if (armedMs < cfg.armMinProfitHoldMs) return false;
  if (armedMs < cfg.trailMinActiveBeforeCloseMs) return false;

  // Stage 1: breakeven lock only — close on price stop, not ROE noise.
  if (rec.phase === 'profit_lock') {
    return stopCrossed;
  }

  // Stage 2 soft exit: pullback from peak without stop cross yet (noise filter).
  const minRetraceUsd = Math.max(
    cfg.profitTrailMinClosePnlUsd,
    peak * config.hyperliquid.profitTrailMinPeakFraction
  );
  const retraceUsd = Math.max(0, peak - input.pnlUsd);
  return retraceUsd >= minRetraceUsd;
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
  const gapMult = input.trailDistanceMult ?? 1;
  const lockRoe = resolveProfitTrailLockRoe(
    rec.phase,
    rec.highestPnlSinceEntry,
    input.collateralUsd,
    gapMult,
    { notionalUsd: input.notionalUsd, coin: input.coin }
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
      isTrailStopCrossed(input.direction, input.markPrice, rec.currentTrailStop)
    ) {
      if (input.pnlUsd <= 0) {
        logger.info('HL profit trail hold — stop crossed in red (no loss close)', {
          coin: input.coin,
          direction: input.direction,
          stage: stageLabel,
          pnlUsd: input.pnlUsd.toFixed(4),
          mark: input.markPrice.toFixed(6),
          stop: rec.currentTrailStop.toFixed(6),
        });
      } else if (!passesProfitExitNetGate(input.pnlUsd, input.notionalUsd, input.coin)) {
        logger.info('HL profit trail hold — net after fees/slip below floor', {
          coin: input.coin,
          direction: input.direction,
          stage: stageLabel,
          pnlUsd: input.pnlUsd.toFixed(4),
          expectedNet: expectedNetPnlUsd(
            input.pnlUsd,
            input.notionalUsd,
            input.coin
          ).toFixed(4),
          minNet: minNetProfitFloorUsd(input.notionalUsd).toFixed(4),
        });
      }
    }
    return null;
  }

  const lockRoe = resolveProfitTrailLockRoe(
    rec.phase,
    rec.highestPnlSinceEntry,
    input.collateralUsd,
    input.trailDistanceMult ?? 1,
    { notionalUsd: input.notionalUsd, coin: input.coin }
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

  // —— Arm trail when green — stage 1 breakeven lock only ——
  if (
    rec.phase === 'idle' &&
    shouldArmProfitTrail(rec.highestPnlSinceEntry, input.collateralUsd)
  ) {
    rec.phase = 'profit_lock';
    rec.trailArmedAt = input.nowMs;
    rec.estimatedFeesUsd = feesUsd;
    refreshProfitTrailStop(rec, input);
    logger.info('HL profit trail stage 1 armed', {
      coin: input.coin,
      direction: input.direction,
      roe: roePct(rec.highestPnlSinceEntry, input.collateralUsd).toFixed(3),
      lockRoe: profitLockStage1RoePct().toFixed(3),
      stop: rec.currentTrailStop?.toFixed(6),
      pnlUsd: input.pnlUsd.toFixed(4),
      peakPnlUsd: rec.highestPnlSinceEntry.toFixed(4),
    });
    return { record: rec, ...noClose };
  }

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
