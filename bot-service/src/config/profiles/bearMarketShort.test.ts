import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BEAR_MARKET } from './bearMarketShort';

describe('bear_market thorough pre-open', () => {
  it('relaxes some secondary gates when MTF scan is trusted but never location/pre-open', () => {
    const s = BEAR_MARKET.short;
    assert.equal(s.relaxSecondaryGates, true);
    assert.equal(s.bypassMacroBetaWhenTrusted, true);
    assert.equal(s.bypassPumpShortWhenTrusted, true);
    assert.equal(s.bypassEntryLocationWhenTrusted, false);
    assert.equal(s.bypassFreshPumpWhenTrusted, true);
    assert.equal(s.bypassPreOpenWhenTrusted, false);
    assert.equal(s.bypassScalpAlignWhenTrusted, true);
    assert.equal(s.bypassEntryMomentumWhenTrusted, true);
    assert.equal(s.bypassSrLocationWhenTrusted, false);
  });

  it('requires 15m+1h DOWN and 3 confirming 15m candles for SHORTs', () => {
    const s = BEAR_MARKET.short;
    assert.equal(s.requiredH1Trend, 'DOWN');
    assert.equal(s.required15mTrend, 'DOWN');
    assert.equal(s.minConfirm15mCandles, 3);
    assert.ok(s.minConfidence >= 58);
    assert.ok(s.minDirectionalTfs >= 3);
  });

  it('requires 3 closed 15m greens for TREND LONGs; reversal is a separate path', () => {
    assert.equal(BEAR_MARKET.long.minConfirm15mCandles, 3);
    assert.equal(BEAR_MARKET.long.required15mTrend, 'UP');
    assert.equal(BEAR_MARKET.long.required5mTrend, 'UP');
    assert.ok(BEAR_MARKET.reversalLong);
    assert.equal(BEAR_MARKET.reversalLong?.minPrimaryTfs, 2);
    assert.equal(BEAR_MARKET.reversalLong?.minConfidence, BEAR_MARKET.long.minConfidence);
    assert.equal(BEAR_MARKET.reversalLong?.shadowMinConfidence, 58);
  });
});
