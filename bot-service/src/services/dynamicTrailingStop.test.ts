import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  breakevenPlusFeesStopPx,
  estimateRoundTripFeesUsd,
  evaluateDynamicTrail,
  lossStopPricePx,
  ratchetStop,
  seedTrailFromConfirmedProfitStop,
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
  it('activation attempt starts on any uPnL > 0', () => {
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
        timeInProfitMs: 0,
        collateralUsd: 5,
        notionalUsd: 100,
      }),
      true
    );
    assert.equal(
      shouldArmBreakevenProtection({
        direction: 'SHORT',
        pnlUsd: 0,
        markPrice: 100,
        entryPrice: 100,
        absSize: 1,
        feesUsd: fees,
        collateralUsd: 5,
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

  it('SHORT parks a profit stop on the first green tick (no 5s hold)', async () => {
    const t0 = 1_000_000;
    const armed = await evaluateDynamicTrail(
      shortTick({ nowMs: t0, pnlUsd: 0.01, markPrice: 99.6, record: null })
    );
    assert.equal(armed.shouldClose, false);
    assert.ok(armed.record.phase === 'armed' || armed.record.phase === 'trailing');
    assert.ok(armed.record.currentTrailStop != null);
    assert.ok(
      (armed.record.currentTrailStop as number) > 99.6,
      'SHORT trail must sit above mark'
    );
    assert.ok((armed.record.currentTrailStop as number) < 100);
  });

  it('LONG parks a profit stop on the first green tick', async () => {
    const t0 = 2_000_000;
    const armed = await evaluateDynamicTrail(
      longTick({ nowMs: t0, pnlUsd: 0.01, markPrice: 100.4, record: null })
    );
    assert.equal(armed.shouldClose, false);
    assert.ok(armed.record.currentTrailStop != null);
    assert.ok((armed.record.currentTrailStop as number) < 100.4);
    assert.ok((armed.record.currentTrailStop as number) > 100);
  });

  it('stays PROFIT_SL_PENDING when mark has no gap for a profit-side stop', async () => {
    const glued = await evaluateDynamicTrail(
      shortTick({ nowMs: 1, pnlUsd: 0.001, markPrice: 99.999, record: null, tickSize: 0.01 })
    );
    assert.equal(glued.record.phase, 'pending');
    assert.equal(glued.record.currentTrailStop, null);
    assert.equal(glued.closeDetail, 'PROFIT_SL_PENDING');
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

  it('closes when mark tags the profit stop while still green', async () => {
    const t0 = 4_000_000;
    const armed = await evaluateDynamicTrail(
      shortTick({ nowMs: t0, pnlUsd: 0.9, markPrice: 99.1, record: null })
    );
    assert.equal(armed.shouldClose, false);
    const stop = armed.record.currentTrailStop as number;
    const tagged = await evaluateDynamicTrail(
      shortTick({
        nowMs: t0 + 200,
        pnlUsd: 0.2,
        markPrice: stop + 0.05,
        record: armed.record,
      })
    );
    assert.equal(tagged.shouldClose, true);
    assert.equal(tagged.exitReason, 'trailing_stop');
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

  it('does not wait 5s or 15s before arming', async () => {
    const t0 = 9_000_000;
    const instant = await evaluateDynamicTrail(
      shortTick({
        nowMs: t0,
        pnlUsd: 0.05,
        markPrice: 99.5,
        record: null,
        totalHoldMs: 0,
      })
    );
    assert.ok(instant.record.phase === 'armed' || instant.record.phase === 'trailing');
    assert.equal(instant.record.timeInProfitMs, 0);
  });

  it('keeps a 15% emergency price on the loss side of entry', () => {
    const shortEm = lossStopPricePx('SHORT', 100, 1, 5, 15);
    const longEm = lossStopPricePx('LONG', 100, 1, 5, 15);
    assert.ok(shortEm > 100);
    assert.ok(longEm < 100);
    assert.ok(Math.abs(shortEm - 100.75) < 1e-9);
    assert.ok(Math.abs(longEm - 99.25) < 1e-9);
  });

  it('evaluate keeps a tighter confirmed HL stop instead of a looser first placeable', async () => {
    const kept = await evaluateDynamicTrail(
      shortTick({
        nowMs: 8_000_000,
        pnlUsd: 0.5,
        markPrice: 99.5,
        record: null,
        confirmedExchangeStopPx: 99.2,
      })
    );
    assert.ok((kept.record.currentTrailStop as number) <= 99.2);
  });

  it('restart reconstruct never loosens a confirmed exchange profit stop', () => {
    const rec = seedTrailFromConfirmedProfitStop(
      {
        phase: 'idle',
        direction: 'SHORT',
        entryPrice: 100,
        highestPriceSinceEntry: 99.2,
        highestPnlSinceEntry: 0.8,
        currentTrailStop: 99.6,
        trailArmedAt: null,
        profitSinceAt: null,
        maxRunup: 0.8,
        openedAt: 1,
        estimatedFeesUsd: 0.07,
        lastTrailDistancePx: 0,
        timeInProfitMs: 0,
      },
      'SHORT',
      99.2,
      2
    );
    assert.equal(rec.currentTrailStop, 99.2);
    assert.equal(rec.phase, 'armed');
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
