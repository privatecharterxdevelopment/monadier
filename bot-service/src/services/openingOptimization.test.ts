import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { config } from '../config';
import { isVolumeRankOpenable } from './coinTier';
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
    assert.equal(isVolumeRankOpenable(1, 0), true);
    assert.equal(isVolumeRankOpenable(12, 0), true);
    assert.equal(isVolumeRankOpenable(40, 0), true);
    assert.equal(isVolumeRankOpenable(99, 0), true);
    assert.equal(isVolumeRankOpenable(13, 12), false);
    assert.equal(isVolumeRankOpenable(12, 12), true);
    assert.equal(config.hyperliquid.scalpOpen.minConfirm1mCandles, 1);
    assert.equal(config.hyperliquid.reentryCooldownMs, 0);
  });

  it('aggressive SHORTs still hit every open-time safety gate', () => {
    const src = readFileSync(join(process.cwd(), 'src/services/hlTrading.ts'), 'utf8');
    const openFn = src.slice(src.indexOf('async openMarketPosition'));
    assert.match(openFn, /pick\.botMode === 'aggressive'/);
    for (const gate of [
      'news',
      'fresh_pump',
      'pre_open_candles',
      'scalp_align',
      'macro_beta',
      'pump_short',
      'entry_momentum',
      'mega_pair',
      'entry_location',
      'entry_location_quality',
    ]) {
      assert.match(openFn, new RegExp(`markGatePassed\\([^,]+, '${gate}'\\)`));
    }
    assert.doesNotMatch(openFn, /if \(opts\.pick\.botMode === 'aggressive'\) return/);
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
