import React from 'react';
import Dashboard2Sidebar, {
  type Dashboard2SidebarSection,
} from './Dashboard2Sidebar';

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
  onHistory?: () => void;
  onNotifications?: () => void;
  onDeposit?: () => void;
  onWithdraw?: () => void;
  onSupport?: () => void;
  onSecurity?: () => void;
  onProfile?: () => void;
  children: React.ReactNode;
};

const Dashboard2Shell: React.FC<Props> = ({
  profile,
  userId,
  activeSection,
  onTrade,
  onHistory,
  onNotifications,
  onDeposit,
  onWithdraw,
  onSupport,
  onSecurity,
  onProfile,
  children,
}) => {
  return (
    <div className="term-root">
      <Dashboard2Sidebar
        profile={profile}
        userId={userId}
        activeSection={activeSection}
        onTrade={onTrade}
        onHistory={onHistory}
        onNotifications={onNotifications}
        onDeposit={onDeposit}
        onWithdraw={onWithdraw}
        onSupport={onSupport}
        onSecurity={onSecurity}
        onProfile={onProfile}
      />
      <div className="term-main">{children}</div>
    </div>
  );
};

export default Dashboard2Shell;
