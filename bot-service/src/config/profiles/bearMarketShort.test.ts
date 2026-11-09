import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BEAR_MARKET } from './bearMarketShort';

describe('bear_market thorough pre-open', () => {
  it('does not bypass location / pump / macro for trusted SHORTs', () => {
    const s = BEAR_MARKET.short;
    assert.equal(s.relaxSecondaryGates, false);
    assert.equal(s.bypassMacroBetaWhenTrusted, false);
    assert.equal(s.bypassPumpShortWhenTrusted, false);
    assert.equal(s.bypassEntryLocationWhenTrusted, false);
    assert.equal(s.bypassFreshPumpWhenTrusted, false);
  });

  it('requires 15m+1h DOWN and 3 confirming 15m candles for SHORTs', () => {
    const s = BEAR_MARKET.short;
    assert.equal(s.requiredH1Trend, 'DOWN');
    assert.equal(s.required15mTrend, 'DOWN');
    assert.equal(s.minConfirm15mCandles, 3);
    assert.ok(s.minConfidence >= 58);
    assert.ok(s.minDirectionalTfs >= 3);
  });

  it('requires 3 closed 15m greens for LONGs', () => {
    assert.equal(BEAR_MARKET.long.minConfirm15mCandles, 3);
    assert.equal(BEAR_MARKET.long.required15mTrend, 'UP');
  });
});
