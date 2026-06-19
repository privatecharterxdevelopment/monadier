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

/** P/L display — extra decimals for tiny HL closes so $0.07 does not show as $0.00 */
export function fmtClosedPnl(value: unknown): string {
  const n = toNum(value);
  if (!Number.isFinite(n) || n === 0) return '—';
  const digits = Math.abs(n) < 0.01 ? 4 : 2;
  const sign = n > 0 ? '+' : '';
  return `${sign}${fmtUsdSymbol(n, digits)}`;
}

export function fmtFillAction(dir?: string): string {
  const d = (dir ?? '').trim();
  if (!d) return '—';
  if (/^open/i.test(d)) return 'Open';
  if (/^close/i.test(d)) return 'Close';
  if (/long\s*>\s*short|short\s*>\s*long/i.test(d)) return 'Close';
  return d.split(/\s/)[0] ?? '—';
}

export function isHlFillOpen(dir?: string): boolean {
  const action = fmtFillAction(dir);
  return action === 'Open';
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
