import { isHlFillClose } from './format';
import { toNum } from './parse';
import type { HlUserFill } from './user';

export type HlClosedPnlSummary = {
  totalGain: number;
  totalLoss: number;
  netPnl: number;
  closedCount: number;
  /** Earliest fill timestamp (open or close) in ms. */
  firstFillAt: number | null;
  /** Earliest closed-trade timestamp in ms. */
  firstCloseAt: number | null;
};

/** Sum closedPnl from HL fill history (realized perp P/L). */
export function sumHlRealizedPnlFromFills(fills: HlUserFill[]): number {
  return summarizeHlClosedPnlFromFills(fills).netPnl;
}

export function summarizeHlClosedPnlFromFills(fills: HlUserFill[]): HlClosedPnlSummary {
  let totalGain = 0;
  let totalLoss = 0;
  let closedCount = 0;
  let firstFillAt: number | null = null;
  let firstCloseAt: number | null = null;

  for (const f of fills) {
    const time = toNum(f.time);
    if (time > 0) {
      firstFillAt = firstFillAt == null ? time : Math.min(firstFillAt, time);
    }

    if (!isHlFillClose(f.dir, f.closedPnl)) continue;
    closedCount += 1;
    if (time > 0) {
      firstCloseAt = firstCloseAt == null ? time : Math.min(firstCloseAt, time);
    }

    const pnl = toNum(f.closedPnl);
    if (!Number.isFinite(pnl)) continue;
    if (pnl > 0) totalGain += pnl;
    else if (pnl < 0) totalLoss += pnl;
  }

  return {
    totalGain,
    totalLoss,
    netPnl: totalGain + totalLoss,
    closedCount,
    firstFillAt,
    firstCloseAt,
  };
}

export function countHlClosedFills(fills: HlUserFill[]): number {
  return fills.filter((f) => isHlFillClose(f.dir, f.closedPnl)).length;
}
