import { useEffect, useMemo, useRef } from 'react';
import type { HlPosition } from '../lib/hyperliquid/user';
import { toNum } from '../lib/hyperliquid/parse';
import {
  computeHlChartPositionOverlay,
  type HlChartPositionOverlay,
} from '../lib/hlTrailingStopChart';
import { normalizeHlBotStrategy, type HlBotStrategy } from '../lib/hlBotStrategy';

function positionTrackKey(p: HlPosition): string {
  return `${p.coin}:${p.entryPx}:${p.szi}`;
}

/** Entry, liq, and bot trailing SL line for the open HL position on `coin`. */
export function useHlBotChartOverlay(
  position: HlPosition | null | undefined,
  coin: string,
  hlBotStrategy: HlBotStrategy | string | null | undefined
): HlChartPositionOverlay | undefined {
  const strategy = normalizeHlBotStrategy(hlBotStrategy ?? 'standard');
  const peakRef = useRef(0);
  const trackKeyRef = useRef('');

  const active =
    position && position.coin === coin && Math.abs(toNum(position.szi)) > 0 ? position : null;

  const trackKey = active ? positionTrackKey(active) : '';
  const upnl = active ? toNum(active.unrealizedPnl) : 0;

  useEffect(() => {
    if (trackKey !== trackKeyRef.current) {
      trackKeyRef.current = trackKey;
      peakRef.current = 0;
    }
  }, [trackKey]);

  if (active && upnl > peakRef.current) {
    peakRef.current = upnl;
  }

  return useMemo(() => {
    if (!active) return undefined;
    const entryPx = toNum(active.entryPx);
    if (entryPx <= 0) return undefined;
    return computeHlChartPositionOverlay({
      entryPx,
      liqPx: toNum(active.liquidationPx) || undefined,
      szi: toNum(active.szi),
      unrealizedPnlUsd: upnl,
      peakPnlUsd: peakRef.current,
      strategy,
    });
  }, [active, strategy, upnl, trackKey]);
}
