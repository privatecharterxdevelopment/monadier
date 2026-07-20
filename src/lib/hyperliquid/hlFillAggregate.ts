import { fillPositionDirection, isHlFillClose } from './format';
import { toNum } from './parse';
import type { HlUserFill } from './user';

export type AggregatedHlCloseFill = HlUserFill & { fillCount: number };

export function aggregatedCloseFillKey(f: AggregatedHlCloseFill): string {
  // time is already second-bucketed by aggregateHlCloseFills grouping.
  return `${f.time}|${f.coin}|${fillPositionDirection(f)}`;
}

/** HL often splits one market close into multiple fills — sum them for one history row. */
export function aggregateHlCloseFills(fills: HlUserFill[]): AggregatedHlCloseFill[] {
  const groups = new Map<string, AggregatedHlCloseFill>();

  for (const f of fills) {
    if (!isHlFillClose(f.dir, f.closedPnl)) continue;
    const sec = Math.floor(f.time / 1000);
    const dir = fillPositionDirection(f);
    const key = `${f.coin}|${sec}|${dir}`;
    const sz = toNum(f.sz);
    const px = toNum(f.px);
    const fee = toNum(f.fee);
    const pnl = toNum(f.closedPnl);
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, { ...f, fillCount: 1 });
      continue;
    }

    const prevSz = toNum(existing.sz);
    const totalSz = prevSz + sz;
    const wPx =
      totalSz > 0 ? (toNum(existing.px) * prevSz + px * sz) / totalSz : px;

    groups.set(key, {
      ...existing,
      sz: String(totalSz),
      px: String(wPx),
      fee: String(toNum(existing.fee) + fee),
      closedPnl: String(toNum(existing.closedPnl) + pnl),
      fillCount: existing.fillCount + 1,
    });
  }

  return Array.from(groups.values()).sort((a, b) => b.time - a.time);
}

/**
 * Reconstruct equity immediately after each close, walking backward from the
 * current flat account value (accountValue − open uPnL).
 *
 * Uses HL trading fee only. Platform success fee (10%) is accrued separately and
 * is not deducted from Hyperliquid equity at close time.
 *
 * Deposits/withdrawals between fills make older rows approximate.
 */
export function balanceAfterByCloseFill(
  closesNewestFirst: AggregatedHlCloseFill[],
  flatEquityNow: number
): Map<string, number> {
  const map = new Map<string, number>();
  if (!Number.isFinite(flatEquityNow)) return map;

  let running = flatEquityNow;
  for (const f of closesNewestFirst) {
    map.set(aggregatedCloseFillKey(f), running);
    // Undo this close: equity previously excluded its realized pnl and still held its fee.
    running = running - toNum(f.closedPnl) + toNum(f.fee);
  }
  return map;
}
