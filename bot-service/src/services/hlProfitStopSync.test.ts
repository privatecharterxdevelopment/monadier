import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { estimateRoundTripFeesUsd, breakevenPlusFeesStopPx } from './dynamicTrailingStop';
import {
  buildEmergencyStopMarketLeg,
  buildProfitStopLimitLeg,
  classifyHlTriggerOrder,
  emergencySideOk,
  profitStopSafeToPost,
  protectiveSideOk,
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

  it('rejects LONG stop below BE even if still above entry', () => {
    const longBe = breakevenPlusFeesStopPx('LONG', entry, size, fees, 0, entry * size, 0.001, 2);
    const between = (entry + longBe) / 2;
    assert.equal(
      protectiveSideOk('LONG', between, entry + 0.8, entry, longBe, 0.001),
      false
    );
  });

  it('never posts a Hyperliquid market profit SL', () => {
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
      false
    );
    assert.equal(
      profitStopSafeToPost({
        direction: 'SHORT',
        stopPx: be,
        markPx: be - 0.25,
        entryPx: entry,
        absSize: size,
        minLockUsd: 0.2,
        breakevenPx: be,
        isMarket: false,
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

  it('still flags a glue-to-mark SHORT as unsafe', () => {
    assert.equal(protectiveSideOk('SHORT', 86.44, 86.43, entry, be, 0.001), false);
  });
});
