import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { capLeverageByEntryRange, requiresHardEntryLocationGate } from './entryLeverageCap';

describe('entryLeverageCap', () => {
  it('requires hard location gates for BTC and 20×+', () => {
    assert.equal(requiresHardEntryLocationGate('BTC', 40), true);
    assert.equal(requiresHardEntryLocationGate('SOL', 40), true);
    assert.equal(requiresHardEntryLocationGate('SOL', 15), false);
  });

  it('caps BTC SHORT at 5× on the 1h floor', () => {
    const r = capLeverageByEntryRange({
      coin: 'BTC',
      direction: 'SHORT',
      requested: 40,
      rangePosition1h: 0.08,
      chasingCompletedMove: true,
    });
    assert.equal(r.leverage, 5);
    assert.equal(r.capped, true);
  });

  it('allows full leverage in mid 1h range', () => {
    const r = capLeverageByEntryRange({
      coin: 'BTC',
      direction: 'SHORT',
      requested: 40,
      rangePosition1h: 0.48,
      chasingCompletedMove: false,
    });
    assert.equal(r.leverage, 40);
    assert.equal(r.capped, false);
  });
});
