/**
 * Final SHORT entry quality — mandatory pre-order check (no MTF bypass).
 *
 * Blocks bottom-chasing after extended red impulse, support proximity without
 * breakdown, and confirmed bullish reversal risk.
 */
import { config } from '../config';
import { logger } from '../utils/logger';
import { signalEngine, type Candle } from './signalEngine';
import { hlCoinToBinanceSymbol } from './hlSymbols';
import { fetchHlAllMids } from './hlInfo';
import { analyzeSrZones } from './entryLocationGate';
import { calculateATR } from './dynamicTrailingStop';
import {
  closedCandles,
  confirmedBreakdownThroughPriorSupport,
  isShortDumpContinuation,
  priorSwingSupport,
} from './shortDumpStructure';
import { isConfirmedShortBreakdown } from './shortBreakdownConfirm';
import {
  isBullishLongLowerWick,
  isBearishLongUpperWick,
} from './candleWickGate';

export type ShortEntryType =
  | 'BREAKDOWN_FOLLOWTHROUGH'
  | 'RESISTANCE_REJECTION'
  | 'RETEST_BROKEN_SUPPORT'
  | 'NONE';

export type ShortEntryQualityCode =
  | 'SHORT_QUALITY_PASS'
  | 'SHORT_QUALITY_DATA'
  | 'SHORT_EXTENDED_DUMP'
  | 'SHORT_SUPPORT_PROXIMITY'
  | 'SHORT_REVERSAL_VETO'
  | 'SHORT_ENTRY_TYPE_NONE'
  | 'SHORT_POOR_DOWNSIDE_ROOM'
  | 'SHORT_FETCH_ERROR';

export type ShortEntryQualityRecord = {
  coin: string;
  entryPrice: number;
  decision: 'PASS' | 'BLOCK';
  entryType: ShortEntryType;
  distanceSupportAtr: number | null;
  distanceResistanceAtr: number | null;
  dumpExtensionAtr: number | null;
  reversalRiskScore: number;
  reversalHardVeto: boolean;
  reversalSignals: string[];
  blockCode: ShortEntryQualityCode | null;
  blockReason: string;
  measuredAt: string;
  freshnessOk: boolean;
  structuralRefPx: number | null;
};

export type ShortEntryQualityResult = {
  ok: boolean;
  code: ShortEntryQualityCode;
  reason: string;
  record: ShortEntryQualityRecord;
};

function closed(candles: Candle[]): Candle[] {
  return closedCandles(candles);
}

function atrDist(price: number, level: number | null, atr: number): number | null {
  if (level == null || !(atr > 0) || !(price > 0)) return null;
  return Math.abs(price - level) / atr;
}

function rangePosition(candles: Candle[]): number {
  const win = closed(candles).slice(-24);
  if (win.length < 4) return 0.5;
  const price = win[win.length - 1]!.close;
  const hi = Math.max(...win.map((c) => c.high));
  const lo = Math.min(...win.map((c) => c.low));
  const span = hi - lo;
  if (!(span > 0)) return 0.5;
  return (price - lo) / span;
}

function redBodyPct(c: Candle): number {
  if (!(c.open > 0)) return 0;
  return Math.max(0, (c.open - c.close) / c.open);
}

function recentRedExtensionAtr(candles: Candle[], atr: number, bars: number): number {
  if (!(atr > 0)) return 0;
  const win = closed(candles).slice(-bars);
  let sum = 0;
  for (const c of win) {
    if (c.close < c.open) sum += Math.max(c.open - c.close, 0);
  }
  return sum / atr;
}

function pullbackHighBeforeDump(candles5m: Candle[]): number | null {
  const win = closed(candles5m);
  if (win.length < 12) return null;
  const tail = win.slice(-8);
  const head = win.slice(-16, -8);
  if (head.length < 4) return null;
  const dumpLow = Math.min(...tail.map((c) => c.low));
  const refHigh = Math.max(...head.map((c) => c.high));
  if (refHigh <= dumpLow) return refHigh;
  const last = tail[tail.length - 1]!;
  if (last.close < refHigh * 0.992) return refHigh;
  return null;
}

function bullishDivergence15m(candles15m: Candle[]): boolean {
  const win = closed(candles15m).slice(-28);
  if (win.length < 20) return false;
  const lows: { i: number; px: number; rsi: number }[] = [];
  for (let i = 3; i < win.length - 3; i += 1) {
    const c = win[i]!;
    if (c.low <= win[i - 1]!.low && c.low <= win[i + 1]!.low) {
      const rsi = signalEngine.calculateRSI(win.slice(0, i + 1), 14);
      lows.push({ i, px: c.low, rsi });
    }
  }
  if (lows.length < 2) return false;
  const a = lows[lows.length - 2]!;
  const b = lows[lows.length - 1]!;
  return b.px < a.px * 0.999 && b.rsi > a.rsi + 2.5;
}

function sellingClimaxThenFade(candles15m: Candle[]): boolean {
  const win = closed(candles15m).slice(-8);
  if (win.length < 5) return false;
  const vols = win.map((c) => c.volume ?? 0);
  const avg = vols.slice(0, -3).reduce((s, v) => s + v, 0) / Math.max(1, vols.length - 3);
  const spike = win[win.length - 3];
  if (!spike || !(avg > 0)) return false;
  const volSpike = (spike.volume ?? 0) >= avg * 2.2;
  const bigRed = spike.close < spike.open && redBodyPct(spike) >= 0.004;
  const fadeVol =
    (win[win.length - 2]?.volume ?? 0) < avg * 0.85 &&
    (win[win.length - 1]?.volume ?? 0) < avg * 0.9;
  return volSpike && bigRed && fadeVol;
}

function bullishMicroStructureBreak(candles5m: Candle[], candles1m: Candle[]): boolean {
  const c5 = closed(candles5m).slice(-4);
  if (c5.length < 3) return false;
  const higherCloses =
    c5[c5.length - 1]!.close > c5[c5.length - 2]!.close &&
    c5[c5.length - 2]!.close > c5[c5.length - 3]!.close;
  const c1 = closed(candles1m).slice(-5);
  const green1m = c1.filter((c) => c.close > c.open).length >= 3;
  return higherCloses && green1m;
}

function breakdownLevelReclaimed(candles15m: Candle[], support: number | null): boolean {
  if (support == null || !(support > 0)) return false;
  const win = closed(candles15m).slice(-4);
  if (win.length < 2) return false;
  const wasBelow = win.slice(0, -1).some((c) => c.close < support * 0.998);
  const last = win[win.length - 1]!;
  return wasBelow && last.close > support * 1.0015 && last.close > last.open;
}

function classifyShortEntryType(opts: {
  price: number;
  sr: ReturnType<typeof analyzeSrZones>;
  candles5m: Candle[];
  candles15m: Candle[];
  breakdownOk: boolean;
}): ShortEntryType {
  if (opts.breakdownOk) return 'BREAKDOWN_FOLLOWTHROUGH';

  const bearReject =
    opts.sr.nearResistance &&
    closed(opts.candles15m)
      .slice(-3)
      .some((c) => isBearishLongUpperWick(c) || (c.close < c.open && redBodyPct(c) >= 0.003));

  if (bearReject && opts.sr.pricePosition >= 0.42) {
    return 'RESISTANCE_REJECTION';
  }

  const prior = priorSwingSupport(opts.candles15m, 5);
  if (
    prior != null &&
    opts.price <= prior * 1.008 &&
    opts.price >= prior * 0.992 &&
    bearReject
  ) {
    return 'RETEST_BROKEN_SUPPORT';
  }

  if (
    prior != null &&
    opts.price < prior * 0.998 &&
    confirmedBreakdownThroughPriorSupport(opts.candles15m)
  ) {
    return 'RETEST_BROKEN_SUPPORT';
  }

  return 'NONE';
}

export function scoreShortEntryQuality(opts: {
  coin: string;
  price: number;
  candles1m: Candle[];
  candles5m: Candle[];
  candles15m: Candle[];
  candles1h: Candle[];
}): ShortEntryQualityResult {
  const cfg = config.hyperliquid.shortEntryQuality;
  const { coin, price, candles1m, candles5m, candles15m, candles1h } = opts;
  const measuredAt = new Date().toISOString();

  const baseRecord = (
    partial: Partial<ShortEntryQualityRecord>
  ): ShortEntryQualityRecord => ({
    coin,
    entryPrice: price,
    decision: 'BLOCK',
    entryType: 'NONE',
    distanceSupportAtr: null,
    distanceResistanceAtr: null,
    dumpExtensionAtr: null,
    reversalRiskScore: 0,
    reversalHardVeto: false,
    reversalSignals: [],
    blockCode: 'SHORT_QUALITY_DATA',
    blockReason: 'insufficient data',
    measuredAt,
    freshnessOk: false,
    structuralRefPx: null,
    ...partial,
  });

  if (
    candles1m.length < cfg.minCandles1m ||
    candles5m.length < cfg.minCandles5m ||
    candles15m.length < cfg.minCandles15m ||
    candles1h.length < cfg.minCandles1h
  ) {
    const rec = baseRecord({
      blockReason: 'SHORT blocked — fresh candle fetch insufficient for final quality check',
    });
    return {
      ok: false,
      code: 'SHORT_QUALITY_DATA',
      reason: rec.blockReason,
      record: rec,
    };
  }

  const sr = analyzeSrZones(candles15m, candles1h);
  const atr15 = calculateATR(candles15m, 14);
  const atr1h = calculateATR(candles1h, 14);
  const atr = atr15 > 0 ? atr15 : atr1h;
  if (!(atr > 0) || !(price > 0)) {
    const rec = baseRecord({
      blockReason: 'SHORT blocked — ATR unavailable for final quality check',
    });
    return {
      ok: false,
      code: 'SHORT_QUALITY_DATA',
      reason: rec.blockReason,
      record: rec,
    };
  }

  const dumpContinuation = isShortDumpContinuation({ candles15m, candles5m });
  const range1h = rangePosition(candles1h);
  const pressingLower5m = closed(candles5m)
    .slice(-3)
    .every((c, i, arr) => i === 0 || c.close <= arr[i - 1]!.close * 1.0003);
  const confirmedThrough = confirmedBreakdownThroughPriorSupport(candles15m);
  const range15m = rangePosition(candles15m);
  const strongBreakdown =
    confirmedThrough ||
    (sr.confirmedBreakdown && pressingLower5m && range15m > cfg.rangeLowMax + 0.05) ||
    (dumpContinuation &&
      pressingLower5m &&
      range1h > cfg.rangeLowMax + 0.05 &&
      range15m > cfg.rangeLowMax + 0.08);
  const supportPx = sr.support > 0 ? sr.support : priorSwingSupport(candles15m, 5);
  const pullbackRef = pullbackHighBeforeDump(candles5m);
  const structuralRef =
    strongBreakdown
      ? priorSwingSupport(candles15m, 5) ?? supportPx
      : pullbackRef ?? priorSwingSupport(candles15m, 5) ?? supportPx;

  const atRangeLow = range1h <= cfg.rangeLowMax;

  const distanceSupportAtr = atrDist(price, supportPx, atr);
  const distanceResistanceAtr = atrDist(price, sr.resistance, atr);
  const extensionFromRef =
    structuralRef != null && price < structuralRef
      ? (structuralRef - price) / atr
      : recentRedExtensionAtr(candles5m, atr, cfg.redExtensionBars5m);

  const red1mExt = recentRedExtensionAtr(candles1m, atr, cfg.redExtensionBars1m);
  const red5mExt = recentRedExtensionAtr(candles5m, atr, cfg.redExtensionBars5m);
  const extendedImpulse =
    red1mExt >= cfg.minRedExtensionAtr || red5mExt >= cfg.minRedExtensionAtr;

  const entryType = classifyShortEntryType({
    price,
    sr,
    candles5m,
    candles15m,
    breakdownOk: strongBreakdown,
  });

  const reversalSignals: string[] = [];
  let reversalScore = 0;

  if (bullishDivergence15m(candles15m)) {
    reversalSignals.push('bullish_rsi_divergence_15m');
    reversalScore += 28;
  }
  if (sellingClimaxThenFade(candles15m)) {
    reversalSignals.push('selling_climax_volume_fade');
    reversalScore += 22;
  }
  const wick1m = closed(candles1m).slice(-4).filter((c) => isBullishLongLowerWick(c)).length;
  const wick5m = closed(candles5m).slice(-3).filter((c) => isBullishLongLowerWick(c)).length;
  if (wick1m >= 2 || wick5m >= 1) {
    reversalSignals.push(`lower_wicks_1m=${wick1m}_5m=${wick5m}`);
    reversalScore += 12 + wick1m * 4;
  }
  if (bullishMicroStructureBreak(candles5m, candles1m)) {
    reversalSignals.push('bullish_1m_5m_structure_break');
    reversalScore += 35;
  }
  if (breakdownLevelReclaimed(candles15m, structuralRef)) {
    reversalSignals.push('breakdown_level_reclaimed');
    reversalScore += 40;
  }

  const hardVeto =
    reversalSignals.includes('breakdown_level_reclaimed') ||
    (reversalSignals.includes('bullish_1m_5m_structure_break') &&
      (reversalSignals.includes('bullish_rsi_divergence_15m') || wick1m >= 2)) ||
    (reversalSignals.includes('selling_climax_volume_fade') &&
      reversalSignals.includes('bullish_rsi_divergence_15m') &&
      wick1m >= 1);

  const record = baseRecord({
    freshnessOk: true,
    distanceSupportAtr,
    distanceResistanceAtr,
    dumpExtensionAtr: Number.isFinite(extensionFromRef)
      ? Number(extensionFromRef.toFixed(3))
      : null,
    reversalRiskScore: Math.min(100, reversalScore),
    reversalHardVeto: hardVeto,
    reversalSignals,
    entryType,
    structuralRefPx: structuralRef,
  });

  if (hardVeto) {
    record.decision = 'BLOCK';
    record.blockCode = 'SHORT_REVERSAL_VETO';
    record.blockReason = `SHORT blocked — confirmed bullish reversal (${reversalSignals.join(', ')})`;
    return { ok: false, code: 'SHORT_REVERSAL_VETO', reason: record.blockReason, record };
  }

  const chaseFar =
    extendedImpulse &&
    extensionFromRef >= cfg.maxChaseFromStructureAtr &&
    !strongBreakdown;

  const impulseAtLocalLow =
    extendedImpulse &&
    (range15m <= cfg.rangeLowMax || range1h <= cfg.rangeLowMax) &&
    !strongBreakdown;

  if (impulseAtLocalLow) {
    record.decision = 'BLOCK';
    record.blockCode = 'SHORT_EXTENDED_DUMP';
    record.blockReason =
      `SHORT blocked — extended red 1m/5m at local low (15m range ${(range15m * 100).toFixed(0)}%, 1h ${(range1h * 100).toFixed(0)}%) without confirmed breakdown hold`;
    return { ok: false, code: 'SHORT_EXTENDED_DUMP', reason: record.blockReason, record };
  }

  if (chaseFar) {
    record.decision = 'BLOCK';
    record.blockCode = 'SHORT_EXTENDED_DUMP';
    record.blockReason =
      `SHORT blocked — extended red impulse (1m ${red1mExt.toFixed(2)}×ATR, 5m ${red5mExt.toFixed(2)}×ATR) ` +
      `${extensionFromRef.toFixed(2)}×ATR below structure ref ${structuralRef?.toFixed(4) ?? 'n/a'}`;
    return { ok: false, code: 'SHORT_EXTENDED_DUMP', reason: record.blockReason, record };
  }

  const nearSupport =
    (distanceSupportAtr != null && distanceSupportAtr <= cfg.nearSupportAtr) ||
    (sr.nearSupport && range1h <= cfg.rangeLowMax);

  const pauseAtLow =
    atRangeLow &&
    !pressingLower5m &&
    (wick1m >= 1 || reversalScore >= 18);

  if (pauseAtLow && !strongBreakdown) {
    record.decision = 'BLOCK';
    record.blockCode = 'SHORT_SUPPORT_PROXIMITY';
    record.blockReason =
      `SHORT blocked — pause at 1h range low (${(range1h * 100).toFixed(0)}%) after impulse — no confirmed breakdown hold`;
    return { ok: false, code: 'SHORT_SUPPORT_PROXIMITY', reason: record.blockReason, record };
  }

  if (
    nearSupport &&
    !strongBreakdown &&
    entryType !== 'RETEST_BROKEN_SUPPORT'
  ) {
    record.decision = 'BLOCK';
    record.blockCode = 'SHORT_SUPPORT_PROXIMITY';
    record.blockReason =
      `SHORT blocked — ${distanceSupportAtr?.toFixed(2) ?? '?'}×ATR to 5m/15m support ` +
      `(range1h ${(range1h * 100).toFixed(0)}%) without breakdown follow-through`;
    return { ok: false, code: 'SHORT_SUPPORT_PROXIMITY', reason: record.blockReason, record };
  }

  if (
    distanceSupportAtr != null &&
    distanceResistanceAtr != null &&
    distanceSupportAtr <= cfg.poorDownsideRoomSupportAtr &&
    distanceResistanceAtr >= cfg.poorDownsideRoomUpsideAtr &&
    !strongBreakdown
  ) {
    record.decision = 'BLOCK';
    record.blockCode = 'SHORT_POOR_DOWNSIDE_ROOM';
    record.blockReason =
      `SHORT blocked — poor downside room (support ${distanceSupportAtr.toFixed(2)}×ATR vs upside ${distanceResistanceAtr.toFixed(2)}×ATR)`;
    return { ok: false, code: 'SHORT_POOR_DOWNSIDE_ROOM', reason: record.blockReason, record };
  }

  if (entryType === 'NONE') {
    record.decision = 'BLOCK';
    record.blockCode = 'SHORT_ENTRY_TYPE_NONE';
    record.blockReason =
      'SHORT blocked — no valid entry type (need breakdown follow-through, resistance rejection, or broken-support retest)';
    return { ok: false, code: 'SHORT_ENTRY_TYPE_NONE', reason: record.blockReason, record };
  }

  record.decision = 'PASS';
  record.blockCode = null;
  record.blockReason = `SHORT quality PASS — ${entryType} · support ${distanceSupportAtr?.toFixed(2) ?? '?'}×ATR · resistance ${distanceResistanceAtr?.toFixed(2) ?? '?'}×ATR · ext ${extensionFromRef.toFixed(2)}×ATR · reversalRisk ${reversalScore}`;
  return {
    ok: true,
    code: 'SHORT_QUALITY_PASS',
    reason: record.blockReason,
    record,
  };
}

function closed1mAgeMs(candles1m: Candle[], nowMs = Date.now()): number | null {
  const win = closed(candles1m);
  const last = win[win.length - 1];
  if (!last) return null;
  return nowMs - (last.time + 60_000);
}

async function loadShortQualityCandles(coin: string): Promise<{
  candles1m: Candle[];
  candles5m: Candle[];
  candles15m: Candle[];
  candles1h: Candle[];
}> {
  const cfg = config.hyperliquid.shortEntryQuality;
  const symbol = hlCoinToBinanceSymbol(coin.toUpperCase());
  const [candles1m, candles5m, candles15m, candles1h] = await Promise.all([
    signalEngine.fetchCandles(symbol, '1m', cfg.fetch1m),
    signalEngine.fetchCandles(symbol, '5m', cfg.fetch5m),
    signalEngine.fetchCandles(symbol, '15m', cfg.fetch15m),
    signalEngine.fetchCandles(symbol, '1h', cfg.fetch1h),
  ]);
  return { candles1m, candles5m, candles15m, candles1h };
}

/**
 * Immediately before HL order: fresh candles + mark; block on stale data or fail quality after drift.
 */
export async function evaluateShortEntryQualityPreSubmit(opts: {
  coin: string;
  markPxAtGate: number;
}): Promise<ShortEntryQualityResult & { markPx: number; reevaluated: boolean; candleAgeMs: number | null }> {
  const cfg = config.hyperliquid.shortEntryQuality;
  const coin = opts.coin.toUpperCase();
  const mids = await fetchHlAllMids();
  const liveMark = Number(mids[coin] ?? mids[`${coin}-PERP`] ?? 0);
  const markPx =
    liveMark > 0 && Number.isFinite(liveMark) ? liveMark : opts.markPxAtGate;
  const driftPct =
    opts.markPxAtGate > 0
      ? (Math.abs(markPx - opts.markPxAtGate) / opts.markPxAtGate) * 100
      : 0;
  const reevaluated = driftPct > cfg.maxMarkDriftPct;

  const { candles1m, candles5m, candles15m, candles1h } = await loadShortQualityCandles(coin);
  const candleAgeMs = closed1mAgeMs(candles1m);
  if (candleAgeMs != null && candleAgeMs > cfg.maxCandleStaleMs1m) {
    const measuredAt = new Date().toISOString();
    const record: ShortEntryQualityRecord = {
      coin,
      entryPrice: markPx,
      decision: 'BLOCK',
      entryType: 'NONE',
      distanceSupportAtr: null,
      distanceResistanceAtr: null,
      dumpExtensionAtr: null,
      reversalRiskScore: 0,
      reversalHardVeto: false,
      reversalSignals: [],
      blockCode: 'SHORT_QUALITY_DATA',
      blockReason: `SHORT blocked — stale 1m candles (${Math.round(candleAgeMs / 1000)}s old, max ${Math.round(cfg.maxCandleStaleMs1m / 1000)}s)`,
      measuredAt,
      freshnessOk: false,
      structuralRefPx: null,
    };
    return {
      ok: false,
      code: 'SHORT_QUALITY_DATA',
      reason: record.blockReason,
      record,
      markPx,
      reevaluated,
      candleAgeMs,
    };
  }

  const scored = scoreShortEntryQuality({
    coin,
    price: markPx,
    candles1m,
    candles5m,
    candles15m,
    candles1h,
  });
  if (reevaluated && scored.ok) {
    scored.reason = `${scored.reason} · mark drift ${driftPct.toFixed(3)}% re-checked at ${markPx}`;
    scored.record.blockReason = scored.reason;
  }
  return { ...scored, markPx, reevaluated, candleAgeMs };
}

export async function evaluateShortEntryQualityFinal(opts: {
  coin: string;
  markPx: number;
}): Promise<ShortEntryQualityResult> {
  const coin = opts.coin.toUpperCase();
  try {
    const { candles1m, candles5m, candles15m, candles1h } = await loadShortQualityCandles(coin);
    const price = opts.markPx > 0 ? opts.markPx : candles15m[candles15m.length - 1]?.close ?? 0;
    return scoreShortEntryQuality({
      coin,
      price,
      candles1m,
      candles5m,
      candles15m,
      candles1h,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const measuredAt = new Date().toISOString();
    const record: ShortEntryQualityRecord = {
      coin,
      entryPrice: opts.markPx,
      decision: 'BLOCK',
      entryType: 'NONE',
      distanceSupportAtr: null,
      distanceResistanceAtr: null,
      dumpExtensionAtr: null,
      reversalRiskScore: 0,
      reversalHardVeto: false,
      reversalSignals: [],
      blockCode: 'SHORT_FETCH_ERROR',
      blockReason: `SHORT blocked — final quality fetch failed (${msg.slice(0, 80)})`,
      measuredAt,
      freshnessOk: false,
      structuralRefPx: null,
    };
    return {
      ok: false,
      code: 'SHORT_FETCH_ERROR',
      reason: record.blockReason,
      record,
    };
  }
}

export function logShortEntryQualityRecord(record: ShortEntryQualityRecord): void {
  logger.info('short_entry_quality_record', {
    coin: record.coin,
    entryPrice: record.entryPrice,
    decision: record.decision,
    entryType: record.entryType,
    distanceSupportAtr: record.distanceSupportAtr,
    distanceResistanceAtr: record.distanceResistanceAtr,
    dumpExtensionAtr: record.dumpExtensionAtr,
    reversalRiskScore: record.reversalRiskScore,
    reversalHardVeto: record.reversalHardVeto,
    reversalSignals: record.reversalSignals,
    blockCode: record.blockCode,
    blockReason: record.blockReason,
    structuralRefPx: record.structuralRefPx,
    measuredAt: record.measuredAt,
    freshnessOk: record.freshnessOk,
  });
}