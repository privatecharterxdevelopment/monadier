import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { config } from '../config';
import { resolveOpenStopLossPercent } from './openStopLossScope';

describe('resolveOpenStopLossPercent', () => {
  it('manual scope never posts SL', () => {
    assert.equal(resolveOpenStopLossPercent('manual', 12), 0);
  });

  it('ops uses vault SL when set', () => {
    assert.equal(resolveOpenStopLossPercent('ops', 8), 8);
  });

  it('ops uses ops desk default when vault SL is 0', () => {
    assert.equal(resolveOpenStopLossPercent('ops', 0), config.hyperliquid.opsDeskStopLossPercent);
    assert.ok(resolveOpenStopLossPercent('ops', 0) >= 1);
  });

  it('bot respects vault only (0 stays 0)', () => {
    assert.equal(resolveOpenStopLossPercent('bot', 0), 0);
  });
});