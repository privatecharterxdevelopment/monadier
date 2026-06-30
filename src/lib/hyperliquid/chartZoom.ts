import type { HlInterval } from './types';

/** Bars on screen when user follows live (recent window). */
export const CHART_VISIBLE_BARS: Record<HlInterval, number> = {
  '1m': 96,
  '5m': 120,
  '15m': 120,
  '1h': 140,
  '4h': 160,
  '1d': 180,
};

const DAY = 24 * 60 * 60 * 1000;

/** HL candleSnapshot lookback — deep history; paginated in fetchHlCandles when > ~4.5k bars. */
export function chartLookbackMs(interval: HlInterval): number {
  switch (interval) {
    case '1m':
      return 7 * DAY;
    case '5m':
      return 30 * DAY;
    case '15m':
      return 90 * DAY;
    case '1h':
      return 180 * DAY;
    case '4h':
      return 365 * DAY;
    default:
      return 2 * 365 * DAY;
  }
}

export function chartIntervalMs(interval: HlInterval): number {
  switch (interval) {
    case '1m':
      return 60_000;
    case '5m':
      return 5 * 60_000;
    case '15m':
      return 15 * 60_000;
    case '1h':
      return 60 * 60_000;
    case '4h':
      return 4 * 60 * 60_000;
    case '1d':
      return DAY;
    default:
      return 60 * 60_000;
  }
}

export function chartBarSpacing(containerWidthPx: number, interval: HlInterval): number {
  const visible = CHART_VISIBLE_BARS[interval] ?? 120;
  const usable = Math.max(320, containerWidthPx - 56);
  return Math.max(8, Math.min(22, Math.floor(usable / visible)));
}

export function chartSecondsVisible(interval: HlInterval): boolean {
  return interval === '1m' || interval === '5m';
}
