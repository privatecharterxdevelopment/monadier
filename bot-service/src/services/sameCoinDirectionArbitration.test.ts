import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  defaultLongSetupProbe,
  openSlotsRemaining,
  resolveSameCoinAttemptOrder,
  type SameCoinArbitrationInput,
} from './sameCoinDirectionArbitration';
import { isScanQueueable, type GlobalSignalCandidate } from './globalMarketScan';
import { config } from '../config';

function cand(
  coin: string,
  direction: 'LONG' | 'SHORT',
  confidence: number,
  longClass?: GlobalSignalCandidate['longClass']
): GlobalSignalCandidate {
  return {
    coin,
    symbol: `${coin}USDT`,
    direction,
    confidence,
    reason: 'test',
    dayVolumeUsd: 20_000_000,
    openInterestUsd: 5_000_000,
    botMode: 'standard',
    longClass,
  };
}

function arb(partial: Partial<SameCoinArbitrationInput> & { coin: string }): SameCoinArbitrationInput {
  return {
    coin: partial.coin,
    short: partial.short ?? null,
    long: partial.long ?? null,
    shortExecutable: partial.shortExecutable ?? false,
    shortBlockCode: partial.shortBlockCode ?? null,
    shortBlockReason: partial.shortBlockReason ?? null,
    longProbe:
      partial.longProbe ??
      (partial.long
        ? defaultLongSetupProbe(partial.long)
        : { executable: false, code: 'LONG_CLASS', reason: 'no long' }),
  };
}

describe('isScanQueueable — no unconditional SHORT over TREND_LONG', () => {
  it('keeps TREND_LONG visible when MTF also has SHORT on same coin', () => {
    const short = cand('ETH', 'SHORT', 88);
    const long = cand('ETH', 'LONG', 72, 'TREND_LONG');
    assert.equal(isScanQueueable(short, short, short), true);
    assert.equal(isScanQueueable(long, short, short), true);
  });

  it('still hides non-openable LONG', () => {
    const long = cand('ETH', 'LONG', 70, 'NONE');
    assert.equal(isScanQueueable(long, null, null), false);
  });

  it('keeps REVERSAL_LONG queueable with competing SHORT', () => {
    const long = cand('BTC', 'LONG', 61, 'REVERSAL_LONG');
    const short = cand('BTC', 'SHORT', 90);
    assert.equal(isScanQueueable(long, short, short), true);
  });
});

describe('resolveSameCoinAttemptOrder', () => {
  const long = cand('ETH', 'LONG', 80, 'TREND_LONG');
  const short = cand('ETH', 'SHORT', 85);

  it('bad SHORT + valid TREND_LONG → LONG is attempted', () => {
    const r = resolveSameCoinAttemptOrder(
      arb({
        coin: 'ETH',
        short,
        long,
        shortExecutable: false,
        shortBlockCode: 'SHORT_SUPPORT_PROXIMITY',
        shortBlockReason: 'too close to support',
      })
    );
    assert.equal(r.attempts.length, 1);
    assert.equal(r.attempts[0]?.direction, 'LONG');
    assert.equal(r.longDisposition, null);
  });

  it('valid SHORT + invalid LONG → SHORT only', () => {
    const weakLong = cand('ETH', 'LONG', 20, 'TREND_LONG');
    const r = resolveSameCoinAttemptOrder(
      arb({
        coin: 'ETH',
        short,
        long: weakLong,
        shortExecutable: true,
        longProbe: defaultLongSetupProbe(weakLong),
      })
    );
    assert.equal(r.attempts.length, 1);
    assert.equal(r.attempts[0]?.direction, 'SHORT');
  });

  it('both invalid → no order', () => {
    const weakLong = cand('ETH', 'LONG', 10, 'NONE');
    const r = resolveSameCoinAttemptOrder(
      arb({
        coin: 'ETH',
        short,
        long: weakLong,
        shortExecutable: false,
        shortBlockCode: 'SHORT_EXTENDED_DUMP',
        longProbe: defaultLongSetupProbe(weakLong),
      })
    );
    assert.equal(r.attempts.length, 0);
    assert.ok(r.longDisposition?.code === 'LONG_CLASS');
  });

  it('both valid → SHORT first, LONG fallback, never parallel', () => {
    const r = resolveSameCoinAttemptOrder(
      arb({
        coin: 'ETH',
        short,
        long,
        shortExecutable: true,
        shortBlockCode: 'SHORT_QUALITY_PASS',
      })
    );
    assert.equal(r.attempts.length, 2);
    assert.equal(r.attempts[0]?.direction, 'SHORT');
    assert.equal(r.attempts[1]?.direction, 'LONG');
    assert.equal(r.attempts[0]?.coin, r.attempts[1]?.coin);
    assert.equal(r.longDisposition?.code, 'QUEUE_SUPPRESSED');
  });
});

describe('open slots', () => {
  it('two slots full → no remaining slots', () => {
    const max = config.hyperliquid.maxConcurrentPositions;
    assert.equal(openSlotsRemaining(max, max), 0);
    assert.equal(openSlotsRemaining(max + 1, max), 0);
    assert.equal(openSlotsRemaining(0, max), max);
  });
});