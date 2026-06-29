import { fillPositionDirection, isHlFillClose } from './format';
import { toNum } from './parse';
import type { HlUserFill } from './user';

export type AggregatedHlCloseFill = HlUserFill & { fillCount: number };

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
