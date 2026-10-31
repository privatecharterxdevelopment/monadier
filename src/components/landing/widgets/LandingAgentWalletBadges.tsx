import React from 'react';

type WalletChip = {
  id: string;
  label: string;
  tone: 'orange' | 'blue' | 'yellow' | 'indigo';
  glyph: string;
};

export const LANDING_WALLET_CHIPS: WalletChip[] = [
  { id: 'metamask', label: 'MetaMask', tone: 'orange', glyph: 'M' },
  { id: 'coinbase', label: 'Coinbase', tone: 'blue', glyph: 'C' },
  { id: 'binance', label: 'Binance', tone: 'yellow', glyph: 'B' },
];

const LandingAgentWalletBadges: React.FC = () => (
  <div className="landing-agent-wallet-chips landing-agent-wallet-chips--copy" aria-label="Supported wallets">
    {LANDING_WALLET_CHIPS.map((wallet) => (
      <span key={wallet.id} className={`landing-agent-wallet-chip landing-agent-wallet-chip--${wallet.tone}`}>
        <span className="landing-agent-wallet-chip-glyph" aria-hidden>
          {wallet.glyph}
        </span>
        {wallet.label}
      </span>
    ))}
  </div>
);

export default LandingAgentWalletBadges;
