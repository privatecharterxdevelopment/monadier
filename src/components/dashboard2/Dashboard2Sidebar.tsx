import React from 'react';
import Logo from '../ui/Logo';
import { getMarketingUrl, isExternalAppUrl, LANDING_PATH } from '../../lib/appUrls';
import { BRAND_NAME } from '../../lib/brand';
import {
  TrendingUp,
  CandlestickChart,
  History,
  Bell,
  LogOut,
  ArrowDownLeft,
  ArrowUpRight,
  MessageCircle,
} from 'lucide-react';
import { signOut } from '../../lib/supabase';
import { useTermAuthToast } from '../terminal/TermAuthToast';
import { useTradeNotifications } from '../../contexts/TradeNotificationsContext';
import ProfileAvatar from '../profile/ProfileAvatar';

export type Dashboard2SidebarSection =
  | 'trade'
  | 'pro'
  | 'history'
  | 'deposit'
  | 'withdraw'
  | 'support'
  | 'security'
  | 'profile';

type Props = {
  profile?: { avatar_emoji?: string | null; avatar_url?: string | null; full_name?: string | null } | null;
  userId?: string;
  activeSection?: Dashboard2SidebarSection;
  onHistory?: () => void;
  onNotifications?: () => void;
  onDeposit?: () => void;
  onWithdraw?: () => void;
  onSupport?: () => void;
  onProfile?: () => void;
  onTrade?: () => void;
  onProTrade?: () => void;
};

const Dashboard2Sidebar: React.FC<Props> = ({
  profile,
  userId,
  activeSection = 'trade',
  onHistory,
  onNotifications,
  onDeposit,
  onWithdraw,
  onSupport,
  onProfile,
  onTrade,
  onProTrade,
}) => {
  const { signOutWithToast } = useTermAuthToast();
  const { unreadCount: notificationUnread } = useTradeNotifications();

  const handleSignOut = () => {
    void signOutWithToast(signOut, () => {
      const home = getMarketingUrl(LANDING_PATH);
      window.location.href = home.startsWith('http') ? home : LANDING_PATH;
    });
  };

  const linkClass = (section: Dashboard2SidebarSection) =>
    `term-side-link ${activeSection === section ? 'term-side-link--active' : ''}`;

  const isPro = activeSection === 'pro';

  return (
    <aside className="term-sidebar">
      <div className="term-side-logo">
        {isExternalAppUrl(getMarketingUrl(LANDING_PATH)) ? (
          <a href={getMarketingUrl(LANDING_PATH)} className="term-side-logo-link" aria-label={`${BRAND_NAME} home`}>
            <Logo size="sm" variant="app" theme="light" />
          </a>
        ) : (
          <Logo size="sm" variant="app" theme="light" />
        )}
      </div>

      <nav className="term-side-nav">
        <button type="button" className={linkClass('trade')} onClick={onTrade}>
          <TrendingUp size={18} />
          <span className="term-side-label">Bot trade</span>
        </button>
        <button type="button" className={linkClass('pro')} onClick={onProTrade}>
          <CandlestickChart size={18} />
          <span className="term-side-label">Pro trade</span>
        </button>
        {!isPro ? (
          <button
            type="button"
            className={linkClass('history')}
            onClick={onNotifications ?? onHistory}
          >
            <span className="term-side-link-icon-wrap">
              <Bell size={18} />
              {notificationUnread > 0 && (
                <span className="term-side-badge">
                  {notificationUnread > 9 ? '9+' : notificationUnread}
                </span>
              )}
            </span>
            <span className="term-side-label">Alerts</span>
          </button>
        ) : null}
        <button type="button" className={linkClass('history')} onClick={onHistory}>
          <History size={18} />
          <span className="term-side-label">History</span>
        </button>
        <button type="button" className={linkClass('deposit')} onClick={onDeposit}>
          <ArrowDownLeft size={18} />
          <span className="term-side-label">Deposit</span>
        </button>
        <button type="button" className={linkClass('withdraw')} onClick={onWithdraw}>
          <ArrowUpRight size={18} />
          <span className="term-side-label">Withdraw</span>
        </button>
        <button type="button" className={linkClass('support')} onClick={onSupport}>
          <MessageCircle size={18} />
          <span className="term-side-label">Support</span>
        </button>
      </nav>

      <div className="term-side-footer">
        <button
          type="button"
          className={`${linkClass('profile')} term-side-link--profile`}
          onClick={onProfile}
          title="Profile"
        >
          <ProfileAvatar profile={profile} userId={userId} size="xs" />
          <span className="term-side-label">Profile</span>
        </button>
        <button type="button" className="term-side-link" onClick={handleSignOut}>
          <LogOut size={18} />
          <span className="term-side-label">Sign out</span>
        </button>
      </div>
    </aside>
  );
};

export default Dashboard2Sidebar;
