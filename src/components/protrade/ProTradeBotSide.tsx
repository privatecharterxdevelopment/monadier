import React, { createContext, useCallback, useContext, useState } from 'react';
import { useDashboard2Metrics } from '../../hooks/useDashboard2Metrics';
import type { Dashboard2Metrics } from '../../hooks/useDashboard2Metrics';
import type { DockTab } from '../terminal/TerminalPositionsDock';
import TerminalTradePanel from '../terminal/TerminalTradePanel';
import ProTradeBotDock from './ProTradeBotDock';
import ProTradeStatusBar from './ProTradeStatusBar';

type BotCtx = {
  metrics: Dashboard2Metrics;
  refresh: () => void;
  dockRefreshKey: number;
};

const ProTradeBotContext = createContext<BotCtx | null>(null);

function useProTradeBot() {
  const ctx = useContext(ProTradeBotContext);
  if (!ctx) throw new Error('ProTradeBotProvider required');
  return ctx;
}

/** Mounts GMX bot hooks only while bot mode is active. */
export const ProTradeBotProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { metrics, refresh } = useDashboard2Metrics();
  const [dockRefreshKey, setDockRefreshKey] = useState(0);
  const handleRefresh = useCallback(() => {
    void refresh();
    setDockRefreshKey((n) => n + 1);
  }, [refresh]);

  return (
    <ProTradeBotContext.Provider
      value={{ metrics, refresh: handleRefresh, dockRefreshKey }}
    >
      {children}
    </ProTradeBotContext.Provider>
  );
};

type DockProps = {
  dockTab: DockTab;
  onDockTabChange: (tab: DockTab) => void;
};

export const ProTradeBotDockSlot: React.FC<DockProps> = ({ dockTab, onDockTabChange }) => {
  const { metrics, dockRefreshKey } = useProTradeBot();
  return (
    <ProTradeBotDock
      botRunning={metrics.autoTradeEnabled}
      activeTab={dockTab}
      onTabChange={onDockTabChange}
      refreshKey={dockRefreshKey}
    />
  );
};

type PanelProps = {
  onOpenHistory?: () => void;
};

/** Same trading bot panel as dashboard2 — styled for Pro Trade shell. */
export const ProTradeBotPanelSlot: React.FC<PanelProps> = ({ onOpenHistory }) => {
  const { metrics, refresh } = useProTradeBot();
  const [vaultAction, setVaultAction] = useState<'deposit' | 'withdraw' | null>(null);

  return (
    <div id="hl-trade-panel" className="hl-bot-panel-wrap">
      <TerminalTradePanel
        metrics={metrics}
        onRefresh={refresh}
        onOpenHistory={onOpenHistory}
        vaultAction={vaultAction}
        onVaultActionHandled={() => setVaultAction(null)}
      />
    </div>
  );
};

type StatusProps = {
  walletConnected: boolean;
  wsLive?: boolean;
};

export const ProTradeBotStatusBar: React.FC<StatusProps> = ({
  walletConnected,
  wsLive = false,
}) => {
  const { metrics } = useProTradeBot();
  return (
    <ProTradeStatusBar
      mode="bot"
      walletConnected={walletConnected}
      wsLive={wsLive}
      openOrders={[]}
      positions={[]}
      botMetrics={metrics}
    />
  );
};

export default ProTradeBotProvider;
