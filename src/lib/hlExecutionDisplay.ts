/** Mirrors bot-service/src/services/hlExecutionState.ts — Opening trade is in-flight entry/SL. */

export type BotExecutionStateName =
  | 'CANDIDATE'
  | 'WAITING_CONFIRMATION'
  | 'BLOCKED'
  | 'ORDER_SUBMITTED'
  | 'ENTRY_SUBMITTED'
  | 'ENTRY_PARTIALLY_FILLED'
  | 'ENTRY_FILLED'
  | 'SL_PENDING'
  | 'SL_CONFIRMED'
  | 'SL_RECOVERY'
  | 'SL_FAILED_FLATTENING'
  | 'POSITION_CLOSED'
  | 'CRITICAL_UNPROTECTED_POSITION'
  | 'ORDER_CONFIRMED'
  | 'ORDER_FAILED';

export type BotExecutionSnapshot = {
  state: BotExecutionStateName;
  longClass?: string | null;
  code?: string | null;
  reason?: string;
  coin?: string | null;
  direction?: string | null;
};

export function isOpeningTradeState(
  state: BotExecutionStateName | null | undefined
): boolean {
  return (
    state === 'ORDER_SUBMITTED' ||
    state === 'ENTRY_SUBMITTED' ||
    state === 'ENTRY_PARTIALLY_FILLED' ||
    state === 'ENTRY_FILLED' ||
    state === 'SL_PENDING' ||
    state === 'SL_RECOVERY' ||
    state === 'SL_FAILED_FLATTENING'
  );
}

export type BotExecutionDiagnostic = {
  coin?: string;
  direction?: string | null;
  scan?: string | null;
  scanPassed?: boolean;
  gatesPassed?: string[];
  blockedBy?: string | null;
  blockedReason?: string | null;
  orderSent?: boolean;
  fillConfirmed?: boolean;
  fillSize?: number | null;
  fillPx?: number | null;
  emergencySlPosted?: boolean;
  emergencySlConfirmed?: boolean;
  emergencySlPx?: number | null;
  userSlPercent?: number | null;
};

export type LiveBotPositionView = {
  coin: string;
  direction: 'LONG' | 'SHORT';
  entryPx: number;
  absSize: number;
  leverage: number;
  marginUsd: number;
  upnlUsd: number;
  netPnlUsd: number;
  emergencySlPx: number | null;
  emergencySlConfirmed: boolean;
  profitSlPx: number | null;
  profitSlConfirmed: boolean;
  profitSlMemoryPx?: number | null;
  profitSlStatus:
    | 'idle'
    | 'PROFIT_SL_PENDING'
    | 'PROFIT_SL_CONFIRMED'
    | 'PROFIT_SL_UNVERIFIED';
  trailPhase?: string | null;
  computedTrailStopPx?: number | null;
};

export function formatExecutionDiagnosticLine(
  d: BotExecutionDiagnostic | null | undefined
): string | null {
  if (!d) return null;
  const parts: string[] = [];
  if (d.blockedBy) {
    parts.push(`Blocked: ${d.blockedBy}${d.blockedReason ? ` — ${d.blockedReason}` : ''}`);
  }
  if (d.orderSent) parts.push(d.fillConfirmed ? 'Fill confirmed' : 'Order sent, fill pending');
  if (d.emergencySlConfirmed) {
    parts.push(
      `Emergency-SL confirmed${d.emergencySlPx ? ` @ ${d.emergencySlPx}` : ''}${
        d.userSlPercent ? ` (${d.userSlPercent}% margin)` : ''
      }`
    );
  } else if (d.fillConfirmed && (d.userSlPercent ?? 0) > 0) {
    parts.push('Emergency-SL pending exchange confirm');
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

export function formatLiveSlLine(p: LiveBotPositionView): string {
  const e = p.emergencySlConfirmed
    ? `Emergency-SL ${p.emergencySlPx ?? '—'} (HL confirmed)`
    : 'Emergency-SL not confirmed';
  const profit = p.profitSlConfirmed
    ? `Profit-SL ${p.profitSlPx ?? '—'} (HL confirmed)`
    : p.profitSlStatus === 'PROFIT_SL_UNVERIFIED'
      ? `Profit-SL ${p.profitSlPx ?? '—'} UNVERIFIED`
      : p.profitSlStatus === 'PROFIT_SL_PENDING'
        ? 'Profit-SL PENDING'
        : 'Profit-SL idle';
  return `${p.coin} ${e} · ${profit}`;
}

export function executionHeadline(snap: BotExecutionSnapshot | null | undefined): string | null {
  if (!snap?.state) return null;
  if (isOpeningTradeState(snap.state)) return 'Opening trade';
  if (snap.state === 'WAITING_CONFIRMATION') return 'Waiting confirmation';
  if (snap.state === 'BLOCKED') return 'Setup blocked';
  if (snap.state === 'ORDER_FAILED') return 'Order failed';
  if (snap.state === 'CANDIDATE') return 'Candidate';
  if (snap.state === 'SL_CONFIRMED') return 'Protected';
  if (snap.state === 'CRITICAL_UNPROTECTED_POSITION') return 'Unprotected position';
  if (snap.state === 'POSITION_CLOSED') return 'Position closed';
  return null;
}
