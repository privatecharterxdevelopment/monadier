/** Frontend mirror of bot-service mtfTimeframeWeight (5m vote vs timing role). */

export type H1TrendDirection = 'UP' | 'DOWN' | 'SIDEWAYS';

export function h1TrendFrom1hBar(tf1h?: { trend?: string; direction?: string }): H1TrendDirection {
  if (tf1h?.trend === 'UP' || tf1h?.direction === 'LONG') return 'UP';
  if (tf1h?.trend === 'DOWN' || tf1h?.direction === 'SHORT') return 'DOWN';
  return 'SIDEWAYS';
}

export function isTrendFollowing(
  tradeDirection: 'LONG' | 'SHORT',
  htfTrend1h: H1TrendDirection
): boolean {
  if (htfTrend1h === 'SIDEWAYS') return false;
  if (tradeDirection === 'LONG' && htfTrend1h === 'UP') return true;
  if (tradeDirection === 'SHORT' && htfTrend1h === 'DOWN') return true;
  return false;
}

export function fiveMinTooltip(
  mtfContext: 'trend_following' | 'reversal' | undefined,
  tf5mRole: 'vote' | 'timing_boost' | 'required' | undefined
): string | undefined {
  if (tf5mRole === 'timing_boost' || mtfContext === 'trend_following') {
    return 'Entry-Timing, kein Trend-Signal';
  }
  if (tf5mRole === 'required' || mtfContext === 'reversal') {
    return 'Pflicht-Bestätigung';
  }
  return undefined;
}
