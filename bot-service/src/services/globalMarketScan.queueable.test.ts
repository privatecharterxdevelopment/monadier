import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
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

  it('does not queue a lone display LONG under 75%', () => {
    const long = cand('BTC', 'LONG', 64);
    assert.equal(isScanQueueable(long, long, null), false);
  });

  it('queues a strong lone LONG with 1h UP', () => {
    const long = cand('BTC', 'LONG', 81, 'UP');
    assert.equal(isScanQueueable(long, long, null), true);
  });

  it('queues a LONG that beat a real SHORT', () => {
    const long = cand('ETH', 'LONG', 88);
    const short = cand('ETH', 'SHORT', 60);
    assert.equal(isScanQueueable(long, long, short), true);
  });
});
