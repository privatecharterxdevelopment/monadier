import { fetchHlClearinghouseState } from './hlInfo';
import { getDynamicTrailRecord } from './profitTrailState';
import {
  isTrailStopCrossed,
  markFromPosition,
  profitTrailLockRoePct,
  profitLockStage1RoePct,
  resolveProfitTrailLockRoe,
  shouldArmProfitTrail,
  shouldCloseProfitTrailInGreen,
  shouldUpgradeToFullTrail,
  stopPxForRoePct,
  type DynamicTrailRecord,
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
    const direction = szi >= 0 ? ('LONG' as const) : ('SHORT' as const);

    const peakFromExtreme =
      rec?.highestPriceSinceEntry != null && absSize > 0
        ? direction === 'LONG'
          ? (rec.highestPriceSinceEntry - entryPx) * absSize
          : (entryPx - rec.highestPriceSinceEntry) * absSize
        : 0;
    const peakPnlUsd = Math.max(
      rec?.highestPnlSinceEntry ?? currentPnlUsd,
      currentPnlUsd,
      peakFromExtreme
    );
    const peakRoePct = roePct(peakPnlUsd, collateral);
    const armed =
      rec?.phase === 'profit_lock' ||
      rec?.phase === 'trailing' ||
      shouldArmProfitTrail(peakPnlUsd, collateral);
    const storedPhase: TrailPhase =
      rec?.phase === 'trailing' || rec?.phase === 'profit_lock'
        ? rec.phase
        : armed
          ? 'profit_lock'
          : 'idle';
    // Display/monitor truth: peak may qualify for S2 even if persisted phase lags at S1.
    const trailPhase: TrailPhase =
      storedPhase === 'trailing' ||
      (armed && shouldUpgradeToFullTrail(peakPnlUsd, collateral))
        ? 'trailing'
        : storedPhase;
    const lockRoePct = armed
      ? resolveProfitTrailLockRoe(trailPhase, peakPnlUsd, collateral, 1, {
          notionalUsd: notional,
          coin,
        })
      : 0;
    const lockPnlUsd = armed ? collateral * (lockRoePct / 100) : 0;
    const candidateStop =
      armed && collateral > 0
        ? stopPxForRoePct(direction, entryPx, absSize, collateral, lockRoePct)
        : null;
    const stopPx =
      armed && candidateStop != null
        ? ratchetStop(direction, rec?.currentTrailStop ?? null, candidateStop)
        : null;
    const evalRec =
      rec != null
        ? ({ ...rec, phase: trailPhase } as DynamicTrailRecord)
        : null;
    const wouldCloseNow =
      armed &&
      evalRec != null &&
      shouldCloseProfitTrailInGreen(evalRec, {
        coin,
        pnlUsd: currentPnlUsd,
        collateralUsd: collateral,
        direction,
        markPrice: markPx,
        nowMs: Date.now(),
        trailDistanceMult: 1,
        notionalUsd: notional,
      });

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
