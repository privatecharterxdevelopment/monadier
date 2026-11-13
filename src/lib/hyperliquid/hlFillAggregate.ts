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
export type EquityLedgerFlow = { time: number; deltaUsd: number };

/**
 * Net USDC equity change from HL non-funding ledger rows (deposits, withdrawals, spot↔perp).
 * Positive = wallet equity increased (e.g. deposit to perp).
 */
export function equityDeltaFromHlLedgerRow(row: {
  time: number;
  delta: Record<string, unknown>;
}): number {
  const d = row.delta;
  const type = String(d.type ?? '');
  const usdc = toNum(d.usdc);
  if (!Number.isFinite(usdc) || usdc === 0) return 0;
  if (type === 'deposit') return usdc;
  if (type === 'withdraw' || type === 'withdrawal') return -usdc;
  if (type === 'accountClassTransfer') {
    return d.toPerp === true ? usdc : -usdc;
  }
  if (type === 'internalTransfer') {
    const fee = toNum(d.fee);
    return usdc - fee;
  }
  if (type === 'spotTransfer') {
    return usdc;
  }
  return 0;
}

export function balanceAfterByCloseFill(
  closesNewestFirst: AggregatedHlCloseFill[],
  flatEquityNow: number,
  ledgerFlowsNewestFirst: EquityLedgerFlow[] = []
): Map<string, number> {
  const map = new Map<string, number>();
  if (!Number.isFinite(flatEquityNow)) return map;

  const flows = ledgerFlowsNewestFirst
    .filter((f) => Number.isFinite(f.time) && Number.isFinite(f.deltaUsd) && f.deltaUsd !== 0)
    .slice()
    .sort((a, b) => b.time - a.time);

  let running = flatEquityNow;
  let flowIdx = 0;
  for (let i = 0; i < closesNewestFirst.length; i += 1) {
    const f = closesNewestFirst[i]!;
    const newerCloseTime = i === 0 ? Number.POSITIVE_INFINITY : closesNewestFirst[i - 1]!.time;

    while (
      flowIdx < flows.length &&
      flows[flowIdx]!.time > f.time &&
      flows[flowIdx]!.time <= newerCloseTime
    ) {
      running -= flows[flowIdx]!.deltaUsd;
      flowIdx += 1;
    }

    map.set(aggregatedCloseFillKey(f), running);
    running = running - toNum(f.closedPnl) + toNum(f.fee);
  }
  return map;
}
