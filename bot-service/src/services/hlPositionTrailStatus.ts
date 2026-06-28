import { fetchHlClearinghouseState } from './hlInfo';
import { getDynamicTrailRecord } from './profitTrailState';
import {
  isTrailStopCrossed,
  markFromPosition,
  profitTrailLockRoePct,
  profitLockStage1RoePct,
  resolveProfitTrailLockRoe,
  shouldArmProfitTrail,
  shouldUpgradeToFullTrail,
  stopPxForRoePct,
  type TrailPhase,
} from './dynamicTrailingStop';

function ratchetStop(
  direction: 'LONG' | 'SHORT',
  current: number | null,
  candidate: number
): number {
  if (current == null) return candidate;
  return direction === 'LONG' ? Math.max(current, candidate) : Math.min(current, candidate);
}

export type HlPositionTrailSnapshot = {
  coin: string;
  phase: TrailPhase | 'unknown';
  armed: boolean;
  currentPnlUsd: number;
  currentRoePct: number;
  peakPnlUsd: number;
  peakRoePct: number;
  lockRoePct: number;
  lockPnlUsd: number;
  stopPx: number | null;
  markPx: number;
  entryPx: number;
  wouldCloseNow: boolean;
  stateTracked: boolean;
};

function positionKey(user: string, coin: string): string {
  return `${user.toLowerCase()}:${coin}`;
}

function roePct(pnlUsd: number, collateralUsd: number): number {
  if (collateralUsd <= 0) return 0;
  return (pnlUsd / collateralUsd) * 100;
}

/** Bot-side truth for profit trail — same numbers the monitor uses. */
export async function getHlPositionTrailSnapshots(
  userAddress: `0x${string}`
): Promise<HlPositionTrailSnapshot[]> {
  const state = await fetchHlClearinghouseState(userAddress);
  const rows = state?.assetPositions ?? [];
  const out: HlPositionTrailSnapshot[] = [];

  for (const row of rows) {
    const pos = row.position;
    if (!pos) continue;
    const coin = pos.coin;
    const szi = Number.parseFloat(pos.szi || '0');
    const entryPx = Number.parseFloat(pos.entryPx || '0');
    const currentPnlUsd = Number.parseFloat(pos.unrealizedPnl || '0') || 0;
    if (!coin || !szi || entryPx <= 0) continue;

    const absSize = Math.abs(szi);
    const markPx = markFromPosition(entryPx, szi, currentPnlUsd);
    const lev = Math.max(1, Number(pos.leverage?.value ?? 10));
    const notional = absSize * markPx;
    const collateral = notional > 0 ? notional / lev : 0;
    const rec = getDynamicTrailRecord(positionKey(userAddress, coin));
    const stateTracked = Boolean(
      rec && (rec.phase === 'trailing' || rec.phase === 'profit_lock')
    );

    const peakPnlUsd = Math.max(rec?.highestPnlSinceEntry ?? currentPnlUsd, currentPnlUsd);
    const peakRoePct = roePct(peakPnlUsd, collateral);
    const armed = shouldArmProfitTrail(currentPnlUsd, collateral);
    const trailPhase: TrailPhase =
      rec?.phase === 'trailing' || rec?.phase === 'profit_lock'
        ? rec.phase
        : armed
          ? shouldUpgradeToFullTrail(peakPnlUsd, collateral)
            ? 'trailing'
            : 'profit_lock'
          : 'idle';
    const lockRoePct = armed
      ? resolveProfitTrailLockRoe(trailPhase, peakPnlUsd, collateral)
      : 0;
    const lockPnlUsd = armed ? collateral * (lockRoePct / 100) : 0;
    const direction = szi >= 0 ? ('LONG' as const) : ('SHORT' as const);
    const candidateStop =
      armed && collateral > 0
        ? stopPxForRoePct(direction, entryPx, absSize, collateral, lockRoePct)
        : null;
    const stopPx =
      armed && candidateStop != null
        ? ratchetStop(direction, rec?.currentTrailStop ?? null, candidateStop)
        : null;
    const wouldCloseNow =
      armed && stopPx != null && isTrailStopCrossed(direction, markPx, stopPx);

    out.push({
      coin,
      phase: rec?.phase ?? 'unknown',
      armed,
      currentPnlUsd,
      currentRoePct: roePct(currentPnlUsd, collateral),
      peakPnlUsd,
      peakRoePct,
      lockRoePct,
      lockPnlUsd,
      stopPx,
      markPx,
      entryPx,
      wouldCloseNow,
      stateTracked,
    });
  }

  return out;
}
