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
      <div className="hl-sb-payout hl-sb-payout--simple">
        <div className="hl-sb-payout-row hl-sb-payout-row--hero">
          <span>Return if win</span>
          <strong>{fmtUsdSymbol(preview.payoutIfWin)}</strong>
        </div>
        <p className="hl-sb-payout-simple">
          Pay {fmtUsdSymbol(preview.stakeUsd)} · profit {formatProfitUsd(preview.profitIfWin)} ·{' '}
          {formatDecimalOdds(preview.price)}× odds
        </p>
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
