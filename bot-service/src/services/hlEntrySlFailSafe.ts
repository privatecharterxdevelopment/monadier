/**
 * Exchange-confirmed entry fill + user emergency SL fail-safe.
 * Strategy / gates are untouched. This only covers Fill → SL → Flatten.
 */
import { logger } from '../utils/logger';
import { lossStopPricePx } from './dynamicTrailingStop';
import {
  setHlExecutionState,
  type LongOpportunityClass,
} from './hlExecutionState';
import {
  classifyHlTriggerOrder,
  emergencySideOk,
} from './hlProfitStopSync';

export const SL_FAIL_SAFE_FLATTEN_REASON = 'sl_fail_safe_flatten';

export type HlOrderStatusBlob = {
  filled?: { totalSz?: string | number; avgPx?: string | number; oid?: number };
  resting?: { oid?: number };
  error?: string;
};

export type ParsedHlOrderStatus = {
  kind: 'filled' | 'partial' | 'resting' | 'rejected' | 'timeout' | 'unknown';
  filledSize: number;
  avgPx: number | null;
  oid: number | null;
  error?: string;
};

export type ExchangePosition = {
  coin: string;
  szi: number;
  entryPx: number;
  leverage: number;
};

export type ExchangeTriggerOrder = {
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

export type UserFill = {
  coin: string;
  px: number;
  sz: number;
  side: string;
  oid?: number;
  time?: number;
};

export type FlattenResult = {
  attempted: boolean;
  remainingAbs: number;
  exchangeUnreachable: boolean;
};

export type EntrySlExchange = {
  fetchPosition: (coin: string) => Promise<ExchangePosition | null | 'unreachable'>;
  fetchOpenOrders: () => Promise<ExchangeTriggerOrder[] | 'unreachable'>;
  fetchRecentFills?: () => Promise<UserFill[] | 'unreachable'>;
  postEmergencySl: (opts: {
    absSize: number;
    stopPx: number;
    direction: 'LONG' | 'SHORT';
  }) => Promise<{ accepted: boolean; error?: string }>;
  cancelOids?: (oids: number[]) => Promise<void>;
  flattenReduceOnly: (absSize: number) => Promise<FlattenResult>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

export type EntrySlFailSafeInput = {
  wallet: string;
  coin: string;
  direction: 'LONG' | 'SHORT';
  requestedSize: number;
  requestedEntryPx: number;
  collateralUsd: number;
  stopLossPercent: number;
  szDecimals: number;
  longClass: LongOpportunityClass;
  orderStatus?: HlOrderStatusBlob | null;
  entryTimedOut: boolean;
  exchange: EntrySlExchange;
  slRetryBudgetMs?: number;
  slRetries?: number;
  flattenPasses?: number;
};

export type EntrySlFailSafeResult = {
  openKept: boolean;
  fillProven: boolean;
  slConfirmed: boolean;
  flattened: boolean;
  critical: boolean;
  userSlDisabled: boolean;
  filledSize: number;
  avgPx: number | null;
  stopPx: number | null;
  reason: string;
};

const criticalByWallet = new Map<
  string,
  { coin: string; direction: 'LONG' | 'SHORT'; reason: string; at: number }
>();
const coinLocks = new Map<string, Promise<unknown>>();

export function isWalletSlCritical(wallet: string): boolean {
  return criticalByWallet.has(wallet.toLowerCase());
}

export function getWalletSlCritical(wallet: string) {
  return criticalByWallet.get(wallet.toLowerCase()) ?? null;
}

export function markWalletSlCritical(
  wallet: string,
  coin: string,
  direction: 'LONG' | 'SHORT',
  reason: string
): void {
  criticalByWallet.set(wallet.toLowerCase(), {
    coin: coin.toUpperCase(),
    direction,
    reason,
    at: Date.now(),
  });
}

export function clearWalletSlCritical(wallet: string): void {
  criticalByWallet.delete(wallet.toLowerCase());
}

export function resetEntrySlFailSafeForTests(): void {
  criticalByWallet.clear();
  coinLocks.clear();
}

export async function withCoinSlLock<T>(
  wallet: string,
  coin: string,
  fn: () => Promise<T>
): Promise<T> {
  const key = `${wallet.toLowerCase()}:${coin.toUpperCase()}`;
  const prev = coinLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const chained = prev.then(() => gate);
  coinLocks.set(key, chained);
  await prev.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
    if (coinLocks.get(key) === chained) coinLocks.delete(key);
  }
}

export function parseHlOrderStatus(
  status: HlOrderStatusBlob | null | undefined,
  requestedSize: number,
  timedOut: boolean
): ParsedHlOrderStatus {
  if (status && typeof status.error === 'string' && status.error) {
    return {
      kind: 'rejected',
      filledSize: 0,
      avgPx: null,
      oid: null,
      error: status.error,
    };
  }
  const filledSz = Number(status?.filled?.totalSz ?? 0);
  const avgPx = Number(status?.filled?.avgPx ?? 0);
  const oid = Number(status?.filled?.oid ?? status?.resting?.oid ?? 0) || null;
  if (filledSz > 0) {
    const avg = avgPx > 0 ? avgPx : null;
    if (requestedSize > 0 && filledSz + 1e-12 < requestedSize * 0.999) {
      return { kind: 'partial', filledSize: filledSz, avgPx: avg, oid };
    }
    return { kind: 'filled', filledSize: filledSz, avgPx: avg, oid };
  }
  if (status?.resting) {
    return { kind: 'resting', filledSize: 0, avgPx: null, oid };
  }
  if (timedOut) {
    return { kind: 'timeout', filledSize: 0, avgPx: null, oid, error: 'entry timeout' };
  }
  if (!status) {
    return { kind: 'unknown', filledSize: 0, avgPx: null, oid, error: 'missing order status' };
  }
  return { kind: 'unknown', filledSize: 0, avgPx: null, oid };
}

export function matchingEmergencyStop(opts: {
  orders: ExchangeTriggerOrder[];
  coin: string;
  direction: 'LONG' | 'SHORT';
  entryPx: number;
  absSize: number;
  stopPx: number;
  tick?: number;
}): ExchangeTriggerOrder | null {
  const coin = opts.coin.toUpperCase();
  const tick = opts.tick ?? Math.max(Math.abs(opts.stopPx) * 1e-6, 1e-8);
  for (const order of opts.orders) {
    const kind = classifyHlTriggerOrder(order, coin, opts.direction, opts.entryPx, opts.entryPx);
    if (kind !== 'emergency_market') continue;
    if (!order.reduceOnly && order.reduceOnly !== undefined) continue;
    const trig = Number(order.triggerPx ?? order.limitPx ?? 0);
    if (!(trig > 0)) continue;
    if (!emergencySideOk(opts.direction, trig, opts.entryPx, opts.entryPx)) continue;
    const sz = Number(order.sz ?? 0);
    if (sz > 0 && opts.absSize > 0 && Math.abs(sz - opts.absSize) / opts.absSize > 0.05) {
      continue;
    }
    if (Math.abs(trig - opts.stopPx) <= tick * 8 || Math.abs(trig - opts.stopPx) / Math.max(opts.stopPx, 1e-9) < 0.004) {
      return order;
    }
    // Existing loss-side market SL covering this size is still protection.
    if (sz <= 0 || Math.abs(sz - opts.absSize) / Math.max(opts.absSize, 1e-9) <= 0.05) {
      return order;
    }
  }
  return null;
}

function sleepFn(ex: EntrySlExchange, ms: number): Promise<void> {
  if (ex.sleep) return ex.sleep(ms);
  return new Promise((r) => setTimeout(r, ms));
}

function nowFn(ex: EntrySlExchange): number {
  return ex.now ? ex.now() : Date.now();
}

function signedMatches(direction: 'LONG' | 'SHORT', szi: number): boolean {
  return direction === 'LONG' ? szi > 0 : szi < 0;
}

async function resolveFillFromExchange(
  opts: EntrySlFailSafeInput,
  parsed: ParsedHlOrderStatus
): Promise<{ pos: ExchangePosition | null; unreachable: boolean; filledSize: number; avgPx: number | null }> {
  const coin = opts.coin.toUpperCase();
  const pos = await opts.exchange.fetchPosition(coin);
  if (pos === 'unreachable') {
    return { pos: null, unreachable: true, filledSize: parsed.filledSize, avgPx: parsed.avgPx };
  }
  if (pos && signedMatches(opts.direction, pos.szi) && Math.abs(pos.szi) > 1e-12) {
    return {
      pos,
      unreachable: false,
      filledSize: Math.abs(pos.szi),
      avgPx: pos.entryPx > 0 ? pos.entryPx : parsed.avgPx,
    };
  }
  if (opts.exchange.fetchRecentFills) {
    const fills = await opts.exchange.fetchRecentFills();
    if (fills === 'unreachable') {
      return { pos: null, unreachable: true, filledSize: parsed.filledSize, avgPx: parsed.avgPx };
    }
    const wantBuy = opts.direction === 'LONG';
    const hit = (fills ?? []).find((f) => {
      if (f.coin.toUpperCase() !== coin) return false;
      const buy = String(f.side).toUpperCase() === 'B' || String(f.side).toUpperCase() === 'BUY';
      return buy === wantBuy && f.sz > 0;
    });
    if (hit) {
      return {
        pos: null,
        unreachable: false,
        filledSize: Math.max(parsed.filledSize, hit.sz),
        avgPx: hit.px > 0 ? hit.px : parsed.avgPx,
      };
    }
  }
  return { pos: pos ?? null, unreachable: false, filledSize: parsed.filledSize, avgPx: parsed.avgPx };
}

function setState(
  opts: EntrySlFailSafeInput,
  state: Parameters<typeof setHlExecutionState>[1]['state'],
  reason: string,
  code: Parameters<typeof setHlExecutionState>[1]['code'] = null
): void {
  setHlExecutionState(opts.wallet, {
    state,
    longClass: opts.longClass,
    code,
    reason,
    coin: opts.coin.toUpperCase(),
    direction: opts.direction,
  });
}

async function flattenUntilFlat(
  opts: EntrySlFailSafeInput,
  absSize: number,
  passes: number
): Promise<{ flat: boolean; unreachable: boolean; remaining: number }> {
  let remaining = absSize;
  for (let i = 0; i < passes; i += 1) {
    setState(opts, 'SL_FAILED_FLATTENING', `Flattening unprotected ${opts.direction} ${opts.coin} pass ${i + 1}`);
    const cut = await opts.exchange.flattenReduceOnly(remaining);
    if (cut.exchangeUnreachable) {
      return { flat: false, unreachable: true, remaining };
    }
    remaining = cut.remainingAbs;
    const live = await opts.exchange.fetchPosition(opts.coin);
    if (live === 'unreachable') {
      return { flat: false, unreachable: true, remaining };
    }
    remaining = live ? Math.abs(live.szi) : 0;
    if (remaining <= 1e-12) {
      return { flat: true, unreachable: false, remaining: 0 };
    }
  }
  return { flat: remaining <= 1e-12, unreachable: false, remaining };
}

/**
 * After a single entry submit: prove fill, confirm user SL, flatten if unprotected.
 * Never submits another entry order.
 */
export async function runEntryStopFailSafe(
  opts: EntrySlFailSafeInput
): Promise<EntrySlFailSafeResult> {
  const parsed = parseHlOrderStatus(opts.orderStatus, opts.requestedSize, opts.entryTimedOut);
  if (parsed.kind === 'rejected') {
    setState(opts, 'ORDER_FAILED', parsed.error ?? 'entry rejected');
    return {
      openKept: false,
      fillProven: false,
      slConfirmed: false,
      flattened: false,
      critical: false,
      userSlDisabled: false,
      filledSize: 0,
      avgPx: null,
      stopPx: null,
      reason: parsed.error ?? 'entry rejected',
    };
  }

  if (parsed.kind === 'partial') {
    setState(opts, 'ENTRY_PARTIALLY_FILLED', `Partial fill ${parsed.filledSize}`);
  } else if (parsed.kind === 'filled') {
    setState(opts, 'ENTRY_FILLED', `Filled ${parsed.filledSize} @ ${parsed.avgPx ?? opts.requestedEntryPx}`);
  } else if (parsed.kind === 'timeout' || parsed.kind === 'unknown' || parsed.kind === 'resting') {
    setState(
      opts,
      'ENTRY_SUBMITTED',
      `Entry ${parsed.kind} — polling exchange, no second order`
    );
  }

  let resolved = await resolveFillFromExchange(opts, parsed);
  if (
    !resolved.unreachable &&
    !(resolved.pos && Math.abs(resolved.pos.szi) > 1e-12) &&
    (parsed.kind === 'timeout' || parsed.kind === 'unknown' || parsed.kind === 'resting' || parsed.kind === 'partial')
  ) {
    await sleepFn(opts.exchange, 80);
    resolved = await resolveFillFromExchange(opts, parsed);
  }

  if (resolved.unreachable && parsed.filledSize <= 0 && !resolved.pos) {
    setState(
      opts,
      'CRITICAL_UNPROTECTED_POSITION',
      'Entry status unclear and exchange unreachable — no second order, protection unconfirmed',
      'CRITICAL_UNPROTECTED_POSITION'
    );
    markWalletSlCritical(opts.wallet, opts.coin, opts.direction, 'entry status unclear');
    return {
      openKept: false,
      fillProven: false,
      slConfirmed: false,
      flattened: false,
      critical: true,
      userSlDisabled: false,
      filledSize: 0,
      avgPx: null,
      stopPx: null,
      reason: 'entry unconfirmed — exchange unreachable',
    };
  }

  const fillSize = resolved.filledSize;
  const hasPos = Boolean(resolved.pos && Math.abs(resolved.pos.szi) > 1e-12);
  const fillProven = hasPos || fillSize > 0;
  if (!fillProven) {
    setState(opts, 'ORDER_FAILED', `No fill after ${parsed.kind} — not opening`);
    return {
      openKept: false,
      fillProven: false,
      slConfirmed: false,
      flattened: false,
      critical: false,
      userSlDisabled: false,
      filledSize: 0,
      avgPx: resolved.avgPx,
      stopPx: null,
      reason: 'no proven fill',
    };
  }

  const pos = resolved.pos;
  const absSize = pos ? Math.abs(pos.szi) : fillSize;
  const entryPx = pos && pos.entryPx > 0 ? pos.entryPx : resolved.avgPx ?? opts.requestedEntryPx;
  const collat =
    pos && pos.leverage > 0 ? (absSize * entryPx) / pos.leverage : opts.collateralUsd;
  const slPct = Math.max(0, Number(opts.stopLossPercent ?? 0));

  if (slPct <= 0) {
    setState(
      opts,
      'ENTRY_FILLED',
      `USER_SL_DISABLED — ${opts.direction} ${opts.coin} filled, user stop-loss percent is 0`,
      'USER_SL_DISABLED'
    );
    logger.info('HL USER_SL_DISABLED', {
      user: opts.wallet.slice(0, 10),
      coin: opts.coin,
      direction: opts.direction,
    });
    clearWalletSlCritical(opts.wallet);
    return {
      openKept: true,
      fillProven: true,
      slConfirmed: false,
      flattened: false,
      critical: false,
      userSlDisabled: true,
      filledSize: absSize,
      avgPx: entryPx,
      stopPx: null,
      reason: 'USER_SL_DISABLED',
    };
  }

  const stopPx = lossStopPricePx(opts.direction, entryPx, absSize, collat, slPct);
  return withCoinSlLock(opts.wallet, opts.coin, () =>
    confirmOrFlatten({ ...opts, requestedSize: absSize }, absSize, entryPx, stopPx)
  );
}

async function confirmOrFlatten(
  opts: EntrySlFailSafeInput,
  absSize: number,
  entryPx: number,
  stopPx: number
): Promise<EntrySlFailSafeResult> {
  const retries = Math.max(1, opts.slRetries ?? 3);
  const budget = opts.slRetryBudgetMs ?? 8_000;
  const started = nowFn(opts.exchange);
  setState(opts, 'SL_PENDING', `Posting user emergency SL @ ${stopPx}`);

  for (let i = 0; i < retries && nowFn(opts.exchange) - started < budget; i += 1) {
    setState(opts, i === 0 ? 'SL_PENDING' : 'SL_RECOVERY', `SL attempt ${i + 1}/${retries}`);
    const live = await opts.exchange.fetchPosition(opts.coin);
    if (live === 'unreachable') {
      setState(
        opts,
        'CRITICAL_UNPROTECTED_POSITION',
        'Exchange unreachable while confirming SL — not claiming protected',
        'CRITICAL_UNPROTECTED_POSITION'
      );
      markWalletSlCritical(opts.wallet, opts.coin, opts.direction, 'SL confirm unreachable');
      return {
        openKept: true,
        fillProven: true,
        slConfirmed: false,
        flattened: false,
        critical: true,
        userSlDisabled: false,
        filledSize: absSize,
        avgPx: entryPx,
        stopPx,
        reason: 'SL unconfirmed — exchange unreachable',
      };
    }
    if (!live || Math.abs(live.szi) <= 1e-12) {
      setState(opts, 'POSITION_CLOSED', 'Position gone before SL confirm');
      clearWalletSlCritical(opts.wallet);
      return {
        openKept: false,
        fillProven: true,
        slConfirmed: false,
        flattened: false,
        critical: false,
        userSlDisabled: false,
        filledSize: 0,
        avgPx: entryPx,
        stopPx,
        reason: 'flat before SL',
      };
    }
    const liveAbs = Math.abs(live.szi);
    const liveEntry = live.entryPx > 0 ? live.entryPx : entryPx;
    const liveStop = lossStopPricePx(
      opts.direction,
      liveEntry,
      liveAbs,
      live.leverage > 0 ? (liveAbs * liveEntry) / live.leverage : opts.collateralUsd,
      opts.stopLossPercent
    );

    const orders = await opts.exchange.fetchOpenOrders();
    if (orders === 'unreachable') {
      setState(
        opts,
        'CRITICAL_UNPROTECTED_POSITION',
        'Open-order query failed — SL not confirmed',
        'CRITICAL_UNPROTECTED_POSITION'
      );
      markWalletSlCritical(opts.wallet, opts.coin, opts.direction, 'open orders unreachable');
      return {
        openKept: true,
        fillProven: true,
        slConfirmed: false,
        flattened: false,
        critical: true,
        userSlDisabled: false,
        filledSize: liveAbs,
        avgPx: liveEntry,
        stopPx: liveStop,
        reason: 'SL unconfirmed — orders unreachable',
      };
    }

    const existing = matchingEmergencyStop({
      orders,
      coin: opts.coin,
      direction: opts.direction,
      entryPx: liveEntry,
      absSize: liveAbs,
      stopPx: liveStop,
    });
    if (existing) {
      setState(opts, 'SL_CONFIRMED', `User SL confirmed oid ${existing.oid ?? '?'} @ ${existing.triggerPx}`);
      clearWalletSlCritical(opts.wallet);
      return {
        openKept: true,
        fillProven: true,
        slConfirmed: true,
        flattened: false,
        critical: false,
        userSlDisabled: false,
        filledSize: liveAbs,
        avgPx: liveEntry,
        stopPx: liveStop,
        reason: 'SL_CONFIRMED',
      };
    }

    const extras = orders
      .filter((o) => {
        const kind = classifyHlTriggerOrder(
          o,
          opts.coin.toUpperCase(),
          opts.direction,
          liveEntry,
          liveEntry
        );
        return kind === 'emergency_market' && Number(o.oid) > 0;
      })
      .map((o) => Number(o.oid));
    if (extras.length > 0 && opts.exchange.cancelOids) {
      try {
        await opts.exchange.cancelOids(extras);
      } catch {
        /* keep going — avoid duplicate conflicting stops if cancel fails */
      }
    }

    const posted = await opts.exchange.postEmergencySl({
      absSize: liveAbs,
      stopPx: liveStop,
      direction: opts.direction,
    });
    if (!posted.accepted) {
      logger.warn('HL emergency SL post rejected', {
        user: opts.wallet.slice(0, 10),
        coin: opts.coin,
        error: posted.error,
        attempt: i + 1,
      });
    }

    const verify = await opts.exchange.fetchOpenOrders();
    if (verify !== 'unreachable') {
      const ok = matchingEmergencyStop({
        orders: verify,
        coin: opts.coin,
        direction: opts.direction,
        entryPx: liveEntry,
        absSize: liveAbs,
        stopPx: liveStop,
      });
      if (ok) {
        setState(opts, 'SL_CONFIRMED', `User SL exchange-confirmed oid ${ok.oid ?? '?'} @ ${ok.triggerPx}`);
        clearWalletSlCritical(opts.wallet);
        return {
          openKept: true,
          fillProven: true,
          slConfirmed: true,
          flattened: false,
          critical: false,
          userSlDisabled: false,
          filledSize: liveAbs,
          avgPx: liveEntry,
          stopPx: liveStop,
          reason: 'SL_CONFIRMED',
        };
      }
    }

    await sleepFn(opts.exchange, 200 * (i + 1));
  }

  const passes = Math.max(1, opts.flattenPasses ?? 2);
  const flat = await flattenUntilFlat(opts, absSize, passes);
  if (flat.unreachable) {
    setState(
      opts,
      'CRITICAL_UNPROTECTED_POSITION',
      'Flatten inconclusive — exchange unreachable; not reporting closed',
      'CRITICAL_UNPROTECTED_POSITION'
    );
    markWalletSlCritical(opts.wallet, opts.coin, opts.direction, 'flatten unreachable');
    logger.error('HL CRITICAL unprotected position', {
      user: opts.wallet.slice(0, 10),
      coin: opts.coin,
      direction: opts.direction,
    });
    return {
      openKept: true,
      fillProven: true,
      slConfirmed: false,
      flattened: false,
      critical: true,
      userSlDisabled: false,
      filledSize: absSize,
      avgPx: entryPx,
      stopPx,
      reason: 'CRITICAL_UNPROTECTED_POSITION',
    };
  }
  if (flat.flat) {
    setState(opts, 'POSITION_CLOSED', 'Flattened after SL could not be confirmed');
    clearWalletSlCritical(opts.wallet);
    return {
      openKept: false,
      fillProven: true,
      slConfirmed: false,
      flattened: true,
      critical: false,
      userSlDisabled: false,
      filledSize: 0,
      avgPx: entryPx,
      stopPx,
      reason: 'flattened after SL failure',
    };
  }

  setState(
    opts,
    'CRITICAL_UNPROTECTED_POSITION',
    `Residual ${flat.remaining} after flatten — unprotected`,
    'CRITICAL_UNPROTECTED_POSITION'
  );
  markWalletSlCritical(opts.wallet, opts.coin, opts.direction, 'residual after flatten');
  logger.error('HL CRITICAL residual after flatten', {
    user: opts.wallet.slice(0, 10),
    coin: opts.coin,
    remaining: flat.remaining,
  });
  return {
    openKept: true,
    fillProven: true,
    slConfirmed: false,
    flattened: false,
    critical: true,
    userSlDisabled: false,
    filledSize: flat.remaining,
    avgPx: entryPx,
    stopPx,
    reason: 'CRITICAL_UNPROTECTED_POSITION',
  };
}

export async function recoverPositionUserStop(opts: {
  wallet: string;
  coin: string;
  direction: 'LONG' | 'SHORT';
  stopLossPercent: number;
  longClass: LongOpportunityClass;
  collateralUsd: number;
  requestedEntryPx: number;
  requestedSize: number;
  szDecimals: number;
  exchange: EntrySlExchange;
}): Promise<EntrySlFailSafeResult> {
  const slPct = Math.max(0, Number(opts.stopLossPercent ?? 0));
  if (slPct <= 0) {
    logger.info('HL USER_SL_DISABLED on recover', {
      user: opts.wallet.slice(0, 10),
      coin: opts.coin,
    });
    return {
      openKept: true,
      fillProven: true,
      slConfirmed: false,
      flattened: false,
      critical: false,
      userSlDisabled: true,
      filledSize: opts.requestedSize,
      avgPx: opts.requestedEntryPx,
      stopPx: null,
      reason: 'USER_SL_DISABLED',
    };
  }
  const pos = await opts.exchange.fetchPosition(opts.coin);
  if (pos === 'unreachable') {
    markWalletSlCritical(opts.wallet, opts.coin, opts.direction, 'recover unreachable');
    setHlExecutionState(opts.wallet, {
      state: 'CRITICAL_UNPROTECTED_POSITION',
      longClass: opts.longClass,
      code: 'CRITICAL_UNPROTECTED_POSITION',
      reason: 'Restart recover: exchange unreachable',
      coin: opts.coin,
      direction: opts.direction,
    });
    return {
      openKept: true,
      fillProven: true,
      slConfirmed: false,
      flattened: false,
      critical: true,
      userSlDisabled: false,
      filledSize: opts.requestedSize,
      avgPx: opts.requestedEntryPx,
      stopPx: null,
      reason: 'recover unreachable',
    };
  }
  if (!pos) {
    clearWalletSlCritical(opts.wallet);
    return {
      openKept: false,
      fillProven: false,
      slConfirmed: false,
      flattened: false,
      critical: false,
      userSlDisabled: false,
      filledSize: 0,
      avgPx: null,
      stopPx: null,
      reason: 'no position',
    };
  }
  return runEntryStopFailSafe({
    wallet: opts.wallet,
    coin: opts.coin,
    direction: opts.direction,
    requestedSize: Math.abs(pos.szi),
    requestedEntryPx: pos.entryPx,
    collateralUsd: opts.collateralUsd,
    stopLossPercent: slPct,
    szDecimals: opts.szDecimals,
    longClass: opts.longClass,
    orderStatus: {
      filled: { totalSz: Math.abs(pos.szi), avgPx: pos.entryPx },
    },
    entryTimedOut: false,
    exchange: opts.exchange,
  });
}
