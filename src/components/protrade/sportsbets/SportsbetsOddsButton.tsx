import React from 'react';
import type { OutcomeBetCellParts } from '../../../lib/hyperliquid/outcomes/display';

type Props = {
  side: 'Yes' | 'No';
  parts: OutcomeBetCellParts | null;
  picked: boolean;
  variant: 'yes' | 'no';
  onClick: () => void;
};

const SportsbetsOddsButton: React.FC<Props> = ({ side, parts, picked, variant, onClick }) => (
  <button
    type="button"
    className={`hl-sb-odds-cell hl-sb-odds-cell--${variant} ${picked ? 'hl-sb-odds-cell--picked' : ''}`}
    onClick={onClick}
  >
    <span className="hl-sb-odds-side">{side}</span>
    {parts ? (
      <>
        <span className="hl-sb-odds-val">{parts.odds}</span>
        <span className="hl-sb-odds-implied">{parts.implied} implied</span>
        <span className="hl-sb-odds-meta">
          {parts.profitLabel ? (
            <>
              <span className="hl-sb-odds-profit">{parts.profitLabel} profit</span>
              <span className="hl-sb-odds-stake">
                {parts.stakeLabel} stake → {parts.payoutLabel} return
              </span>
            </>
          ) : (
            <span className="hl-sb-odds-stake">{parts.stakeLabel} stake · returns stake</span>
          )}
        </span>
      </>
    ) : (
      <span className="hl-sb-odds-val hl-sb-odds-val--empty">—</span>
    )}
  </button>
);

export default SportsbetsOddsButton;
