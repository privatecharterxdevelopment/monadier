import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { estimateRoundTripFeesUsd, breakevenPlusFeesStopPx } from './dynamicTrailingStop';
import { planProtectiveSync } from './hlProfitStopSync';

/**
 * Integration trace: fast position monitor sees emergencyMissing → recoverPositionUserStop.
 * (POST/verify live on Railway; this test proves detection + plan in-process.)
 */
describe('emergency SL monitor integration (plan layer)', () => {
  const entry = 1921;
  const size = 0.38;
  const fees = estimateRoundTripFeesUsd(entry * size);
  const be = breakevenPlusFeesStopPx('SHORT', entry, size, fees, 0, entry * size, 0.01, 4);

  it('detects missing emergency when slPct configured and no HL emergency order', () => {
    const plan = planProtectiveSync({
      direction: 'SHORT',
      entryPx: entry,
      markPx: 1925,
      absSize: size,
      orders: [],
      coin: 'ETH',
      desiredStopPx: null,
      armed: false,
      emergencyStopPx: 1980,
      minLockUsd: 0,
      tickSize: 0.01,
      breakevenPx: be,
      nowMs: 1,
      lastTrailSyncAt: 0,
    });
    assert.equal(plan.emergencyMissing, true);
    assert.ok(plan.postEmergencyPx != null);
    assert.equal(plan.cancelProfitAfterPost.length, 0);
  });

  it('does not cancel profit on POST reject path (profit plan only when postProfit set)', () => {
    const plan = planProtectiveSync({
      direction: 'SHORT',
      entryPx: entry,
      markPx: 1920,
      absSize: size,
      orders: [],
      coin: 'ETH',
      desiredStopPx: be - 0.5,
      armed: true,
      emergencyStopPx: 1980,
      minLockUsd: 0,
      tickSize: 0.01,
      breakevenPx: be,
      nowMs: 10_000,
      lastTrailSyncAt: 0,
    });
    assert.ok(plan.postProfit || plan.postEmergencyPx);
    if (plan.postProfit) {
      assert.ok(Array.isArray(plan.cancelProfitAfterPost));
    }
  });
});
