import { getBotApiBase } from './signalService';

export type AdminDiagnosisGate = {
  id: string;
  stage: 'config' | 'user' | 'market' | 'pick' | 'open' | 'funnel';
  message: string;
  blocking: boolean;
};

export type AdminWalletTradeDiagnosis = {
  wallet: string;
  canTrade: boolean;
  userReady: boolean;
  marketReady: boolean;
  runnable: boolean;
  wouldProcessOpens: boolean;
  summary: string;
  userBlockers: string[];
  marketBlockers: string[];
  blockers: string[];
  gates: AdminDiagnosisGate[];
  hyperliquid: {
    agentApproved: boolean;
    accountEquityUsd: number;
    perpUsd: number;
    spotUsdcUsd: number;
    tradablePerpUsd: number;
    freeMarginUsd: number;
    openCoins: string[];
    maxConcurrentPositions: number;
    minAccountUsd: number;
    minNotionalUsd: number;
  };
  globalScan: {
    rawCandidateCount: number;
    tradeableCount: number;
    filterReasons: string[];
    best: { coin: string; direction: string; confidence: number } | null;
  };
  recentFunnel: Array<{
    stage: string;
    direction: string;
    coin: string;
    passed: boolean;
    skip_reason: string | null;
    recorded_at: string;
  }>;
  lastOpenError: { at: string; coin?: string; error: string } | null;
};

export async function fetchAdminBotDiagnosisBatch(
  wallets: string[]
): Promise<Record<string, AdminWalletTradeDiagnosis>> {
  const unique = [...new Set(wallets.map((w) => w.toLowerCase()).filter(Boolean))];
  if (unique.length === 0) return {};

  const res = await fetch(`${getBotApiBase()}/api/admin/bot-diagnosis-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallets: unique }),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Diagnosis failed (${res.status})`);
  }

  const data = (await res.json()) as {
    success: boolean;
    diagnoses: Record<string, AdminWalletTradeDiagnosis>;
  };
  return data.diagnoses ?? {};
}

export function blockingGateSummary(diagnosis: AdminWalletTradeDiagnosis): string {
  const blocking = diagnosis.gates.filter((g) => g.blocking);
  if (blocking.length === 0) {
    if (diagnosis.canTrade) return 'Ready to trade';
    return diagnosis.summary;
  }
  return blocking.map((g) => g.id).join(' · ');
}
