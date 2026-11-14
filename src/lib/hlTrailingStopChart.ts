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
  /** Exchange-confirmed profit SL only — never a locally computed trail. */
  exchangeProfitSlPx?: number | null;
  exchangeProfitSlConfirmed?: boolean;
  /** Exchange-confirmed emergency / user SL. */
  exchangeEmergencySlPx?: number | null;
  exchangeEmergencySlConfirmed?: boolean;
}): HlChartPositionOverlay | undefined {
  const entryPx = opts.entryPx;
  if (entryPx <= 0 || !opts.szi) return undefined;

  const side = opts.szi >= 0 ? ('long' as const) : ('short' as const);
  const lev = opts.leverage ?? 10;
  const peak = Math.max(opts.peakPnlUsd, opts.unrealizedPnlUsd);

  const profitConfirmed =
    Boolean(opts.exchangeProfitSlConfirmed) &&
    opts.exchangeProfitSlPx != null &&
    opts.exchangeProfitSlPx > 0;
  const emergencyConfirmed =
    Boolean(opts.exchangeEmergencySlConfirmed) &&
    opts.exchangeEmergencySlPx != null &&
    opts.exchangeEmergencySlPx > 0;
  const mark = opts.entryPx + opts.unrealizedPnlUsd / opts.szi;
  const trailStopPx = profitConfirmed ? opts.exchangeProfitSlPx ?? undefined : undefined;
  const trailBreached =
    trailStopPx != null &&
    (side === 'long' ? mark <= trailStopPx : mark >= trailStopPx);

  const tpPct = opts.takeProfitMarginPct ?? 0;

  return {
    entryPx,
    liqPx: undefined,
    side,
    trailStopPx,
    trailStopLocked: profitConfirmed,
    trailFloorUsd: peak,
    trailCloseFloorUsd: peak,
    trailBreached,
    unrealizedPnlUsd: opts.unrealizedPnlUsd,
    peakPnlUsd: peak,
    stopLossPx: emergencyConfirmed ? opts.exchangeEmergencySlPx ?? undefined : undefined,
    takeProfitPx: marginTakeProfitPx(entryPx, opts.szi, lev, tpPct) ?? undefined,
    stopLossMarginPct: emergencyConfirmed ? opts.stopLossMarginPct : undefined,
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

export type SlVerification = 'verified' | 'unverified' | 'pending' | 'stale' | 'none';

export type ActiveSlDisplay = {
  stopPx: number | null;
  armed: boolean;
  kind: 'profit' | 'arming' | 'loss_cap' | 'idle' | 'close_now';
  label: string;
  sublabel?: string;
  title?: string;
  verification?: SlVerification;
};

export type BotTrailServerTruth = {
  phase?: 'idle' | 'pending' | 'armed' | 'trailing' | 'unknown';
  peakPnlUsd: number;
  lockPnlUsd: number;
  lockRoePct: number;
  stopPx: number | null;
  wouldCloseNow?: boolean;
  stateTracked?: boolean;
  profitSlPx?: number | null;
  profitSlConfirmed?: boolean;
  profitSlStatus?:
    | 'idle'
    | 'PROFIT_SL_PENDING'
    | 'PROFIT_SL_CONFIRMED'
    | 'PROFIT_SL_UNVERIFIED';
  emergencySlPx?: number | null;
  emergencySlConfirmed?: boolean;
};

/** Map /api/hl-position-trails row → UI truth. Computed stopPx is ignored unless confirmed. */
export function toBotTrailServerTruth(
  t:
    | {
        phase?: string;
        peakPnlUsd: number;
        lockPnlUsd: number;
        lockRoePct: number;
        stopPx: number | null;
        wouldCloseNow?: boolean;
        stateTracked?: boolean;
        profitSlPx?: number | null;
        profitSlConfirmed?: boolean;
        profitSlStatus?: 'idle' | 'PROFIT_SL_PENDING' | 'PROFIT_SL_CONFIRMED';
        emergencySlPx?: number | null;
        emergencySlConfirmed?: boolean;
      }
    | undefined
): BotTrailServerTruth | undefined {
  if (!t) return undefined;
  const phase =
    t.phase === 'idle' || t.phase === 'pending' || t.phase === 'armed' || t.phase === 'trailing'
      ? t.phase
      : 'unknown';
  return {
    phase,
    peakPnlUsd: t.peakPnlUsd,
    lockPnlUsd: t.lockPnlUsd,
    lockRoePct: t.lockRoePct,
    stopPx: t.profitSlConfirmed ? t.profitSlPx ?? null : null,
    wouldCloseNow: t.wouldCloseNow,
    stateTracked: t.stateTracked,
    profitSlPx: t.profitSlPx ?? null,
    profitSlConfirmed: Boolean(t.profitSlConfirmed),
    profitSlStatus: t.profitSlStatus ?? 'idle',
    emergencySlPx: t.emergencySlPx ?? null,
    emergencySlConfirmed: Boolean(t.emergencySlConfirmed),
  };
}

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
  dataStale?: boolean;
  /** User Let run ON — no profit trail / profit-SL display. */
  letRunHold?: boolean;
}): ActiveSlDisplay {
  const absSize = Math.abs(opts.szi);
  if (opts.entryPx <= 0 || absSize <= 0 || opts.markPx <= 0) {
    return { stopPx: null, armed: false, kind: 'idle', label: '—' };
  }

  const side = opts.szi >= 0 ? ('long' as const) : ('short' as const);
  const server = opts.serverTrail;
  const slPct = effectiveStopLossPct(opts.stopLossMarginPct ?? 0);
  const stale = Boolean(opts.dataStale);
  const staleNote = stale ? ' · data STALE' : '';

  if (opts.letRunHold) {
    const exchangeEmergency =
      server?.emergencySlConfirmed && server.emergencySlPx != null && server.emergencySlPx > 0
        ? server.emergencySlPx
        : null;
    return {
      stopPx: exchangeEmergency,
      armed: exchangeEmergency != null,
      kind: 'idle',
      label: 'Let run',
      sublabel: exchangeEmergency
        ? `Hold · E-SL ${fmtStopPx(exchangeEmergency)}`
        : 'Hold · no profit trail',
      verification: stale ? 'stale' : 'verified',
      title: `Let run ON — bot does not trail-close or sync profit-SL${staleNote}`,
    };
  }

  const exchangeProfit =
    server?.profitSlConfirmed && server.profitSlPx != null && server.profitSlPx > 0
      ? server.profitSlPx
      : null;
  const exchangeEmergency =
    server?.emergencySlConfirmed && server.emergencySlPx != null && server.emergencySlPx > 0
      ? server.emergencySlPx
      : null;

  if (exchangeProfit != null) {
    const breached = side === 'long' ? opts.markPx <= exchangeProfit : opts.markPx >= exchangeProfit;
    const emer =
      exchangeEmergency != null
        ? `E-SL ${fmtStopPx(exchangeEmergency)}${server?.emergencySlConfirmed ? '' : ' (unverified)'}`
        : undefined;
    return {
      stopPx: exchangeProfit,
      armed: true,
      kind: breached ? 'close_now' : 'profit',
      label: fmtStopPx(exchangeProfit),
      sublabel: emer ?? 'VERIFIED · Profit-SL HL',
      verification: stale ? 'stale' : 'verified',
      title: `Profit-SL VERIFIED on Hyperliquid ${fmtStopPx(exchangeProfit)}${staleNote}${
        exchangeEmergency ? ` · Emergency ${fmtStopPx(exchangeEmergency)}` : ''
      }`,
    };
  }

  const memoryPx =
    server?.profitSlPx != null && server.profitSlPx > 0 && !server?.profitSlConfirmed
      ? server.profitSlPx
      : null;
  if (memoryPx != null || server?.profitSlStatus === 'PROFIT_SL_UNVERIFIED') {
    const px = memoryPx ?? server?.profitSlPx ?? null;
    return {
      stopPx: px,
      armed: false,
      kind: 'arming',
      label: px != null ? fmtStopPx(px) : 'UNVERIFIED',
      sublabel: 'UNVERIFIED · no HL order',
      verification: stale ? 'stale' : 'unverified',
      title: `Stop px from bot memory only — NOT confirmed on Hyperliquid${staleNote}`,
    };
  }

  if (opts.unrealizedPnlUsd > 0 || server?.profitSlStatus === 'PROFIT_SL_PENDING') {
    return {
      stopPx: exchangeEmergency,
      armed: false,
      kind: 'arming',
      label: 'PENDING',
      sublabel: exchangeEmergency
        ? `E-SL ${fmtStopPx(exchangeEmergency)}`
        : 'Profit-SL pending',
      verification: stale ? 'stale' : 'pending',
      title: `Profit-SL PENDING — waiting for exchange-confirmed order${staleNote}`,
    };
  }

  if (exchangeEmergency != null) {
    return {
      stopPx: exchangeEmergency,
      armed: true,
      kind: 'loss_cap',
      label: fmtStopPx(exchangeEmergency),
      sublabel: 'VERIFIED · Emergency-SL',
      verification: stale ? 'stale' : 'verified',
      title: `Emergency-SL VERIFIED on Hyperliquid ${fmtStopPx(exchangeEmergency)}${staleNote}`,
    };
  }

  if (slPct > 0) {
    return {
      stopPx: null,
      armed: false,
      kind: 'loss_cap',
      label: `E-SL ${slPct}%`,
      sublabel: 'UNVERIFIED',
      verification: 'unverified',
      title: `Configured emergency ${slPct}% margin — not confirmed on Hyperliquid${staleNote}`,
    };
  }

  return {
    stopPx: null,
    armed: false,
    kind: 'idle',
    label: stale ? 'STALE' : '—',
    verification: stale ? 'stale' : 'none',
    title: stale ? `Position data stale${staleNote}` : 'No protective stop configured.',
  };
}
