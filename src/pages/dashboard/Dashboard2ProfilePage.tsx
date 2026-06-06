import React from 'react';
import { useNavigate } from 'react-router-dom';
import { User } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import Dashboard2Shell from '../../components/dashboard2/Dashboard2Shell';
import TerminalProfilePanel from '../../components/terminal/TerminalProfilePanel';
import { displayHandle } from '../../lib/username';

const Dashboard2ProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const { profile, user } = useAuth();
  const displayName = displayHandle(profile, user?.email);

  const goTrade = (query?: string) => {
    navigate(query ? `/dashboard2?${query}` : '/dashboard2');
  };

  return (
    <Dashboard2Shell
      profile={profile}
      userId={user?.id}
      activeSection="profile"
      onTrade={() => goTrade()}
      onHistory={() => goTrade('view=history')}
      onNotifications={() => goTrade('view=history')}
      onDeposit={() => goTrade('action=deposit')}
      onWithdraw={() => goTrade('action=withdraw')}
      onSupport={() => goTrade('action=support')}
      onSecurity={() => goTrade('action=security')}
      onProfile={() => navigate('/dashboard2/profile')}
    >
      <header className="term-market-bar term-profile-page-header">
        <div className="term-profile-page-head">
          <div className="term-profile-page-head-icon" aria-hidden>
            <User size={18} />
          </div>
          <div className="term-profile-page-head-text">
            <h1 className="term-profile-page-title">Profile</h1>
            <p className="term-profile-page-sub">
              {displayName}
              {user?.email ? ` · ${user.email}` : ''}
            </p>
          </div>
        </div>
      </header>
      <div className="term-workspace term-workspace--history">
        <TerminalProfilePanel />
      </div>
    </Dashboard2Shell>
  );
};

export default Dashboard2ProfilePage;
