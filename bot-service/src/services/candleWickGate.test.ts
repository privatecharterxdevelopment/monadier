import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { closedLookback } from './candleWickGate';

describe('closedLookback', () => {
  it('lookback 0 does not return every closed candle (slice(-0) trap)', () => {
    const bars = [1, 2, 3, 4, 5];
    assert.deepEqual(closedLookback(bars, 0), []);
    assert.deepEqual(closedLookback(bars, 1), [4]);
    assert.deepEqual(closedLookback(bars, 2), [3, 4]);
  });
});
