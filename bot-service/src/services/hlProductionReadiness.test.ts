/**
 * Final production-readiness proofs for profit/emergency SL.
 * Does not change opening gates. Does not place a signed live order.
 */
import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import * as v from 'valibot';
import { OrderRequest } from '@nktkas/hyperliquid/api/exchange';
import { config } from '../config';
import {
  evaluateDynamicTrail,
  lossStopPricePx,
  profitStopPlaceable,
  seedTrailFromConfirmedProfitStop,
} from './dynamicTrailingStop';
import {
  buildProfitStopMarketLeg,
  lastConfirmedProfitStopPx,
  planProtectiveSync,
  profitStopMarketCapPx,
  rememberConfirmedStops,
  resetProtectiveSyncForTests,
  shouldDeferTrailSync,
  simulateTriggeredProfitFill,
  snapshotConfirmedStops,
} from './hlProfitStopSync';
import {
  blockNewEntriesUntilReconciled,
  reconcileProtectiveFromSnapshot,
  resetProtectiveReconcileForTests,
} from './hlProtectiveReconcile';
import {
  clearHlExecutionState,
  getHlExecutionState,
  setHlExecutionState,
} from './hlExecutionState';
import { hlTickSize } from './hlInfo';

const ENTRY = 86.45;
const SIZE = 5.25;
const TRIGGER = 86.32;
const EMERGENCY = 88.1;

function dummySig() {
  return {
    r: `0x${'11'.repeat(32)}` as `0x${string}`,
    s: `0x${'22'.repeat(32)}` as `0x${string}`,
    v: 27 as const,
  };
}

function validateHlExchangeOrderAction(leg: ReturnType<typeof buildProfitStopMarketLeg>): void {
  v.parse(OrderRequest, {
    action: { type: 'order', orders: [leg], grouping: 'na' },
    nonce: Date.now(),
    signature: dummySig(),
  });
}

function liveLine(opts: {
  coin: string;
  upnl: number;
  profitPx: number | null;
  emergencyPx: number | null;
}): string {
  const e = opts.emergencyPx
    ? `Emergency-SL ${opts.emergencyPx} (HL confirmed)`
    : 'Emergency-SL not confirmed';
  const profit = opts.profitPx
    ? `Profit-SL ${opts.profitPx} (HL confirmed)`
    : opts.upnl > 0
      ? 'Profit-SL PENDING'
      : 'Profit-SL idle';
  return `${opts.coin} ${e} · ${profit}`;
}

describe('HL exchange wire vs @nktkas/hyperliquid OrderRequest', () => {
  it('posts the official trigger wire: reduce-only, isMarket, tpsl sl, grouping na, p=cap', async () => {
    const res = await fetch(config.hyperliquid.infoUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'meta' }),
    });
    assert.equal(res.ok, true, 'live Hyperliquid /info meta must respond');
    const meta = (await res.json()) as { universe: Array<{ name: string; szDecimals: number }> };
    const btc = meta.universe.find((a) => a.name === 'BTC');
    assert.ok(btc, 'BTC must exist on live HL universe');
    const assetIndex = meta.universe.findIndex((a) => a.name === 'BTC');
    const entry = 100_000;
    const trigger = 100_400;
    const tick = hlTickSize(trigger, btc.szDecimals);
    const leg = buildProfitStopMarketLeg({
      assetIndex,
      direction: 'LONG',
      size: 0.001,
      stopPx: trigger,
      entryPx: entry,
      szDecimals: btc.szDecimals,
      tickSize: tick,
    });
    assert.equal(leg.r, true);
    assert.equal(leg.b, false, 'LONG close is a sell');
    assert.equal(leg.t.trigger.isMarket, true);
    assert.equal(leg.t.trigger.tpsl, 'sl');
    assert.ok(Number(leg.p) > entry);
    assert.ok(Number(leg.p) <= Number(leg.t.trigger.triggerPx));
    validateHlExchangeOrderAction(leg);

    const short = buildProfitStopMarketLeg({
      assetIndex: 5,
      direction: 'SHORT',
      size: SIZE,
      stopPx: TRIGGER,
      entryPx: ENTRY,
      szDecimals: 2,
      tickSize: 0.001,
    });
    assert.equal(short.b, true, 'SHORT close is a buy');
    assert.equal(short.t.trigger.isMarket, true);
    assert.ok(Number(short.p) < ENTRY);
    assert.ok(Number(short.p) >= Number(short.t.trigger.triggerPx));
    validateHlExchangeOrderAction(short);
  });

  it('HL rejects an immediate trigger: we refuse to post when stop is glued to mark', () => {
    assert.equal(
      profitStopPlaceable({
        direction: 'SHORT',
        stopPx: 86.449,
        markPx: 86.448,
        entryPx: ENTRY,
        tickSize: 0.001,
      }),
      false
    );
  });

  it('accepted HL order statuses include waitingForTrigger; error is a rejection', () => {
    const ok: Array<'waitingForTrigger' | { resting: { oid: number } } | { error: string }> = [
      'waitingForTrigger',
      { resting: { oid: 1 } },
    ];
    assert.equal(ok[0], 'waitingForTrigger');
    assert.equal('error' in (ok[1] as object) === false, true);
    const rejected = { error: 'Order would immediately trigger' };
    assert.ok(rejected.error.length > 0);
  });
});

describe('gap: triggered profit SL whose cap does not fill', () => {
  beforeEach(() => {
    resetProtectiveReconcileForTests();
    clearHlExecutionState('0xgap0000000000000000000000000000000000001');
  });

  it('keeps the position open, keeps Emergency-SL, retries Profit-SL, never POSITION_CLOSED', async () => {
    const wallet = '0xgap0000000000000000000000000000000000001';
    const cap = profitStopMarketCapPx('SHORT', TRIGGER, ENTRY, 0.001);
    const gapPrint = cap + 0.0004;
    assert.ok(gapPrint > cap);
    assert.ok(gapPrint < ENTRY);
    assert.equal(
      simulateTriggeredProfitFill({
        execution: 'stop_market_capped',
        direction: 'SHORT',
        triggerPx: TRIGGER,
        capPx: cap,
        gapPrintPx: gapPrint,
        entryPx: ENTRY,
      }),
      'unfilled'
    );

    const remaining = [
      {
        coin: 'SOL',
        oid: 22,
        reduceOnly: true,
        isTrigger: true,
        orderType: 'Stop Market',
        triggerPx: String(EMERGENCY),
      },
    ];
    const snap = snapshotConfirmedStops(remaining, 'SOL', 'SHORT', ENTRY);
    assert.equal(snap.profitPx, null);
    assert.equal(snap.emergencyPx, EMERGENCY);

    const upnl = (ENTRY - gapPrint) * SIZE;
    assert.ok(upnl > 0);
    const line = liveLine({
      coin: 'SOL',
      upnl,
      profitPx: snap.profitPx,
      emergencyPx: snap.emergencyPx,
    });
    assert.match(line, /Emergency-SL 88.1 \(HL confirmed\)/);
    assert.match(line, /Profit-SL PENDING/);
    assert.doesNotMatch(line, /CLOSED|PROFIT_SECURED|Position closed/i);

    const rec = reconcileProtectiveFromSnapshot({
      wallet,
      positions: [
        {
          coin: 'SOL',
          direction: 'SHORT',
          entryPx: ENTRY,
          markPx: gapPrint,
          absSize: SIZE,
          upnlUsd: upnl,
          desiredStopPx: TRIGGER,
          armed: true,
          emergencyStopPx: EMERGENCY,
          tickSize: 0.001,
        },
      ],
      orders: remaining,
      nowMs: Date.now(),
      memoryStops: {},
    });
    assert.equal(rec.coins[0].emergencyMissing, false);
    assert.equal(rec.ok, true);
    assert.equal(rec.coins[0].reconstructedProfitPx, null);
    assert.equal(rec.coins[0].postProfit, null);
    const tArm = Date.now();
    const warm = await evaluateDynamicTrail({
      coin: 'SOL',
      direction: 'SHORT',
      entryPrice: ENTRY,
      markPrice: gapPrint,
      pnlUsd: upnl,
      absSize: SIZE,
      notionalUsd: ENTRY * SIZE,
      collateralUsd: 20,
      nowMs: tArm,
      record: null,
      tickSize: 0.001,
    });
    const pending = await evaluateDynamicTrail({
      coin: 'SOL',
      direction: 'SHORT',
      entryPrice: ENTRY,
      markPrice: gapPrint,
      pnlUsd: upnl,
      absSize: SIZE,
      notionalUsd: ENTRY * SIZE,
      collateralUsd: 20,
      nowMs: tArm + 6_000,
      record: warm.record,
      tickSize: 0.001,
    });
    assert.equal(pending.shouldClose, false);
    assert.equal(getHlExecutionState(wallet), null);
    setHlExecutionState(wallet, {
      state: 'SL_CONFIRMED',
      longClass: 'NONE',
      code: null,
      reason: 'emergency still live after missed profit IOC',
      coin: 'SOL',
      direction: 'SHORT',
    });
    assert.notEqual(getHlExecutionState(wallet)?.state, 'POSITION_CLOSED');
  });
});

describe('restart + multi-user + throttle', () => {
  beforeEach(() => {
    resetProtectiveSyncForTests();
    resetProtectiveReconcileForTests();
  });

  it('empty memory reconstructs the tighter exchange profit floor', async () => {
    const confirmed = 86.2;
    const looserLocal = 86.35;
    const rec = seedTrailFromConfirmedProfitStop(
      {
        phase: 'idle',
        direction: 'SHORT',
        entryPrice: ENTRY,
        highestPriceSinceEntry: 86.1,
        highestPnlSinceEntry: 1.8,
        currentTrailStop: looserLocal,
        trailArmedAt: null,
        profitSinceAt: null,
        maxRunup: 1.8,
        openedAt: 1,
        estimatedFeesUsd: 0.1,
        lastTrailDistancePx: 0,
        timeInProfitMs: 0,
      },
      'SHORT',
      confirmed,
      2
    );
    assert.equal(rec.currentTrailStop, confirmed);
    const tick = await evaluateDynamicTrail({
      coin: 'SOL',
      direction: 'SHORT',
      entryPrice: ENTRY,
      markPrice: 86.1,
      pnlUsd: 1.8,
      absSize: SIZE,
      notionalUsd: ENTRY * SIZE,
      collateralUsd: 20,
      nowMs: 3,
      record: null,
      confirmedExchangeStopPx: confirmed,
      tickSize: 0.001,
    });
    assert.ok((tick.record.currentTrailStop as number) <= confirmed);

    const plan = planProtectiveSync({
      direction: 'SHORT',
      entryPx: ENTRY,
      markPx: 86.1,
      absSize: SIZE,
      orders: [
        {
          coin: 'SOL',
          oid: 9,
          reduceOnly: true,
          isTrigger: true,
          orderType: 'Stop Market',
          triggerPx: String(confirmed),
          limitPx: '86.44',
        },
        {
          coin: 'SOL',
          oid: 10,
          reduceOnly: true,
          isTrigger: true,
          orderType: 'Stop Market',
          triggerPx: String(EMERGENCY),
        },
      ],
      coin: 'SOL',
      desiredStopPx: looserLocal,
      armed: true,
      emergencyStopPx: EMERGENCY,
      tickSize: 0.001,
      breakevenPx: 86.38,
      nowMs: 1,
      lastTrailSyncAt: 0,
    });
    assert.equal(plan.reconstructedProfitPx, confirmed);
    assert.ok((plan.mergedProfitPx as number) <= confirmed);
  });

  it('two wallets keep independent emergency percents and profit floors', () => {
    const a = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const b = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    const entry = 100;
    const abs = 1;
    const collat = 5;
    const emA = lossStopPricePx('SHORT', entry, abs, collat, 15);
    const emB = lossStopPricePx('SHORT', entry, abs, collat, 5);
    assert.ok(emA > emB);

    rememberConfirmedStops(a, 'BTC', 99.2, emA);
    rememberConfirmedStops(b, 'BTC', 99.6, emB);
    assert.equal(lastConfirmedProfitStopPx(a, 'BTC'), 99.2);
    assert.equal(lastConfirmedProfitStopPx(b, 'BTC'), 99.6);

    const planA = planProtectiveSync({
      direction: 'SHORT',
      entryPx: entry,
      markPx: 99.0,
      absSize: abs,
      orders: [
        {
          coin: 'BTC',
          oid: 1,
          reduceOnly: true,
          isTrigger: true,
          orderType: 'Stop Market',
          triggerPx: '99.2',
          limitPx: '99.9',
        },
        {
          coin: 'BTC',
          oid: 2,
          reduceOnly: true,
          isTrigger: true,
          orderType: 'Stop Market',
          triggerPx: String(emA),
        },
      ],
      coin: 'BTC',
      desiredStopPx: 99.4,
      armed: true,
      emergencyStopPx: emA,
      tickSize: 0.1,
      breakevenPx: 99.7,
      nowMs: 10,
      lastTrailSyncAt: 0,
    });
    const planB = planProtectiveSync({
      direction: 'SHORT',
      entryPx: entry,
      markPx: 99.0,
      absSize: abs,
      orders: [
        {
          coin: 'BTC',
          oid: 3,
          reduceOnly: true,
          isTrigger: true,
          orderType: 'Stop Market',
          triggerPx: '99.6',
          limitPx: '99.9',
        },
        {
          coin: 'BTC',
          oid: 4,
          reduceOnly: true,
          isTrigger: true,
          orderType: 'Stop Market',
          triggerPx: String(emB),
        },
      ],
      coin: 'BTC',
      desiredStopPx: 99.7,
      armed: true,
      emergencyStopPx: emB,
      tickSize: 0.1,
      breakevenPx: 99.7,
      nowMs: 10,
      lastTrailSyncAt: 0,
    });
    assert.equal(planA.reconstructedEmergencyPx, emA);
    assert.equal(planB.reconstructedEmergencyPx, emB);
    assert.ok((planA.mergedProfitPx as number) <= 99.2);
    assert.ok((planB.mergedProfitPx as number) <= 99.6);
    assert.notEqual(planA.reconstructedEmergencyPx, planB.reconstructedEmergencyPx);
  });

  it('2.5s throttle skips repeat trail only — first profit and missing emergency go through', () => {
    assert.equal(
      shouldDeferTrailSync({
        nowMs: 2_000,
        lastSyncAt: 1,
        intervalMs: 2_500,
        firstProfitPlacement: false,
        emergencyMissing: false,
        upgradeLimitToMarket: false,
      }),
      true
    );
    assert.equal(
      shouldDeferTrailSync({
        nowMs: 2_000,
        lastSyncAt: 1,
        intervalMs: 2_500,
        firstProfitPlacement: true,
        emergencyMissing: false,
        upgradeLimitToMarket: false,
      }),
      false
    );
    assert.equal(
      shouldDeferTrailSync({
        nowMs: 2_000,
        lastSyncAt: 1,
        intervalMs: 2_500,
        firstProfitPlacement: false,
        emergencyMissing: true,
        upgradeLimitToMarket: false,
      }),
      false
    );
    const first = planProtectiveSync({
      direction: 'SHORT',
      entryPx: ENTRY,
      markPx: TRIGGER - 0.2,
      absSize: SIZE,
      orders: [],
      coin: 'SOL',
      desiredStopPx: TRIGGER,
      armed: true,
      emergencyStopPx: EMERGENCY,
      minLockUsd: 0,
      tickSize: 0.001,
      breakevenPx: TRIGGER,
      nowMs: 2_000,
      lastTrailSyncAt: 1,
      trailSyncIntervalMs: 2_500,
    });
    assert.equal(first.firstProfitPlacement, true);
    assert.equal(first.deferTrail, false);
    assert.ok(first.postProfit);
    assert.equal(first.postEmergencyPx, EMERGENCY);
    assert.equal(blockNewEntriesUntilReconciled('0xneverreconciled'), true);
  });
});
