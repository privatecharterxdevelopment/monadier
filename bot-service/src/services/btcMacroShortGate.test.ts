import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateBtcBlocksAltShort } from './btcMacroShortGate';

describe('BTC leads up — block alt SHORT', () => {
  it('blocks DOGE SHORT when BTC 1h is green', () => {
    const r = evaluateBtcBlocksAltShort({
      coin: 'DOGE',
      btcTrend: 'SIDEWAYS',
      ch1h: 0.18,
      ch4h: -0.05,
    });
    assert.equal(r.block, true);
    assert.match(r.reason, /BTC 1h/);
  });

  it('blocks ZK SHORT when BTC trend is UP', () => {
    const r = evaluateBtcBlocksAltShort({
      coin: 'ZK',
      btcTrend: 'UP',
      ch1h: -0.02,
      ch4h: -0.1,
    });
    assert.equal(r.block, true);
    assert.match(r.reason, /BTC UP/);
  });

  it('blocks alt SHORT when BTC 4h is green', () => {
    const r = evaluateBtcBlocksAltShort({
      coin: 'KAS',
      btcTrend: 'SIDEWAYS',
      ch1h: -0.04,
      ch4h: 0.22,
    });
    assert.equal(r.block, true);
    assert.match(r.reason, /BTC 4h/);
  });

  it('blocks alt SHORT when BTC mega flow is LONG', () => {
    const r = evaluateBtcBlocksAltShort({
      coin: 'SOL',
      btcTrend: 'SIDEWAYS',
      ch1h: -0.02,
      ch4h: -0.05,
      megaBtcLong: true,
    });
    assert.equal(r.block, true);
  });

  it('allows alt SHORT only when BTC is not leading up', () => {
    const r = evaluateBtcBlocksAltShort({
      coin: 'DOGE',
      btcTrend: 'DOWN',
      ch1h: -0.35,
      ch4h: -0.4,
      liveBtc15m: -0.12,
      liveBtc5m: -0.08,
      btcChange5m: -0.05,
      btcChange15m: -0.1,
      megaBtcLong: false,
    });
    assert.equal(r.block, false);
  });

  it('never blocks BTC self-short via alt rule', () => {
    const r = evaluateBtcBlocksAltShort({
      coin: 'BTC',
      btcTrend: 'UP',
      ch1h: 1.2,
      ch4h: 2.0,
    });
    assert.equal(r.block, false);
  });
});
