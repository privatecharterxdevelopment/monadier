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

function markFromPosition(entryPx: number, szi: number, pnlUsd: number): number {
  if (!entryPx || Math.abs(szi) < 1e-12) return entryPx;
  return entryPx + pnlUsd / szi;
}

/** Entry, liq, SL/TP, and bot dynamic trailing SL for the open HL position on `coin`. */
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
  const extremePxRef = useRef(0);
  const trackKeyRef = useRef('');

  const active =
    position &&
    normalizeHlPerpCoin(position.coin) === normalizeHlPerpCoin(coin) &&
    Math.abs(toNum(position.szi)) > 0
      ? position
      : null;

  const trackKey = active ? positionTrackKey(active) : '';
  const upnl = active ? toNum(active.unrealizedPnl) : 0;
  const entryPx = active ? toNum(active.entryPx) : 0;
  const szi = active ? toNum(active.szi) : 0;
  const mark = active ? markFromPosition(entryPx, szi, upnl) : 0;

  useEffect(() => {
    if (trackKey !== trackKeyRef.current) {
      trackKeyRef.current = trackKey;
      peakRef.current = 0;
      extremePxRef.current = mark;
    }
  }, [trackKey, mark]);

  if (active && upnl > peakRef.current) {
    peakRef.current = upnl;
  }
  if (active && mark > 0) {
    if (szi >= 0) {
      extremePxRef.current = Math.max(extremePxRef.current || mark, mark);
    } else {
      extremePxRef.current =
        extremePxRef.current <= 0 ? mark : Math.min(extremePxRef.current, mark);
    }
  }

  return useMemo(() => {
    if (!active) return undefined;
    if (entryPx <= 0) return undefined;
    const lev = active.leverage?.value ?? 10;
    const absSize = Math.abs(szi);
    const notional = absSize * mark;
    return computeHlChartPositionOverlay({
      entryPx,
      liqPx: toNum(active.liquidationPx) || undefined,
      szi,
      unrealizedPnlUsd: upnl,
      peakPnlUsd: peakRef.current,
      extremeFavorablePx: extremePxRef.current || mark,
      coin: active.coin,
      strategy,
      leverage: lev,
      stopLossMarginPct: opts?.stopLossMarginPct,
      takeProfitMarginPct: opts?.takeProfitMarginPct,
      notionalUsd: notional,
      collateralUsd: notional / lev,
    });
  }, [active, strategy, upnl, trackKey, mark, entryPx, szi, opts?.stopLossMarginPct, opts?.takeProfitMarginPct]);
}
