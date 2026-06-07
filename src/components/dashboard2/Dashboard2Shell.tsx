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
  return (
    <div className="term-root">
      <Dashboard2Sidebar
        profile={profile}
        userId={userId}
        activeSection={activeSection}
        onTrade={onTrade}
        onProTrade={onProTrade}
        onHistory={onHistory}
        onNotifications={onNotifications}
        onDeposit={onDeposit}
        onWithdraw={onWithdraw}
        onSupport={onSupport}
        onProfile={onProfile}
      />
      <div className="term-main">{children}</div>
    </div>
  );
};

export default Dashboard2Shell;
