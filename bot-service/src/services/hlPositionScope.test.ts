import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { coinKey } from './hlPositionScope';

// Helpers tested inline — full DB tests need integration; scope logic is in resolve via source map.
describe('hlPositionScope helpers', () => {
  it('normalizes perp coin names', () => {
    assert.equal(coinKey('btc-perp'), 'BTC');
    assert.equal(coinKey('ETH'), 'ETH');
  });
});
