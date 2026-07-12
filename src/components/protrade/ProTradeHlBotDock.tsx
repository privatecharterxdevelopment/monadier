import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useWeb3 } from '../../contexts/Web3Context';
import { useAuth } from '../../contexts/AuthContext';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { useHyperliquidAccount } from '../../hooks/useHyperliquidAccount';
import { useHyperliquidMarkPrices } from '../../hooks/useHyperliquidMarkPrices';
import { useHyperliquidTrading } from '../../hooks/useHyperliquidTrading';
import { useTerminalBotSettings } from '../../hooks/useTerminalBotSettings';
import { useHlActiveWallet } from '../../hooks/useHlActiveWallet';
import { effectiveHlBotSettings } from '../../lib/hlBotEffectiveSettings';
import { isHlBotEnabled } from '../../lib/hlBotGates';
import { persistVaultSettings } from '../../lib/syncVaultSettings';
import { snapLeverageToStep } from '../../lib/leverageLimits';
import { toNum } from '../../lib/hyperliquid/parse';
import type { HlPosition } from '../../lib/hyperliquid/user';
import type { Dashboard2Metrics } from '../../hooks/useDashboard2Metrics';
import ProTradeDock, { type ProTradeDockTab } from './ProTradeDock';

/** Hyperliquid bot dock tabs — same as Pro Trade desk (no GMX/vault). */
export type HlBotDockTab = 'positions' | 'balances' | 'tradeHistory';

const LEGACY_TAB: Record<string, HlBotDockTab> = {
  open: 'positions',
  positions: 'positions',
  vault: 'balances',
  balances: 'balances',
  history: 'tradeHistory',
  all: 'tradeHistory',
  tradeHistory: 'tradeHistory',
};

export function normalizeHlBotDockTab(tab?: string): HlBotDockTab {
  if (tab && tab in LEGACY_TAB) return LEGACY_TAB[tab];
  return 'positions';
}

type Props = {
  activeTab?: HlBotDockTab | string;
  onTabChange?: (tab: HlBotDockTab) => void;
  refreshKey?: number;
  walletAddress?: string | null;
  walletConnected?: boolean;
  onCoinClick?: (coin: string) => void;
  onPositionChange?: () => void;
  showBotAnalysis?: boolean;
  botAnalysisMetrics?: Dashboard2Metrics;
  botAnalysisSymbol?: string;
  botAnalysisWallet?: string | null;
  botOpenPositionCoins?: string[];
  botManagedCoins?: ReadonlySet<string>;
  botManagedCoinsLoading?: boolean;
  className?: string;
  onDeposit?: () => void;
  botHlBalanceUsd?: number;
  /** Full-page trade history (Profile → Bot trades) — fills table only. */
  historyOnly?: boolean;
};

const ProTradeHlBotDock: React.FC<Props> = ({
  activeTab = 'positions',
  onTabChange,
  refreshKey = 0,
  walletAddress,
  walletConnected = false,
  onCoinClick,
  onPositionChange,
  showBotAnalysis: _showBotAnalysis = false,
  botAnalysisMetrics,
  botAnalysisSymbol = 'ETHUSDT',
  botAnalysisWallet,
  botOpenPositionCoins = [],
  botManagedCoins,
  botManagedCoinsLoading = false,
  className,
  historyOnly = false,
  onDeposit,
  botHlBalanceUsd = 0,
}) => {
  const { publicClient, walletClient } = useWeb3();
  const { isDemoUser } = useAuth();
  const { planTier } = useSubscription();
  const {
    wallet: hlWallet,
    walletMismatch,
    connectedWallet,
    settingsWallet,
  } = useHlActiveWallet(walletAddress);
  const { settings: botSettingsSnapshot, reload: reloadBotSettings } =
    useTerminalBotSettings();
  const botEff = effectiveHlBotSettings(botSettingsSnapshot);
  const configuredLeverage = botEff.leverage;
  const configuredStopLoss = botEff.stopLoss;
  const [stopLossOverride, setStopLossOverride] = useState<number | null>(null);
  const stopLossMarginPct = stopLossOverride ?? configuredStopLoss;
  const botRunning = isHlBotEnabled(
    Boolean(botAnalysisMetrics?.autoTradeEnabled) || botSettingsSnapshot.autoTradeEnabled
  );

  const {
    account,
    spotBalances,
    fills,
    funding,
    orderHistory,
    loading: accountLoading,
    fillsLoading,
    refresh: refreshAccount,
  } = useHyperliquidAccount(hlWallet);

  const positions = account?.positions ?? [];
  const positionCoins = useMemo(() => positions.map((p) => p.coin), [positions]);
  const { prices: markPrices } = useHyperliquidMarkPrices(positionCoins, 5000);
  const { closePosition, busy: closeBusy, error: closeError } =
    useHyperliquidTrading();
  const [closeNotice, setCloseNotice] = useState<string | null>(null);

  const dockTab = normalizeHlBotDockTab(activeTab) as ProTradeDockTab;

  useEffect(() => {
    if (!closeError) return;
    setCloseNotice(closeError);
  }, [closeError]);

  useEffect(() => {
    void refreshAccount();
  }, [refreshAccount, refreshKey]);

  useEffect(() => {
    setStopLossOverride(null);
  }, [configuredStopLoss]);

  const handleSaveStopLoss = useCallback(
    async (stopLossPct: number): Promise<{ ok: boolean; error?: string }> => {
      if (!hlWallet) {
        return { ok: false, error: 'Connect wallet first.' };
      }
      try {
        const savedLeverage = snapLeverageToStep(botSettingsSnapshot.leverage, planTier);
        await persistVaultSettings({
          settings: {
            walletAddress: hlWallet,
            autoTradeEnabled: botSettingsSnapshot.autoTradeEnabled,
            riskPct: botSettingsSnapshot.riskPct,
            leverage: savedLeverage,
            takeProfit: botSettingsSnapshot.takeProfit,
            stopLoss: stopLossPct,
            askPermission: botSettingsSnapshot.askPermission,
            minWinRate: botSettingsSnapshot.minWinRate,
            minTradesForWinRate: botSettingsSnapshot.minTradesForWinRate,
            hlBotStrategy: botSettingsSnapshot.hlBotStrategy,
            newsTradeMode: botSettingsSnapshot.newsTradeMode,
            maxConcurrentPositions: botSettingsSnapshot.maxConcurrentPositions,
          },
          planTier,
          publicClient,
          walletClient,
          userAddress: hlWallet,
          isDemoUser,
          syncTradingParams: false,
          syncAutoTrade: false,
        });
        setStopLossOverride(stopLossPct);
        void reloadBotSettings();
        return { ok: true };
      } catch (err: unknown) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Failed to save stop loss',
        };
      }
    },
    [
      hlWallet,
      botSettingsSnapshot,
      planTier,
      publicClient,
      walletClient,
      isDemoUser,
      reloadBotSettings,
    ]
  );

  const handleClosePosition = useCallback(
    async (position: HlPosition) => {
      if (!hlWallet) {
        setCloseNotice('Connect wallet to close this position.');
        return;
      }
      const size = Math.abs(toNum(position.szi));
      const isLong = toNum(position.szi) >= 0;
      const markPx = markPrices[position.coin] ?? toNum(position.entryPx);
      if (size <= 0 || markPx <= 0) {
        setCloseNotice('Could not read position price — try again.');
        return;
      }
      setCloseNotice(null);
      try {
        const profitUsd = Math.max(0, toNum(position.unrealizedPnl));
        await closePosition({
          coin: position.coin,
          size,
          isLong,
          markPx,
          profitUsd,
          walletAddress: hlWallet,
        });
        setCloseNotice(null);
        await refreshAccount();
        onPositionChange?.();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Close failed';
        setCloseNotice(msg);
      }
    },
    [closePosition, hlWallet, markPrices, refreshAccount, onPositionChange]
  );

  const handleDockTabChange = useCallback(
    (tab: ProTradeDockTab) => {
      onTabChange?.(normalizeHlBotDockTab(tab));
      if (tab === 'tradeHistory') void refreshAccount();
    },
    [onTabChange, refreshAccount]
  );

  const connected = walletConnected || Boolean(hlWallet);

  return (
    <div
      className={`hl-bot-dock${historyOnly ? ' hl-bot-dock--history-only' : ''}${
        dockTab === 'tradeHistory' && !historyOnly ? ' hl-bot-dock--history-tab' : ''
      }${className ? ` ${className}` : ''}`}
    >
      {closeNotice ? (
        <p className="hl-dock-notice" role="status">
          {closeNotice}
        </p>
      ) : null}
      {walletMismatch ? (
        <p className="hl-dock-notice hl-dock-notice--warn" role="alert">
          Wallet mismatch — connected {connectedWallet?.slice(0, 10)}… but bot settings use{' '}
          {settingsWallet?.slice(0, 10)}…. Reconnect the wallet you funded on Hyperliquid.
        </p>
      ) : null}
      <ProTradeDock
        mode="bot"
        historyOnly={historyOnly}
        account={account}
        spotBalances={spotBalances}
        openOrders={[]}
        fills={fills}
        funding={funding}
        orderHistory={orderHistory}
        markPrices={markPrices}
        loading={accountLoading}
        fillsLoading={fillsLoading}
        connected={connected}
        activeTab={dockTab}
        onTabChange={handleDockTabChange}
        onCoinClick={onCoinClick}
        actionBusy={closeBusy}
        onClosePosition={(p) => void handleClosePosition(p)}
        configuredLeverage={configuredLeverage}
        stopLossMarginPct={stopLossMarginPct}
        onSaveStopLoss={handleSaveStopLoss}
        hlActiveWallet={hlWallet}
        walletAddress={hlWallet}
        reasonRefreshKey={refreshKey}
        botRunning={botRunning}
        botScanSymbol={botAnalysisSymbol}
        botScanMetrics={botAnalysisMetrics}
        botScanWallet={botAnalysisWallet ?? hlWallet ?? null}
        botOpenPositionCoins={botOpenPositionCoins ?? positionCoins}
        botHlBalanceUsd={
          botAnalysisMetrics?.hlBalanceUsd ??
          botHlBalanceUsd ??
          toNum(account?.margin?.accountValue)
        }
        onDeposit={onDeposit}
        positionScope="bot"
        botManagedCoins={botManagedCoins}
        botManagedCoinsLoading={botManagedCoinsLoading}
      />
    </div>
  );
};

export default ProTradeHlBotDock;
