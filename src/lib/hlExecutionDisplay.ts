/** Mirrors bot-service/src/services/hlExecutionState.ts — Opening trade is order-only. */

export type BotExecutionStateName =
  | 'CANDIDATE'
  | 'WAITING_CONFIRMATION'
  | 'BLOCKED'
  | 'ORDER_SUBMITTED'
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
  return state === 'ORDER_SUBMITTED' || state === 'ORDER_CONFIRMED';
}

export function executionHeadline(snap: BotExecutionSnapshot | null | undefined): string | null {
  if (!snap?.state) return null;
  if (isOpeningTradeState(snap.state)) return 'Opening trade';
  if (snap.state === 'WAITING_CONFIRMATION') return 'Waiting confirmation';
  if (snap.state === 'BLOCKED') return 'Setup blocked';
  if (snap.state === 'ORDER_FAILED') return 'Order failed';
  if (snap.state === 'CANDIDATE') return 'Candidate';
  return null;
}
