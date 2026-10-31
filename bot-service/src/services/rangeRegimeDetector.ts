/**
 * Range-regime detector — simple, math-only, no LLM needed.
 *
 * Logic (as user-specified):
 *  1. Compute ATR over last N 5m candles.
 *  2. Compute price range width over the same window (highest high − lowest low).
 *  3. Normalise: rangeWidthPct = (high − low) / midPrice.
 *  4. If rangeWidthPct < threshold AND price is oscillating (no strong trend momentum)
 *     → RANGE regime.
 *
 * Returns:
 *  - isRange   : boolean
 *  - rangeHigh : highest high of the detection window
 *  - rangeLow  : lowest low
 *  - rangeMid  : midpoint
 *  - atr       : raw ATR value (for TP/SL sizing)
 *  - width     : range high − low in absolute price
 *  - widthPct  : width / mid
 */

import { signalEngine, type Candle } from './signalEngine';
import { hlCoinToBinanceSymbol } from './hlSymbols';
import { calculateATR } from './dynamicTrailingStop';
import { config } from '../config';

export type RangeRegimeResult = {
  isRange: boolean;
  rangeHigh: number;
  rangeLow: number;
  rangeMid: number;
  width: number;
  widthPct: number;
  atr: number;
  /** TP price for a SHORT in range-mode (near rangeLow, inside range). */
  rangeTpForShort: number | null;
  /** TP price for a LONG in range-mode (near rangeHigh, inside range). */
  rangeTpForLong: number | null;
  /** Tight SL outside range: for a SHORT this is above rangeHigh. */
  rangeSlForShort: number | null;
  /** Tight SL outside range: for a LONG this is below rangeLow. */
  rangeSlForLong: number | null;
  reason: string;
};

const cache = new Map<string, { at: number; result: RangeRegimeResult }>();
const CACHE_MS = 45_000;

/**
 * Detect whether price is in a tight range.
 *
 * @param coin  HL coin ticker (e.g. 'SOL')
 * @param lookback  number of 5m candles to scan (default 24 = 2h)
 */
export async function detectRangeRegime(
  coin: string,
  lookback = 24
): Promise<RangeRegimeResult> {
  const key = `${coin}:${lookback}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.result;

  const cfg = config.hyperliquid.rangeRegime;
  const symbol = hlCoinToBinanceSymbol(coin);

  let candles: Candle[];
  try {
    candles = await signalEngine.fetchCandles(symbol, '5m', lookback + 5);
  } catch {
    return noRange('candle fetch failed');
  }

  if (candles.length < lookback) {
    return noRange('insufficient candles');
  }

  const window = candles.slice(-lookback);
  const rangeHigh = Math.max(...window.map((c) => c.high));
  const rangeLow = Math.min(...window.map((c) => c.low));
  const rangeMid = (rangeHigh + rangeLow) / 2;

  if (rangeMid <= 0) return noRange('zero mid');

  const width = rangeHigh - rangeLow;
  const widthPct = width / rangeMid;

  const atr = calculateATR(candles, Math.min(14, lookback - 1));

  // --- Regime decision ---
  // 1. Range is tight if widthPct < threshold.
  const isTight = widthPct < cfg.maxRangeWidthPct;

  // 2. No strong trend: first close → last close move < trendExitPct of mid.
  const firstClose = window[0]?.close ?? rangeMid;
  const lastClose = window[window.length - 1]?.close ?? rangeMid;
  const trendMove = Math.abs(lastClose - firstClose) / rangeMid;
  const noTrend = trendMove < cfg.maxTrendMovePct;

  const isRange = isTight && noTrend;

  const slBuffer = atr > 0 ? atr * cfg.slAtrBufferMult : width * cfg.slWidthBufferFrac;
  const tpBuffer = atr > 0 ? atr * cfg.tpAtrBufferMult : width * cfg.tpWidthBufferFrac;

  const result: RangeRegimeResult = {
    isRange,
    rangeHigh,
    rangeLow,
    rangeMid,
    width,
    widthPct,
    atr,
    rangeTpForShort: isRange ? rangeLow + tpBuffer : null,
    rangeTpForLong: isRange ? rangeHigh - tpBuffer : null,
    rangeSlForShort: isRange ? rangeHigh + slBuffer : null,
    rangeSlForLong: isRange ? rangeLow - slBuffer : null,
    reason: isRange
      ? `Range regime — width ${(widthPct * 100).toFixed(2)}% < ${(cfg.maxRangeWidthPct * 100).toFixed(1)}%, trend move ${(trendMove * 100).toFixed(2)}%`
      : !isTight
        ? `Trend/wide — width ${(widthPct * 100).toFixed(2)}% ≥ ${(cfg.maxRangeWidthPct * 100).toFixed(1)}%`
        : `Trend — move ${(trendMove * 100).toFixed(2)}% ≥ ${(cfg.maxTrendMovePct * 100).toFixed(1)}%`,
  };

  cache.set(key, { at: Date.now(), result });
  return result;
}

function noRange(reason: string): RangeRegimeResult {
  return {
    isRange: false,
    rangeHigh: 0,
    rangeLow: 0,
    rangeMid: 0,
    width: 0,
    widthPct: 0,
    atr: 0,
    rangeTpForShort: null,
    rangeTpForLong: null,
    rangeSlForShort: null,
    rangeSlForLong: null,
    reason,
  };
}
