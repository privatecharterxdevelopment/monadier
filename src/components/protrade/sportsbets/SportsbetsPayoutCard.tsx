import React from 'react';
import {
  formatDecimalOdds,
  formatOutcomeImpliedPct,
  formatOutcomePriceCents,
} from '../../../lib/hyperliquid/outcomes/display';
import { formatProfitUsd, type OutcomePayoutPreview } from '../../../lib/hyperliquid/outcomes/payout';
import { fmtUsdSymbol } from '../../../lib/hyperliquid/format';

type Props = {
  preview: OutcomePayoutPreview | null;
  action: 'buy' | 'sell';
  loading?: boolean;
  /** When true, hide contracts/¢ jargon for the default bet flow. */
  simple?: boolean;
};

const SportsbetsPayoutCard: React.FC<Props> = ({ preview, action, loading, simple = true }) => {
  if (loading || !preview) {
    return (
      <div className="hl-sb-payout hl-sb-payout--hero-panel hl-sb-payout--empty">
        <span className="hl-sb-payout-hero-label">Enter stake to preview payout</span>
      </div>
    );
  }

  if (action === 'sell') {
    return (
      <div className="hl-sb-payout hl-sb-payout--hero-panel hl-sb-payout--hero-panel-sell">
        <div className="hl-sb-payout-hero-main">
          <span className="hl-sb-payout-hero-label">You receive</span>
          <strong className="hl-sb-payout-hero-win">{fmtUsdSymbol(preview.stakeUsd)}</strong>
        </div>
        {!simple ? (
          <p className="hl-sb-payout-meta">
            {Math.floor(preview.contracts).toLocaleString()} contracts @{' '}
            {formatOutcomePriceCents(preview.price)}
          </p>
        ) : null}
      </div>
    );
  }

  if (simple) {
    return (
      <div className="hl-sb-payout hl-sb-payout--hero-panel" aria-label="Payout preview">
        <div className="hl-sb-payout-hero-main">
          <span className="hl-sb-payout-hero-label">Win</span>
          <strong className="hl-sb-payout-hero-win">{fmtUsdSymbol(preview.payoutIfWin)}</strong>
        </div>
        <div className="hl-sb-payout-hero-grid">
          <div className="hl-sb-payout-hero-stat">
            <span>Stake</span>
            <strong>{fmtUsdSymbol(preview.stakeUsd)}</strong>
          </div>
          <div className="hl-sb-payout-hero-stat hl-sb-payout-hero-stat--profit">
            <span>Profit</span>
            <strong>{formatProfitUsd(preview.profitIfWin)}</strong>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="hl-sb-payout hl-sb-payout--compact">
      <div className="hl-sb-payout-row">
        <span>Profit if win</span>
        <strong className="hl-sb-payout-profit">{formatProfitUsd(preview.profitIfWin)}</strong>
      </div>
      <p className="hl-sb-payout-meta">
        {formatDecimalOdds(preview.price)}× · {formatOutcomeImpliedPct(preview.price)} ·{' '}
        {fmtUsdSymbol(preview.stakeUsd)} stake · {Math.floor(preview.contracts).toLocaleString()}{' '}
        contracts @ {formatOutcomePriceCents(preview.price)} · return {fmtUsdSymbol(preview.payoutIfWin)}
      </p>
    </div>
  );
};

export default SportsbetsPayoutCard;
