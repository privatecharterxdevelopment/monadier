import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Candle } from './signalEngine';
import { scoreEntryLocationQuality } from './entryLocationQuality';
import type { SrZoneAnalysis } from './entryLocationGate';

function candle(
  i: number,
  open: number,
  high: number,
  low: number,
  close: number
): Candle {
  return { time: i * 60_000, open, high, low, close, volume: 1 };
}

function series(n: number, start: number, step: number): Candle[] {
  const out: Candle[] = [];
  let px = start;
  for (let i = 0; i < n; i += 1) {
    const open = px;
    const close = px + step;
    const high = Math.max(open, close) + 0.2;
    const low = Math.min(open, close) - 0.15;
    out.push(candle(i, open, high, low, close));
    px = close;
  }
  return out;
}

const floorSr = (over: Partial<SrZoneAnalysis> = {}): SrZoneAnalysis => ({
  support: 94,
  resistance: 110,
  price: 93.2,
  pricePosition: 0.08,
  resistanceTouches: 1,
  resistanceRejections: 0,
  supportTouches: 3,
  supportRejections: 1,
  confirmedBreakoutUp: false,
  confirmedBreakdown: false,
  dumpContinuation: false,
  nearResistance: false,
  nearSupport: true,
  ...over,
});

describe('scoreEntryLocationQuality SHORT', () => {
  it('allows dump continuation at range lows (not a support bounce)', () => {
    const candles15m = series(12, 102, -0.7);
    const candles5m = series(10, 96, -0.25);
    const candles1h = series(30, 108, -0.4);
    const candles4h = series(20, 112, -0.5);
    const record = scoreEntryLocationQuality({
      coin: 'ETH',
      side: 'SHORT',
      price: candles15m[candles15m.length - 2]!.close,
      candles5m,
      candles15m,
      candles1h,
      candles4h,
      sr: floorSr({ dumpContinuation: true, confirmedBreakdown: false }),
    });
    assert.equal(record.deterministicLocationDecision, 'ALLOW');
  });

  it('allows confirmed breakdown through prior support', () => {
    const candles15m = series(12, 102, -0.7);
    const record = scoreEntryLocationQuality({
      coin: 'ETH',
      side: 'SHORT',
      price: 93,
      candles5m: series(10, 96, -0.25),
      candles15m,
      candles1h: series(30, 108, -0.4),
      candles4h: series(20, 112, -0.5),
      sr: floorSr({ confirmedBreakdown: true, dumpContinuation: false }),
    });
    assert.equal(record.deterministicLocationDecision, 'ALLOW');
  });

  it('allows a dump at range lows when floor filter is off', () => {
    const candles15m = series(12, 102, -0.7);
    const record = scoreEntryLocationQuality({
      coin: 'ETH',
      side: 'SHORT',
      price: 93,
      candles5m: series(10, 96, -0.25),
      candles15m,
      candles1h: series(30, 108, -0.4),
      candles4h: series(20, 112, -0.5),
      sr: floorSr({ confirmedBreakdown: false, dumpContinuation: false, nearSupport: true }),
    });
    assert.equal(record.deterministicLocationDecision, 'ALLOW');
  });

  it('does not treat a dump hammer as a SHORT bounce block', () => {
    const dump = series(10, 102, -0.8);
    const hammer = candle(10, 94.0, 95.2, 90.0, 94.9);
    const forming = candle(11, 94.9, 95.1, 94.6, 94.8);
    const candles15m = [...dump, hammer, forming];
    const record = scoreEntryLocationQuality({
      coin: 'ETH',
      side: 'SHORT',
      price: 94.8,
      candles5m: [...series(8, 96, -0.2), candle(8, 93.5, 95.0, 90.2, 94.6), forming],
      candles15m,
      candles1h: series(30, 108, -0.35),
      candles4h: series(20, 112, -0.4),
      sr: floorSr({ confirmedBreakdown: false, dumpContinuation: false }),
    });
    assert.equal(record.deterministicLocationDecision, 'ALLOW');
    assert.equal(record.blockedBy.includes('LOWER_WICK_REJECTION'), false);
  });
});
