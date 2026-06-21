/** Buffer above profit-lock % before the lock activates (e.g. lock 1% → activate at 1.1%). */
export const PROFIT_LOCK_ACTIVATE_BUFFER = 0.1;

export type PnlExitSettings = {
  takeProfitPercent: number;
  profitLockPercent: number;
};

export function profitLockActivateAt(lockPercent: number): number {
  return lockPercent + PROFIT_LOCK_ACTIVATE_BUFFER;
}

export function shouldTakeProfitOnPnl(pnlPercent: number, takeProfitPercent: number): boolean {
  return takeProfitPercent > 0 && pnlPercent >= takeProfitPercent;
}

export function shouldStopLossOnPnl(pnlPercent: number, stopLossPercent: number): boolean {
  return stopLossPercent > 0 && pnlPercent <= -stopLossPercent;
}

export function shouldActivateProfitLock(
  pnlPercent: number,
  profitLockPercent: number,
  alreadyLocked: boolean
): boolean {
  if (alreadyLocked || profitLockPercent <= 0) return false;
  return pnlPercent >= profitLockActivateAt(profitLockPercent);
}

/** USD profit lock — activate trail once uPnL hits this, close if it falls to floor. */
export function shouldActivateProfitLockUsd(
  pnlUsd: number,
  activateUsd: number,
  alreadyLocked: boolean
): boolean {
  if (alreadyLocked || activateUsd <= 0) return false;
  return pnlUsd >= activateUsd;
}

export function shouldCloseProfitLockUsd(
  pnlUsd: number,
  floorUsd: number,
  alreadyLocked: boolean
): boolean {
  if (!alreadyLocked || floorUsd <= 0) return false;
  return pnlUsd <= floorUsd;
}

/** Once green, never hold red — close at breakeven or scratch. */
export function shouldCloseNeverRedAfterGreen(
  pnlUsd: number,
  peakUsd: number,
  minPeakUsd: number
): boolean {
  return minPeakUsd > 0 && peakUsd >= minPeakUsd && pnlUsd <= 0;
}

/** Close when price pulls back from peak — needs a real retracement, not noise. */
export function shouldClosePeakDropUsd(
  pnlUsd: number,
  peakUsd: number,
  minPeakUsd: number,
  dropBufferUsd: number,
  peakDropFraction = 0.22
): boolean {
  if (peakUsd < minPeakUsd || pnlUsd <= 0 || dropBufferUsd <= 0) return false;
  const drop = peakUsd - pnlUsd;
  const minDrop = Math.max(dropBufferUsd, peakUsd * peakDropFraction);
  return drop >= minDrop;
}

/** Close when uPnL stayed above min profit long enough (no pullback needed). */
export function shouldCloseProfitHoldTimeout(
  pnlUsd: number,
  minProfitUsd: number,
  inProfitSinceMs: number | undefined,
  maxHoldMs: number,
  nowMs: number = Date.now()
): boolean {
  if (minProfitUsd <= 0 || maxHoldMs <= 0 || pnlUsd < minProfitUsd) return false;
  if (inProfitSinceMs == null) return false;
  return nowMs - inProfitSinceMs >= maxHoldMs;
}

/** Peak-ratchet profit floor — exit when uPnL falls to this level (never moves down). */
export function trailingProfitLockFloorUsd(
  peakUsd: number,
  minFloorUsd: number,
  trailBufferUsd: number
): number {
  if (peakUsd <= 0) return minFloorUsd;
  return Math.max(minFloorUsd, peakUsd - trailBufferUsd);
}

/** Wider trail on strong runs — min retrace as % of peak so noise does not exit winners. */
export function effectiveProfitTrailBufferUsd(
  peakUsd: number,
  baseBufferUsd: number,
  runBias: 'strong_run' | 'run' | 'neutral' | 'fade' | 'reversal',
  thesisIntact: boolean,
  minPeakFraction: number,
  strongRunMult: number
): number {
  let buf = baseBufferUsd;
  if (thesisIntact && (runBias === 'strong_run' || runBias === 'run')) {
    buf *= strongRunMult;
  }
  if (peakUsd > 0 && minPeakFraction > 0) {
    buf = Math.max(buf, peakUsd * minPeakFraction);
  }
  return buf;
}

/** Chart: trail line sits below live uPnL; close still uses peak-ratchet floor. */
export function trailingProfitLockDisplayFloorUsd(
  peakUsd: number,
  currentUsd: number,
  minFloorUsd: number,
  trailBufferUsd: number
): { displayFloorUsd: number; closeFloorUsd: number; breached: boolean } {
  const closeFloorUsd = trailingProfitLockFloorUsd(peakUsd, minFloorUsd, trailBufferUsd);
  const breached =
    closeFloorUsd > 0 && currentUsd > 0 && currentUsd <= closeFloorUsd;
  if (breached || currentUsd <= 0) {
    return { displayFloorUsd: closeFloorUsd, closeFloorUsd, breached };
  }
  const liveBelow = Math.max(minFloorUsd, currentUsd - trailBufferUsd);
  const displayFloorUsd = Math.min(closeFloorUsd, liveBelow);
  return { displayFloorUsd, closeFloorUsd, breached };
}
