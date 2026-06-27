import React, { useEffect, useState } from 'react';
import { Headphones, Gift, Menu, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppKit } from '@reown/appkit/react';
import { useMonadierWallet } from '../../hooks/useMonadierWallet';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import Logo from '../ui/Logo';
import DockCountBadge from './DockCountBadge';
import ProTradeAccountMenu from './ProTradeAccountMenu';
import ProTradeNotificationsBell from './ProTradeNotificationsBell';
import ProTradeHeaderBalance, { headerBalanceSection } from './ProTradeHeaderBalance';
import ProTradeHlNetworkSwitch from './ProTradeHlNetworkSwitch';
import { useArbitrumWalletUsdc } from '../../hooks/useArbitrumWalletUsdc';
import ProTradeThemeIcon from './ProTradeThemeIcon';
import LanguageSwitcher from '../i18n/LanguageSwitcher';
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
  | 'news'
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
  labelKey: string;
  enabled: boolean;
};

const NAV: NavItem[] = [
  { id: 'perps', labelKey: 'app.nav.perps', enabled: true },
  { id: 'bot', labelKey: 'app.nav.bot', enabled: true },
  { id: 'sportsbets', labelKey: 'app.nav.betting', enabled: true },
  { id: 'portfolio', labelKey: 'app.nav.portfolio', enabled: true },
  { id: 'news', labelKey: 'app.nav.news', enabled: true },
  { id: 'leaderboard', labelKey: 'app.nav.leaderboard', enabled: false },
];

type Props = {
  section: ProTradeSection;
  onSectionChange: (section: ProTradeSection) => void;
  botOpenCount?: number;
  botOpenTone?: 'pos' | 'neg' | null;
  onOpenSupport?: () => void;
  onSupportNavigate?: () => void;
  onOpenProfile?: (tab?: ProTradeProfileTab) => void;
  onOpenAffiliate?: () => void;
  onRequireSignIn?: (reason: string) => void;
  onViewNotificationHistory?: (notification?: ActivityNotification) => void;
  walletAddress?: string;
  walletConnected?: boolean;
};

const ProTradeTopNav: React.FC<Props> = ({
  section,
  onSectionChange,
  botOpenCount = 0,
  botOpenTone = null,
  onOpenSupport,
  onSupportNavigate,
  onOpenProfile,
  onOpenAffiliate,
  onRequireSignIn,
  onViewNotificationHistory,
  walletAddress,
  walletConnected = false,
}) => {
  const { t } = useTranslation();
  const { isLight } = useProTradeTheme();
  const { open } = useAppKit();
  const { address, isConnected, isRestoring } = useMonadierWallet();
  const { usdcBalance, usdcLoading } = useArbitrumWalletUsdc(
    isConnected ? address : undefined
  );
  const isMobile = useMediaQuery('(max-width: 768px)');

  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const walletLabel = isRestoring
    ? t('common.restoring')
    : isConnected && address
      ? `${address.slice(0, 6)}…${address.slice(-4)}`
      : t('common.connect');

  const walletUsdcLabel =
    isConnected && !usdcLoading
      ? `${usdcBalance.toFixed(2)} USDC`
      : isConnected && usdcLoading
        ? '… USDC'
        : null;

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

  const pickNavSection = (id: ProTradeSection, enabled: boolean) => {
    if (!enabled) return;
    onSectionChange(id);
  };

  const openSupport = () => {
    onSupportNavigate?.();
    onOpenSupport?.();
  };

  return (
    <header className={`hl-topnav ${isMobile ? 'hl-topnav--mobile' : ''}`}>
      <div className="hl-topnav-left">
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
        <nav className="hl-topnav-links" aria-label={t('app.nav.sections')}>
          {NAV.map(({ id, labelKey, enabled }) => (
            <button
              key={id}
              type="button"
              className={`hl-topnav-link ${section === id ? 'hl-topnav-link--active' : ''}${id === 'bot' && section === 'bot' ? ' hl-topnav-link--bot' : ''}`}
              onClick={() => pickNavSection(id, enabled)}
              disabled={!enabled}
              aria-current={section === id ? 'page' : undefined}
              style={enabled ? undefined : { opacity: 0.35, cursor: 'not-allowed' }}
            >
              {t(labelKey)}
              {id === 'bot' ? <DockCountBadge count={botOpenCount} tone={botOpenTone} /> : null}
            </button>
          ))}
        </nav>
      </div>
      <div className="hl-topnav-right">
        <ProTradeHeaderBalance
          section={headerBalanceSection(section)}
          walletAddress={walletAddress}
          walletConnected={walletConnected}
          onRequireSignIn={onRequireSignIn}
          compact={isMobile}
        />
        {isConnected ? <ProTradeHlNetworkSwitch compact={isMobile} /> : null}
        {onViewNotificationHistory ? (
          <ProTradeNotificationsBell onViewHistory={onViewNotificationHistory} />
        ) : null}
        <LanguageSwitcher variant="app" />
        <ProTradeThemeIcon />
        <button
          type="button"
          className={`hl-topnav-icon-btn hl-topnav-support-btn hl-topnav-support-btn--desktop${section === 'support' ? ' hl-topnav-support-btn--on' : ''}`}
          aria-label={t('common.support')}
          aria-current={section === 'support' ? 'page' : undefined}
          onClick={openSupport}
        >
          <Headphones size={16} aria-hidden />
        </button>
        <ProTradeAccountMenu
          onOpenSupport={onOpenSupport}
          onOpenProfile={onOpenProfile}
          onOpenAffiliate={onOpenAffiliate}
          onRequireSignIn={onRequireSignIn}
        />
        {!isMobile || !isConnected ? (
          <button
            type="button"
            className={`hl-topnav-wallet ${isConnected ? 'hl-topnav-wallet--connected' : ''}`}
            title={
              walletUsdcLabel
                ? `Arbitrum wallet · ${walletUsdcLabel} (MetaMask may also show ETH for gas)`
                : undefined
            }
            onClick={() => openMonadierWalletModal(() => open())}
          >
            {walletUsdcLabel ? (
              <span className="hl-topnav-wallet-usdc">{walletUsdcLabel}</span>
            ) : null}
            {walletLabel}
          </button>
        ) : null}
        {isMobile ? (
          <button
            type="button"
            className="hl-topnav-menu-btn"
            aria-label={t('common.openMenu')}
            aria-expanded={mobileNavOpen}
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu size={18} />
          </button>
        ) : null}
      </div>

      {mobileNavOpen ? (
        <div className="hl-mobile-nav" role="dialog" aria-modal="true" aria-label={t('common.trade')}>
          <button
            type="button"
            className="hl-mobile-nav-backdrop"
            aria-label={t('common.closeMenu')}
            onClick={() => setMobileNavOpen(false)}
          />
          <div className="hl-mobile-nav-sheet">
            <div className="hl-mobile-nav-head">
              <span>{t('common.trade')}</span>
              <button
                type="button"
                className="hl-topnav-icon-btn"
                aria-label={t('common.closeMenu')}
                onClick={() => setMobileNavOpen(false)}
              >
                <X size={16} />
              </button>
            </div>
            <nav className="hl-mobile-nav-links">
              {NAV.map(({ id, labelKey, enabled }) => (
                <button
                  key={id}
                  type="button"
                  className={`hl-mobile-nav-link ${section === id ? 'hl-mobile-nav-link--on' : ''}${id === 'bot' ? ' hl-mobile-nav-link--bot' : ''}`}
                  disabled={!enabled}
                  onClick={() => pickSection(id, enabled)}
                >
                  {t(labelKey)}
                  {id === 'bot' ? <DockCountBadge count={botOpenCount} tone={botOpenTone} /> : null}
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
                {t('common.support')}
              </button>
              <button
                type="button"
                className={`hl-mobile-nav-link ${section === 'affiliate' ? 'hl-mobile-nav-link--on' : ''}`}
                onClick={() => pickSection('affiliate', true)}
              >
                <Gift size={16} aria-hidden />
                {t('common.affiliate')}
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
                {walletUsdcLabel ? (
                  <span className="hl-mobile-nav-wallet-usdc">{walletUsdcLabel}</span>
                ) : null}
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
