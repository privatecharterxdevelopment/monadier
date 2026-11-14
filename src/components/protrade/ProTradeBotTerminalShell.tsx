import React, { useCallback, useMemo } from 'react';
import type { HlInterval } from '../../lib/hyperliquid/types';
import type { HlOpenOrder } from '../../lib/hyperliquid/user';
import type { HlBotDockTab } from './ProTradeHlBotDock';
import ProTradeTickerStrip from './ProTradeTickerStrip';
import ProTradeMarketBar from './ProTradeMarketBar';
import ProTradeChart from './ProTradeChart';
import ProTradeOrderBook from './ProTradeOrderBook';
import ProTradeBotAnalysis from './ProTradeBotAnalysis';
import { ProTradeBotDockSlot, ProTradeBotPanelSlot, ProTradeBotStatusBar } from './ProTradeBotSide';
import { BotTerminalAnalysisProvider } from '../../contexts/BotTerminalAnalysisContext';
import { useProTradeBot } from './ProTradeBotSide';
import { useHlBotRunning } from '../../hooks/useHlBotRunning';
import { HL_DEFAULT_CONCURRENT_POSITIONS } from '../../lib/hlBotConstants';
import { hlCoinToBotSymbol, isBotExcludedHlCoin } from '../../lib/botTradingPairs';
import { toNum } from '../../lib/hyperliquid/parse';
import type { useHyperliquidMarket } from '../../hooks/useHyperliquidMarket';
import type { HlMarketMeta } from '../../lib/hyperliquid/markets';
import type { useHlBotChartOverlay } from '../../hooks/useHlBotChartOverlay';
import type { useHlBotChartMarkers } from '../../hooks/useHlBotChartMarkers';
import type { useTerminalBotSettings } from '../../hooks/useTerminalBotSettings';

type PerpMarket = ReturnType<typeof useHyperliquidMarket>;
type ChartOverlay = ReturnType<typeof useHlBotChartOverlay>;
type VaultSettings = ReturnType<typeof useTerminalBotSettings>['settings'];
type BotTradeMarkers = ReturnType<typeof useHlBotChartMarkers>['seriesMarkers'];

export type ProTradeBotTerminalShellProps = {
  walletReady: boolean;
  botVaultSettings: VaultSettings;
  botOpenPositionCount: number;
  botTradableHlUsd: number;
  botTradingWallet: string | null | undefined;
  hlActiveWallet: string | null | undefined;
  address: string | null | undefined;
  botOpenPositionCoins: string[];
  botScanCoin: string;
  perpMarkets: HlMarketMeta[];
  perpCoin: string;
  onPerpCoinChange: (coin: string) => void;
  perpMarketsLoading: boolean;
  perpMarket: PerpMarket;
  interval: HlInterval;
  onIntervalChange: (interval: HlInterval) => void;
  perpOpenOrders: HlOpenOrder[];
  chartMarkPx: number | undefined;
  botChartOverlay: ChartOverlay;
  botTradeMarkers: BotTradeMarkers;
  botDockTab: HlBotDockTab;
  onBotDockTabChange: (tab: HlBotDockTab) => void;
  botManagedCoins: ReadonlySet<string>;
  botManagedCoinsLoading: boolean;
  onChartCoinClick: (coin: string) => void;
  onDeposit: () => void;
  onOpenHistory: () => void;
  onRequireSignIn: (reason: string) => void;
  accountWithdrawable: number;
  accountMarginValue: number;
  exchangeMarksWsLive: boolean;
  onLimitPriceClick: (px: number) => void;
};

/**
 * Stable bot terminal tree — must not be defined inside a parent component
 * (inline components remount every parent render → wallet “Connecting…” loop).
 */
const ProTradeBotTerminalShell: React.FC<ProTradeBotTerminalShellProps> = ({
  walletReady,
  botVaultSettings,
  botOpenPositionCount,
  botTradableHlUsd,
  botTradingWallet,
  hlActiveWallet,
  address,
  botOpenPositionCoins,
  botScanCoin,
  perpMarkets,
  perpCoin,
  onPerpCoinChange,
  perpMarketsLoading,
  perpMarket,
  interval,
  onIntervalChange,
  perpOpenOrders,
  chartMarkPx,
  botChartOverlay,
  botTradeMarkers,
  botDockTab,
  onBotDockTabChange,
  botManagedCoins,
  botManagedCoinsLoading,
  onChartCoinClick,
  onDeposit,
  onOpenHistory,
  onRequireSignIn,
  accountWithdrawable,
  accountMarginValue,
  exchangeMarksWsLive,
  onLimitPriceClick,
}) => {
  const { metrics } = useProTradeBot();
  const { botRunning } = useHlBotRunning({
    metricsAutoTrade: metrics.autoTradeEnabled,
    metricsHasSnapshot: metrics.hasHlSnapshot,
  });
  const botMaxSlots =
    botVaultSettings.maxConcurrentPositions >= 3
      ? 3
      : botVaultSettings.maxConcurrentPositions >= 2
        ? 2
        : HL_DEFAULT_CONCURRENT_POSITIONS;

  const manualMaxLeverage =
    perpMarket.snapshot && 'maxLeverage' in perpMarket.snapshot
      ? perpMarket.snapshot.maxLeverage
      : 40;

  const manualTradableUsd = Math.max(
    accountWithdrawable,
    perpMarket.snapshot &&
      'tradablePerpUsd' in perpMarket.snapshot &&
      typeof perpMarket.snapshot.tradablePerpUsd === 'number'
      ? perpMarket.snapshot.tradablePerpUsd
      : 0,
    accountMarginValue
  );

  const manualMarketOptions = useMemo(
    () => perpMarkets.map((m) => m.name).filter((c) => !isBotExcludedHlCoin(c)),
    [perpMarkets]
  );

  const onChartRetry = useCallback(() => {
    void perpMarket.refresh();
  }, [perpMarket]);

  const analysisSymbol = useMemo(() => hlCoinToBotSymbol(botScanCoin), [botScanCoin]);
  const vaultWallet = botTradingWallet ?? hlActiveWallet ?? address ?? null;
  const manualMarkPx = toNum(perpMarket.snapshot?.markPx);
  const orderBookMarkPx = manualMarkPx;

  return (
    <div className="hl-terminal hl-terminal--bot">
      <ProTradeTickerStrip markets={perpMarkets} coin={perpCoin} onCoinChange={onPerpCoinChange} />
      <ProTradeMarketBar
        coin={perpCoin}
        markets={perpMarkets}
        marketsLoading={perpMarketsLoading}
        snapshot={perpMarket.snapshot}
        loading={perpMarket.loading}
        onCoinChange={onPerpCoinChange}
        variant="perp"
      />

      {perpMarket.error ? (
        <div style={{ padding: '8px 12px', color: '#ef5350', fontSize: 12 }} role="alert">
          {perpMarket.error}
        </div>
      ) : null}

      <BotTerminalAnalysisProvider
        walletConnected={walletReady}
        metrics={metrics}
        openPositionsCount={botOpenPositionCount}
        maxConcurrentPositions={botMaxSlots}
        vaultUsd={botTradableHlUsd}
        vaultWallet={vaultWallet}
        openPositionCoins={botOpenPositionCoins}
        symbol={analysisSymbol}
        botRunning={botRunning}
        hlBotStrategy={botVaultSettings.hlBotStrategy}
      >
        <div className="hl-body">
          <div className="hl-workspace-main">
            <div className="hl-chart-row">
              <div className="hl-bot-chart-stack">
                <ProTradeChart
                  coin={perpCoin}
                  interval={interval}
                  candles={perpMarket.candles}
                  loading={perpMarket.loading}
                  openOrders={perpOpenOrders}
                  onIntervalChange={onIntervalChange}
                  layoutKey={`bot-${perpCoin}`}
                  markPx={chartMarkPx}
                  positionOverlay={botChartOverlay}
                  tradeMarkers={botTradeMarkers}
                  onChartRetry={onChartRetry}
                  wsConnected={perpMarket.wsConnected}
                  chartError={perpMarket.error}
                  fetchAttempts={perpMarket.fetchAttempts}
                />
                <ProTradeBotAnalysis
                  walletConnected={walletReady}
                  perpCoin={perpCoin}
                  scanCoin={botScanCoin}
                  openPositionCoins={botOpenPositionCoins}
                />
              </div>
              <ProTradeOrderBook
                book={perpMarket.book}
                recentTrades={perpMarket.recentTrades}
                markPx={orderBookMarkPx}
                coin={perpCoin}
                onPriceClick={onLimitPriceClick}
              />
            </div>
            <ProTradeBotDockSlot
              dockTab={botDockTab}
              onDockTabChange={onBotDockTabChange}
              analysisSymbol={analysisSymbol}
              openPositionCoins={botOpenPositionCoins}
              botManagedCoins={botManagedCoins}
              botManagedCoinsLoading={botManagedCoinsLoading}
              onCoinClick={onChartCoinClick}
              onDeposit={onDeposit}
            />
          </div>

          <ProTradeBotPanelSlot
            onOpenHistory={onOpenHistory}
            onRequireSignIn={onRequireSignIn}
            manualTradeCoin={perpCoin}
            manualMarkPx={manualMarkPx}
            manualMaxLeverage={manualMaxLeverage}
            manualTradableUsd={manualTradableUsd}
            manualMarketOptions={manualMarketOptions}
            onManualTradeCoinChange={onChartCoinClick}
          />
        </div>
      </BotTerminalAnalysisProvider>

      <ProTradeBotStatusBar
        walletConnected={walletReady}
        wsLive={perpMarket.wsConnected && exchangeMarksWsLive}
      />
    </div>
  );
};

export default React.memo(ProTradeBotTerminalShell);