import { HL_INFO_URL } from './constants';

type CacheEntry = { at: number; data: unknown };

const META_TTL_MS = 15_000;
const CANDLE_TTL_MS = 45_000;
const CANDLE_STALE_MS = 15 * 60_000;
const DEFAULT_TTL_MS = 4_000;
const USER_STATE_TTL_MS = 12_000;
const USER_FILLS_TTL_MS = 45_000;
const MAX_RETRIES = 4;
const MIN_REQUEST_GAP_MS = 220;
const RATE_LIMIT_PAUSE_MS = 20_000;

type HlInfoError = Error & { status?: number; retryable?: boolean };

const inflight = new Map<string, Promise<unknown>>();
const cache = new Map<string, CacheEntry>();
let queueTail: Promise<void> = Promise.resolve();
let lastRequestAt = 0;
let rateLimitUntil = 0;

function isCandleBody(body: Record<string, unknown>): boolean {
  return body.type === 'candleSnapshot';
}

function cacheKey(body: Record<string, unknown>): string {
  const type = body.type;
  const user =
    typeof body.user === 'string' ? body.user.toLowerCase() : undefined;
  if (type === 'candleSnapshot' && body.req && typeof body.req === 'object') {
    const req = body.req as { coin?: string; interval?: string; startTime?: number; endTime?: number };
    // Bucket by coin+interval+start hour — exact endTime changes every ms and defeated cache.
    const startBucket = Math.floor(Number(req.startTime || 0) / 3_600_000);
    return JSON.stringify({
      type: 'candleSnapshot',
      coin: String(req.coin || '').toUpperCase(),
      interval: req.interval,
      startBucket,
    });
  }
  if (
    user &&
    (type === 'userFills' ||
      type === 'clearinghouseState' ||
      type === 'spotClearinghouseState' ||
      type === 'openOrders' ||
      type === 'frontendOpenOrders' ||
      type === 'userAbstraction' ||
      type === 'extraAgents')
  ) {
    return JSON.stringify({ type, user });
  }
  return JSON.stringify(body);
}

function ttlFor(body: Record<string, unknown>): number {
  const t = body.type;
  if (t === 'metaAndAssetCtxs' || t === 'spotMetaAndAssetCtxs' || t === 'spotMeta' || t === 'outcomeMeta') {
    return META_TTL_MS;
  }
  if (t === 'candleSnapshot') return CANDLE_TTL_MS;
  if (t === 'l2Book' || t === 'allMids') return 2_000;
  if (t === 'userFills') return USER_FILLS_TTL_MS;
  if (
    t === 'clearinghouseState' ||
    t === 'spotClearinghouseState' ||
    t === 'userAbstraction' ||
    t === 'extraAgents'
  ) {
    return USER_STATE_TTL_MS;
  }
  return DEFAULT_TTL_MS;
}

function staleWindowMs(body: Record<string, unknown>): number {
  if (isCandleBody(body)) return CANDLE_STALE_MS;
  return ttlFor(body) * 12;
}

function readCache<T>(key: string, ttlMs: number, allowStale = false, staleMs = ttlMs * 8): T | null {
  const row = cache.get(key);
  if (!row) return null;
  const age = Date.now() - row.at;
  if (age <= ttlMs) return row.data as T;
  if (allowStale && age <= staleMs) return row.data as T;
  return null;
}

function writeCache(key: string, data: unknown) {
  // Never cache empty candle arrays — they lock the UI into a blank chart.
  if (Array.isArray(data) && data.length === 0) return;
  cache.set(key, { at: Date.now(), data });
}

function makeError(message: string, status?: number): HlInfoError {
  const err = new Error(message) as HlInfoError;
  err.status = status;
  err.retryable = status == null || status === 429 || status >= 500;
  return err;
}

async function postOnce<T>(body: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(HL_INFO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw makeError(err instanceof Error ? err.message : 'Hyperliquid network error');
  }
  if (res.status === 429) {
    rateLimitUntil = Date.now() + RATE_LIMIT_PAUSE_MS;
    throw makeError('Hyperliquid API 429', 429);
  }
  if (!res.ok) {
    throw makeError(`Hyperliquid API ${res.status}`, res.status);
  }
  try {
    return (await res.json()) as T;
  } catch {
    throw makeError('Hyperliquid API invalid JSON', res.status);
  }
}

function retryDelayMs(attempt: number, err: unknown): number {
  const status = err && typeof err === 'object' ? (err as HlInfoError).status : undefined;
  if (status === 429) return 1_500 * 2 ** attempt;
  if (status != null && status >= 500) return 800 * 2 ** attempt;
  return 400 * 2 ** attempt;
}

async function throttleRequest<T>(run: () => Promise<T>): Promise<T> {
  const scheduled = queueTail.then(async () => {
    const wait = Math.max(0, MIN_REQUEST_GAP_MS - (Date.now() - lastRequestAt));
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();
    return run();
  });
  queueTail = scheduled.then(
    () => undefined,
    () => undefined
  );
  return scheduled;
}

/** Shared HL /info POST — dedupes in-flight calls and caches meta/candles. */
export async function hlInfoPost<T>(body: Record<string, unknown>): Promise<T> {
  const key = cacheKey(body);
  const ttl = ttlFor(body);
  const staleMs = staleWindowMs(body);

  const cached = readCache<T>(key, ttl);
  if (cached != null) return cached;

  if (Date.now() < rateLimitUntil) {
    const stale = readCache<T>(key, ttl, true, staleMs);
    if (stale != null) return stale;
    await new Promise((r) => setTimeout(r, Math.max(0, rateLimitUntil - Date.now())));
  }

  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  const run = throttleRequest(async () => {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const data = await postOnce<T>(body);
        writeCache(key, data);
        return data;
      } catch (err) {
        lastErr = err;
        // Serve stale candles immediately on 5xx instead of waiting out every retry.
        if (isCandleBody(body)) {
          const stale = readCache<T>(key, ttl, true, staleMs);
          if (stale != null) return stale;
        }
        const retryable =
          !err ||
          typeof err !== 'object' ||
          (err as HlInfoError).retryable !== false;
        if (!retryable || attempt >= MAX_RETRIES) break;
        await new Promise((r) => setTimeout(r, retryDelayMs(attempt, err)));
      }
    }
    const stale = readCache<T>(key, ttl, true, staleMs);
    if (stale != null) return stale;
    throw lastErr instanceof Error ? lastErr : makeError('Hyperliquid API failed');
  });

  inflight.set(key, run);
  try {
    return await run;
  } finally {
    inflight.delete(key);
  }
}

/** Invalidate meta cache after long idle — optional manual refresh. */
export function clearHlInfoCache() {
  cache.clear();
}
