import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  _resetBtcRegimeStateForTests,
  advanceBtcRegimeHysteresisForTests,
  getBtcHysteresisStateForTests,
} from './btcMarketRegime';

describe('btcMarketRegime hysteresis — 1h signal cadence', () => {
  afterEach(() => {
    _resetBtcRegimeStateForTests();
  });

  it('does not increment pendingHits on repeated cycles with same closed 1h bar', () => {
    const t0 = 1_700_000_000_000;
    const t1 = t0 + 3_600_000;
    advanceBtcRegimeHysteresisForTests('bull_market', t0);
    assert.equal(getBtcHysteresisStateForTests().committed, 'bull_market');

    advanceBtcRegimeHysteresisForTests('bear_market', t1);
    assert.equal(getBtcHysteresisStateForTests().pendingHits, 1);

    for (let i = 0; i < 10; i += 1) {
      const r = advanceBtcRegimeHysteresisForTests('bear_market', t1);
      assert.equal(r.regime, 'bull_market');
      assert.equal(r.sticky, true);
      assert.equal(getBtcHysteresisStateForTests().pendingHits, 1);
    }
  });

  it('counts independent confirmations only on new closed 1h bars (bear→bull)', () => {
    const t0 = 1_700_000_000_000;
    const step = 3_600_000;
    advanceBtcRegimeHysteresisForTests('bear_market', t0);

    advanceBtcRegimeHysteresisForTests('bull_market', t0 + step);
    assert.equal(getBtcHysteresisStateForTests().pendingHits, 1);
    assert.equal(getBtcHysteresisStateForTests().committed, 'bear_market');

    const flipped = advanceBtcRegimeHysteresisForTests('bull_market', t0 + step * 2);
    assert.equal(getBtcHysteresisStateForTests().committed, 'bull_market');
    assert.equal(flipped.regime, 'bull_market');
    assert.equal(flipped.sticky, false);
  });

  it('bull→bear requires four 1h confirmations (FLIP_LEAVE_BULL default)', () => {
    const step = 3_600_000;
    let t = 2_000_000_000_000;
    advanceBtcRegimeHysteresisForTests('bull_market', t);
    for (let i = 0; i < 3; i += 1) {
      t += step;
      advanceBtcRegimeHysteresisForTests('bear_market', t);
      assert.equal(getBtcHysteresisStateForTests().committed, 'bull_market');
    }
    t += step;
    advanceBtcRegimeHysteresisForTests('bear_market', t);
    assert.equal(getBtcHysteresisStateForTests().committed, 'bear_market');
  });
});
