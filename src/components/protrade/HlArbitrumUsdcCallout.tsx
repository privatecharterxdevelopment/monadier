import React from 'react';
import { AlertTriangle, Check, Loader2, X } from 'lucide-react';
import {
  HL_DEPOSIT_DO_NOT_USE,
  HL_DEPOSIT_RULE_HEADLINE,
  HL_DEPOSIT_RULE_SUBLINE,
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
};

const HlArbitrumUsdcCallout: React.FC<Props> = ({
  onArbitrum,
  chainId,
  switchBusy = false,
  onSwitch,
  usdcBalance = 0,
  balanceLoading = false,
  showBalance = false,
}) => {
  const wrongNetwork = hlDepositWrongNetworkMessage(chainId);

  return (
    <div className="hl-funds-deposit-rules">
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
            <strong className="hl-funds-chain__title">{HL_DEPOSIT_RULE_HEADLINE}</strong>
            {onArbitrum ? (
              <span className="hl-funds-chain__badge hl-funds-chain__badge--ok">
                <Check size={12} aria-hidden />
                On Arbitrum
              </span>
            ) : (
              <span className="hl-funds-chain__badge hl-funds-chain__badge--warn">Switch required</span>
            )}
          </div>
          <p className="hl-funds-chain__desc">{HL_DEPOSIT_RULE_SUBLINE}</p>
          {wrongNetwork ? (
            <p className="hl-funds-chain__wrong-net">
              <AlertTriangle size={14} aria-hidden />
              {wrongNetwork}
            </p>
          ) : null}
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

      <div className="hl-funds-deny" role="note" aria-label="Deposit restrictions">
        <p className="hl-funds-deny__title">
          <X size={14} aria-hidden />
          Do not use
        </p>
        <ul className="hl-funds-deny__list">
          {HL_DEPOSIT_DO_NOT_USE.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default HlArbitrumUsdcCallout;
