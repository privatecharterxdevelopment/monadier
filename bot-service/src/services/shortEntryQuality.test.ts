/**
 * SHORT final entry quality — bottom-chase regression + valid breakdown/retest.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { scoreShortEntryQuality } from './shortEntryQuality';
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

function red(i: number, open: number, close: number, vol = 12): Candle {
  return candle(i, open, open + 0.08, close - 0.05, close, vol);
}

function flatSeries(count: number, px: number, tfMin: number): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push(candle(i * tfMin, px, px + 0.5, px - 0.5, px + (i % 2 === 0 ? 0.05 : -0.05), 10));
  }
  return out;
}

/** Spike to lows then pause/hammers — production bottom SHORT pattern. */
function bottomPauseScenario(): {
  c1m: Candle[];
  c5m: Candle[];
  c15m: Candle[];
  c1h: Candle[];
  price: number;
} {
  const c1m: Candle[] = [];
  let px = 100;
  for (let i = 0; i < 18; i += 1) {
    const close = px - 0.35;
    c1m.push(red(i, px, close, 18));
    px = close;
  }
  for (let j = 0; j < 8; j += 1) {
    c1m.push(
      candle(18 + j, px, px + 0.25, px - 0.35, px + 0.12, 8)
    );
  }
  const price = px + 0.12;
  const c5m = flatSeries(30, 96, 5);
  for (let k = 28; k < 30; k += 1) {
    const o = c5m[k]!.open;
    c5m[k] = red(k, o, o - 0.6, 15);
  }
  const c15m = flatSeries(28, 98, 15);
  c15m[26] = red(26, 98, 96.2, 22);
  c15m[27] = candle(27, 96.2, 96.5, 95.8, 96.1, 9);
  const c1h = flatSeries(24, 102, 60);
  for (let h = 20; h < 24; h += 1) {
    const o = c1h[h]!.open;
    c1h[h] = red(h, o, o - 1.2, 14);
  }
  return { c1m, c5m, c15m, c1h, price };
}

function validBreakdownScenario(): {
  c1m: Candle[];
  c5m: Candle[];
  c15m: Candle[];
  c1h: Candle[];
  price: number;
} {
  const c15m: Candle[] = [];
  let px = 110;
  for (let i = 0; i < 10; i += 1) {
    c15m.push(candle(i, px, px + 0.4, px - 0.3, px - 0.1, 10));
    px -= 0.1;
  }
  for (let j = 10; j < 14; j += 1) {
    const close = px - 1.5;
    c15m.push(red(j, px, close, 22));
    px = close;
  }
  c15m.push(red(14, px, px - 0.8, 20));
  c15m.push(red(15, px - 0.8, px - 1.2, 18));
  const price = px - 1.2;

  const c5m: Candle[] = [];
  let p5 = 108;
  for (let i = 0; i < 20; i += 1) {
    c5m.push(candle(i, p5, p5 + 0.3, p5 - 0.2, p5 - 0.05, 11));
    p5 -= 0.05;
  }
  for (let j = 20; j < 24; j += 1) {
    const close = p5 - 0.9;
    c5m.push(red(j, p5, close, 24));
    p5 = close;
  }

  const c1m: Candle[] = [];
  let p1 = price + 0.4;
  for (let i = 0; i < 30; i += 1) {
    const close = p1 - 0.08;
    c1m.push(red(i, p1, close, 12));
    p1 = close;
  }

  const c1h = flatSeries(24, 115, 60);
  for (let h = 18; h < 24; h += 1) {
    const o = c1h[h]!.open;
    c1h[h] = red(h, o, o - 2, 16);
  }

  return { c1m, c5m, c15m, c1h, price };
}

function resistanceRejectionScenario(): {
  c1m: Candle[];
  c5m: Candle[];
  c15m: Candle[];
  c1h: Candle[];
  price: number;
} {
  const c1h = flatSeries(24, 100, 60);
  for (let i = 0; i < 24; i += 1) {
    const base = 88 + (i % 5);
    c1h[i] = candle(i, base, base + 4, base - 1, base + 0.5, 12);
  }
  const c15m = flatSeries(28, 95, 15);
  for (let i = 22; i < 28; i += 1) {
    const o = 101 + (i - 22) * 0.2;
    c15m[i] = candle(i, o, o + 1.2, o - 0.3, o - 0.6, 11);
  }
  const c5m = flatSeries(30, 100, 5);
  for (let i = 26; i < 30; i += 1) {
    const o = 101.5;
    c5m[i] = candle(i, o, o + 0.9, o - 0.2, o - 0.45, 10);
  }
  const c1m = flatSeries(32, 100.8, 1);
  const price = 100.7;
  return { c1m, c5m, c15m, c1h, price };
}

describe('shortEntryQuality final gate', () => {
  it('blocks bottom pause after extended red impulse at range low', () => {
    const s = bottomPauseScenario();
    const r = scoreShortEntryQuality({
      coin: 'ETH',
      price: s.price,
      candles1m: s.c1m,
      candles5m: s.c5m,
      candles15m: s.c15m,
      candles1h: s.c1h,
    });
    if (r.ok) {
      assert.fail(`expected BLOCK at bottom pause, got PASS: ${r.reason}`);
    }
    assert.ok(
      r.code === 'SHORT_SUPPORT_PROXIMITY' ||
        r.code === 'SHORT_EXTENDED_DUMP' ||
        r.code === 'SHORT_ENTRY_TYPE_NONE' ||
        r.code === 'SHORT_REVERSAL_VETO' ||
        r.code === 'SHORT_POOR_DOWNSIDE_ROOM'
    );
    assert.equal(r.record.decision, 'BLOCK');
  });

  it('allows confirmed breakdown follow-through SHORT', () => {
    const s = validBreakdownScenario();
    const r = scoreShortEntryQuality({
      coin: 'SOL',
      price: s.price,
      candles1m: s.c1m,
      candles5m: s.c5m,
      candles15m: s.c15m,
      candles1h: s.c1h,
    });
    assert.equal(r.ok, true, r.reason);
    assert.equal(r.record.entryType, 'BREAKDOWN_FOLLOWTHROUGH');
    assert.equal(r.code, 'SHORT_QUALITY_PASS');
  });

  it('allows resistance rejection SHORT away from range low', () => {
    const s = resistanceRejectionScenario();
    const r = scoreShortEntryQuality({
      coin: 'AVAX',
      price: s.price,
      candles1m: s.c1m,
      candles5m: s.c5m,
      candles15m: s.c15m,
      candles1h: s.c1h,
    });
    assert.equal(r.ok, true, r.reason);
    assert.ok(
      r.record.entryType === 'RESISTANCE_REJECTION' ||
        r.record.entryType === 'BREAKDOWN_FOLLOWTHROUGH'
    );
  });
});