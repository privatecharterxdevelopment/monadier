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
  className?: string;
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
  className,
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
  const { prices: markPrices } = useHyperliquidMarkPrices(positionCoins);
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
        setCloseNotice('Could not read position price — try again in a few seconds.');
        return;
      }
      setCloseNotice('Closing position via HL agent…');
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
        setCloseNotice(`${position.coin} close submitted. Position should update in a few seconds.`);
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
    positions.length === 0 &&
    !accountLoading;

  const connected = walletConnected || Boolean(hlWallet);

  return (
    <div className={`hl-bot-dock${className ? ` ${className}` : ''}`}>
      <div className="hl-dock-mode-label">HL Bot · Hyperliquid perps</div>
      {showAnalyzer ? (
        <div className="hl-bot-dock-analyzer">
          <TerminalBotAnalysisStrip
            walletConnected={walletConnected}
            metrics={botAnalysisMetrics}
            vaultWallet={botAnalysisWallet ?? hlWallet ?? null}
            symbol={botAnalysisSymbol}
            placement="dock"
          />
        </div>
      ) : null}
      {closeNotice ? (
        <p className={`hl-dock-notice${closeNotice.includes('submitted') ? ' hl-dock-notice--ok' : ''}`} role="status">
          {closeNotice}
        </p>
      ) : null}
      <ProTradeDock
        mode="bot"
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
      />
    </div>
  );
};

export default ProTradeHlBotDock;
