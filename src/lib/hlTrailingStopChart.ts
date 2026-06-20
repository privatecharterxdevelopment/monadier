import {
  profitLockDisplayForStrategy,
  type HlBotStrategy,
} from './hlBotStrategy';

/** Must match bot-service `pnlExits.trailingProfitLockFloorUsd`. */
export function trailingProfitLockFloorUsd(
  peakUsd: number,
  minFloorUsd: number,
  trailBufferUsd: number
): number {
  if (peakUsd <= 0) return minFloorUsd;
  return Math.max(minFloorUsd, peakUsd - trailBufferUsd);
}

export type HlChartPositionOverlay = {
  entryPx: number;
  liqPx?: number;
  side: 'long' | 'short';
  /** Bot trailing stop — price where profit lock closes the position. */
  trailStopPx?: number;
  trailStopLocked: boolean;
  trailFloorUsd: number;
  peakPnlUsd: number;
};

/** Map locked profit floor (USD) → stop price on chart. pnl = size × (px − entry). */
export function profitFloorUsdToStopPx(
  entryPx: number,
  signedSize: number,
  floorUsd: number
): number | null {
  if (!entryPx || !signedSize || !Number.isFinite(floorUsd)) return null;
  const px = entryPx + floorUsd / signedSize;
  return Number.isFinite(px) && px > 0 ? px : null;
}

export function computeHlChartPositionOverlay(opts: {
  entryPx: number;
  liqPx?: number;
  szi: number;
  unrealizedPnlUsd: number;
  peakPnlUsd: number;
  strategy: HlBotStrategy;
  trailBufferUsd?: number;
}): HlChartPositionOverlay | undefined {
  const entryPx = opts.entryPx;
  if (entryPx <= 0 || !opts.szi) return undefined;

  const side = opts.szi >= 0 ? ('long' as const) : ('short' as const);
  const lock = profitLockDisplayForStrategy(opts.strategy);
  const trailBuffer = opts.trailBufferUsd ?? 0.025;
  const peak = Math.max(opts.peakPnlUsd, opts.unrealizedPnlUsd);
  const locked = peak >= lock.activateUsd;

  let trailFloorUsd = lock.floorUsd;
  let trailStopPx: number | undefined;

  if (locked) {
    trailFloorUsd = trailingProfitLockFloorUsd(peak, lock.floorUsd, trailBuffer);
    const px = profitFloorUsdToStopPx(entryPx, opts.szi, trailFloorUsd);
    if (px != null) trailStopPx = px;
  }

  return {
    entryPx,
    liqPx: opts.liqPx,
    side,
    trailStopPx,
    trailStopLocked: locked,
    trailFloorUsd,
    peakPnlUsd: peak,
  };
}
