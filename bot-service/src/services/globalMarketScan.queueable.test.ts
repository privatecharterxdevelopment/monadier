import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isOpenableLongCandidate,
  isScanQueueable,
  type GlobalSignalCandidate,
} from './globalMarketScan';

function cand(
  coin: string,
  direction: 'LONG' | 'SHORT',
  confidence: number,
  h1Trend = direction === 'LONG' ? 'UP' : 'DOWN'
): GlobalSignalCandidate {
  return {
    coin,
    symbol: `${coin}USDT`,
    direction,
    confidence,
    reason: 'test',
    dayVolumeUsd: 10_000_000,
    openInterestUsd: 5_000_000,
    botMode: 'standard',
    h1Trend,
  };
}

describe('scan queueable vs board LONG', () => {
  it('always queues the SHORT-primary print', () => {
    const short = cand('HYPE', 'SHORT', 69);
    const long = cand('HYPE', 'LONG', 64);
    assert.equal(isScanQueueable(short, short, short), true);
    assert.equal(isScanQueueable(long, short, short), false);
  });

  it('queues a lone LONG that the MTF pick already chose', () => {
    const long = cand('BTC', 'LONG', 64);
    long.longClass = 'TREND_LONG';
    assert.equal(isScanQueueable(long, long, null), true);
  });

  it('queues a strong lone LONG with 1h UP', () => {
    const long = cand('BTC', 'LONG', 81, 'UP');
    long.longClass = 'TREND_LONG';
    assert.equal(isScanQueueable(long, long, null), true);
  });

  it('queues a LONG that beat a real SHORT', () => {
    const long = cand('ETH', 'LONG', 88);
    long.longClass = 'TREND_LONG';
    const short = cand('ETH', 'SHORT', 60);
    assert.equal(isScanQueueable(long, long, short), true);
  });

  it('does not queue a relief/dump LONG over a live SHORT', () => {
    const long = cand('BTC', 'LONG', 70);
    long.longClass = 'NONE';
    long.reversalCode = 'REVERSAL_WAITING_RECLAIM';
    const short = cand('BTC', 'SHORT', 64);
    assert.equal(isOpenableLongCandidate(long), false);
    assert.equal(isScanQueueable(long, long, short), false);
    assert.equal(isScanQueueable(short, short, short), true);
  });

  it('queues confirmed REVERSAL_LONG', () => {
    const long = cand('BTC', 'LONG', 64);
    long.longClass = 'REVERSAL_LONG';
    assert.equal(isOpenableLongCandidate(long), true);
    assert.equal(isScanQueueable(long, long, null), true);
  });
});
