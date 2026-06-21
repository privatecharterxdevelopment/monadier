import { useEffect, useMemo, useRef } from 'react';
import type { HlPosition } from '../lib/hyperliquid/user';
import { toNum } from '../lib/hyperliquid/parse';
import {
  computeHlChartPositionOverlay,
  type HlChartPositionOverlay,
} from '../lib/hlTrailingStopChart';
import { normalizeHlPerpCoin } from '../lib/botTradingPairs';
import { normalizeHlBotStrategy, type HlBotStrategy } from '../lib/hlBotStrategy';

function positionTrackKey(p: HlPosition): string {
  return `${p.coin}:${p.entryPx}:${p.szi}`;
}

/** Entry, liq, SL/TP, and bot trailing SL for the open HL position on `coin`. */
export function useHlBotChartOverlay(
  position: HlPosition | null | undefined,
  coin: string,
  hlBotStrategy: HlBotStrategy | string | null | undefined,
  opts?: {
    stopLossMarginPct?: number;
    takeProfitMarginPct?: number;
  }
): HlChartPositionOverlay | undefined {
  const strategy = normalizeHlBotStrategy(hlBotStrategy ?? 'standard');
  const peakRef = useRef(0);
  const trackKeyRef = useRef('');
  const greenSinceRef = useRef<number | null>(null);

  const active =
    position &&
    normalizeHlPerpCoin(position.coin) === normalizeHlPerpCoin(coin) &&
    Math.abs(toNum(position.szi)) > 0
      ? position
      : null;

  const trackKey = active ? positionTrackKey(active) : '';
  const upnl = active ? toNum(active.unrealizedPnl) : 0;

  useEffect(() => {
    if (trackKey !== trackKeyRef.current) {
      trackKeyRef.current = trackKey;
      peakRef.current = 0;
      greenSinceRef.current = null;
    }
  }, [trackKey]);

  if (active && upnl > peakRef.current) {
    peakRef.current = upnl;
  }
  if (active) {
    if (upnl > 0.02 && greenSinceRef.current == null) {
      greenSinceRef.current = Date.now();
    } else if (upnl <= 0) {
      greenSinceRef.current = null;
    }
  }

  const profitHoldMs =
    greenSinceRef.current != null ? Date.now() - greenSinceRef.current : 0;

  return useMemo(() => {
    if (!active) return undefined;
    const entryPx = toNum(active.entryPx);
    if (entryPx <= 0) return undefined;
    const lev = active.leverage?.value ?? 10;
    return computeHlChartPositionOverlay({
      entryPx,
      liqPx: toNum(active.liquidationPx) || undefined,
      szi: toNum(active.szi),
      unrealizedPnlUsd: upnl,
      peakPnlUsd: peakRef.current,
      strategy,
      leverage: lev,
      stopLossMarginPct: opts?.stopLossMarginPct,
      takeProfitMarginPct: opts?.takeProfitMarginPct,
      profitHoldMs,
    });
  }, [active, strategy, upnl, trackKey, opts?.stopLossMarginPct, opts?.takeProfitMarginPct, profitHoldMs]);
}
