/**
 * Dual exchange stops on Hyperliquid:
 *
 * Profit SL  — reduce-only Stop *Market* (`trigger.isMarket = true`, grouping `na`).
 *              Trigger sits on the profit side of entry. `p` is the slippage cap
 *              and is clamped to the profit side of entry (never 10% default).
 *              Uncapped market TPSL can fill through entry (SOL SHORT −$0.56).
 *              Stop-limit with p=trigger can rest unfilled through a gap.
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
  profitStopPlaceable,
  ratchetStop,
} from './dynamicTrailingStop';

const transport = new HttpTransport();

const lastSyncAt = new Map<string, number>();
const lastConfirmedProfitPx = new Map<string, number>();
const lastConfirmedEmergencyPx = new Map<string, number>();
const SYNC_EVERY_MS = 1_200;
const POST_RETRY = 3;

export function lastConfirmedProfitStopPx(
  userAddress: string,
  coin: string
): number | null {
  const px = lastConfirmedProfitPx.get(
    `${userAddress.toLowerCase()}:${coin.toUpperCase()}`
  );
  return px != null && px > 0 ? px : null;
}

export function lastConfirmedEmergencyStopPx(
  userAddress: string,
  coin: string
): number | null {
  const px = lastConfirmedEmergencyPx.get(
    `${userAddress.toLowerCase()}:${coin.toUpperCase()}`
  );
  return px != null && px > 0 ? px : null;
}

function clientFor(userAddress: string): ExchangeClient {
  return new ExchangeClient({
    transport,
    wallet: deriveUserHlAgent(userAddress),
  });
}

export type TriggerClass =
  | 'profit_market'
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
  if (!(opts.absSize > 0) || !(opts.stopPx > 0)) return false;
  if (
    !profitStopPlaceable({
      direction: opts.direction,
      stopPx: opts.stopPx,
      markPx: opts.markPx,
      entryPx: opts.entryPx,
      tickSize: opts.tickSize ?? 0,
    })
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

export type FrontendOrder = {
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

  const capPx = Number(order.limitPx ?? 0);
  const capOnProfitSideOfEntry =
    capPx > 0 && (direction === 'LONG' ? capPx > entryPx : capPx < entryPx);

  if (market && onProfitSideOfEntry) {
    return capOnProfitSideOfEntry ? 'profit_market' : 'legacy_market_profit';
  }
  if (market && onLossSideOfEntry) return 'emergency_market';
  if (!market && onProfitSideOfEntry) return 'profit_limit';
  void onProfitSideOfBe;
  return 'other';
}

/** Worst fill still on the profit side of entry (HL `p` when isMarket). */
export function profitStopMarketCapPx(
  direction: 'LONG' | 'SHORT',
  triggerPx: number,
  entryPx: number,
  tickSize = 0
): number {
  const tick = Math.max(tickSize, entryPx * 1e-8, 1e-8);
  if (direction === 'LONG') {
    const cap = entryPx + tick;
    return cap < triggerPx ? cap : triggerPx;
  }
  const cap = entryPx - tick;
  return cap > triggerPx ? cap : triggerPx;
}

export function isProfitTriggerKind(kind: TriggerClass): boolean {
  return (
    kind === 'profit_market' ||
    kind === 'profit_limit' ||
    kind === 'legacy_market_profit'
  );
}

/**
 * Venue fill model used in tests (HL has no true market: IOC limit at `p`).
 * Stop-limit with p=trigger misses a gap through the trigger.
 * Capped stop-market fills any print between trigger and the profit-side cap.
 */
export function simulateTriggeredProfitFill(opts: {
  execution: 'stop_limit' | 'stop_market_capped' | 'stop_market_uncapped';
  direction: 'LONG' | 'SHORT';
  triggerPx: number;
  capPx: number;
  gapPrintPx: number;
  entryPx: number;
}): 'filled' | 'unfilled' | 'would_realize_loss' {
  const { direction, triggerPx, capPx, gapPrintPx, entryPx } = opts;
  const triggered =
    direction === 'LONG' ? gapPrintPx <= triggerPx : gapPrintPx >= triggerPx;
  if (!triggered) return 'unfilled';

  const realizedLoss =
    direction === 'LONG' ? gapPrintPx < entryPx : gapPrintPx > entryPx;

  if (opts.execution === 'stop_limit') {
    const atOrBetterThanLimit =
      direction === 'LONG' ? gapPrintPx >= capPx : gapPrintPx <= capPx;
    return atOrBetterThanLimit ? (realizedLoss ? 'would_realize_loss' : 'filled') : 'unfilled';
  }

  if (opts.execution === 'stop_market_uncapped') {
    return realizedLoss ? 'would_realize_loss' : 'filled';
  }

  const withinCap =
    direction === 'LONG' ? gapPrintPx >= capPx : gapPrintPx <= capPx;
  if (!withinCap) return 'unfilled';
  return realizedLoss ? 'would_realize_loss' : 'filled';
}

function samePx(a: number, b: number, tick: number): boolean {
  const tol = Math.max(tick, Math.abs(b) * 1e-6, 1e-8);
  return Math.abs(a - b) <= tol * 1.5;
}

export function shouldDeferTrailSync(opts: {
  nowMs: number;
  lastSyncAt: number;
  intervalMs?: number;
  firstProfitPlacement: boolean;
  emergencyMissing: boolean;
  upgradeLimitToMarket: boolean;
}): boolean {
  if (opts.firstProfitPlacement || opts.emergencyMissing || opts.upgradeLimitToMarket) {
    return false;
  }
  return opts.nowMs - (opts.lastSyncAt || 0) < (opts.intervalMs ?? SYNC_EVERY_MS);
}

export type ProtectiveSyncPlan = {
  reconstructedProfitPx: number | null;
  reconstructedEmergencyPx: number | null;
  mergedProfitPx: number | null;
  existingProfitKind: 'none' | 'limit' | 'market';
  firstProfitPlacement: boolean;
  emergencyMissing: boolean;
  upgradeLimitToMarket: boolean;
  deferTrail: boolean;
  cancelOids: number[];
  postEmergencyPx: number | null;
  postProfit: { triggerPx: number; capPx: number } | null;
};

export function planProtectiveSync(opts: {
  direction: 'LONG' | 'SHORT';
  entryPx: number;
  markPx: number;
  absSize: number;
  orders: FrontendOrder[];
  coin: string;
  desiredStopPx: number | null;
  armed: boolean;
  emergencyStopPx: number | null;
  minLockUsd?: number;
  tickSize: number;
  breakevenPx: number;
  nowMs: number;
  lastTrailSyncAt: number;
  trailSyncIntervalMs?: number;
}): ProtectiveSyncPlan {
  const classified = opts.orders
    .filter((o) => Number(o.oid) > 0)
    .map((o) => ({
      order: o,
      kind: classifyHlTriggerOrder(
        o,
        opts.coin,
        opts.direction,
        opts.entryPx,
        opts.breakevenPx
      ),
    }));

  const legacyOids = classified
    .filter((x) => x.kind === 'legacy_market_profit')
    .map((x) => Number(x.order.oid));
  const profitOrders = classified.filter((x) => isProfitTriggerKind(x.kind));
  const emergencyOrders = classified.filter((x) => x.kind === 'emergency_market');

  const reconstructedProfitPx = profitOrders.reduce<number | null>((best, x) => {
    const px = Number(x.order.triggerPx ?? x.order.limitPx ?? 0);
    if (!(px > 0)) return best;
    return best == null ? px : ratchetStop(opts.direction, best, px);
  }, null);
  const reconstructedEmergencyPx = emergencyOrders.reduce<number | null>((best, x) => {
    const px = Number(x.order.triggerPx ?? 0);
    if (!(px > 0)) return best;
    return best == null ? px : px;
  }, null);

  const existingProfitKind: ProtectiveSyncPlan['existingProfitKind'] = profitOrders.some(
    (x) => x.kind === 'profit_market'
  )
    ? 'market'
    : profitOrders.some((x) => x.kind === 'profit_limit')
      ? 'limit'
      : 'none';

  const mergedProfitPx =
    opts.desiredStopPx != null
      ? ratchetStop(opts.direction, reconstructedProfitPx, opts.desiredStopPx)
      : reconstructedProfitPx;

  const wantProfit =
    opts.armed &&
    mergedProfitPx != null &&
    profitStopSafeToPost({
      direction: opts.direction,
      stopPx: mergedProfitPx,
      markPx: opts.markPx,
      entryPx: opts.entryPx,
      absSize: opts.absSize,
      minLockUsd: opts.minLockUsd ?? 0,
      breakevenPx: opts.breakevenPx,
      tickSize: opts.tickSize,
      isMarket: true,
    });

  const matchingMarket = profitOrders.find((x) => {
    if (x.kind !== 'profit_market') return false;
    const px = Number(x.order.triggerPx ?? 0);
    const sz = Number(x.order.sz ?? 0);
    return (
      samePx(px, mergedProfitPx ?? 0, opts.tickSize) &&
      (sz <= 0 || Math.abs(sz - opts.absSize) / Math.max(opts.absSize, 1e-9) < 0.02)
    );
  });

  const firstProfitPlacement = Boolean(wantProfit && existingProfitKind === 'none');
  const upgradeLimitToMarket = Boolean(
    wantProfit && existingProfitKind === 'limit' && !matchingMarket
  );
  const wantEmergency =
    opts.emergencyStopPx != null &&
    emergencySideOk(opts.direction, opts.emergencyStopPx, opts.markPx, opts.entryPx);
  const matchingEmergency = emergencyOrders.find((x) =>
    samePx(Number(x.order.triggerPx ?? 0), opts.emergencyStopPx ?? 0, opts.tickSize)
  );
  const emergencyMissing = Boolean(wantEmergency && !matchingEmergency);

  const needsTrailTighten =
    mergedProfitPx != null &&
    reconstructedProfitPx != null &&
    !samePx(mergedProfitPx, reconstructedProfitPx, opts.tickSize) &&
    (opts.direction === 'SHORT'
      ? mergedProfitPx < reconstructedProfitPx - opts.tickSize * 0.25
      : mergedProfitPx > reconstructedProfitPx + opts.tickSize * 0.25);

  const deferTrail =
    !needsTrailTighten &&
    shouldDeferTrailSync({
      nowMs: opts.nowMs,
      lastSyncAt: opts.lastTrailSyncAt,
      intervalMs: opts.trailSyncIntervalMs,
      firstProfitPlacement,
      emergencyMissing,
      upgradeLimitToMarket,
    });

  const cancelOids = [...legacyOids];
  if (!opts.armed || !wantProfit) {
    cancelOids.push(...profitOrders.map((x) => Number(x.order.oid)).filter((id) => id > 0));
  }
  let postProfit: ProtectiveSyncPlan['postProfit'] = null;
  if (wantProfit && !matchingMarket && !deferTrail) {
    cancelOids.push(...profitOrders.map((x) => Number(x.order.oid)));
    postProfit = {
      triggerPx: mergedProfitPx as number,
      capPx: profitStopMarketCapPx(
        opts.direction,
        mergedProfitPx as number,
        opts.entryPx,
        opts.tickSize
      ),
    };
  }

  return {
    reconstructedProfitPx,
    reconstructedEmergencyPx,
    mergedProfitPx,
    existingProfitKind,
    firstProfitPlacement,
    emergencyMissing,
    upgradeLimitToMarket,
    deferTrail,
    cancelOids: [...new Set(cancelOids.filter((id) => id > 0))],
    postEmergencyPx: emergencyMissing ? opts.emergencyStopPx : null,
    postProfit,
  };
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

export function buildProfitStopMarketLeg(opts: {
  assetIndex: number;
  direction: 'LONG' | 'SHORT';
  size: number;
  stopPx: number;
  entryPx: number;
  szDecimals: number;
  tickSize?: number;
}): {
  a: number;
  b: boolean;
  p: string;
  s: string;
  r: true;
  t: { trigger: { isMarket: true; triggerPx: string; tpsl: 'sl' } };
} {
  const trigger = formatHlPrice(opts.stopPx, opts.szDecimals);
  const capPx = profitStopMarketCapPx(
    opts.direction,
    opts.stopPx,
    opts.entryPx,
    opts.tickSize ?? 0
  );
  const cap = formatHlPrice(capPx, opts.szDecimals);
  return {
    a: opts.assetIndex,
    b: opts.direction !== 'LONG',
    p: cap,
    s: formatHlCloseSize(opts.size, opts.szDecimals),
    r: true,
    t: {
      trigger: {
        isMarket: true,
        triggerPx: trigger,
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

export async function fetchFrontendOpenOrders(
  userAddress: string
): Promise<FrontendOrder[] | null> {
  try {
    const res = await fetch(config.hyperliquid.infoUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'frontendOpenOrders',
        user: userAddress.toLowerCase(),
      }),
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as FrontendOrder[];
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    logger.warn('HL frontendOpenOrders failed', {
      user: userAddress.slice(0, 10),
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
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

/** Cancel reduce-only triggers for a coin after a full flatten. Never throws. */
export async function cancelProtectiveOrdersForCoin(opts: {
  userAddress: `0x${string}`;
  coin: string;
  direction: 'LONG' | 'SHORT';
  entryPx: number;
}): Promise<number> {
  try {
    const orders = await fetchFrontendOpenOrders(opts.userAddress);
    if (orders == null || orders.length === 0) return 0;
    const be = opts.entryPx;
    const oids = orders
      .filter((o) => {
        const kind = classifyHlTriggerOrder(
          o,
          opts.coin,
          opts.direction,
          opts.entryPx,
          be
        );
        return (
          kind === 'profit_market' ||
          kind === 'profit_limit' ||
          kind === 'emergency_market' ||
          kind === 'legacy_market_profit'
        );
      })
      .map((o) => Number(o.oid))
      .filter((id) => id > 0);
    if (oids.length === 0) return 0;
    await cancelOids(opts.userAddress, opts.coin, oids);
    logger.info('HL protective orders cancelled after close', {
      user: opts.userAddress.slice(0, 10),
      coin: opts.coin,
      oids,
    });
    return oids.length;
  } catch (err) {
    logger.warn('HL protective cancel after close failed', {
      user: opts.userAddress.slice(0, 10),
      coin: opts.coin,
      error: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}

export async function confirmUserEmergencyStop(opts: {
  userAddress: `0x${string}`;
  coin: string;
  direction: 'LONG' | 'SHORT';
  absSize: number;
  stopPx: number;
  szDecimals: number;
}): Promise<{ ok: boolean; reason: string; stopPx: number }> {
  if (!(opts.stopPx > 0) || !(opts.absSize > 0)) {
    return { ok: false, reason: 'LONG_SL_VALIDATION_FAILED — invalid SL px/size', stopPx: opts.stopPx };
  }
  try {
    const meta = await fetchHlMeta();
    const assetIndex = coinToAssetIndex(meta, opts.coin);
    const leg = buildEmergencyStopMarketLeg({
      assetIndex,
      direction: opts.direction,
      size: opts.absSize,
      stopPx: opts.stopPx,
      szDecimals: opts.szDecimals,
    });
    const client = clientFor(opts.userAddress);
    const result = await client.order({ orders: [leg], grouping: 'na' });
    const status = result.response?.data?.statuses?.[0] as
      | { error?: string; resting?: unknown; filled?: unknown }
      | undefined;
    if (status && 'error' in status && status.error) {
      return {
        ok: false,
        reason: `LONG_SL_VALIDATION_FAILED — ${String(status.error)}`,
        stopPx: opts.stopPx,
      };
    }
    logger.info('HL user emergency SL confirmed on open', {
      user: opts.userAddress.slice(0, 10),
      coin: opts.coin,
      stopPx: opts.stopPx,
      direction: opts.direction,
    });
    return { ok: true, reason: 'user SL posted', stopPx: opts.stopPx };
  } catch (err) {
    return {
      ok: false,
      reason: `LONG_SL_VALIDATION_FAILED — ${err instanceof Error ? err.message : String(err)}`,
      stopPx: opts.stopPx,
    };
  }
}

export function resetProtectiveSyncForTests(): void {
  lastSyncAt.clear();
  lastConfirmedProfitPx.clear();
  lastConfirmedEmergencyPx.clear();
}

export function snapshotConfirmedStops(
  orders: FrontendOrder[],
  coin: string,
  direction: 'LONG' | 'SHORT',
  entryPx: number
): { profitPx: number | null; emergencyPx: number | null } {
  let profitPx: number | null = null;
  let emergencyPx: number | null = null;
  for (const o of orders) {
    const kind = classifyHlTriggerOrder(o, coin, direction, entryPx, entryPx);
    const trig = Number(o.triggerPx ?? o.limitPx ?? 0);
    if (!(trig > 0)) continue;
    if (isProfitTriggerKind(kind)) {
      profitPx = profitPx == null ? trig : ratchetStop(direction, profitPx, trig);
    }
    if (kind === 'emergency_market') emergencyPx = trig;
  }
  return { profitPx, emergencyPx };
}

export function rememberConfirmedStops(
  userAddress: string,
  coin: string,
  profitPx: number | null,
  emergencyPx: number | null
): void {
  const key = `${userAddress.toLowerCase()}:${coin.toUpperCase()}`;
  if (profitPx != null && profitPx > 0) lastConfirmedProfitPx.set(key, profitPx);
  if (emergencyPx != null && emergencyPx > 0) lastConfirmedEmergencyPx.set(key, emergencyPx);
}

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
  openOrders?: FrontendOrder[] | null;
  nowMs?: number;
}): Promise<ProtectiveSyncPlan | null> {
  const key = `${opts.userAddress.toLowerCase()}:${opts.coin.toUpperCase()}`;
  const nowMs = opts.nowMs ?? Date.now();

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

    const orders =
      opts.openOrders !== undefined
        ? opts.openOrders
        : await fetchFrontendOpenOrders(opts.userAddress);
    if (orders == null) {
      logger.warn('HL profit/emergency stop sync skipped — open orders unreachable', {
        user: opts.userAddress.slice(0, 10),
        coin: opts.coin,
      });
      return null;
    }

    let plan = planProtectiveSync({
      direction: opts.direction,
      entryPx: opts.entryPrice,
      markPx: opts.markPrice,
      absSize: opts.absSize,
      orders,
      coin: opts.coin,
      desiredStopPx: opts.stopPx,
      armed: opts.armed,
      emergencyStopPx: opts.emergencyStopPx ?? null,
      minLockUsd: opts.minLockUsd ?? 0,
      tickSize: tick,
      breakevenPx: be,
      nowMs,
      lastTrailSyncAt: lastSyncAt.get(key) ?? 0,
    });

    rememberConfirmedStops(
      opts.userAddress,
      opts.coin,
      plan.reconstructedProfitPx,
      plan.reconstructedEmergencyPx
    );

    if (plan.cancelOids.length > 0) {
      try {
        await cancelOids(opts.userAddress, opts.coin, plan.cancelOids);
      } catch (err) {
        logger.warn('HL protective cancel failed — keeping rest', {
          user: opts.userAddress.slice(0, 10),
          coin: opts.coin,
          error: err instanceof Error ? err.message : String(err),
        });
        if (plan.postProfit) {
          plan = { ...plan, postProfit: null };
        }
      }
    }

    // Emergency first — never wait for the trail throttle.
    if (plan.postEmergencyPx != null) {
      const leg = buildEmergencyStopMarketLeg({
        assetIndex,
        direction: opts.direction,
        size: opts.absSize,
        stopPx: plan.postEmergencyPx,
        szDecimals,
      });
      try {
        const client = clientFor(opts.userAddress);
        await client.order({ orders: [leg], grouping: 'na' });
        rememberConfirmedStops(opts.userAddress, opts.coin, null, plan.postEmergencyPx);
        logger.info('HL emergency market SL posted', {
          user: opts.userAddress.slice(0, 10),
          coin: opts.coin,
          stopPx: plan.postEmergencyPx,
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

    if (plan.postProfit) {
      const leg = buildProfitStopMarketLeg({
        assetIndex,
        direction: opts.direction,
        size: opts.absSize,
        stopPx: plan.postProfit.triggerPx,
        entryPx: opts.entryPrice,
        szDecimals,
        tickSize: tick,
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
        logger.warn('HL capped profit stop-market post failed', {
          user: opts.userAddress.slice(0, 10),
          coin: opts.coin,
          stopPx: plan.postProfit.triggerPx,
          error: lastErr,
        });
      } else {
        lastSyncAt.set(key, nowMs);
        rememberConfirmedStops(
          opts.userAddress,
          opts.coin,
          plan.postProfit.triggerPx,
          plan.reconstructedEmergencyPx
        );
        logger.info('HL capped profit stop-market posted', {
          user: opts.userAddress.slice(0, 10),
          coin: opts.coin,
          direction: opts.direction,
          stopPx: plan.postProfit.triggerPx,
          capPx: plan.postProfit.capPx,
          first: plan.firstProfitPlacement,
          isMarket: true,
          tpsl: 'sl',
          grouping: 'na',
        });
      }
    } else if (!plan.deferTrail && !plan.firstProfitPlacement) {
      lastSyncAt.set(key, nowMs);
    }

    return plan;
  } catch (err) {
    logger.warn('HL profit/emergency stop sync failed', {
      user: opts.userAddress.slice(0, 10),
      coin: opts.coin,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
