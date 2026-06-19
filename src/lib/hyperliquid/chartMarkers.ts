import type { SeriesMarker, UTCTimestamp } from 'lightweight-charts';
import { supabase } from '../supabase';
import type { HlUserFill } from './user';
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

/** Cached after first 404 — table not migrated on Supabase yet. */
let chartMarkersDbAvailable: boolean | null = null;

function isMissingChartMarkersTable(error: { code?: string; message?: string }): boolean {
  return (
    error.code === 'PGRST205' ||
    error.code === '42P01' ||
    /does not exist/i.test(error.message ?? '')
  );
}

function parseDirection(dir: string): 'LONG' | 'SHORT' | null {
  const d = dir.toLowerCase();
  if (d.includes('long') && !d.includes('short')) return 'LONG';
  if (d.includes('short') && !d.includes('long')) return 'SHORT';
  if (d.includes('long') && d.includes('short')) {
    if (d.startsWith('long')) return 'LONG';
    if (d.startsWith('short')) return 'SHORT';
  }
  return null;
}

export function fillToChartMarker(fill: HlUserFill): HlChartMarker | null {
  const dir = fill.dir?.trim() ?? '';
  if (!dir) return null;

  let eventType: 'open' | 'close' | null = null;
  if (/^open/i.test(dir)) eventType = 'open';
  else if (/^close/i.test(dir)) eventType = 'close';
  else if (/long\s*>\s*short/i.test(dir)) eventType = 'close';
  else if (/short\s*>\s*long/i.test(dir)) eventType = 'close';
  else return null;

  const direction = parseDirection(dir) ?? (fill.side === 'B' ? 'LONG' : 'SHORT');
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

export function hlChartMarkerToSeriesMarker(
  m: HlChartMarker,
  colors: ChartMarkerColors
): SeriesMarker<UTCTimestamp> {
  const time = Math.floor(m.eventMs / 1000) as UTCTimestamp;

  if (m.eventType === 'open') {
    const isLong = m.direction === 'LONG';
    return {
      id: m.id,
      time,
      position: 'atPriceMiddle',
      shape: isLong ? 'arrowUp' : 'arrowDown',
      color: isLong ? colors.up : colors.down,
      price: m.price,
      text: 'Bot open',
      size: 1.2,
    };
  }

  const win = (m.pnlUsd ?? 0) >= 0;
  return {
    id: m.id,
    time,
    position: 'atPriceMiddle',
    shape: win ? 'arrowUp' : 'arrowDown',
    color: win ? colors.up : colors.down,
    price: m.price,
    text: win ? 'Close +' : 'Close −',
    size: 1.2,
  };
}

function rowToMarker(row: Record<string, unknown>): HlChartMarker | null {
  const eventType = String(row.event_type ?? '') as 'open' | 'close';
  if (eventType !== 'open' && eventType !== 'close') return null;
  const direction = String(row.direction ?? 'LONG').toUpperCase() as 'LONG' | 'SHORT';
  const price = Number(row.price);
  const eventMs = new Date(String(row.event_ts)).getTime();
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(eventMs)) return null;

  return {
    id: String(row.id),
    eventType,
    direction: direction === 'SHORT' ? 'SHORT' : 'LONG',
    price,
    eventMs,
    pnlUsd: row.pnl_usd != null ? Number(row.pnl_usd) : null,
    source: String(row.source ?? 'bot'),
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

export async function fetchHlChartMarkers(
  wallet: string,
  coin: string,
  limit = 120
): Promise<HlChartMarker[]> {
  if (chartMarkersDbAvailable === false) return [];

  const w = wallet.toLowerCase();
  const c = coin.toUpperCase();
  const { data, error } = await supabase
    .from('hl_bot_chart_markers')
    .select('id, event_type, direction, price, pnl_usd, event_ts, source')
    .eq('wallet_address', w)
    .eq('coin', c)
    .order('event_ts', { ascending: true })
    .limit(limit);

  if (error) {
    if (isMissingChartMarkersTable(error)) {
      chartMarkersDbAvailable = false;
      return [];
    }
    return [];
  }

  chartMarkersDbAvailable = true;
  return (data ?? [])
    .map((row) => rowToMarker(row as Record<string, unknown>))
    .filter((m): m is HlChartMarker => m != null);
}

export async function persistChartMarkerFromFill(
  _wallet: string,
  _fill: HlUserFill
): Promise<void> {
  /* Markers come from HL fills on-chart; bot-service persists via service role. */
}
