/**
 * In-memory execution trace for /api/bot-status — never claims SL confirmed
 * without an exchange order match.
 */
export type ScanPassKind = 'standard' | 'aggressive' | null;

export type ExecutionDiagnostic = {
  coin: string;
  direction: 'LONG' | 'SHORT' | null;
  scan: ScanPassKind;
  scanPassed: boolean;
  gatesPassed: string[];
  blockedBy: string | null;
  blockedCode: string | null;
  blockedReason: string | null;
  orderSent: boolean;
  fillConfirmed: boolean;
  fillSize: number | null;
  fillPx: number | null;
  emergencySlPosted: boolean;
  emergencySlConfirmed: boolean;
  emergencySlPx: number | null;
  userSlPercent: number | null;
  at: string;
};

const lastByWallet = new Map<string, ExecutionDiagnostic>();

function empty(coin = ''): ExecutionDiagnostic {
  return {
    coin,
    direction: null,
    scan: null,
    scanPassed: false,
    gatesPassed: [],
    blockedBy: null,
    blockedCode: null,
    blockedReason: null,
    orderSent: false,
    fillConfirmed: false,
    fillSize: null,
    fillPx: null,
    emergencySlPosted: false,
    emergencySlConfirmed: false,
    emergencySlPx: null,
    userSlPercent: null,
    at: new Date().toISOString(),
  };
}

export function getExecutionDiagnostic(wallet: string): ExecutionDiagnostic | null {
  return lastByWallet.get(wallet.toLowerCase()) ?? null;
}

export function patchExecutionDiagnostic(
  wallet: string,
  patch: Partial<ExecutionDiagnostic> & { coin?: string }
): ExecutionDiagnostic {
  const key = wallet.toLowerCase();
  const prev = lastByWallet.get(key) ?? empty(patch.coin ?? '');
  const next: ExecutionDiagnostic = {
    ...prev,
    ...patch,
    coin: (patch.coin ?? prev.coin).toUpperCase(),
    gatesPassed: patch.gatesPassed ?? prev.gatesPassed,
    at: new Date().toISOString(),
  };
  lastByWallet.set(key, next);
  return next;
}

export function markGatePassed(wallet: string, gate: string): void {
  const prev = lastByWallet.get(wallet.toLowerCase());
  const gates = prev?.gatesPassed ?? [];
  if (gates.includes(gate)) return;
  patchExecutionDiagnostic(wallet, { gatesPassed: [...gates, gate] });
}
