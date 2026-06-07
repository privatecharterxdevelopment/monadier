import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppKit, useAppKitAccount } from '@reown/appkit/react';
import Logo from '../ui/Logo';

export type ProTradeSection =
  | 'perps'
  | 'spot'
  | 'swap'
  | 'portfolio'
  | 'affiliate'
  | 'leaderboard';

type NavItem = { id: ProTradeSection; label: string; enabled: boolean };

const NAV: NavItem[] = [
  { id: 'perps', label: 'Perps', enabled: true },
  { id: 'spot', label: 'Spot', enabled: true },
  { id: 'swap', label: 'Swap', enabled: true },
  { id: 'portfolio', label: 'Portfolio', enabled: true },
  { id: 'affiliate', label: 'Affiliate', enabled: false },
  { id: 'leaderboard', label: 'Leaderboard', enabled: false },
];

type Props = {
  section: ProTradeSection;
  onSectionChange: (section: ProTradeSection) => void;
};

const ProTradeTopNav: React.FC<Props> = ({ section, onSectionChange }) => {
  const navigate = useNavigate();
  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount();

  const walletLabel = isConnected && address
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : 'Connect';

  return (
    <header className="hl-topnav">
      <div className="hl-topnav-left">
        <a href="/" className="hl-topnav-logo" onClick={(e) => { e.preventDefault(); navigate('/'); }}>
          <Logo size="sm" theme="dark" />
        </a>
        <nav className="hl-topnav-links" aria-label="Hyperliquid sections">
          {NAV.map(({ id, label, enabled }) => (
            <button
              key={id}
              type="button"
              className={`hl-topnav-link ${section === id ? 'hl-topnav-link--active' : ''}`}
              onClick={() => enabled && onSectionChange(id)}
              disabled={!enabled}
              style={enabled ? undefined : { opacity: 0.35, cursor: 'not-allowed' }}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>
      <div className="hl-topnav-right">
        <button
          type="button"
          className="hl-topnav-bot"
          onClick={() => navigate('/dashboard2')}
        >
          Bot trade
        </button>
        <button
          type="button"
          className={`hl-topnav-wallet ${isConnected ? 'hl-topnav-wallet--connected' : ''}`}
          onClick={() => open()}
        >
          {walletLabel}
        </button>
      </div>
    </header>
  );
};

export default ProTradeTopNav;
