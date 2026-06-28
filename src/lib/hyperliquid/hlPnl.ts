import { isHlFillClose } from './format';
import { toNum } from './parse';
import type { HlUserFill } from './user';

/** Sum closedPnl from HL fill history (realized perp P/L). */
export function sumHlRealizedPnlFromFills(fills: HlUserFill[]): number {
  let sum = 0;
  for (const f of fills) {
    if (!isHlFillClose(f.dir, f.closedPnl)) continue;
    const pnl = toNum(f.closedPnl);
    if (Number.isFinite(pnl)) sum += pnl;
  }
  return sum;
}

export function countHlClosedFills(fills: HlUserFill[]): number {
  return fills.filter((f) => isHlFillClose(f.dir, f.closedPnl)).length;
}
