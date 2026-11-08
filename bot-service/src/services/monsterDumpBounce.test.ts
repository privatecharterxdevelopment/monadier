import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Candle } from './signalEngine';
import { detectMonsterDumpBounceFromCandles } from './monsterDumpBounce';

function c(
  open: number,
  high: number,
  low: number,
  close: number,
  i: number
): Candle {
  return { time: i, open, high, low, close, volume: 1 };
}

function quietThenDumpThenBounce(): Candle[] {
  const out: Candle[] = [];
  let px = 2200;
  for (let i = 0; i < 16; i += 1) {
    out.push(c(px, px + 4, px - 4, px + 1, i));
    px += 1;
  }
  // Monster dump (~80 pts vs ~8 range)
  out.push(c(2216, 2218, 2138, 2142, 16));
  // Bounce reclaim
  out.push(c(2142, 2188, 2139, 2180, 17));
  return out;
}

describe('monster dump bounce schema', () => {
  it('detects monster dump then bounce as LONG schema', () => {
    const r = detectMonsterDumpBounceFromCandles(quietThenDumpThenBounce(), '1h');
    assert.equal(r.phase, 'bounce_long');
    assert.ok(r.dumpRangePct > 2);
  });

  it('ignores a dump with no reclaim', () => {
    const bars = quietThenDumpThenBounce().slice(0, -1);
    bars.push(c(2142, 2144, 2136, 2138, 17));
    const r = detectMonsterDumpBounceFromCandles(bars, '1h');
    assert.equal(r.phase, 'none');
  });
});
