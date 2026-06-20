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
};

const SportsbetsPayoutCard: React.FC<Props> = ({ preview, action, loading }) => {
  if (loading || !preview) {
    return (
      <div className="hl-sb-payout hl-sb-payout--empty">
        <span className="hl-sb-muted">Enter stake to see payout estimate</span>
      </div>
    );
  }

  if (action === 'sell') {
    const proceeds = preview.stakeUsd;
    return (
      <div className="hl-sb-payout">
        <div className="hl-sb-payout-row">
          <span>You receive</span>
          <strong>{fmtUsdSymbol(proceeds)}</strong>
        </div>
        <div className="hl-sb-payout-row hl-sb-payout-row--sub">
          <span>{preview.contracts} contracts @ {formatOutcomePriceCents(preview.price)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="hl-sb-payout">
      <div className="hl-sb-payout-hero">
        <span className="hl-sb-payout-label">Potential return if win</span>
        <strong className="hl-sb-payout-profit">{fmtUsdSymbol(preview.payoutIfWin)}</strong>
        <span className="hl-sb-payout-sub">
          {formatProfitUsd(preview.profitIfWin)} profit on {fmtUsdSymbol(preview.stakeUsd)} stake
        </span>
      </div>
      <div className="hl-sb-payout-grid">
        <div>
          <span>You pay</span>
          <strong>{fmtUsdSymbol(preview.stakeUsd)}</strong>
        </div>
        <div>
          <span>Contracts</span>
          <strong>{preview.contracts.toLocaleString()}</strong>
        </div>
        <div>
          <span>Decimal odds</span>
          <strong>{formatDecimalOdds(preview.price)}×</strong>
        </div>
        <div>
          <span>Implied chance</span>
          <strong>{formatOutcomeImpliedPct(preview.price)}</strong>
        </div>
      </div>
      <p className="hl-sb-payout-formula">
        {preview.contracts.toLocaleString()} contracts × $1 payout @{' '}
        {formatOutcomePriceCents(preview.price)} each
      </p>
    </div>
  );
};

export default SportsbetsPayoutCard;
