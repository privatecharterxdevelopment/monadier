import { normalizeHlPerpCoin } from '../botTradingPairs';
import { toNum } from './parse';
import type { HlFundingPayment, HlHistoricalOrder, HlUserFill } from './user';

export type HlBotMarkerRow = {
  coin: string;
  eventType: 'open' | 'close';
  eventMs: number;
  fillTid?: number | null;
  source?: string | null;
};

export type HlBotTimeWindow = {
  coin: string;
  startMs: number;
  endMs: number;
};

const EDGE_MS = 3 * 60 * 1000;
/** Match a fill/order to a nearby bot open/close marker even if windows are incomplete. */
const MARKER_PROXIMITY_MS = 15 * 60 * 1000;

/** Build open→close intervals per coin from bot chart markers (source=bot). */
export function buildHlBotTradeWindows(
  markers: HlBotMarkerRow[],
  nowMs = Date.now()
): HlBotTimeWindow[] {
  const byCoin = new Map<string, HlBotMarkerRow[]>();
  for (const m of markers) {
    if (m.source && m.source !== 'bot') continue;
    const coin = normalizeHlPerpCoin(m.coin);
    if (!coin || !Number.isFinite(m.eventMs) || m.eventMs <= 0) continue;
    const list = byCoin.get(coin) ?? [];
    list.push(m);
    byCoin.set(coin, list);
  }

  const windows: HlBotTimeWindow[] = [];
  for (const [coin, list] of byCoin) {
    const sorted = [...list].sort((a, b) => a.eventMs - b.eventMs);
    let openMs: number | null = null;
    for (const row of sorted) {
      if (row.eventType === 'open') {
        // Re-open while already open: close previous window at this open.
        if (openMs != null) {
          windows.push({ coin, startMs: openMs, endMs: row.eventMs });
        }
        openMs = row.eventMs;
        continue;
      }
      if (row.eventType === 'close' && openMs != null) {
        windows.push({ coin, startMs: openMs, endMs: Math.max(openMs, row.eventMs) });
        openMs = null;
      } else if (row.eventType === 'close' && openMs == null) {
        // Orphan close — still attribute a short window around the close.
        windows.push({
          coin,
          startMs: row.eventMs - MARKER_PROXIMITY_MS,
          endMs: row.eventMs + EDGE_MS,
        });
      }
    }
    if (openMs != null) {
      windows.push({ coin, startMs: openMs, endMs: nowMs });
    }
  }
  return windows;
}

export function botFillTidSet(markers: HlBotMarkerRow[]): Set<number> {
  const set = new Set<number>();
  for (const m of markers) {
    if (m.source && m.source !== 'bot') continue;
    const tid = m.fillTid != null ? toNum(m.fillTid) : 0;
    if (tid > 0) set.add(tid);
  }
  return set;
}

export function isTimeInBotWindows(
  coin: string,
  timeMs: number,
  windows: HlBotTimeWindow[],
  edgeMs = EDGE_MS
): boolean {
  const c = normalizeHlPerpCoin(coin);
  if (!c || !Number.isFinite(timeMs)) return false;
  for (const w of windows) {
    if (w.coin !== c) continue;
    if (timeMs >= w.startMs - edgeMs && timeMs <= w.endMs + edgeMs) return true;
  }
  return false;
}

export function isNearBotMarker(
  coin: string,
  timeMs: number,
  markers: HlBotMarkerRow[],
  proximityMs = MARKER_PROXIMITY_MS
): boolean {
  const c = normalizeHlPerpCoin(coin);
  if (!c || !Number.isFinite(timeMs)) return false;
  for (const m of markers) {
    if (m.source && m.source !== 'bot') continue;
    if (normalizeHlPerpCoin(m.coin) !== c) continue;
    if (Math.abs(m.eventMs - timeMs) <= proximityMs) return true;
  }
  return false;
}

export function isBotAttributedFill(
  fill: Pick<HlUserFill, 'coin' | 'time' | 'tid'>,
  windows: HlBotTimeWindow[],
  fillTids: Set<number>,
  markers: HlBotMarkerRow[] = []
): boolean {
  const tid = fill.tid != null ? toNum(fill.tid) : 0;
  if (tid > 0 && fillTids.has(tid)) return true;
  const t = toNum(fill.time);
  if (isTimeInBotWindows(fill.coin, t, windows)) return true;
  return isNearBotMarker(fill.coin, t, markers);
}

export function filterFillsByScope<T extends Pick<HlUserFill, 'coin' | 'time' | 'tid'>>(
  fills: T[],
  scope: 'bot' | 'manual',
  windows: HlBotTimeWindow[],
  fillTids: Set<number>,
  markers: HlBotMarkerRow[] = []
): T[] {
  return fills.filter((f) => {
    const bot = isBotAttributedFill(f, windows, fillTids, markers);
    return scope === 'bot' ? bot : !bot;
  });
}

export function filterOrdersByScope(
  orders: HlHistoricalOrder[],
  scope: 'bot' | 'manual',
  windows: HlBotTimeWindow[],
  markers: HlBotMarkerRow[] = []
): HlHistoricalOrder[] {
  return orders.filter((o) => {
    const t = toNum(o.statusTimestamp || o.timestamp);
    const bot =
      isTimeInBotWindows(o.coin, t, windows) || isNearBotMarker(o.coin, t, markers);
    return scope === 'bot' ? bot : !bot;
  });
}

export function filterFundingByScope(
  funding: HlFundingPayment[],
  scope: 'bot' | 'manual',
  windows: HlBotTimeWindow[]
): HlFundingPayment[] {
  return funding.filter((f) => {
    const bot = isTimeInBotWindows(f.coin, toNum(f.time), windows, 0);
    return scope === 'bot' ? bot : !bot;
  });
}
