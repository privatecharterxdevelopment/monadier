import React from 'react';
import { CandlestickChart, TrendingUp } from 'lucide-react';
import Dashboard2Sidebar, {
  type Dashboard2SidebarSection,
} from './Dashboard2Sidebar';
import { goToOpenApp } from '../../lib/appUrls';

type ProfileShape = {
  avatar_emoji?: string | null;
  avatar_url?: string | null;
  full_name?: string | null;
} | null;

type Props = {
  profile?: ProfileShape;
  userId?: string;
  activeSection: Dashboard2SidebarSection;
  onTrade?: () => void;
  onProTrade?: () => void;
  onHistory?: () => void;
  onNotifications?: () => void;
  onDeposit?: () => void;
  onWithdraw?: () => void;
  onSupport?: () => void;
  onProfile?: () => void;
  children: React.ReactNode;
};

const Dashboard2Shell: React.FC<Props> = ({
  profile,
  userId,
  activeSection,
  onTrade,
  onProTrade,
  onHistory,
  onNotifications,
  onDeposit,
  onWithdraw,
  onSupport,
  onProfile,
  children,
}) => {
  const openProTrade = () => {
    if (onProTrade) {
      onProTrade();
      return;
    }
    goToOpenApp('');
  };

  return (
    <div className="term-root">
      <Dashboard2Sidebar
        profile={profile}
        userId={userId}
        activeSection={activeSection}
        onTrade={onTrade}
        onProTrade={openProTrade}
        onHistory={onHistory}
        onNotifications={onNotifications}
        onDeposit={onDeposit}
        onWithdraw={onWithdraw}
        onSupport={onSupport}
        onProfile={onProfile}
      />
      <div className="term-main">{children}</div>
      <nav className="term-mobile-bar" aria-label="Quick trade navigation">
        <button
          type="button"
          className={`term-mobile-bar-btn ${activeSection === 'trade' ? 'term-mobile-bar-btn--active' : ''}`}
          onClick={onTrade}
        >
          <TrendingUp size={20} strokeWidth={2} />
          <span>Bot trade</span>
        </button>
        <button
          type="button"
          className={`term-mobile-bar-btn term-mobile-bar-btn--pro ${activeSection === 'pro' ? 'term-mobile-bar-btn--active' : ''}`}
          onClick={openProTrade}
        >
          <CandlestickChart size={20} strokeWidth={2} />
          <span>Pro trade</span>
        </button>
      </nav>
    </div>
  );
};

export default Dashboard2Shell;
