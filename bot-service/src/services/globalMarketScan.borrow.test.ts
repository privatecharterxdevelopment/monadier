import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { config } from '../config';
import {
  globalSignalsForBotMode,
  h1AllowsShort,
  type GlobalScanResult,
  type GlobalSignalCandidate,
} from './globalMarketScan';

function cand(
  coin: string,
  direction: 'LONG' | 'SHORT',
  confidence: number,
  dayVolumeUsd: number,
  botMode: 'standard' | 'aggressive'
): GlobalSignalCandidate {
  return {
    coin,
    symbol: `${coin}USDT`,
    direction,
    confidence,
    reason: 'test',
    dayVolumeUsd,
    openInterestUsd: 2_000_000,
    botMode,
    h1Trend: 'DOWN',
    directionalTfCount: 4,
    trendAlignment: 100,
  };
}

describe('Standard bot borrows aggressive dump-tape', () => {
  it('bear_market enables aggressive scalp signals', () => {
    assert.equal(config.hyperliquid.directionProfile.useAggressiveScalpSignals, true);
  });

  it('drops thin alts under the $1M open floor so they cannot occupy the slot', () => {
    const scan: GlobalScanResult = {
      standard: [cand('PROVE', 'SHORT', 83, 50_000, 'standard')],
      aggressive: [cand('ALGO', 'SHORT', 94, 484_783, 'aggressive')],
    };
    const signals = globalSignalsForBotMode(scan, 'standard');
    assert.equal(signals.length, 0);
  });

  it('Standard queues a liquid 94% aggressive SHORT when MTF is empty', () => {
    const scan: GlobalScanResult = {
      standard: [],
      aggressive: [cand('ETH', 'SHORT', 94, 80_000_000, 'aggressive')],
    };
    const signals = globalSignalsForBotMode(scan, 'standard');
    assert.equal(signals.length, 1);
    assert.equal(signals[0]?.coin, 'ETH');
    assert.equal(signals[0]?.direction, 'SHORT');
  });

  it('SHORT is allowed on 1h SIDEWAYS and blocked on 1h UP', () => {
    assert.equal(h1AllowsShort('SIDEWAYS'), true);
    assert.equal(h1AllowsShort('DOWN'), true);
    assert.equal(h1AllowsShort('UP'), false);
    assert.equal(h1AllowsShort('STRONG_UPTREND'), false);
    assert.equal(h1AllowsShort(''), false);
  });

  it('does not duplicate a coin already on the MTF list', () => {
    const scan: GlobalScanResult = {
      standard: [cand('ETH', 'SHORT', 69, 50_000_000, 'standard')],
      aggressive: [cand('ETH', 'SHORT', 94, 50_000_000, 'aggressive')],
    };
    const signals = globalSignalsForBotMode(scan, 'standard');
    assert.equal(signals.length, 1);
    assert.equal(signals[0]?.botMode, 'standard');
  });
});
