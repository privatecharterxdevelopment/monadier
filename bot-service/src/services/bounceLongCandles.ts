/**
 * Pure bounce-LONG candle math — no I/O (safe for signalEngine, no circular imports).
 *
 * High precision rules:
 * - Prior sharp dump into a swing low
 * - Early: small reclaim off the low with a green close
 * - Impulse: strong green body continuation within a few bars of the low (monster greens)
 * - Never pass when last closed bar is a rejection wick or already too far from the low
 */
import { config } from '../config';

export type BounceCandle = {
  open: number;
  high: number;
  low: number;
  close: number;
};

export type BounceLongGrade = 'early' | 'impulse' | null;

export type BounceLongSetup = {
  ok: boolean;
  grade: BounceLongGrade;
  confidence: number;
  reason: string | null;
  bouncePct: number;
  dumpPct: number;
  barsSinceLow: number;
  nearLowPct: number;
};

function closedCandles(candles: BounceCandle[]): BounceCandle[] {
  return candles.length > 1 ? candles.slice(0, -1) : candles;
}

function pct(from: number, to: number): number {
  if (!Number.isFinite(from) || from <= 0 || !Number.isFinite(to)) return 0;
  return ((to - from) / from) * 100;
}

function fail(partial: Partial<BounceLongSetup> & { bouncePct: number; dumpPct: number; barsSinceLow: number; nearLowPct: number }): BounceLongSetup {
  return {
    ok: false,
    grade: null,
    confidence: 0,
    reason: null,
    ...partial,
  };
}

/** Pure candle evaluation — also used by signalEngine per-TF. */
export function evaluateBounceLongFromCandles(
  candles: BounceCandle[],
  opts?: {
    lookback?: number;
    earlyMaxBouncePct?: number;
    impulseMaxBouncePct?: number;
    impulseMaxBarsSinceLow?: number;
    impulseMinDumpPct?: number;
    impulseMinBodyRatio?: number;
    minBouncePct?: number;
  }
): BounceLongSetup {
  const cfg = config.hyperliquid.preferLongAfterDump;
  const lookback = opts?.lookback ?? cfg.swingLookback15m;
  const earlyMax = opts?.earlyMaxBouncePct ?? Math.max(cfg.maxBouncePct, 1.8);
  const impulseMax = opts?.impulseMaxBouncePct ?? cfg.impulseMaxBouncePct;
  const maxBars = opts?.impulseMaxBarsSinceLow ?? cfg.impulseMaxBarsSinceLow;
  const minDump = opts?.impulseMinDumpPct ?? cfg.impulseMinDumpPct;
  const minBody = opts?.impulseMinBodyRatio ?? cfg.impulseMinBodyRatio;
  const minBounce = opts?.minBouncePct ?? cfg.minBouncePct;

  const closed = closedCandles(candles);
  const slice = closed.slice(-Math.max(6, lookback));
  if (slice.length < 6) {
    return fail({ bouncePct: 0, dumpPct: 0, barsSinceLow: 99, nearLowPct: 99 });
  }

  let lowIdx = 0;
  let low = slice[0].low;
  for (let i = 1; i < slice.length; i++) {
    if (slice[i].low <= low) {
      low = slice[i].low;
      lowIdx = i;
    }
  }

  const barsSinceLow = slice.length - 1 - lowIdx;
  const last = slice[slice.length - 1];
  const bouncePct = pct(low, last.close);
  const nearLowPct = bouncePct;

  const before = slice.slice(0, lowIdx + 1);
  const highBefore = Math.max(...before.map((c) => c.high));
  const dumpPct = highBefore > 0 ? ((highBefore - low) / highBefore) * 100 : 0;

  const lastRange = last.high - last.low;
  const lastBody = last.close - last.open;
  const closeLoc = lastRange > 0 ? (last.close - last.low) / lastRange : 0;
  const greenClose = last.close > last.open;
  const rejectionWick = lastRange > 0 && closeLoc < 0.4 && last.high - last.close > lastBody;
  const impulseCandle =
    greenClose &&
    lastRange > 0 &&
    lastBody > 0 &&
    lastBody / lastRange >= minBody &&
    closeLoc >= 0.58;

  // Higher close vs bar that printed the low (reclaim)
  const lowBar = slice[lowIdx];
  const reclaimed = last.close > lowBar.close && last.close > low;

  const sinceLow = slice.slice(lowIdx);
  const greenSinceLow = sinceLow.filter((c) => c.close > c.open).length;
  const risingCloses =
    sinceLow.length >= 2 &&
    sinceLow[sinceLow.length - 1].close > sinceLow[sinceLow.length - 2].close;

  const sharpDump = dumpPct >= minDump;
  if (!sharpDump || barsSinceLow > maxBars || bouncePct < minBounce || !reclaimed) {
    return fail({ bouncePct, dumpPct, barsSinceLow, nearLowPct });
  }
  if (!greenClose || rejectionWick) {
    return fail({ bouncePct, dumpPct, barsSinceLow, nearLowPct });
  }

  // Early reclaim: still tight to the low, at least one green since low
  if (bouncePct <= earlyMax && greenSinceLow >= 1) {
    const conf = Math.min(
      74,
      54 + bouncePct * 5 + (impulseCandle ? 8 : 0) + (risingCloses ? 3 : 0)
    );
    return {
      ok: true,
      grade: 'early',
      confidence: conf,
      reason:
        `Bounce LONG early — +${bouncePct.toFixed(2)}% off swing low ` +
        `(dump −${dumpPct.toFixed(2)}%, ${barsSinceLow} bars since low)`,
      bouncePct,
      dumpPct,
      barsSinceLow,
      nearLowPct,
    };
  }

  // Impulse continuation: strong body + still within impulse window / bounce ceiling
  if (
    bouncePct <= impulseMax &&
    impulseCandle &&
    risingCloses &&
    greenSinceLow >= 1 &&
    barsSinceLow <= Math.max(3, Math.floor(maxBars * 0.75))
  ) {
    const conf = Math.min(80, 60 + Math.min(14, bouncePct) + (greenSinceLow >= 2 ? 4 : 0));
    return {
      ok: true,
      grade: 'impulse',
      confidence: conf,
      reason:
        `Bounce LONG impulse — +${bouncePct.toFixed(2)}% off low with strong green body ` +
        `(prior dump −${dumpPct.toFixed(2)}%, ${barsSinceLow} bars since low)`,
      bouncePct,
      dumpPct,
      barsSinceLow,
      nearLowPct,
    };
  }

  return fail({ bouncePct, dumpPct, barsSinceLow, nearLowPct });
}

export function isImpulseBounceLongCandles(candles: BounceCandle[]): boolean {
  const s = evaluateBounceLongFromCandles(candles);
  return s.ok && (s.grade === 'impulse' || s.grade === 'early');
}
