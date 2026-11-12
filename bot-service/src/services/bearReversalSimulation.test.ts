/**
 * Fixture replay: baseline TREND-LONG gates vs bear reversal engine.
 * Not live-tick history — closed-candle scenarios with no lookahead.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Candle } from './signalEngine';
import { classifyBearLongFromCandles } from './bearReversalLong';
import { BEAR_MARKET } from '../config/profiles/bearMarketShort';

function c(open: number, high: number, low: number, close: number, i: number): Candle {
  return { time: i * 900_000, open, high, low, close, volume: 10 };
}

function quiet(n: number, px: number): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < n; i += 1) {
    out.push(c(px, px + 5, px - 5, px + 0.4, i));
    px += 0.1;
  }
  return out;
}

function baselineWouldOpen(opts: {
  votes: { tf5m: string; tf15m: string; tf1h: string; tf4h: string };
  greens15: boolean;
  dumpTape: boolean;
  directionalTfs: number;
  confidence: number;
}): boolean {
  const long = BEAR_MARKET.long;
  if (opts.confidence < long.minConfidence) return false;
  if (opts.directionalTfs < long.minDirectionalTfs) return false;
  if (opts.votes.tf5m !== 'LONG' && opts.votes.tf5m !== 'UP') return false;
  if (opts.votes.tf15m !== 'LONG' && opts.votes.tf15m !== 'UP') return false;
  if (opts.votes.tf1h !== 'LONG' && opts.votes.tf1h !== 'UP') return false;
  if (!opts.greens15) return false;
  if (opts.dumpTape) return false;
  return true;
}

function flushReclaim(): Candle[] {
  const m15 = quiet(16, 100);
  m15.push(c(100, 101, 92, 93, 16));
  const dump = m15[m15.length - 1]!;
  m15.push(c(93, dump.open + 2, 92.8, dump.open + 1.2, 17));
  m15.push(c(dump.open + 1.2, dump.open + 1.4, dump.open + 1.0, dump.open + 1.25, 18));
  return m15;
}

describe('historical fixture comparison (baseline vs reversal)', () => {
  it('reversal engine takes confirmed reclaim that baseline rejects', () => {
    const m15 = flushReclaim();
    const votes = { tf5m: 'SHORT', tf15m: 'LONG', tf1h: 'LONG', tf4h: 'SHORT' };
    const base = baselineWouldOpen({
      votes,
      greens15: false,
      dumpTape: true,
      directionalTfs: 2,
      confidence: 64,
    });
    const next = classifyBearLongFromCandles({
      candles5m: m15,
      candles15m: m15,
      candles1h: m15,
      candles4h: quiet(12, 110),
      votes,
      confidence: 64,
    });
    assert.equal(base, false);
    assert.equal(next.class, 'REVERSAL_LONG');
  });

  it('SHORT profile thresholds are unchanged (regression lock)', () => {
    const s = BEAR_MARKET.short;
    assert.equal(s.minConfidence, 58);
    assert.equal(s.minDirectionalTfs, 3);
    assert.equal(s.requiredH1Trend, 'DOWN');
    assert.equal(s.required15mTrend, 'DOWN');
    assert.equal(s.minConfirm15mCandles, 3);
    assert.equal(s.trustMtfScan, true);
    assert.equal(s.relaxSecondaryGates, true);
  });

  it('does not count extra LONG entries as an improvement without reclaim', () => {
    const m15 = quiet(20, 100);
    const votes = { tf5m: 'SHORT', tf15m: 'LONG', tf1h: 'LONG', tf4h: 'SHORT' };
    const next = classifyBearLongFromCandles({
      candles5m: m15,
      candles15m: m15,
      candles1h: m15,
      candles4h: m15,
      votes,
      confidence: 80,
    });
    assert.notEqual(next.class, 'REVERSAL_LONG');
    assert.notEqual(next.class, 'TREND_LONG');
  });
});
