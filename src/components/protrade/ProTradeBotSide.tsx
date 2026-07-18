import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useMonadierWallet } from '../../hooks/useMonadierWallet';
import { useDashboard2Metrics } from '../../hooks/useDashboard2Metrics';
import { useTerminalBotSettings } from '../../hooks/useTerminalBotSettings';
import { useHlAccountSnapshot } from '../../hooks/useHlAccountSnapshot';
import { useHyperliquidMarkPrices } from '../../hooks/useHyperliquidMarkPrices';
import { livePositionUpnl } from '../../lib/hyperliquid/user';
import type { Dashboard2Metrics } from '../../hooks/useDashboard2Metrics';
import type { HlBotDockTab } from '../protrade/ProTradeHlBotDock';
import TerminalTradePanel from '../terminal/TerminalTradePanel';
import ProTradeBotDock from './ProTradeBotDock';
import ProTradeStatusBar from './ProTradeStatusBar';

type BotCtx = {
  metrics: Dashboard2Metrics;
  refresh: () => void;
  dockRefreshKey: number;
};

const ProTradeBotContext = createContext<BotCtx | null>(null);

export function useProTradeBot() {
  const ctx = useContext(ProTradeBotContext);
  if (!ctx) throw new Error('ProTradeBotProvider required');
  return ctx;
}

/** Mounts bot hooks only while bot mode is active. */
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
  dockTab: HlBotDockTab | string;
  onDockTabChange: (tab: HlBotDockTab) => void;
  analysisSymbol?: string;
  openPositionCoins?: string[];
  botManagedCoins?: ReadonlySet<string>;
  botManagedCoinsLoading?: boolean;
  onCoinClick?: (coin: string) => void;
  onDeposit?: () => void;
};

export const ProTradeBotDockSlot: React.FC<DockProps> = ({
  dockTab,
  onDockTabChange,
  analysisSymbol = 'BTCUSDT',
  openPositionCoins = [],
  botManagedCoins,
  botManagedCoinsLoading = false,
  onCoinClick,
  onDeposit,
}) => {
  const { metrics, dockRefreshKey, refresh } = useProTradeBot();
  const { address, isConnected } = useMonadierWallet();

  return (
    <ProTradeBotDock
      activeTab={dockTab}
      onTabChange={onDockTabChange}
      refreshKey={dockRefreshKey}
      showBotAnalysis={false}
      botAnalysisMetrics={metrics}
      botAnalysisWallet={address ?? null}
      botAnalysisSymbol={analysisSymbol}
      botOpenPositionCoins={openPositionCoins}
      botManagedCoins={botManagedCoins}
      botManagedCoinsLoading={botManagedCoinsLoading}
      walletConnected={isConnected}
      onPositionChange={refresh}
      onCoinClick={onCoinClick}
      walletAddress={address ?? null}
      onDeposit={onDeposit}
      botHlBalanceUsd={metrics.hlBalanceUsd}
    />
  );
};

type PanelProps = {
  onOpenHistory?: () => void;
  onRequireSignIn?: (reason: string) => void;
};

/** Same trading bot panel as dashboard2 — styled for Pro Trade shell. */
export const ProTradeBotPanelSlot: React.FC<PanelProps> = ({
  onOpenHistory,
  onRequireSignIn,
}) => {
  const { metrics, refresh } = useProTradeBot();
  const [fundsAction, setFundsAction] = useState<'deposit' | 'withdraw' | null>(null);

  return (
    <div id="hl-trade-panel" className="hl-bot-panel-wrap">
      <TerminalTradePanel
        metrics={metrics}
        onRefresh={refresh}
        onOpenHistory={onOpenHistory}
        onRequireSignIn={onRequireSignIn}
        useGlobalFundsModal
        fundsAction={fundsAction}
        onFundsActionHandled={() => setFundsAction(null)}
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
  const { wallet } = useTerminalBotSettings();
  // Compute the header uPnL from the same live positions + mark prices the
  // positions table uses, so both numbers always match (no more 15s-snapshot lag).
  const { snapshot } = useHlAccountSnapshot(wallet);
  const positions = snapshot?.positions ?? [];
  const coins = useMemo(() => positions.map((p) => p.coin), [positions]);
  const { prices: markPrices } = useHyperliquidMarkPrices(coins, 5000);
  const liveUpnl = useMemo(
    () =>
      positions.reduce(
        (sum, p) => sum + livePositionUpnl(p, markPrices[p.coin] ?? 0),
        0
      ),
    [positions, markPrices]
  );
  return (
    <ProTradeStatusBar
      mode="bot"
      walletConnected={walletConnected}
      wsLive={wsLive}
      openOrders={[]}
      positions={positions}
      totalUpnl={liveUpnl}
      botMetrics={metrics}
      botWallet={wallet}
    />
  );
};

export default ProTradeBotProvider;
