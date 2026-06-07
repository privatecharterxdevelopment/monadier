import { toNum } from './parse';

/** Never call `.toLocaleString` on a value that might not be a finite number. */
function localeNumber(value: unknown, options?: Intl.NumberFormatOptions): string {
  const n = toNum(value);
  const safe = typeof n === 'number' && Number.isFinite(n) ? n : 0;
  return safe.toLocaleString(undefined, options);
}

export function fmtUsd(value: unknown, digits = 2): string {
  return localeNumber(value, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtUsdSymbol(value: unknown, digits = 2): string {
  return `$${fmtUsd(value, digits)}`;
}

export function fmtPct(value: unknown, digits = 2): string {
  const n = toNum(value);
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(digits)}%`;
}

export function fmtPrice(value: unknown, maxFractionDigits = 2): string {
  return localeNumber(value, { maximumFractionDigits: maxFractionDigits });
}

export function fmtSize(value: unknown, decimals = 4): string {
  const n = toNum(value);
  if (n >= 1000) return n.toFixed(1);
  if (n >= 10) return n.toFixed(2);
  return n.toFixed(decimals);
}

export function fmtTimeMs(ms: unknown): string {
  const n = toNum(ms);
  if (n <= 0) return '—';
  const date = new Date(n);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function fmtLeverage(value: unknown): string {
  const n = toNum(value);
  return n > 0 ? `${n}x` : '—';
}
