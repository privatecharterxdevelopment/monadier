/**
 * Scalp open gate — 1m + 5m must agree with trade direction (no 1h-only entries).
 * TREND_LONG: 1m pullback allowed when 5m/15m/1h stay bullish and 5m structure holds.
 * MTF SHORT: 1m HOLD / mild LONG pullback allowed when 5m/15m/1h stay bearish and 5m holds.
 */
import { config } from '../config';
import { signalEngine, type Candle, type TimeframeAnalysis } from './signalEngine';
import { hlCoinToBinanceSymbol } from './hlSymbols';
import type { LongOpportunityClass } from './hlExecutionState';
import { detectStructure } from './preOpenCandleAnalytics';
import {
  confirmedBreakdownThroughPriorSupport,
  confirmedBreakoutThroughPriorResistance,
  isLongRallyContinuation,
  isShortDumpContinuation,
} from './shortDumpStructure';

export type ScalpBlockCode =
  | 'SCALP_DISABLED'
  | 'SCALP_1M_MISALIGN'
  | 'SCALP_5M_MISALIGN'
  | 'SCALP_1M_CONFIRM'
  | 'SCALP_FETCH_ERROR'
  | 'SCALP_PASS'
  | 'SCALP_LONG_DUMP_BLOCK'
  | 'SCALP_LONG_STRUCTURE_BREAK'
  | 'SCALP_LONG_HTF_BLOCK'
  | 'SCALP_LONG_OVEREXTENDED'
  | 'SCALP_SHORT_PUMP_BLOCK'
  | 'SCALP_SHORT_STRUCTURE_BREAK'
  | 'SCALP_SHORT_HTF_BLOCK'
  | 'SCALP_SHORT_1M_REVERSAL';

export type ScalpAlignResult = {
  ok: boolean;
  code: ScalpBlockCode;
  reason: string;
  tf1m?: string;
  tf5m?: string;
};

function lastNCandlesMove(candles: Candle[], n: number, direction: 'LONG' | 'SHORT'): boolean {
  const closed = candles.slice(-n - 1, -1);
  if (closed.length < n) return false;
  if (direction === 'LONG') {
    return closed.every((c) => c.close >= c.open * 0.9999);
  }
  return closed.every((c) => c.close <= c.open * 1.0001);
}

function labelTf(tf: TimeframeAnalysis): string {
  return `${tf.direction} ${Math.round(tf.confidence)}%`;
}

function closedCandles(candles: Candle[]): Candle[] {
  if (candles.length <= 1) return candles;
  return candles.slice(0, -1);
}

/**
 * Explosive bullish move on the **forming** 1m bar (or last closed + live sprint).
 * Complements fresh_pump (15m/1h) and pre_open (closed window only) — no duplicate cooldown.
 */
export function isExplosive1mBullishImpulse(candles: Candle[]): boolean {
  if (candles.length < 3) return false;
  const forming = candles[candles.length - 1]!;
  const closed = closedCandles(candles);
  if (forming.open <= 0) return false;

  const liveMovePct = ((forming.close - forming.open) / forming.open) * 100;
  const liveHighPct = ((forming.high - forming.open) / forming.open) * 100;
  const rangePct = ((forming.high - forming.low) / forming.open) * 100;

  const volWindow = closed.slice(-8);
  const avgVol =
    volWindow.length > 0
      ? volWindow.reduce((s, c) => s + c.volume, 0) / volWindow.length
      : forming.volume;
  const volSpike = avgVol > 0 && forming.volume >= avgVol * 2.2;

  const strongLiveBody =
    forming.close >= forming.open &&
    liveMovePct >= 0.28 &&
    forming.close >= forming.high - (forming.high - forming.low) * 0.15;

  if (volSpike && (liveHighPct >= 0.22 || liveMovePct >= 0.18)) return true;
  if (liveHighPct >= 0.55 || liveMovePct >= 0.45) return true;
  if (strongLiveBody && rangePct >= 0.35) return true;

  const lastClosed = closed[closed.length - 1];
  if (lastClosed?.open && lastClosed.open > 0) {
    const sprintPct = ((forming.close - lastClosed.open) / lastClosed.open) * 100;
    if (sprintPct >= 0.65 && forming.close >= forming.open) return true;
    if (sprintPct >= 0.9) return true;
  }

  const microBreak = confirmedBreakoutThroughPriorResistance(candles, {
    confirmBars: 1,
    excludeLastClosed: 2,
  });
  if (microBreak && forming.close > forming.open && liveMovePct >= 0.12) return true;

  return false;
}

function tapeStillPumping(candles: Candle[], lookback = 5): boolean {
  const closed = closedCandles(candles);
  if (closed.length < lookback) return false;
  const slice = closed.slice(-lookback);
  const green = slice.filter((c) => c.close > c.open).length;
  const first = slice[0]!;
  const last = slice[slice.length - 1]!;
  const netPct = first.open > 0 ? ((last.close - first.open) / first.open) * 100 : 0;
  const higherHigh = last.high >= Math.max(...slice.map((c) => c.high)) * 0.9999;
  return (green >= 4 || (green >= 3 && netPct > 0.08) || netPct >= 0.25) && higherHigh;
}

function tapeStillDumping(candles: Candle[], lookback = 5): boolean {
  const closed = closedCandles(candles);
  if (closed.length < lookback) return false;
  const slice = closed.slice(-lookback);
  const red = slice.filter((c) => c.close < c.open).length;
  const first = slice[0]!;
  const last = slice[slice.length - 1]!;
  const netPct = first.open > 0 ? ((last.close - first.open) / first.open) * 100 : 0;
  const lowerLow = last.low <= Math.min(...slice.map((c) => c.low)) * 1.0001;
  return (red >= 4 || (red >= 3 && netPct < -0.08) || netPct <= -0.25) && lowerLow;
}

function isHigherTfBullish(tf: TimeframeAnalysis, minConf: number): boolean {
  if (tf.direction === 'SHORT') return false;
  if (tf.trend === 'DOWN') return false;
  if (tf.confidence < minConf) return false;
  return tf.direction === 'LONG' || tf.trend === 'UP';
}

function isHigherTfBearish(tf: TimeframeAnalysis, minConf: number): boolean {
  if (tf.direction === 'LONG') return false;
  if (tf.trend === 'UP') return false;
  if (tf.confidence < minConf) return false;
  return tf.direction === 'SHORT' || tf.trend === 'DOWN';
}

function isMtfShortBearishStack(
  tf5m: TimeframeAnalysis,
  tf15m: TimeframeAnalysis,
  tf1h: TimeframeAnalysis,
  minConf: number
): boolean {
  return (
    tf5m.direction === 'SHORT' &&
    tf5m.confidence >= minConf &&
    isHigherTfBearish(tf15m, minConf) &&
    isHigherTfBearish(tf1h, minConf)
  );
}

/** Aggressive 1m print — 5m/15m/1h may read HOLD with trend DOWN (not full MTF SHORT label). */
function isAggressiveShortScalpContext(
  tf5m: TimeframeAnalysis,
  tf15m: TimeframeAnalysis,
  tf1h: TimeframeAnalysis,
  minConf: number
): boolean {
  const floor = Math.min(minConf, 48);
  const bearishTf = (tf: TimeframeAnalysis) =>
    tf.confidence >= floor && (tf.direction === 'SHORT' || tf.trend === 'DOWN');
  return bearishTf(tf5m) && bearishTf(tf15m) && bearishTf(tf1h);
}

export type TrendLongScalpInputs = {
  coin: string;
  tf1m: TimeframeAnalysis;
  tf5m: TimeframeAnalysis;
  tf15m: TimeframeAnalysis;
  tf1h: TimeframeAnalysis;
  c1m: Candle[];
  c5m: Candle[];
  c15m: Candle[];
  minConf: number;
  minConfirm1mCandles: number;
  longClass?: LongOpportunityClass | null;
};

/** Pure TREND_LONG scalp rules (unit-tested). */
export function evaluateTrendLongScalp1m(inputs: TrendLongScalpInputs): ScalpAlignResult {
  const coin = inputs.coin.toUpperCase();
  const label1m = labelTf(inputs.tf1m);
  const label5m = labelTf(inputs.tf5m);

  if (inputs.longClass === 'OVEREXTENDED_LONG') {
    return {
      ok: false,
      code: 'SCALP_LONG_OVEREXTENDED',
      reason: `Scalp blocked — ${coin} LONG_OVEREXTENDED (no chase)`,
      tf1m: label1m,
      tf5m: label5m,
    };
  }

  const activeDump =
    isShortDumpContinuation({ candles15m: inputs.c15m, candles5m: inputs.c5m }) ||
    tapeStillDumping(inputs.c5m) ||
    tapeStillDumping(inputs.c15m);
  if (activeDump) {
    return {
      ok: false,
      code: 'SCALP_LONG_DUMP_BLOCK',
      reason: `Scalp blocked — ${coin} TREND_LONG: active dump / bearish tape on 5m–15m`,
      tf1m: label1m,
      tf5m: label5m,
    };
  }

  const bearish5mBreak = confirmedBreakdownThroughPriorSupport(inputs.c5m);
  const structure5m = detectStructure(closedCandles(inputs.c5m).slice(-12));
  if (bearish5mBreak || structure5m === 'down') {
    return {
      ok: false,
      code: 'SCALP_LONG_STRUCTURE_BREAK',
      reason: bearish5mBreak
        ? `Scalp blocked — ${coin} TREND_LONG: confirmed bearish 5m structure break`
        : `Scalp blocked — ${coin} TREND_LONG: 5m structure down`,
      tf1m: label1m,
      tf5m: label5m,
    };
  }

  if (
    inputs.tf5m.direction !== 'LONG' ||
    inputs.tf5m.confidence < inputs.minConf
  ) {
    return {
      ok: false,
      code: 'SCALP_5M_MISALIGN',
      reason: `Scalp blocked — ${coin} LONG needs 5m aligned (got ${label5m})`,
      tf1m: label1m,
      tf5m: label5m,
    };
  }

  if (
    !isHigherTfBullish(inputs.tf15m, inputs.minConf) ||
    !isHigherTfBullish(inputs.tf1h, inputs.minConf)
  ) {
    return {
      ok: false,
      code: 'SCALP_LONG_HTF_BLOCK',
      reason: `Scalp blocked — ${coin} TREND_LONG needs 15m/1h bullish (15m ${labelTf(inputs.tf15m)}, 1h ${labelTf(inputs.tf1h)})`,
      tf1m: label1m,
      tf5m: label5m,
    };
  }

  const tf1mAligned =
    inputs.tf1m.direction === 'LONG' && inputs.tf1m.confidence >= inputs.minConf;
  const tf1mConfirm =
    tf1mAligned &&
    lastNCandlesMove(inputs.c1m, inputs.minConfirm1mCandles, 'LONG');

  if (tf1mConfirm) {
    return {
      ok: true,
      code: 'SCALP_PASS',
      reason: `Scalp aligned — ${coin} LONG · 1m ${label1m} · 5m ${label5m}`,
      tf1m: label1m,
      tf5m: label5m,
    };
  }

  return {
    ok: true,
    code: 'SCALP_PASS',
    reason:
      `Scalp TREND_LONG pullback — ${coin}: 1m ${label1m} allowed · 5m ${label5m} · ` +
      `15m/1h bullish · 5m structure ${structure5m}`,
    tf1m: label1m,
    tf5m: label5m,
  };
}

export type TrendShortScalpInputs = {
  coin: string;
  tf1m: TimeframeAnalysis;
  tf5m: TimeframeAnalysis;
  tf15m: TimeframeAnalysis;
  tf1h: TimeframeAnalysis;
  c1m: Candle[];
  c5m: Candle[];
  c15m: Candle[];
  minConf: number;
  minConfirm1mCandles: number;
  allow5mTrendDown?: boolean;
};

/** Pure MTF SHORT scalp rules (unit-tested). */
export function evaluateTrendShortScalp1m(inputs: TrendShortScalpInputs): ScalpAlignResult {
  const coin = inputs.coin.toUpperCase();
  const label1m = labelTf(inputs.tf1m);
  const label5m = labelTf(inputs.tf5m);

  if (isExplosive1mBullishImpulse(inputs.c1m)) {
    return {
      ok: false,
      code: 'SCALP_SHORT_PUMP_BLOCK',
      reason: `Scalp blocked — ${coin} SHORT: live 1m bullish impulse (forming candle / sprint)`,
      tf1m: label1m,
      tf5m: label5m,
    };
  }

  const activePump =
    isLongRallyContinuation({ candles15m: inputs.c15m, candles5m: inputs.c5m }) ||
    tapeStillPumping(inputs.c1m) ||
    tapeStillPumping(inputs.c5m) ||
    tapeStillPumping(inputs.c15m);
  if (activePump) {
    return {
      ok: false,
      code: 'SCALP_SHORT_PUMP_BLOCK',
      reason: `Scalp blocked — ${coin} SHORT: active rally / bullish tape on 1m–15m`,
      tf1m: label1m,
      tf5m: label5m,
    };
  }

  const bullish5mBreak = confirmedBreakoutThroughPriorResistance(inputs.c5m);
  const structure5m = detectStructure(closedCandles(inputs.c5m).slice(-12));
  if (bullish5mBreak || structure5m === 'up') {
    return {
      ok: false,
      code: 'SCALP_SHORT_STRUCTURE_BREAK',
      reason: bullish5mBreak
        ? `Scalp blocked — ${coin} SHORT: confirmed bullish 5m structure break`
        : `Scalp blocked — ${coin} SHORT: 5m structure up`,
      tf1m: label1m,
      tf5m: label5m,
    };
  }

  const tf5mShort =
    inputs.tf5m.direction === 'SHORT' && inputs.tf5m.confidence >= inputs.minConf;
  const tf5mTrendDown =
    inputs.allow5mTrendDown &&
    inputs.tf5m.trend === 'DOWN' &&
    inputs.tf5m.confidence >= Math.min(inputs.minConf, 48);
  if (!tf5mShort && !tf5mTrendDown) {
    return {
      ok: false,
      code: 'SCALP_5M_MISALIGN',
      reason: `Scalp blocked — ${coin} SHORT needs 5m aligned (got ${label5m})`,
      tf1m: label1m,
      tf5m: label5m,
    };
  }

  const htfMinConf = inputs.allow5mTrendDown
    ? Math.min(inputs.minConf, 48)
    : inputs.minConf;
  if (
    !isHigherTfBearish(inputs.tf15m, htfMinConf) ||
    !isHigherTfBearish(inputs.tf1h, htfMinConf)
  ) {
    return {
      ok: false,
      code: 'SCALP_SHORT_HTF_BLOCK',
      reason: `Scalp blocked — ${coin} SHORT needs 15m/1h bearish (15m ${labelTf(inputs.tf15m)}, 1h ${labelTf(inputs.tf1h)})`,
      tf1m: label1m,
      tf5m: label5m,
    };
  }

  const tf1mAligned =
    inputs.tf1m.direction === 'SHORT' && inputs.tf1m.confidence >= inputs.minConf;
  const tf1mConfirm =
    tf1mAligned &&
    lastNCandlesMove(inputs.c1m, inputs.minConfirm1mCandles, 'SHORT');

  if (tf1mConfirm) {
    return {
      ok: true,
      code: 'SCALP_PASS',
      reason: `Scalp aligned — ${coin} SHORT · 1m ${label1m} · 5m ${label5m}`,
      tf1m: label1m,
      tf5m: label5m,
    };
  }

  const reversalConfirmBars = Math.max(2, inputs.minConfirm1mCandles);
  const bullish1mFollow =
    inputs.tf1m.direction === 'LONG' &&
    inputs.tf1m.confidence >= inputs.minConf &&
    lastNCandlesMove(inputs.c1m, reversalConfirmBars, 'LONG');
  if (bullish1mFollow) {
    return {
      ok: false,
      code: 'SCALP_SHORT_1M_REVERSAL',
      reason: `Scalp blocked — ${coin} SHORT: 1m bullish follow-through (not a pullback)`,
      tf1m: label1m,
      tf5m: label5m,
    };
  }

  return {
    ok: true,
    code: 'SCALP_PASS',
    reason:
      `Scalp MTF SHORT pause — ${coin}: 1m ${label1m} allowed · 5m ${label5m} · ` +
      `15m/1h bearish · 5m structure ${structure5m}`,
    tf1m: label1m,
    tf5m: label5m,
  };
}

function evaluateStrictScalp(
  coin: string,
  direction: 'LONG' | 'SHORT',
  tf1m: TimeframeAnalysis,
  tf5m: TimeframeAnalysis,
  c1m: Candle[],
  minConf: number,
  minConfirm1mCandles: number
): ScalpAlignResult {
  const label1m = labelTf(tf1m);
  const label5m = labelTf(tf5m);

  if (tf1m.direction !== direction || tf1m.confidence < minConf) {
    return {
      ok: false,
      code: 'SCALP_1M_MISALIGN',
      reason: `Scalp blocked — ${coin} ${direction} needs 1m aligned (got ${label1m})`,
      tf1m: label1m,
      tf5m: label5m,
    };
  }

  if (tf5m.direction !== direction || tf5m.confidence < minConf) {
    return {
      ok: false,
      code: 'SCALP_5M_MISALIGN',
      reason: `Scalp blocked — ${coin} ${direction} needs 5m aligned (got ${label5m})`,
      tf1m: label1m,
      tf5m: label5m,
    };
  }

  if (!lastNCandlesMove(c1m, minConfirm1mCandles, direction)) {
    return {
      ok: false,
      code: 'SCALP_1M_CONFIRM',
      reason: `Scalp blocked — ${coin} ${direction} needs ${minConfirm1mCandles}× 1m candles confirming`,
      tf1m: label1m,
      tf5m: label5m,
    };
  }

  return {
    ok: true,
    code: 'SCALP_PASS',
    reason: `Scalp aligned — ${coin} ${direction} · 1m ${label1m} · 5m ${label5m}`,
    tf1m: label1m,
    tf5m: label5m,
  };
}

export async function validateScalpAlignment(opts: {
  coin: string;
  direction: 'LONG' | 'SHORT';
  longClass?: LongOpportunityClass | null;
  aggressiveScalp?: boolean;
}): Promise<ScalpAlignResult> {
  const cfg = config.hyperliquid.scalpOpen;
  if (!cfg.require1m5mAlign) {
    return { ok: true, code: 'SCALP_DISABLED', reason: 'Scalp align — check disabled' };
  }

  const coin = opts.coin.toUpperCase();
  const symbol = hlCoinToBinanceSymbol(coin);

  try {
    const [tf1m, tf5m, tf15m, tf1h, c1m, c5m, c15m] = await Promise.all([
      signalEngine.analyzeTimeframe(symbol, '1m'),
      signalEngine.analyzeTimeframe(symbol, '5m'),
      signalEngine.analyzeTimeframe(symbol, '15m'),
      signalEngine.analyzeTimeframe(symbol, '1h'),
      signalEngine.fetchCandles(symbol, '1m', 12),
      signalEngine.fetchCandles(symbol, '5m', 24),
      signalEngine.fetchCandles(symbol, '15m', 24),
    ]);

    const minConf = cfg.minTfConfidence;

    if (opts.direction === 'LONG' && opts.longClass === 'TREND_LONG') {
      return evaluateTrendLongScalp1m({
        coin,
        tf1m,
        tf5m,
        tf15m,
        tf1h,
        c1m,
        c5m,
        c15m,
        minConf,
        minConfirm1mCandles: cfg.minConfirm1mCandles,
        longClass: opts.longClass,
      });
    }

  const trendShortCtx =
      opts.direction === 'SHORT' &&
      (isMtfShortBearishStack(tf5m, tf15m, tf1h, minConf) ||
        (opts.aggressiveScalp && isAggressiveShortScalpContext(tf5m, tf15m, tf1h, minConf)));

    if (trendShortCtx) {
      return evaluateTrendShortScalp1m({
        coin,
        tf1m,
        tf5m,
        tf15m,
        tf1h,
        c1m,
        c5m,
        c15m,
        minConf,
        minConfirm1mCandles: cfg.minConfirm1mCandles,
        allow5mTrendDown: opts.aggressiveScalp,
      });
    }

    return evaluateStrictScalp(
      coin,
      opts.direction,
      tf1m,
      tf5m,
      c1m,
      minConf,
      cfg.minConfirm1mCandles
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      code: 'SCALP_FETCH_ERROR',
      reason: `Scalp align check failed — open blocked (${msg.slice(0, 60)})`,
    };
  }
}