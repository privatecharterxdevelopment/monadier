import React from 'react';
import { Check, Loader2 } from 'lucide-react';

const ARBITRUM_LOGO = '/images/partners/arbitrum.svg';
const USDC_LOGO = '/images/partners/usdc.svg';

type Props = {
  onArbitrum: boolean;
  switchBusy?: boolean;
  onSwitch?: () => void;
  usdcBalance?: number;
  balanceLoading?: boolean;
  showBalance?: boolean;
};

const HlArbitrumUsdcCallout: React.FC<Props> = ({
  onArbitrum,
  switchBusy = false,
  onSwitch,
  usdcBalance = 0,
  balanceLoading = false,
  showBalance = false,
}) => (
  <div
    className={`hl-funds-chain ${onArbitrum ? 'hl-funds-chain--ready' : 'hl-funds-chain--switch'}`}
    role="status"
  >
    <div className="hl-funds-chain__brand" aria-hidden>
      <img src={ARBITRUM_LOGO} alt="" className="hl-funds-chain__logo hl-funds-chain__logo--arb" />
      <img src={USDC_LOGO} alt="" className="hl-funds-chain__logo hl-funds-chain__logo--usdc" />
    </div>

    <div className="hl-funds-chain__copy">
      <div className="hl-funds-chain__title-row">
        <strong className="hl-funds-chain__title">Native USDC on Arbitrum One</strong>
        {onArbitrum ? (
          <span className="hl-funds-chain__badge hl-funds-chain__badge--ok">
            <Check size={12} aria-hidden />
            On Arbitrum
          </span>
        ) : (
          <span className="hl-funds-chain__badge hl-funds-chain__badge--warn">Switch required</span>
        )}
      </div>
      <p className="hl-funds-chain__desc">
        Hyperliquid only accepts USDC from <strong>Arbitrum</strong> (native USDC, not USDC.e). Funds
        credit in ~1 min after bridge.
      </p>
      {showBalance && onArbitrum && (
        <p className="hl-funds-chain__balance">
          Wallet balance:{' '}
          <strong>{balanceLoading ? '…' : `${usdcBalance.toFixed(2)} USDC`}</strong>
        </p>
      )}
    </div>

    {!onArbitrum && onSwitch ? (
      <button
        type="button"
        className="hl-funds-chain__action"
        disabled={switchBusy}
        onClick={() => void onSwitch()}
      >
        {switchBusy ? (
          <Loader2 size={14} className="animate-spin" aria-hidden />
        ) : (
          <img src={ARBITRUM_LOGO} alt="" className="hl-funds-chain__action-logo" aria-hidden />
        )}
        Switch to Arbitrum
      </button>
    ) : null}
  </div>
);

export default HlArbitrumUsdcCallout;
