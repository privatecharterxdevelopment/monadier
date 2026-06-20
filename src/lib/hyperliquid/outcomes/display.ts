import { previewOutcomeBuy } from './payout';

/** Standard preview stake shown on outcome buttons (not $100). */
export const OUTCOME_PREVIEW_STAKE_USD = 10;

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

/** Sportsbook-style cell: big odds + “Win $X on $10”. */
export function formatOutcomeBetCell(
  price: number,
  stakeUsd = OUTCOME_PREVIEW_STAKE_USD
): { odds: string; winLine: string; implied: string } | null {
  if (!Number.isFinite(price) || price <= 0) return null;
  const preview = previewOutcomeBuy({ stakeUsd, price });
  if (!preview) return null;
  return {
    odds: formatDecimalOdds(price),
    winLine: `Win ${fmtPreviewUsd(preview.payoutIfWin)} on ${fmtPreviewUsd(stakeUsd)}`,
    implied: formatOutcomeImpliedPct(price),
  };
}

/** Human-readable stake preview for the order panel. */
export function formatStakeReturnPreview(stakeUsd: number, price: number): string | null {
  const preview = previewOutcomeBuy({ stakeUsd, price });
  if (!preview) return null;
  return `${formatDecimalOdds(price)}× odds · pay ${fmtPreviewUsd(preview.stakeUsd)} · return ${fmtPreviewUsd(preview.payoutIfWin)} if win`;
}
