import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { config } from '../config';
import { evaluateEntryLocation, type SrZoneAnalysis } from './entryLocationGate';
import { scoreEntryLocationQuality } from './entryLocationQuality';
import { evaluatePreOpenCandleWindow } from './preOpenCandleAnalytics';
import { isConfirmedShortBreakdown } from './shortBreakdownConfirm';
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
  const high = open + 0.05;
  const low = close - 0.05;
  return candle(i, open, high, low, close, volume);
}

function flat(i: number, px: number, drift = 0, volume = 10): Candle {
  const open = px;
  const close = px + drift;
  return candle(i, open, Math.max(open, close) + 0.04, Math.min(open, close) - 0.04, close, volume);
}

/** 20 closed 1m dump then a 5-bar pause at the lows + forming bar. */
function breakdownThen1mPause(): Candle[] {
  const out: Candle[] = [];
  let px = 100;
  for (let i = 0; i < 14; i += 1) {
    const close = px - 0.5;
    out.push(red(i, px, close));
    px = close;
  }
  // closed pause around 93 — last-5 net ≈ 0, still at range lows
  const pause = [93.0, 93.04, 93.01, 93.06, 93.03, 93.05];
  for (let j = 0; j < pause.length; j += 1) {
    out.push(flat(14 + j, pause[j]!, j === pause.length - 1 ? 0.01 : 0));
  }
  return out;
}

/** 1m bouncing on a floor — last 5 green, still at range lows. */
function unconfirmedFloor1m(): Candle[] {
  const out: Candle[] = [];
  let px = 100;
  for (let i = 0; i < 12; i += 1) {
    const close = px - 0.35;
    out.push(red(i, px, close));
    px = close;
  }
  // hammers / reclaim at ~95.8
  for (let j = 0; j < 8; j += 1) {
    const open = 95.7;
    const close = 95.85 + j * 0.03;
    out.push(candle(12 + j, open, close + 0.08, 95.55, close, 10));
  }
  out.push(flat(20, 96.1));
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
  // last bars held below ~96 prior swing
  out.push(red(10, px, 94.2, 20));
  out.push(red(11, 94.2, 93.8, 20));
  out.push(red(12, 93.8, 93.4, 20));
  out.push(flat(13, 93.5)); // forming
  return out;
}

function dump5mThroughSupport(): Candle[] {
  const out: Candle[] = [];
  let px = 101;
  for (let i = 0; i < 16; i += 1) {
    const close = px - (i < 10 ? 0.15 : 0.45);
    out.push(red(i, px, close, 12));
    px = close;
  }
  out.push(red(16, px, 93.6, 12));
  out.push(red(17, 93.6, 93.3, 12));
  out.push(flat(18, 93.35));
  return out;
}

function range15mAboveSupport(): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < 16; i += 1) {
    const open = 96.2 + (i % 3) * 0.15;
    const close = 96.4 + ((i + 1) % 3) * 0.1;
    out.push(candle(i, open, Math.max(open, close) + 0.2, 95.9, close, 8));
  }
  out.push(flat(16, 96.5));
  return out;
}

const floorSr = (over: Partial<SrZoneAnalysis> = {}): SrZoneAnalysis => ({
  support: 96,
  resistance: 110,
  price: 93.2,
  pricePosition: 0.08,
  resistanceTouches: 1,
  resistanceRejections: 0,
  supportTouches: 3,
  supportRejections: 2,
  confirmedBreakoutUp: false,
  confirmedBreakdown: false,
  dumpContinuation: false,
  nearResistance: false,
  nearSupport: true,
  ...over,
});

describe('P1 SHORT breakdown vs 1m range-low', () => {
  it('1m pause at lows after a dump is PRE_OPEN_SHORTING_LOWS without breakdown confirm', () => {
    const window = breakdownThen1mPause();
    const result = evaluatePreOpenCandleWindow({
      coin: 'ETH',
      direction: 'SHORT',
      candles: window,
      shortBreakdownConfirmed: false,
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'PRE_OPEN_SHORTING_LOWS');
    assert.ok(result.rangePosition <= 0.2, `range pos ${result.rangePosition}`);
    assert.ok(result.recentMovePct > -0.06, `recent5 ${result.recentMovePct}`);
  });

  it('same 1m pause PASSES pre-open when 5m/15m breakdown is confirmed', () => {
    const window = breakdownThen1mPause();
    assert.equal(
      isConfirmedShortBreakdown({
        candles5m: dump5mThroughSupport(),
        candles15m: dump15mThroughSupport(),
      }),
      true
    );
    const result = evaluatePreOpenCandleWindow({
      coin: 'ETH',
      direction: 'SHORT',
      candles: window,
      shortBreakdownConfirmed: true,
    });
    assert.equal(result.ok, true, result.reason);
    assert.equal(result.code, 'PRE_OPEN_PASS');
  });

  it('entry_location and HTF quality allow the confirmed breakdown', () => {
    const loc = evaluateEntryLocation(
      'SHORT',
      floorSr({ confirmedBreakdown: true, dumpContinuation: false })
    );
    assert.equal(loc.ok, true);
    assert.equal(loc.code, 'LOCATION_BREAKDOWN');

    const quality = scoreEntryLocationQuality({
      coin: 'ETH',
      side: 'SHORT',
      price: 93.2,
      candles5m: dump5mThroughSupport(),
      candles15m: dump15mThroughSupport(),
      candles1h: dump15mThroughSupport(),
      candles4h: dump15mThroughSupport(),
      sr: floorSr({ confirmedBreakdown: true }),
    });
    assert.equal(quality.deterministicLocationDecision, 'ALLOW');
  });

  it('dump continuation at support is a location PASS (same confirm as HTF quality)', () => {
    const loc = evaluateEntryLocation(
      'SHORT',
      floorSr({ confirmedBreakdown: false, dumpContinuation: true })
    );
    assert.equal(loc.ok, true);
    assert.equal(loc.code, 'LOCATION_DUMP_CONTINUATION');
  });

  it('unconfirmed floor bounce stays blocked on pre-open AND location', () => {
    const pre = evaluatePreOpenCandleWindow({
      coin: 'ETH',
      direction: 'SHORT',
      candles: unconfirmedFloor1m(),
      shortBreakdownConfirmed: false,
    });
    assert.equal(pre.ok, false);
    assert.ok(
      pre.code === 'PRE_OPEN_SHORTING_LOWS' ||
        pre.code === 'PRE_OPEN_LOW_REJECTIONS' ||
        pre.code === 'PRE_OPEN_BULLISH_TAPE' ||
        pre.code === 'PRE_OPEN_STRUCTURE_UP',
      pre.code
    );

    assert.equal(
      isConfirmedShortBreakdown({
        candles5m: range15mAboveSupport(),
        candles15m: range15mAboveSupport(),
      }),
      false
    );

    const loc = evaluateEntryLocation(
      'SHORT',
      floorSr({
        confirmedBreakdown: false,
        dumpContinuation: false,
        price: 96.1,
        pricePosition: 0.12,
        nearSupport: true,
        supportRejections: 2,
      })
    );
    assert.equal(loc.ok, false);
    assert.equal(loc.code, 'LOCATION_SUPPORT');
  });

  it('confirmed-breakdown flag does not waive a bullish 1m tape', () => {
    const reclaim: Candle[] = [];
    let px = 96;
    for (let i = 0; i < 6; i += 1) {
      reclaim.push(red(i, px, px - 0.08));
      px -= 0.08;
    }
    for (let i = 6; i < 21; i += 1) {
      const close = px + 0.12;
      reclaim.push(candle(i, px, close + 0.04, px - 0.02, close));
      px = close;
    }
    const result = evaluatePreOpenCandleWindow({
      coin: 'ETH',
      direction: 'SHORT',
      candles: reclaim,
      shortBreakdownConfirmed: true,
    });
    assert.equal(result.ok, false, result.reason);
    assert.ok(
      result.code === 'PRE_OPEN_BULLISH_TAPE' || result.code === 'PRE_OPEN_STRUCTURE_UP',
      result.code
    );
  });
});

describe('P2 momentum overlap (document only — no threshold change)', () => {
  it('pump-short 15m fade is looser than entry-momentum 15m', () => {
    assert.ok(config.hyperliquid.pumpShort.min15mRolloverPct < config.hyperliquid.entryMomentum.minMove15mPct);
    assert.equal(config.hyperliquid.scalpOpen.minConfirm1mCandles, 1);
    assert.equal(config.hyperliquid.entryMomentum.minConfirmCandles5m, 2);
  });
});
