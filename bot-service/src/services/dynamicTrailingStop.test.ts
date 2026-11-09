import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateDynamicTrail, type TrailTickInput } from './dynamicTrailingStop';

function shortTick(
  over: Partial<TrailTickInput> & Pick<TrailTickInput, 'nowMs' | 'pnlUsd' | 'markPrice'>
): TrailTickInput {
  return {
    coin: 'BTC',
    direction: 'SHORT',
    entryPrice: 100,
    absSize: 1,
    notionalUsd: 100,
    collateralUsd: 50,
    totalHoldMs: over.nowMs,
    stopLossPct: 15,
    record: null,
    ...over,
  };
}

describe('in-profit SL ratchet', () => {
  it('arms on first green tick and tightens as the peak runs', async () => {
    const t0 = 1_000_000;
    const armed = await evaluateDynamicTrail(
      shortTick({ nowMs: t0, pnlUsd: 1.4, markPrice: 98.6, record: null })
    );
    assert.equal(armed.record.phase, 'armed');
    assert.ok(armed.record.currentTrailStop != null);
    const firstStop = armed.record.currentTrailStop as number;
    assert.ok(firstStop < 100, 'stop sits on the profit side of entry');
    assert.ok(firstStop > 98.6);

    const ran = await evaluateDynamicTrail(
      shortTick({
        nowMs: t0 + 4_000,
        pnlUsd: 2.2,
        markPrice: 97.8,
        record: armed.record,
        totalHoldMs: 4_000,
      })
    );
    assert.ok(ran.record.currentTrailStop != null);
    assert.ok(
      (ran.record.currentTrailStop as number) <= firstStop,
      'SHORT profit SL only ratchets down with the peak'
    );
  });
});
