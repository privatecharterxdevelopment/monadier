/**
 * Same-origin /bot-service proxy (Vite dev + Vercel prod) → Railway bot.
 */
export function getBotApiBase(): string {
  if (typeof window !== 'undefined') {
    if (import.meta.env.DEV) {
      const local = import.meta.env.VITE_BOT_API_URL?.replace(/\/$/, '') ?? '';
      if (local) return local;
    }
    return `${window.location.origin}/bot-service`;
  }
  const fromEnv = import.meta.env.VITE_BOT_API_URL?.replace(/\/$/, '') ?? '';
  if (fromEnv) return fromEnv;
  return import.meta.env.DEV
    ? 'http://localhost:3001'
    : 'https://monadier-production.up.railway.app';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isTransientFetchError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return false;
  if (!(err instanceof TypeError) && !(err instanceof DOMException)) return false;
  const msg = String(err.message ?? err).toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('network') ||
    msg.includes('load failed') ||
    msg.includes('err_network')
  );
}

export type FetchBotApiOptions = RequestInit & {
  timeoutMs?: number;
  retries?: number;
};

/** Resilient fetch for bot-service — retries transient network / 502–504 blips. */
export async function fetchBotApi(
  path: string,
  opts: FetchBotApiOptions = {}
): Promise<Response> {
  const base = getBotApiBase();
  if (!base) throw new TypeError('Bot API base URL missing');

  const url = path.startsWith('http')
    ? path
    : `${base}${path.startsWith('/') ? path : `/${path}`}`;

  const { timeoutMs = 25_000, retries = 2, ...fetchInit } = opts;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(url, {
        cache: 'no-store',
        ...fetchInit,
        signal: fetchInit.signal ?? AbortSignal.timeout(timeoutMs),
      });
      if (res.status >= 502 && res.status <= 504 && attempt < retries) {
        await sleep(400 * (attempt + 1));
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt < retries && isTransientFetchError(err)) {
        await sleep(350 * (attempt + 1));
        continue;
      }
      throw err;
    }
  }

  throw lastErr ?? new TypeError('fetchBotApi failed');
}
