import {
  HL_DYNAMIC_TRAIL,
  shouldArmDynamicTrail,
  type HlBotStrategy,
} from './hlBotStrategy';

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
  trailStopPx?: number;
  trailStopLocked: boolean;
  trailFloorUsd: number;
  trailCloseFloorUsd: number;
  trailBreached: boolean;
  unrealizedPnlUsd: number;
  peakPnlUsd: number;
  stopLossPx?: number;
  takeProfitPx?: number;
  stopLossMarginPct?: number;
  takeProfitMarginPct?: number;
};

function roePct(pnlUsd: number, collateralUsd: number): number {
  if (collateralUsd <= 0) return 0;
  return (pnlUsd / collateralUsd) * 100;
}

function stopPxForRoePct(
  direction: 'long' | 'short',
  entryPx: number,
  absSize: number,
  collateralUsd: number,
  lockRoePct: number
): number {
  const lockPnlUsd = collateralUsd * (lockRoePct / 100);
  const move = lockPnlUsd / absSize;
  return direction === 'long' ? entryPx + move : entryPx - move;
}

function profitTrailLockRoePct(peakPnlUsd: number, collateralUsd: number): number {
  const peakRoe = roePct(peakPnlUsd, collateralUsd);
  return Math.max(HL_DYNAMIC_TRAIL.armMinRoePct, peakRoe - HL_DYNAMIC_TRAIL.trailGapRoePct);
}

function ratchetStop(
  direction: 'long' | 'short',
  current: number | null,
  candidate: number
): number {
  if (current == null) return candidate;
  return direction === 'long' ? Math.max(current, candidate) : Math.min(current, candidate);
}

/** ROE trail — mirrors bot: +0.2% arm, +0.1% lock, 0.1% gap from peak. */
export function computeDynamicTrailStopPx(opts: {
  entryPx: number;
  szi: number;
  unrealizedPnlUsd: number;
  peakPnlUsd?: number;
  coin: string;
  notionalUsd: number;
  collateralUsd: number;
}): { stopPx: number | null; armed: boolean; breached: boolean; lockRoePct: number } {
  const side = opts.szi >= 0 ? ('long' as const) : ('short' as const);
  const absSize = Math.abs(opts.szi);
  const armed = shouldArmDynamicTrail(
    opts.unrealizedPnlUsd,
    opts.collateralUsd,
    opts.notionalUsd
  );
  if (!armed) {
    return { stopPx: null, armed: false, breached: false, lockRoePct: 0 };
  }

  const peakPnl = Math.max(opts.peakPnlUsd ?? opts.unrealizedPnlUsd, opts.unrealizedPnlUsd);
  const lockRoe = profitTrailLockRoePct(peakPnl, opts.collateralUsd);
  let stop = stopPxForRoePct(
    side,
    opts.entryPx,
    absSize,
    opts.collateralUsd,
    lockRoe
  );
  stop = ratchetStop(side, null, stop);

  const mark =
    opts.entryPx + (opts.unrealizedPnlUsd / opts.szi);
  const breached = side === 'long' ? mark <= stop : mark >= stop;

  return { stopPx: stop, armed: true, breached, lockRoePct: lockRoe };
}

export function computeHlChartPositionOverlay(opts: {
  entryPx: number;
  liqPx?: number;
  szi: number;
  unrealizedPnlUsd: number;
  peakPnlUsd: number;
  extremeFavorablePx: number;
  coin: string;
  strategy: HlBotStrategy;
  leverage?: number;
  stopLossMarginPct?: number;
  takeProfitMarginPct?: number;
  notionalUsd?: number;
  collateralUsd?: number;
}): HlChartPositionOverlay | undefined {
  const entryPx = opts.entryPx;
  if (entryPx <= 0 || !opts.szi) return undefined;

  const side = opts.szi >= 0 ? ('long' as const) : ('short' as const);
  const lev = opts.leverage ?? 10;
  const absSize = Math.abs(opts.szi);
  const notional = opts.notionalUsd ?? absSize * entryPx;
  const collateral = opts.collateralUsd ?? notional / lev;
  const peak = Math.max(opts.peakPnlUsd, opts.unrealizedPnlUsd);

  const trail = computeDynamicTrailStopPx({
    entryPx,
    szi: opts.szi,
    unrealizedPnlUsd: opts.unrealizedPnlUsd,
    peakPnlUsd: peak,
    coin: opts.coin,
    notionalUsd: notional,
    collateralUsd: collateral,
  });

  const slPct = opts.stopLossMarginPct ?? 0;
  const tpPct = opts.takeProfitMarginPct ?? 0;

  return {
    entryPx,
    liqPx: opts.liqPx,
    side,
    trailStopPx: trail.stopPx ?? undefined,
    trailStopLocked: trail.armed,
    trailFloorUsd: peak,
    trailCloseFloorUsd: peak,
    trailBreached: trail.breached,
    unrealizedPnlUsd: opts.unrealizedPnlUsd,
    peakPnlUsd: peak,
    stopLossPx: marginStopLossPx(entryPx, opts.szi, lev, slPct) ?? undefined,
    takeProfitPx: marginTakeProfitPx(entryPx, opts.szi, lev, tpPct) ?? undefined,
    stopLossMarginPct: slPct > 0 ? slPct : undefined,
    takeProfitMarginPct: tpPct > 0 ? tpPct : undefined,
  };
}

/** Trail stop for open-position tables. */
export function trailStopForOpenPosition(opts: {
  entryPx: number;
  szi: number;
  markPx: number;
  unrealizedPnlUsd: number;
  leverage: number;
  coin: string;
  holdMs?: number;
}): { stopPx: number | null; armed: boolean; label: string; title?: string } {
  const absSize = Math.abs(opts.szi);
  if (opts.entryPx <= 0 || absSize <= 0 || opts.markPx <= 0) {
    return { stopPx: null, armed: false, label: '—' };
  }
  const notional = absSize * opts.markPx;
  const collateral = notional / Math.max(1, opts.leverage);
  const trail = computeDynamicTrailStopPx({
    entryPx: opts.entryPx,
    szi: opts.szi,
    unrealizedPnlUsd: opts.unrealizedPnlUsd,
    peakPnlUsd: opts.unrealizedPnlUsd,
    coin: opts.coin,
    notionalUsd: notional,
    collateralUsd: collateral,
  });

  if (!trail.armed || trail.stopPx == null) {
    const roe = roePct(opts.unrealizedPnlUsd, collateral);
    if (opts.unrealizedPnlUsd > 0 && roe < HL_DYNAMIC_TRAIL.breakevenArmRoePct) {
      return { stopPx: null, armed: false, label: 'Arming SL' };
    }
    if (opts.unrealizedPnlUsd > 0) {
      return { stopPx: null, armed: false, label: 'Arming SL' };
    }
    return { stopPx: null, armed: false, label: 'Idle' };
  }

  return {
    stopPx: trail.stopPx,
    armed: true,
    label: `Trail +${trail.lockRoePct.toFixed(2)}%`,
    title: `Profit trail locked at +${trail.lockRoePct.toFixed(2)}% ROE — closes on cross`,
  };
}
