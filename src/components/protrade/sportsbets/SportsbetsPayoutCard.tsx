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
        <span className="hl-sb-muted">Enter stake to preview payout</span>
      </div>
    );
  }

  if (action === 'sell') {
    return (
      <div className="hl-sb-payout hl-sb-payout--compact">
        <div className="hl-sb-payout-row">
          <span>Receive</span>
          <strong>{fmtUsdSymbol(preview.stakeUsd)}</strong>
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
