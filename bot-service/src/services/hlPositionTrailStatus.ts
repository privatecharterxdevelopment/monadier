import { isTrailStopCrossed } from './dynamicTrailingStop';
import { fetchHlClearinghouseState } from './hlInfo';
import { getDynamicTrailRecord } from './profitTrailState';

/** Exact bot-side trail state for one live Hyperliquid position. */
export type HlPositionTrailSnapshot = {
  coin: string;
  phase: string;
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
  favorableExtremePx: number | null;
  trailDistancePx: number | null;
  wouldCloseNow: boolean;
  stateTracked: boolean;
};

export async function getHlPositionTrailSnapshots(
  wallet: `0x${string}`
): Promise<HlPositionTrailSnapshot[]> {
  const state = await fetchHlClearinghouseState(wallet);
  const snapshots: HlPositionTrailSnapshot[] = [];

  for (const asset of state?.assetPositions ?? []) {
    const position = asset.position;
    const coin = position?.coin?.trim().toUpperCase();
    const size = Number(position?.szi ?? 0);
    const entryPx = Number(position?.entryPx ?? 0);
    const currentPnlUsd = Number(position?.unrealizedPnl ?? 0);
    const leverage = Math.max(1, Number(position?.leverage?.value ?? 1));

    if (
      !coin ||
      !Number.isFinite(size) ||
      Math.abs(size) < 1e-12 ||
      !Number.isFinite(entryPx) ||
      entryPx <= 0
    ) {
      continue;
    }

    const absSize = Math.abs(size);
    const markPx = entryPx + currentPnlUsd / size;
    const livePositionValue = Math.abs(Number(position?.positionValue ?? 0));
    const notionalUsd =
      Number.isFinite(livePositionValue) && livePositionValue > 0
        ? livePositionValue
        : absSize * markPx;
    const collateralUsd = notionalUsd / leverage;
    const currentRoePct =
      collateralUsd > 0 ? (currentPnlUsd / collateralUsd) * 100 : 0;
    const record = getDynamicTrailRecord(`${wallet.toLowerCase()}:${coin}`);
    const peakPnlUsd = record?.highestPnlSinceEntry ?? Math.max(0, currentPnlUsd);
    const peakRoePct =
      collateralUsd > 0 ? (peakPnlUsd / collateralUsd) * 100 : 0;
    const stopPx = record?.currentTrailStop ?? null;
    const lockPnlUsd =
      stopPx != null
        ? size > 0
          ? (stopPx - entryPx) * absSize
          : (entryPx - stopPx) * absSize
        : 0;
    const lockRoePct =
      collateralUsd > 0 ? (lockPnlUsd / collateralUsd) * 100 : 0;
    const armed =
      record != null && record.phase !== 'idle' && stopPx != null;

    snapshots.push({
      coin,
      phase: record?.phase ?? 'idle',
      armed,
      currentPnlUsd,
      currentRoePct,
      peakPnlUsd,
      peakRoePct,
      lockRoePct,
      lockPnlUsd,
      stopPx,
      markPx,
      entryPx,
      favorableExtremePx: record?.highestPriceSinceEntry ?? null,
      trailDistancePx:
        record != null && record.lastTrailDistancePx > 0
          ? record.lastTrailDistancePx
          : null,
      wouldCloseNow:
        armed &&
        stopPx != null &&
        isTrailStopCrossed(size > 0 ? 'LONG' : 'SHORT', markPx, stopPx),
      stateTracked: record != null,
    });
  }

  return snapshots;
}
