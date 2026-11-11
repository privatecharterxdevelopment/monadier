import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { estimateRoundTripFeesUsd, breakevenPlusFeesStopPx } from './dynamicTrailingStop';
import {
  buildEmergencyStopMarketLeg,
  buildProfitStopLimitLeg,
  buildProfitStopMarketLeg,
  classifyHlTriggerOrder,
  emergencySideOk,
  planProtectiveSync,
  profitStopMarketCapPx,
  profitStopSafeToPost,
  protectiveSideOk,
  shouldDeferTrailSync,
  simulateTriggeredProfitFill,
} from './hlProfitStopSync';

const entry = 86.45;
const size = 5.25;
const fees = estimateRoundTripFeesUsd(entry * size);
const be = breakevenPlusFeesStopPx('SHORT', entry, size, fees, 0, entry * size, 0.001, 2);

describe('profit SL must stay green on the BE side', () => {
  it('rejects a SHORT trigger on the loss side of fee-adjusted BE', () => {
    assert.equal(protectiveSideOk('SHORT', 86.8, 86.4, entry, be, 0.001), false);
    assert.ok(be < entry);
    assert.equal(protectiveSideOk('SHORT', entry + 0.01, 86.2, entry, be, 0.001), false);
  });

  it('accepts a SHORT limit stop at BE below mark gap', () => {
    const mark = be - 0.2;
    assert.equal(protectiveSideOk('SHORT', be, mark, entry, be, 0.001), true);
  });

  it('posts a LONG profit stop above entry even if still below full BE', () => {
    const longBe = breakevenPlusFeesStopPx('LONG', entry, size, fees, 0, entry * size, 0.001, 2);
    const between = (entry + longBe) / 2;
    assert.equal(
      profitStopSafeToPost({
        direction: 'LONG',
        stopPx: between,
        markPx: entry + 0.8,
        entryPx: entry,
        absSize: size,
        minLockUsd: 0,
        breakevenPx: longBe,
        tickSize: 0.001,
        isMarket: false,
      }),
      true
    );
  });

  it('allows a capped profit stop-market on the profit side of entry', () => {
    assert.equal(
      profitStopSafeToPost({
        direction: 'SHORT',
        stopPx: be,
        markPx: be - 0.25,
        entryPx: entry,
        absSize: size,
        minLockUsd: 0.2,
        breakevenPx: be,
        isMarket: true,
      }),
      true
    );
  });

  it('classifies leftover market profit TPSL vs emergency vs limit', () => {
    assert.equal(
      classifyHlTriggerOrder(
        {
          coin: 'SOL',
          oid: 1,
          reduceOnly: true,
          isTrigger: true,
          orderType: 'Stop Market',
          triggerPx: '86.20',
        },
        'SOL',
        'SHORT',
        entry,
        be
      ),
      'legacy_market_profit'
    );
    assert.equal(
      classifyHlTriggerOrder(
        {
          coin: 'SOL',
          oid: 4,
          reduceOnly: true,
          isTrigger: true,
          orderType: 'Stop Market',
          triggerPx: String(be),
          limitPx: String(entry - 0.01),
        },
        'SOL',
        'SHORT',
        entry,
        be
      ),
      'profit_market'
    );
    assert.equal(
      classifyHlTriggerOrder(
        {
          coin: 'SOL',
          oid: 2,
          reduceOnly: true,
          isTrigger: true,
          orderType: 'Stop Market',
          triggerPx: '88.10',
        },
        'SOL',
        'SHORT',
        entry,
        be
      ),
      'emergency_market'
    );
    assert.equal(
      classifyHlTriggerOrder(
        {
          coin: 'SOL',
          oid: 3,
          reduceOnly: true,
          isTrigger: true,
          orderType: 'Stop Limit',
          triggerPx: String(be),
          limitPx: String(be),
        },
        'SOL',
        'SHORT',
        entry,
        be
      ),
      'profit_limit'
    );
  });

  it('profit market leg is reduce-only stop-market with profit-side cap', () => {
    const profit = buildProfitStopMarketLeg({
      assetIndex: 5,
      direction: 'SHORT',
      size,
      stopPx: be,
      entryPx: entry,
      szDecimals: 2,
      tickSize: 0.001,
    });
    assert.equal(profit.r, true);
    assert.equal(profit.t.trigger.isMarket, true);
    assert.equal(profit.t.trigger.tpsl, 'sl');
    assert.ok(Number(profit.p) < entry);
    assert.ok(Number(profit.p) >= Number(profit.t.trigger.triggerPx));
  });

  it('profit limit leg is reduce-only stop-limit; emergency is stop-market', () => {
    const profit = buildProfitStopLimitLeg({
      assetIndex: 5,
      direction: 'SHORT',
      size,
      stopPx: be,
      szDecimals: 2,
    });
    assert.equal(profit.r, true);
    assert.equal(profit.t.trigger.isMarket, false);
    assert.equal(profit.t.trigger.tpsl, 'sl');
    assert.equal(profit.b, true);

    const emergency = buildEmergencyStopMarketLeg({
      assetIndex: 5,
      direction: 'SHORT',
      size,
      stopPx: 88.2,
      szDecimals: 2,
    });
    assert.equal(emergency.t.trigger.isMarket, true);
    assert.equal(emergencySideOk('SHORT', 88.2, 86.2, entry), true);
    assert.equal(emergencySideOk('SHORT', be, 86.2, entry), false);
  });

  it('user emergency SL for LONG uses the same market trigger as SHORT', () => {
    const longSl = buildEmergencyStopMarketLeg({
      assetIndex: 0,
      direction: 'LONG',
      size: 0.01,
      stopPx: 74_250,
      szDecimals: 1,
    });
    assert.equal(longSl.t.trigger.isMarket, true);
    assert.equal(longSl.t.trigger.tpsl, 'sl');
    assert.equal(longSl.r, true);
    assert.equal(longSl.b, false);
  });

  it('profit replace oids never include emergency market SL', () => {
    const orders = [
      {
        coin: 'SOL',
        oid: 11,
        reduceOnly: true,
        isTrigger: true,
        orderType: 'Stop Limit',
        triggerPx: String(be),
      },
      {
        coin: 'SOL',
        oid: 12,
        reduceOnly: true,
        isTrigger: true,
        orderType: 'Stop Market',
        triggerPx: '88.10',
      },
    ];
    const profitOids = orders
      .filter((o) => {
        const k = classifyHlTriggerOrder(o, 'SOL', 'SHORT', entry, be);
        return k === 'profit_limit' || k === 'profit_market';
      })
      .map((o) => o.oid);
    const emergencyOids = orders
      .filter((o) => classifyHlTriggerOrder(o, 'SOL', 'SHORT', entry, be) === 'emergency_market')
      .map((o) => o.oid);
    assert.deepEqual(profitOids, [11]);
    assert.deepEqual(emergencyOids, [12]);
  });

  it('partial fill remaining size is what the profit leg posts', () => {
    const remaining = 2.1;
    const leg = buildProfitStopLimitLeg({
      assetIndex: 5,
      direction: 'SHORT',
      size: remaining,
      stopPx: be,
      szDecimals: 2,
    });
    assert.equal(Number(leg.s), remaining);
  });

  it('still flags a glue-to-mark SHORT as unsafe', () => {
    assert.equal(protectiveSideOk('SHORT', 86.44, 86.43, entry, be, 0.001), false);
  });
});

describe('capped profit stop-market vs stop-limit fills', () => {
  it('stop-limit with p=trigger misses a gap through the trigger', () => {
    assert.equal(
      simulateTriggeredProfitFill({
        execution: 'stop_limit',
        direction: 'SHORT',
        triggerPx: 86.32,
        capPx: 86.32,
        gapPrintPx: 86.40,
        entryPx: entry,
      }),
      'unfilled'
    );
  });

  it('capped stop-market fills a gap that stays profit-side of entry', () => {
    const cap = profitStopMarketCapPx('SHORT', 86.32, entry, 0.001);
    assert.equal(
      simulateTriggeredProfitFill({
        execution: 'stop_market_capped',
        direction: 'SHORT',
        triggerPx: 86.32,
        capPx: cap,
        gapPrintPx: 86.40,
        entryPx: entry,
      }),
      'filled'
    );
    assert.ok(cap < entry);
  });

  it('uncapped 10% market would realize the SOL-incident loss; cap refuses it', () => {
    assert.equal(
      simulateTriggeredProfitFill({
        execution: 'stop_market_uncapped',
        direction: 'SHORT',
        triggerPx: 86.32,
        capPx: entry * 1.1,
        gapPrintPx: 86.518,
        entryPx: entry,
      }),
      'would_realize_loss'
    );
    const cap = profitStopMarketCapPx('SHORT', 86.32, entry, 0.001);
    assert.equal(
      simulateTriggeredProfitFill({
        execution: 'stop_market_capped',
        direction: 'SHORT',
        triggerPx: 86.32,
        capPx: cap,
        gapPrintPx: 86.518,
        entryPx: entry,
      }),
      'unfilled'
    );
  });

  it('first valid profit placement is not deferred by the 2.5s trail throttle', () => {
    assert.equal(
      shouldDeferTrailSync({
        nowMs: 1000,
        lastSyncAt: 900,
        intervalMs: 2500,
        firstProfitPlacement: true,
        emergencyMissing: false,
        upgradeLimitToMarket: false,
      }),
      false
    );
    assert.equal(
      shouldDeferTrailSync({
        nowMs: 1000,
        lastSyncAt: 900,
        intervalMs: 2500,
        firstProfitPlacement: false,
        emergencyMissing: false,
        upgradeLimitToMarket: false,
      }),
      true
    );
    assert.equal(
      shouldDeferTrailSync({
        nowMs: 1000,
        lastSyncAt: 900,
        intervalMs: 2500,
        firstProfitPlacement: false,
        emergencyMissing: true,
        upgradeLimitToMarket: false,
      }),
      false
    );
  });

  it('plan posts capped market immediately when no profit SL exists', () => {
    const plan = planProtectiveSync({
      direction: 'SHORT',
      entryPx: entry,
      markPx: be - 0.25,
      absSize: size,
      orders: [],
      coin: 'SOL',
      desiredStopPx: be,
      armed: true,
      emergencyStopPx: 88.1,
      minLockUsd: 0,
      tickSize: 0.001,
      breakevenPx: be,
      nowMs: 1,
      lastTrailSyncAt: 0,
    });
    assert.equal(plan.firstProfitPlacement, true);
    assert.equal(plan.deferTrail, false);
    assert.ok(plan.postProfit);
    assert.equal(plan.postProfit!.triggerPx, be);
    assert.ok(plan.postProfit!.capPx < entry);
    assert.equal(plan.emergencyMissing, true);
    assert.equal(plan.postEmergencyPx, 88.1);
  });

  it('plan never loosens an exchange profit floor after empty memory restart', () => {
    const plan = planProtectiveSync({
      direction: 'SHORT',
      entryPx: entry,
      markPx: 86.1,
      absSize: size,
      orders: [
        {
          coin: 'SOL',
          oid: 9,
          reduceOnly: true,
          isTrigger: true,
          orderType: 'Stop Market',
          triggerPx: '86.20',
          limitPx: '86.44',
        },
      ],
      coin: 'SOL',
      desiredStopPx: 86.35,
      armed: true,
      emergencyStopPx: 88.1,
      minLockUsd: 0,
      tickSize: 0.001,
      breakevenPx: be,
      nowMs: 1,
      lastTrailSyncAt: 0,
    });
    assert.equal(plan.reconstructedProfitPx, 86.2);
    assert.ok((plan.mergedProfitPx as number) <= 86.2);
    assert.equal(plan.existingProfitKind, 'market');
    assert.equal(plan.firstProfitPlacement, false);
  });
});
