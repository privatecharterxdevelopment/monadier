/**
 * Dual exchange stops on Hyperliquid:
 *
 * Profit SL  — reduce-only Stop *Limit* (`trigger.isMarket = false`, grouping `na`).
 *              Trigger + limit sit on the profit side of fee-adjusted BE.
 *              A market TPSL can fill through the trigger into a realized loss
 *              (SOL SHORT −$0.56). Profit exits never use isMarket: true.
 *
 * Emergency SL — reduce-only Stop *Market* on the loss side of entry. Independent.
 *                Never cancelled when the profit stop is replaced.
 *
 * Hyperliquid trigger payload (SDK /exchange):
 *   t: { trigger: { isMarket, triggerPx, tpsl: 'tp' | 'sl' } }
 *   p: limit price when isMarket is false; slippage cap when true.
 *   r: true (reduce-only)
 *   grouping: 'na' for standalone triggers so profit + emergency can coexist.
 *             'positionTpsl' allows only one SL per position — do not use it
 *             for the profit stop (it would clobber emergency).
 */
import { ExchangeClient, HttpTransport } from '@nktkas/hyperliquid';
import { config } from '../config';
import { logger } from '../utils/logger';
import { deriveUserHlAgent } from './hlAgent';
import {
  coinToAssetIndex,
  fetchHlMeta,
  formatHlCloseSize,
  formatHlPrice,
  hlTickSize,
} from './hlInfo';
import {
  breakevenPlusFeesStopPx,
  lockedPnlAtStopPx,
  minProfitTrailGapPx,
} from './dynamicTrailingStop';

const transport = new HttpTransport();

const lastSyncAt = new Map<string, number>();
const SYNC_EVERY_MS = 2_500;
const POST_RETRY = 3;

function clientFor(userAddress: string): ExchangeClient {
  return new ExchangeClient({
    transport,
    wallet: deriveUserHlAgent(userAddress),
  });
}

export type TriggerClass =
  | 'profit_limit'
  | 'emergency_market'
  | 'legacy_market_profit'
  | 'other';

export function protectiveSideOk(
  direction: 'LONG' | 'SHORT',
  stopPx: number,
  markPx: number,
  entryPx: number,
  breakevenPx: number,
  tickSize = 0
): boolean {
  if (!(stopPx > 0) || !(markPx > 0) || !(entryPx > 0) || !(breakevenPx > 0)) {
    return false;
  }
  const minAway = Math.max(minProfitTrailGapPx(markPx, tickSize), markPx * 0.0004);
  if (direction === 'LONG') {
    if (!(breakevenPx > entryPx)) return false;
    return stopPx >= breakevenPx && stopPx > entryPx && stopPx <= markPx - minAway;
  }
  if (!(breakevenPx < entryPx)) return false;
  return stopPx <= breakevenPx && stopPx < entryPx && stopPx >= markPx + minAway;
}

export function profitStopSafeToPost(opts: {
  direction: 'LONG' | 'SHORT';
  stopPx: number;
  markPx: number;
  entryPx: number;
  absSize: number;
  minLockUsd: number;
  breakevenPx: number;
  tickSize?: number;
  isMarket?: boolean;
}): boolean {
  if (opts.isMarket) return false;
  if (!(opts.absSize > 0) || !(opts.stopPx > 0)) return false;
  if (
    !protectiveSideOk(
      opts.direction,
      opts.stopPx,
      opts.markPx,
      opts.entryPx,
      opts.breakevenPx,
      opts.tickSize ?? 0
    )
  ) {
    return false;
  }
  const lock = lockedPnlAtStopPx(
    opts.direction,
    opts.entryPx,
    opts.absSize,
    opts.stopPx
  );
  return lock >= Math.max(0, opts.minLockUsd);
}

export function emergencySideOk(
  direction: 'LONG' | 'SHORT',
  stopPx: number,
  markPx: number,
  entryPx: number
): boolean {
  if (!(stopPx > 0) || !(markPx > 0) || !(entryPx > 0)) return false;
  if (direction === 'LONG') {
    return stopPx < entryPx && stopPx < markPx;
  }
  return stopPx > entryPx && stopPx > markPx;
}

type FrontendOrder = {
  coin?: string;
  oid?: number;
  side?: string;
  reduceOnly?: boolean;
  isTrigger?: boolean;
  isPositionTpsl?: boolean;
  orderType?: string;
  triggerPx?: string;
  limitPx?: string;
  sz?: string;
};

export function isMarketTriggerType(orderType: string | undefined): boolean {
  const t = String(orderType ?? '').toLowerCase();
  if (t.includes('limit')) return false;
  if (t.includes('market')) return true;
  return t === 'stop' || t === 'take profit' || t === 'tpsl';
}

export function classifyHlTriggerOrder(
  order: FrontendOrder,
  coin: string,
  direction: 'LONG' | 'SHORT',
  entryPx: number,
  breakevenPx: number
): TriggerClass {
  if (String(order.coin ?? '').toUpperCase() !== coin.toUpperCase()) return 'other';
  const type = String(order.orderType ?? '').toLowerCase();
  const triggerish =
    order.isTrigger ||
    order.isPositionTpsl ||
    (Boolean(order.reduceOnly) &&
      (type.includes('stop') ||
        type.includes('tp') ||
        type.includes('sl') ||
        type.includes('take')));
  if (!triggerish) return 'other';
  const stopPx = Number(order.triggerPx ?? order.limitPx ?? 0);
  if (!(stopPx > 0)) return 'other';
  const market = isMarketTriggerType(order.orderType);
  const onProfitSideOfEntry =
    direction === 'LONG' ? stopPx > entryPx : stopPx < entryPx;
  const onLossSideOfEntry =
    direction === 'LONG' ? stopPx < entryPx : stopPx > entryPx;
  const onProfitSideOfBe =
    direction === 'LONG' ? stopPx >= breakevenPx : stopPx <= breakevenPx;

  if (market && onProfitSideOfEntry) return 'legacy_market_profit';
  if (market && onLossSideOfEntry) return 'emergency_market';
  if (!market && onProfitSideOfBe) return 'profit_limit';
  return 'other';
}

export function buildProfitStopLimitLeg(opts: {
  assetIndex: number;
  direction: 'LONG' | 'SHORT';
  size: number;
  stopPx: number;
  szDecimals: number;
}): {
  a: number;
  b: boolean;
  p: string;
  s: string;
  r: true;
  t: { trigger: { isMarket: false; triggerPx: string; tpsl: 'sl' } };
} {
  const px = formatHlPrice(opts.stopPx, opts.szDecimals);
  return {
    a: opts.assetIndex,
    b: opts.direction !== 'LONG',
    p: px,
    s: formatHlCloseSize(opts.size, opts.szDecimals),
    r: true,
    t: {
      trigger: {
        isMarket: false,
        triggerPx: px,
        tpsl: 'sl',
      },
    },
  };
}

export function buildEmergencyStopMarketLeg(opts: {
  assetIndex: number;
  direction: 'LONG' | 'SHORT';
  size: number;
  stopPx: number;
  szDecimals: number;
}): {
  a: number;
  b: boolean;
  p: string;
  s: string;
  r: true;
  t: { trigger: { isMarket: true; triggerPx: string; tpsl: 'sl' } };
} {
  const px = formatHlPrice(opts.stopPx, opts.szDecimals);
  return {
    a: opts.assetIndex,
    b: opts.direction !== 'LONG',
    p: px,
    s: formatHlCloseSize(opts.size, opts.szDecimals),
    r: true,
    t: {
      trigger: {
        isMarket: true,
        triggerPx: px,
        tpsl: 'sl',
      },
    },
  };
}

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
  } catch (err) {
    logger.warn('HL frontendOpenOrders failed', {
      user: userAddress.slice(0, 10),
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

async function cancelOids(
  userAddress: `0x${string}`,
  coin: string,
  oids: number[]
): Promise<void> {
  if (oids.length === 0) return;
  const meta = await fetchHlMeta();
  const assetIndex = coinToAssetIndex(meta, coin);
  const client = clientFor(userAddress);
  await client.cancel({
    cancels: oids.map((o) => ({ a: assetIndex, o })),
  });
}

function samePx(a: number, b: number, tick: number): boolean {
  const tol = Math.max(tick, Math.abs(b) * 1e-6, 1e-8);
  return Math.abs(a - b) <= tol * 1.5;
}

/**
 * Replace only the profit-limit stop. Cancels leftover *market* profit TPSL
 * (the SOL-incident class). Never cancels emergency market SLs or unrelated
 * reduce-only orders.
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
  feesUsd?: number;
  fundingUsd?: number;
  tickSize?: number;
  szDecimals?: number;
  minLockUsd?: number;
  emergencyStopPx?: number | null;
}): Promise<void> {
  const key = `${opts.userAddress.toLowerCase()}:${opts.coin.toUpperCase()}`;
  const prev = lastSyncAt.get(key) ?? 0;
  if (Date.now() - prev < SYNC_EVERY_MS) return;
  lastSyncAt.set(key, Date.now());

  try {
    const meta = await fetchHlMeta();
    const assetIndex = coinToAssetIndex(meta, opts.coin);
    const szDecimals =
      opts.szDecimals ?? meta.universe[assetIndex]?.szDecimals ?? 0;
    const tick =
      opts.tickSize && opts.tickSize > 0
        ? opts.tickSize
        : hlTickSize(opts.markPrice, szDecimals);
    const feesUsd = opts.feesUsd ?? 0;
    const be = breakevenPlusFeesStopPx(
      opts.direction,
      opts.entryPrice,
      opts.absSize,
      feesUsd,
      opts.fundingUsd ?? 0,
      opts.absSize * opts.markPrice,
      tick,
      szDecimals
    );

    const orders = await fetchFrontendOpenOrders(opts.userAddress);
    const classified = orders
      .filter((o) => Number(o.oid) > 0)
      .map((o) => ({
        order: o,
        kind: classifyHlTriggerOrder(
          o,
          opts.coin,
          opts.direction,
          opts.entryPrice,
          be
        ),
      }));

    const legacy = classified
      .filter((x) => x.kind === 'legacy_market_profit')
      .map((x) => Number(x.order.oid));
    if (legacy.length > 0) {
      await cancelOids(opts.userAddress, opts.coin, legacy);
      logger.warn('HL cancelled leftover MARKET profit TPSL', {
        user: opts.userAddress.slice(0, 10),
        coin: opts.coin,
        oids: legacy,
      });
    }

    const profitOrders = classified.filter((x) => x.kind === 'profit_limit');
    const emergencyOrders = classified.filter((x) => x.kind === 'emergency_market');

    const wantProfit =
      opts.armed &&
      opts.stopPx != null &&
      profitStopSafeToPost({
        direction: opts.direction,
        stopPx: opts.stopPx,
        markPx: opts.markPrice,
        entryPx: opts.entryPrice,
        absSize: opts.absSize,
        minLockUsd: opts.minLockUsd ?? 0,
        breakevenPx: be,
        tickSize: tick,
        isMarket: false,
      });

    const matchingProfit = profitOrders.find((x) => {
      const px = Number(x.order.triggerPx ?? x.order.limitPx ?? 0);
      const sz = Number(x.order.sz ?? 0);
      return (
        samePx(px, opts.stopPx ?? 0, tick) &&
        (sz <= 0 || Math.abs(sz - opts.absSize) / Math.max(opts.absSize, 1e-9) < 0.02)
      );
    });

    if (!wantProfit) {
      const stale = profitOrders.map((x) => Number(x.order.oid));
      if (stale.length > 0) {
        await cancelOids(opts.userAddress, opts.coin, stale);
        logger.info('HL profit limit stop cancelled (unarmed or unsafe)', {
          user: opts.userAddress.slice(0, 10),
          coin: opts.coin,
          oids: stale,
        });
      }
    } else if (!matchingProfit) {
      const replace = profitOrders.map((x) => Number(x.order.oid));
      if (replace.length > 0) {
        try {
          await cancelOids(opts.userAddress, opts.coin, replace);
        } catch (err) {
          logger.warn('HL profit limit cancel-before-replace failed — keeping rest', {
            user: opts.userAddress.slice(0, 10),
            coin: opts.coin,
            error: err instanceof Error ? err.message : String(err),
          });
          return;
        }
      }
      const leg = buildProfitStopLimitLeg({
        assetIndex,
        direction: opts.direction,
        size: opts.absSize,
        stopPx: opts.stopPx as number,
        szDecimals,
      });
      const client = clientFor(opts.userAddress);
      let posted = false;
      let lastErr = '';
      for (let i = 0; i < POST_RETRY && !posted; i += 1) {
        try {
          const result = await client.order({
            orders: [leg],
            grouping: 'na',
          });
          const status = result.response?.data?.statuses?.[0] as
            | { error?: string; resting?: unknown; filled?: unknown }
            | undefined;
          if (status && 'error' in status && status.error) {
            lastErr = String(status.error);
          } else {
            posted = true;
          }
        } catch (err) {
          lastErr = err instanceof Error ? err.message : String(err);
        }
        if (!posted && i < POST_RETRY - 1) {
          await new Promise((r) => setTimeout(r, 200 * (i + 1)));
        }
      }
      if (!posted) {
        logger.warn('HL profit limit stop post failed', {
          user: opts.userAddress.slice(0, 10),
          coin: opts.coin,
          stopPx: opts.stopPx,
          error: lastErr,
        });
      } else {
        logger.info('HL profit limit stop posted', {
          user: opts.userAddress.slice(0, 10),
          coin: opts.coin,
          direction: opts.direction,
          stopPx: opts.stopPx,
          be,
          isMarket: false,
          tpsl: 'sl',
          grouping: 'na',
        });
      }
    }

    const emergencyPx = opts.emergencyStopPx;
    const wantEmergency =
      emergencyPx != null &&
      emergencySideOk(opts.direction, emergencyPx, opts.markPrice, opts.entryPrice);

    const matchingEmergency = emergencyOrders.find((x) => {
      const px = Number(x.order.triggerPx ?? 0);
      return samePx(px, emergencyPx ?? 0, tick);
    });

    if (wantEmergency && !matchingEmergency) {
      const replaceEm = emergencyOrders.map((x) => Number(x.order.oid));
      if (replaceEm.length > 0) {
        try {
          await cancelOids(opts.userAddress, opts.coin, replaceEm);
        } catch (err) {
          logger.warn('HL emergency SL cancel-before-replace failed — leaving it', {
            user: opts.userAddress.slice(0, 10),
            coin: opts.coin,
            error: err instanceof Error ? err.message : String(err),
          });
          return;
        }
      }
      const leg = buildEmergencyStopMarketLeg({
        assetIndex,
        direction: opts.direction,
        size: opts.absSize,
        stopPx: emergencyPx as number,
        szDecimals,
      });
      try {
        const client = clientFor(opts.userAddress);
        await client.order({ orders: [leg], grouping: 'na' });
        logger.info('HL emergency market SL posted', {
          user: opts.userAddress.slice(0, 10),
          coin: opts.coin,
          stopPx: emergencyPx,
          isMarket: true,
        });
      } catch (err) {
        logger.warn('HL emergency SL post failed', {
          user: opts.userAddress.slice(0, 10),
          coin: opts.coin,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    logger.warn('HL profit/emergency stop sync failed', {
      user: opts.userAddress.slice(0, 10),
      coin: opts.coin,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
