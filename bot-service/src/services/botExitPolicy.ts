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

/** Bot flatten policy. Gaps / exchange stop fills can still realize a loss. */
export function shouldAllowBotFlatten(opts: {
  reason: string;
  pnlUsd: number;
  netPnlUsd: number;
  profitOnlyExits: boolean;
}): { ok: boolean; error?: string } {
  const { reason, pnlUsd, netPnlUsd, profitOnlyExits } = opts;
  if (reason === 'manual') return { ok: true };
  if (isRecoveryOrEmergencyExit(reason)) return { ok: true };
  if (isProfitTrailExit(reason)) {
    if (pnlUsd <= 0 || netPnlUsd <= 0) {
      return {
        ok: false,
        error:
          'Profit trail will not flatten red/net-negative (fees+slippage). Emergency-SL and gaps can still lose.',
      };
    }
    return { ok: true };
  }
  if (profitOnlyExits && pnlUsd < 0) {
    return { ok: false, error: 'Bot does not close in red (profitOnlyExits)' };
  }
  return { ok: true };
}
