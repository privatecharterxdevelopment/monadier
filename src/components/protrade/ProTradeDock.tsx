import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, Loader2, Share2, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { displayHandle } from '../../lib/username';
import TradeShareModal from './TradeShareModal';
import type {
  HlAccountState,
  HlFundingPayment,
  HlHistoricalOrder,
  HlOpenOrder,
  HlPosition,
  HlSpotBalance,
  HlTwapOrder,
  HlUserFill,
} from '../../lib/hyperliquid/user';
import { isHlTriggerOrder, livePositionUpnl } from '../../lib/hyperliquid/user';
import {
  fmtLeverage,
  fmtPrice,
  fmtSize,
  fmtTimeMs,
  fmtUsdSymbol,
  fmtTradeUsdSymbol,
  fmtClosedPnl,
  fmtFillAction,
  fillPositionDirection,
  hlFillResultLabel,
  isHlFillClose,
} from '../../lib/hyperliquid/format';
import { hlWalletExplorerUrl } from '../../lib/hyperliquid/hlApp';
import {
  aggregateHlCloseFills,
  aggregatedCloseFillKey,
  balanceAfterByCloseFill,
  type AggregatedHlCloseFill,
} from '../../lib/hyperliquid/hlFillAggregate';
import { resolveDisplayLeverage } from '../../lib/hyperliquid/displayLeverage';
import { toNum } from '../../lib/hyperliquid/parse';
import { useHlTradeReasonMarkers } from '../../hooks/useHlTradeReasonMarkers';
import { useHlBotTradeWindows } from '../../hooks/useHlBotTradeWindows';
import {
  filterFillsByScope,
  filterFundingByScope,
  filterOrdersByScope,
} from '../../lib/hyperliquid/splitHlActivity';
import { trailStopForOpenPosition, type ActiveSlDisplay } from '../../lib/hlTrailingStopChart';
import { useHlPositionPeakPnl } from '../../hooks/useHlPositionPeakPnl';
import { useHlBotTrailSnapshots } from '../../hooks/useHlBotTrailSnapshots';
import { HL_DEFAULT_STOP_LOSS_PERCENT } from '../../lib/hlBotConstants';
import TradeReasonHint from '../terminal/TradeReasonHint';
import DockCountBadge from './DockCountBadge';
import PositionStopEditModal from './PositionStopEditModal';
import { getAppQueryLink } from '../../lib/appUrls';
import { useHlAccountSnapshot } from '../../hooks/useHlAccountSnapshot';
import { MIN_HL_BOT_USD } from '../../lib/hyperliquid/hlBotAgent';
import { normalizeHlPerpCoin } from '../../lib/botTradingPairs';
import type { Dashboard2Metrics } from '../../hooks/useDashboard2Metrics';
import { usePlatformFees } from '../../hooks/usePlatformFees';
import { usePlatformFeeGate } from '../../contexts/PlatformFeeContext';
import ProTradeBotScanInsights from './ProTradeBotScanInsights';

const PLATFORM_FEE_BPS = 1000;
function platformFeeFromPnl(closedPnl: string | number): number {
  const pnl = toNum(closedPnl);
  if (pnl <= 0) return 0;
  return Math.round(((pnl * PLATFORM_FEE_BPS) / 10_000) * 1e6) / 1e6;
}

// Shared with the status-bar header so both always agree — see livePositionUpnl.
const livePositionPnl = livePositionUpnl;

const TABS = [
  { id: 'balances', labelKey: 'dock.tabs.balances' },
  { id: 'positions', labelKey: 'dock.tabs.positions' },
  { id: 'orders', labelKey: 'dock.tabs.orders' },
  { id: 'twap', labelKey: 'dock.tabs.twap' },
  { id: 'trailing', labelKey: 'dock.tabs.trailing' },
  { id: 'tradeHistory', labelKey: 'dock.tabs.tradeHistory' },
  { id: 'feeHistory', labelKey: 'dock.tabs.feeHistory' },
  { id: 'fundingHistory', labelKey: 'dock.tabs.fundingHistory' },
  { id: 'orderHistory', labelKey: 'dock.tabs.orderHistory' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export type ProTradeDockTab = TabId;

type Props = {
  account: HlAccountState | null;
  spotBalances?: HlSpotBalance[];
  openOrders: HlOpenOrder[];
  fills: HlUserFill[];
  funding: HlFundingPayment[];
  orderHistory: HlHistoricalOrder[];
  twapOrders?: HlTwapOrder[];
  markPrices: Record<string, number>;
  loading: boolean;
  fillsLoading?: boolean;
  connected: boolean;
  activeTab?: ProTradeDockTab;
  onTabChange?: (tab: ProTradeDockTab) => void;
  onCoinClick?: (coin: string) => void;
  actionBusy?: boolean;
  variant?: 'perp' | 'spot';
  onCancelOrder?: (coin: string, oid: number) => void;
  onCancelAllOrders?: () => void;
  onCancelTwap?: (coin: string, twapId: number) => void;
  onClosePosition?: (position: HlPosition) => void;
  /** Saved bot leverage — shown in positions table when set. */
  configuredLeverage?: number;
  /** Max loss % on margin (settings) — shown when position is in loss. */
  stopLossMarginPct?: number;
  /** Persist new max-loss % from position stop editor. */
  onSaveStopLoss?: (stopLossPct: number) => Promise<{ ok: boolean; error?: string }>;
  /** @deprecated Wallet shown elsewhere — not in dock tabs. */
  hlActiveWallet?: string | null;
  /** Bot wallet — for open-trade reason tooltips. */
  walletAddress?: string | null;
  reasonRefreshKey?: number;
  /** Bot terminal dock — positions, balances, trade history. */
  mode?: 'full' | 'bot';
  /** Profile bot history — fills table only, no dock tabs. */
  historyOnly?: boolean;
  /** Bot auto-trade on — empty positions tab shows scan status. */
  botRunning?: boolean;
  botScanSymbol?: string;
  botScanMetrics?: Dashboard2Metrics;
  botScanWallet?: string | null;
  botOpenPositionCoins?: string[];
  botHlBalanceUsd?: number;
  onDeposit?: () => void;
  /** Perps = manual-only; bot = bot-managed coins / bot-attributed fills. */
  positionScope?: 'manual' | 'bot';
  botManagedCoins?: ReadonlySet<string>;
  botManagedCoinsLoading?: boolean;
};

const ProTradeDock: React.FC<Props> = ({
  account,
  spotBalances = [],
  openOrders,
  fills,
  funding,
  orderHistory,
  twapOrders = [],
  markPrices,
  loading,
  fillsLoading = false,
  connected,
  activeTab,
  onTabChange,
  onCoinClick,
  actionBusy,
  variant = 'perp',
  onCancelOrder,
  onCancelAllOrders,
  onCancelTwap,
  onClosePosition,
  configuredLeverage,
  stopLossMarginPct = HL_DEFAULT_STOP_LOSS_PERCENT,
  onSaveStopLoss,
  hlActiveWallet: _hlActiveWallet,
  walletAddress,
  reasonRefreshKey = 0,
  mode = 'full',
  historyOnly = false,
  botRunning = false,
  botScanSymbol,
  botScanMetrics,
  botScanWallet,
  botOpenPositionCoins = [],
  botHlBalanceUsd = 0,
  onDeposit,
  positionScope,
  botManagedCoins,
  botManagedCoinsLoading = false,
}) => {
  const { t } = useTranslation();
  const { user, profile, isAuthenticated } = useAuth();
  const shareDisplayName = profile?.username?.trim()
    ? `@${profile.username.trim()}`
    : displayHandle(profile, user?.email);
  const [shareFill, setShareFill] = useState<AggregatedHlCloseFill | null>(null);
  const isSpot = variant === 'spot';
  const isBotMode = mode === 'bot';
  const scope: 'manual' | 'bot' = positionScope ?? (isBotMode ? 'bot' : 'manual');
  const managedCoins = botManagedCoins ?? new Set<string>();
  const positionOpenSinceRef = useRef<Map<string, number>>(new Map());
  const dockWallet = walletAddress?.toLowerCase();
  const { windows: botWindows, fillTids: botFillTids, markers: botMarkers } = useHlBotTradeWindows(
    dockWallet,
    reasonRefreshKey
  );
  const scopedFills = useMemo(
    () =>
      isSpot
        ? fills
        : filterFillsByScope(fills, scope, botWindows, botFillTids, botMarkers),
    [fills, isSpot, scope, botWindows, botFillTids, botMarkers]
  );
  const scopedFunding = useMemo(
    () => (isSpot ? funding : filterFundingByScope(funding, scope, botWindows)),
    [funding, isSpot, scope, botWindows]
  );
  const scopedOrderHistory = useMemo(
    () =>
      isSpot
        ? orderHistory
        : filterOrdersByScope(orderHistory, scope, botWindows, botMarkers),
    [orderHistory, isSpot, scope, botWindows, botMarkers]
  );
  const platformFees = usePlatformFeeGate();
  const platformFeeLedger = usePlatformFees(dockWallet, Boolean(dockWallet));
  const { snapshot: hlSnap } = useHlAccountSnapshot(dockWallet);
  const unifiedAccount = hlSnap?.unifiedAccount ?? false;
  const spotUsdcUsd = Math.max(
    toNum(hlSnap?.spotUsdcUsd),
    toNum(spotBalances.find((b) => b.coin === 'USDC')?.total)
  );
  const accountEquityUsd = Math.max(
    toNum(account?.margin?.accountValue),
    toNum(account?.crossMargin?.accountValue)
  );
  /** Live equity — never let a stale snap $0 win over account / open margin. */
  const hlEquityUsd = Math.max(
    toNum(botHlBalanceUsd),
    toNum(hlSnap?.totalUsd),
    toNum(hlSnap?.tradablePerpUsd),
    toNum(hlSnap?.accountUsd),
    toNum(hlSnap?.withdrawableUsd),
    accountEquityUsd,
    spotUsdcUsd,
    toNum(hlSnap?.totalMarginUsedUsd),
    toNum(account?.margin?.totalMarginUsed),
    toNum(account?.withdrawable)
  );
  const tradableHlUsd = Math.max(
    toNum(hlSnap?.tradablePerpUsd),
    accountEquityUsd + (unifiedAccount ? 0 : spotUsdcUsd),
    hlEquityUsd
  );
  const rawPerpUsd = Math.max(toNum(hlSnap?.accountUsd), accountEquityUsd);
  const hlWithdrawableUsd = Math.max(
    toNum(hlSnap?.withdrawableUsd),
    toNum(account?.withdrawable)
  );
  const visibleTabs = historyOnly
    ? TABS.filter((t) => t.id === 'tradeHistory')
    : isBotMode
    ? TABS.filter((t) => ['positions', 'balances', 'tradeHistory'].includes(t.id))
    : isSpot
      ? TABS.filter((t) => !['positions', 'fundingHistory'].includes(t.id))
      : TABS;
  const activeTwapCount = twapOrders.filter((t) => t.status === 'activated').length;
  const triggerOrders = openOrders.filter(isHlTriggerOrder);
  const [internalTab, setInternalTab] = useState<TabId>(
    historyOnly ? 'tradeHistory' : isBotMode ? 'positions' : 'positions'
  );
  const [search, setSearch] = useState('');
  const [stopEdit, setStopEdit] = useState<{
    position: HlPosition;
    activeSl: ActiveSlDisplay;
    entryPx: number;
    szi: number;
    markPx: number;
    leverage: number;
  } | null>(null);
  const tab = historyOnly ? 'tradeHistory' : activeTab ?? internalTab;
  const setTab = (next: TabId) => {
    onTabChange?.(next);
    if (activeTab == null) setInternalTab(next);
  };

  const scopedPositions = useMemo(() => {
    const list = account?.positions ?? [];
    return list.filter((p) => {
      if (Math.abs(toNum(p.szi)) <= 1e-12) return false;
      const coin = normalizeHlPerpCoin(p.coin);
      const isBot = managedCoins.has(coin);
      return scope === 'bot' ? isBot : !isBot;
    });
  }, [account?.positions, managedCoins, scope]);

  const hlOpenPositionCount = useMemo(
    () =>
      (account?.positions ?? []).filter((p) => Math.abs(toNum(p.szi)) > 1e-12).length,
    [account?.positions]
  );

  const positionCount = scopedPositions.length;
  const positionCoins = useMemo(
    () => scopedPositions.map((p) => p.coin),
    [scopedPositions]
  );
  useEffect(() => {
    const now = Date.now();
    const seen = positionOpenSinceRef.current;
    for (const coin of positionCoins) {
      if (!seen.has(coin)) seen.set(coin, now);
    }
    for (const coin of [...seen.keys()]) {
      if (!positionCoins.includes(coin)) seen.delete(coin);
    }
  }, [positionCoins]);
  const historyCoins = useMemo(() => {
    const set = new Set<string>(positionCoins);
    for (const f of scopedFills) {
      if (isHlFillClose(f.dir, f.closedPnl)) set.add(f.coin);
    }
    return [...set];
  }, [positionCoins, scopedFills]);
  const { closeReasonForFill } = useHlTradeReasonMarkers(
    isBotMode ? (walletAddress ?? undefined) : undefined,
    historyCoins,
    reasonRefreshKey
  );
  const positionUpnl = useMemo(
    () =>
      scopedPositions.reduce(
        (s, p) => s + livePositionPnl(p, markPrices[p.coin] ?? 0),
        0
      ),
    [scopedPositions, markPrices]
  );
  const positionTone: 'pos' | 'neg' | null =
    positionCount > 0 ? (positionUpnl >= 0 ? 'pos' : 'neg') : null;

  const hasOpenHlCapital =
    hlOpenPositionCount > 0 ||
    (hlSnap?.openPositionsCount ?? 0) > 0 ||
    toNum(hlSnap?.openNotionalUsd) > 1 ||
    toNum(hlSnap?.totalMarginUsedUsd) >= 1;

  const balanceKnown =
    hlSnap != null || account != null || toNum(botHlBalanceUsd) > 0 || hasOpenHlCapital;

  const botNeedsDepositRaw =
    isBotMode &&
    connected &&
    !loading &&
    balanceKnown &&
    !hasOpenHlCapital &&
    hlEquityUsd < MIN_HL_BOT_USD;

  // Debounce so brief HL $0 blips never flash "paused / Deposit USDC".
  const [botUnderfunded, setBotUnderfunded] = useState(false);
  useEffect(() => {
    if (!botNeedsDepositRaw) {
      setBotUnderfunded(false);
      return;
    }
    const timer = window.setTimeout(() => setBotUnderfunded(true), 2_500);
    return () => window.clearTimeout(timer);
  }, [botNeedsDepositRaw]);
  const botNeedsDeposit = botUnderfunded;

  const closeFills = useMemo(
    () => aggregateHlCloseFills(scopedFills),
    [scopedFills]
  );
  /** Wallet-wide closes — Zwischenbalance must track real equity, not bot-scoped subset. */
  const allCloseFills = useMemo(() => aggregateHlCloseFills(fills), [fills]);
  const accountOpenUpnl = useMemo(
    () =>
      (account?.positions ?? []).reduce((sum, p) => sum + toNum(p.unrealizedPnl), 0),
    [account?.positions]
  );
  const flatEquityNow = useMemo(() => {
    const accountValue = toNum(account?.margin?.accountValue);
    if (!Number.isFinite(accountValue) || accountValue <= 0) return null;
    return accountValue - accountOpenUpnl;
  }, [account?.margin?.accountValue, accountOpenUpnl]);
  const balanceAfterByFill = useMemo(
    () =>
      flatEquityNow == null
        ? new Map<string, number>()
        : balanceAfterByCloseFill(allCloseFills, flatEquityNow),
    [allCloseFills, flatEquityNow]
  );

  const tabSuffix = (id: TabId) => {
    if (id === 'positions' && positionCount > 0) {
      return <DockCountBadge count={positionCount} tone={positionTone} />;
    }
    if (id === 'orders' && openOrders.length > 0) {
      return <span className="hl-dock-count">({openOrders.length})</span>;
    }
    if (id === 'twap' && activeTwapCount > 0) {
      return <span className="hl-dock-count">({activeTwapCount})</span>;
    }
    if (id === 'trailing' && triggerOrders.length > 0) {
      return <span className="hl-dock-count">({triggerOrders.length})</span>;
    }
    if (id === 'tradeHistory' && closeFills.length > 0) {
      return <span className="hl-dock-count">({closeFills.length})</span>;
    }
    return null;
  };

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return openOrders;
    return openOrders.filter((o) => o.coin.toLowerCase().includes(q));
  }, [openOrders, search]);

  const filteredPositions = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = scopedPositions;
    if (!q) return list;
    return list.filter((p) => p.coin.toLowerCase().includes(q));
  }, [scopedPositions, search]);

  const livePnlByCoin = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of filteredPositions) {
      const mark = markPrices[p.coin] ?? 0;
      map[p.coin] = livePositionPnl(p, mark);
    }
    return map;
  }, [filteredPositions, markPrices]);

  const peakPnlFor = useHlPositionPeakPnl(filteredPositions, livePnlByCoin);
  const botTrailByCoin = useHlBotTrailSnapshots(
    isBotMode ? walletAddress : null,
    isBotMode && Boolean(walletAddress)
  );

  const filteredCloseFills = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return closeFills;
    return closeFills.filter((f) => f.coin.toLowerCase().includes(q));
  }, [closeFills, search]);

  return (
    <section className={`hl-dock${isBotMode ? ' hl-bot-dock-inner' : ''}`}>
      <div className={`hl-dock-head${historyOnly ? ' hl-dock-head--history-only' : ''}`}>
        {!historyOnly ? (
          <nav className="hl-dock-tabs" aria-label={t('dock.ariaPanels')}>
            {visibleTabs.map(({ id, labelKey }) => (
              <button
                key={id}
                type="button"
                className={`hl-dock-tab ${tab === id ? 'hl-dock-tab--on' : ''}`}
                onClick={() => setTab(id)}
              >
                {t(labelKey)}
                {tabSuffix(id)}
              </button>
            ))}
          </nav>
        ) : (
          <p className="hl-dock-history-only-label">{t('dock.closedFillsLabel')}</p>
        )}
        <div className="hl-dock-tools">
          {isBotMode && tab === 'tradeHistory' && !historyOnly ? (
            <Link
              to={getAppQueryLink('section=profile&tab=botTrades')}
              className="hl-dock-full-history-link"
            >
              {t('dock.seeCompleteHistory')}
            </Link>
          ) : null}
          <input
            className="hl-dock-search"
            placeholder={t('dock.coinsPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {tab === 'orders' && openOrders.length > 0 ? (
            <button
              type="button"
              className="hl-dock-action"
              disabled={actionBusy}
              onClick={onCancelAllOrders}
            >
              {t('dock.cancelAll')}
            </button>
          ) : null}
        </div>
      </div>

      <div className="hl-dock-body">
        {!isAuthenticated ? (
          <p className="hl-dock-empty">{t('dock.signInRequired')}</p>
        ) : !connected ? (
          <p className="hl-dock-empty">{t('dock.connectWallet')}</p>
        ) : loading && !account ? (
          <p className="hl-dock-empty">
            <Loader2 size={14} className="animate-spin inline" /> {t('dock.syncing')}
          </p>
        ) : tab === 'balances' ? (
          isSpot ? (
            spotBalances.length > 0 ? (
              <table className="hl-table">
                <thead>
                  <tr>
                    <th>{t('dock.cols.token')}</th>
                    <th>{t('dock.cols.total')}</th>
                    <th>{t('dock.cols.onHold')}</th>
                  </tr>
                </thead>
                <tbody>
                  {spotBalances.map((b) => (
                    <tr key={`${b.coin}-${b.token}`}>
                      <td>{b.coin}</td>
                      <td>{b.total}</td>
                      <td>{b.hold}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="hl-dock-empty">{t('dock.noSpotBalances')}</p>
            )
          ) : (
            <table className="hl-table">
              <thead>
                <tr>
                  <th>{t('dock.cols.asset')}</th>
                  <th>{t('dock.cols.total')}</th>
                  <th>{t('dock.cols.available')}</th>
                </tr>
              </thead>
              <tbody>
                {unifiedAccount ? (
                  <tr>
                    <td>{t('dock.usdcUnified')}</td>
                    <td>{fmtUsdSymbol(tradableHlUsd)}</td>
                    <td>{fmtUsdSymbol(hlWithdrawableUsd)}</td>
                  </tr>
                ) : (
                  <>
                    <tr>
                      <td>{t('dock.usdcPerp')}</td>
                      <td>{fmtUsdSymbol(rawPerpUsd)}</td>
                      <td>{fmtUsdSymbol(hlWithdrawableUsd)}</td>
                    </tr>
                    <tr>
                      <td>{t('dock.usdcSpot')}</td>
                      <td>{fmtUsdSymbol(spotUsdcUsd)}</td>
                      <td>
                        {fmtUsdSymbol(
                          spotUsdcUsd -
                            toNum(spotBalances.find((b) => b.coin === 'USDC')?.hold)
                        )}
                      </td>
                    </tr>
                  </>
                )}
                <tr>
                  <td>{t('dock.marginUsed')}</td>
                  <td colSpan={2}>{fmtUsdSymbol(account?.margin?.totalMarginUsed)}</td>
                </tr>
                <tr>
                  <td>{t('dock.notional')}</td>
                  <td colSpan={2}>{fmtUsdSymbol(account?.margin?.totalNtlPos)}</td>
                </tr>
              </tbody>
            </table>
          )
        ) : tab === 'positions' ? (
          <div className="hl-dock-positions-pane">
            {filteredPositions.length > 0 ? (
            <>
            <div className="hl-dock-table-scroll">
            <table className="hl-table hl-table--positions">
              <thead>
                <tr>
                  <th>{t('dock.cols.coin')}</th>
                  <th>{t('dock.cols.side')}</th>
                  <th>{t('dock.cols.size')}</th>
                  <th className="hl-col-optional">{t('dock.cols.value')}</th>
                  <th className="hl-col-optional">{t('dock.cols.entry')}</th>
                  <th className="hl-col-optional">{t('dock.cols.mark')}</th>
                  <th>{t('dock.cols.pnl')}</th>
                  <th className="hl-col-optional">{t('dock.cols.lev')}</th>
                  {isBotMode ? <th>{t('dock.cols.stop')}</th> : null}
                  <th />
                </tr>
              </thead>
              <tbody>
                {filteredPositions.map((p) => {
                  const isLong = toNum(p.szi) >= 0;
                  const mark = markPrices[p.coin] ?? 0;
                  const upnl = livePositionPnl(p, mark);
                  const lev = isBotMode
                    ? resolveDisplayLeverage(configuredLeverage, p.leverage?.value)
                    : Math.max(1, toNum(p.leverage?.value));
                  const peakPnl = peakPnlFor(p.coin, toNum(p.entryPx), toNum(p.szi), upnl);
                  const botTrail = botTrailByCoin[p.coin];
                  const activeSl = trailStopForOpenPosition({
                    entryPx: toNum(p.entryPx),
                    szi: toNum(p.szi),
                    markPx: mark > 0 ? mark : toNum(p.entryPx),
                    unrealizedPnlUsd: upnl,
                    leverage: lev,
                    coin: p.coin,
                    peakPnlUsd: peakPnl,
                    stopLossMarginPct,
                    holdMs: Date.now() - (positionOpenSinceRef.current.get(p.coin) ?? Date.now()),
                    serverTrail: botTrail
                      ? {
                          phase: botTrail.phase,
                          peakPnlUsd: botTrail.peakPnlUsd,
                          lockPnlUsd: botTrail.lockPnlUsd,
                          lockRoePct: botTrail.lockRoePct,
                          stopPx: botTrail.stopPx,
                          wouldCloseNow: botTrail.wouldCloseNow,
                          stateTracked: botTrail.stateTracked,
                        }
                      : undefined,
                  });
                  return (
                    <tr key={p.coin}>
                      <td>
                        <button type="button" className="hl-coin-link" onClick={() => onCoinClick?.(p.coin)}>
                          {p.coin}
                        </button>
                      </td>
                      <td className={isLong ? 'hl-up' : 'hl-down'}>{isLong ? 'LONG' : 'SHORT'}</td>
                      <td>{fmtSize(Math.abs(toNum(p.szi)))}</td>
                      <td className="hl-col-optional">{fmtUsdSymbol(p.positionValue)}</td>
                      <td className="hl-col-optional">{fmtPrice(p.entryPx)}</td>
                      <td className="hl-col-optional">{mark > 0 ? fmtPrice(mark) : '—'}</td>
                      <td className={upnl >= 0 ? 'hl-up' : 'hl-down'}>
                        {fmtTradeUsdSymbol(upnl)}
                      </td>
                      <td className="hl-col-optional">{fmtLeverage(lev)}</td>
                      {isBotMode ? (
                        <td className={`hl-active-sl hl-active-sl--${activeSl.kind}`}>
                          {onSaveStopLoss ? (
                            <button
                              type="button"
                              className="hl-active-sl__btn"
                              title={activeSl.title ?? 'Edit stop loss'}
                              onClick={() =>
                                setStopEdit({
                                  position: p,
                                  activeSl,
                                  entryPx: toNum(p.entryPx),
                                  szi: toNum(p.szi),
                                  markPx: mark > 0 ? mark : toNum(p.entryPx),
                                  leverage: lev,
                                })
                              }
                            >
                              <span className="hl-active-sl__price">{activeSl.label}</span>
                            </button>
                          ) : (
                            <span className="hl-active-sl__price" title={activeSl.title}>
                              {activeSl.label}
                            </span>
                          )}
                        </td>
                      ) : null}
                      <td>
                        <button
                          type="button"
                          className="hl-dock-action"
                          disabled={actionBusy}
                          onClick={() => onClosePosition?.(p)}
                        >
                          Close
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            <div className="hl-pos-cards" aria-hidden={false}>
              {filteredPositions.map((p) => {
                const isLong = toNum(p.szi) >= 0;
                const mark = markPrices[p.coin] ?? 0;
                const upnl = livePositionPnl(p, mark);
                const lev = isBotMode
                  ? resolveDisplayLeverage(configuredLeverage, p.leverage?.value)
                  : Math.max(1, toNum(p.leverage?.value));
                const peakPnl = peakPnlFor(p.coin, toNum(p.entryPx), toNum(p.szi), upnl);
                const botTrail = botTrailByCoin[p.coin];
                const activeSl = trailStopForOpenPosition({
                  entryPx: toNum(p.entryPx),
                  szi: toNum(p.szi),
                  markPx: mark > 0 ? mark : toNum(p.entryPx),
                  unrealizedPnlUsd: upnl,
                  leverage: lev,
                  coin: p.coin,
                  peakPnlUsd: peakPnl,
                  stopLossMarginPct,
                  holdMs: Date.now() - (positionOpenSinceRef.current.get(p.coin) ?? Date.now()),
                  serverTrail: botTrail
                    ? {
                        phase: botTrail.phase,
                        peakPnlUsd: botTrail.peakPnlUsd,
                        lockPnlUsd: botTrail.lockPnlUsd,
                        lockRoePct: botTrail.lockRoePct,
                        stopPx: botTrail.stopPx,
                        wouldCloseNow: botTrail.wouldCloseNow,
                        stateTracked: botTrail.stateTracked,
                      }
                    : undefined,
                });
                return (
                  <article key={`card-${p.coin}`} className="hl-pos-card">
                    <header className="hl-pos-card__head">
                      <button
                        type="button"
                        className="hl-coin-link"
                        onClick={() => onCoinClick?.(p.coin)}
                      >
                        {p.coin}
                      </button>
                      <span className={isLong ? 'hl-up' : 'hl-down'}>
                        {isLong ? 'LONG' : 'SHORT'} · {fmtLeverage(lev)}
                      </span>
                      <span className={upnl >= 0 ? 'hl-up' : 'hl-down'}>
                        {fmtTradeUsdSymbol(upnl)}
                      </span>
                    </header>
                    <dl className="hl-pos-card__grid">
                      <div>
                        <dt>{t('dock.cols.size')}</dt>
                        <dd>{fmtSize(Math.abs(toNum(p.szi)))}</dd>
                      </div>
                      <div>
                        <dt>{t('dock.cols.value')}</dt>
                        <dd>{fmtUsdSymbol(p.positionValue)}</dd>
                      </div>
                      <div>
                        <dt>{t('dock.cols.entry')}</dt>
                        <dd>{fmtPrice(p.entryPx)}</dd>
                      </div>
                      <div>
                        <dt>{t('dock.cols.mark')}</dt>
                        <dd>{mark > 0 ? fmtPrice(mark) : '—'}</dd>
                      </div>
                      {isBotMode ? (
                        <div className="hl-pos-card__stop">
                          <dt>{t('dock.cols.stop')}</dt>
                          <dd className={`hl-active-sl hl-active-sl--${activeSl.kind}`}>
                            {onSaveStopLoss ? (
                              <button
                                type="button"
                                className="hl-active-sl__btn"
                                title={activeSl.title ?? 'Edit stop loss'}
                                onClick={() =>
                                  setStopEdit({
                                    position: p,
                                    activeSl,
                                    entryPx: toNum(p.entryPx),
                                    szi: toNum(p.szi),
                                    markPx: mark > 0 ? mark : toNum(p.entryPx),
                                    leverage: lev,
                                  })
                                }
                              >
                                <span className="hl-active-sl__price">{activeSl.label}</span>
                              </button>
                            ) : (
                              <span className="hl-active-sl__price" title={activeSl.title}>
                                {activeSl.label}
                              </span>
                            )}
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                    <button
                      type="button"
                      className="hl-dock-action hl-pos-card__close"
                      disabled={actionBusy}
                      onClick={() => onClosePosition?.(p)}
                    >
                      Close
                    </button>
                  </article>
                );
              })}
            </div>
            </>
          ) : isBotMode && platformFees.botTradingBlocked ? (
            <div className="hl-dock-empty hl-dock-empty--bot-scan" role="status">
              <span className="hl-dock-bot-scan-title">Bot fees due</span>
              <p className="hl-dock-bot-scan-sub">
                Pay {fmtUsdSymbol(platformFees.accruedUsd)} to resume bot trading and market analysis (
                {platformFees.successWinCount}/{platformFees.winsBeforeBlock} wins).
              </p>
            </div>
          ) : isBotMode && botManagedCoinsLoading && hlOpenPositionCount > 0 ? (
            <p className="hl-dock-empty" role="status">
              Loading open positions…
            </p>
          ) : isBotMode && hlOpenPositionCount > 0 && scopedPositions.length === 0 ? (
            <p className="hl-dock-empty" role="status">
              {hlOpenPositionCount} open on Hyperliquid — not tagged as bot yet (syncing markers). Check
              Perps → Positions, or refresh in a few seconds.
            </p>
          ) : isBotMode && botRunning && !botNeedsDeposit ? (
            <div className="hl-dock-empty hl-dock-empty--bot-scan" role="status">
              {botScanMetrics ? (
                <ProTradeBotScanInsights
                  walletConnected={Boolean(walletAddress)}
                  metrics={botScanMetrics}
                  vaultWallet={botScanWallet ?? walletAddress ?? null}
                  symbol={botScanSymbol}
                  openPositionCoins={botOpenPositionCoins}
                  botRunning={botRunning}
                />
              ) : (
                <>
                  <div className="hl-dock-bot-scan-row">
                    <Loader2 size={14} className="hl-dock-bot-scan-loader animate-spin" aria-hidden />
                    <span className="hl-dock-bot-scan-title">Bot is reading market…</span>
                  </div>
                  <p className="hl-dock-bot-scan-sub">Loading analyzer…</p>
                </>
              )}
            </div>
          ) : (
            <p className="hl-dock-empty">
              {scope === 'manual' && managedCoins.size > 0
                ? t('dock.noManualPositions')
                : t('dock.noOpenPositions')}
            </p>
          )}
            {botUnderfunded ? (
              <p className="hl-dock-fund-nudge hl-dock-fund-nudge--desktop" role="status">
                <span>
                  HL {fmtUsdSymbol(hlEquityUsd)} · min ${MIN_HL_BOT_USD} to run bot (paused)
                </span>
                {onDeposit ? (
                  <button type="button" className="hl-dock-fund-nudge-link" onClick={onDeposit}>
                    {t('tradePanel.depositUsdc')}
                  </button>
                ) : null}
              </p>
            ) : null}
          </div>
        ) : tab === 'orders' ? (
          filteredOrders.length > 0 ? (
            <table className="hl-table">
              <thead>
                <tr>
                  <th>{t('dock.cols.time')}</th>
                  <th>{t('dock.cols.type')}</th>
                  <th>{t('dock.cols.coin')}</th>
                  <th>{t('dock.cols.direction')}</th>
                  <th>{t('dock.cols.size')}</th>
                  <th>{t('dock.cols.price')}</th>
                  <th>{t('dock.cols.reduce')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((o) => (
                  <tr key={o.oid}>
                    <td>{fmtTimeMs(o.timestamp)}</td>
                    <td>{o.orderType || 'Limit'}</td>
                    <td>
                      <button type="button" className="hl-coin-link" onClick={() => onCoinClick?.(o.coin)}>
                        {o.coin}
                      </button>
                    </td>
                    <td className={o.side === 'B' ? 'hl-up' : 'hl-down'}>
                      {o.side === 'B' ? 'Buy' : 'Sell'}
                    </td>
                    <td>{o.sz}</td>
                    <td>{fmtPrice(o.limitPx)}</td>
                    <td>{o.reduceOnly ? 'Yes' : 'No'}</td>
                    <td>
                      <button
                        type="button"
                        className="hl-cancel-btn"
                        disabled={actionBusy}
                        onClick={() => onCancelOrder?.(o.coin, o.oid)}
                        aria-label={t('dock.cancel')}
                      >
                        <X size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="hl-dock-empty">{t('dock.noOpenOrders')}</p>
          )
        ) : tab === 'tradeHistory' ? (
          fillsLoading && closeFills.length === 0 ? (
            <p className="hl-dock-empty">
              <Loader2 size={14} className="animate-spin inline" /> {t('dock.syncing')}
            </p>
          ) : closeFills.length > 0 ? (
            filteredCloseFills.length > 0 ? (
            <table className="hl-table">
              <thead>
                <tr>
                  <th>{t('dock.cols.time')}</th>
                  <th>{t('dock.cols.coin')}</th>
                  <th>{t('dock.cols.action')}</th>
                  <th>{t('dock.cols.side')}</th>
                  <th>{t('dock.cols.size')}</th>
                  <th>{t('dock.cols.price')}</th>
                  <th>{t('dock.cols.fee')}</th>
                  <th>{t('dock.cols.feeTenPct')}</th>
                  <th>{t('dock.cols.result')}</th>
                  <th>{t('dock.cols.closedPnl')}</th>
                  <th>{t('dock.cols.balanceAfter')}</th>
                  {isBotMode ? (
                    <th className="term-hl-open-reason-col" scope="col" title={t('dock.cols.why', { defaultValue: 'Why' })}>
                      {t('dock.cols.why', { defaultValue: 'Why' })}
                    </th>
                  ) : null}
                  <th>{t('dock.cols.share')}</th>
                  {walletAddress ? <th>{t('dock.cols.verify')}</th> : null}
                </tr>
              </thead>
              <tbody>
                {filteredCloseFills.map((f: AggregatedHlCloseFill, i) => {
                  const result = hlFillResultLabel(f.closedPnl);
                  const pnl = toNum(f.closedPnl);
                  const positionDir = fillPositionDirection(f);
                  const platformFee = platformFeeFromPnl(f.closedPnl);
                  const balanceAfter = balanceAfterByFill.get(aggregatedCloseFillKey(f));
                  const closeWhy = isBotMode
                    ? closeReasonForFill(f.coin, f.time)
                    : undefined;
                  const verifyHref = walletAddress ? hlWalletExplorerUrl(walletAddress) : null;
                  return (
                  <tr key={`${f.time}-${i}`}>
                    <td>{fmtTimeMs(f.time)}</td>
                    <td>
                      <button type="button" className="hl-coin-link" onClick={() => onCoinClick?.(f.coin)}>
                        {f.coin}
                      </button>
                    </td>
                    <td>{fmtFillAction(f.dir)}</td>
                    <td className={positionDir === 'LONG' ? 'hl-up' : 'hl-down'}>
                      {positionDir}
                    </td>
                    <td>{f.fillCount > 1 ? `${f.sz} (${f.fillCount} fills)` : f.sz}</td>
                    <td>{fmtPrice(f.px)}</td>
                    <td>{fmtUsdSymbol(f.fee, 4)}</td>
                    <td>{fmtUsdSymbol(platformFee, 4)}</td>
                    <td
                      className={
                        result === 'Win'
                          ? 'hl-up'
                          : result === 'Loss'
                            ? 'hl-down'
                            : ''
                      }
                    >
                      {result ?? '—'}
                    </td>
                    <td className={pnl > 0 ? 'hl-up' : pnl < 0 ? 'hl-down' : ''}>
                      {fmtClosedPnl(f.closedPnl)}
                    </td>
                    <td title={t('dock.cols.balanceAfterHint')}>
                      {balanceAfter != null ? fmtUsdSymbol(balanceAfter) : '—'}
                    </td>
                    {isBotMode ? (
                      <td className="term-hl-open-reason-col">
                        <TradeReasonHint reason={closeWhy} kind="close" />
                      </td>
                    ) : null}
                    <td>
                      <button
                        type="button"
                        className="hl-trade-share-btn"
                        title={t('dock.share')}
                        aria-label={t('dock.share')}
                        onClick={() => setShareFill(f)}
                      >
                        <Share2 size={13} aria-hidden />
                        <span>{t('dock.share')}</span>
                      </button>
                    </td>
                    {verifyHref ? (
                      <td>
                        <a
                          href={verifyHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="term-history-verify"
                          title={
                            f.tid != null
                              ? `View on Hyperliquid L1 (fill #${f.tid})`
                              : 'View wallet on HypurrScan'
                          }
                        >
                          HypurrScan
                          <ExternalLink size={12} aria-hidden />
                        </a>
                      </td>
                    ) : null}
                  </tr>
                  );
                })}
              </tbody>
            </table>
            ) : (
              <p className="hl-dock-empty">{t('dock.noTradesMatch', { query: search.trim() })}</p>
            )
          ) : (
            <p className="hl-dock-empty">{t('dock.noTradeHistory')}</p>
          )
        ) : tab === 'feeHistory' ? (
          platformFeeLedger.trades.length > 0 ? (
            <table className="hl-table">
              <thead>
                <tr>
                  <th>{t('dock.cols.time')}</th>
                  <th>{t('dock.cols.asset')}</th>
                  <th>{t('dock.cols.source')}</th>
                  <th>{t('dock.cols.profit')}</th>
                  <th>{t('dock.cols.feeTenPct')}</th>
                  <th>{t('dock.cols.hlPaid')}</th>
                  <th>{t('dock.cols.owed')}</th>
                  <th>{t('dock.cols.status')}</th>
                </tr>
              </thead>
              <tbody>
                {platformFeeLedger.trades.map((fee) => (
                  <tr key={fee.id}>
                    <td>{fmtTimeMs(new Date(fee.createdAt).getTime())}</td>
                    <td>{fee.coin}</td>
                    <td>{fee.feeSource}</td>
                    <td className="hl-up">{fmtUsdSymbol(fee.grossProfitUsd)}</td>
                    <td>{fmtUsdSymbol(fee.totalFeeUsd)}</td>
                    <td>{fmtUsdSymbol(fee.builderFeeUsd)}</td>
                    <td>{fmtUsdSymbol(fee.accruedFeeUsd)}</td>
                    <td>{fee.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="hl-dock-empty">{t('dock.noPlatformFees')}</p>
          )
        ) : tab === 'fundingHistory' ? (
          scopedFunding.length > 0 ? (
            <table className="hl-table">
              <thead>
                <tr>
                  <th>{t('dock.cols.time')}</th>
                  <th>{t('dock.cols.coin')}</th>
                  <th>{t('dock.cols.payment')}</th>
                  <th>{t('dock.cols.rate')}</th>
                </tr>
              </thead>
              <tbody>
                {scopedFunding.map((f, i) => (
                  <tr key={`${f.time}-${i}`}>
                    <td>{fmtTimeMs(f.time)}</td>
                    <td>{f.coin}</td>
                    <td className={toNum(f.usdc) >= 0 ? 'hl-up' : 'hl-down'}>
                      {fmtUsdSymbol(f.usdc)}
                    </td>
                    <td>{(toNum(f.fundingRate) * 100).toFixed(4)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="hl-dock-empty">{t('dock.noFundingHistory')}</p>
          )
        ) : tab === 'orderHistory' ? (
          scopedOrderHistory.length > 0 ? (
            <table className="hl-table">
              <thead>
                <tr>
                  <th>{t('dock.cols.time')}</th>
                  <th>{t('dock.cols.coin')}</th>
                  <th>{t('dock.cols.side')}</th>
                  <th>{t('dock.cols.type')}</th>
                  <th>{t('dock.cols.size')}</th>
                  <th>{t('dock.cols.price')}</th>
                  <th>{t('dock.cols.status')}</th>
                </tr>
              </thead>
              <tbody>
                {scopedOrderHistory.map((o) => (
                  <tr key={o.oid}>
                    <td>{fmtTimeMs(o.statusTimestamp || o.timestamp)}</td>
                    <td>
                      <button type="button" className="hl-coin-link" onClick={() => onCoinClick?.(o.coin)}>
                        {o.coin}
                      </button>
                    </td>
                    <td className={o.side === 'B' ? 'hl-up' : 'hl-down'}>
                      {o.side === 'B' ? 'Buy' : 'Sell'}
                    </td>
                    <td>{o.orderType}</td>
                    <td>{toNum(o.sz) > 0 ? o.sz : o.origSz || o.sz}</td>
                    <td>{fmtPrice(o.limitPx)}</td>
                    <td>{o.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="hl-dock-empty">{t('dock.noOrderHistory')}</p>
          )
        ) : tab === 'twap' ? (
          twapOrders.length > 0 ? (
            <table className="hl-table">
              <thead>
                <tr>
                  <th>{t('dock.cols.time')}</th>
                  <th>{t('dock.cols.coin')}</th>
                  <th>{t('dock.cols.side')}</th>
                  <th>{t('dock.cols.size')}</th>
                  <th>{t('dock.cols.filled')}</th>
                  <th>{t('dock.cols.duration')}</th>
                  <th>{t('dock.cols.status')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {twapOrders.map((twap) => (
                  <tr key={`${twap.twapId}-${twap.time}`}>
                    <td>{fmtTimeMs(twap.time)}</td>
                    <td>
                      <button type="button" className="hl-coin-link" onClick={() => onCoinClick?.(twap.coin)}>
                        {twap.coin}
                      </button>
                    </td>
                    <td className={twap.side === 'B' ? 'hl-up' : 'hl-down'}>
                      {twap.side === 'B' ? 'Buy' : 'Sell'}
                    </td>
                    <td>{twap.sz}</td>
                    <td>
                      {twap.executedSz} ({fmtUsdSymbol(twap.executedNtl)})
                    </td>
                    <td>{twap.minutes}m{twap.randomize ? ' · rand' : ''}</td>
                    <td>
                      {twap.status}
                      {twap.statusDetail ? ` — ${twap.statusDetail}` : ''}
                    </td>
                    <td>
                      {twap.status === 'activated' ? (
                        <button
                          type="button"
                          className="hl-dock-action"
                          disabled={actionBusy}
                          onClick={() => onCancelTwap?.(twap.coin, twap.twapId)}
                        >
                          {t('dock.cancel')}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="hl-dock-empty">{t('dock.noTwap')}</p>
          )
        ) : tab === 'trailing' ? (
          triggerOrders.length > 0 ? (
            <table className="hl-table">
              <thead>
                <tr>
                  <th>{t('dock.cols.time')}</th>
                  <th>{t('dock.cols.coin')}</th>
                  <th>{t('dock.cols.type')}</th>
                  <th>{t('dock.cols.side')}</th>
                  <th>{t('dock.cols.size')}</th>
                  <th>{t('dock.cols.trigger')}</th>
                  <th>{t('dock.cols.condition')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {triggerOrders.map((o) => (
                  <tr key={o.oid}>
                    <td>{fmtTimeMs(o.timestamp)}</td>
                    <td>
                      <button type="button" className="hl-coin-link" onClick={() => onCoinClick?.(o.coin)}>
                        {o.coin}
                      </button>
                    </td>
                    <td>{o.orderType}</td>
                    <td className={o.side === 'B' ? 'hl-up' : 'hl-down'}>
                      {o.side === 'B' ? 'Buy' : 'Sell'}
                    </td>
                    <td>{o.sz}</td>
                    <td>{fmtPrice(o.triggerPx ?? o.limitPx)}</td>
                    <td>{o.triggerCondition || (o.isPositionTpsl ? 'Position TP/SL' : '—')}</td>
                    <td>
                      <button
                        type="button"
                        className="hl-cancel-btn"
                        disabled={actionBusy}
                        onClick={() => onCancelOrder?.(o.coin, o.oid)}
                        aria-label={t('dock.cancel')}
                      >
                        <X size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="hl-dock-empty">{t('dock.noTriggers')}</p>
          )
        ) : (
          <p className="hl-dock-empty">{t('dock.noData')}</p>
        )}
      </div>
      {stopEdit && onSaveStopLoss ? (
        <PositionStopEditModal
          position={stopEdit.position}
          activeSl={stopEdit.activeSl}
          entryPx={stopEdit.entryPx}
          szi={stopEdit.szi}
          markPx={stopEdit.markPx}
          leverage={stopEdit.leverage}
          onClose={() => setStopEdit(null)}
          onSave={onSaveStopLoss}
        />
      ) : null}
      {shareFill ? (
        <TradeShareModal
          fill={shareFill}
          displayName={shareDisplayName}
          avatarUrl={profile?.avatar_url ?? null}
          userId={user?.id ?? null}
          leverage={configuredLeverage ?? null}
          onClose={() => setShareFill(null)}
        />
      ) : null}
    </section>
  );
};

export default ProTradeDock;
