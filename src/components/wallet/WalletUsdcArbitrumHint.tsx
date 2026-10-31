import React from 'react';
import { HL_DEPOSIT_CHAIN_LABEL, HL_DEPOSIT_TOKEN } from '../../lib/hlDepositRules';

const ARBITRUM_LOGO = '/images/partners/arbitrum.svg';
const USDC_LOGO = '/images/partners/usdc.svg';

type Props = {
  compact?: boolean;
  className?: string;
};

const WalletUsdcArbitrumHint: React.FC<Props> = ({ compact = false, className = '' }) => (
  <div
    className={['wallet-usdc-arb-hint', compact ? 'wallet-usdc-arb-hint--compact' : '', className]
      .filter(Boolean)
      .join(' ')}
    role="note"
  >
    <div className="wallet-usdc-arb-hint__brand" aria-hidden>
      <img src={ARBITRUM_LOGO} alt="" className="wallet-usdc-arb-hint__logo" />
      <img src={USDC_LOGO} alt="" className="wallet-usdc-arb-hint__logo wallet-usdc-arb-hint__logo--usdc" />
    </div>
    <div className="wallet-usdc-arb-hint__copy">
      <strong className="wallet-usdc-arb-hint__title">
        {HL_DEPOSIT_TOKEN} on {HL_DEPOSIT_CHAIN_LABEL}
      </strong>
      <p className="wallet-usdc-arb-hint__desc">
        {compact
          ? 'Use native USDC on Arbitrum One. MetaMask may show ETH — that is only for gas.'
          : 'Connect on Arbitrum One with native USDC. MetaMask shows ETH for gas fees; deposits and trading use USDC on Arbitrum — not BNB, ETH mainnet, or USDC on other chains.'}
      </p>
    </div>
  </div>
);

export default WalletUsdcArbitrumHint;
