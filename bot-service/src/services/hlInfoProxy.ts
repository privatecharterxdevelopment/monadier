/**
 * Read-only Hyperliquid /info proxy for the browser — shared cache, fewer 429s.
 */
import { config } from '../config';

type CacheRow = { at: number; data: unknown };
const cache = new Map<string, CacheRow>();
const inflight = new Map<string, Promise<unknown>>();

const ALLOWED = new Set([
  'metaAndAssetCtxs',
  'spotMetaAndAssetCtxs',
  'spotMeta',
  'allMids',
  'l2Book',
  'candleSnapshot',
  'clearinghouseState',
  'spotClearinghouseState',
  'userAbstraction',
  'extraAgents',
  'userFills',
  'openOrders',
  'frontendOpenOrders',
  'historicalOrders',
  'userFunding',
  'userTwapSliceFills',
  'userTwapHistory',
  'recentTrades',
  'outcomeMeta',
]);

function ttlMs(type: string): number {
  if (type === 'metaAndAssetCtxs' || type === 'spotMeta' || type === 'spotMetaAndAssetCtxs') {
    return 15_000;
  }
  if (type === 'candleSnapshot') return 45_000;
  if (type === 'l2Book' || type === 'allMids') return 2_000;
  if (
    type === 'clearinghouseState' ||
    type === 'spotClearinghouseState' ||
    type === 'userAbstraction'
  ) {
    return 2_500;
  }
  if (type === 'userFills') return 30_000;
  return 4_000;
}

function cacheKey(body: Record<string, unknown>): string {
  const type = String(body.type ?? '');
  const user =
    typeof body.user === 'string' ? body.user.toLowerCase() : undefined;
  if (type === 'candleSnapshot' && body.req && typeof body.req === 'object') {
    const req = body.req as { coin?: string; interval?: string; startTime?: number };
    const startBucket = Math.floor(Number(req.startTime || 0) / 3_600_000);
    return JSON.stringify({
      type: 'candleSnapshot',
      coin: String(req.coin || '').toUpperCase(),
      interval: req.interval,
      startBucket,
    });
  }
  if (user) return JSON.stringify({ type, user });
  return JSON.stringify(body);
}

export async function proxyHlInfoPost(body: Record<string, unknown>): Promise<unknown> {
  const type = String(body.type ?? '');
  if (!ALLOWED.has(type)) {
    throw new Error(`HL info type not allowed: ${type || 'missing'}`);
  }

  const key = cacheKey(body);
  const ttl = ttlMs(type);
  const row = cache.get(key);
  if (row && Date.now() - row.at <= ttl) return row.data;

  const pending = inflight.get(key);
  if (pending) return pending;

  const run = (async () => {
    const res = await fetch(config.hyperliquid.infoUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      if (row && Date.now() - row.at <= ttl * 20) return row.data;
      throw new Error(`Hyperliquid API ${res.status}`);
    }
    const data = await res.json();
    if (!(type === 'candleSnapshot' && Array.isArray(data) && data.length === 0)) {
      cache.set(key, { at: Date.now(), data });
    }
    return data;
  })();

  inflight.set(key, run);
  try {
    return await run;
  } finally {
    inflight.delete(key);
  }
}
