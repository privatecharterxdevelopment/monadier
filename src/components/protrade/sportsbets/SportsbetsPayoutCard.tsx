import React from 'react';
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
        <span className="hl-sb-muted">Enter stake to see win preview</span>
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
          <span>{preview.contracts} contracts @ {preview.price.toFixed(4)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="hl-sb-payout">
      <div className="hl-sb-payout-hero">
        <span className="hl-sb-payout-label">If you win</span>
        <strong className="hl-sb-payout-profit">{formatProfitUsd(preview.profitIfWin)}</strong>
      </div>
      <div className="hl-sb-payout-grid">
        <div>
          <span>You pay</span>
          <strong>{fmtUsdSymbol(preview.stakeUsd)}</strong>
        </div>
        <div>
          <span>Total return</span>
          <strong>{fmtUsdSymbol(preview.payoutIfWin)}</strong>
        </div>
        <div>
          <span>Odds</span>
          <strong>{preview.impliedPct.toFixed(1)}%</strong>
        </div>
        <div>
          <span>Multiplier</span>
          <strong>{preview.returnMultiple.toFixed(2)}×</strong>
        </div>
      </div>
      <p className="hl-sb-payout-formula">
        {fmtUsdSymbol(preview.stakeUsd)} stake → {formatProfitUsd(preview.profitIfWin)} profit
        ({preview.contracts} contracts @ {(preview.price * 100).toFixed(1)}¢)
      </p>
    </div>
  );
};

export default SportsbetsPayoutCard;
