import { fillPositionDirection, isHlFillClose } from './format';
import { toNum } from './parse';
import type { HlUserFill } from './user';

export type AggregatedHlCloseFill = HlUserFill & { fillCount: number };

/**
 * Market closes often span multiple seconds / order ids. Merge window keeps one
 * history row for one logical close (PUMP 5-fill example) without glueing
 * unrelated closes minutes apart.
 */
export const HL_CLOSE_FILL_MERGE_GAP_MS = 8_000;

export function aggregatedCloseFillKey(f: AggregatedHlCloseFill): string {
  return `${f.time}|${f.coin}|${fillPositionDirection(f)}|${f.oid ?? 'x'}|${f.fillCount}`;
}

function sameCloseGroup(a: AggregatedHlCloseFill, b: HlUserFill): boolean {
  if (a.coin.toUpperCase() !== b.coin.toUpperCase()) return false;
  if (fillPositionDirection(a) !== fillPositionDirection(b)) return false;
  const aOid = a.oid != null && Number.isFinite(a.oid) ? a.oid : null;
  const bOid = b.oid != null && Number.isFinite(b.oid) ? b.oid : null;
  if (aOid != null && bOid != null && aOid === bOid) return true;
  // Chain fills: each new fill within gap of the group's latest timestamp.
  return Math.abs(b.time - a.time) <= HL_CLOSE_FILL_MERGE_GAP_MS;
}

function mergeFill(existing: AggregatedHlCloseFill, f: HlUserFill): AggregatedHlCloseFill {
  const sz = toNum(f.sz);
  const px = toNum(f.px);
  const fee = toNum(f.fee);
  const pnl = toNum(f.closedPnl);
  const prevSz = toNum(existing.sz);
  const totalSz = prevSz + sz;
  const wPx = totalSz > 0 ? (toNum(existing.px) * prevSz + px * sz) / totalSz : px;
  return {
    ...existing,
    // Keep the latest fill timestamp so consecutive gap chaining works.
    time: Math.max(existing.time, f.time),
    sz: String(totalSz),
    px: String(wPx),
    fee: String(toNum(existing.fee) + fee),
    closedPnl: String(toNum(existing.closedPnl) + pnl),
    fillCount: existing.fillCount + 1,
    oid: existing.oid ?? f.oid,
    tid: f.tid ?? existing.tid,
  };
}

/** HL often splits one market close into multiple fills — sum them for one history row. */
export function aggregateHlCloseFills(fills: HlUserFill[]): AggregatedHlCloseFill[] {
  const closes = fills
    .filter((f) => isHlFillClose(f.dir, f.closedPnl))
    .slice()
    .sort((a, b) => a.time - b.time || (a.tid ?? 0) - (b.tid ?? 0));

  const groups: AggregatedHlCloseFill[] = [];
  for (const f of closes) {
    const last = groups[groups.length - 1];
    if (last && sameCloseGroup(last, f)) {
      groups[groups.length - 1] = mergeFill(last, f);
      continue;
    }
    groups.push({ ...f, fillCount: 1 });
  }

  return groups.sort((a, b) => b.time - a.time);
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
