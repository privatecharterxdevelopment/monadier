import React from 'react';
import TerminalPositionsDock, { type DockTab } from '../terminal/TerminalPositionsDock';

import type { Dashboard2Metrics } from '../../hooks/useDashboard2Metrics';

type Props = {
  botRunning: boolean;
  activeTab: DockTab;
  onTabChange: (tab: DockTab) => void;
  refreshKey?: number;
  showBotAnalysis?: boolean;
  botAnalysisMetrics?: Dashboard2Metrics;
  botAnalysisWallet?: string | null;
  botAnalysisSymbol?: string;
  walletConnected?: boolean;
};

const ProTradeBotDock: React.FC<Props> = ({
  botRunning,
  activeTab,
  onTabChange,
  refreshKey = 0,
  showBotAnalysis,
  botAnalysisMetrics,
  botAnalysisWallet,
  botAnalysisSymbol,
  walletConnected,
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
      showBotAnalysis={showBotAnalysis}
      botAnalysisMetrics={botAnalysisMetrics}
      botAnalysisWallet={botAnalysisWallet}
      botAnalysisSymbol={botAnalysisSymbol}
      walletConnected={walletConnected}
    />
  </div>
);

export default ProTradeBotDock;
