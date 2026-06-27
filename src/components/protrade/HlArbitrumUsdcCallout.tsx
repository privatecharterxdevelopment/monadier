import React from 'react';
import { AlertTriangle, Check, Loader2 } from 'lucide-react';
import {
  HL_DEPOSIT_RULE_HEADLINE,
  hlDepositWrongNetworkMessage,
} from '../../lib/hlDepositRules';

const ARBITRUM_LOGO = '/images/partners/arbitrum.svg';
const USDC_LOGO = '/images/partners/usdc.svg';

type Props = {
  onArbitrum: boolean;
  chainId?: number;
  switchBusy?: boolean;
  onSwitch?: () => void;
  usdcBalance?: number;
  balanceLoading?: boolean;
  showBalance?: boolean;
  compact?: boolean;
};

const HlArbitrumUsdcCallout: React.FC<Props> = ({
  onArbitrum,
  chainId,
  switchBusy = false,
  onSwitch,
  usdcBalance = 0,
  balanceLoading = false,
  showBalance = false,
  compact = false,
}) => {
  const wrongNetwork = hlDepositWrongNetworkMessage(chainId);

  return (
    <div className={`hl-funds-deposit-rules${compact ? ' hl-funds-deposit-rules--compact' : ''}`}>
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
            <strong className="hl-funds-chain__title">
              {compact ? 'Native USDC · Arbitrum' : HL_DEPOSIT_RULE_HEADLINE}
            </strong>
            {onArbitrum ? (
              <span className="hl-funds-chain__badge hl-funds-chain__badge--ok">
                <Check size={12} aria-hidden />
                OK
              </span>
            ) : (
              <span className="hl-funds-chain__badge hl-funds-chain__badge--warn">Switch</span>
            )}
          </div>
          {wrongNetwork ? (
            <p className="hl-funds-chain__wrong-net">
              <AlertTriangle size={14} aria-hidden />
              {wrongNetwork}
            </p>
          ) : null}
          {showBalance && onArbitrum ? (
            <p className="hl-funds-chain__balance">
              Wallet:{' '}
              <strong>{balanceLoading ? '…' : `${usdcBalance.toFixed(2)} USDC`}</strong>
            </p>
          ) : null}
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
            Arbitrum
          </button>
        ) : null}
      </div>
    </div>
  );
};

export default HlArbitrumUsdcCallout;
