import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { VaultBalanceCard } from '../../components/vault';
import VaultSettingsModal from '../../components/vault/VaultSettingsModal';
import TradingTerminalShell, {
  type TerminalTabId,
} from '../../components/dashboard/TradingTerminalShell';
import { useTradingDashboardMetrics } from '../../hooks/useTradingDashboardMetrics';
import TradingBotPage from './TradingBotPage';
import BotHistoryPage from './BotHistoryPage';

type BotTradingHubPageProps = {
  defaultTab?: TerminalTabId;
};

function tabToPath(tab: TerminalTabId): string {
  return tab === 'chart' ? '/dashboard/chart-trades' : '/dashboard/bot-trading';
}

function pathToTab(pathname: string, fallback: TerminalTabId): TerminalTabId {
  if (pathname.includes('chart-trades')) return 'chart';
  return fallback === 'chart' ? 'open' : fallback;
}

const BotTradingHubPage: React.FC<BotTradingHubPageProps> = ({ defaultTab = 'open' }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { metrics, refresh } = useTradingDashboardMetrics();
  const [activeTab, setActiveTab] = useState<TerminalTabId>(
    pathToTab(location.pathname, defaultTab)
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [botSettings, setBotSettings] = useState({
    riskLevelPercent: 5,
    takeProfit: 5,
    stopLoss: 1,
    leverage: 1,
    autoTradeEnabled: false,
  });

  useEffect(() => {
    setActiveTab(pathToTab(location.pathname, defaultTab));
  }, [location.pathname, defaultTab]);

  useEffect(() => {
    setBotSettings((s) => ({ ...s, autoTradeEnabled: metrics.autoTradeEnabled }));
  }, [metrics.autoTradeEnabled]);

  const selectTab = (tab: TerminalTabId) => {
    setActiveTab(tab);
    navigate(tabToPath(tab), { replace: true });
  };

  const historyTab =
    activeTab === 'closed' ? 'closed' : activeTab === 'all' ? 'all' : activeTab === 'open' ? 'open' : undefined;

  const tabs = [
    { id: 'open' as const, label: 'Open positions', badge: metrics.openPositionsCount },
    { id: 'closed' as const, label: 'Closed history' },
    { id: 'chart' as const, label: 'Chart & trade' },
    { id: 'all' as const, label: 'All bot trades' },
  ];

  return (
    <div className="bot-trading-hub space-y-4">
      {/* Vault: deposit, withdraw, start/stop auto-trade */}
      <VaultBalanceCard compact />

      <TradingTerminalShell
        headerTitle="Trading"
        metrics={metrics}
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={selectTab}
        onRefresh={refresh}
        onOpenSettings={() => setSettingsOpen(true)}
        hidePnlSidebar={activeTab === 'chart'}
        primary={
          activeTab === 'chart' ? (
            <TradingBotPage embedded chartCompact={false} />
          ) : (
            <div className="space-y-4">
              <TradingBotPage embedded chartCompact />
              <p className="text-xs text-[#71717a] px-1">
                Live chart above · position details in the table below
              </p>
            </div>
          )
        }
        footer={
          activeTab !== 'chart' && historyTab ? (
            <BotHistoryPage embedded terminalMode forcedTab={historyTab} />
          ) : activeTab === 'chart' ? (
            <div className="text-center py-2">
              <p className="text-xs text-[#a1a1aa]">
                Manual trades &amp; your trade history are in the chart panel · open positions use the tabs above
              </p>
            </div>
          ) : null
        }
      />

      {settingsOpen && (
        <VaultSettingsModal
          currentRiskLevel={botSettings.riskLevelPercent}
          autoTradeEnabled={botSettings.autoTradeEnabled}
          currentTakeProfit={botSettings.takeProfit}
          currentStopLoss={botSettings.stopLoss}
          currentLeverage={botSettings.leverage}
          onClose={() => setSettingsOpen(false)}
          onSuccess={() => {
            setSettingsOpen(false);
            refresh();
          }}
        />
      )}
    </div>
  );
};

export default BotTradingHubPage;
