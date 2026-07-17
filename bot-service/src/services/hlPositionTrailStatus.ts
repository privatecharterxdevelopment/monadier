/** Trail snapshot API — stubbed under Jun-26 engine (trail internals differ). */
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
  wouldCloseNow: boolean;
  stateTracked: boolean;
};

export async function getHlPositionTrailSnapshots(
  _wallet: `0x${string}`
): Promise<HlPositionTrailSnapshot[]> {
  return [];
}
