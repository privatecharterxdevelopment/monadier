import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { evaluateTrendLongScalp1m, type TrendLongScalpInputs } from './scalpAlignGate';
import type { TimeframeAnalysis, Candle } from './signalEngine';
import { confirmedBreakdownThroughPriorSupport } from './shortDumpStructure';

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

function rising5mCandles(n = 20): Candle[] {
  const out: Candle[] = [];
  let px = 100;
  for (let i = 0; i < n; i++) {
    px *= 1.001;
    out.push(bullCandle(i * 300_000, px / 1.001, px));
  }
  out.push(bullCandle(n * 300_000, px, px)); // forming
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

describe('SHORT path unchanged', () => {
  it('validateScalpAlignment still branches only TREND_LONG into relaxed 1m', () => {
    const src = readFileSync(new URL('./scalpAlignGate.ts', import.meta.url), 'utf8');
    assert.match(src, /longClass === 'TREND_LONG'/);
    assert.match(src, /evaluateStrictScalp/);
    assert.doesNotMatch(src, /REVERSAL_LONG.*evaluateTrendLongScalp1m/);
  });
});