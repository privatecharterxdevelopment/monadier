import { toNum } from './parse';
import i18n from '../../i18n';

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

/** Trade / position PnL — 3 decimals so small HL moves are visible. */
export function fmtTradeUsd(value: unknown, digits = 3): string {
  return fmtUsd(value, digits);
}

export function fmtUsdSymbol(value: unknown, digits = 2): string {
  return `$${fmtUsd(value, digits)}`;
}

export function fmtTradeUsdSymbol(value: unknown): string {
  return fmtUsdSymbol(value, 3);
}

/** P/L display — extra decimals for tiny HL closes */
export function fmtClosedPnl(value: unknown): string {
  const n = toNum(value);
  if (!Number.isFinite(n)) return '—';
  if (n === 0) return '$0.000';
  const digits = Math.abs(n) < 0.001 ? 4 : 3;
  const sign = n > 0 ? '+' : '';
  return `${sign}${fmtUsdSymbol(n, digits)}`;
}

export function hlFillResultLabel(value: unknown): 'Win' | 'Loss' | 'Breakeven' | null {
  const n = toNum(value);
  if (!Number.isFinite(n)) return null;
  if (n > 0) return 'Win';
  if (n < 0) return 'Loss';
  return 'Breakeven';
}

export function fmtFillAction(dir?: unknown): string {
  const d = typeof dir === 'string' ? dir.trim() : '';
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

/** Closed leg — excludes opens and ambiguous zero-PnL noise rows. */
export function isHlFillClose(dir?: string, closedPnl?: unknown): boolean {
  if (isHlFillOpen(dir)) return false;
  const d = dir?.trim() ?? '';
  if (/^close/i.test(d) || /long\s*>\s*short|short\s*>\s*long/i.test(d)) return true;
  return toNum(closedPnl) !== 0;
}

function parseFillPositionDirection(dir: string): 'LONG' | 'SHORT' | null {
  const d = dir.toLowerCase();
  if (d.includes('long') && !d.includes('short')) return 'LONG';
  if (d.includes('short') && !d.includes('long')) return 'SHORT';
  if (d.includes('long') && d.includes('short')) {
    if (d.startsWith('long')) return 'LONG';
    if (d.startsWith('short')) return 'SHORT';
  }
  return null;
}

/** Position direction (LONG/SHORT) — not the fill side (Buy/Sell). */
export function fillPositionDirection(fill: {
  dir?: string;
  side: string;
}): 'LONG' | 'SHORT' {
  const dir = fill.dir?.trim() ?? '';
  const parsed = dir ? parseFillPositionDirection(dir) : null;
  if (parsed) return parsed;

  const isBuy = fill.side === 'B';
  if (isHlFillOpen(dir)) {
    return isBuy ? 'LONG' : 'SHORT';
  }
  // Close: sell closes a long, buy closes a short.
  return isBuy ? 'SHORT' : 'LONG';
}

export function fmtPct(value: unknown, digits = 2): string {
  const n = toNum(value);
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(digits)}%`;
}

/** Decimal places for perp/spot quote prices (UNI ~3.04 not "3"). */
export function priceFractionDigits(px: number): number {
  const abs = Math.abs(px);
  if (abs >= 1000) return 2;
  if (abs >= 100) return 2;
  if (abs >= 10) return 3;
  if (abs >= 1) return 4;
  if (abs >= 0.1) return 5;
  return 6;
}

export function fmtPrice(value: unknown, maxFractionDigits?: number): string {
  const n = toNum(value);
  const digits =
    maxFractionDigits != null ? maxFractionDigits : priceFractionDigits(n);
  return localeNumber(value, {
    minimumFractionDigits: Math.min(2, digits),
    maximumFractionDigits: digits,
  });
}

/** Order book / tape — always show meaningful decimals for the price level. */
export function fmtMarketPrice(value: unknown): string {
  const n = toNum(value);
  const digits = priceFractionDigits(n);
  return localeNumber(value, {
    minimumFractionDigits: digits >= 4 ? 2 : 0,
    maximumFractionDigits: digits,
  });
}

export function fmtSize(value: unknown, decimals = 4): string {
  const n = toNum(value);
  if (n >= 1000) return n.toFixed(1);
  if (n >= 10) return n.toFixed(2);
  return n.toFixed(decimals);
}

/**
 * Residual sizes after partial closes (e.g. 1e-5 BTC ≈ $0.64) are not real
 * positions — hide them from UI counts/lists so slots match what the user sees.
 */
export const HL_DUST_NOTIONAL_USD = 1;

export function isMeaningfulHlPosition(
  szi: unknown,
  entryPx: unknown,
  minNotionalUsd = HL_DUST_NOTIONAL_USD
): boolean {
  const size = toNum(szi);
  if (!Number.isFinite(size) || Math.abs(size) <= 1e-12) return false;
  const px = toNum(entryPx);
  const notional = Math.abs(size) * (Number.isFinite(px) && px > 0 ? px : 0);
  if (notional > 0) return notional >= minNotionalUsd;
  return Math.abs(size) >= 1e-6;
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

/** Short "since" label for trading timeline cards. */
export function fmtTradingSince(ms: unknown): string {
  const n = toNum(ms);
  if (n <= 0) return '—';
  const date = new Date(n);
  if (Number.isNaN(date.getTime())) return '—';

  const dateStr = date.toLocaleDateString(i18n.language || undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const days = Math.max(0, Math.floor((Date.now() - n) / 86_400_000));
  if (days < 1) return i18n.t('profile.botHistory.sinceToday', { date: dateStr });
  if (days < 30) {
    return i18n.t('profile.botHistory.sinceDays', { date: dateStr, count: days });
  }
  const months = Math.floor(days / 30);
  if (months < 12) {
    return i18n.t('profile.botHistory.sinceMonths', { date: dateStr, count: months });
  }
  const years = Math.floor(months / 12);
  return i18n.t('profile.botHistory.sinceYears', { date: dateStr, count: years });
}

export function fmtLeverage(value: unknown): string {
  const n = toNum(value);
  return n > 0 ? `${n}x` : '—';
}
