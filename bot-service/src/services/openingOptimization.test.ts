import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { config } from '../config';
import {
  globalSignalsForBotMode,
  h1AllowsShort,
  isOpenableLongCandidate,
  isScanQueueable,
  type GlobalScanResult,
  type GlobalSignalCandidate,
} from './globalMarketScan';

function cand(
  coin: string,
  direction: 'LONG' | 'SHORT',
  confidence: number,
  dayVolumeUsd: number,
  botMode: 'standard' | 'aggressive' = 'standard'
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
    h1Trend: direction === 'SHORT' ? 'DOWN' : 'UP',
  };
}

describe('opening optimization defaults', () => {
  it('scans a wider liquid universe with a $1M floor and no rank cap', () => {
    assert.equal(config.hyperliquid.maxLiquidScanUniverse, 40);
    assert.equal(config.hyperliquid.minDayVolumeUsd, 1_000_000);
    assert.equal(config.hyperliquid.scalpOpen.maxVolumeRank, 0);
    assert.equal(config.hyperliquid.scalpOpen.minConfirm1mCandles, 1);
    assert.equal(config.hyperliquid.reentryCooldownMs, 0);
  });

  it('1h SIDEWAYS allows SHORT and 1h UP does not', () => {
    assert.equal(h1AllowsShort('SIDEWAYS'), true);
    assert.equal(h1AllowsShort('DOWN'), true);
    assert.equal(h1AllowsShort('UP'), false);
    assert.equal(h1AllowsShort('STRONG_UPTREND'), false);
    assert.equal(h1AllowsShort(''), false);
  });
});

describe('aggressive SHORT borrow + $1M floor', () => {
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

  it('does not duplicate a coin already on the MTF list', () => {
    const scan: GlobalScanResult = {
      standard: [cand('ETH', 'SHORT', 69, 50_000_000, 'standard')],
      aggressive: [cand('ETH', 'SHORT', 94, 50_000_000, 'aggressive')],
    };
    const signals = globalSignalsForBotMode(scan, 'standard');
    assert.equal(signals.length, 1);
    assert.equal(signals[0]?.botMode, 'standard');
  });

  it('does not borrow a relief LONG', () => {
    const long = cand('BNB', 'LONG', 70, 80_000_000, 'aggressive');
    long.longClass = 'NONE';
    const scan: GlobalScanResult = { standard: [], aggressive: [long] };
    assert.equal(globalSignalsForBotMode(scan, 'standard').length, 0);
  });
});

describe('SHORT-primary queue helpers', () => {
  it('queues SHORT over an unclassified LONG', () => {
    const short = cand('HYPE', 'SHORT', 69, 10_000_000);
    const long = cand('HYPE', 'LONG', 64, 10_000_000);
    assert.equal(isScanQueueable(short, short, short), true);
    assert.equal(isScanQueueable(long, short, short), false);
  });

  it('queues TREND_LONG and REVERSAL_LONG only', () => {
    const long = cand('BTC', 'LONG', 64, 10_000_000);
    long.longClass = 'TREND_LONG';
    assert.equal(isOpenableLongCandidate(long), true);
    assert.equal(isScanQueueable(long, long, null), true);
    const reversal = cand('BTC', 'LONG', 64, 10_000_000);
    reversal.longClass = 'REVERSAL_LONG';
    assert.equal(isOpenableLongCandidate(reversal), true);
    const relief = cand('BTC', 'LONG', 70, 10_000_000);
    relief.longClass = 'NONE';
    relief.reversalCode = 'REVERSAL_WAITING_RECLAIM';
    assert.equal(isOpenableLongCandidate(relief), false);
    assert.equal(isScanQueueable(relief, relief, cand('BTC', 'SHORT', 64, 10_000_000)), false);
  });
});
