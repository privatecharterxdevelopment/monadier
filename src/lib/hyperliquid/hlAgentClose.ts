import { getBotApiBase } from '../signalService';
import { isHlRateLimitError } from '../devLog';
import { clearHlInfoCache } from './hlInfoClient';

function closeAgentError(res: Response, json: { error?: string | null }): Error {
  if (res.status === 429 || isHlRateLimitError(json.error)) {
    return new Error('Too many requests — wait ~30 seconds and retry close.');
  }
  const detail = json.error?.trim();
  if (detail) return new Error(detail);
  if (res.status > 0) {
    return new Error(`Close failed (HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''}).`);
  }
  return new Error('Close failed — try again.');
}

export async function closeHlPositionViaAgent(params: {
  walletAddress: string;
  coin: string;
}): Promise<void> {
  const wallet = params.walletAddress.toLowerCase();
  const coin = params.coin.toUpperCase();
  const res = await fetch(`${getBotApiBase()}/api/hl-close`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet, coin, reason: 'manual' }),
  });
  let json: { success?: boolean; error?: string | null } = {};
  try {
    json = (await res.json()) as { success?: boolean; error?: string | null };
  } catch {
    throw closeAgentError(res, json);
  }
  if (!res.ok || !json.success) {
    throw closeAgentError(res, json);
  }

  // Bot-service already confirms flat on HL — avoid hammering /info again (429).
  clearHlInfoCache();
}
