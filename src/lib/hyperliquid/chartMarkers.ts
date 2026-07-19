import type { SeriesMarker, UTCTimestamp } from 'lightweight-charts';
import type { HlUserFill } from './user';
import { fillPositionDirection } from './format';
import { toNum } from './parse';

export type HlChartMarker = {
  id: string;
  eventType: 'open' | 'close';
  direction: 'LONG' | 'SHORT';
  price: number;
  eventMs: number;
  pnlUsd: number | null;
  source: string;
};

export type ChartMarkerColors = { up: string; down: string };

export function fillToChartMarker(fill: HlUserFill): HlChartMarker | null {
  const dir = fill.dir?.trim() ?? '';
  if (!dir) return null;

  let eventType: 'open' | 'close' | null = null;
  if (/^open/i.test(dir)) eventType = 'open';
  else if (/^close/i.test(dir)) eventType = 'close';
  else if (/long\s*>\s*short/i.test(dir)) eventType = 'close';
  else if (/short\s*>\s*long/i.test(dir)) eventType = 'close';
  else return null;

  const direction = fillPositionDirection(fill);
  const price = toNum(fill.px);
  const eventMs = fill.time > 1e12 ? fill.time : fill.time * 1000;
  if (price <= 0 || eventMs <= 0) return null;

  const pnlUsd = eventType === 'close' ? toNum(fill.closedPnl) : null;
  const id = `fill:${fill.tid ?? `${eventMs}:${price}:${eventType}`}`;

  return {
    id,
    eventType,
    direction,
    price,
    eventMs,
    pnlUsd,
    source: 'hyperliquid',
  };
}

/**
 * Snap a fill time to the open of the candle that contains it. LWC positions a
 * marker at the bar whose time exactly matches; a raw fill second falls between
 * two interval-aligned candles, so the arrow snaps to a neighbour and appears to
 * "jump" whenever the forming bar repaints. Bucketing to the interval start
 * pins each arrow onto its own candle.
 */
function bucketMarkerTimeSec(eventMs: number, intervalSeconds?: number): number {
  const sec = Math.floor(eventMs / 1000);
  if (!intervalSeconds || intervalSeconds <= 0) return sec;
  return Math.floor(sec / intervalSeconds) * intervalSeconds;
}

export function hlChartMarkerToSeriesMarker(
  m: HlChartMarker,
  colors: ChartMarkerColors,
  intervalSeconds?: number
): SeriesMarker<UTCTimestamp> {
  const time = bucketMarkerTimeSec(m.eventMs, intervalSeconds) as UTCTimestamp;

  if (m.eventType === 'open') {
    const isLong = m.direction === 'LONG';
    return {
      id: m.id,
      time,
      position: 'belowBar',
      shape: isLong ? 'arrowUp' : 'arrowDown',
      color: isLong ? colors.up : colors.down,
      text: isLong ? 'Open L' : 'Open S',
      size: 1,
    };
  }

  const win = (m.pnlUsd ?? 0) >= 0;
  return {
    id: m.id,
    time,
    position: 'belowBar',
    shape: win ? 'arrowUp' : 'arrowDown',
    color: win ? colors.up : colors.down,
    text: win ? 'Close +' : 'Close −',
    size: 1,
  };
}

export function dedupeChartMarkers(markers: HlChartMarker[]): HlChartMarker[] {
  const map = new Map<string, HlChartMarker>();
  for (const m of markers) {
    const key = `${m.eventType}:${m.eventMs}:${m.price.toFixed(6)}`;
    if (!map.has(key)) map.set(key, m);
  }
  return [...map.values()].sort((a, b) => a.eventMs - b.eventMs);
}

/** HL fills only — bot-service persists markers with service role. */
export async function fetchHlChartMarkers(
  _wallet: string,
  _coin: string,
  _limit = 120
): Promise<HlChartMarker[]> {
  return [];
}

/** No-op — client must not upsert (RLS 403). */
export async function persistChartMarkerFromFill(
  _wallet: string,
  _fill: HlUserFill
): Promise<void> {
  /* markers from HL fills + bot-service */
}
