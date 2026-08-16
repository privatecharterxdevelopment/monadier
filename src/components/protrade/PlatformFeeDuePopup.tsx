import React from 'react';
import { Wallet, X } from 'lucide-react';
import { fmtUsdSymbol } from '../../lib/hyperliquid/format';

type Props = {
  open: boolean;
  accruedUsd: number;
  successWinCount: number;
  winsBeforeBlock: number;
  onClose: () => void;
  onPay: () => void;
};

/** Compact gate when unpaid win fees hit the open-block threshold. */
const PlatformFeeDuePopup: React.FC<Props> = ({
  open,
  accruedUsd,
  successWinCount,
  winsBeforeBlock,
  onClose,
  onPay,
}) => {
  if (!open) return null;

  return (
    <div className="hl-fee-due-backdrop" role="dialog" aria-modal aria-labelledby="hl-fee-due-title">
      <div className="hl-fee-due-popup">
        <button
          type="button"
          className="hl-fee-due-close"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={16} strokeWidth={2.25} aria-hidden />
        </button>
        <h2 id="hl-fee-due-title">Pay fees now and reactivate the bot</h2>
        <p>
          You hit {successWinCount}/{winsBeforeBlock} winning bot closes. New opens are paused until
          you pay the 10% success fee ({fmtUsdSymbol(accruedUsd)}).
        </p>
        <button type="button" className="hl-fee-due-pay" onClick={onPay}>
          <Wallet size={15} aria-hidden />
          Pay Fees · {fmtUsdSymbol(accruedUsd)}
        </button>
      </div>
    </div>
  );
};

export default PlatformFeeDuePopup;
