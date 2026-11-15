import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  directionalTfCountForSide,
  evaluateCoinLongFromStructure,
  evaluateCoinShortFromMtf,
  pickCoinTrendCandidate,
  parseMtfBreakdown,
} from './coinTrendDirection';

const PAXG_UP =
  '1m LONG 62% · 5m LONG 68% · 15m LONG 70% · 1h LONG 65% STRONG_UPTREND';
const PAXG_DOWN =
  '1m SHORT 60% · 5m SHORT 65% · 15m SHORT 72% · 1h SHORT 68% STRONG_DOWNTREND';
const ALT_DOWN_BTC_UP =
  '1m SHORT 58% · 5m SHORT 62% · 15m SHORT 64% · 1h SHORT 66% STRONG_DOWNTREND';

describe('coin-trend direction (independent of BTC regime)', () => {
  it('PAXG uptrend breakdown — LONG structure path when TREND_LONG', () => {
    assert.equal(directionalTfCountForSide(PAXG_UP, 'LONG'), 4);
    const r = evaluateCoinLongFromStructure(
      {
        confidence: 72,
        mtfBreakdown: PAXG_UP,
        metrics: { trendAlignment: 70, h1Trend: 'STRONG_UPTREND' },
      },
      'TREND_LONG',
      'TREND_LONG — test',
      62
    );
    assert.equal(r.ok, true);
  });

  it('PAXG uptrend — no SHORT when 1h UP and LONG TFs dominate', () => {
    const r = evaluateCoinShortFromMtf(
      {
        direction: 'LONG',
        confidence: 72,
        mtfBreakdown: PAXG_UP,
        metrics: { trendAlignment: 70, h1Trend: 'STRONG_UPTREND', directionalTfCount: 4 },
      },
      58
    );
    assert.equal(r.ok, false);
    assert.match(r.reason, /1h.*not UP|LONG TFs dominate/i);
  });

  it('PAXG downtrend — SHORT when bearish stack meets bars', () => {
    const r = evaluateCoinShortFromMtf(
      {
        direction: 'SHORT',
        confidence: 72,
        mtfBreakdown: PAXG_DOWN,
        metrics: { trendAlignment: 62, h1Trend: 'STRONG_DOWNTREND', directionalTfCount: 4 },
      },
      58
    );
    assert.equal(r.ok, true);
  });

  it('alt SHORT in downtrend while narrative is “BTC bull” — coin MTF only', () => {
    const r = evaluateCoinShortFromMtf(
      {
        direction: 'SHORT',
        confidence: 66,
        mtfBreakdown: ALT_DOWN_BTC_UP,
        metrics: { trendAlignment: 60, h1Trend: 'STRONG_DOWNTREND', directionalTfCount: 4 },
      },
      58
    );
    assert.equal(r.ok, true);
  });

  it('WAIT on MTF tie', () => {
    const tie =
      '1m LONG 55% · 5m SHORT 55% · 15m LONG 58% · 15m SHORT 58% · 1h HOLD 50%';
    assert.ok(parseMtfBreakdown(tie).length >= 3);
    const r = evaluateCoinShortFromMtf(
      {
        direction: 'HOLD',
        confidence: 55,
        mtfBreakdown: '1m LONG 55% · 5m LONG 58% · 15m SHORT 55% · 1h SHORT 58%',
        metrics: { trendAlignment: 52, h1Trend: 'NEUTRAL', directionalTfCount: 2 },
      },
      58
    );
    assert.equal(r.ok, false);
  });

  it('pickCoinTrendCandidate — quality winner, no dual queue', () => {
    const long = {
      coin: 'PAXG',
      direction: 'LONG' as const,
      confidence: 72,
      trendAlignment: 70,
      directionalTfCount: 4,
    };
    const short = {
      coin: 'PAXG',
      direction: 'SHORT' as const,
      confidence: 58,
      trendAlignment: 55,
      directionalTfCount: 3,
    };
    const pick = pickCoinTrendCandidate(long, short);
    assert.equal(pick.direction, 'LONG');
    assert.equal(pick.candidate?.direction, 'LONG');
  });

  it('pickCoinTrendCandidate — WAIT on quality tie', () => {
    const long = {
      direction: 'LONG' as const,
      confidence: 70,
      trendAlignment: 60,
      directionalTfCount: 3,
    };
    const short = {
      direction: 'SHORT' as const,
      confidence: 70,
      trendAlignment: 60,
      directionalTfCount: 3,
    };
    const pick = pickCoinTrendCandidate(long, short);
    assert.equal(pick.direction, 'WAIT');
  });

  it('pump-like stack blocks SHORT when 1h still UP', () => {
    const pump =
      '1m LONG 70% · 5m LONG 72% · 15m LONG 68% · 1h LONG 66% STRONG_UPTREND';
    const r = evaluateCoinShortFromMtf(
      {
        direction: 'LONG',
        confidence: 80,
        mtfBreakdown: pump,
        metrics: { trendAlignment: 75, h1Trend: 'STRONG_UPTREND', directionalTfCount: 4 },
      },
      58
    );
    assert.equal(r.ok, false);
  });

  it('dump-like stack blocks LONG classification path', () => {
    const r = evaluateCoinLongFromStructure(
      {
        confidence: 70,
        mtfBreakdown: PAXG_DOWN,
        metrics: { trendAlignment: 65, h1Trend: 'STRONG_DOWNTREND' },
      },
      'TREND_LONG',
      'TREND_LONG — test',
      62
    );
    assert.equal(r.ok, false);
    assert.match(r.reason, /1h DOWN|SHORT TFs/);
  });
});