import { fetchBotApi } from './botApiFetch';
import { getBotAdminSecret } from './adminTwitter';

export type ForceOpenDirection = 'LONG' | 'SHORT';

export type ForceOpenCommand = {
  coin: string;
  direction: ForceOpenDirection;
  leverage?: number;
};

export type ForceOpenResultRow = {
  wallet: string;
  success: boolean;
  error?: string;
  slots?: string;
  freeMarginUsd?: number;
  leverage?: number;
  notionalUsd?: number;
};

export type ForceOpenResponse = {
  success: boolean;
  coin: string;
  direction: ForceOpenDirection;
  dryRun: boolean;
  leverage: number | null;
  opened: number;
  eligible: number;
  skipped: number;
  failed: number;
  results: ForceOpenResultRow[];
  error?: string;
};

/**
 * Parse ops desk commands: "btc short 40x", "PUMP long 15x", "eth short".
 */
export function parseForceOpenCommand(raw: string): ForceOpenCommand | { error: string } {
  const cleaned = raw.trim().replace(/,/g, ' ').replace(/\s+/g, ' ');
  if (!cleaned) return { error: 'Enter a command like: btc short 40x' };

  const tokens = cleaned.split(' ');
  let coin = '';
  let direction: ForceOpenDirection | null = null;
  let leverage: number | undefined;

  for (const tok of tokens) {
    const lower = tok.toLowerCase();
    if (lower === 'long' || lower === 'l') {
      direction = 'LONG';
      continue;
    }
    if (lower === 'short' || lower === 's') {
      direction = 'SHORT';
      continue;
    }
    const levMatch = lower.match(/^(\d+(?:\.\d+)?)x$/);
    if (levMatch) {
      leverage = Math.max(1, Math.floor(Number(levMatch[1])));
      continue;
    }
    if (/^\d+$/.test(tok) && !coin) {
      // bare number alone is ambiguous — ignore unless after coin as leverage
      continue;
    }
    if (!coin && /^[a-zA-Z0-9]{1,16}$/.test(tok)) {
      coin = tok.toUpperCase();
      continue;
    }
  }

  // "btc 40x short" already handled; also allow trailing bare leverage after direction
  if (leverage == null) {
    const bareLev = cleaned.match(/(?:^|\s)(\d{1,3})(?:\s*$|\s+x\b)/i);
    if (bareLev && direction) {
      leverage = Math.max(1, Math.floor(Number(bareLev[1])));
    }
  }

  if (!coin) return { error: 'Missing coin (e.g. BTC)' };
  if (!direction) return { error: 'Missing direction (long or short)' };
  if (leverage != null && (!Number.isFinite(leverage) || leverage < 1 || leverage > 200)) {
    return { error: 'Leverage must be 1–200' };
  }

  return { coin, direction, leverage };
}

async function adminForceOpenFetch(body: Record<string, unknown>): Promise<{
  ok: boolean;
  data: ForceOpenResponse;
  error?: string;
}> {
  const secret = getBotAdminSecret();
  if (!secret) {
    return {
      ok: false,
      data: {} as ForceOpenResponse,
      error:
        'Set VITE_BOT_ADMIN_SECRET on Vercel (same as Railway BOT_ADMIN_SECRET), or paste it below for this session.',
    };
  }
  const res = await fetchBotApi('/api/admin/force-open', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-bot-admin-secret': secret,
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as ForceOpenResponse;
  if (!res.ok || data.success === false) {
    return { ok: false, data, error: data.error || `HTTP ${res.status}` };
  }
  return { ok: true, data };
}

export async function previewForceOpen(opts: {
  coin: string;
  direction: ForceOpenDirection;
  leverage?: number;
  wallets?: string[];
}): Promise<{ ok: boolean; data?: ForceOpenResponse; error?: string }> {
  const result = await adminForceOpenFetch({
    coin: opts.coin,
    direction: opts.direction,
    leverage: opts.leverage,
    wallets: opts.wallets,
    dryRun: true,
  });
  return { ok: result.ok, data: result.data, error: result.error };
}

export async function executeForceOpen(opts: {
  coin: string;
  direction: ForceOpenDirection;
  leverage?: number;
  wallets?: string[];
}): Promise<{ ok: boolean; data?: ForceOpenResponse; error?: string }> {
  const result = await adminForceOpenFetch({
    coin: opts.coin,
    direction: opts.direction,
    leverage: opts.leverage,
    wallets: opts.wallets,
    dryRun: false,
  });
  return { ok: result.ok, data: result.data, error: result.error };
}
