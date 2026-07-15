import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMonadierWallet } from '../../hooks/useMonadierWallet';
import { useAuth } from '../../contexts/AuthContext';
import ProfileAvatar from '../profile/ProfileAvatar';
import TerminalProfilePanel from '../terminal/TerminalProfilePanel';
import { displayHandle } from '../../lib/username';
import {
  PRO_TRADE_PROFILE_TABS,
  type ProTradeProfileTab,
} from './proTradeProfileTypes';
import ProTradeBotHistory from './ProTradeBotHistory';
import HlFundsOverviewPanel from './HlFundsOverviewPanel';
import ProTradePageShell from './ProTradePageShell';

type Props = {
  activeTab?: ProTradeProfileTab;
  onTabChange?: (tab: ProTradeProfileTab) => void;
  botHistoryRefreshKey?: number;
  onRequireSignIn?: (reason: string) => void;
};

const ProTradeProfile: React.FC<Props> = ({
  activeTab: controlledTab,
  onTabChange,
  botHistoryRefreshKey = 0,
  onRequireSignIn,
}) => {
  const { t } = useTranslation();
  const { user, profile } = useAuth();
  const { address, isConnected } = useMonadierWallet();
  const [internalTab, setInternalTab] = useState<ProTradeProfileTab>('identity');
  const tab = controlledTab ?? internalTab;
  const setTab = (next: ProTradeProfileTab) => {
    onTabChange?.(next);
    if (controlledTab == null) setInternalTab(next);
  };

  const displayName = displayHandle(profile, user?.email);
  const email = profile?.email || user?.email || '—';
  const username = profile?.username?.trim();

  return (
    <ProTradePageShell className="hl-profile-page">
      <header className="hl-profile-hero">
        <ProfileAvatar profile={profile} userId={user?.id} size="lg" />
        <div className="hl-profile-hero-meta">
          <h1 className="hl-profile-hero-name">{displayName}</h1>
          {username ? (
            <p className="hl-profile-hero-handle">@{username}</p>
          ) : null}
          <p className="hl-profile-hero-email">{email}</p>
        </div>
      </header>

      <div className="hl-profile-toolbar">
        <nav className="hl-dock-tabs hl-profile-tabs" aria-label={t('profile.tabsAria')}>
          {PRO_TRADE_PROFILE_TABS.map(({ id, labelKey }) => (
            <button
              key={id}
              type="button"
              className={`hl-dock-tab ${tab === id ? 'hl-dock-tab--on' : ''}`}
              onClick={() => setTab(id)}
            >
              {t(labelKey)}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'identity' ? (
        <HlFundsOverviewPanel
          walletAddress={address ?? undefined}
          onRequireSignIn={onRequireSignIn}
          className="hl-funds-overview--profile"
          title={t('profile.hyperliquidAccount')}
        />
      ) : null}

      <div
        className={`hl-profile-body hl-profile-scope${tab === 'botTrades' ? ' hl-profile-body--bot-trades' : ''}`}
      >
        {tab === 'botTrades' ? (
          <ProTradeBotHistory
            embedded
            refreshKey={botHistoryRefreshKey}
            walletAddress={address ?? undefined}
            walletConnected={isConnected}
          />
        ) : (
          <TerminalProfilePanel activeSection={tab} variant="pro" />
        )}
      </div>
    </ProTradePageShell>
  );
};

export default ProTradeProfile;
