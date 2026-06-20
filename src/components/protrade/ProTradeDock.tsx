import React, { useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';
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
  hlFillResultLabel,
  isHlFillOpen,
} from '../../lib/hyperliquid/format';
import { resolveDisplayLeverage } from '../../lib/hyperliquid/displayLeverage';
import { toNum } from '../../lib/hyperliquid/parse';
import { useHlOpenTradeReasons } from '../../hooks/useHlOpenTradeReasons';
import TradeOpenReasonHint from '../terminal/TradeOpenReasonHint';
import DockCountBadge from './DockCountBadge';

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
  /** Bot wallet — for open-trade reason tooltips. */
  walletAddress?: string | null;
  reasonRefreshKey?: number;
  /** Bot terminal: positions + balances + trade history only */
  mode?: 'full' | 'bot';
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
  walletAddress,
  reasonRefreshKey = 0,
  mode = 'full',
}) => {
  const isSpot = variant === 'spot';
  const isBotMode = mode === 'bot';
  const visibleTabs = isBotMode
    ? TABS.filter((t) => ['positions', 'balances', 'tradeHistory'].includes(t.id))
    : isSpot
      ? TABS.filter((t) => !['positions', 'fundingHistory'].includes(t.id))
      : TABS;
  const activeTwapCount = twapOrders.filter((t) => t.status === 'activated').length;
  const triggerOrders = openOrders.filter(isHlTriggerOrder);
  const [internalTab, setInternalTab] = useState<TabId>(isBotMode ? 'positions' : 'positions');
  const [search, setSearch] = useState('');
  const tab = activeTab ?? internalTab;
  const setTab = (next: TabId) => {
    onTabChange?.(next);
    if (activeTab == null) setInternalTab(next);
  };

  const positionCount = account?.positions.length ?? 0;
  const positionCoins = useMemo(
    () => (account?.positions ?? []).map((p) => p.coin),
    [account?.positions]
  );
  const { byCoin: openReasons } = useHlOpenTradeReasons(
    isBotMode ? (walletAddress ?? undefined) : undefined,
    positionCoins,
    reasonRefreshKey
  );
  const positionUpnl = useMemo(
    () =>
      (account?.positions ?? []).reduce(
        (s, p) => s + livePositionPnl(p, markPrices[p.coin] ?? 0),
        0
      ),
    [account?.positions, markPrices]
  );
  const positionTone: 'pos' | 'neg' | null =
    positionCount > 0 ? (positionUpnl >= 0 ? 'pos' : 'neg') : null;

  /** Closed fills only — open legs have no PnL and looked like blank "—,—" rows. */
  const closeFills = useMemo(
    () => fills.filter((f) => !isHlFillOpen(f.dir)),
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
    return null;
  };

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return openOrders;
    return openOrders.filter((o) => o.coin.toLowerCase().includes(q));
  }, [openOrders, search]);

  const filteredPositions = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = account?.positions ?? [];
    if (!q) return list;
    return list.filter((p) => p.coin.toLowerCase().includes(q));
  }, [account?.positions, search]);

  return (
    <section className="hl-dock">
      <div className="hl-dock-head">
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
        <div className="hl-dock-tools">
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
                <tr>
                  <td>USDC (Perp)</td>
                  <td>{fmtUsdSymbol(account?.margin?.accountValue)}</td>
                  <td>{fmtUsdSymbol(account?.withdrawable)}</td>
                </tr>
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
          filteredPositions.length > 0 ? (
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
                  <th />
                </tr>
              </thead>
              <tbody>
                {filteredPositions.map((p) => {
                  const isLong = toNum(p.szi) >= 0;
                  const mark = markPrices[p.coin] ?? 0;
                  const upnl = livePositionPnl(p, mark);
                  return (
                    <tr key={p.coin}>
                      <td>
                        <span className="hl-dock-market-cell">
                          <button type="button" className="hl-coin-link" onClick={() => onCoinClick?.(p.coin)}>
                            {p.coin}
                          </button>
                          {isBotMode ? (
                            <TradeOpenReasonHint reason={openReasons.get(p.coin.toUpperCase())?.reason} />
                          ) : null}
                        </span>
                      </td>
                      <td className={isLong ? 'hl-up' : 'hl-down'}>{isLong ? 'LONG' : 'SHORT'}</td>
                      <td>{fmtSize(Math.abs(toNum(p.szi)))}</td>
                      <td>{fmtUsdSymbol(p.positionValue)}</td>
                      <td>{fmtPrice(p.entryPx)}</td>
                      <td>{mark > 0 ? fmtPrice(mark) : '—'}</td>
                      <td className={upnl >= 0 ? 'hl-up' : 'hl-down'}>
                        {fmtTradeUsdSymbol(upnl)}
                      </td>
                      <td>{fmtLeverage(resolveDisplayLeverage(configuredLeverage, p.leverage?.value))}</td>
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
          ) : (
            <p className="hl-dock-empty">No open positions.</p>
          )
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
          closeFills.length > 0 ? (
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
                  <th>Result</th>
                  <th>Closed PnL</th>
                </tr>
              </thead>
              <tbody>
                {closeFills.map((f, i) => {
                  const result = hlFillResultLabel(f.closedPnl);
                  const pnl = toNum(f.closedPnl);
                  return (
                  <tr key={`${f.time}-${i}`}>
                    <td>{fmtTimeMs(f.time)}</td>
                    <td>
                      <button type="button" className="hl-coin-link" onClick={() => onCoinClick?.(f.coin)}>
                        {f.coin}
                      </button>
                    </td>
                    <td>{fmtFillAction(f.dir)}</td>
                    <td className={f.side === 'B' ? 'hl-up' : 'hl-down'}>
                      {f.side === 'B' ? 'Buy' : 'Sell'}
                    </td>
                    <td>{f.sz}</td>
                    <td>{fmtPrice(f.px)}</td>
                    <td>{fmtUsdSymbol(f.fee, 4)}</td>
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
                  </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="hl-dock-empty">No trade history yet.</p>
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
    </section>
  );
};

export default ProTradeDock;
