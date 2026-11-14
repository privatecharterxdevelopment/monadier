import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { trailStopForOpenPosition } from './hlTrailingStopChart';

describe('trailStopForOpenPosition verification', () => {
  it('shows VERIFIED only when profitSlConfirmed', () => {
    const sl = trailStopForOpenPosition({
      entryPx: 1921,
      szi: -0.38,
      markPx: 1923.8,
      unrealizedPnlUsd: -1,
      leverage: 25,
      coin: 'ETH',
      serverTrail: {
        peakPnlUsd: 0,
        lockPnlUsd: 0,
        lockRoePct: 0,
        stopPx: 1920.27,
        profitSlPx: 1920.27,
        profitSlConfirmed: true,
        profitSlStatus: 'PROFIT_SL_CONFIRMED',
        emergencySlConfirmed: false,
      },
    });
    assert.equal(sl.verification, 'verified');
    assert.match(sl.sublabel ?? '', /VERIFIED/);
  });

  it('shows UNVERIFIED for memory-only profit px', () => {
    const sl = trailStopForOpenPosition({
      entryPx: 1921,
      szi: -0.38,
      markPx: 1923.8,
      unrealizedPnlUsd: -1,
      leverage: 25,
      coin: 'ETH',
      serverTrail: {
        peakPnlUsd: 0,
        lockPnlUsd: 0,
        lockRoePct: 0,
        stopPx: null,
        profitSlPx: 1920.27,
        profitSlConfirmed: false,
        profitSlStatus: 'PROFIT_SL_UNVERIFIED',
        emergencySlConfirmed: false,
      },
    });
    assert.equal(sl.verification, 'unverified');
    assert.match(sl.sublabel ?? '', /UNVERIFIED/);
  });

  it('shows Let run instead of profit-SL pending when hold is on', () => {
    const sl = trailStopForOpenPosition({
      entryPx: 65132,
      szi: -0.02167,
      markPx: 65000,
      unrealizedPnlUsd: 2.5,
      leverage: 10,
      coin: 'BTC',
      letRunHold: true,
      serverTrail: {
        peakPnlUsd: 3,
        lockPnlUsd: 0,
        lockRoePct: 0,
        stopPx: null,
        profitSlConfirmed: false,
        profitSlStatus: 'PROFIT_SL_PENDING',
        emergencySlConfirmed: false,
      },
    });
    assert.equal(sl.label, 'Let run');
    assert.doesNotMatch(sl.sublabel ?? '', /PENDING/);
  });

  it('marks stale when dataStale', () => {
    const sl = trailStopForOpenPosition({
      entryPx: 100,
      szi: -1,
      markPx: 101,
      unrealizedPnlUsd: -1,
      leverage: 10,
      coin: 'BTC',
      dataStale: true,
      serverTrail: {
        peakPnlUsd: 0,
        lockPnlUsd: 0,
        lockRoePct: 0,
        stopPx: 99,
        profitSlPx: 99,
        profitSlConfirmed: true,
        profitSlStatus: 'PROFIT_SL_CONFIRMED',
        emergencySlConfirmed: false,
      },
    });
    assert.equal(sl.verification, 'stale');
  });
});
