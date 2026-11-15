import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isLongAllowedCoin } from './longAllowlist';

describe('longAllowlist — no majors-only blocker', () => {
  it('allows PAXG and XMR when in bot universe', () => {
    assert.equal(isLongAllowedCoin('PAXG'), true);
    assert.equal(isLongAllowedCoin('XMR'), true);
    assert.equal(isLongAllowedCoin('BTC'), true);
  });
});