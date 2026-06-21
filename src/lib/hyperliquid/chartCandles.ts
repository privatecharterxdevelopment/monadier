import type { HlCandleBar } from './types';

/** Drop corrupt OHLC bars (wrong coin / bad WS) that flatten the chart to 0–70k. */
export function sanitizeChartCandles(
  candles: HlCandleBar[],
  refPx?: number
): HlCandleBar[] {
  if (candles.length === 0) return candles;

  const ref =
    refPx && refPx > 0
      ? refPx
      : candles[candles.length - 1]?.close ?? candles[candles.length - 1]?.open ?? 0;
  if (!ref || ref <= 0) return candles;

  const lo = ref * 0.55;
  const hi = ref * 1.45;

  const inBand = (v: number) => Number.isFinite(v) && v >= lo && v <= hi;

  return candles
    .map((c) => {
      if (!inBand(c.open) || !inBand(c.close) || !inBand(c.high) || !inBand(c.low)) {
        return null;
      }
      if (c.high < c.low) return null;
      return c;
    })
    .filter((c): c is HlCandleBar => c != null);
}

export function candlePriceRange(
  candles: HlCandleBar[],
  refPx?: number,
  extraPx: number[] = []
): { minValue: number; maxValue: number } | null {
  const clean = sanitizeChartCandles(candles, refPx);
  if (clean.length < 2) return null;

  const ref =
    refPx && refPx > 0 ? refPx : clean[clean.length - 1].close;
  let minV = ref;
  let maxV = ref;

  for (const c of clean.slice(-120)) {
    minV = Math.min(minV, c.low);
    maxV = Math.max(maxV, c.high);
  }
  for (const px of extraPx) {
    if (px > 0) {
      minV = Math.min(minV, px);
      maxV = Math.max(maxV, px);
    }
  }

  if (!Number.isFinite(minV) || !Number.isFinite(maxV) || maxV <= minV) return null;

  const span = maxV - minV;
  const mid = (maxV + minV) / 2;
  const minSpan = mid * 0.004;
  if (span < minSpan) {
    const half = minSpan / 2;
    return { minValue: mid - half, maxValue: mid + half };
  }
  const pad = span * 0.06;
  return { minValue: minV - pad, maxValue: maxV + pad };
}
