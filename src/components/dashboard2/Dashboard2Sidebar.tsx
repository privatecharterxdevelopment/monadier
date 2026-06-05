import React from 'react';
import {
  TrendingUp,
  History,
  LogOut,
  ArrowDownLeft,
  ArrowUpRight,
  MessageCircle,
  Shield,
} from 'lucide-react';
import { signOut } from '../../lib/supabase';
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
  onDeposit,
  onWithdraw,
  onSupport,
  onSecurity,
  onProfile,
  onTrade,
}) => {

  const handleSignOut = async () => {
    await signOut();
    window.location.href = '/';
  };

  const linkClass = (section: Dashboard2SidebarSection) =>
    `term-side-link ${activeSection === section ? 'term-side-link--active' : ''}`;

  return (
    <aside className="term-sidebar">
      <div className="term-side-logo">
        <svg width="20" height="20" viewBox="0 0 32 32" fill="none" aria-hidden>
          <rect width="32" height="32" rx="6" fill="#0a0a0a" />
          <path d="M16 8v16M8 16h16" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
        <span className="term-side-label">Monadier</span>
      </div>

      <nav className="term-side-nav">
        <button type="button" className={linkClass('trade')} onClick={onTrade}>
          <TrendingUp size={18} />
          <span className="term-side-label">Trade</span>
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
          <ProfileAvatar profile={profile} userId={userId} size="sm" />
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
