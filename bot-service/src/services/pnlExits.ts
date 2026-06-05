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

export function shouldCloseProfitLock(
  pnlPercent: number,
  profitLockPercent: number,
  alreadyLocked: boolean
): boolean {
  if (!alreadyLocked || profitLockPercent <= 0) return false;
  return pnlPercent <= profitLockPercent && pnlPercent > 0;
}
