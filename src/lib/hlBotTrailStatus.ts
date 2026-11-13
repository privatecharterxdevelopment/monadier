import { getBotApiBase } from './signalService';

export type HlBotTrailSnapshot = {
  coin: string;
  phase: 'idle' | 'pending' | 'armed' | 'trailing' | 'unknown';
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
  profitSlPx?: number | null;
  profitSlConfirmed?: boolean;
  profitSlStatus?:
    | 'idle'
    | 'PROFIT_SL_PENDING'
    | 'PROFIT_SL_CONFIRMED'
    | 'PROFIT_SL_UNVERIFIED';
  emergencySlPx?: number | null;
  emergencySlConfirmed?: boolean;
  computedStopPx?: number | null;
};

export async function fetchHlBotTrailSnapshots(
  wallet: string
): Promise<HlBotTrailSnapshot[]> {
  try {
    const base = getBotApiBase();
    const res = await fetch(
      `${base}/api/hl-position-trails?wallet=${encodeURIComponent(wallet)}`
    );
    if (!res.ok) return [];
    const json = (await res.json()) as { success?: boolean; trails?: HlBotTrailSnapshot[] };
    return json.success && Array.isArray(json.trails) ? json.trails : [];
  } catch {
    return [];
  }
}
