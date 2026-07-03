import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeTradeTrend } from './trendOnly';

describe('computeTradeTrend', () => {
  it('keeps UP when 1h is UP even if lower TFs vote SHORT', () => {
    assert.equal(
      computeTradeTrend({
        h1Trend: 'UP',
        m15Trend: 'DOWN',
        shortTfVotes: 3,
        longTfVotes: 1,
        change1hPct: 0.8,
        change15mPct: -0.1,
      }),
      'UP'
    );
  });

  it('does not call a pump DOWN on a 15m dip while 1h price is still rising', () => {
    assert.equal(
      computeTradeTrend({
        h1Trend: 'SIDEWAYS',
        m15Trend: 'DOWN',
        shortTfVotes: 3,
        longTfVotes: 1,
        change1hPct: 0.45,
        change15mPct: -0.05,
      }),
      'UP'
    );
  });

  it('allows DOWN only when 1h drift confirms weakness', () => {
    assert.equal(
      computeTradeTrend({
        h1Trend: 'SIDEWAYS',
        m15Trend: 'DOWN',
        shortTfVotes: 3,
        longTfVotes: 0,
        change1hPct: -0.2,
        change15mPct: -0.12,
      }),
      'DOWN'
    );
  });
});
