import React, { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { useAppKit, useAppKitAccount } from '@reown/appkit/react';
import Logo from '../ui/Logo';
import DockCountBadge from './DockCountBadge';
import ProTradeAccountMenu from './ProTradeAccountMenu';
import ProTradeNotificationsBell from './ProTradeNotificationsBell';
import ProTradeBettingTopBarBalance from './ProTradeBettingTopBarBalance';
import ProTradeThemeIcon from './ProTradeThemeIcon';
import { useProTradeTheme } from '../../contexts/ProTradeThemeContext';
import type { ProTradeProfileTab } from './proTradeProfileTypes';
import type { ActivityNotification } from '../../lib/activityNotifications';
import { getLandingPageUrl, goToLanding } from '../../lib/appUrls';

export type ProTradeSection =
  | 'perps'
  | 'bot'
  | 'sportsbets'
  | 'swap'
  | 'portfolio'
  | 'profile'
  | 'history'
  | 'affiliate'
  | 'leaderboard';

/** @deprecated Use section === 'bot' instead */
export type ProTradePanelMode = 'hl' | 'bot';

type NavItem = {
  id: ProTradeSection;
  label: string;
  enabled: boolean;
};

const NAV: NavItem[] = [
  { id: 'perps', label: 'Perps', enabled: true },
  { id: 'sportsbets', label: 'Betting', enabled: true },
  { id: 'swap', label: 'Swap', enabled: true },
  { id: 'portfolio', label: 'Portfolio', enabled: true },
  { id: 'leaderboard', label: 'Leaderboard', enabled: false },
];

type Props = {
  section: ProTradeSection;
  onSectionChange: (section: ProTradeSection) => void;
  onBotTradeToggle: () => void;
  botOpenCount?: number;
  botOpenTone?: 'pos' | 'neg' | null;
  onOpenSupport?: () => void;
  onOpenProfile?: (tab?: ProTradeProfileTab) => void;
  onRequireSignIn?: (reason: string) => void;
  onViewNotificationHistory?: (notification?: ActivityNotification) => void;
  walletAddress?: string;
  walletConnected?: boolean;
};

const ProTradeTopNav: React.FC<Props> = ({
  section,
  onSectionChange,
  onBotTradeToggle,
  botOpenCount = 0,
  botOpenTone = null,
  onOpenSupport,
  onOpenProfile,
  onRequireSignIn,
  onViewNotificationHistory,
  walletAddress,
  walletConnected = false,
}) => {
  const { isLight } = useProTradeTheme();
  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount();

  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const walletLabel = isConnected && address
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : 'Connect';

  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileNavOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [mobileNavOpen]);

  const pickSection = (id: ProTradeSection, enabled: boolean) => {
    if (!enabled) return;
    onSectionChange(id);
    setMobileNavOpen(false);
  };

  return (
    <header className="hl-topnav">
      <div className="hl-topnav-left">
        <button
          type="button"
          className="hl-topnav-menu-btn"
          aria-label="Open menu"
          aria-expanded={mobileNavOpen}
          onClick={() => setMobileNavOpen(true)}
        >
          <Menu size={18} />
        </button>
        <a
          href={getLandingPageUrl()}
          className="hl-topnav-logo"
          onClick={(e) => {
            e.preventDefault();
            const inApp = goToLanding();
            if (inApp) window.location.assign(inApp);
          }}
        >
          <Logo size="sm" theme={isLight ? 'light' : 'dark'} linked={false} />
        </a>
        <nav className="hl-topnav-links" aria-label="Pro trade sections">
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
        {section === 'sportsbets' ? (
          <ProTradeBettingTopBarBalance
            walletAddress={walletAddress}
            walletConnected={walletConnected}
            onRequireSignIn={onRequireSignIn}
          />
        ) : null}
        {onViewNotificationHistory ? (
          <ProTradeNotificationsBell onViewHistory={onViewNotificationHistory} />
        ) : null}
        <ProTradeThemeIcon />
        <ProTradeAccountMenu
          onOpenSupport={onOpenSupport}
          onOpenProfile={onOpenProfile}
          onRequireSignIn={onRequireSignIn}
        />
        <button
          type="button"
          className={`hl-topnav-bot ${section === 'bot' ? 'hl-topnav-bot--active' : ''}`}
          onClick={onBotTradeToggle}
          aria-pressed={section === 'bot'}
        >
          Bot trade
          <DockCountBadge count={botOpenCount} tone={botOpenTone} />
        </button>
        <button
          type="button"
          className={`hl-topnav-wallet ${isConnected ? 'hl-topnav-wallet--connected' : ''}`}
          onClick={() => open()}
        >
          {walletLabel}
        </button>
      </div>

      {mobileNavOpen ? (
        <div className="hl-mobile-nav" role="dialog" aria-modal="true" aria-label="Navigation">
          <button
            type="button"
            className="hl-mobile-nav-backdrop"
            aria-label="Close menu"
            onClick={() => setMobileNavOpen(false)}
          />
          <div className="hl-mobile-nav-sheet">
            <div className="hl-mobile-nav-head">
              <span>Trade</span>
              <button
                type="button"
                className="hl-topnav-icon-btn"
                aria-label="Close menu"
                onClick={() => setMobileNavOpen(false)}
              >
                <X size={16} />
              </button>
            </div>
            <nav className="hl-mobile-nav-links">
              {NAV.map(({ id, label, enabled }) => (
                <button
                  key={id}
                  type="button"
                  className={`hl-mobile-nav-link ${section === id ? 'hl-mobile-nav-link--on' : ''}`}
                  disabled={!enabled}
                  onClick={() => pickSection(id, enabled)}
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                className={`hl-mobile-nav-link hl-mobile-nav-link--bot ${section === 'bot' ? 'hl-mobile-nav-link--on' : ''}`}
                onClick={() => {
                  onBotTradeToggle();
                  setMobileNavOpen(false);
                }}
              >
                Bot trade
                <DockCountBadge count={botOpenCount} tone={botOpenTone} />
              </button>
            </nav>
            <div className="hl-mobile-nav-foot">
              <button
                type="button"
                className="hl-mobile-nav-wallet"
                onClick={() => {
                  open();
                  setMobileNavOpen(false);
                }}
              >
                {walletLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
};

export default ProTradeTopNav;
