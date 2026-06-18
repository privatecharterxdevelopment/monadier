import React from 'react';
import TerminalPositionsDock, { type DockTab } from '../terminal/TerminalPositionsDock';

type Props = {
  botRunning: boolean;
  activeTab: DockTab;
  onTabChange: (tab: DockTab) => void;
  refreshKey?: number;
};

const ProTradeBotDock: React.FC<Props> = ({
  botRunning,
  activeTab,
  onTabChange,
  refreshKey = 0,
}) => (
  <div className="hl-bot-dock">
    <div className="hl-dock-mode-label">HL Bot · Hyperliquid · Trade history</div>
    <TerminalPositionsDock
      id="hl-bot-dock"
      botRunning={botRunning}
      activeTab={activeTab}
      onTabChange={onTabChange}
      layout="dock"
      refreshKey={refreshKey}
      includeClosedHistoryFeed
      skin="hl"
    />
  </div>
);

export default ProTradeBotDock;
