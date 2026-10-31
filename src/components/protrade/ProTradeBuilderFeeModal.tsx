import React from 'react';
import { Loader2, X } from 'lucide-react';
import { BRAND_NAME } from '../../lib/brand';

type Props = {
  feeLabelPerp: string;
  maxApprovalRate: string;
  busy: boolean;
  error: string | null;
  onApprove: () => void | Promise<void>;
  onClose: () => void;
};

const ProTradeBuilderFeeModal: React.FC<Props> = ({
  feeLabelPerp,
  maxApprovalRate,
  busy,
  error,
  onApprove,
  onClose,
}) => (
  <div className="hl-modal-backdrop" role="presentation" onClick={onClose}>
    <div
      className="hl-modal"
      role="dialog"
      aria-labelledby="hl-builder-fee-title"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="hl-modal-head">
        <h2 id="hl-builder-fee-title" className="hl-modal-title">
          Hyperliquid platform fee
        </h2>
        <button type="button" className="hl-modal-close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
      </div>
      <p className="hl-entry-hint" style={{ marginBottom: 12 }}>
        {BRAND_NAME} Pro Trade charges a {feeLabelPerp} success fee on profitable perp closes only — no
        fee on opens or losing closes. Spot sells use a small flat fee. Separate from Hyperliquid
        trading fees and the {BRAND_NAME} bot subscription.
      </p>
      <p className="hl-entry-hint" style={{ marginBottom: 12 }}>
        One-time approval (max {maxApprovalRate}). You sign with your wallet — {BRAND_NAME} never gets
        access to your funds.
      </p>
      {error ? <p className="hl-entry-err">{error}</p> : null}
      <button
        type="button"
        className="hl-entry-submit"
        disabled={busy}
        onClick={() => void onApprove()}
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : `Approve max ${maxApprovalRate}`}
      </button>
      <button type="button" className="hl-entry-foot-btn" style={{ width: '100%', marginTop: 8 }} onClick={onClose}>
        Not now
      </button>
    </div>
  </div>
);

export default ProTradeBuilderFeeModal;
