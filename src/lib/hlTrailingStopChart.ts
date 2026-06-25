import {
  HL_DYNAMIC_TRAIL,
  shouldArmDynamicTrail,
  defaultTrailPctForCoin,
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

function markFromPosition(entryPx: number, szi: number, pnlUsd: number): number {
  if (!entryPx || Math.abs(szi) < 1e-12) return entryPx;
  return entryPx + pnlUsd / szi;
}

function breakevenPlusFeesStopPx(
  direction: 'long' | 'short',
  entryPx: number,
  absSize: number,
  notionalUsd: number
): number {
  const fees = notionalUsd * (HL_DYNAMIC_TRAIL.estimatedFeeBpsPerSide / 10_000) * 2;
  const bufferUsd = Math.max(
    fees * 0.5,
    entryPx * absSize * (HL_DYNAMIC_TRAIL.breakevenBufferPct / 100)
  );
  const move = (fees + bufferUsd) / absSize;
  return direction === 'long' ? entryPx + move : entryPx - move;
}

function ratchetStop(
  direction: 'long' | 'short',
  current: number | null,
  candidate: number
): number {
  if (current == null) return candidate;
  return direction === 'long' ? Math.max(current, candidate) : Math.min(current, candidate);
}

/** Dynamic price trail — mirrors bot-service evaluateDynamicTrail (tier % fallback). */
export function computeDynamicTrailStopPx(opts: {
  entryPx: number;
  szi: number;
  unrealizedPnlUsd: number;
  extremeFavorablePx: number;
  coin: string;
  notionalUsd: number;
  collateralUsd: number;
}): { stopPx: number | null; armed: boolean; breached: boolean } {
  const side = opts.szi >= 0 ? ('long' as const) : ('short' as const);
  const absSize = Math.abs(opts.szi);
  const mark = markFromPosition(opts.entryPx, opts.szi, opts.unrealizedPnlUsd);
  const armed = shouldArmDynamicTrail(
    opts.unrealizedPnlUsd,
    opts.collateralUsd,
    opts.notionalUsd
  );
  if (!armed) {
    return { stopPx: null, armed: false, breached: false };
  }

  const trailPct = defaultTrailPctForCoin(opts.coin);
  const trailDist = mark * trailPct;
  const extreme =
    side === 'long'
      ? Math.max(opts.extremeFavorablePx, mark)
      : Math.min(opts.extremeFavorablePx, mark);

  let stop = breakevenPlusFeesStopPx(side, opts.entryPx, absSize, opts.notionalUsd);
  const trailCandidate = side === 'long' ? extreme - trailDist : extreme + trailDist;
  stop = ratchetStop(side, stop, trailCandidate);

  const breached =
    side === 'long' ? mark <= stop : mark >= stop;

  return { stopPx: stop, armed: true, breached };
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
    extremeFavorablePx: opts.extremeFavorablePx,
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

/** Trail stop price for open-position tables (mirrors bot dynamic trail). */
export function trailStopForOpenPosition(opts: {
  entryPx: number;
  szi: number;
  markPx: number;
  unrealizedPnlUsd: number;
  leverage: number;
  coin: string;
}): { stopPx: number | null; armed: boolean; label: string } {
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
    extremeFavorablePx: opts.markPx,
    coin: opts.coin,
    notionalUsd: notional,
    collateralUsd: collateral,
  });
  if (!trail.armed || trail.stopPx == null) {
    return {
      stopPx: null,
      armed: false,
      label: opts.unrealizedPnlUsd > 0 ? `Arming (+${HL_DYNAMIC_TRAIL.breakevenArmRoePct}% ROE)` : 'Idle',
    };
  }
  const roe = collateral > 0 ? (opts.unrealizedPnlUsd / collateral) * 100 : 0;
  const phase = roe >= HL_DYNAMIC_TRAIL.armMinRoePct ? 'Trail' : 'BE lock';
  return {
    stopPx: trail.stopPx,
    armed: true,
    label: `${phase} $${trail.stopPx.toLocaleString(undefined, {
      maximumFractionDigits: opts.markPx >= 100 ? 2 : 4,
    })}`,
  };
}
