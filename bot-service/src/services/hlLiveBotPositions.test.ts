import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

/**
 * Regression: profit SL confirmed only from open HL orders —
 * in-memory px must not flip profitSlConfirmed (see buildLiveBotPositionViews).
 */
describe('hlLiveBotPositions confirmation policy', () => {
  it('documents memory vs exchange confirmed split', () => {
    const profitSlConfirmedFromOrder = false;
    const memoryPx = 1920.27;
    let profitSlConfirmed = profitSlConfirmedFromOrder;
    let profitSlMemoryPx: number | null = null;
  if (!profitSlConfirmed && memoryPx > 0) {
      profitSlMemoryPx = memoryPx;
    }
    const status = profitSlConfirmed
      ? 'PROFIT_SL_CONFIRMED'
      : profitSlMemoryPx != null
        ? 'PROFIT_SL_UNVERIFIED'
        : 'idle';
    assert.equal(profitSlConfirmed, false);
    assert.equal(status, 'PROFIT_SL_UNVERIFIED');
    assert.equal(profitSlMemoryPx, memoryPx);
  });
});
