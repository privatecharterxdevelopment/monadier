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
    return new Error('Hyperliquid rate limit — closing, please wait…');
  }
  if (/account sync|could not read your hl position|api timeout/i.test(cleaned)) {
    return new Error(cleaned);
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

function isRetryableCloseError(msg: string): boolean {
  return /rate limit|busy|429|too many|account sync|api timeout|could not read your hl position|could not reach hyperliquid/i.test(
    msg
  );
}

/** Legacy / race: position already flat — treat as successful Close for the UI. */
function isAlreadyFlatCloseError(msg: string): boolean {
  return /no hl position|zero size|already (flat|closed)|nothing to close/i.test(msg);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

export async function closeHlPositionViaAgent(params: {
  walletAddress: string;
  coin: string;
  /** Absolute size from UI — lets bot-service skip clearinghouse wait. */
  size?: number;
  isLong?: boolean;
  entryPx?: number;
  unrealizedPnlUsd?: number;
}): Promise<void> {
  const wallet = params.walletAddress.toLowerCase();
  const coin = params.coin.toUpperCase();
  const body: Record<string, unknown> = { wallet, coin, reason: 'manual' };
  if (params.size != null && Number.isFinite(params.size) && params.size > 0) {
    body.size = params.size;
  }
  if (typeof params.isLong === 'boolean') body.isLong = params.isLong;
  if (params.entryPx != null && Number.isFinite(params.entryPx)) body.entryPx = params.entryPx;
  if (params.unrealizedPnlUsd != null && Number.isFinite(params.unrealizedPnlUsd)) {
    body.unrealizedPnlUsd = params.unrealizedPnlUsd;
  }

  let lastErr: Error | null = null;
  const maxAttempts = 6;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let res: Response;
    try {
      res = await fetch(`${getBotApiBase()}/api/hl-close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (err) {
      if (isNetworkCloseError(err)) {
        lastErr = new Error('Network error — check Wi‑Fi/VPN, then retry close.');
        if (attempt < maxAttempts - 1) {
          await sleep(500 + attempt * 400);
          continue;
        }
        throw lastErr;
      }
      throw err;
    }

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
      lastErr = closeAgentError(res, json);
      if (attempt < maxAttempts - 1) {
        await sleep(500 + attempt * 400);
        continue;
      }
      throw lastErr;
    }

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

    lastErr = closeAgentError(res, json);
    const retryable =
      res.status === 429 || isRetryableCloseError(lastErr.message);
    if (retryable && attempt < maxAttempts - 1) {
      await sleep(600 + attempt * 500);
      continue;
    }
    throw lastErr;
  }

  throw lastErr ?? new Error('Close failed — try again.');
}
