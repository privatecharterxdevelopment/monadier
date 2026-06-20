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
        <span className="hl-sb-muted">Enter stake to see payout</span>
      </div>
    );
  }

  if (action === 'sell') {
    return (
      <div className="hl-sb-payout">
        <div className="hl-sb-payout-row">
          <span>You receive</span>
          <strong>{fmtUsdSymbol(preview.stakeUsd)}</strong>
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
        <span className="hl-sb-payout-label">If this wins</span>
        <strong className="hl-sb-payout-profit">{fmtUsdSymbol(preview.payoutIfWin)}</strong>
        <span className="hl-sb-payout-sub">
          Stake {fmtUsdSymbol(preview.stakeUsd)} · profit {formatProfitUsd(preview.profitIfWin)}
        </span>
      </div>
      <div className="hl-sb-payout-grid">
        <div>
          <span>Decimal odds</span>
          <strong>{formatDecimalOdds(preview.price)}×</strong>
        </div>
        <div>
          <span>Implied</span>
          <strong>{formatOutcomeImpliedPct(preview.price)}</strong>
        </div>
        <div>
          <span>Contracts</span>
          <strong>{preview.contracts.toLocaleString()}</strong>
        </div>
        <div>
          <span>Price</span>
          <strong>{formatOutcomePriceCents(preview.price)}</strong>
        </div>
      </div>
    </div>
  );
};

export default SportsbetsPayoutCard;
