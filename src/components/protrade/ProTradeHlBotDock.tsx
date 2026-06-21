import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAccount } from 'wagmi';
import { useHyperliquidAccount } from '../../hooks/useHyperliquidAccount';
import { useHyperliquidMarkPrices } from '../../hooks/useHyperliquidMarkPrices';
import { useHyperliquidTrading } from '../../hooks/useHyperliquidTrading';
import { useTerminalBotSettings } from '../../hooks/useTerminalBotSettings';
import { effectiveHlBotSettings } from '../../lib/hlBotEffectiveSettings';
import { toNum } from '../../lib/hyperliquid/parse';
import type { HlPosition } from '../../lib/hyperliquid/user';
import type { Dashboard2Metrics } from '../../hooks/useDashboard2Metrics';
import { HL_MAX_CONCURRENT_POSITIONS } from '../../lib/hlBotConstants';
import TerminalBotAnalysisStrip from '../terminal/TerminalBotAnalysisStrip';
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
  className?: string;
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
  showBotAnalysis = false,
  botAnalysisMetrics,
  botAnalysisSymbol = 'ETHUSDT',
  botAnalysisWallet,
  botOpenPositionCoins,
  className,
  historyOnly = false,
}) => {
  const { address } = useAccount();
  const { wallet: settingsWallet, settings: botSettingsSnapshot } = useTerminalBotSettings();
  const configuredLeverage = effectiveHlBotSettings(botSettingsSnapshot).leverage;
  const hlWallet = (
    walletAddress ??
    settingsWallet ??
    address ??
    undefined
  )?.toLowerCase() as `0x${string}` | undefined;

  const {
    account,
    fills,
    funding,
    orderHistory,
    loading: accountLoading,
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

  const showAnalyzer =
    showBotAnalysis &&
    Boolean(botAnalysisMetrics?.autoTradeEnabled) &&
    botAnalysisMetrics &&
    dockTab === 'positions' &&
    positions.length < HL_MAX_CONCURRENT_POSITIONS &&
    !accountLoading;

  const connected = walletConnected || Boolean(hlWallet);

  return (
    <div
      className={`hl-bot-dock${historyOnly ? ' hl-bot-dock--history-only' : ''}${
        dockTab === 'tradeHistory' && !historyOnly ? ' hl-bot-dock--history-tab' : ''
      }${className ? ` ${className}` : ''}`}
    >
      {!historyOnly ? (
        <div className="hl-dock-mode-label">Monadier bot</div>
      ) : null}
      {showAnalyzer ? (
        <div className="hl-bot-dock-analyzer">
          <TerminalBotAnalysisStrip
            walletConnected={walletConnected}
            metrics={botAnalysisMetrics}
            vaultWallet={botAnalysisWallet ?? hlWallet ?? null}
            openPositionCoins={botOpenPositionCoins ?? positionCoins}
            symbol={botAnalysisSymbol}
            placement="dock"
          />
        </div>
      ) : null}
      {closeNotice ? (
        <p className="hl-dock-notice" role="status">
          {closeNotice}
        </p>
      ) : null}
      <ProTradeDock
        mode="bot"
        historyOnly={historyOnly}
        account={account}
        openOrders={[]}
        fills={fills}
        funding={funding}
        orderHistory={orderHistory}
        markPrices={markPrices}
        loading={accountLoading}
        connected={connected}
        activeTab={dockTab}
        onTabChange={(tab) => onTabChange?.(tab as HlBotDockTab)}
        onCoinClick={onCoinClick}
        actionBusy={closeBusy}
        onClosePosition={(p) => void handleClosePosition(p)}
        configuredLeverage={configuredLeverage}
        walletAddress={hlWallet}
        reasonRefreshKey={refreshKey}
      />
    </div>
  );
};

export default ProTradeHlBotDock;
