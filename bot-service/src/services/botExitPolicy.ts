/**
 * Who may flatten a red book. Profit-trail is never treated as guaranteed green.
 */
export const RED_EXIT_ALLOW = new Set([
  'manual',
  'sl_fail_safe_flatten',
  'emergency_close',
  'stop_loss',
  'liquidation',
  'liquidation_protection',
]);

export function isRecoveryOrEmergencyExit(reason: string): boolean {
  return RED_EXIT_ALLOW.has(reason);
}

export function isProfitTrailExit(reason: string): boolean {
  return (
    reason === 'trailing_stop' ||
    reason === 'profit_lock' ||
    reason === 'profit_grab_peak' ||
    reason === 'profit_grab_timeout' ||
    reason === 'take_profit'
  );
}

/** Bot flatten policy. Exchange stop fills are prevented by cancelling profit SL when red. */
export function shouldAllowBotFlatten(opts: {
  reason: string;
  pnlUsd: number;
  netPnlUsd: number;
  profitOnlyExits: boolean;
  /** User-configured loss SL % — 0 = profit-trail only (no bot loss flatten). */
  userStopLossPct?: number;
}): { ok: boolean; error?: string } {
  const { reason, pnlUsd, netPnlUsd, profitOnlyExits } = opts;
  const userSl = Math.max(0, Number(opts.userStopLossPct) || 0);

  if (reason === 'manual') return { ok: true };

  if (profitOnlyExits && netPnlUsd < 0) {
    const unavoidable =
      reason === 'liquidation' || reason === 'liquidation_protection';
    if (unavoidable) return { ok: true };

    const userLossSl =
      userSl > 0 &&
      (reason === 'stop_loss' ||
        reason === 'emergency_close' ||
        reason === 'sl_fail_safe_flatten');
    if (userLossSl) return { ok: true };

    return {
      ok: false,
      error: 'Profit-only mode — bot will not close net-negative (fees included)',
    };
  }

  if (isRecoveryOrEmergencyExit(reason)) {
    if (userSl <= 0 && profitOnlyExits) {
      return {
        ok: false,
        error: 'No user loss SL — emergency flatten blocked (profit-only)',
      };
    }
    return { ok: true };
  }

  if (isProfitTrailExit(reason)) {
    if (pnlUsd <= 0 || netPnlUsd <= 0) {
      return {
        ok: false,
        error: 'Profit trail will not flatten red/net-negative (fees+slippage)',
      };
    }
    return { ok: true };
  }

  if (profitOnlyExits && pnlUsd < 0) {
    return { ok: false, error: 'Bot does not close in red (profitOnlyExits)' };
  }
  return { ok: true };
}
