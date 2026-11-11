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

  it('SHORT stays idle until 5s in profit, then parks stop above mark', async () => {
    const t0 = 1_000_000;
    const scratch = await evaluateDynamicTrail(
      shortTick({ nowMs: t0, pnlUsd: 0.4, markPrice: 99.6, record: null })
    );
    assert.equal(profitProtectionStage(scratch.record), 0);
    assert.equal(scratch.record.currentTrailStop, null);

    const tooSoon = await evaluateDynamicTrail(
      shortTick({
        nowMs: t0 + 4_000,
        pnlUsd: 0.5,
        markPrice: 99.5,
        record: scratch.record,
        totalHoldMs: 4_000,
      })
    );
    assert.equal(profitProtectionStage(tooSoon.record), 0);

    const armed = await evaluateDynamicTrail(
      shortTick({
        nowMs: t0 + 5_000,
        pnlUsd: 0.6,
        markPrice: 99.4,
        record: tooSoon.record,
        totalHoldMs: 5_000,
      })
    );
    assert.equal(armed.shouldClose, false);
    assert.equal(profitProtectionStage(armed.record), 1);
    assert.ok(armed.record.currentTrailStop != null);
    assert.ok(
      (armed.record.currentTrailStop as number) > 99.4,
      'SHORT trail must sit above mark'
    );
  });

  it('LONG parks stop below mark after 5s green', async () => {
    const t0 = 2_000_000;
    const scratch = await evaluateDynamicTrail(
      longTick({ nowMs: t0, pnlUsd: 0.4, markPrice: 100.4, record: null })
    );
    assert.equal(profitProtectionStage(scratch.record), 0);

    const armed = await evaluateDynamicTrail(
      longTick({
        nowMs: t0 + 5_000,
        pnlUsd: 0.5,
        markPrice: 100.5,
        record: scratch.record,
        totalHoldMs: 5_000,
      })
    );
    assert.equal(armed.shouldClose, false);
    assert.equal(profitProtectionStage(armed.record), 1);
    assert.ok((armed.record.currentTrailStop as number) < 100.5);
  });

  it('ratchet never moves SHORT stop up or LONG stop down', () => {
    assert.equal(ratchetStop('SHORT', 99.2, 99.5), 99.2);
    assert.equal(ratchetStop('SHORT', 99.2, 98.9), 98.9);
    assert.equal(ratchetStop('LONG', 100.8, 100.5), 100.8);
    assert.equal(ratchetStop('LONG', 100.8, 101.1), 101.1);
  });

  it('pullback toward entry does not worsen an armed SHORT stop', async () => {
    const t0 = 3_000_000;
    const warm = await evaluateDynamicTrail(
      shortTick({ nowMs: t0, pnlUsd: 0.5, markPrice: 99.5, record: null })
    );
    const armed = await evaluateDynamicTrail(
      shortTick({
        nowMs: t0 + 5_000,
        pnlUsd: 0.6,
        markPrice: 99.4,
        record: warm.record,
        totalHoldMs: 5_000,
      })
    );
    const first = armed.record.currentTrailStop as number;

    const ran = await evaluateDynamicTrail(
      shortTick({
        nowMs: t0 + 6_000,
        pnlUsd: 2.4,
        markPrice: 97.6,
        record: armed.record,
        totalHoldMs: 6_000,
      })
    );
    const afterRun = ran.record.currentTrailStop as number;
    assert.ok(afterRun <= first);
    assert.ok(afterRun > 97.6, 'SHORT trail stays above the dump print');

    const pullback = await evaluateDynamicTrail(
      shortTick({
        nowMs: t0 + 8_000,
        pnlUsd: 0.4,
        markPrice: 99.0,
        record: ran.record,
        totalHoldMs: 8_000,
      })
    );
    assert.ok(
      (pullback.record.currentTrailStop as number) <= afterRun,
      'SHORT stop must not move back toward entry on a pullback'
    );
  });

  it('does not fire in the first 5s even if mark tags the trail, then closes after', async () => {
    const t0 = 4_000_000;
    const warm = await evaluateDynamicTrail(
      shortTick({ nowMs: t0, pnlUsd: 0.8, markPrice: 99.2, record: null })
    );
    const armed = await evaluateDynamicTrail(
      shortTick({
        nowMs: t0 + 5_000,
        pnlUsd: 0.9,
        markPrice: 99.1,
        record: warm.record,
        totalHoldMs: 5_000,
      })
    );
    assert.equal(armed.shouldClose, false);
    const stop = armed.record.currentTrailStop as number;

    const earlyTag = await evaluateDynamicTrail(
      shortTick({
        nowMs: t0 + 7_000,
        pnlUsd: 0.1,
        markPrice: stop + 0.05,
        record: armed.record,
        totalHoldMs: 7_000,
      })
    );
    assert.equal(earlyTag.shouldClose, false);

    const lateTagTooThin = await evaluateDynamicTrail(
      shortTick({
        nowMs: t0 + 10_100,
        pnlUsd: 0.05,
        markPrice: stop + 0.05,
        record: armed.record,
        totalHoldMs: 10_100,
      })
    );
    assert.equal(lateTagTooThin.shouldClose, false, 'thin leftover after fees is not a profit exit');

    const lateTag = await evaluateDynamicTrail(
      shortTick({
        nowMs: t0 + 10_100,
        pnlUsd: 0.5,
        markPrice: stop + 0.05,
        record: armed.record,
        totalHoldMs: 10_100,
      })
    );
    assert.equal(lateTag.shouldClose, true);
    assert.equal(lateTag.exitReason, 'trailing_stop');
  });

  it('does not treat a red trailing_stop cross as a profit exit', async () => {
    const t0 = 5_000_000;
    const warm = await evaluateDynamicTrail(
      shortTick({ nowMs: t0, pnlUsd: 0.8, markPrice: 99.2, record: null })
    );
    const armed = await evaluateDynamicTrail(
      shortTick({
        nowMs: t0 + 5_000,
        pnlUsd: 0.9,
        markPrice: 99.1,
        record: warm.record,
        totalHoldMs: 5_000,
      })
    );
    const stop = armed.record.currentTrailStop as number;
    const red = await evaluateDynamicTrail(
      shortTick({
        nowMs: t0 + 12_000,
        pnlUsd: -0.4,
        markPrice: stop + 0.2,
        record: armed.record,
        totalHoldMs: 12_000,
      })
    );
    assert.equal(red.shouldClose, false);
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
