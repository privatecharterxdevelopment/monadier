/** Trend-only entries — no counter-trend / dip-reversal opens. */

export type H1Trend = 'UP' | 'DOWN' | 'SIDEWAYS' | string;

export function normalizeH1Trend(raw: H1Trend | undefined | null): 'UP' | 'DOWN' | 'SIDEWAYS' {
  const t = String(raw ?? 'SIDEWAYS').toUpperCase();
  if (t.includes('DOWN')) return 'DOWN';
  if (t.includes('UP')) return 'UP';
  return 'SIDEWAYS';
}

export function isTrendOnlyLongAllowed(h1: H1Trend | undefined | null): boolean {
  return normalizeH1Trend(h1) === 'UP';
}

export function isTrendOnlyShortAllowed(h1: H1Trend | undefined | null): boolean {
  return normalizeH1Trend(h1) === 'DOWN';
}

export function trendOnlyBlockReason(
  direction: 'LONG' | 'SHORT',
  h1: H1Trend | undefined | null
): string | null {
  const norm = normalizeH1Trend(h1);
  if (direction === 'LONG' && norm !== 'UP') {
    return norm === 'DOWN'
      ? '1h downtrend — LONG blocked (trend-only, no dip reversal)'
      : '1h sideways — LONG blocked (trend-only)';
  }
  if (direction === 'SHORT' && norm !== 'DOWN') {
    return norm === 'UP'
      ? '1h uptrend — SHORT blocked (trend-only, no fade)'
      : '1h sideways — SHORT blocked (trend-only)';
  }
  return null;
}
