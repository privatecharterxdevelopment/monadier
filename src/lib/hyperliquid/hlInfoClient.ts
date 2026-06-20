import { HL_INFO_URL } from './constants';

type CacheEntry = { at: number; data: unknown };

const META_TTL_MS = 6_000;
const CANDLE_TTL_MS = 4_000;
const DEFAULT_TTL_MS = 2_000;
const MAX_RETRIES = 4;
const MIN_REQUEST_GAP_MS = 120;

const inflight = new Map<string, Promise<unknown>>();
const cache = new Map<string, CacheEntry>();
let queueTail: Promise<void> = Promise.resolve();
let lastRequestAt = 0;

function cacheKey(body: Record<string, unknown>): string {
  if (body.type === 'candleSnapshot' && body.req && typeof body.req === 'object') {
    const req = body.req as { coin?: string; interval?: string };
    return JSON.stringify({
      type: 'candleSnapshot',
      coin: req.coin,
      interval: req.interval,
    });
  }
  return JSON.stringify(body);
}

function ttlFor(body: Record<string, unknown>): number {
  const t = body.type;
  if (t === 'metaAndAssetCtxs' || t === 'spotMetaAndAssetCtxs' || t === 'spotMeta' || t === 'outcomeMeta') return META_TTL_MS;
  if (t === 'candleSnapshot') return CANDLE_TTL_MS;
  if (t === 'l2Book' || t === 'allMids') return 1_200;
  return DEFAULT_TTL_MS;
}

function readCache<T>(key: string, ttlMs: number): T | null {
  const row = cache.get(key);
  if (!row) return null;
  if (Date.now() - row.at > ttlMs) return null;
  return row.data as T;
}

function writeCache(key: string, data: unknown) {
  cache.set(key, { at: Date.now(), data });
}

async function postOnce<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch(HL_INFO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status === 429) {
    const err = new Error('Hyperliquid API 429') as Error & { status?: number };
    err.status = 429;
    throw err;
  }
  if (!res.ok) {
    throw new Error(`Hyperliquid API ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function retryDelayMs(attempt: number, err: unknown): number {
  if (err && typeof err === 'object' && (err as { status?: number }).status === 429) {
    return 1_200 * 2 ** attempt;
  }
  return 500 * 2 ** attempt;
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

/** Shared HL /info POST — dedupes in-flight calls and caches meta snapshots briefly. */
export async function hlInfoPost<T>(body: Record<string, unknown>): Promise<T> {
  const key = cacheKey(body);
  const ttl = ttlFor(body);

  const cached = readCache<T>(key, ttl);
  if (cached != null) return cached;

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
        if (attempt >= MAX_RETRIES) break;
        await new Promise((r) => setTimeout(r, retryDelayMs(attempt, err)));
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('Hyperliquid API failed');
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
