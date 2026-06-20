import { previewOutcomeBuy } from './payout';

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

/** Compact line for outcome buttons — odds + implied %, not raw dollar profit. */
export function formatOutcomeButtonMeta(price: number): { odds: string; implied: string } {
  return {
    odds: formatDecimalOdds(price),
    implied: formatOutcomeImpliedPct(price),
  };
}

/** Human-readable stake preview for the order panel. */
export function formatStakeReturnPreview(stakeUsd: number, price: number): string | null {
  const preview = previewOutcomeBuy({ stakeUsd, price });
  if (!preview) return null;
  const odds = formatDecimalOdds(price);
  return `${preview.contracts.toLocaleString()} contracts · ${odds}× · return ${preview.payoutIfWin.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })} if win`;
}
