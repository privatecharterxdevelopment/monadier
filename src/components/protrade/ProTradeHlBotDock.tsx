import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useWeb3 } from '../../contexts/Web3Context';
import { useAuth } from '../../contexts/AuthContext';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { useHyperliquidAccount } from '../../hooks/useHyperliquidAccount';
import { useHlAccountSnapshot } from '../../hooks/useHlAccountSnapshot';
import { useHlExchangeSnapshot } from '../../contexts/HlExchangeSnapshotContext';
import { useHyperliquidTrading } from '../../hooks/useHyperliquidTrading';
import { useTerminalBotSettings } from '../../hooks/useTerminalBotSettings';
import { useHlActiveWallet } from '../../hooks/useHlActiveWallet';
import { useHlBotRunning } from '../../hooks/useHlBotRunning';
import { effectiveHlBotSettings } from '../../lib/hlBotEffectiveSettings';
import { persistVaultSettings } from '../../lib/syncVaultSettings';
import { snapLeverageToStep } from '../../lib/leverageLimits';
import { registerBotStopSaver } from '../../lib/botStopSaver';
import { toNum } from '../../lib/hyperliquid/parse';
import { fetchHlAccountState, type HlPosition } from '../../lib/hyperliquid/user';
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
  walletConnected: _walletConnected = false,
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
  const { isDemoUser, isAuthenticated } = useAuth();
  const { planTier } = useSubscription();
  const { wallet: hlWallet } = useHlActiveWallet(walletAddress);
  const {
    settings: botSettingsSnapshot,
    wallet: settingsWallet,
    reload: reloadBotSettings,
  } = useTerminalBotSettings();
  const botEff = effectiveHlBotSettings(botSettingsSnapshot);
  const configuredLeverage = botEff.leverage;
  const configuredStopLoss = botEff.stopLoss;
  const [stopLossOverride, setStopLossOverride] = useState<number | null>(null);
  const stopLossMarginPct = stopLossOverride ?? configuredStopLoss;
  const { botRunning } = useHlBotRunning({
    metricsAutoTrade: botAnalysisMetrics?.autoTradeEnabled,
    metricsHasSnapshot: botAnalysisMetrics?.hasHlSnapshot,
  });

  const {
    account,
    spotBalances,
    fills,
    funding,
    orderHistory,
    loading: accountLoading,
    fillsLoading,
    refresh: refreshAccount,
    refreshAfterTrade,
  } = useHyperliquidAccount(hlWallet);
  const { snapshot: hlSnap } = useHlAccountSnapshot(hlWallet);
  const [fallbackAccount, setFallbackAccount] = useState<typeof account>(null);
  const fallbackWallet =
    settingsWallet &&
    hlWallet &&
    settingsWallet.toLowerCase() !== hlWallet.toLowerCase()
      ? settingsWallet
      : undefined;

  useEffect(() => {
    if ((account?.positions?.length ?? 0) > 0 || !fallbackWallet) {
      setFallbackAccount(null);
      return;
    }
    let cancelled = false;
    void fetchHlAccountState(fallbackWallet).then((acct) => {
      if (cancelled) return;
      if ((acct.positions?.length ?? 0) > 0) setFallbackAccount(acct);
    });
    return () => {
      cancelled = true;
    };
  }, [account?.positions?.length, fallbackWallet]);

  const dockAccount =
    (account?.positions?.length ?? 0) > 0 ? account : fallbackAccount ?? account;
  const positionsWallet =
    (account?.positions?.length ?? 0) > 0
      ? hlWallet
      : fallbackAccount
        ? fallbackWallet ?? hlWallet
        : hlWallet;
  const { snapshot: exchangeSnapshot } = useHlExchangeSnapshot();
  const positions = exchangeSnapshot?.positions ?? dockAccount?.positions ?? [];
  const markPrices = exchangeSnapshot?.marks ?? {};
  const exchangeDataStale = exchangeSnapshot?.stale ?? false;
  const { closePosition, busy: closeBusy, error: closeError } =
    useHyperliquidTrading();
  const [closeNotice, setCloseNotice] = useState<string | null>(null);

  const dockTab = normalizeHlBotDockTab(activeTab) as ProTradeDockTab;

  useEffect(() => {
    if (!closeError) return;
    setCloseNotice(closeError);
  }, [closeError]);

  useEffect(() => {
    void refreshAccount({ forceHeavy: true });
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

  useEffect(() => registerBotStopSaver(handleSaveStopLoss), [handleSaveStopLoss]);

  const handleClosePosition = useCallback(
    async (position: HlPosition) => {
      const closeWallet = positionsWallet ?? hlWallet;
      if (!closeWallet) {
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
          entryPx: toNum(position.entryPx),
          profitUsd,
          walletAddress: closeWallet,
        });
        setCloseNotice(null);
        onPositionChange?.();
        await refreshAccount({ forceHeavy: true });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Close failed';
        setCloseNotice(msg);
      }
    },
    [closePosition, hlWallet, positionsWallet, markPrices, refreshAccount, onPositionChange]
  );

  const handleDockTabChange = useCallback(
    (tab: ProTradeDockTab) => {
      onTabChange?.(normalizeHlBotDockTab(tab));
      if (tab === 'tradeHistory') void refreshAccount({ forceHeavy: true });
    },
    [onTabChange, refreshAccount]
  );

  // Safari / iOS often has no live MetaMask — still show the linked trading wallet.
  const connected =
    isAuthenticated && Boolean(hlWallet || positionsWallet || walletAddress);

  return (
    <div
      className={`hl-bot-dock${historyOnly ? ' hl-bot-dock--history-only' : ''}${
        dockTab === 'tradeHistory' && !historyOnly ? ' hl-bot-dock--history-tab' : ''
      }${!connected && !historyOnly ? ' hl-bot-dock--idle' : ''}${
        className ? ` ${className}` : ''
      }`}
    >
      {closeNotice ? (
        <p className="hl-dock-notice" role="status">
          {closeNotice}
        </p>
      ) : null}
      <ProTradeDock
        mode="bot"
        historyOnly={historyOnly}
        account={dockAccount}
        spotBalances={spotBalances}
        openOrders={[]}
        fills={fills}
        funding={funding}
        orderHistory={orderHistory}
        markPrices={markPrices}
        exchangeDataStale={exchangeDataStale}
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
        hlActiveWallet={positionsWallet}
        walletAddress={positionsWallet}
        reasonRefreshKey={refreshKey}
        botRunning={botRunning}
        botScanSymbol={botAnalysisSymbol}
        botScanMetrics={botAnalysisMetrics}
        botScanWallet={botAnalysisWallet ?? hlWallet ?? null}
        botOpenPositionCoins={botOpenPositionCoins ?? positionCoins}
        botHlBalanceUsd={Math.max(
          toNum(botAnalysisMetrics?.hlBalanceUsd),
          toNum(botHlBalanceUsd),
          toNum(hlSnap?.totalUsd),
          toNum(hlSnap?.tradablePerpUsd),
          toNum(hlSnap?.spotUsdcUsd),
          toNum(spotBalances.find((b) => b.coin === 'USDC')?.total),
          toNum(account?.margin?.accountValue),
          toNum(account?.crossMargin?.accountValue)
        )}
        onDeposit={onDeposit}
        positionScope="bot"
        botManagedCoins={botManagedCoins}
        botManagedCoinsLoading={botManagedCoinsLoading}
      />
    </div>
  );
};

export default ProTradeHlBotDock;
