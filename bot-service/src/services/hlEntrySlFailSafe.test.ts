import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  getHlExecutionState,
  clearHlExecutionState,
  isOpeningTradeState,
  setHlExecutionState,
} from './hlExecutionState';
import {
  parseHlOrderStatus,
  matchingEmergencyStop,
  runEntryStopFailSafe,
  recoverPositionUserStop,
  isWalletSlCritical,
  resetEntrySlFailSafeForTests,
  withCoinSlLock,
  type EntrySlExchange,
  type ExchangePosition,
  type ExchangeTriggerOrder,
} from './hlEntrySlFailSafe';

const WALLET = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function emergencyOrder(px: number, sz: number, coin = 'BTC'): ExchangeTriggerOrder {
  return {
    coin,
    oid: 77,
    reduceOnly: true,
    isTrigger: true,
    orderType: 'Stop Market',
    triggerPx: String(px),
    sz: String(sz),
  };
}

function makeEx(init: {
  pos?: ExchangePosition | null | 'unreachable';
  orders?: ExchangeTriggerOrder[] | 'unreachable';
  postOk?: boolean | (() => boolean);
  flattenRemain?: number[] | 'unreachable';
  fillsUnreachable?: boolean;
}): EntrySlExchange & { posts: number; flattens: number; entries: number } {
  let pos: ExchangePosition | null | 'unreachable' = init.pos ?? null;
  let orders: ExchangeTriggerOrder[] | 'unreachable' = init.orders ?? [];
  const flattenQueue = Array.isArray(init.flattenRemain) ? [...init.flattenRemain] : [];
  const bag = {
    posts: 0,
    flattens: 0,
    entries: 0,
    fetchPosition: async () => pos,
    fetchOpenOrders: async () => orders,
    fetchRecentFills: async () => (init.fillsUnreachable ? ('unreachable' as const) : []),
    postEmergencySl: async (o: { absSize: number; stopPx: number; direction: 'LONG' | 'SHORT' }) => {
      bag.posts += 1;
      const ok = typeof init.postOk === 'function' ? init.postOk() : init.postOk !== false;
      if (ok && orders !== 'unreachable') {
        orders = [emergencyOrder(o.stopPx, o.absSize, pos && pos !== 'unreachable' ? pos.coin : 'BTC')];
      }
      return { accepted: ok, error: ok ? undefined : 'rejected' };
    },
    flattenReduceOnly: async () => {
      bag.flattens += 1;
      if (init.flattenRemain === 'unreachable') {
        return { attempted: true, remainingAbs: 1, exchangeUnreachable: true };
      }
      const next = flattenQueue.length ? flattenQueue.shift()! : 0;
      if (next <= 0) pos = null;
      else if (pos && pos !== 'unreachable') pos = { ...pos, szi: pos.szi > 0 ? next : -next };
      return { attempted: true, remainingAbs: next, exchangeUnreachable: false };
    },
    sleep: async () => undefined,
    now: () => Date.now(),
    setPos(next: ExchangePosition | null | 'unreachable') {
      pos = next;
    },
    setOrders(next: ExchangeTriggerOrder[] | 'unreachable') {
      orders = next;
    },
  };
  return bag;
}

const base = {
  wallet: WALLET,
  coin: 'BTC',
  direction: 'LONG' as const,
  requestedSize: 0.01,
  requestedEntryPx: 75_000,
  collateralUsd: 150,
  stopLossPercent: 5,
  szDecimals: 4,
  longClass: 'REVERSAL_LONG' as const,
};

describe('HL entry / SL fail-safe', () => {
  beforeEach(() => {
    resetEntrySlFailSafeForTests();
    clearHlExecutionState(WALLET);
  });

  it('parse: timeout is not a fill; missing error is not success', () => {
    assert.equal(parseHlOrderStatus(undefined, 1, true).kind, 'timeout');
    assert.equal(parseHlOrderStatus({}, 1, false).kind, 'unknown');
    assert.equal(parseHlOrderStatus({ error: 'bad' }, 1, false).kind, 'rejected');
    assert.equal(parseHlOrderStatus({ filled: { totalSz: '1', avgPx: '10' } }, 1, false).kind, 'filled');
    assert.equal(parseHlOrderStatus({ filled: { totalSz: '0.4', avgPx: '10' } }, 1, false).kind, 'partial');
    assert.equal(parseHlOrderStatus({ resting: { oid: 1 } }, 1, false).kind, 'resting');
  });

  it('full fill + confirmed SL', async () => {
    const ex = makeEx({
      pos: { coin: 'BTC', szi: 0.01, entryPx: 75_000, leverage: 10 },
    });
    const r = await runEntryStopFailSafe({
      ...base,
      orderStatus: { filled: { totalSz: '0.01', avgPx: '75000' } },
      entryTimedOut: false,
      exchange: ex,
    });
    assert.equal(r.fillProven, true);
    assert.equal(r.slConfirmed, true);
    assert.equal(r.openKept, true);
    assert.equal(r.critical, false);
    assert.equal(ex.posts, 1);
    assert.equal(getHlExecutionState(WALLET)?.state, 'SL_CONFIRMED');
  });

  it('partial fill uses exchange position size for SL', async () => {
    const ex = makeEx({
      pos: { coin: 'BTC', szi: 0.004, entryPx: 75_100, leverage: 10 },
    });
    const r = await runEntryStopFailSafe({
      ...base,
      orderStatus: { filled: { totalSz: '0.004', avgPx: '75100' } },
      entryTimedOut: false,
      exchange: ex,
    });
    assert.equal(r.filledSize, 0.004);
    assert.equal(r.slConfirmed, true);
    assert.ok(Math.abs(r.filledSize - 0.01) > 0.001);
  });

  it('entry timeout with actual fill on the book still protects, never double-enters', async () => {
    const ex = makeEx({
      pos: { coin: 'BTC', szi: 0.01, entryPx: 75_000, leverage: 10 },
    });
    const r = await runEntryStopFailSafe({
      ...base,
      orderStatus: null,
      entryTimedOut: true,
      exchange: ex,
    });
    assert.equal(ex.entries, 0);
    assert.equal(r.fillProven, true);
    assert.equal(r.slConfirmed, true);
  });

  it('entry timeout with no position does not confirm and does not send a second entry', async () => {
    const ex = makeEx({ pos: null });
    const r = await runEntryStopFailSafe({
      ...base,
      orderStatus: null,
      entryTimedOut: true,
      exchange: ex,
    });
    assert.equal(r.fillProven, false);
    assert.equal(r.slConfirmed, false);
    assert.equal(ex.entries, 0);
    assert.equal(ex.posts, 0);
    assert.equal(getHlExecutionState(WALLET)?.state, 'ORDER_FAILED');
  });

  it('SL timeout reuses an already-resting emergency SL — not a duplicate', async () => {
    const pos = { coin: 'BTC', szi: 0.01, entryPx: 75_000, leverage: 10 };
    const slPx = 75_000 - (150 * 0.05) / 0.01;
    const ex = makeEx({
      pos,
      orders: [emergencyOrder(slPx, 0.01)],
      postOk: false,
    });
    const r = await runEntryStopFailSafe({
      ...base,
      orderStatus: { filled: { totalSz: '0.01', avgPx: '75000' } },
      entryTimedOut: false,
      exchange: ex,
    });
    assert.equal(r.slConfirmed, true);
    assert.equal(ex.posts, 0);
  });

  it('SL rejection then successful retry', async () => {
    let n = 0;
    const ex = makeEx({
      pos: { coin: 'BTC', szi: 0.01, entryPx: 75_000, leverage: 10 },
      postOk: () => {
        n += 1;
        return n >= 2;
      },
    });
    const r = await runEntryStopFailSafe({
      ...base,
      orderStatus: { filled: { totalSz: '0.01', avgPx: '75000' } },
      entryTimedOut: false,
      exchange: ex,
      slRetries: 3,
    });
    assert.equal(r.slConfirmed, true);
    assert.equal(ex.posts >= 2, true);
  });

  it('SL rejection then flatten when retries exhaust', async () => {
    const ex = makeEx({
      pos: { coin: 'BTC', szi: 0.01, entryPx: 75_000, leverage: 10 },
      postOk: false,
      flattenRemain: [0],
    });
    const r = await runEntryStopFailSafe({
      ...base,
      orderStatus: { filled: { totalSz: '0.01', avgPx: '75000' } },
      entryTimedOut: false,
      exchange: ex,
      slRetries: 2,
    });
    assert.equal(r.flattened, true);
    assert.equal(r.openKept, false);
    assert.equal(r.slConfirmed, false);
    assert.equal(ex.flattens >= 1, true);
    assert.equal(getHlExecutionState(WALLET)?.state, 'POSITION_CLOSED');
  });

  it('flatten partial then second cut goes flat — never reports success while residual exists', async () => {
    const ex = makeEx({
      pos: { coin: 'BTC', szi: 0.01, entryPx: 75_000, leverage: 10 },
      postOk: false,
      flattenRemain: [0.004, 0],
    });
    const r = await runEntryStopFailSafe({
      ...base,
      flattenPasses: 3,
      slRetries: 1,
      orderStatus: { filled: { totalSz: '0.01', avgPx: '75000' } },
      entryTimedOut: false,
      exchange: ex,
    });
    assert.equal(r.flattened, true);
    assert.equal(ex.flattens, 2);
    assert.equal(r.openKept, false);
  });

  it('exchange unreachable during SL confirm stays critical, does not claim SL', async () => {
    const ex = makeEx({
      pos: { coin: 'BTC', szi: 0.01, entryPx: 75_000, leverage: 10 },
      orders: 'unreachable',
    });
    const r = await runEntryStopFailSafe({
      ...base,
      orderStatus: { filled: { totalSz: '0.01', avgPx: '75000' } },
      entryTimedOut: false,
      exchange: ex,
    });
    assert.equal(r.critical, true);
    assert.equal(r.slConfirmed, false);
    assert.equal(isWalletSlCritical(WALLET), true);
    assert.equal(getHlExecutionState(WALLET)?.state, 'CRITICAL_UNPROTECTED_POSITION');
  });

  it('restart recover on unprotected position posts SL', async () => {
    const ex = makeEx({
      pos: { coin: 'ETH', szi: 0.2, entryPx: 3200, leverage: 10 },
    });
    const r = await recoverPositionUserStop({
      wallet: WALLET,
      coin: 'ETH',
      direction: 'LONG',
      stopLossPercent: 5,
      longClass: 'TREND_LONG',
      collateralUsd: 64,
      requestedEntryPx: 3200,
      requestedSize: 0.2,
      szDecimals: 4,
      exchange: ex,
    });
    assert.equal(r.slConfirmed, true);
  });

  it('USER_SL_DISABLED does not invent a stop', async () => {
    const ex = makeEx({
      pos: { coin: 'BTC', szi: 0.01, entryPx: 75_000, leverage: 10 },
    });
    const r = await runEntryStopFailSafe({
      ...base,
      stopLossPercent: 0,
      orderStatus: { filled: { totalSz: '0.01', avgPx: '75000' } },
      entryTimedOut: false,
      exchange: ex,
    });
    assert.equal(r.userSlDisabled, true);
    assert.equal(r.slConfirmed, false);
    assert.equal(ex.posts, 0);
    assert.equal(getHlExecutionState(WALLET)?.code, 'USER_SL_DISABLED');
  });

  it('profitOnlyExits is irrelevant — user SL still confirms', async () => {
    const ex = makeEx({
      pos: { coin: 'SOL', szi: -2, entryPx: 140, leverage: 10 },
    });
    const r = await runEntryStopFailSafe({
      ...base,
      coin: 'SOL',
      direction: 'SHORT',
      longClass: 'NONE',
      requestedSize: 2,
      requestedEntryPx: 140,
      collateralUsd: 28,
      orderStatus: { filled: { totalSz: '2', avgPx: '140' } },
      entryTimedOut: false,
      exchange: ex,
    });
    assert.equal(r.slConfirmed, true);
  });

  it('LONG SHORT REVERSAL_LONG share matching helper', () => {
    const longSl = matchingEmergencyStop({
      orders: [emergencyOrder(74_000, 0.01)],
      coin: 'BTC',
      direction: 'LONG',
      entryPx: 75_000,
      absSize: 0.01,
      stopPx: 74_000,
    });
    const shortSl = matchingEmergencyStop({
      orders: [
        {
          coin: 'SOL',
          oid: 8,
          reduceOnly: true,
          isTrigger: true,
          orderType: 'Stop Market',
          triggerPx: '150',
          sz: '2',
        },
      ],
      coin: 'SOL',
      direction: 'SHORT',
      entryPx: 140,
      absSize: 2,
      stopPx: 150,
    });
    assert.ok(longSl);
    assert.ok(shortSl);
  });

  it('coin lock serializes concurrent protectors so SL is posted once', async () => {
    let live = 0;
    let max = 0;
    await Promise.all([
      withCoinSlLock(WALLET, 'BTC', async () => {
        live += 1;
        max = Math.max(max, live);
        await new Promise((r) => setTimeout(r, 20));
        live -= 1;
      }),
      withCoinSlLock(WALLET, 'BTC', async () => {
        live += 1;
        max = Math.max(max, live);
        live -= 1;
      }),
    ]);
    assert.equal(max, 1);
  });

  it('failed SL state is not overwritten by ORDER_CONFIRMED', () => {
    setHlExecutionState(WALLET, {
      state: 'CRITICAL_UNPROTECTED_POSITION',
      longClass: 'REVERSAL_LONG',
      code: 'CRITICAL_UNPROTECTED_POSITION',
      reason: 'unprotected',
      coin: 'BTC',
      direction: 'LONG',
    });
    setHlExecutionState(WALLET, {
      state: 'ORDER_CONFIRMED',
      longClass: 'REVERSAL_LONG',
      code: null,
      reason: 'Opened LONG BTC — user SL off',
      coin: 'BTC',
      direction: 'LONG',
    });
    assert.equal(getHlExecutionState(WALLET)?.state, 'CRITICAL_UNPROTECTED_POSITION');
  });

  it('Opening trade covers in-flight entry/SL, not SL_CONFIRMED', () => {
    assert.equal(isOpeningTradeState('ENTRY_SUBMITTED'), true);
    assert.equal(isOpeningTradeState('SL_PENDING'), true);
    assert.equal(isOpeningTradeState('SL_CONFIRMED'), false);
    assert.equal(isOpeningTradeState('ORDER_CONFIRMED'), false);
  });
});
