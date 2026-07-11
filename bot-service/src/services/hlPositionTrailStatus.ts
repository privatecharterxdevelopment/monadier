import { fetchHlClearinghouseState } from './hlInfo';
import { getDynamicTrailRecord } from './profitTrailState';
import { markFromPosition, type TrailPhase } from './dynamicTrailingStop';

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

export async function getHlPositionTrailSnapshots(
  wallet: `0x${string}`
): Promise<HlPositionTrailSnapshot[]> {
  const state = await fetchHlClearinghouseState(wallet);
  const positions = state?.assetPositions ?? [];
  if (!positions.length) return [];

  const out: HlPositionTrailSnapshot[] = [];
  for (const ap of positions) {
    const pos = ap?.position;
    if (!pos) continue;
    const szi = Number(pos.szi);
    if (!Number.isFinite(szi) || szi === 0) continue;

    const coin = String(pos.coin ?? '').toUpperCase();
    const entryPx = Number(pos.entryPx) || 0;
    const pnlUsd = Number(pos.unrealizedPnl) || 0;
    const leverageRaw = pos.leverage as number | { value?: number } | undefined;
    const leverage =
      typeof leverageRaw === 'number'
        ? leverageRaw
        : Number(leverageRaw?.value) || 1;
    const absSize = Math.abs(szi);
    const notional = absSize * (entryPx || 0);
    const collateral = leverage > 0 && notional > 0 ? notional / leverage : 0;
    const markPx = markFromPosition(entryPx, szi, pnlUsd);
    const roePct = collateral > 0 ? (pnlUsd / collateral) * 100 : 0;

    const key = `${wallet.toLowerCase()}:${coin}`;
    const rec = getDynamicTrailRecord(key);
    const peakPnl = rec?.highestPnlSinceEntry ?? Math.max(0, pnlUsd);
    const peakRoe = collateral > 0 ? (peakPnl / collateral) * 100 : 0;

    out.push({
      coin,
      phase: rec?.phase ?? 'unknown',
      armed: Boolean(rec && rec.phase !== 'idle'),
      currentPnlUsd: pnlUsd,
      currentRoePct: roePct,
      peakPnlUsd: peakPnl,
      peakRoePct: peakRoe,
      lockRoePct: 0,
      lockPnlUsd: 0,
      stopPx: rec?.currentTrailStop ?? null,
      markPx,
      entryPx,
      wouldCloseNow: false,
      stateTracked: Boolean(rec),
    });
  }
  return out;
}
