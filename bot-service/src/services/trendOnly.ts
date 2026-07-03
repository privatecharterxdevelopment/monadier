/** Trend-only entries — no counter-trend / dip-reversal opens. */

export type H1Trend = 'UP' | 'DOWN' | 'SIDEWAYS' | string;

export function normalizeH1Trend(raw: H1Trend | undefined | null): 'UP' | 'DOWN' | 'SIDEWAYS' {
  const t = String(raw ?? 'SIDEWAYS').toUpperCase();
  if (t.includes('DOWN')) return 'DOWN';
  if (t.includes('UP')) return 'UP';
  return 'SIDEWAYS';
}

/** Macro bias for trend-only entries — 1h label + 15m + TF votes + price drift. */
export function computeTradeTrend(opts: {
  h1Trend?: H1Trend | null;
  m15Trend?: H1Trend | null;
  shortTfVotes?: number;
  longTfVotes?: number;
  change1hPct?: number;
  change15mPct?: number;
}): 'UP' | 'DOWN' | 'SIDEWAYS' {
  const h1 = normalizeH1Trend(opts.h1Trend);
  // 1h macro trend is authoritative — never fade a pump or catch a falling knife on lower-TF noise.
  if (h1 === 'UP') return 'UP';
  if (h1 === 'DOWN') return 'DOWN';

  const m15 = normalizeH1Trend(opts.m15Trend);
  const shortVotes = opts.shortTfVotes ?? 0;
  const longVotes = opts.longTfVotes ?? 0;
  const c1h = opts.change1hPct ?? 0;
  const c15 = opts.change15mPct ?? 0;

  if (c1h > 0.12 && c15 > -0.06) return 'UP';
  if (c1h < -0.12 && c15 < 0.06) return 'DOWN';

  if (m15 === 'DOWN' && shortVotes >= longVotes && shortVotes >= 2 && c1h <= 0.08 && c15 <= 0.04) {
    return 'DOWN';
  }
  if (m15 === 'UP' && longVotes >= shortVotes && longVotes >= 2 && c1h >= -0.08 && c15 >= -0.04) {
    return 'UP';
  }

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
