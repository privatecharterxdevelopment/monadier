import React from 'react';
import type { OutcomeBetCellParts } from '../../../lib/hyperliquid/outcomes/display';

type Props = {
  side: 'Yes' | 'No';
  parts: OutcomeBetCellParts | null;
  picked: boolean;
  variant: 'yes' | 'no';
  onClick: () => void;
};

function compactLine(parts: OutcomeBetCellParts): string {
  if (parts.profitLabel) {
    return `${parts.profitLabel} on ${parts.stakeLabel}`;
  }
  return `${parts.stakeLabel} · returns stake`;
}

const SportsbetsOddsButton: React.FC<Props> = ({ side, parts, picked, variant, onClick }) => (
  <button
    type="button"
    className={`hl-sb-odds-cell hl-sb-odds-cell--${variant} ${picked ? 'hl-sb-odds-cell--picked' : ''}`}
    aria-pressed={picked}
    onClick={onClick}
  >
    <span className="hl-sb-odds-side">{side}</span>
    {parts ? (
      <span className="hl-sb-odds-main">
        <span className="hl-sb-odds-val">{parts.odds}</span>
        <span className="hl-sb-odds-line">{compactLine(parts)}</span>
      </span>
    ) : (
      <span className="hl-sb-odds-val hl-sb-odds-val--empty">—</span>
    )}
  </button>
);

export default SportsbetsOddsButton;
