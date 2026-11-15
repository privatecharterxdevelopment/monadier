import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  leverageTrailFloorPx,
  resolveTrailDistancePx,
} from './dynamicTrailingStop';

describe('leverage trail floor', () => {
  it('40× floor is much wider than legacy micro-cap', async () => {
    const mark = 100;
    const floor = leverageTrailFloorPx(mark, 40, 5, 0.8);
    assert.ok(floor >= mark * 0.006, `floor ${floor} should be at least ~0.6% of mark`);
    const dist = await resolveTrailDistancePx('BTC', mark, {
      pctOnly: true,
      leverage: 40,
      collateralUsd: 5,
      pnlUsd: 0.8,
      direction: 'LONG',
    });
    assert.ok(dist >= floor, 'resolveTrailDistancePx must not shrink below lev floor');
  });
});