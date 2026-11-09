import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  breakevenPlusFeesStopPx,
  estimateRoundTripFeesUsd,
  evaluateDynamicTrail,
  profitProtectionStage,
  ratchetStop,
  shouldArmBreakevenProtection,
  type TrailTickInput,
} from './dynamicTrailingStop';

function shortTick(
  over: Partial<TrailTickInput> & Pick<TrailTickInput, 'nowMs' | 'pnlUsd' | 'markPrice'>
): TrailTickInput {
  return {
    coin: 'BTC',
    direction: 'SHORT',
    entryPrice: 100,
    absSize: 1,
    notionalUsd: 100,
    collateralUsd: 5,
    totalHoldMs: over.nowMs,
    stopLossPct: 15,
    record: null,
    tickSize: 0.01,
    szDecimals: 2,
    fundingUsd: 0,
    ...over,
  };
}

function longTick(
  over: Partial<TrailTickInput> & Pick<TrailTickInput, 'nowMs' | 'pnlUsd' | 'markPrice'>
): TrailTickInput {
  return {
    ...shortTick(over),
    coin: 'ETH',
    direction: 'LONG',
  };
}

describe('profit SL architecture', () => {
  it('never arms on pnlUsd > 0 alone', () => {
    const fees = estimateRoundTripFeesUsd(100);
    assert.equal(
      shouldArmBreakevenProtection({
        direction: 'SHORT',
        pnlUsd: 0.01,
        markPrice: 99.99,
        entryPrice: 100,
        absSize: 1,
        feesUsd: fees,
        tickSize: 0.01,
        timeInProfitMs: 5_000,
        collateralUsd: 5,
        notionalUsd: 100,
      }),
      false
    );
  });

  it('first profit stop is breakevenPlusFeesStopPx, mirrored LONG/SHORT', () => {
    const fees = estimateRoundTripFeesUsd(100);
    const shortBe = breakevenPlusFeesStopPx('SHORT', 100, 1, fees, 0, 100, 0.01, 2);
    const longBe = breakevenPlusFeesStopPx('LONG', 100, 1, fees, 0, 100, 0.01, 2);
    assert.ok(shortBe < 100, `SHORT BE ${shortBe} must sit below entry`);
    assert.ok(longBe > 100, `LONG BE ${longBe} must sit above entry`);
    assert.ok(Math.abs(100 - shortBe - (longBe - 100)) < 0.02, 'BE distance is symmetric');
  });

  it('SHORT stays stage 0 on a first-green scratch, then arms at BE', async () => {
    const t0 = 1_000_000;
    const scratch = await evaluateDynamicTrail(
      shortTick({ nowMs: t0, pnlUsd: 0.02, markPrice: 99.98, record: null })
    );
    assert.equal(profitProtectionStage(scratch.record), 0);
    assert.equal(scratch.record.currentTrailStop, null);

    const stillTiny = await evaluateDynamicTrail(
      shortTick({
        nowMs: t0 + 2_000,
        pnlUsd: 0.05,
        markPrice: 99.95,
        record: scratch.record,
        totalHoldMs: 2_000,
      })
    );
    assert.equal(profitProtectionStage(stillTiny.record), 0);

    const fees = estimateRoundTripFeesUsd(100);
    const be = breakevenPlusFeesStopPx('SHORT', 100, 1, fees, 0, 100, 0.01, 2);
    const armMark = be - 0.12;
    const pnl = 100 - armMark;
    const armed = await evaluateDynamicTrail(
      shortTick({
        nowMs: t0 + 3_000,
        pnlUsd: pnl,
        markPrice: armMark,
        record: stillTiny.record,
        totalHoldMs: 3_000,
      })
    );
    assert.equal(profitProtectionStage(armed.record), 1);
    assert.ok(armed.record.currentTrailStop != null);
    assert.ok(
      Math.abs((armed.record.currentTrailStop as number) - be) < 0.03,
      `first stop must be BE ${be}, got ${armed.record.currentTrailStop}`
    );
    assert.ok((armed.record.currentTrailStop as number) < 100);
  });

  it('LONG mirrors SHORT: no arm on +$0.02, then BE lock', async () => {
    const t0 = 2_000_000;
    const scratch = await evaluateDynamicTrail(
      longTick({ nowMs: t0, pnlUsd: 0.02, markPrice: 100.02, record: null })
    );
    assert.equal(profitProtectionStage(scratch.record), 0);

    const fees = estimateRoundTripFeesUsd(100);
    const be = breakevenPlusFeesStopPx('LONG', 100, 1, fees, 0, 100, 0.01, 2);
    const armMark = be + 0.12;
    const armed = await evaluateDynamicTrail(
      longTick({
        nowMs: t0 + 2_000,
        pnlUsd: armMark - 100,
        markPrice: armMark,
        record: scratch.record,
        totalHoldMs: 2_000,
      })
    );
    assert.equal(profitProtectionStage(armed.record), 1);
    assert.ok(Math.abs((armed.record.currentTrailStop as number) - be) < 0.03);
    assert.ok((armed.record.currentTrailStop as number) > 100);
  });

  it('ratchet never moves SHORT stop up or LONG stop down', () => {
    assert.equal(ratchetStop('SHORT', 99.2, 99.5), 99.2);
    assert.equal(ratchetStop('SHORT', 99.2, 98.9), 98.9);
    assert.equal(ratchetStop('LONG', 100.8, 100.5), 100.8);
    assert.equal(ratchetStop('LONG', 100.8, 101.1), 101.1);
  });

  it('pullback toward entry does not worsen an armed SHORT stop', async () => {
    const t0 = 3_000_000;
    const fees = estimateRoundTripFeesUsd(100);
    const be = breakevenPlusFeesStopPx('SHORT', 100, 1, fees, 0, 100, 0.01, 2);
    const armMark = be - 0.25;
    const warm = await evaluateDynamicTrail(
      shortTick({ nowMs: t0, pnlUsd: 0.02, markPrice: 99.98, record: null })
    );
    const armed = await evaluateDynamicTrail(
      shortTick({
        nowMs: t0 + 2_000,
        pnlUsd: 100 - armMark,
        markPrice: armMark,
        record: warm.record,
        totalHoldMs: 2_000,
      })
    );
    assert.equal(profitProtectionStage(armed.record), 1);
    const first = armed.record.currentTrailStop as number;

    const ran = await evaluateDynamicTrail(
      shortTick({
        nowMs: t0 + 5_000,
        pnlUsd: 2.4,
        markPrice: 97.6,
        record: armed.record,
        totalHoldMs: 5_000,
      })
    );
    const afterRun = ran.record.currentTrailStop as number;
    assert.ok(afterRun <= first);

    const pullback = await evaluateDynamicTrail(
      shortTick({
        nowMs: t0 + 8_000,
        pnlUsd: 0.4,
        markPrice: 99.6,
        record: ran.record,
        totalHoldMs: 8_000,
      })
    );
    assert.ok(
      (pullback.record.currentTrailStop as number) <= afterRun,
      'SHORT stop must not move back toward entry on a pullback'
    );
  });

  it('adverse funding pushes BE further into profit', () => {
    const fees = estimateRoundTripFeesUsd(100);
    const noFund = breakevenPlusFeesStopPx('SHORT', 100, 1, fees, 0, 100, 0.01, 2);
    const paid = breakevenPlusFeesStopPx('SHORT', 100, 1, fees, -0.5, 100, 0.01, 2);
    assert.ok(paid < noFund, 'SHORT BE must drop when funding was paid');
    const longPaid = breakevenPlusFeesStopPx('LONG', 100, 1, fees, -0.5, 100, 0.01, 2);
    const longFree = breakevenPlusFeesStopPx('LONG', 100, 1, fees, 0, 100, 0.01, 2);
    assert.ok(longPaid > longFree);
  });
});
