import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Loader2, X } from 'lucide-react';
import { Link } from 'react-router-dom';
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
import { isHlTriggerOrder } from '../../lib/hyperliquid/user';
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
import { aggregateHlCloseFills, type AggregatedHlCloseFill } from '../../lib/hyperliquid/hlFillAggregate';
import { resolveDisplayLeverage } from '../../lib/hyperliquid/displayLeverage';
import { toNum } from '../../lib/hyperliquid/parse';
import { useHlTradeReasonMarkers } from '../../hooks/useHlTradeReasonMarkers';
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

function livePositionPnl(position: HlPosition, markPx: number): number {
  const szi = toNum(position.szi);
  const entry = toNum(position.entryPx);
  if (markPx > 0 && entry > 0 && szi !== 0) {
    return szi > 0 ? (markPx - entry) * szi : (entry - markPx) * Math.abs(szi);
  }
  return toNum(position.unrealizedPnl);
}

const TABS = [
  { id: 'balances', label: 'Balances' },
  { id: 'positions', label: 'Positions' },
  { id: 'orders', label: 'Open Orders' },
  { id: 'twap', label: 'TWAP' },
  { id: 'trailing', label: 'Trailing' },
  { id: 'tradeHistory', label: 'Trade History' },
  { id: 'feeHistory', label: 'Fee History' },
  { id: 'fundingHistory', label: 'Funding History' },
  { id: 'orderHistory', label: 'Order History' },
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
  /** Perps = manual only; bot = bot-managed coins from hl_bot_chart_markers. */
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
  const isSpot = variant === 'spot';
  const isBotMode = mode === 'bot';
  const scope: 'manual' | 'bot' = positionScope ?? (isBotMode ? 'bot' : 'manual');
  const managedCoins = botManagedCoins ?? new Set<string>();
  const positionOpenSinceRef = useRef<Map<string, number>>(new Map());
  const dockWallet = walletAddress?.toLowerCase();
  const platformFees = usePlatformFeeGate();
  const platformFeeLedger = usePlatformFees(dockWallet, Boolean(dockWallet));
  const { snapshot: hlSnap } = useHlAccountSnapshot(dockWallet);
  const unifiedAccount = hlSnap?.unifiedAccount ?? false;
  const tradableHlUsd =
    hlSnap?.tradablePerpUsd ??
    toNum(account?.margin?.accountValue) +
      (unifiedAccount ? 0 : toNum(spotBalances.find((b) => b.coin === 'USDC')?.total));
  const spotUsdcUsd =
    hlSnap?.spotUsdcUsd ?? toNum(spotBalances.find((b) => b.coin === 'USDC')?.total);
  const rawPerpUsd = hlSnap?.accountUsd ?? toNum(account?.margin?.accountValue);
  const hlWithdrawableUsd =
    hlSnap?.withdrawableUsd ?? toNum(account?.withdrawable);
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
    for (const f of fills) {
      if (isHlFillClose(f.dir, f.closedPnl)) set.add(f.coin);
    }
    return [...set];
  }, [positionCoins, fills]);
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

  const botNeedsDeposit =
    isBotMode &&
    connected &&
    !loading &&
    Math.max(botHlBalanceUsd, tradableHlUsd) < MIN_HL_BOT_USD;
  const botUnderfunded = botNeedsDeposit;

  const closeFills = useMemo(
    () => aggregateHlCloseFills(fills),
    [fills]
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
          <nav className="hl-dock-tabs" aria-label="Account panels">
            {visibleTabs.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                className={`hl-dock-tab ${tab === id ? 'hl-dock-tab--on' : ''}`}
                onClick={() => setTab(id)}
              >
                {label}
                {tabSuffix(id)}
              </button>
            ))}
          </nav>
        ) : (
          <p className="hl-dock-history-only-label">Closed fills &amp; P/L</p>
        )}
        <div className="hl-dock-tools">
          {isBotMode && tab === 'tradeHistory' && !historyOnly ? (
            <Link
              to={getAppQueryLink('section=profile&tab=botTrades')}
              className="hl-dock-full-history-link"
            >
              See complete history →
            </Link>
          ) : null}
          <input
            className="hl-dock-search"
            placeholder="Coins…"
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
              Cancel All
            </button>
          ) : null}
        </div>
      </div>

      <div className="hl-dock-body">
        {!connected ? (
          <p className="hl-dock-empty">Connect wallet to view account data.</p>
        ) : loading && !account ? (
          <p className="hl-dock-empty">
            <Loader2 size={14} className="animate-spin inline" /> Syncing…
          </p>
        ) : tab === 'balances' ? (
          isSpot ? (
            spotBalances.length > 0 ? (
              <table className="hl-table">
                <thead>
                  <tr>
                    <th>Token</th>
                    <th>Total</th>
                    <th>On hold</th>
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
              <p className="hl-dock-empty">No spot balances.</p>
            )
          ) : (
            <table className="hl-table">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Total</th>
                  <th>Available</th>
                </tr>
              </thead>
              <tbody>
                {unifiedAccount ? (
                  <tr>
                    <td>USDC (unified)</td>
                    <td>{fmtUsdSymbol(tradableHlUsd)}</td>
                    <td>{fmtUsdSymbol(hlWithdrawableUsd)}</td>
                  </tr>
                ) : (
                  <>
                    <tr>
                      <td>USDC (Perp)</td>
                      <td>{fmtUsdSymbol(rawPerpUsd)}</td>
                      <td>{fmtUsdSymbol(hlWithdrawableUsd)}</td>
                    </tr>
                    <tr>
                      <td>USDC (Spot)</td>
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
                  <td>Margin used</td>
                  <td colSpan={2}>{fmtUsdSymbol(account?.margin?.totalMarginUsed)}</td>
                </tr>
                <tr>
                  <td>Notional</td>
                  <td colSpan={2}>{fmtUsdSymbol(account?.margin?.totalNtlPos)}</td>
                </tr>
              </tbody>
            </table>
          )
        ) : tab === 'positions' ? (
          <div className="hl-dock-positions-pane">
            {filteredPositions.length > 0 ? (
            <table className="hl-table">
              <thead>
                <tr>
                  <th>Coin</th>
                  <th>Side</th>
                  <th>Size</th>
                  <th>Value</th>
                  <th>Entry</th>
                  <th>Mark</th>
                  <th>PnL</th>
                  <th>Lev</th>
                  {isBotMode ? <th>Stop</th> : null}
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
                      <td>{fmtUsdSymbol(p.positionValue)}</td>
                      <td>{fmtPrice(p.entryPx)}</td>
                      <td>{mark > 0 ? fmtPrice(mark) : '—'}</td>
                      <td className={upnl >= 0 ? 'hl-up' : 'hl-down'}>
                        {fmtTradeUsdSymbol(upnl)}
                      </td>
                      <td>{fmtLeverage(lev)}</td>
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
          ) : isBotMode && botRunning && !botNeedsDeposit ? (
            <div className="hl-dock-empty hl-dock-empty--bot-scan" role="status">
              <div className="hl-dock-bot-scan-row">
                <Loader2 size={14} className="hl-dock-bot-scan-loader animate-spin" aria-hidden />
                <span className="hl-dock-bot-scan-title">Bot is reading market…</span>
              </div>
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
                <p className="hl-dock-bot-scan-sub">Loading analyzer…</p>
              )}
            </div>
          ) : (
            <p className="hl-dock-empty">
              {scope === 'manual' && managedCoins.size > 0
                ? 'No manual perp positions — open trades here or check Bot for automated positions.'
                : 'No open positions.'}
            </p>
          )}
            {botUnderfunded ? (
              <p className="hl-dock-fund-nudge hl-dock-fund-nudge--desktop" role="status">
                <span>
                  HL {fmtUsdSymbol(botHlBalanceUsd)} · min ${MIN_HL_BOT_USD} to run bot (paused)
                </span>
                {onDeposit ? (
                  <button type="button" className="hl-dock-fund-nudge-link" onClick={onDeposit}>
                    Deposit
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
                  <th>Time</th>
                  <th>Type</th>
                  <th>Coin</th>
                  <th>Direction</th>
                  <th>Size</th>
                  <th>Price</th>
                  <th>Reduce</th>
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
                        aria-label="Cancel"
                      >
                        <X size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="hl-dock-empty">No open orders.</p>
          )
        ) : tab === 'tradeHistory' ? (
          fillsLoading && closeFills.length === 0 ? (
            <p className="hl-dock-empty">
              <Loader2 size={14} className="animate-spin inline" /> Loading trade history…
            </p>
          ) : closeFills.length > 0 ? (
            filteredCloseFills.length > 0 ? (
            <table className="hl-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Coin</th>
                  <th>Action</th>
                  <th>Side</th>
                  <th>Size</th>
                  <th>Price</th>
                  <th>Fee</th>
                  <th>Platform</th>
                  <th>Result</th>
                  <th>Closed PnL</th>
                  {isBotMode ? <th className="term-hl-open-reason-col">Why</th> : null}
                  {walletAddress ? <th>Verify</th> : null}
                </tr>
              </thead>
              <tbody>
                {filteredCloseFills.map((f: AggregatedHlCloseFill, i) => {
                  const result = hlFillResultLabel(f.closedPnl);
                  const pnl = toNum(f.closedPnl);
                  const positionDir = fillPositionDirection(f);
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
                    <td>{fmtUsdSymbol(platformFeeFromPnl(f.closedPnl), 4)}</td>
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
                    {isBotMode ? (
                      <td className="term-hl-open-reason-col">
                        <TradeReasonHint reason={closeWhy} kind="close" />
                      </td>
                    ) : null}
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
              <p className="hl-dock-empty">No trades match &ldquo;{search.trim()}&rdquo;.</p>
            )
          ) : (
            <p className="hl-dock-empty">No trade history yet.</p>
          )
        ) : tab === 'feeHistory' ? (
          platformFeeLedger.trades.length > 0 ? (
            <table className="hl-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Asset</th>
                  <th>Source</th>
                  <th>Profit</th>
                  <th>Fee (10%)</th>
                  <th>HL paid</th>
                  <th>Owed</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {platformFeeLedger.trades.map((t) => (
                  <tr key={t.id}>
                    <td>{fmtTimeMs(new Date(t.createdAt).getTime())}</td>
                    <td>{t.coin}</td>
                    <td>{t.feeSource}</td>
                    <td className="hl-up">{fmtUsdSymbol(t.grossProfitUsd)}</td>
                    <td>{fmtUsdSymbol(t.totalFeeUsd)}</td>
                    <td>{fmtUsdSymbol(t.builderFeeUsd)}</td>
                    <td>{fmtUsdSymbol(t.accruedFeeUsd)}</td>
                    <td>{t.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="hl-dock-empty">No platform fees recorded yet.</p>
          )
        ) : tab === 'fundingHistory' ? (
          funding.length > 0 ? (
            <table className="hl-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Coin</th>
                  <th>Payment</th>
                  <th>Rate</th>
                </tr>
              </thead>
              <tbody>
                {funding.map((f, i) => (
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
            <p className="hl-dock-empty">No funding history.</p>
          )
        ) : tab === 'orderHistory' ? (
          orderHistory.length > 0 ? (
            <table className="hl-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Coin</th>
                  <th>Side</th>
                  <th>Type</th>
                  <th>Size</th>
                  <th>Price</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {orderHistory.map((o) => (
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
                    <td>{o.sz}</td>
                    <td>{fmtPrice(o.limitPx)}</td>
                    <td>{o.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="hl-dock-empty">No order history.</p>
          )
        ) : tab === 'twap' ? (
          twapOrders.length > 0 ? (
            <table className="hl-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Coin</th>
                  <th>Side</th>
                  <th>Size</th>
                  <th>Filled</th>
                  <th>Duration</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {twapOrders.map((t) => (
                  <tr key={`${t.twapId}-${t.time}`}>
                    <td>{fmtTimeMs(t.time)}</td>
                    <td>
                      <button type="button" className="hl-coin-link" onClick={() => onCoinClick?.(t.coin)}>
                        {t.coin}
                      </button>
                    </td>
                    <td className={t.side === 'B' ? 'hl-up' : 'hl-down'}>
                      {t.side === 'B' ? 'Buy' : 'Sell'}
                    </td>
                    <td>{t.sz}</td>
                    <td>
                      {t.executedSz} ({fmtUsdSymbol(t.executedNtl)})
                    </td>
                    <td>{t.minutes}m{t.randomize ? ' · rand' : ''}</td>
                    <td>
                      {t.status}
                      {t.statusDetail ? ` — ${t.statusDetail}` : ''}
                    </td>
                    <td>
                      {t.status === 'activated' ? (
                        <button
                          type="button"
                          className="hl-dock-action"
                          disabled={actionBusy}
                          onClick={() => onCancelTwap?.(t.coin, t.twapId)}
                        >
                          Cancel
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="hl-dock-empty">No TWAP orders.</p>
          )
        ) : tab === 'trailing' ? (
          triggerOrders.length > 0 ? (
            <table className="hl-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Coin</th>
                  <th>Type</th>
                  <th>Side</th>
                  <th>Size</th>
                  <th>Trigger</th>
                  <th>Condition</th>
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
                        aria-label="Cancel"
                      >
                        <X size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="hl-dock-empty">No trigger or stop orders.</p>
          )
        ) : (
          <p className="hl-dock-empty">No data.</p>
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
    </section>
  );
};

export default ProTradeDock;
