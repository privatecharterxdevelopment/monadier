/** Authoritative bot execution state — frontend must not infer Opening trade from scan %. */

export type BotExecutionStateName =
  | 'CANDIDATE'
  | 'WAITING_CONFIRMATION'
  | 'BLOCKED'
  | 'ORDER_SUBMITTED'
  | 'ORDER_CONFIRMED'
  | 'ORDER_FAILED';

export type LongOpportunityClass =
  | 'TREND_LONG'
  | 'REVERSAL_LONG'
  | 'OVEREXTENDED_LONG'
  | 'NONE';

export type LongBlockCode =
  | 'REVERSAL_WAITING_RECLAIM'
  | 'REVERSAL_STRUCTURE_UNCONFIRMED'
  | 'LONG_OVEREXTENDED'
  | 'LONG_CONFIDENCE_BELOW_THRESHOLD'
  | 'LONG_COOLDOWN_ACTIVE'
  | 'LONG_SL_VALIDATION_FAILED'
  | 'LONG_DUMP_CONTINUATION'
  | 'LONG_MTF_PRIMARY_MISSING'
  | 'TREND_LONG_ENTRY_UNCONFIRMED';

export type HlExecutionSnapshot = {
  state: BotExecutionStateName;
  longClass: LongOpportunityClass;
  code: LongBlockCode | null;
  reason: string;
  coin: string | null;
  direction: 'LONG' | 'SHORT' | null;
  at: string;
};

const lastByWallet = new Map<string, HlExecutionSnapshot>();

export function setHlExecutionState(
  wallet: string,
  snap: Omit<HlExecutionSnapshot, 'at'> & { at?: string }
): HlExecutionSnapshot {
  const full: HlExecutionSnapshot = {
    ...snap,
    at: snap.at ?? new Date().toISOString(),
  };
  lastByWallet.set(wallet.toLowerCase(), full);
  return full;
}

export function getHlExecutionState(wallet: string): HlExecutionSnapshot | null {
  return lastByWallet.get(wallet.toLowerCase()) ?? null;
}

export function isOpeningTradeState(state: BotExecutionStateName | null | undefined): boolean {
  return state === 'ORDER_SUBMITTED' || state === 'ORDER_CONFIRMED';
}
