import { fetchBotApi } from './botApiFetch';

export type LetRunPositionRow = {
  wallet: string;
  coin: string;
  side: 'LONG' | 'SHORT';
  size: number;
  entryPx: number;
  uPnlUsd: number;
  leverage: number;
  letRun: boolean;
  source: string;
};

export type AgentExpiryRow = {
  wallet: string;
  agentAddress: string | null;
  expiresAt: string | null;
  daysLeft: number | null;
  status: 'expired' | 'expiring_soon' | 'ok';
};

export type LetRunStatusResponse = {
  success: boolean;
  letRunAll: boolean;
  positions: LetRunPositionRow[];
  agentExpiry?: AgentExpiryRow[];
  error?: string;
  timestamp?: string;
};

export async function fetchAdminLetRunStatus(): Promise<{
  ok: boolean;
  data?: LetRunStatusResponse;
  error?: string;
}> {
  const res = await fetchBotApi('/api/hl-let-run');
  const data = (await res.json()) as LetRunStatusResponse;
  if (!res.ok || data.success === false) {
    return { ok: false, error: data.error || `HTTP ${res.status}`, data };
  }
  return { ok: true, data };
}

export async function setAdminLetRunAll(letRunAll: boolean): Promise<{
  ok: boolean;
  error?: string;
}> {
  const res = await fetchBotApi('/api/hl-let-run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ letRunAll }),
  });
  const data = (await res.json()) as { success?: boolean; error?: string };
  if (!res.ok || !data.success) {
    return { ok: false, error: data.error || `HTTP ${res.status}` };
  }
  return { ok: true };
}

export async function setAdminPositionLetRun(
  wallet: string,
  coin: string,
  letRun: boolean
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetchBotApi('/api/hl-let-run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      wallet: wallet.toLowerCase(),
      coin: coin.toUpperCase(),
      letRun,
    }),
  });
  const data = (await res.json()) as { success?: boolean; error?: string };
  if (!res.ok || !data.success) {
    return { ok: false, error: data.error || `HTTP ${res.status}` };
  }
  return { ok: true };
}
