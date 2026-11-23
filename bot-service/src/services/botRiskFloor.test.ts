import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { effectiveBotLeverage, effectiveBotStopLossPercent } from './subscription';
import { config } from '../config';

describe('bot risk settings (user SL + user leverage)', () => {
  it('user SL Off/0/legacy 0.1 → 0 (user decides, no forced floor)', () => {
    assert.equal(config.hyperliquid.botMinStopLossPercent, 0);
    for (const raw of [0, null, undefined, 0.1, -5]) {
      assert.equal(effectiveBotStopLossPercent(raw), 0);
    }
  });

  it('user SL set → user value wins', () => {
    assert.equal(effectiveBotStopLossPercent(15), 15);
    assert.equal(effectiveBotStopLossPercent(40), 40);
  });

  it('leverage = user setting (no cap by default), 5 when unset', () => {
    assert.equal(effectiveBotLeverage(40), 40);
    assert.equal(effectiveBotLeverage(3), 3);
    assert.equal(effectiveBotLeverage(null), 5);
  });
});
