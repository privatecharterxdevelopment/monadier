/**
 * Profit protection — three exclusive stages:
 *   Stage 0 idle     — unarmed. No profit SL. Emergency/loss SL is independent.
 *   Stage 1 armed    — fee+slip+funding BE lock. First stop is always
 *                      breakevenPlusFeesStopPx. Ratchet only toward profit.
 *   Stage 2 trailing — ATR/% from the favorable extreme, still never worse than
 *                      the Stage-1 protected price.
 *
 * Arming is economic (mark past BE + min trail gap), never `pnlUsd > 0` alone.
 */
import { config } from '../config';
import { logger } from '../utils/logger';
import { signalEngine, type Candle } from './signalEngine';
import { classifyCoinTier, isMajorFillCoin, type CoinTier } from './coinTier';
import { hlCoinToBinanceSymbol } from './hlSymbols';
import { hlTickSize, roundHlPrice } from './hlInfo';

export type TrailPhase = 'idle' | 'armed' | 'trailing';
/** Stage 0 = idle, Stage 1 = profit protection, Stage 2 = ATR trailing. */
export type ProfitProtectionStage = 0 | 1 | 2;

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
  /** Signed HL cumFunding.sinceOpen — negative means the position paid. */
  fundingUsd?: number;
  /** HL tick (5 sig figs / szDecimals). */
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
    trailCloseDeferUntil: null,
    trailCloseDeferCount: 0,
  };
}

export function estimateRoundTripFeesUsd(notionalUsd: number): number {
  const bps = config.hyperliquid.dynamicTrail.estimatedFeeBpsPerSide;
  return notionalUsd * (bps / 10_000) * 2;
}

/**
 * Profit exits must stay green after the CLOSE fill. Open fee is sunk.
 * Round-trip × 1.5 on a 40x BTC (~$18k) demanded ~$19 — so a $11 winner
 * could never snap (BTC 30 Aug: peak $10.83, lock $18.87, then red).
 */
export function profitCloseNeedUsd(feesUsd: number, _collateralUsd = 0): number {
  const minUsd = Math.max(0.75, config.hyperliquid.minProfitCloseUsd || 0.75);
  const closeLeg = Math.max(0, feesUsd) / 2;
  return Math.max(minUsd, closeLeg * 1.1);
}

export function profitClearsFeeGate(
  pnlUsd: number,
  feesUsd: number,
  _peakPnlUsd = 0,
  collateralUsd = 0
): boolean {
  // Must stay green AFTER the close fill (fees + a bit of market-SL slippage).
  // pnl > 0 alone let SOL scratch −$0.56 when the trigger slipped through entry.
  const need = Math.max(profitCloseNeedUsd(feesUsd, collateralUsd), feesUsd * 2);
  return pnlUsd >= need;
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
  logger.info('HL profit close blocked — not green', {
    coin,
    reason: result.exitReason,
    pnlUsd: Number.isFinite(pnlUsd) ? pnlUsd.toFixed(4) : String(pnlUsd),
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

export type BreakevenArmInput = {
  direction: 'LONG' | 'SHORT';
  pnlUsd: number;
  markPrice: number;
  entryPrice: number;
  absSize: number;
  feesUsd: number;
  fundingUsd?: number;
  tickSize?: number;
  szDecimals?: number;
  timeInProfitMs?: number;
  collateralUsd?: number;
  notionalUsd?: number;
};

export function profitProtectionStage(
  rec: Pick<DynamicTrailRecord, 'phase' | 'lossSlArmed'>
): ProfitProtectionStage {
  if (rec.lossSlArmed) return 0;
  if (rec.phase === 'trailing') return 2;
  if (rec.phase === 'armed') return 1;
  return 0;
}

export function minProfitTrailGapPx(markPrice: number, tickSize = 0): number {
  const cfg = config.hyperliquid.dynamicTrail;
  const bps = Math.max(0, cfg.minProfitTrailGapBps || 8);
  const fromBps = markPrice * (bps / 10_000);
  const fromTick = Math.max(0, tickSize) * 2;
  return Math.max(fromBps, fromTick, markPrice * 0.0004);
}

/**
 * Stage 0 → 1. Never `pnlUsd > 0` alone. Requires:
 * - mark past fee/slip/funding BE by a usable trail gap
 * - BE stop strictly on the profit side of entry
 * - net uPnL still green after a limit close at that BE
 */
export function shouldArmBreakevenProtection(input: BreakevenArmInput): boolean {
  const {
    direction,
    pnlUsd,
    markPrice,
    entryPrice,
    absSize,
    feesUsd,
    fundingUsd = 0,
    timeInProfitMs = 0,
    collateralUsd = 0,
    notionalUsd = 0,
  } = input;
  if (!(entryPrice > 0) || !(absSize > 0) || !(markPrice > 0)) return false;
  if (!Number.isFinite(pnlUsd) || !Number.isFinite(markPrice)) return false;

  const debounceMs = config.hyperliquid.dynamicTrail.armMinProfitHoldMs;
  if (debounceMs > 0 && timeInProfitMs < debounceMs) return false;

  const notional = notionalUsd > 0 ? notionalUsd : absSize * markPrice;
  const tick =
    input.tickSize && input.tickSize > 0
      ? input.tickSize
      : hlTickSize(markPrice, input.szDecimals ?? 0);
  const be = breakevenPlusFeesStopPx(
    direction,
    entryPrice,
    absSize,
    feesUsd,
    fundingUsd,
    notional,
    tick,
    input.szDecimals ?? 0
  );
  if (!(be > 0) || !Number.isFinite(be)) return false;

  const gap = minProfitTrailGapPx(markPrice, tick);
  if (direction === 'LONG') {
    if (!(be > entryPrice)) return false;
    if (!(markPrice >= be + gap)) return false;
  } else {
    if (!(be < entryPrice)) return false;
    if (!(markPrice <= be - gap)) return false;
  }

  const lockUsd =
    direction === 'LONG' ? (be - entryPrice) * absSize : (entryPrice - be) * absSize;
  if (!(lockUsd > 0)) return false;
  // uPnL must cover the locked BE package (fees+slip+funding). Do not use the
  // $0.75 close floor — that blocked economic arm on small notionals.
  if (pnlUsd + 1e-9 < lockUsd) return false;
  void collateralUsd;
  return true;
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
export function longPeakTooSmallToTrailClose(
  direction: 'LONG' | 'SHORT',
  peakPnlUsd: number,
  collateralUsd: number,
  coin = ''
): boolean {
  if (direction !== 'LONG') return false;
  const minRoe = config.hyperliquid.dynamicTrail.longMinPeakRoePctBeforeTrailClose || 0;
  const floor = isMajorFillCoin(coin) ? Math.max(15, minRoe) : minRoe;
  if (floor <= 0) return false;
  return roePct(peakPnlUsd, collateralUsd) < floor;
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

export function hasBreakevenLock(
  direction: 'LONG' | 'SHORT',
  markPrice: number,
  entryPrice: number,
  absSize: number,
  feesUsd: number,
  fundingUsd = 0,
  notionalUsd = 0,
  tickSize = 0,
  szDecimals = 0
): boolean {
  const lockPx = breakevenPlusFeesStopPx(
    direction,
    entryPrice,
    absSize,
    feesUsd,
    fundingUsd,
    notionalUsd,
    tickSize,
    szDecimals
  );
  return direction === 'LONG' ? markPrice >= lockPx : markPrice <= lockPx;
}

/**
 * Minimum profitable exit after round-trip fees, slippage buffer, and
 * adverse funding. LONG stop is ceiled to tick (never below BE); SHORT
 * floored (never above BE toward the loss side).
 */
export function breakevenPlusFeesStopPx(
  direction: 'LONG' | 'SHORT',
  entryPrice: number,
  absSize: number,
  feesUsd: number,
  fundingUsd = 0,
  notionalUsd = 0,
  tickSize = 0,
  szDecimals = 0
): number {
  if (!(entryPrice > 0) || !(absSize > 0)) {
    return direction === 'LONG' ? Number.POSITIVE_INFINITY : 0;
  }
  const cfg = config.hyperliquid.dynamicTrail;
  const notional = notionalUsd > 0 ? notionalUsd : entryPrice * absSize;
  const slipUsd = notional * (Math.max(0, cfg.slippageBufferBps || 0) / 10_000);
  const pctBuf = notional * (cfg.breakevenBufferPct / 100);
  const feeBuf = Math.max(0, feesUsd) * cfg.breakevenBufferFeesMult;
  const extra = Math.max(slipUsd, pctBuf, feeBuf);
  const fundingCost = Math.max(0, -fundingUsd);
  const move = (Math.max(0, feesUsd) + extra + fundingCost) / absSize;
  const raw = direction === 'LONG' ? entryPrice + move : entryPrice - move;
  const tick = tickSize > 0 ? tickSize : hlTickSize(raw, szDecimals);
  const rounded =
    direction === 'LONG'
      ? roundHlPrice(raw, szDecimals, 'long_stop')
      : roundHlPrice(raw, szDecimals, 'short_stop');
  if (tick > 0 && Number.isFinite(rounded) && rounded > 0) return rounded;
  return raw;
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

/**
 * Stage-1/2 peak lock. Symmetric LONG/SHORT. Keep fractions stay well below 1
 * so the stop is never glued to a one-tick print (the old 0.84 SHORT hug).
 */
function stagedProfitLock(
  peakPnlUsd: number,
  feesUsd: number,
  _direction: 'LONG' | 'SHORT',
  phase: TrailPhase,
  collateralUsd = 0,
  _coin = ''
): { level: 'fee' | 'partial' | 'core' | 'runner'; keepFrac: number; lockUsd: number } | null {
  const need = profitCloseNeedUsd(feesUsd, collateralUsd);
  if (!(peakPnlUsd > 0)) return null;
  const cfg = config.hyperliquid.dynamicTrail;
  const keepFrac =
    phase === 'trailing'
      ? Math.max(0.2, Math.min(0.7, cfg.stage2PeakKeepFrac || 0.45))
      : Math.max(0.15, Math.min(0.5, cfg.stage1PeakKeepFrac || 0.32));
  const ratio = need > 0 ? peakPnlUsd / need : 99;
  const level: 'fee' | 'partial' | 'core' | 'runner' =
    ratio < 2 ? 'fee' : ratio < 4 ? 'partial' : ratio < 8 ? 'core' : 'runner';
  const lockUsd = Math.min(peakPnlUsd * 0.85, Math.max(need, peakPnlUsd * keepFrac));
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
  collateralUsd = 0,
  coin = '',
  fundingUsd = 0,
  notionalUsd = 0,
  tickSize = 0,
  szDecimals = 0
): { px: number; level: string; lockUsd: number; keepFrac: number } | null {
  if (entryPrice <= 0 || absSize <= 0) return null;
  const be = breakevenPlusFeesStopPx(
    direction,
    entryPrice,
    absSize,
    feesUsd,
    fundingUsd,
    notionalUsd,
    tickSize,
    szDecimals
  );
  const staged = stagedProfitLock(
    peakPnlUsd,
    feesUsd,
    direction,
    phase,
    collateralUsd,
    coin
  );
  const lockUsd = staged?.lockUsd ?? 0;
  const peakPx =
    lockUsd > 0
      ? direction === 'LONG'
        ? entryPrice + lockUsd / absSize
        : entryPrice - lockUsd / absSize
      : be;
  const px = ratchetStop(direction, be, peakPx);
  const locked = lockedPnlAtStopPx(direction, entryPrice, absSize, px);
  return {
    px,
    level: staged?.level ?? 'fee',
    lockUsd: locked,
    keepFrac: staged?.keepFrac ?? 0,
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
  _trailMult: number
): boolean {
  const cfg = config.hyperliquid.dynamicTrail;
  let minMs = cfg.trailMinActiveBeforeCloseMs;
  minMs = Math.round(minMs * Math.max(1, cfg.longTrailMinActiveMult || 1));
  if (!rec.trailArmedAt || minMs <= 0) return false;
  // Always wait after arm — trailMult used to skip this on a tight trail, so
  // the floor closed before the stop could ratchet with the peak.
  return nowMs - rec.trailArmedAt < minMs;
}

/** LONG only — SHORTs must snap the profit SL as soon as it is crossed. */
function longGreenTooYoungToClose(
  rec: DynamicTrailRecord,
  pnlUsd: number,
  direction: 'LONG' | 'SHORT'
): boolean {
  if (direction !== 'LONG' || pnlUsd <= 0) return false;
  const minMs = Math.min(
    240_000,
    Math.max(0, config.hyperliquid.dynamicTrail.longMinGreenHoldMs || 0)
  );
  return minMs > 0 && rec.timeInProfitMs < minMs;
}

function directionTrailDistanceMult(direction: 'LONG' | 'SHORT', biasMult: number): number {
  const cfg = config.hyperliquid.dynamicTrail;
  if (direction === 'SHORT') {
    // Strong-run widen used to park the SL 9% behind the print. Cap it.
    return Math.max(0.7, Math.min(1.08, biasMult || 1));
  }
  const longRoom = Math.max(1, cfg.longTrailDistanceMult || 1);
  return Math.max(0.75, Math.min(2.8, (biasMult || 1) * longRoom));
}

/**
 * Stop that follows the favorable extreme by a fraction of the run
 * (entry → peak). This is what actually "zieht nach" — ATR % of mark
 * was 8–9% and never caught a $10 winner on BTC.
 */
function runRetraceStopPx(
  direction: 'LONG' | 'SHORT',
  entryPrice: number,
  extremePx: number,
  givebackFrac: number
): number | null {
  if (!(entryPrice > 0) || !(extremePx > 0) || !(givebackFrac > 0)) return null;
  const run = Math.abs(extremePx - entryPrice);
  if (!(run > 0)) return null;
  const dist = run * givebackFrac;
  const px = direction === 'LONG' ? extremePx - dist : extremePx + dist;
  if (direction === 'LONG') return Math.max(px, entryPrice);
  return Math.min(px, entryPrice);
}

function shortRunGivebackFrac(peakPnlUsd: number, feesUsd: number, collateralUsd: number): number {
  const need = profitCloseNeedUsd(feesUsd, collateralUsd);
  const ratio = need > 0 ? peakPnlUsd / need : 1;
  if (ratio >= 8) return 0.06;
  if (ratio >= 4) return 0.08;
  if (ratio >= 2) return 0.1;
  return 0.14;
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

  const tick =
    input.tickSize && input.tickSize > 0
      ? input.tickSize
      : hlTickSize(input.markPrice, input.szDecimals ?? 0);
  const fundingUsd = input.fundingUsd ?? 0;
  const beStop = breakevenPlusFeesStopPx(
    input.direction,
    input.entryPrice,
    input.absSize,
    feesUsd,
    fundingUsd,
    input.notionalUsd,
    tick,
    input.szDecimals ?? 0
  );

  // Stage 0 — unarmed. Profit SL stays off until mark clears economic BE+gap.
  // Emergency/loss SL% is independent and may arm while still red.
  if (rec.phase === 'idle') {
    const maxSlDue = input.totalHoldMs >= cfg.maxHoldBeforeSlTrailMs;

    if (
      shouldArmBreakevenProtection({
        direction: input.direction,
        pnlUsd: input.pnlUsd,
        markPrice: input.markPrice,
        entryPrice: input.entryPrice,
        absSize: input.absSize,
        feesUsd,
        fundingUsd,
        tickSize: tick,
        szDecimals: input.szDecimals ?? 0,
        timeInProfitMs: rec.timeInProfitMs,
        collateralUsd: input.collateralUsd,
        notionalUsd: input.notionalUsd,
      })
    ) {
      rec.phase = 'armed';
      rec.trailArmedAt = input.nowMs;
      rec.currentTrailStop = beStop;
      rec.estimatedFeesUsd = feesUsd;
      logger.info('HL profit protection armed (stage 1 BE)', {
        coin: input.coin,
        direction: input.direction,
        entry: input.entryPrice.toFixed(6),
        mark: input.markPrice.toFixed(6),
        beStop: beStop.toFixed(6),
        lockUsd: lockedPnlAtStopPx(
          input.direction,
          input.entryPrice,
          input.absSize,
          beStop
        ).toFixed(4),
        pnlUsd: input.pnlUsd.toFixed(4),
        peakPnlUsd: rec.highestPnlSinceEntry.toFixed(4),
        feesUsd: feesUsd.toFixed(4),
        fundingUsd: fundingUsd.toFixed(4),
        roe: roePct(input.pnlUsd, input.collateralUsd).toFixed(2),
        timeInProfitMs: rec.timeInProfitMs,
        holdMs: input.totalHoldMs,
        stage: 1,
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

  // Independent emergency/loss trail — never mixed with profit protection.
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

  // Stage 1 + 2: ratchet toward profit only. BE is a hard floor every tick.
  rec.currentTrailStop = ratchetStop(input.direction, rec.currentTrailStop, beStop);

  const floorStop = peakProfitFloorStopPx(
    input.direction,
    input.entryPrice,
    input.absSize,
    rec.highestPnlSinceEntry,
    feesUsd,
    rec.phase,
    input.collateralUsd,
    input.coin,
    fundingUsd,
    input.notionalUsd,
    tick,
    input.szDecimals ?? 0
  );
  if (floorStop != null) {
    rec.currentTrailStop = ratchetStop(
      input.direction,
      rec.currentTrailStop,
      floorStop.px
    );
  }

  // Stage 2 only: ATR/% distance from the favorable extreme.
  if (rec.phase === 'trailing') {
    const trailMult = directionTrailDistanceMult(
      input.direction,
      input.trailDistanceMult ?? 1
    );
    const trailDist =
      (await resolveTrailDistancePx(input.coin, input.markPrice)) * trailMult;
    rec.lastTrailDistancePx = trailDist;
    const atrCandidate =
      input.direction === 'LONG'
        ? rec.highestPriceSinceEntry - trailDist
        : rec.highestPriceSinceEntry + trailDist;
    rec.currentTrailStop = ratchetStop(
      input.direction,
      rec.currentTrailStop,
      atrCandidate
    );
    rec.currentTrailStop = ratchetStop(input.direction, rec.currentTrailStop, beStop);
  }

  if (rec.currentTrailStop != null && rec.phase === 'armed') {
    const closeSafe = profitClearsFeeGate(
      input.pnlUsd,
      feesUsd,
      rec.highestPnlSinceEntry,
      input.collateralUsd
    );
    if (
      closeSafe &&
      isTrailStopCrossed(input.direction, input.markPrice, rec.currentTrailStop)
    ) {
      const detail = `PROFIT PROTECTION · ${input.direction} ${input.coin} · BE/lock $${lockedPnlAtStopPx(input.direction, input.entryPrice, input.absSize, rec.currentTrailStop).toFixed(4)} · peak $${rec.highestPnlSinceEntry.toFixed(4)} → $${input.pnlUsd.toFixed(4)} · ${formatAnalytics(rec, input.markPrice)}`;
      return {
        record: rec,
        shouldClose: true,
        exitReason: 'profit_lock',
        closeDetail: detail,
      };
    }

    if (shouldUpgradeToTrailing(input.pnlUsd, input.collateralUsd, input.direction)) {
      rec.phase = 'trailing';
      logger.info('HL ATR trailing armed (stage 2)', {
        coin: input.coin,
        direction: input.direction,
        roe: roePct(input.pnlUsd, input.collateralUsd).toFixed(2),
        pnlUsd: input.pnlUsd.toFixed(4),
        peakPnlUsd: rec.highestPnlSinceEntry.toFixed(4),
        stop: rec.currentTrailStop.toFixed(6),
        stage: 2,
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

  // Stage 2 — peak-grab + trail-cross. Stop already ratcheted; never move back.
  if (rec.phase === 'trailing' && rec.currentTrailStop != null) {
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
    const bias = input.trailDistanceMult ?? 1;
    const runWiden = bias >= 1.12 ? (bias >= 1.5 ? 1.45 : 1.2) : 1;
    if (
      rec.highestPnlSinceEntry >= feesUsd * peakMinFees &&
      rec.highestPnlSinceEntry >= Math.max(input.collateralUsd * 0.02, feesUsd * 15) &&
      input.pnlUsd > 0 &&
      peakFrac > 0 &&
      rec.timeInProfitMs >= cfg.armMinProfitHoldMs &&
      !longGreenTooYoungToClose(rec, input.pnlUsd, input.direction) &&
      !longPeakTooSmallToTrailClose(
        input.direction,
        rec.highestPnlSinceEntry,
        input.collateralUsd,
        input.coin
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
      input.pnlUsd > 0 &&
      !longGreenTooYoungToClose(rec, input.pnlUsd, input.direction) &&
      !longPeakTooSmallToTrailClose(
        input.direction,
        rec.highestPnlSinceEntry,
        input.collateralUsd,
        input.coin
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
