import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Candle } from './signalEngine';
import {
  confirmedBreakdownThroughPriorSupport,
  isShortDumpContinuation,
  priorSwingSupport,
} from './shortDumpStructure';

function candle(
  i: number,
  open: number,
  high: number,
  low: number,
  close: number
): Candle {
  return { time: i * 60_000, open, high, low, close, volume: 1 };
}

/** Range-bound around 100, then a waterfall through 95. Last bar is forming. */
function waterfallSeries(): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < 20; i += 1) {
    out.push(candle(i, 100.2, 100.8, 99.6, 100.1));
  }
  // Dump: each closed bar lower. Forming last bar continues down.
  const dump = [
    [99.8, 100.0, 98.9, 99.0],
    [99.0, 99.1, 97.8, 97.9],
    [97.9, 98.0, 96.6, 96.7],
    [96.7, 96.8, 95.4, 95.5],
    [95.5, 95.6, 94.2, 94.3],
    [94.3, 94.4, 93.0, 93.2], // forming
  ] as const;
  dump.forEach(([o, h, l, c], j) => out.push(candle(20 + j, o, h, l, c)));
  return out;
}

function bounceAfterDump(): Candle[] {
  const base = waterfallSeries().slice(0, -1);
  // Hammer reclaim: long lower wick, close back up.
  base.push(candle(26, 93.2, 95.0, 90.0, 94.8));
  base.push(candle(27, 94.8, 95.2, 94.5, 95.0)); // forming
  return base;
}

describe('priorSwingSupport', () => {
  it('ignores the dump lows so support stays in the prior range', () => {
    const level = priorSwingSupport(waterfallSeries(), 5);
    assert.ok(level != null);
    assert.ok(level > 98, `prior support ${level} should be the range floor, not the dump`);
  });
});

describe('confirmedBreakdownThroughPriorSupport', () => {
  it('allows a waterfall whose closes held below prior support', () => {
    assert.equal(confirmedBreakdownThroughPriorSupport(waterfallSeries()), true);
  });

  it('rejects a range that never broke prior support', () => {
    const range: Candle[] = [];
    for (let i = 0; i < 20; i += 1) {
      range.push(candle(i, 100, 100.4, 99.7, 100.1));
    }
    range.push(candle(20, 100.1, 100.2, 99.8, 100.0));
    assert.equal(confirmedBreakdownThroughPriorSupport(range), false);
  });
});

describe('isShortDumpContinuation', () => {
  it('allows a still-printing dump (August continuation)', () => {
    assert.equal(isShortDumpContinuation({ candles15m: waterfallSeries() }), true);
  });

  it('blocks an unconfirmed support bounce (hammer reclaim)', () => {
    assert.equal(isShortDumpContinuation({ candles15m: bounceAfterDump() }), false);
  });

  it('blocks when 5m reclaims after the dump', () => {
    const m15 = waterfallSeries();
    const m5 = [
      candle(0, 94.0, 94.1, 93.5, 93.6),
      candle(1, 93.6, 93.7, 93.2, 93.3),
      candle(2, 93.3, 95.0, 93.2, 94.8),
      candle(3, 94.8, 95.1, 94.7, 95.0),
    ];
    assert.equal(isShortDumpContinuation({ candles15m: m15, candles5m: m5 }), false);
  });
});
