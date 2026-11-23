import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { effectiveBotLeverage, effectiveBotStopLossPercent } from './subscription';
import { config } from '../config';

describe('bot risk settings (user SL, leverage capped)', () => {
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

  it('leverage capped at HL_BOT_MAX_LEVERAGE, default 5 when unset', () => {
    const cap = config.hyperliquid.botMaxLeverage;
    assert.equal(effectiveBotLeverage(40), Math.min(40, cap));
    assert.equal(effectiveBotLeverage(3), 3);
    assert.equal(effectiveBotLeverage(null), Math.min(5, cap));
  });
});
