import type { HlInterval } from './types';

/** Bars on screen — fewer on 1m = wider, readable candles. */
export const CHART_VISIBLE_BARS: Record<HlInterval, number> = {
  '1m': 48,
  '5m': 64,
  '15m': 72,
  '1h': 84,
  '4h': 96,
  '1d': 120,
};

/** HL candleSnapshot lookback — avoid loading 7d of 1m (10k+ squashed bars). */
export function chartLookbackMs(interval: HlInterval): number {
  switch (interval) {
    case '1m':
      return 6 * 60 * 60 * 1000;
    case '5m':
      return 36 * 60 * 60 * 1000;
    case '15m':
      return 5 * 24 * 60 * 60 * 1000;
    case '1h':
      return 14 * 24 * 60 * 60 * 1000;
    case '4h':
      return 30 * 24 * 60 * 60 * 1000;
    default:
      return 90 * 24 * 60 * 60 * 1000;
  }
}

export function chartBarSpacing(containerWidthPx: number, interval: HlInterval): number {
  const visible = CHART_VISIBLE_BARS[interval] ?? 72;
  const usable = Math.max(320, containerWidthPx - 56);
  return Math.max(11, Math.min(26, Math.floor(usable / visible)));
}

export function chartSecondsVisible(interval: HlInterval): boolean {
  return interval === '1m' || interval === '5m';
}
