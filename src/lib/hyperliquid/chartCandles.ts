import type { HlCandleBar } from './types';

export type ChartCandleResolve = {
  candles: HlCandleBar[];
  rawCount: number;
  cleanCount: number;
  dropped: number;
  usedFallback: boolean;
};

/** Drop duplicate timestamps (HL pages / WS races) — LWC setData throws on duplicates. */
export function dedupeChartCandles(candles: HlCandleBar[]): HlCandleBar[] {
  if (candles.length <= 1) return candles;
  const byTime = new Map<number, HlCandleBar>();
  for (const c of candles) {
    if (!Number.isFinite(c.time) || c.time <= 0) continue;
    byTime.set(c.time, c);
  }
  if (byTime.size === candles.length) return candles;
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

/** Sanitize for display; if band filter removes everything, keep raw bars so chart never goes blank. */
export function resolveChartCandlesForDisplay(
  candles: HlCandleBar[],
  refPx?: number
): ChartCandleResolve {
  const deduped = dedupeChartCandles(candles);
  const rawCount = deduped.length;
  if (rawCount === 0) {
    return { candles: [], rawCount: 0, cleanCount: 0, dropped: 0, usedFallback: false };
  }
  const clean = sanitizeChartCandles(deduped, refPx);
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
    candles: deduped,
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

/** Drop corrupt / wrong-asset bars only (e.g. BTC ~70k injected into a micro-priced alt). */
const SANITIZE_BAND_LO = 0.01;
const SANITIZE_BAND_HI = 100;

/**
 * Band is intentionally wide — a tight ±45% band nuked meme/alt history on big dumps.
 */
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

/**
 * On a coin switch the incoming markPx can briefly belong to the previous pair
 * (e.g. BTC ~64k patched onto an ETH ~1870 bar) — Math.max/min then stretches the
 * forming candle across the whole chart. Reject any mark that deviates wildly from
 * the last close: a same-coin bar never moves this much within one candle, while a
 * wrong-coin/stale mark is always far outside the band.
 */
const FORMING_MARK_BAND_LO = 0.5;
const FORMING_MARK_BAND_HI = 2;

/** Live mark patches the forming bar (TradingView-style wick/close). */
export function patchFormingCandleWithMark(
  candles: HlCandleBar[],
  markPx?: number
): HlCandleBar[] {
  if (!markPx || markPx <= 0 || candles.length === 0) return candles;
  const last = candles[candles.length - 1];
  const ref = last.close > 0 ? last.close : last.open;
  if (ref > 0) {
    const ratio = markPx / ref;
    if (ratio < FORMING_MARK_BAND_LO || ratio > FORMING_MARK_BAND_HI) return candles;
  }
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
    if (!(px > 0)) continue;
    // Ignore stray overlays that sit far from the candle band (ghost stops, wrong-coin mark).
    if (ref > 0 && (px < ref * 0.7 || px > ref * 1.3)) continue;
    minV = Math.min(minV, px);
    maxV = Math.max(maxV, px);
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
