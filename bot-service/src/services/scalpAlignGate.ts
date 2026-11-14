/**
 * Scalp open gate — 1m + 5m must agree with trade direction (no 1h-only entries).
 * TREND_LONG: 1m pullback allowed when 5m/15m/1h stay bullish and 5m structure holds.
 */
import { config } from '../config';
import { signalEngine, type Candle, type TimeframeAnalysis } from './signalEngine';
import { hlCoinToBinanceSymbol } from './hlSymbols';
import type { LongOpportunityClass } from './hlExecutionState';
import { detectStructure } from './preOpenCandleAnalytics';
import {
  confirmedBreakdownThroughPriorSupport,
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
  | 'SCALP_LONG_OVEREXTENDED';

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