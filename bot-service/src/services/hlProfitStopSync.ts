/**
 * Profit stops on Hyperliquid.
 *
 * FATAL: a reduce-only MARKET tpsl fires on the exchange with no live PnL check.
 * SOL SHORT filled through entry (−$0.56 after fees). We never post those again.
 * This module only CANCELS leftover position TP/SL from older deploys.
 * The bot trails in software and closes only while still green after fees.
 */
import { ExchangeClient, HttpTransport } from '@nktkas/hyperliquid';
import { config } from '../config';
import { logger } from '../utils/logger';
import { deriveUserHlAgent } from './hlAgent';
import { coinToAssetIndex, fetchHlMeta } from './hlInfo';

const transport = new HttpTransport();

const lastCancelAt = new Map<string, number>();
const CANCEL_EVERY_MS = 8_000;

function clientFor(userAddress: string): ExchangeClient {
  return new ExchangeClient({
    transport,
    wallet: deriveUserHlAgent(userAddress),
  });
}

/** True if the trigger is on the profit side of entry and not glued to mark. */
export function protectiveSideOk(
  direction: 'LONG' | 'SHORT',
  stopPx: number,
  markPx: number,
  entryPx: number
): boolean {
  if (!(stopPx > 0) || !(markPx > 0) || !(entryPx > 0)) return false;
  const minAway = markPx * 0.0012;
  if (direction === 'LONG') {
    return stopPx < markPx - minAway && stopPx > entryPx;
  }
  return stopPx > markPx + minAway && stopPx < entryPx;
}

export function profitStopSafeToPost(opts: {
  direction: 'LONG' | 'SHORT';
  stopPx: number;
  markPx: number;
  entryPx: number;
  absSize: number;
  minLockUsd: number;
}): boolean {
  // Market TPSL is never safe — kept so callers/tests refuse the old path.
  void opts;
  return false;
}

type FrontendOrder = {
  coin?: string;
  oid?: number;
  reduceOnly?: boolean;
  isTrigger?: boolean;
  isPositionTpsl?: boolean;
  orderType?: string;
  triggerPx?: string;
  limitPx?: string;
};

async function fetchFrontendOpenOrders(userAddress: string): Promise<FrontendOrder[]> {
  try {
    const res = await fetch(config.hyperliquid.infoUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'frontendOpenOrders',
        user: userAddress.toLowerCase(),
      }),
    });
    if (!res.ok) return [];
    const rows = (await res.json()) as FrontendOrder[];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function isPositionStop(order: FrontendOrder, coin: string): boolean {
  if (String(order.coin ?? '').toUpperCase() !== coin.toUpperCase()) return false;
  if (order.isPositionTpsl) return true;
  if (order.isTrigger && order.reduceOnly) return true;
  const type = String(order.orderType ?? '').toLowerCase();
  return (
    Boolean(order.reduceOnly) &&
    (type.includes('stop') || type.includes('tp') || type.includes('sl') || type.includes('take'))
  );
}

async function cancelPositionProfitStops(
  userAddress: `0x${string}`,
  coin: string
): Promise<number> {
  const key = `${userAddress.toLowerCase()}:${coin.toUpperCase()}`;
  const prev = lastCancelAt.get(key) ?? 0;
  if (Date.now() - prev < CANCEL_EVERY_MS) return 0;
  lastCancelAt.set(key, Date.now());

  const orders = await fetchFrontendOpenOrders(userAddress);
  const hits = orders.filter((o) => isPositionStop(o, coin) && Number(o.oid) > 0);
  if (hits.length === 0) return 0;

  const meta = await fetchHlMeta();
  const assetIndex = coinToAssetIndex(meta, coin);
  const client = clientFor(userAddress);
  await client.cancel({
    cancels: hits.map((o) => ({ a: assetIndex, o: Number(o.oid) })),
  });
  logger.warn('HL market profit SL cancelled — never leave exchange TPSL on the book', {
    user: userAddress.slice(0, 10),
    coin,
    oids: hits.map((o) => o.oid),
    types: hits.map((o) => o.orderType ?? 'tpsl'),
  });
  return hits.length;
}

/**
 * Pulls leftover Hyperliquid position TP/SL. Does not post a replacement.
 */
export async function syncHlProfitStopOrder(opts: {
  userAddress: `0x${string}`;
  coin: string;
  direction: 'LONG' | 'SHORT';
  absSize: number;
  markPrice: number;
  entryPrice: number;
  stopPx: number | null;
  armed: boolean;
}): Promise<void> {
  try {
    await cancelPositionProfitStops(opts.userAddress, opts.coin);
  } catch (err) {
    logger.warn('HL profit SL cancel failed', {
      user: opts.userAddress.slice(0, 10),
      coin: opts.coin,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
