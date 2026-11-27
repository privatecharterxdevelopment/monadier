import { getBotApiBase } from '../botApiFetch';
import { HL_INFO_URL } from './constants';

type CacheEntry = { at: number; data: unknown };

const META_TTL_MS = 15_000;
const CANDLE_TTL_MS = 12_000;
const CANDLE_STALE_MS = 15 * 60_000;
const DEFAULT_TTL_MS = 4_000;
const USER_STATE_TTL_MS = 2_500;
const USER_FILLS_TTL_MS = 8_000;
const MAX_RETRIES = 2;
const MIN_REQUEST_GAP_MS = 110;
const RATE_LIMIT_PAUSE_MS = 8_000;
/** Close / manual trade wins over dashboard HL polls for this window. */
let hlUserActionUntil = 0;

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
      type === 'userNonFundingLedgerUpdates' ||
      type === 'extraAgents')
  ) {
    return JSON.stringify({ type, user });
  }
  if (type === 'activeAssetData' && user && typeof body.coin === 'string') {
    return JSON.stringify({ type, user, coin: body.coin.trim().toUpperCase() });
  }
  if (type === 'maxBuilderFee' && user && typeof body.builder === 'string') {
    return JSON.stringify({
      type,
      user,
      builder: String(body.builder).toLowerCase(),
    });
  }
  return JSON.stringify(body);
}

function ttlFor(body: Record<string, unknown>): number {
  const t = body.type;
  if (t === 'metaAndAssetCtxs' || t === 'spotMetaAndAssetCtxs' || t === 'spotMeta' || t === 'outcomeMeta') {
    return META_TTL_MS;
  }
  if (t === 'candleSnapshot') return CANDLE_TTL_MS;
  if (t === 'l2Book' || t === 'allMids') return 4_000;
  if (t === 'userFills') return USER_FILLS_TTL_MS;
  if (
    t === 'clearinghouseState' ||
    t === 'spotClearinghouseState' ||
    t === 'userAbstraction' ||
    t === 'extraAgents'
  ) {
    return 5_000;
  }
  if (t === 'activeAssetData') return 8_000;
  if (t === 'maxBuilderFee') return 90_000;
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

async function fetchInfo(url: string, body: Record<string, unknown>): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8_000),
  });
}

async function postOnce<T>(body: Record<string, unknown>): Promise<T> {
  let res: Response;
  // Browser reads HL directly (each user's own IP budget). The bot IP is kept
  // free for orders/closes; the bot proxy is only a fallback on 429/network error.
  const inBrowser = typeof window !== 'undefined';
  try {
    res = await fetchInfo(HL_INFO_URL, body);
    if (inBrowser && (res.status === 429 || res.status >= 500)) {
      res = await fetchInfo(`${getBotApiBase()}/api/hl-info`, body);
    }
  } catch (err) {
    if (!inBrowser) {
      throw makeError(err instanceof Error ? err.message : 'Hyperliquid network error');
    }
    try {
      res = await fetchInfo(`${getBotApiBase()}/api/hl-info`, body);
    } catch (err2) {
      throw makeError(err2 instanceof Error ? err2.message : 'Hyperliquid network error');
    }
  }
  if (res.status === 429) {
    rateLimitUntil = Date.now() + RATE_LIMIT_PAUSE_MS;
    throw makeError('Hyperliquid API 429', 429);
  }
  if (!res.ok) {
    throw makeError(`Hyperliquid API ${res.status}`, res.status);
  }
  try {
    const data = (await res.json()) as T | { error?: string };
    if (data && typeof data === 'object' && 'error' in data && (data as { error?: string }).error) {
      throw makeError(String((data as { error: string }).error), res.status);
    }
    return data as T;
  } catch (err) {
    if (err instanceof Error && (err as HlInfoError).retryable !== undefined) throw err;
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

/** User clicked Close / order — pause background HL polls briefly. */
export function beginHlUserAction(ms = 5_000): void {
  hlUserActionUntil = Math.max(hlUserActionUntil, Date.now() + ms);
}

export function isHlInfoRateLimited(): boolean {
  return Date.now() < rateLimitUntil;
}

/** Admin / background refresh should yield during Close or HL 429 cooldown. */
export function shouldDeferHlBackgroundFetch(): boolean {
  return Date.now() < hlUserActionUntil || Date.now() < rateLimitUntil;
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
    const waitMs = Math.min(2_500, Math.max(0, rateLimitUntil - Date.now()));
    if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
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
        const staleEarly = readCache<T>(key, ttl, true, staleMs);
        if (staleEarly != null) return staleEarly;
        const status = err && typeof err === 'object' ? (err as HlInfoError).status : undefined;
        if (status === 429) {
          const stale429 = readCache<T>(key, ttl, true, staleMs * 3);
          if (stale429 != null) return stale429;
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

const USER_INFO_TYPES = new Set([
  'clearinghouseState',
  'spotClearinghouseState',
  'userAbstraction',
  'extraAgents',
  'userFills',
  'openOrders',
  'frontendOpenOrders',
]);

/** Drop only account-state cache so a deposit poll cannot wipe candles/mids. */
export function clearHlUserInfoCache(user?: string) {
  const needle = user?.trim().toLowerCase();
  for (const key of [...cache.keys()]) {
    try {
      const parsed = JSON.parse(key) as { type?: string; user?: string };
      if (!parsed?.type || !USER_INFO_TYPES.has(parsed.type)) continue;
      if (needle && parsed.user && parsed.user !== needle) continue;
      cache.delete(key);
    } catch {
      /* ignore non-json keys */
    }
  }
}

export const HL_TRADE_EVENT = 'monadier:hl-trade';

/**
 * After an order/close: drop account cache and tell every positions hook to refetch
 * now, then again at 1.2s / 3s / 6s (HL clearinghouse can lag a moment).
 */
export function notifyHlTradeExecuted(user?: string) {
  if (typeof window === 'undefined') return;
  const fire = () => {
    clearHlUserInfoCache(user);
    window.dispatchEvent(new CustomEvent(HL_TRADE_EVENT, { detail: { user } }));
  };
  fire();
  for (const ms of [1200, 3000, 6000]) window.setTimeout(fire, ms);
}

export function onHlTradeExecuted(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const h = () => cb();
  window.addEventListener(HL_TRADE_EVENT, h);
  return () => window.removeEventListener(HL_TRADE_EVENT, h);
}

/** Invalidate meta cache after long idle — optional manual refresh. */
export function clearHlInfoCache() {
  cache.clear();
}
