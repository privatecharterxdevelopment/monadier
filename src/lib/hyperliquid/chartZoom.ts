import type { HlInterval } from './types';

/** Bars on screen when user follows live (recent window). */
export const CHART_VISIBLE_BARS: Record<HlInterval, number> = {
  '1m': 96,
  '3m': 100,
  '5m': 120,
  '15m': 120,
  '30m': 130,
  '1h': 140,
  '2h': 150,
  '4h': 160,
  '8h': 170,
  '12h': 180,
  '1d': 180,
  '3d': 120,
  '1w': 104,
  '1M': 60,
};

const DAY = 24 * 60 * 60 * 1000;

/** HL candleSnapshot lookback — deep history; paginated in fetchHlCandles when > ~4.5k bars. */
export function chartLookbackMs(interval: HlInterval): number {
  switch (interval) {
    case '1m':
      return 7 * DAY;
    case '3m':
      return 14 * DAY;
    case '5m':
      return 30 * DAY;
    case '15m':
      return 90 * DAY;
    case '30m':
      return 120 * DAY;
    case '1h':
      return 180 * DAY;
    case '2h':
      return 270 * DAY;
    case '4h':
      return 365 * DAY;
    case '8h':
      return 400 * DAY;
    case '12h':
      return 450 * DAY;
    case '1d':
    case '3d':
    case '1w':
    case '1M':
      return 2 * 365 * DAY;
    default:
      return 2 * 365 * DAY;
  }
}

export function chartIntervalMs(interval: HlInterval): number {
  switch (interval) {
    case '1m':
      return 60_000;
    case '3m':
      return 3 * 60_000;
    case '5m':
      return 5 * 60_000;
    case '15m':
      return 15 * 60_000;
    case '30m':
      return 30 * 60_000;
    case '1h':
      return 60 * 60_000;
    case '2h':
      return 2 * 60 * 60_000;
    case '4h':
      return 4 * 60 * 60_000;
    case '8h':
      return 8 * 60 * 60_000;
    case '12h':
      return 12 * 60 * 60_000;
    case '1d':
      return DAY;
    case '3d':
      return 3 * DAY;
    case '1w':
      return 7 * DAY;
    case '1M':
      return 30 * DAY;
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
  return interval === '1m' || interval === '3m' || interval === '5m';
}
