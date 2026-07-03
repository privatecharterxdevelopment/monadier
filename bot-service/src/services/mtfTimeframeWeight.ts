/**
 * Asymmetric 5m weighting: trend-following vs reversal (vs 1h macro trend).
 * Used by signalEngine + analyzeMarketMTFBySymbol (global scan path).
 */
import type { SignalDirection, TimeframeAnalysis } from './signalEngine';

export type H1TrendDirection = 'UP' | 'DOWN' | 'SIDEWAYS';

type TfVote = { timeframe: string; direction: SignalDirection | string };

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

/** Vote slots for "X TFs aligned" — 5m excluded when trend-following. */
export function computeDirectionalTfCount(
  timeframes: TfVote[],
  tradeDirection: 'LONG' | 'SHORT',
  htfTrend1h: H1TrendDirection
): number {
  const following = isTrendFollowing(tradeDirection, htfTrend1h);
  if (following) {
    return timeframes.filter(
      (tf) =>
        (tf.timeframe === '15m' || tf.timeframe === '1h') &&
        tf.direction === tradeDirection
    ).length;
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
}): { ok: boolean; directionalTfCount: number; trendFollowing: boolean } {
  const trendFollowing = isTrendFollowing(opts.tradeDirection, opts.htfTrend1h);
  const directionalTfCount = computeDirectionalTfCount(
    opts.timeframes,
    opts.tradeDirection,
    opts.htfTrend1h
  );
  const reversalOk =
    trendFollowing || meetsReversalTfRequirement(opts.timeframes, opts.tradeDirection);
  const countOk = directionalTfCount >= opts.minDirectionalTfs;
  return {
    ok: countOk && reversalOk,
    directionalTfCount,
    trendFollowing,
  };
}
