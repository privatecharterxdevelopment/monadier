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

/** Margin % → price level (loss side). LONG: below entry; SHORT: above entry. */
export function marginStopLossPx(
  entryPx: number,
  signedSize: number,
  leverage: number,
  stopLossMarginPct: number
): number | null {
  if (entryPx <= 0 || !signedSize || !leverage || stopLossMarginPct <= 0) return null;
  const move = stopLossMarginPct / 100 / leverage;
  const px = signedSize >= 0 ? entryPx * (1 - move) : entryPx * (1 + move);
  return Number.isFinite(px) && px > 0 ? px : null;
}

/** Margin % → take-profit price. */
export function marginTakeProfitPx(
  entryPx: number,
  signedSize: number,
  leverage: number,
  takeProfitMarginPct: number
): number | null {
  if (entryPx <= 0 || !signedSize || !leverage || takeProfitMarginPct <= 0) return null;
  const move = takeProfitMarginPct / 100 / leverage;
  const px = signedSize >= 0 ? entryPx * (1 + move) : entryPx * (1 - move);
  return Number.isFinite(px) && px > 0 ? px : null;
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
  /** User/config stop loss on margin (%). */
  stopLossPx?: number;
  takeProfitPx?: number;
  stopLossMarginPct?: number;
  takeProfitMarginPct?: number;
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
  leverage?: number;
  stopLossMarginPct?: number;
  takeProfitMarginPct?: number;
  profitMinHoldMs?: number;
  profitHoldMs?: number;
}): HlChartPositionOverlay | undefined {
  const entryPx = opts.entryPx;
  if (entryPx <= 0 || !opts.szi) return undefined;

  const side = opts.szi >= 0 ? ('long' as const) : ('short' as const);
  const lock = profitLockDisplayForStrategy(opts.strategy);
  const trailBuffer = opts.trailBufferUsd ?? lock.trailBufferUsd;
  const peak = Math.max(opts.peakPnlUsd, opts.unrealizedPnlUsd);
  const minHold = opts.profitMinHoldMs ?? lock.minHoldMs;
  const holdMs = opts.profitHoldMs ?? 0;
  const locked = holdMs >= minHold && peak >= lock.activateUsd;

  let trailFloorUsd = lock.floorUsd;
  let trailStopPx: number | undefined;

  if (locked) {
    trailFloorUsd = trailingProfitLockFloorUsd(peak, lock.floorUsd, trailBuffer);
    const px = profitFloorUsdToStopPx(entryPx, opts.szi, trailFloorUsd);
    if (px != null) trailStopPx = px;
  }

  const lev = opts.leverage ?? 10;
  const slPct = opts.stopLossMarginPct ?? 0;
  const tpPct = opts.takeProfitMarginPct ?? 0;

  return {
    entryPx,
    liqPx: opts.liqPx,
    side,
    trailStopPx,
    trailStopLocked: locked,
    trailFloorUsd,
    peakPnlUsd: peak,
    stopLossPx: marginStopLossPx(entryPx, opts.szi, lev, slPct) ?? undefined,
    takeProfitPx: marginTakeProfitPx(entryPx, opts.szi, lev, tpPct) ?? undefined,
    stopLossMarginPct: slPct > 0 ? slPct : undefined,
    takeProfitMarginPct: tpPct > 0 ? tpPct : undefined,
  };
}
