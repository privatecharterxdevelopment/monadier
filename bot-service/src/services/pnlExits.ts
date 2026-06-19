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
  // Close when uPnL falls to the trailed floor — even if slippage would print slightly negative.
  return pnlUsd <= floorUsd;
}

/** Trailing profit floor from peak uPnL. */
export function trailingProfitLockFloorUsd(
  peakUsd: number,
  minFloorUsd: number,
  trailBufferUsd: number
): number {
  if (peakUsd <= 0) return minFloorUsd;
  return Math.max(minFloorUsd, peakUsd - trailBufferUsd);
}
