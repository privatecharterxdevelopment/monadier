/**
 * Structured entry decision trace — SIGNAL → STRUCTURE → LOCATION → QUALITY → RISK → EXECUTION.
 */
export type EntryDecisionPhase =
  | 'SIGNAL'
  | 'STRUCTURE'
  | 'LOCATION'
  | 'QUALITY'
  | 'RISK'
  | 'EXECUTION';

export type EntryDecisionVerdict = 'PASS' | 'BLOCK' | 'SKIP';

export type EntryDecisionStep = {
  phase: EntryDecisionPhase;
  gate: string;
  code: string;
  verdict: EntryDecisionVerdict;
  reason: string;
  metrics?: Record<string, string | number | boolean | null>;
  threshold?: string;
  observed?: string;
};

export function gateToPhase(gate: string): EntryDecisionPhase {
  switch (gate) {
    case 'signal_scan':
    case 'pre_trade_liquidity':
      return 'SIGNAL';
    case 'pre_open_candles':
    case 'scalp_align':
      return 'STRUCTURE';
    case 'entry_location':
      return 'LOCATION';
    case 'entry_location_quality':
    case 'leverage_location_cap':
      return 'QUALITY';
    case 'fresh_pump':
    case 'macro_beta':
    case 'pump_short':
    case 'entry_momentum':
    case 'mega_pair':
    case 'direction_profile':
    case 'long_allowlist':
      return 'RISK';
    default:
      return 'EXECUTION';
  }
}

export function formatEntryDecisionTrace(steps: EntryDecisionStep[]): string {
  return steps
    .map((s) => {
      const obs = s.observed != null ? ` obs=${s.observed}` : '';
      const thr = s.threshold != null ? ` thr=${s.threshold}` : '';
      return `${s.phase}:${s.gate}:${s.verdict}:${s.code}${obs}${thr} — ${s.reason}`;
    })
    .join(' | ');
}
