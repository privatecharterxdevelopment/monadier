import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  evaluateTrendLongScalp1m,
  evaluateTrendShortScalp1m,
  type TrendLongScalpInputs,
  type TrendShortScalpInputs,
} from './scalpAlignGate';
import type { TimeframeAnalysis, Candle } from './signalEngine';
import {
  confirmedBreakdownThroughPriorSupport,
  confirmedBreakoutThroughPriorResistance,
} from './shortDumpStructure';

function tf(
  timeframe: TimeframeAnalysis['timeframe'],
  direction: TimeframeAnalysis['direction'],
  trend: TimeframeAnalysis['trend'],
  confidence: number
): TimeframeAnalysis {
  return {
    timeframe,
    direction,
    confidence,
    trend,
    rsi: 50,
    macdSignal: 'neutral',
    patterns: [],
    support: 100,
    resistance: 110,
    currentPrice: 105,
  };
}

function bullCandle(t: number, o: number, c = o * 1.002): Candle {
  return { time: t, open: o, high: Math.max(o, c) * 1.001, low: Math.min(o, c) * 0.999, close: c, volume: 1000 };
}

function bearCandle(t: number, o: number, c = o * 0.998): Candle {
  return { time: t, open: o, high: o * 1.001, low: c * 0.999, close: c, volume: 1000 };
}

function holdCandle(t: number, o: number): Candle {
  return { time: t, open: o, high: o * 1.0004, low: o * 0.9996, close: o, volume: 900 };
}

function rising5mCandles(n = 20): Candle[] {
  const out: Candle[] = [];
  let px = 100;
  for (let i = 0; i < n; i++) {
    px *= 1.001;
    out.push(bullCandle(i * 300_000, px / 1.001, px));
  }
  out.push(bullCandle(n * 300_000, px, px));
  return out;
}

function falling5mCandles(n = 20): Candle[] {
  const out: Candle[] = [];
  let px = 100;
  for (let i = 0; i < n; i++) {
    px *= 0.999;
    out.push(bearCandle(i * 300_000, px / 0.999, px));
  }
  out.push(bearCandle(n * 300_000, px, px));
  return out;
}

function baseTrendLong(over: Partial<TrendLongScalpInputs> = {}): TrendLongScalpInputs {
  const c5m = rising5mCandles();
  const c15m = rising5mCandles();
  return {
    coin: 'ETH',
    tf1m: tf('1m', 'SHORT', 'DOWN', 72),
    tf5m: tf('5m', 'LONG', 'UP', 70),
    tf15m: tf('15m', 'LONG', 'UP', 68),
    tf1h: tf('1h', 'LONG', 'UP', 65),
    c1m: [bearCandle(0, 100), bearCandle(60_000, 99.9)],
    c5m,
    c15m,
    minConf: 55,
    minConfirm1mCandles: 1,
    longClass: 'TREND_LONG',
    ...over,
  };
}

function baseTrendShort(over: Partial<TrendShortScalpInputs> = {}): TrendShortScalpInputs {
  const c5m = falling5mCandles();
  const c15m = falling5mCandles();
  return {
    coin: 'XMR',
    tf1m: tf('1m', 'HOLD', 'DOWN', 50),
    tf5m: tf('5m', 'SHORT', 'DOWN', 72),
    tf15m: tf('15m', 'SHORT', 'DOWN', 68),
    tf1h: tf('1h', 'SHORT', 'DOWN', 65),
    c1m: [holdCandle(0, 100), holdCandle(60_000, 99.95)],
    c5m,
    c15m,
    minConf: 55,
    minConfirm1mCandles: 1,
    ...over,
  };
}

describe('TREND_LONG scalp 1m relaxation', () => {
  it('allows 1m SHORT pullback when 5m/15m/1h bullish and 5m structure up', () => {
    const r = evaluateTrendLongScalp1m(baseTrendLong());
    assert.equal(r.ok, true);
    assert.equal(r.code, 'SCALP_PASS');
    assert.match(r.reason, /pullback|TREND_LONG/);
  });

  it('still requires 5m LONG', () => {
    const r = evaluateTrendLongScalp1m(
      baseTrendLong({ tf5m: tf('5m', 'SHORT', 'DOWN', 80) })
    );
    assert.equal(r.ok, false);
    assert.equal(r.code, 'SCALP_5M_MISALIGN');
  });

  it('blocks active dump on 15m', () => {
    const dump: Candle[] = [];
    let p = 110;
    for (let i = 0; i < 6; i++) {
      p *= 0.97;
      dump.push(bearCandle(i * 900_000, p / 0.97, p));
    }
    dump.push(bearCandle(6 * 900_000, p, p * 0.99));
    const r = evaluateTrendLongScalp1m(baseTrendLong({ c15m: dump }));
    assert.equal(r.ok, false);
    assert.equal(r.code, 'SCALP_LONG_DUMP_BLOCK');
  });

  it('blocks bearish 5m structure break or waterfall dump', () => {
    const c5m: Candle[] = [];
    let p = 100;
    for (let i = 0; i < 20; i++) {
      const o = p;
      p *= 1.0008;
      c5m.push(bullCandle(i * 300_000, o, p));
    }
    const floor = Math.min(...c5m.slice(0, -5).map((c) => c.low));
    const close = floor * 0.996;
    c5m.push(bearCandle(20 * 300_000, floor * 1.002, close));
    c5m.push(bearCandle(21 * 300_000, close, floor * 0.995));
    c5m.push(bearCandle(22 * 300_000, floor * 0.997, floor * 0.994));
    assert.equal(confirmedBreakdownThroughPriorSupport(c5m), true);
    const r = evaluateTrendLongScalp1m(baseTrendLong({ c5m }));
    assert.equal(r.ok, false);
    assert.ok(
      r.code === 'SCALP_LONG_STRUCTURE_BREAK' || r.code === 'SCALP_LONG_DUMP_BLOCK',
      `expected structure/dump block, got ${r.code}`
    );
  });

  it('blocks OVEREXTENDED_LONG', () => {
    const r = evaluateTrendLongScalp1m(
      baseTrendLong({ longClass: 'OVEREXTENDED_LONG' })
    );
    assert.equal(r.ok, false);
    assert.equal(r.code, 'SCALP_LONG_OVEREXTENDED');
  });

  it('blocks when 1h not bullish', () => {
    const r = evaluateTrendLongScalp1m(
      baseTrendLong({ tf1h: tf('1h', 'SHORT', 'DOWN', 70) })
    );
    assert.equal(r.ok, false);
    assert.equal(r.code, 'SCALP_LONG_HTF_BLOCK');
  });

  it('passes strict 1m when 1m already LONG-aligned', () => {
    const r = evaluateTrendLongScalp1m(
      baseTrendLong({
        tf1m: tf('1m', 'LONG', 'UP', 70),
        c1m: [bullCandle(0, 100), bullCandle(60_000, 100.1)],
      })
    );
    assert.equal(r.ok, true);
    assert.match(r.reason, /Scalp aligned/);
  });
});

describe('MTF SHORT scalp 1m relaxation', () => {
  it('allows 1m HOLD when 5m/15m/1h bearish and 5m structure down', () => {
    const r = evaluateTrendShortScalp1m(baseTrendShort());
    assert.equal(r.ok, true);
    assert.equal(r.code, 'SCALP_PASS');
    assert.match(r.reason, /MTF SHORT pause|allowed/);
  });

  it('allows mild 1m LONG pullback without confirming green sequence', () => {
    const r = evaluateTrendShortScalp1m(
      baseTrendShort({
        tf1m: tf('1m', 'LONG', 'UP', 62),
        c1m: [bullCandle(0, 100, 100.02), holdCandle(60_000, 100.01)],
      })
    );
    assert.equal(r.ok, true);
    assert.equal(r.code, 'SCALP_PASS');
  });

  it('blocks 1m LONG bullish follow-through (reversal, not pullback)', () => {
    const r = evaluateTrendShortScalp1m(
      baseTrendShort({
        tf1m: tf('1m', 'LONG', 'UP', 70),
        c1m: [
          bullCandle(0, 100, 100.25),
          bullCandle(60_000, 100.25, 100.45),
          bullCandle(120_000, 100.45, 100.48),
        ],
      })
    );
    assert.equal(r.ok, false);
    assert.equal(r.code, 'SCALP_SHORT_1M_REVERSAL');
  });

  it('blocks bullish 5m structure break', () => {
    const c5m: Candle[] = [];
    let p = 100;
    for (let i = 0; i < 20; i++) {
      const o = p;
      p *= 0.9995;
      c5m.push(bearCandle(i * 300_000, o, p));
    }
    const ceiling = Math.max(...c5m.slice(0, -5).map((c) => c.high));
    const close = ceiling * 1.004;
    c5m.push(bullCandle(20 * 300_000, ceiling * 0.998, close));
    c5m.push(bullCandle(21 * 300_000, close, ceiling * 1.005));
    c5m.push(bullCandle(22 * 300_000, ceiling * 1.003, ceiling * 1.006));
    assert.equal(confirmedBreakoutThroughPriorResistance(c5m), true);
    const r = evaluateTrendShortScalp1m(baseTrendShort({ c5m }));
    assert.equal(r.ok, false);
    assert.ok(
      r.code === 'SCALP_SHORT_STRUCTURE_BREAK' || r.code === 'SCALP_SHORT_PUMP_BLOCK',
      `expected structure/pump block, got ${r.code}`
    );
  });

  it('passes when 1m SHORT is aligned with confirming candles', () => {
    const r = evaluateTrendShortScalp1m(
      baseTrendShort({
        tf1m: tf('1m', 'SHORT', 'DOWN', 72),
        c1m: [bearCandle(0, 100), bearCandle(60_000, 99.8)],
      })
    );
    assert.equal(r.ok, true);
    assert.match(r.reason, /Scalp aligned.*SHORT/);
  });

  it('still requires 5m SHORT', () => {
    const r = evaluateTrendShortScalp1m(
      baseTrendShort({ tf5m: tf('5m', 'LONG', 'UP', 80) })
    );
    assert.equal(r.ok, false);
    assert.equal(r.code, 'SCALP_5M_MISALIGN');
  });

  it('blocks when 1h not bearish', () => {
    const r = evaluateTrendShortScalp1m(
      baseTrendShort({ tf1h: tf('1h', 'LONG', 'UP', 70) })
    );
    assert.equal(r.ok, false);
    assert.equal(r.code, 'SCALP_SHORT_HTF_BLOCK');
  });
});

describe('validateScalpAlignment routing', () => {
  it('branches TREND_LONG and MTF SHORT into relaxed 1m evaluators', () => {
    const src = readFileSync(new URL('./scalpAlignGate.ts', import.meta.url), 'utf8');
    assert.match(src, /longClass === 'TREND_LONG'/);
    assert.match(src, /isMtfShortBearishStack/);
    assert.match(src, /evaluateTrendShortScalp1m/);
    assert.match(src, /evaluateStrictScalp/);
  });
});