/**
 * Asymmetric 5m weighting: trend-following vs reversal (vs 1h macro trend).
 * Used by signalEngine + analyzeMarketMTFBySymbol (global scan path).
 */
import type { SignalDirection, TimeframeAnalysis } from './signalEngine';

export type H1TrendDirection = 'UP' | 'DOWN' | 'SIDEWAYS';
export type MacroTrend = 'UP' | 'DOWN' | 'SIDEWAYS';

type TfVote = { timeframe: string; direction: SignalDirection | string };

export type MacroMtfContext = {
  macroTrend: MacroTrend;
  h1Confidence?: number;
  h1Direction?: SignalDirection | string;
};

/** Defaults mirrored in config.hyperliquid.macroMtfAnchor (env-overridable in production). */
export const MACRO_MTF_DEFAULTS = {
  minH1Confidence: 65,
  h1WeightBoost: 1.75,
  counter15mWeight: 0.25,
  counter5mWeight: 0.08,
  aligned5mWeight: 0.2,
  confidenceBoost: 8,
  conflictingPenalty: 3,
  minDirectionalTfs: 2,
} as const;

export type MacroMtfSettings = {
  minH1Confidence: number;
  h1WeightBoost: number;
  counter15mWeight: number;
  counter5mWeight: number;
  aligned5mWeight: number;
  confidenceBoost: number;
  conflictingPenalty: number;
  minDirectionalTfs: number;
};

/** Map computeTradeTrend / 1h bar trend to macro direction. */
export function h1TrendFromTradeTrend(tradeTrend: string): H1TrendDirection {
  if (tradeTrend === 'UP') return 'UP';
  if (tradeTrend === 'DOWN') return 'DOWN';
  return 'SIDEWAYS';
}

export function h1TrendFrom1hBar(tf1h?: { trend?: string; direction?: string }): H1TrendDirection {
  if (tf1h?.trend === 'UP' || tf1h?.direction === 'LONG') return 'UP';
  if (tf1h?.trend === 'DOWN' || tf1h?.direction === 'SHORT') return 'DOWN';
  return 'SIDEWAYS';
}

/** Trade direction matches macro 1h trend → trend-following; else reversal/counter-trend. */
export function isTrendFollowing(
  tradeDirection: 'LONG' | 'SHORT',
  htfTrend1h: H1TrendDirection
): boolean {
  if (htfTrend1h === 'SIDEWAYS') return false;
  if (tradeDirection === 'LONG' && htfTrend1h === 'UP') return true;
  if (tradeDirection === 'SHORT' && htfTrend1h === 'DOWN') return true;
  return false;
}

/** 1h macro confirms pump/dump — lower TFs may show pullback without blocking alignment. */
export function isMacroTrendAnchor(opts: {
  tradeDirection: 'LONG' | 'SHORT';
  htfTrend1h: H1TrendDirection;
  macroTrend: MacroTrend;
  h1Direction?: SignalDirection | string;
  h1Confidence?: number;
  settings?: MacroMtfSettings;
}): boolean {
  const cfg = opts.settings ?? MACRO_MTF_DEFAULTS;
  if (!opts.h1Confidence || opts.h1Confidence < cfg.minH1Confidence) return false;
  if (opts.h1Direction !== opts.tradeDirection) return false;
  if (!isTrendFollowing(opts.tradeDirection, opts.htfTrend1h)) return false;
  if (opts.tradeDirection === 'LONG' && opts.macroTrend === 'UP') return true;
  if (opts.tradeDirection === 'SHORT' && opts.macroTrend === 'DOWN') return true;
  return false;
}

/** Weight multipliers during macro pump/dump — damp counter-TF noise, boost 1h anchor. */
export function macroTrendWeightMultipliers(opts: {
  timeframe: string;
  tfDirection: SignalDirection | string;
  tradeDirection: 'LONG' | 'SHORT';
  macroAnchor: boolean;
  settings?: MacroMtfSettings;
}): { trendMult: number; entryMult: number } {
  if (!opts.macroAnchor) return { trendMult: 1, entryMult: 1 };
  const cfg = opts.settings ?? MACRO_MTF_DEFAULTS;
  const { timeframe, tfDirection, tradeDirection } = opts;
  const aligned = tfDirection === tradeDirection;
  const counter =
    (tradeDirection === 'LONG' && tfDirection === 'SHORT') ||
    (tradeDirection === 'SHORT' && tfDirection === 'LONG');

  if (timeframe === '1h' && aligned) {
    return { trendMult: cfg.h1WeightBoost, entryMult: cfg.h1WeightBoost * 0.85 };
  }
  if (timeframe === '15m' && counter) {
    return { trendMult: cfg.counter15mWeight, entryMult: cfg.counter15mWeight };
  }
  if (timeframe === '5m' && counter) {
    return { trendMult: cfg.counter5mWeight, entryMult: cfg.counter5mWeight };
  }
  if (timeframe === '5m' && aligned) {
    return { trendMult: cfg.aligned5mWeight, entryMult: cfg.aligned5mWeight };
  }
  return { trendMult: 1, entryMult: 1 };
}

/** Vote slots for "X TFs aligned" — 5m excluded when trend-following. */
export function computeDirectionalTfCount(
  timeframes: TfVote[],
  tradeDirection: 'LONG' | 'SHORT',
  htfTrend1h: H1TrendDirection,
  ctx?: MacroMtfContext,
  settings?: MacroMtfSettings
): number {
  const cfg = settings ?? MACRO_MTF_DEFAULTS;
  const following = isTrendFollowing(tradeDirection, htfTrend1h);
  if (following) {
    const tf1h = timeframes.find((t) => t.timeframe === '1h');
    const count = timeframes.filter(
      (tf) =>
        (tf.timeframe === '15m' || tf.timeframe === '1h') &&
        tf.direction === tradeDirection
    ).length;
    if (
      ctx &&
      isMacroTrendAnchor({
        tradeDirection,
        htfTrend1h,
        macroTrend: ctx.macroTrend,
        h1Direction: ctx.h1Direction ?? tf1h?.direction,
        h1Confidence: ctx.h1Confidence,
      }) &&
      tf1h?.direction === tradeDirection
    ) {
      return Math.max(count, cfg.minDirectionalTfs);
    }
    return count;
  }
  let count = 0;
  const tf5 = timeframes.find((t) => t.timeframe === '5m');
  const tf15 = timeframes.find((t) => t.timeframe === '15m');
  if (tf5?.direction === tradeDirection) count += 1;
  if (tf15?.direction === tradeDirection) count += 1;
  return count;
}

/** Reversal entries require both 5m and 15m confirming the trade direction. */
export function meetsReversalTfRequirement(
  timeframes: TfVote[],
  tradeDirection: 'LONG' | 'SHORT'
): boolean {
  const tf5 = timeframes.find((t) => t.timeframe === '5m');
  const tf15 = timeframes.find((t) => t.timeframe === '15m');
  return tf5?.direction === tradeDirection && tf15?.direction === tradeDirection;
}

/** Trend-following: small boost when 5m confirms pullback entry (not a vote). */
export function applyTrendFollow5mConfidenceBoost(
  confidence: number,
  tf5: TimeframeAnalysis | undefined,
  tradeDirection: 'LONG' | 'SHORT'
): number {
  if (!tf5 || tf5.direction !== tradeDirection) return confidence;
  const rsi = tf5.rsi;
  const pullbackOk =
    tradeDirection === 'LONG'
      ? rsi >= 35 && rsi <= 62
      : rsi >= 38 && rsi <= 65;
  if (!pullbackOk) return confidence;
  return Math.min(100, Math.round(confidence + 4));
}

/** Entry weight multiplier for 5m in weighted score (trend-following only). */
export function fiveMinEntryWeightMultiplier(
  tradeDirection: 'LONG' | 'SHORT',
  htfTrend1h: H1TrendDirection
): number {
  return isTrendFollowing(tradeDirection, htfTrend1h) ? 0.15 : 1;
}

export function passesMtfAlignmentGate(opts: {
  timeframes: TfVote[];
  tradeDirection: 'LONG' | 'SHORT';
  htfTrend1h: H1TrendDirection;
  minDirectionalTfs: number;
  macroTrend?: MacroTrend;
  h1Confidence?: number;
  h1Direction?: SignalDirection | string;
  settings?: MacroMtfSettings;
}): { ok: boolean; directionalTfCount: number; trendFollowing: boolean; macroAnchor: boolean } {
  const cfg = opts.settings ?? MACRO_MTF_DEFAULTS;
  const trendFollowing = isTrendFollowing(opts.tradeDirection, opts.htfTrend1h);
  const macroTrend = opts.macroTrend ?? 'SIDEWAYS';
  const macroAnchor = isMacroTrendAnchor({
    tradeDirection: opts.tradeDirection,
    htfTrend1h: opts.htfTrend1h,
    macroTrend,
    h1Direction: opts.h1Direction,
    h1Confidence: opts.h1Confidence,
    settings: cfg,
  });
  const directionalTfCount = computeDirectionalTfCount(
    opts.timeframes,
    opts.tradeDirection,
    opts.htfTrend1h,
    {
      macroTrend,
      h1Confidence: opts.h1Confidence,
      h1Direction: opts.h1Direction,
    },
    cfg
  );
  const reversalOk =
    trendFollowing || meetsReversalTfRequirement(opts.timeframes, opts.tradeDirection);
  const countOk = directionalTfCount >= opts.minDirectionalTfs || macroAnchor;
  return {
    ok: countOk && reversalOk,
    directionalTfCount,
    trendFollowing,
    macroAnchor,
  };
}
