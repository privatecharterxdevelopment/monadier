import type { HlInterval } from './types';

/** Bars on screen when user follows live (recent window). Full history still loads and is scrollable. */
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

/** Hard floor for every HL chart TF — Jan 1 2026 00:00 UTC → now. */
export const CHART_HISTORY_START_MS = Date.UTC(2026, 0, 1);

export function chartHistoryStartMs(): number {
  return CHART_HISTORY_START_MS;
}

/**
 * Lookback hint for candle fetches. Actual span is capped to 1–3 HL pages in
 * fetchHlCandles so we never stampede /info (was causing chart 500 / blanks).
 */
export function chartLookbackMs(_interval?: HlInterval): number {
  return Math.max(DAY, Date.now() - CHART_HISTORY_START_MS);
}

/** Allow zooming out far enough to see the full Jan→now history. */
export function chartMinBarSpacing(): number {
  return 0.5;
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
