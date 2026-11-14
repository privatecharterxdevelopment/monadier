/**
 * Regression: bad SHORT at support vs valid breakdown; LONG scalp vs scan MTF.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BEAR_MARKET } from '../config/profiles/bearMarketShort';
import { evaluatePreOpenCandleWindow } from './preOpenCandleAnalytics';
import { isConfirmedShortBreakdown } from './shortBreakdownConfirm';
import { scoreEntryLocationQuality } from './entryLocationQuality';
import { scoreShortEntryQuality } from './shortEntryQuality';
import { evaluateEntryLocation } from './entryLocationGate';
import type { Candle } from './signalEngine';

function candle(
  i: number,
  open: number,
  high: number,
  low: number,
  close: number,
  volume = 10
): Candle {
  return { time: i * 60_000, open, high, low, close, volume };
}

function red(i: number, open: number, close: number, volume = 10): Candle {
  return candle(i, open, open + 0.05, close - 0.05, close, volume);
}

/** Red spike then hammer pause at lows — USELESS/WLFI-style. */
function spikeThenHammerPause1m(): Candle[] {
  const out: Candle[] = [];
  let px = 0.05;
  for (let i = 0; i < 14; i += 1) {
    const close = px - 0.002;
    out.push(red(i, px, close));
    px = close;
  }
  for (let j = 0; j < 6; j += 1) {
    out.push(candle(14 + j, px, px + 0.0008, px - 0.0004, px + 0.0003, 8));
  }
  return out;
}

function range15mAboveSupport(): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < 14; i += 1) {
    out.push(candle(i, 96, 97, 95.5, 96.2, 10));
  }
  out.push(flat(14, 96.1));
  return out;
}

function dump15mThroughSupport(): Candle[] {
  const out: Candle[] = [];
  let px = 102;
  for (let i = 0; i < 10; i += 1) {
    const close = i < 6 ? px - 0.2 : px - 0.8;
    out.push(red(i, px, close, 20));
    px = close;
  }
  out.push(red(10, px, 94.2, 20));
  out.push(red(11, 94.2, 93.8, 20));
  out.push(red(12, 93.8, 93.4, 20));
  out.push(flat(13, 93.5));
  return out;
}

function flat(i: number, px: number): Candle {
  return candle(i, px, px + 0.04, px - 0.04, px, 10);
}

describe('entry engine regression (2026-11-13)', () => {
  it('bear profile never bypasses scalp align at open', () => {
    assert.equal(BEAR_MARKET.short.bypassScalpAlignWhenTrusted, false);
    assert.equal(BEAR_MARKET.short.bypassPreOpenWhenTrusted, false);
  });

  it('blocks SHORT pre-open at lows after red spike + pause (no continued dump)', () => {
    const window = spikeThenHammerPause1m();
    const confirmed = isConfirmedShortBreakdown({
      candles5m: range15mAboveSupport(),
      candles15m: range15mAboveSupport(),
    });
    assert.equal(confirmed, false);
    const result = evaluatePreOpenCandleWindow({
      coin: 'WLFI',
      direction: 'SHORT',
      candles: window,
      shortBreakdownConfirmed: confirmed,
    });
    assert.equal(result.ok, false);
    assert.ok(
      result.code === 'PRE_OPEN_SHORTING_LOWS' ||
        result.code === 'PRE_OPEN_LOW_REJECTIONS' ||
        result.code === 'PRE_OPEN_BULLISH_TAPE'
    );
  });

  it('HTF quality blocks SHORT into support without breakdown', () => {
    const flat = range15mAboveSupport();
    const quality = scoreEntryLocationQuality({
      coin: 'USELESS',
      side: 'SHORT',
      price: 96.05,
      candles5m: flat,
      candles15m: flat,
      candles1h: flat,
      candles4h: flat,
      sr: {
        support: 95.9,
        resistance: 97.5,
        price: 96.05,
        pricePosition: 0.1,
        resistanceTouches: 0,
        resistanceRejections: 0,
        recentResistanceRejections: 0,
        supportTouches: 12,
        supportRejections: 3,
        confirmedBreakoutUp: false,
        confirmedBreakdown: false,
        nearResistance: false,
        nearSupport: true,
        dumpContinuation: false,
      },
    });
    assert.equal(quality.deterministicLocationDecision, 'BLOCK');
    assert.ok(quality.blockedBy.includes('INTO_SUPPORT'));
  });

  it('final short entry quality blocks spike-then-pause at local low', () => {
    const window = spikeThenHammerPause1m();
    const flat = range15mAboveSupport();
    const c1h = flat.map((c, i) => ({ ...c, time: i * 3_600_000 }));
    const r = scoreShortEntryQuality({
      coin: 'WLFI',
      price: window[window.length - 1]!.close,
      candles1m: window,
      candles5m: flat,
      candles15m: flat,
      candles1h: c1h,
    });
    assert.equal(r.ok, false);
    assert.ok(r.code.startsWith('SHORT_'));
  });

  it('evaluateEntryLocation still blocks SHORT on held support', () => {
    const loc = evaluateEntryLocation('SHORT', {
      support: 0.046,
      resistance: 0.048,
      price: 0.0462,
      pricePosition: 0.08,
      resistanceTouches: 0,
      resistanceRejections: 0,
      recentResistanceRejections: 0,
      supportTouches: 20,
      supportRejections: 4,
      confirmedBreakoutUp: false,
      confirmedBreakdown: false,
      nearResistance: false,
      nearSupport: true,
      dumpContinuation: false,
    });
    assert.equal(loc.ok, false);
    assert.equal(loc.code, 'LOCATION_SUPPORT');
  });
});
