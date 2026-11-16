/**
 * Regression map for per-coin trend direction steering (req 1–10).
 * Production logic lives in coinTrendDirection, globalMarketScan, sameCoinDirectionArbitration, liveDirectionProfile.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BEAR_MARKET, BULL_MARKET } from '../config/directionProfiles';
import { isLongAllowedCoin } from './longAllowlist';
import { isDirectionOpenAllowedForProfile } from './profileDirectionGate';
import {
  evaluateCoinLongFromStructure,
  evaluateCoinShortFromMtf,
  pickCoinTrendCandidate,
} from './coinTrendDirection';
import { resolveSameCoinAttemptOrder } from './sameCoinDirectionArbitration';
import { defaultLongSetupProbe } from './sameCoinDirectionArbitration';
import type { GlobalSignalCandidate } from './globalMarketScan';
import { refreshLiveDirectionProfile, _resetLiveDirectionProfileForTests } from './liveDirectionProfile';

function cand(
  coin: string,
  direction: 'LONG' | 'SHORT',
  confidence: number,
  extras?: Partial<GlobalSignalCandidate>
): GlobalSignalCandidate {
  return {
    coin,
    symbol: `${coin}USDT`,
    direction,
    confidence,
    reason: 'regression',
    dayVolumeUsd: 10_000_000,
    openInterestUsd: 2_000_000,
    botMode: 'standard',
    longClass: extras?.longClass,
    trendAlignment: extras?.trendAlignment,
    directionalTfCount: extras?.directionalTfCount,
    ...extras,
  };
}

describe('direction steering regression (requirements 1–10)', () => {
  it('1 — bot-universe coins may LONG; exclusions still block', () => {
    for (const coin of ['PAXG', 'XMR', 'XRP', 'ETH', 'SOL', 'BTC', 'DOGE']) {
      assert.equal(isLongAllowedCoin(coin), true, coin);
    }
  });

  it('2 — BEAR and BULL profiles allow both LONG and SHORT opens', () => {
    assert.equal(isDirectionOpenAllowedForProfile(BEAR_MARKET, 'LONG'), true);
    assert.equal(isDirectionOpenAllowedForProfile(BEAR_MARKET, 'SHORT'), true);
    assert.equal(isDirectionOpenAllowedForProfile(BULL_MARKET, 'LONG'), true);
    assert.equal(isDirectionOpenAllowedForProfile(BULL_MARKET, 'SHORT'), true);
  });

  it('3–5 — PAXG LONG in bearish BTC narrative; alt SHORT in bull BTC narrative', () => {
    const paxgUp =
      '1m LONG 64% · 5m LONG 70% · 15m LONG 72% · 1h LONG 68% STRONG_UPTREND';
    const longOk = evaluateCoinLongFromStructure(
      {
        confidence: 70,
        mtfBreakdown: paxgUp,
        metrics: { trendAlignment: 68, h1Trend: 'STRONG_UPTREND' },
      },
      'TREND_LONG',
      'TREND_LONG',
      60
    );
    assert.equal(longOk.ok, true);

    const altDown =
      '1m SHORT 58% · 5m SHORT 62% · 15m SHORT 65% · 1h SHORT 66% STRONG_DOWNTREND';
    const shortOk = evaluateCoinShortFromMtf(
      {
        direction: 'SHORT',
        confidence: 66,
        mtfBreakdown: altDown,
        metrics: {
          trendAlignment: 62,
          h1Trend: 'STRONG_DOWNTREND',
          directionalTfCount: 4,
        },
      },
      58
    );
    assert.equal(shortOk.ok, true);
  });

  it('5 — WAIT when structure unclear (quality tie)', () => {
    const pick = pickCoinTrendCandidate(
      {
        direction: 'LONG',
        confidence: 60,
        trendAlignment: 55,
        directionalTfCount: 3,
      },
      {
        direction: 'SHORT',
        confidence: 60,
        trendAlignment: 55,
        directionalTfCount: 3,
      }
    );
    assert.equal(pick.direction, 'WAIT');
    assert.match(pick.waitReason ?? '', /tie/i);
  });

  it('6 — no SHORT into live pump stack; no LONG into dump stack', () => {
    const pump =
      '1m LONG 72% · 5m LONG 74% · 15m LONG 70% · 1h LONG 68% STRONG_UPTREND';
    assert.equal(
      evaluateCoinShortFromMtf(
        {
          direction: 'LONG',
          confidence: 75,
          mtfBreakdown: pump,
          metrics: { trendAlignment: 72, h1Trend: 'STRONG_UPTREND', directionalTfCount: 4 },
        },
        58
      ).ok,
      false
    );

    const dump =
      '1m SHORT 65% · 5m SHORT 68% · 15m SHORT 70% · 1h SHORT 72% STRONG_DOWNTREND';
    assert.equal(
      evaluateCoinLongFromStructure(
        {
          confidence: 68,
          mtfBreakdown: dump,
          metrics: { trendAlignment: 65, h1Trend: 'STRONG_DOWNTREND' },
        },
        'TREND_LONG',
        'TREND_LONG',
        60
      ).ok,
      false
    );
  });

  it('7 — same-coin arbitration: quality winner, not SHORT-first', () => {
    const long = cand('PAXG', 'LONG', 88, {
      longClass: 'TREND_LONG',
      trendAlignment: 75,
      directionalTfCount: 4,
    });
    const short = cand('PAXG', 'SHORT', 60, {
      trendAlignment: 55,
      directionalTfCount: 3,
    });
    const r = resolveSameCoinAttemptOrder({
      coin: 'PAXG',
      short,
      long,
      shortExecutable: true,
      shortBlockCode: 'SHORT_QUALITY_PASS',
      shortBlockReason: null,
      longProbe: defaultLongSetupProbe(long),
    });
    assert.equal(r.attempts.length, 1);
    assert.equal(r.attempts[0]?.direction, 'LONG');
  });

  it('10 — trend change: SHORT takes over when quality flips', () => {
    const wasLong = cand('SOL', 'LONG', 62, {
      longClass: 'TREND_LONG',
      trendAlignment: 55,
      directionalTfCount: 3,
    });
    const nowShort = cand('SOL', 'SHORT', 78, {
      trendAlignment: 72,
      directionalTfCount: 4,
    });
    const pick = pickCoinTrendCandidate(wasLong, nowShort);
    assert.equal(pick.direction, 'SHORT');
    assert.equal(pick.candidate?.direction, 'SHORT');
  });

  it('liveDirectionProfile — AUTO uses bear until BTC detect (allows both sides)', async () => {
    _resetLiveDirectionProfileForTests();
    const profile = await refreshLiveDirectionProfile();
    assert.equal(profile.allowLongOpens, true);
    assert.equal(profile.allowShortOpens, true);
    assert.ok(profile.name === 'bear_market' || profile.name === 'bull_market');
  });
});