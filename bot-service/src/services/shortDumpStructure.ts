/**
 * Pure SHORT dump-structure helpers (no config import — unit-testable).
 *
 * August continuation: sell a waterfall that is still printing lower closes.
 * FIL-bottom protection: do not sell an unconfirmed support bounce (hammer /
 * 5m reclaim after the dump).
 *
 * Bug this replaces: "support" was the live sliding low, so close-below-support
 * was geometrically impossible and every dump looked like a floor tag.
 */
import type { Candle } from './signalEngine';
import { isBearishLongUpperWick, isBullishLongLowerWick } from './candleWickGate';

export function closedCandles(candles: Candle[]): Candle[] {
  if (candles.length <= 1) return candles;
  return candles.slice(0, -1);
}

/** Support from history, excluding the last N closed bars (the breakdown window). */
export function priorSwingSupport(
  candles: Candle[],
  excludeLastClosed = 5
): number | null {
  const win = closedCandles(candles);
  if (win.length < excludeLastClosed + 8) return null;
  const history = win.slice(0, -excludeLastClosed);
  const lows = history.slice(-24).map((c) => c.low);
  if (lows.length === 0) return null;
  const level = Math.min(...lows);
  return Number.isFinite(level) && level > 0 ? level : null;
}

/** Last `confirmBars` closed candles held below the prior support. */
export function confirmedBreakdownThroughPriorSupport(
  candles: Candle[],
  opts?: { bufferPct?: number; confirmBars?: number; excludeLastClosed?: number }
): boolean {
  const bufferPct = opts?.bufferPct ?? 0.0015;
  const confirmBars = opts?.confirmBars ?? 2;
  const excludeLastClosed = opts?.excludeLastClosed ?? Math.max(confirmBars + 2, 5);
  const win = closedCandles(candles);
  if (win.length < confirmBars + excludeLastClosed) return false;
  const prior = priorSwingSupport(candles, excludeLastClosed);
  if (prior == null) return false;
  const recent = win.slice(-confirmBars);
  return recent.every((c) => c.close < prior * (1 - bufferPct));
}

/** Resistance from history, excluding the last N closed bars (the breakout window). */
export function priorSwingResistance(
  candles: Candle[],
  excludeLastClosed = 5
): number | null {
  const win = closedCandles(candles);
  if (win.length < excludeLastClosed + 8) return null;
  const history = win.slice(0, -excludeLastClosed);
  const highs = history.slice(-24).map((c) => c.high);
  if (highs.length === 0) return null;
  const level = Math.max(...highs);
  return Number.isFinite(level) && level > 0 ? level : null;
}

/** Last `confirmBars` closed candles held above the prior resistance. */
export function confirmedBreakoutThroughPriorResistance(
  candles: Candle[],
  opts?: { bufferPct?: number; confirmBars?: number; excludeLastClosed?: number }
): boolean {
  const bufferPct = opts?.bufferPct ?? 0.0015;
  const confirmBars = opts?.confirmBars ?? 2;
  const excludeLastClosed = opts?.excludeLastClosed ?? Math.max(confirmBars + 2, 5);
  const win = closedCandles(candles);
  if (win.length < confirmBars + excludeLastClosed) return false;
  const prior = priorSwingResistance(candles, excludeLastClosed);
  if (prior == null) return false;
  const recent = win.slice(-confirmBars);
  return recent.every((c) => c.close > prior * (1 + bufferPct));
}

/**
 * Dump still in motion: 15m making lower closes with mostly red bodies,
 * no hammer bounce, 5m not reclaiming.
 */
export function isShortDumpContinuation(opts: {
  candles15m: Candle[];
  candles5m?: Candle[];
}): boolean {
  const c15 = closedCandles(opts.candles15m).slice(-5);
  if (c15.length < 4) return false;
  if (c15.some((c) => isBullishLongLowerWick(c))) return false;
  const reds = c15.filter((c) => c.close <= c.open * 1.0001).length;
  if (reds < 3) return false;
  const first = c15[0]!;
  const last = c15[c15.length - 1]!;
  if (!(last.close < first.close)) return false;

  if (opts.candles5m && opts.candles5m.length >= 4) {
    const c5 = closedCandles(opts.candles5m).slice(-3);
    if (c5.length >= 2) {
      const first5 = c5[0]!;
      const last5 = c5[c5.length - 1]!;
      if (last5.close > last5.open && last5.close > first5.open) return false;
    }
  }
  return true;
}

/**
 * Rally still in motion: 15m making higher closes with mostly green bodies,
 * no rejection wick, 5m not breaking down.
 */
export function isLongRallyContinuation(opts: {
  candles15m: Candle[];
  candles5m?: Candle[];
}): boolean {
  const c15 = closedCandles(opts.candles15m).slice(-5);
  if (c15.length < 4) return false;
  if (c15.some((c) => isBearishLongUpperWick(c))) return false;
  const greens = c15.filter((c) => c.close >= c.open * 0.9999).length;
  if (greens < 3) return false;
  const first = c15[0]!;
  const last = c15[c15.length - 1]!;
  if (!(last.close > first.close)) return false;

  if (opts.candles5m && opts.candles5m.length >= 4) {
    const c5 = closedCandles(opts.candles5m).slice(-3);
    if (c5.length >= 2) {
      const first5 = c5[0]!;
      const last5 = c5[c5.length - 1]!;
      if (last5.close < last5.open && last5.close < first5.open) return false;
    }
  }
  return true;
}
