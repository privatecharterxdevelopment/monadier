import { getBotApiBase } from '../signalService';
import { isHlRateLimitError } from '../devLog';
import { clearHlInfoCache } from './hlInfoClient';

function closeAgentError(res: Response, json: { error?: string | null }): Error {
  const raw =
    json.error?.trim() ||
    (res.status > 0
      ? `${res.status}${res.statusText ? ` ${res.statusText}` : ''}`.trim()
      : '');
  const cleaned = raw.replace(/\s*-\s*null\s*$/i, '').trim();
  if (res.status === 429 || isHlRateLimitError(cleaned) || /429|too many requests/i.test(cleaned)) {
    return new Error('Hyperliquid rate limit — wait ~30 seconds and retry close.');
  }
  if (cleaned) return new Error(cleaned);
  return new Error('Close failed — try again.');
}

function isNetworkCloseError(err: unknown): boolean {
  if (isHlRateLimitError(err)) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /failed to fetch|network changed|load failed|networkerror|err_network/i.test(msg) ||
    (err instanceof TypeError && /fetch/i.test(msg))
  );
}

/** Legacy / race: position already flat — treat as successful Close for the UI. */
function isAlreadyFlatCloseError(msg: string): boolean {
  return /no hl position|zero size|already (flat|closed)|nothing to close/i.test(msg);
}

function isRetryableCloseError(msg: string): boolean {
  return /hyperliquid unreachable|rate limit|too many requests|429|temporarily unreachable|try again|timeout/i.test(
    msg
  );
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function postHlCloseOnce(wallet: string, coin: string): Promise<{
  res: Response;
  json: {
    success?: boolean;
    error?: string | null;
    alreadyClosed?: boolean;
  };
}> {
  const res = await fetch(`${getBotApiBase()}/api/hl-close`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet, coin, reason: 'manual' }),
  });
  let json: {
    success?: boolean;
    error?: string | null;
    alreadyClosed?: boolean;
  } = {};
  try {
    json = (await res.json()) as {
      success?: boolean;
      error?: string | null;
      alreadyClosed?: boolean;
    };
  } catch {
    /* keep empty — caller maps status */
  }
  return { res, json };
}

export async function closeHlPositionViaAgent(params: {
  walletAddress: string;
  coin: string;
}): Promise<void> {
  const wallet = params.walletAddress.toLowerCase();
  const coin = params.coin.toUpperCase();

  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const { res, json } = await postHlCloseOnce(wallet, coin);

      if (
        json.alreadyClosed ||
        (!json.success && isAlreadyFlatCloseError(String(json.error ?? '')))
      ) {
        clearHlInfoCache();
        return;
      }

      if (res.ok && json.success) {
        clearHlInfoCache();
        return;
      }

      const err = closeAgentError(res, json);
      lastErr = err;
      const msg = err.message;
      if (attempt < 3 && isRetryableCloseError(msg)) {
        await sleep(700 * (attempt + 1) * (attempt + 1));
        continue;
      }
      throw err;
    } catch (err) {
      if (isNetworkCloseError(err) && attempt < 3) {
        lastErr = new Error(
          'Network error — check Wi‑Fi/VPN, wait a few seconds, then retry close.'
        );
        await sleep(700 * (attempt + 1) * (attempt + 1));
        continue;
      }
      if (err instanceof Error) throw err;
      throw lastErr ?? err;
    }
  }

  throw lastErr ?? new Error('Close failed — try again.');
}
