import { useCallback, useRef } from 'react';

function trackKey(coin: string, entryPx: number, szi: number): string {
  return `${coin}:${entryPx}:${szi}`;
}

/** Tracks peak uPnL per open position for profit-trail display. */
export function useHlPositionPeakPnl(
  positions: Array<{ coin: string; entryPx?: string; szi?: string; unrealizedPnl?: string }>,
  livePnlByCoin: Record<string, number>
): (coin: string, entryPx: number, szi: number, fallbackPnl: number) => number {
  const peakRef = useRef<Map<string, number>>(new Map());

  const activeKeys = new Set<string>();
  for (const p of positions) {
    const entry = Number.parseFloat(p.entryPx || '0');
    const szi = Number.parseFloat(p.szi || '0');
    if (!p.coin || !entry || !szi) continue;
    const key = trackKey(p.coin, entry, szi);
    activeKeys.add(key);
    const current =
      livePnlByCoin[p.coin] ??
      Number.parseFloat(p.unrealizedPnl || '0') ??
      0;
    const prev = peakRef.current.get(key) ?? Number.NEGATIVE_INFINITY;
    peakRef.current.set(key, Math.max(prev, current));
  }
  for (const key of [...peakRef.current.keys()]) {
    if (!activeKeys.has(key)) peakRef.current.delete(key);
  }

  return useCallback(
    (coin: string, entryPx: number, szi: number, fallbackPnl: number) => {
      const key = trackKey(coin, entryPx, szi);
      return Math.max(peakRef.current.get(key) ?? fallbackPnl, fallbackPnl);
    },
    [positions, livePnlByCoin]
  );
}
