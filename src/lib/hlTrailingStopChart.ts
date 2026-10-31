import {
  HL_DYNAMIC_TRAIL,
  shouldArmDynamicTrail,
  type HlBotStrategy,
} from './hlBotStrategy';
import { effectiveStopLossPct } from './hlBotEffectiveSettings';

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

function profitLockStage1RoePct(): number {
  return HL_DYNAMIC_TRAIL.armMinRoePct;
}

function resolveProfitTrailLockRoe(
  peakPnlUsd: number,
  collateralUsd: number,
  peakRoePct: number
): number {
  if (peakRoePct >= HL_DYNAMIC_TRAIL.fullTrailArmRoePct) {
    return profitTrailLockRoePct(peakPnlUsd, collateralUsd);
  }
  return profitLockStage1RoePct();
}

function ratchetStop(
  direction: 'long' | 'short',
  current: number | null,
  candidate: number
): number {
  if (current == null) return candidate;
  return direction === 'long' ? Math.max(current, candidate) : Math.min(current, candidate);
}

/** Two-stage ROE trail — mirrors bot (S1 lock, S2 ratchet). */
export function computeDynamicTrailStopPx(opts: {
  entryPx: number;
  szi: number;
  unrealizedPnlUsd: number;
  peakPnlUsd?: number;
  coin: string;
  notionalUsd: number;
  collateralUsd: number;
  holdMs?: number;
  timeInProfitMs?: number;
}): { stopPx: number | null; armed: boolean; breached: boolean; lockRoePct: number } {
  const side = opts.szi >= 0 ? ('long' as const) : ('short' as const);
  const absSize = Math.abs(opts.szi);
  const peakPnl = Math.max(opts.peakPnlUsd ?? opts.unrealizedPnlUsd, opts.unrealizedPnlUsd);
  const armed = shouldArmDynamicTrail(
    opts.unrealizedPnlUsd,
    opts.collateralUsd,
    opts.notionalUsd,
    {
      peakPnlUsd: peakPnl,
      holdMs: opts.holdMs,
      timeInProfitMs: opts.timeInProfitMs ?? (opts.unrealizedPnlUsd > 0 ? opts.holdMs : 0),
    }
  );
  if (!armed) {
    return { stopPx: null, armed: false, breached: false, lockRoePct: 0 };
  }

  const peakRoe = roePct(peakPnl, opts.collateralUsd);
  const lockRoe = resolveProfitTrailLockRoe(peakPnl, opts.collateralUsd, peakRoe);
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

  const tpPct = opts.takeProfitMarginPct ?? 0;

  return {
    entryPx,
    liqPx: undefined,
    side,
    trailStopPx: trail.stopPx ?? undefined,
    trailStopLocked: trail.armed,
    trailFloorUsd: peak,
    trailCloseFloorUsd: peak,
    trailBreached: trail.breached,
    unrealizedPnlUsd: opts.unrealizedPnlUsd,
    peakPnlUsd: peak,
    stopLossPx: undefined,
    takeProfitPx: marginTakeProfitPx(entryPx, opts.szi, lev, tpPct) ?? undefined,
    stopLossMarginPct: undefined,
    takeProfitMarginPct: tpPct > 0 ? tpPct : undefined,
  };
}

export function lossStopPricePx(
  direction: 'long' | 'short',
  entryPx: number,
  absSize: number,
  collateralUsd: number,
  slMarginPct: number
): number | null {
  if (slMarginPct <= 0 || absSize <= 0 || entryPx <= 0 || collateralUsd <= 0) return null;
  const maxLossUsd = collateralUsd * (slMarginPct / 100);
  const priceMove = maxLossUsd / absSize;
  const px = direction === 'long' ? entryPx - priceMove : entryPx + priceMove;
  return Number.isFinite(px) && px > 0 ? px : null;
}

export function fmtStopPx(px: number): string {
  if (px >= 1000) return px.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (px >= 1) return px.toFixed(4);
  if (px >= 0.01) return px.toFixed(5);
  return px.toFixed(6);
}

/** Stop price → max-loss % on margin (inverse of lossStopPricePx). */
export function marginPctFromStopPrice(
  direction: 'long' | 'short',
  entryPx: number,
  absSize: number,
  collateralUsd: number,
  stopPx: number
): number | null {
  if (entryPx <= 0 || absSize <= 0 || collateralUsd <= 0 || stopPx <= 0) return null;
  const maxLossUsd =
    direction === 'long'
      ? (entryPx - stopPx) * absSize
      : (stopPx - entryPx) * absSize;
  if (!Number.isFinite(maxLossUsd) || maxLossUsd <= 0) return null;
  const pct = (maxLossUsd / collateralUsd) * 100;
  return Number.isFinite(pct) && pct > 0 ? pct : null;
}

export type ActiveSlDisplay = {
  stopPx: number | null;
  armed: boolean;
  kind: 'profit' | 'arming' | 'loss_cap' | 'idle' | 'close_now';
  label: string;
  sublabel?: string;
  title?: string;
};

export type BotTrailServerTruth = {
  phase?: 'idle' | 'armed' | 'trailing' | 'unknown';
  peakPnlUsd: number;
  lockPnlUsd: number;
  lockRoePct: number;
  stopPx: number | null;
  wouldCloseNow?: boolean;
  stateTracked?: boolean;
};

/** Active bot stop — profit SL when green; max-loss cap from settings when red. */
export function trailStopForOpenPosition(opts: {
  entryPx: number;
  szi: number;
  markPx: number;
  unrealizedPnlUsd: number;
  leverage: number;
  coin: string;
  peakPnlUsd?: number;
  stopLossMarginPct?: number;
  holdMs?: number;
  serverTrail?: BotTrailServerTruth;
}): ActiveSlDisplay {
  const absSize = Math.abs(opts.szi);
  if (opts.entryPx <= 0 || absSize <= 0 || opts.markPx <= 0) {
    return { stopPx: null, armed: false, kind: 'idle', label: '—' };
  }

  const side = opts.szi >= 0 ? ('long' as const) : ('short' as const);
  const notional = absSize * opts.markPx;
  const collateral = notional / Math.max(1, opts.leverage);
  const server = opts.serverTrail;
  const peak = Math.max(
    server?.peakPnlUsd ?? 0,
    opts.peakPnlUsd ?? opts.unrealizedPnlUsd,
    opts.unrealizedPnlUsd
  );
  const slPct = effectiveStopLossPct(opts.stopLossMarginPct ?? 0);

  if (server?.wouldCloseNow && server.stopPx != null) {
    return {
      stopPx: server.stopPx,
      armed: true,
      kind: 'close_now',
      label: fmtStopPx(server.stopPx),
      title: `Mark crossed bot profit SL at ${fmtStopPx(server.stopPx)}. Bot should market-close now.`,
    };
  }

  if (server?.stateTracked && server.stopPx != null) {
    const isLong = side === 'long';
    const displayStop = server.stopPx;
    const locksProfit = server.lockPnlUsd > 0;
    const breached =
      displayStop > 0 &&
      (isLong ? opts.markPx <= displayStop : opts.markPx >= displayStop);
    if (breached) {
      return {
        stopPx: displayStop,
        armed: true,
        kind: 'close_now',
        label: fmtStopPx(displayStop),
        title: `Price crossed profit SL at ${fmtStopPx(displayStop)} — bot should close in profit.`,
      };
    }
    return {
      stopPx: displayStop,
      armed: true,
      kind: locksProfit ? 'profit' : 'loss_cap',
      label: fmtStopPx(displayStop),
      title: locksProfit
        ? `Exact bot trailing stop at ${fmtStopPx(displayStop)} (live server state).`
        : `Exact bot loss stop at ${fmtStopPx(displayStop)} (live server state).`,
    };
  }

  // A successful server snapshot with no stop means the bot truly has no active
  // trail yet. Do not replace that truth with the legacy frontend estimator.
  if (server) {
    return {
      stopPx: null,
      armed: false,
      kind: 'arming',
      label: 'Arming',
      title: `Bot trail phase: ${server.phase ?? 'idle'} — no active server stop yet.`,
    };
  }

  const trail = computeDynamicTrailStopPx({
    entryPx: opts.entryPx,
    szi: opts.szi,
    unrealizedPnlUsd: opts.unrealizedPnlUsd,
    peakPnlUsd: peak,
    coin: opts.coin,
    notionalUsd: notional,
    collateralUsd: collateral,
    holdMs: opts.holdMs,
    timeInProfitMs: opts.unrealizedPnlUsd > 0 ? opts.holdMs : 0,
  });

  if (trail.armed && trail.stopPx != null) {
    return {
      stopPx: trail.stopPx,
      armed: true,
      kind: 'profit',
      label: fmtStopPx(trail.stopPx),
      title: `Profit SL — bot closes in profit if price crosses ${fmtStopPx(trail.stopPx)}.`,
    };
  }

  if (opts.unrealizedPnlUsd > 0) {
    const lossPx =
      slPct > 0 ? lossStopPricePx(side, opts.entryPx, absSize, collateral, slPct) : null;
    const roe = roePct(opts.unrealizedPnlUsd, collateral);
    return {
      stopPx: lossPx,
      armed: false,
      kind: 'arming',
      label: lossPx != null ? fmtStopPx(lossPx) : '—',
      title: `Profit SL arms after 2m green — floor stays in plus (now ${roe.toFixed(2)}% ROE).`,
    };
  }

  if (slPct > 0) {
    const lossPx = lossStopPricePx(side, opts.entryPx, absSize, collateral, slPct);
    return {
      stopPx: lossPx,
      armed: false,
      kind: 'loss_cap',
      label: lossPx != null ? fmtStopPx(lossPx) : '—',
      title: `Max stop loss — bot closes if price crosses ${lossPx != null ? fmtStopPx(lossPx) : '—'}.`,
    };
  }

  return {
    stopPx: null,
    armed: false,
    kind: 'idle',
    label: '—',
    title: 'No max loss configured.',
  };
}
