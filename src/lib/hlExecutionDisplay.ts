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
