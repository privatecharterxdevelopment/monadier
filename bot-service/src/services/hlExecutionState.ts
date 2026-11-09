/** Authoritative bot execution state — frontend must not infer Opening trade from scan %. */

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
  | 'TREND_LONG_ENTRY_UNCONFIRMED'
  | 'USER_SL_DISABLED'
  | 'CRITICAL_UNPROTECTED_POSITION';

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

const TERMINAL_PROTECT_FAIL: ReadonlySet<BotExecutionStateName> = new Set([
  'SL_FAILED_FLATTENING',
  'CRITICAL_UNPROTECTED_POSITION',
]);

export function setHlExecutionState(
  wallet: string,
  snap: Omit<HlExecutionSnapshot, 'at'> & { at?: string }
): HlExecutionSnapshot {
  const key = wallet.toLowerCase();
  const prev = lastByWallet.get(key);
  // A failed SL / unprotected book must not be papered over by a later success code.
  if (
    prev &&
    TERMINAL_PROTECT_FAIL.has(prev.state) &&
    snap.state !== 'POSITION_CLOSED' &&
    snap.state !== 'SL_CONFIRMED' &&
    snap.state !== 'SL_RECOVERY' &&
    snap.state !== 'SL_FAILED_FLATTENING' &&
    snap.state !== 'CRITICAL_UNPROTECTED_POSITION'
  ) {
    const kept: HlExecutionSnapshot = {
      ...prev,
      reason: `${prev.reason} · refused overwrite ${snap.state}`,
      at: new Date().toISOString(),
    };
    lastByWallet.set(key, kept);
    return kept;
  }
  const full: HlExecutionSnapshot = {
    ...snap,
    at: snap.at ?? new Date().toISOString(),
  };
  lastByWallet.set(key, full);
  return full;
}

export function getHlExecutionState(wallet: string): HlExecutionSnapshot | null {
  return lastByWallet.get(wallet.toLowerCase()) ?? null;
}

export function clearHlExecutionState(wallet: string): void {
  lastByWallet.delete(wallet.toLowerCase());
}

export function isOpeningTradeState(state: BotExecutionStateName | null | undefined): boolean {
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
