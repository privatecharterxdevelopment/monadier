import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  TrendingUp,
  Bot,
  User,
  LogOut,
  ArrowDownLeft,
  ArrowUpRight,
} from 'lucide-react';
import { signOut } from '../../lib/supabase';

type Props = {
  onDeposit?: () => void;
  onWithdraw?: () => void;
  onHistory?: () => void;
  onProfile?: () => void;
};

const Dashboard2Sidebar: React.FC<Props> = ({
  onDeposit,
  onWithdraw,
  onHistory,
  onProfile,
}) => {
  const { pathname } = useLocation();
  const onTrade = pathname === '/dashboard2' || pathname.startsWith('/dashboard2?');
  const handleSignOut = async () => {
    await signOut();
    window.location.href = '/';
  };

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
        <Link
          to="/dashboard2"
          className={`term-side-link ${onTrade ? 'term-side-link--active' : ''}`}
        >
          <TrendingUp size={18} />
          <span className="term-side-label">Trade</span>
        </Link>
        <button
          type="button"
          className="term-side-link"
          onClick={onHistory}
        >
          <Bot size={18} />
          <span className="term-side-label">History</span>
        </button>
        <button type="button" className="term-side-link" onClick={onDeposit}>
          <ArrowDownLeft size={18} />
          <span className="term-side-label">Deposit</span>
        </button>
        <button type="button" className="term-side-link" onClick={onWithdraw}>
          <ArrowUpRight size={18} />
          <span className="term-side-label">Withdraw</span>
        </button>
      </nav>

      <div className="term-side-footer">
        <button type="button" className="term-side-link" onClick={onProfile}>
          <User size={18} />
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
