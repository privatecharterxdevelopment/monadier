import type { HlCandleBar } from './types';

export type ChartCandleResolve = {
  candles: HlCandleBar[];
  rawCount: number;
  cleanCount: number;
  dropped: number;
  usedFallback: boolean;
};

/** Sanitize for display; if band filter removes everything, keep raw bars so chart never goes blank. */
export function resolveChartCandlesForDisplay(
  candles: HlCandleBar[],
  refPx?: number
): ChartCandleResolve {
  const rawCount = candles.length;
  if (rawCount === 0) {
    return { candles: [], rawCount: 0, cleanCount: 0, dropped: 0, usedFallback: false };
  }
  const clean = sanitizeChartCandles(candles, refPx);
  if (clean.length > 0) {
    return {
      candles: clean,
      rawCount,
      cleanCount: clean.length,
      dropped: rawCount - clean.length,
      usedFallback: false,
    };
  }
  return {
    candles,
    rawCount,
    cleanCount: rawCount,
    dropped: 0,
    usedFallback: true,
  };
}

/** Prefer candle close — markPx can lag one coin behind after switching pairs. */
export function chartSanitizeRef(candles: HlCandleBar[], markPx?: number): number | undefined {
  const fromBar = candles[candles.length - 1]?.close ?? candles[0]?.close ?? 0;
  if (!(fromBar > 0)) return markPx && markPx > 0 ? markPx : undefined;
  if (!markPx || markPx <= 0) return fromBar;
  const ratio = markPx / fromBar;
  if (ratio >= 0.85 && ratio <= 1.15) return fromBar;
  return fromBar;
}

/**
 * Drop corrupt / wrong-asset bars only (e.g. BTC ~70k injected into CASHCAT ~0.1).
 * Band is intentionally wide — tight ±45% nuked real meme history (CASHCAT 1h lost ~2/3 bars).
 */
const SANITIZE_BAND_LO = 0.01;
const SANITIZE_BAND_HI = 100;

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

  const lo = ref * SANITIZE_BAND_LO;
  const hi = ref * SANITIZE_BAND_HI;

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

/** Live mark patches the forming bar (TradingView-style wick/close). */
export function patchFormingCandleWithMark(
  candles: HlCandleBar[],
  markPx?: number
): HlCandleBar[] {
  if (!markPx || markPx <= 0 || candles.length === 0) return candles;
  const last = candles[candles.length - 1];
  const close = markPx;
  const high = Math.max(last.high, markPx);
  const low = Math.min(last.low, markPx);
  if (close === last.close && high === last.high && low === last.low) return candles;
  return [...candles.slice(0, -1), { ...last, close, high, low }];
}

export function candlePriceRange(
  candles: HlCandleBar[],
  refPx?: number,
  extraPx: number[] = []
): { minValue: number; maxValue: number } | null {
  const clean = sanitizeChartCandles(candles, refPx);
  if (clean.length === 0) return null;

  const ref =
    refPx && refPx > 0 ? refPx : clean[clean.length - 1].close;
  let minV = ref;
  let maxV = ref;

  const slice = clean.slice(-120);
  for (const c of slice) {
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
