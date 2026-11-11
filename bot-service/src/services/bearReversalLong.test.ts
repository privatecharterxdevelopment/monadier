import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Candle } from './signalEngine';
import {
  classifyBearLongFromCandles,
  executablePriceOverextended,
  primaryReversalContext,
} from './bearReversalLong';
import { isOpeningTradeState } from './hlExecutionState';
import { BEAR_MARKET } from '../config/profiles/bearMarketShort';
import {
  estimateRoundTripFeesUsd,
  lossStopPricePx,
  shouldArmBreakevenProtection,
} from './dynamicTrailingStop';

function c(open: number, high: number, low: number, close: number, i: number): Candle {
  return { time: i * 60_000, open, high, low, close, volume: 100 };
}

function quiet(n: number, px0: number, step = 1, range = 4): Candle[] {
  const out: Candle[] = [];
  let px = px0;
  for (let i = 0; i < n; i += 1) {
    out.push(c(px, px + range, px - range, px + step * 0.2, i));
    px += step * 0.05;
  }
  return out;
}

/** BTC-like flush then closed reclaim (not a wick). */
function flushReclaim(px = 75_000): { m15: Candle[]; m5: Candle[]; h1: Candle[]; h4: Candle[] } {
  const m15 = quiet(16, px, 1, 40);
  const dumpOpen = m15[m15.length - 1]!.close;
  m15.push(c(dumpOpen, dumpOpen + 30, dumpOpen - 1800, dumpOpen - 1600, m15.length));
  const dump = m15[m15.length - 1]!;
  m15.push(c(dump.close, dumpOpen + 80, dump.close - 20, dumpOpen + 40, m15.length));
  const live = dumpOpen + 30;
  m15.push(c(live, live + 40, live - 40, live + 10, m15.length));

  const m5 = quiet(20, px, -2, 15);
  m5.push(c(px - 40, px - 30, px - 80, px - 70, m5.length));
  m5.push(c(px - 70, px - 60, px - 90, px - 85, m5.length));

  const h1 = quiet(16, px, 2, 80);
  h1.push(c(px, px + 50, px - 400, px - 50, h1.length));
  h1.push(c(px - 50, px + 120, px - 60, px + 90, h1.length));
  h1.push(c(px + 90, px + 100, px + 70, px + 85, h1.length));

  const h4 = quiet(16, px + 800, -8, 120);
  h4.push(c(px, px + 40, px - 900, px - 600, h4.length));
  h4.push(c(px - 600, px - 500, px - 700, px - 580, h4.length));
  return { m15, m5, h1, h4 };
}

function dumpNoReclaim(px = 75_000) {
  const { m15, m5, h1, h4 } = flushReclaim(px);
  m15.splice(-2, 2, c(px - 1600, px - 1580, px - 1700, px - 1680, 99));
  return { m15, m5, h1, h4 };
}

function falseReclaim(px = 75_000) {
  const { m5, h1, h4 } = flushReclaim(px);
  const m15 = quiet(16, px, 1, 40);
  const dumpOpen = m15[m15.length - 1]!.close;
  m15.push(c(dumpOpen, dumpOpen + 30, dumpOpen - 1800, dumpOpen - 1600, m15.length));
  const dump = m15[m15.length - 1]!;
  m15.push(c(dump.close, dumpOpen + 80, dump.close - 20, dumpOpen + 40, m15.length));
  m15.push(c(dumpOpen + 40, dumpOpen + 50, dump.low + 20, dump.low + 80, m15.length));
  m15.push(c(dump.low + 80, dump.low + 100, dump.low + 40, dump.low + 90, m15.length));
  return { m15, m5, h1, h4 };
}

function verticalPump(px = 140): { m15: Candle[]; m5: Candle[]; h1: Candle[]; h4: Candle[] } {
  const m15 = quiet(16, px, 0.2, 0.4);
  const dumpOpen = m15[m15.length - 1]!.close;
  m15.push(c(dumpOpen, dumpOpen + 0.3, dumpOpen - 8, dumpOpen - 7, m15.length));
  const dump = m15[m15.length - 1]!;
  m15.push(c(dump.close, dumpOpen + 0.6, dump.close - 0.05, dumpOpen + 0.35, m15.length));
  m15.push(c(dumpOpen + 0.35, dumpOpen + 12, dumpOpen + 0.3, dumpOpen + 11.5, m15.length));
  m15.push(c(dumpOpen + 11.5, dumpOpen + 20, dumpOpen + 11, dumpOpen + 19, m15.length));
  m15.push(c(dumpOpen + 19, dumpOpen + 20, dumpOpen + 18.5, dumpOpen + 19.2, m15.length));
  const m5 = quiet(16, px, 0.4, 0.5);
  m5.push(c(px, px + 12, px, px + 11, m5.length));
  const h1 = quiet(16, px, 0.3, 1);
  h1.push(c(px, px + 14, px - 1, px + 12, h1.length));
  const h4 = quiet(12, px, 0.2, 2);
  return { m15, m5, h1, h4 };
}

function pumpThenConsolidate(px = 140) {
  const x = verticalPump(px);
  const last = x.m15[x.m15.length - 2]!;
  x.m15[x.m15.length - 2] = c(last.close, last.close + 0.3, last.close - 0.4, last.close - 0.1, 98);
  return x;
}

const reversalVotes = {
  tf5m: 'SHORT' as const,
  tf15m: 'LONG' as const,
  tf1h: 'LONG' as const,
  tf4h: 'SHORT' as const,
};

describe('bear reversal LONG classifier', () => {
  it('treats 15m+1h as primary even when 5m/4h are SHORT', () => {
    assert.equal(primaryReversalContext(reversalVotes), true);
  });

  it('relief bounce above dump mid is not a structure break', () => {
    const m15 = quiet(16, 75_000, 1, 40);
    const dumpOpen = m15[m15.length - 1]!.close;
    m15.push(c(dumpOpen, dumpOpen + 30, dumpOpen - 1800, dumpOpen - 1600, m15.length));
    const dump = m15[m15.length - 1]!;
    const mid = (dump.high + dump.low) / 2;
    m15.push(c(dump.close, mid + 200, dump.close - 20, mid + 80, m15.length));
    m15.push(c(mid + 80, mid + 100, mid + 60, mid + 70, m15.length));
    const r = classifyBearLongFromCandles({
      candles5m: m15,
      candles15m: m15,
      candles1h: m15,
      candles4h: m15,
      votes: reversalVotes,
      confidence: 70,
    });
    assert.notEqual(r.class, 'REVERSAL_LONG');
    assert.equal(r.reclaimKind, 'relief');
    assert.equal(r.code, 'REVERSAL_WAITING_RECLAIM');
  });

  it('floor major with relief bounce at 24h lows is REVERSAL_LONG without 1h flip', () => {
    const m15 = quiet(16, 75_000, 1, 40);
    const dumpOpen = m15[m15.length - 1]!.close;
    m15.push(c(dumpOpen, dumpOpen + 30, dumpOpen - 1800, dumpOpen - 1600, m15.length));
    const dump = m15[m15.length - 1]!;
    const mid = (dump.high + dump.low) / 2;
    m15.push(c(dump.close, mid + 200, dump.close - 20, mid + 80, m15.length));
    m15.push(c(mid + 80, mid + 100, mid + 60, mid + 70, m15.length));
    const r = classifyBearLongFromCandles({
      candles5m: m15,
      candles15m: m15,
      candles1h: m15,
      candles4h: m15,
      votes: { tf5m: 'SHORT', tf15m: 'SHORT', tf1h: 'DOWN', tf4h: 'DOWN' },
      confidence: 61,
      floorMajor: true,
      rangePosition24h: 0.04,
    });
    assert.equal(r.class, 'REVERSAL_LONG');
    assert.equal(r.dumpPhase, 'FLUSH_WAIT');
  });

  it('floor flag without range-low still waits on relief', () => {
    const m15 = quiet(16, 75_000, 1, 40);
    const dumpOpen = m15[m15.length - 1]!.close;
    m15.push(c(dumpOpen, dumpOpen + 30, dumpOpen - 1800, dumpOpen - 1600, m15.length));
    const dump = m15[m15.length - 1]!;
    const mid = (dump.high + dump.low) / 2;
    m15.push(c(dump.close, mid + 200, dump.close - 20, mid + 80, m15.length));
    m15.push(c(mid + 80, mid + 100, mid + 60, mid + 70, m15.length));
    const r = classifyBearLongFromCandles({
      candles5m: m15,
      candles15m: m15,
      candles1h: m15,
      candles4h: m15,
      votes: { tf5m: 'SHORT', tf15m: 'SHORT', tf1h: 'DOWN', tf4h: 'DOWN' },
      confidence: 61,
      floorMajor: true,
      rangePosition24h: 0.55,
    });
    assert.notEqual(r.class, 'REVERSAL_LONG');
    assert.equal(r.code, 'REVERSAL_WAITING_RECLAIM');
  });

  it('1 BTC flush → 15m/1h bullish → 5m bearish → confirmed reclaim = REVERSAL_LONG', () => {
    const { m15, m5, h1, h4 } = flushReclaim();
    const r = classifyBearLongFromCandles({
      candles5m: m5,
      candles15m: m15,
      candles1h: h1,
      candles4h: h4,
      votes: reversalVotes,
      confidence: 64,
    });
    assert.equal(r.class, 'REVERSAL_LONG');
    assert.equal(r.dumpPhase, 'RECLAIMED');
    assert.equal(r.executionState, 'CANDIDATE');
    assert.equal(r.htfBearish, true);
    assert.ok(r.reclaimKind === 'structure_break' || r.reclaimKind === 'retest');
  });

  it('2 ETH flush → bullish 15m/1h → bearish 4h → valid reversal (4h is not a veto)', () => {
    const { m15, m5, h1, h4 } = flushReclaim(3200);
    const r = classifyBearLongFromCandles({
      candles5m: m5,
      candles15m: m15,
      candles1h: h1,
      candles4h: h4,
      votes: reversalVotes,
      confidence: 62,
    });
    assert.equal(r.class, 'REVERSAL_LONG');
    assert.equal(r.htfBearish, true);
  });

  it('3 SOL vertical pump → OVEREXTENDED_LONG blocks new entry', () => {
    const { m15, m5, h1, h4 } = verticalPump();
    const r = classifyBearLongFromCandles({
      candles5m: m5,
      candles15m: m15,
      candles1h: h1,
      candles4h: h4,
      votes: { ...reversalVotes, tf5m: 'LONG', tf4h: 'LONG' },
      confidence: 80,
    });
    assert.equal(r.class, 'OVEREXTENDED_LONG');
    assert.equal(r.executionState, 'BLOCKED');
    assert.equal(r.code, 'LONG_OVEREXTENDED');
  });

  it('4 strong pump then consolidation is not an auto SHORT', () => {
    const { m15, m5, h1, h4 } = pumpThenConsolidate();
    const r = classifyBearLongFromCandles({
      candles5m: m5,
      candles15m: m15,
      candles1h: h1,
      candles4h: h4,
      votes: reversalVotes,
      confidence: 70,
    });
    assert.notEqual(r.class === 'NONE' && /SHORT/.test(r.reason), true);
    assert.notEqual(r.reason.includes('flip SHORT'), true);
  });

  it('5 dump without reclaim blocks LONG', () => {
    const { m15, m5, h1, h4 } = dumpNoReclaim();
    const r = classifyBearLongFromCandles({
      candles5m: m5,
      candles15m: m15,
      candles1h: h1,
      candles4h: h4,
      votes: reversalVotes,
      confidence: 70,
    });
    assert.equal(r.class, 'NONE');
    assert.ok(
      r.code === 'REVERSAL_WAITING_RECLAIM' || r.code === 'LONG_DUMP_CONTINUATION'
    );
    const floor = classifyBearLongFromCandles({
      candles5m: m5,
      candles15m: m15,
      candles1h: h1,
      candles4h: h4,
      votes: reversalVotes,
      confidence: 70,
      floorMajor: true,
      rangePosition24h: 0.02,
    });
    assert.notEqual(floor.class, 'REVERSAL_LONG');
  });

  it('6 false reclaim then resume down blocks LONG', () => {
    const { m15, m5, h1, h4 } = falseReclaim();
    const r = classifyBearLongFromCandles({
      candles5m: m5,
      candles15m: m15,
      candles1h: h1,
      candles4h: h4,
      votes: reversalVotes,
      confidence: 70,
    });
    assert.ok(
      r.code === 'REVERSAL_STRUCTURE_UNCONFIRMED' ||
        r.code === 'REVERSAL_WAITING_RECLAIM' ||
        r.code === 'LONG_DUMP_CONTINUATION'
    );
    assert.notEqual(r.class, 'REVERSAL_LONG');
  });

  it('7 open position + massive pump does not emit a close/reverse action', () => {
    const { m15, m5, h1, h4 } = verticalPump();
    const r = classifyBearLongFromCandles({
      candles5m: m5,
      candles15m: m15,
      candles1h: h1,
      candles4h: h4,
      votes: { tf5m: 'LONG', tf15m: 'LONG', tf1h: 'LONG', tf4h: 'LONG' },
      confidence: 90,
      positionOpen: true,
    });
    assert.equal(r.manageOpenPosition, true);
    assert.equal(r.class, 'OVEREXTENDED_LONG');
    assert.match(r.reason, /hold existing SL/);
  });

  it('9 TREND_LONG still requires 3 greens + 5m UP (SHORT rules untouched)', () => {
    assert.equal(BEAR_MARKET.short.minConfirm15mCandles, 3);
    assert.equal(BEAR_MARKET.short.required15mTrend, 'DOWN');
    assert.equal(BEAR_MARKET.short.requiredH1Trend, 'DOWN');
    assert.equal(BEAR_MARKET.long.minConfirm15mCandles, 3);
    assert.equal(BEAR_MARKET.long.required5mTrend, 'UP');
    const m15 = quiet(16, 100, 1, 1);
    m15.push(c(100, 101, 99.8, 100.8, 16));
    m15.push(c(100.8, 101.2, 100.7, 101.1, 17));
    m15.push(c(101.1, 101.4, 101, 101.3, 18));
    m15.push(c(101.3, 101.5, 101.2, 101.35, 19));
    const r = classifyBearLongFromCandles({
      candles5m: m15,
      candles15m: m15,
      candles1h: m15,
      candles4h: m15,
      votes: { tf5m: 'LONG', tf15m: 'LONG', tf1h: 'LONG', tf4h: 'LONG' },
      confidence: 70,
    });
    assert.equal(r.class, 'TREND_LONG');
  });

  it('10 marginally positive PnL arms profit SL immediately', () => {
    const fees = estimateRoundTripFeesUsd(200);
    assert.equal(
      shouldArmBreakevenProtection({
        direction: 'LONG',
        pnlUsd: 0.04,
        markPrice: 100.02,
        entryPrice: 100,
        absSize: 2,
        feesUsd: fees,
        tickSize: 0.01,
        timeInProfitMs: 0,
        collateralUsd: 10,
        notionalUsd: 200,
      }),
      true
    );
  });

  it('shadow 58% does not open; productive bar is 62%', () => {
    const { m15, m5, h1, h4 } = flushReclaim();
    const shadow = classifyBearLongFromCandles({
      candles5m: m5,
      candles15m: m15,
      candles1h: h1,
      candles4h: h4,
      votes: reversalVotes,
      confidence: 58,
    });
    assert.equal(shadow.class, 'NONE');
    assert.equal(shadow.code, 'LONG_CONFIDENCE_BELOW_THRESHOLD');
    assert.match(shadow.reason, /SHADOW/);
    const live = classifyBearLongFromCandles({
      candles5m: m5,
      candles15m: m15,
      candles1h: h1,
      candles4h: h4,
      votes: reversalVotes,
      confidence: 62,
    });
    assert.equal(live.class, 'REVERSAL_LONG');
  });

  it('pre-order executable price rejects chase past reclaim', () => {
    assert.equal(
      executablePriceOverextended({ markPx: 100, reclaimPx: 100, atr: 1 }),
      false
    );
    assert.equal(
      executablePriceOverextended({ markPx: 102.5, reclaimPx: 100, atr: 1 }),
      true
    );
  });

  it('user SL percent maps to the same emergency price for any LONG class', () => {
    const px = lossStopPricePx('LONG', 75_000, 0.01, 150, 5);
    assert.equal(px, 75_000 - (150 * 0.05) / 0.01);
  });

  it('12 Opening trade only for in-flight entry/SL states', () => {
    assert.equal(isOpeningTradeState('CANDIDATE'), false);
    assert.equal(isOpeningTradeState('WAITING_CONFIRMATION'), false);
    assert.equal(isOpeningTradeState('BLOCKED'), false);
    assert.equal(isOpeningTradeState('ORDER_SUBMITTED'), true);
    assert.equal(isOpeningTradeState('ENTRY_SUBMITTED'), true);
    assert.equal(isOpeningTradeState('SL_PENDING'), true);
    assert.equal(isOpeningTradeState('SL_CONFIRMED'), false);
    assert.equal(isOpeningTradeState('ORDER_CONFIRMED'), false);
    assert.equal(isOpeningTradeState('ORDER_FAILED'), false);
  });
});
