import React from 'react';
import Logo from '../ui/Logo';
import { getMarketingUrl, isExternalAppUrl } from '../../lib/appUrls';
import {
  TrendingUp,
  History,
  Bell,
  LogOut,
  ArrowDownLeft,
  ArrowUpRight,
  MessageCircle,
  Shield,
} from 'lucide-react';
import { signOut } from '../../lib/supabase';
import { useTermAuthToast } from '../terminal/TermAuthToast';
import { useTradeNotifications } from '../../contexts/TradeNotificationsContext';
import ProfileAvatar from '../profile/ProfileAvatar';

export type Dashboard2SidebarSection =
  | 'trade'
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
  onSecurity?: () => void;
  onProfile?: () => void;
  onTrade?: () => void;
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
  onSecurity,
  onProfile,
  onTrade,
}) => {
  const { signOutWithToast } = useTermAuthToast();
  const { unreadCount: notificationUnread } = useTradeNotifications();

  const handleSignOut = () => {
    void signOutWithToast(signOut, () => {
      const home = getMarketingUrl('/');
      window.location.href = home.startsWith('http') ? home : '/';
    });
  };

  const linkClass = (section: Dashboard2SidebarSection) =>
    `term-side-link ${activeSection === section ? 'term-side-link--active' : ''}`;

  return (
    <aside className="term-sidebar">
      <div className="term-side-logo">
        {isExternalAppUrl(getMarketingUrl('/')) ? (
          <a href={getMarketingUrl('/')} className="term-side-logo-link" aria-label="Monadier home">
            <Logo size="sm" theme="light" />
          </a>
        ) : (
          <Logo size="sm" theme="light" />
        )}
      </div>

      <nav className="term-side-nav">
        <button type="button" className={linkClass('trade')} onClick={onTrade}>
          <TrendingUp size={18} />
          <span className="term-side-label">Trade</span>
        </button>
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
        <button type="button" className={linkClass('security')} onClick={onSecurity}>
          <Shield size={18} />
          <span className="term-side-label">Security</span>
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
