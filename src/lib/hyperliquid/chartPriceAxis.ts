import type { BarPrice, PriceFormatBuiltIn, TickmarksPriceFormatterFn } from 'lightweight-charts';
import { priceFractionDigits } from './format';

/** Decimal places for Y-axis ticks — adapts to visible span so zoomed grids stay readable. */
export function chartAxisPrecision(span: number, refPx: number): number {
  const base = priceFractionDigits(refPx);
  let digits = base;

  if (Number.isFinite(span) && span > 0) {
    const approxStep = span / 6;
    if (approxStep > 0) {
      digits = Math.max(base, Math.ceil(-Math.log10(approxStep)) + 1);
    }
  } else {
    digits = base + 1;
  }

  return Math.min(8, Math.max(2, digits));
}

export function fmtChartAxisPrice(price: number, digits: number): string {
  if (!Number.isFinite(price)) return '—';
  return price.toLocaleString('en-US', {
    useGrouping: price >= 10_000,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Bump precision until adjacent grid labels are not identical (e.g. three × 0.32). */
function distinctTickDigits(nums: number[]): number {
  if (nums.length === 0) return 4;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const mid = (max + min) / 2;
  let digits = chartAxisPrecision(max - min, mid);

  while (digits < 8) {
    const labels = nums.map((p) => fmtChartAxisPrice(p, digits));
    if (new Set(labels).size === labels.length) break;
    digits += 1;
  }

  return digits;
}

export function buildChartTickmarksFormatter(refPx: number): TickmarksPriceFormatterFn {
  return (prices: BarPrice[]) => {
    const nums = prices.map((p) => Number(p));
    const digits = distinctTickDigits(nums.length ? nums : [refPx]);
    return nums.map((p) => fmtChartAxisPrice(Number(p), digits));
  };
}

export function buildChartPriceFormatter(refPx: number) {
  return (price: BarPrice) => {
    const p = Number(price);
    const digits = chartAxisPrecision(0, p > 0 ? p : refPx);
    return fmtChartAxisPrice(p, digits);
  };
}

export function buildSeriesPriceFormat(refPx: number): PriceFormatBuiltIn {
  const precision = Math.min(chartAxisPrecision(refPx * 0.02, refPx), 8);
  const minMove = 1 / 10 ** precision;
  return { type: 'price', precision, minMove };
}
