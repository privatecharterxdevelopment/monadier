import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import Dashboard2Shell from '../../components/dashboard2/Dashboard2Shell';
import TerminalProfilePanel from '../../components/terminal/TerminalProfilePanel';
import { goToOpenApp, OPEN_APP_PATH } from '../../lib/appUrls';

const Dashboard2ProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, user } = useAuth();

  useEffect(() => {
    const hash = location.hash.replace('#', '');
    if (!hash) return;
    const timer = window.setTimeout(() => {
      document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [location.hash]);
  const goTrade = (query?: string) => {
    goToOpenApp(query ? `?section=bot&${query}` : '?section=bot', false);
  };

  return (
    <Dashboard2Shell
      profile={profile}
      userId={user?.id}
      activeSection="profile"
      onTrade={() => goTrade()}
      onProTrade={() => goToOpenApp('')}
      onHistory={() => goTrade('view=history')}
      onNotifications={() => goTrade('view=history')}
      onDeposit={() => goTrade('action=deposit')}
      onWithdraw={() => goTrade('action=withdraw')}
      onSupport={() => goTrade('action=support')}
      onProfile={() => navigate(`${OPEN_APP_PATH}?section=profile`)}
    >
      <header className="term-market-bar term-profile-page-header">
        <h1 className="term-profile-page-title">Profile</h1>
      </header>
      <div className="term-workspace term-workspace--history">
        <TerminalProfilePanel />
      </div>
    </Dashboard2Shell>
  );
};

export default Dashboard2ProfilePage;
