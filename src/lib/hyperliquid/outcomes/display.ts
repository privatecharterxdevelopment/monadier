import { formatProfitUsd, previewOutcomeBuy } from './payout';
import type { OutcomeLegQuote } from './types';

/** Standard preview stake shown on outcome buttons (not $100). */
export const OUTCOME_PREVIEW_STAKE_USD = 10;

/** True when quote comes from allMids only (no live ask on the book yet). */
export function isIndicativeOutcomeQuote(quote: OutcomeLegQuote | undefined): boolean {
  if (!quote) return false;
  return quote.yes.asks.length === 0 && quote.no.asks.length === 0;
}

/** Price per contract in cents (HL outcome books use 0–1 probability). */
export function formatOutcomePriceCents(price: number): string {
  if (!Number.isFinite(price) || price <= 0) return '—';
  const cents = price * 100;
  if (cents >= 10) return `${cents.toFixed(1)}¢`;
  if (cents >= 1) return `${cents.toFixed(2)}¢`;
  return `${cents.toFixed(cents >= 0.1 ? 2 : 3)}¢`;
}

/** Implied win probability from price. */
export function formatOutcomeImpliedPct(price: number): string {
  if (!Number.isFinite(price) || price <= 0) return '—';
  const pct = price * 100;
  if (pct >= 10) return `${pct.toFixed(1)}%`;
  if (pct >= 1) return `${pct.toFixed(2)}%`;
  if (pct >= 0.1) return `${pct.toFixed(2)}%`;
  return `${pct.toFixed(3)}%`;
}

/** European decimal odds (payout per $1 staked, incl. stake). */
export function formatDecimalOdds(price: number): string {
  if (!Number.isFinite(price) || price <= 0) return '—';
  const odds = 1 / price;
  if (odds >= 1000) return `${Math.round(odds)}`;
  if (odds >= 100) return odds.toFixed(0);
  if (odds >= 10) return odds.toFixed(1);
  return odds.toFixed(2);
}

function fmtPreviewUsd(value: number): string {
  if (value >= 1000) return `$${Math.round(value).toLocaleString()}`;
  if (value >= 100) return `$${value.toFixed(0)}`;
  return `$${value.toFixed(2)}`;
}

/** Sportsbook-style cell: big odds + profit preview on standard stake. */
export function formatOutcomeBetCell(
  price: number,
  stakeUsd = OUTCOME_PREVIEW_STAKE_USD,
  opts?: { indicative?: boolean }
): { odds: string; winLine: string; implied: string } | null {
  if (!Number.isFinite(price) || price <= 0) return null;
  const preview = previewOutcomeBuy({ stakeUsd, price });
  if (!preview) return null;
  const prefix = opts?.indicative ? '~' : '';
  return {
    odds: prefix + formatDecimalOdds(price),
    winLine: `${prefix}${formatProfitUsd(preview.profitIfWin)} profit · ${fmtPreviewUsd(preview.stakeUsd)} stake`,
    implied: formatOutcomeImpliedPct(price),
  };
}

/** Human-readable stake preview for the order panel. */
export function formatStakeReturnPreview(stakeUsd: number, price: number): string | null {
  const preview = previewOutcomeBuy({ stakeUsd, price });
  if (!preview) return null;
  return `${formatDecimalOdds(price)}× · ${fmtPreviewUsd(preview.stakeUsd)} stake · ${formatProfitUsd(preview.profitIfWin)} profit · ${fmtPreviewUsd(preview.payoutIfWin)} return if win`;
}
