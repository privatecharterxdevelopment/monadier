import React, { useEffect, useState } from 'react';
import { Headphones, Menu, X } from 'lucide-react';
import { useAppKit } from '@reown/appkit/react';
import { useMonadierWallet } from '../../hooks/useMonadierWallet';
import { useMediaQuery } from '../../hooks/useMediaQuery';
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
import { openMonadierWalletModal } from '../../lib/openWalletModal';

export type ProTradeSection =
  | 'perps'
  | 'bot'
  | 'sportsbets'
  | 'portfolio'
  | 'support'
  | 'profile'
  | 'history'
  | 'affiliate'
  | 'leaderboard';

/** @deprecated Swap removed from app */
export type ProTradeSectionLegacy = ProTradeSection | 'swap';

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
  onSupportNavigate?: () => void;
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
  onSupportNavigate,
  onOpenProfile,
  onRequireSignIn,
  onViewNotificationHistory,
  walletAddress,
  walletConnected = false,
}) => {
  const { isLight } = useProTradeTheme();
  const { open } = useAppKit();
  const { address, isConnected } = useMonadierWallet();
  const isMobile = useMediaQuery('(max-width: 768px)');

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

  const openSupport = () => {
    onSupportNavigate?.();
    onOpenSupport?.();
  };

  return (
    <header className={`hl-topnav ${isMobile ? 'hl-topnav--mobile' : ''}`}>
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
            compact={isMobile}
          />
        ) : null}
        {onViewNotificationHistory ? (
          <ProTradeNotificationsBell onViewHistory={onViewNotificationHistory} />
        ) : null}
        <ProTradeThemeIcon />
        <button
          type="button"
          className={`hl-topnav-icon-btn hl-topnav-support-btn${section === 'support' ? ' hl-topnav-support-btn--on' : ''}`}
          aria-label="Support"
          aria-current={section === 'support' ? 'page' : undefined}
          onClick={openSupport}
        >
          <Headphones size={16} aria-hidden />
        </button>
        <ProTradeAccountMenu
          onOpenSupport={onOpenSupport}
          onOpenProfile={onOpenProfile}
          onRequireSignIn={onRequireSignIn}
        />
        {!isMobile ? (
          <button
            type="button"
            className={`hl-topnav-bot ${section === 'bot' ? 'hl-topnav-bot--active' : ''}`}
            onClick={onBotTradeToggle}
            aria-pressed={section === 'bot'}
          >
            Bot trade
            <DockCountBadge count={botOpenCount} tone={botOpenTone} />
          </button>
        ) : null}
        {!isMobile || !isConnected ? (
          <button
            type="button"
            className={`hl-topnav-wallet ${isConnected ? 'hl-topnav-wallet--connected' : ''}`}
            onClick={() => openMonadierWalletModal(() => open())}
          >
            {walletLabel}
          </button>
        ) : null}
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
                className={`hl-mobile-nav-link hl-mobile-nav-link--support ${section === 'support' ? 'hl-mobile-nav-link--on' : ''}`}
                onClick={() => {
                  openSupport();
                  setMobileNavOpen(false);
                }}
              >
                <Headphones size={16} aria-hidden />
                Support
              </button>
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
                  openMonadierWalletModal(() => open());
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
