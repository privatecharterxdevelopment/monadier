import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import ProfileAvatar from '../profile/ProfileAvatar';
import TerminalProfilePanel from '../terminal/TerminalProfilePanel';
import { displayHandle } from '../../lib/username';
import {
  PRO_TRADE_PROFILE_TABS,
  type ProTradeProfileTab,
} from './proTradeProfileTypes';

type Props = {
  activeTab?: ProTradeProfileTab;
  onTabChange?: (tab: ProTradeProfileTab) => void;
};

const ProTradeProfile: React.FC<Props> = ({
  activeTab: controlledTab,
  onTabChange,
}) => {
  const { user, profile } = useAuth();
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
    <div className="hl-profile-page">
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
        <nav className="hl-dock-tabs hl-profile-tabs" aria-label="Profile sections">
          {PRO_TRADE_PROFILE_TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={`hl-dock-tab ${tab === id ? 'hl-dock-tab--on' : ''}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      <div className="hl-profile-body hl-profile-scope">
        <TerminalProfilePanel activeSection={tab} variant="pro" />
      </div>
    </div>
  );
};

export default ProTradeProfile;
