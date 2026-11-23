/**
 * July 2026 engine (89ab24f, 14.07.) — restored entry thresholds + risk floor.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { config } from '../config';
import { isOpenableLongCandidate, counterTrendBlocked } from './globalMarketScan';
import { resolveOpenStopLossPercent } from './openStopLossScope';

const hlTradingSrc = readFileSync(new URL('./hlTrading.ts', import.meta.url), 'utf8');

describe('July 2026 engine — scan thresholds', () => {
  it('uses July entry defaults', () => {
    const hl = config.hyperliquid;
    assert.equal(hl.minSignalConfidence, 55);
    assert.equal(hl.minDirectionalTfs, 2);
    assert.equal(hl.minTrendAlignment, 50);
    assert.equal(hl.maxConcurrentPositions, 3);
    assert.equal(hl.minDayVolumeUsd, 2_500_000);
    assert.equal(hl.cautiousScan.minSignalConfidence, 74);
  });

  it('LONG and SHORT both openable per coin (no profile / class gate)', () => {
    assert.equal(isOpenableLongCandidate({ direction: 'LONG' }), true);
    assert.equal(counterTrendBlocked('LONG', 'STRONG_DOWNTREND'), true);
    assert.equal(counterTrendBlocked('SHORT', 'STRONG_UPTREND'), true);
    assert.equal(counterTrendBlocked('LONG', 'UP'), false);
    assert.equal(counterTrendBlocked('SHORT', 'DOWN'), false);
  });
});

describe('July 2026 engine — open path wiring (static)', () => {
  it('relaxes secondary gates on strong scan / conf ≥ 48 for alts, never for majors', () => {
    assert.match(hlTradingSrc, /JULY 2026 ENGINE/);
    assert.match(hlTradingSrc, /strongMtf \|\| opts\.pick\.confidence >= 48/);
  });

  it('post-July gates are not in the bot open path', () => {
    for (const gone of [
      'evaluateShortEntryQualityPreSubmit',
      'validateProfileEntryTrend',
      'validateLongDumpTapeGate',
      'orderOpenPicksWithSameCoinArbitration',
      'shouldBlockNewEntriesForAutoRegime',
      'capLeverageByEntryRange',
      'isProfileDirectionOpenAllowed',
    ]) {
      assert.equal(hlTradingSrc.includes(gone), false, gone);
    }
  });

  it('bot open still posts the exchange emergency SL (runEntryStopFailSafe)', () => {
    assert.match(hlTradingSrc, /runEntryStopFailSafe\(/);
  });
});

describe('July 2026 engine — risk settings', () => {
  it('bot SL is the user setting (no forced floor by default)', () => {
    assert.equal(resolveOpenStopLossPercent('bot', 0), 0);
    assert.equal(resolveOpenStopLossPercent('bot', 20), 20);
  });

  it('bot leverage = user setting (no cap by default)', () => {
    assert.equal(config.hyperliquid.botMaxLeverage, 0);
  });
});
