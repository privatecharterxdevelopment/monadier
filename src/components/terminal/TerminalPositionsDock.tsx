import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, X, ExternalLink } from 'lucide-react';
import { useAccount } from 'wagmi';
import { useAuth, DEMO_WALLET_ADDRESS } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { fetchUserWalletAddresses } from '../../lib/userWallets';
import {
  calcPositionPnl,
  fetchLiveTokenPrices,
} from '../../lib/positionLivePnl';
import {
  markPositionCloseFailed,
  markPositionClosing,
} from '../../lib/positionClose';
import TerminalModalFrame from './TerminalModalFrame';
import { explorerTxUrl } from '../../lib/tradeExplorer';
import {
  type ClosedTradeRow,
  fetchClosedTradesForWallets,
  verifyUrlForTrade,
} from '../../lib/closedTrades';
import DockCountBadge from '../protrade/DockCountBadge';
import { useTerminalVaultData } from '../../hooks/useTerminalVaultData';

export type DockTab = 'vault' | 'open' | 'history' | 'all';

type Position = {
  id: string;
  wallet_address: string;
  chain_id: number;
  token_symbol: string;
  token_address: string;
  direction: string;
  entry_price: number;
  entry_amount: number;
  profit_loss: number | null;
  status: string;
  leverage_multiplier: number | null;
  highest_price: number | null;
  created_at: string;
  closed_at: string | null;
  close_reason: string | null;
  exit_tx_hash: string | null;
  entry_tx_hash: string | null;
};

type Props = {
  refreshKey?: number;
  botRunning?: boolean;
  /** Sidebar "History" scroll target */
  id?: string;
  /** Controlled tab (e.g. sidebar History → "all") */
  activeTab?: DockTab;
  onTabChange?: (tab: DockTab) => void;
  /** Brief highlight when opened from sidebar */
  highlight?: boolean;
  layout?: 'dock' | 'page';
  /** Scroll to and highlight a row (notifications → history) */
  highlightPositionId?: string | null;
  /** Load closed rows from trade_history (not only positions table) */
  includeClosedHistoryFeed?: boolean;
  /** Pro Trade: match Hyperliquid dock chrome */
  skin?: 'terminal' | 'hl';
};

function fmtUsd(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtDateParts(iso: string | null) {
  if (!iso) return { date: '—', time: '—' };
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }),
    time: d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
  };
}

const EXPLORERS: Record<number, string> = {
  42161: 'https://arbiscan.io',
  8453: 'https://basescan.org',
  1: 'https://etherscan.io',
};

function explorerUrl(chainId: number, address: string) {
  const base = EXPLORERS[chainId] || EXPLORERS[42161];
  return `${base}/address/${address}`;
}

const TerminalPositionsDock: React.FC<Props> = ({
  refreshKey = 0,
  botRunning = false,
  id = 'term-history-dock',
  activeTab: controlledTab,
  onTabChange,
  highlight = false,
  layout = 'dock',
  highlightPositionId = null,
  includeClosedHistoryFeed = false,
  skin = 'terminal',
}) => {
  const { address } = useAccount();
  const { isDemoUser, user } = useAuth();
  const isHlSkin = skin === 'hl';
  const vaultData = useTerminalVaultData(refreshKey);
  const [internalTab, setInternalTab] = useState<DockTab>(
    layout === 'page' ? 'history' : isHlSkin ? 'open' : 'open'
  );
  const tab = controlledTab ?? internalTab;
  const setTab = onTabChange ?? setInternalTab;
  const [allRows, setAllRows] = useState<Position[]>([]);
  const [closedHistory, setClosedHistory] = useState<ClosedTradeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [wallets, setWallets] = useState<string[]>([]);
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});
  const [closingId, setClosingId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{
    id: string;
    token: string;
  } | null>(null);
  const scrolledHighlightRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await fetchUserWalletAddresses(address, isDemoUser);
      if (!cancelled) setWallets(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [address, isDemoUser, user?.id]);

  const load = useCallback(
    async (silent = false) => {
      if (!isDemoUser && !user) {
        setAllRows([]);
        setClosedHistory([]);
        setLoading(false);
        return;
      }

      const queryWallets =
        wallets.length > 0 ? wallets : isDemoUser ? [DEMO_WALLET_ADDRESS] : [];
      if (queryWallets.length === 0) {
        setAllRows([]);
        setLoading(false);
        return;
      }

      if (!silent) setLoading(true);
      try {
        const { data, error } = await supabase
          .from('positions')
          .select(
            'id, wallet_address, chain_id, token_symbol, token_address, direction, entry_price, entry_amount, profit_loss, status, leverage_multiplier, highest_price, created_at, closed_at, close_reason, exit_tx_hash, entry_tx_hash'
          )
          .in('wallet_address', queryWallets)
          .order('created_at', { ascending: false })
          .limit(500);

        if (error) throw error;
        setAllRows((data as Position[]) || []);

        if (layout === 'page' || includeClosedHistoryFeed) {
          const closed = await fetchClosedTradesForWallets(queryWallets, 200);
          setClosedHistory(closed);
        }
      } catch (e) {
        console.error('[TerminalPositionsDock]', e);
        if (!silent) {
          setAllRows([]);
          setClosedHistory([]);
        }
      } finally {
        setLoading(false);
      }
    },
    [wallets, isDemoUser, user, layout, includeClosedHistoryFeed]
  );

  useEffect(() => {
    load(false);
  }, [load, refreshKey]);

  useEffect(() => {
    const id = setInterval(() => load(true), 10000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    const tick = async () => setLivePrices(await fetchLiveTokenPrices());
    tick();
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, []);

  const openRows = useMemo(
    () => allRows.filter((p) => p.status === 'open' || p.status === 'closing'),
    [allRows]
  );
  const openCount = openRows.length;
  const closedCount = allRows.filter(
    (p) => p.status === 'closed' || p.status === 'failed'
  ).length;
  const openNetPnl = useMemo(
    () => openRows.reduce((sum, p) => sum + calcPositionPnl(p, livePrices), 0),
    [openRows, livePrices]
  );
  const openTone: 'pos' | 'neg' | null =
    openCount > 0 ? (openNetPnl >= 0 ? 'pos' : 'neg') : null;

  const rows = useMemo(() => {
    if (tab === 'open') {
      return allRows.filter((p) => p.status === 'open' || p.status === 'closing');
    }
    if (tab === 'history') {
      return allRows.filter((p) => p.status === 'closed' || p.status === 'failed');
    }
    return allRows;
  }, [allRows, tab]);

  const handleRequestClose = async () => {
    if (!confirm) return;
    const positionId = confirm.id;
    setConfirm(null);
    setClosingId(positionId);
    try {
      await markPositionClosing(positionId);
      await load(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      await markPositionCloseFailed(positionId, msg);
      await load(true);
    } finally {
      setClosingId(null);
    }
  };

  const handleRetry = async (positionId: string) => {
    setClosingId(positionId);
    try {
      await markPositionClosing(positionId, 'retry_close');
      await load(true);
    } catch (e) {
      console.error('[TerminalPositionsDock] retry', e);
    } finally {
      setClosingId(null);
    }
  };

  const hasWallet = wallets.length > 0 || isDemoUser;
  const needsSignIn = !user && !isDemoUser;

  const isPage = layout === 'page';
  const showClosedHistoryFeed =
    (isPage || includeClosedHistoryFeed) &&
    tab === 'history' &&
    closedHistory.length > 0;
  const useHistoryOverview =
    (isPage || includeClosedHistoryFeed) && (tab === 'history' || tab === 'all');

  const dockTabs: { id: DockTab; label: string }[] = isHlSkin
    ? [
        { id: 'vault', label: 'Vault balance' },
        { id: 'open', label: 'Open positions' },
        { id: 'history', label: 'Trade history' },
        { id: 'all', label: 'All trades' },
      ]
    : [
        { id: 'open', label: 'Positions' },
        { id: 'history', label: 'History' },
        { id: 'all', label: 'All trades' },
      ];

  useEffect(() => {
    if (!highlightPositionId || scrolledHighlightRef.current === highlightPositionId) {
      return;
    }
    scrolledHighlightRef.current = highlightPositionId;
    const t = window.setTimeout(() => {
      document
        .getElementById(`term-row-${highlightPositionId}`)
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 120);
    return () => window.clearTimeout(t);
  }, [highlightPositionId, rows, closedHistory, loading]);

  const tabButtons = dockTabs.map(({ id: tid, label }) => (
    <button
      key={tid}
      type="button"
      className={
        isHlSkin
          ? `hl-dock-tab ${tab === tid ? 'hl-dock-tab--on' : ''}`
          : `term-dock-tab ${tab === tid ? 'term-dock-tab--active' : ''}`
      }
      onClick={() => setTab(tid)}
    >
      {label}
      {tid === 'open' ? (
        <DockCountBadge
          count={openCount}
          tone={openTone}
          classPrefix={isHlSkin ? 'hl-dock-count' : 'term-dock-count'}
        />
      ) : tid === 'history' && closedCount > 0 ? (
        <span
          className={
            isHlSkin ? 'hl-dock-count hl-dock-count--muted' : 'term-dock-count term-dock-count--muted'
          }
        >
          ({closedCount})
        </span>
      ) : null}
    </button>
  ));

  const refreshBtn = (
    <button
      type="button"
      className={isHlSkin ? 'hl-dock-refresh' : 'term-dock-refresh'}
      onClick={() => load(false)}
      aria-label="Refresh history"
    >
      <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
    </button>
  );

  const bodyClass = isHlSkin ? 'hl-dock-body' : 'term-dock-body';
  const emptyClass = isHlSkin ? 'hl-dock-empty' : 'term-empty';
  const tableClass = isHlSkin ? 'hl-table' : `term-table ${useHistoryOverview ? 'term-table--history-overview' : ''}`;

  const vaultPanel =
    tab === 'vault' ? (
      !hasWallet ? (
        <p className={emptyClass}>
          {user ? 'Link a wallet in Profile to view vault balance' : 'Connect wallet to view vault balance'}
        </p>
      ) : vaultData.isLoading ? (
        <p className={emptyClass}>Loading vault…</p>
      ) : (
        <table className={tableClass}>
          <thead>
            <tr>
              <th>Asset</th>
              <th>Balance</th>
              <th>Withdrawable</th>
              <th>Max trade</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>USDC (Arbitrum vault)</td>
              <td>{fmtUsd(vaultData.balanceUsd)}</td>
              <td>{fmtUsd(vaultData.vaultUsd)}</td>
              <td>{fmtUsd(vaultData.maxTradeUsd)}</td>
            </tr>
          </tbody>
        </table>
      )
    ) : null;

  const dockInner = (
    <>
      {isHlSkin ? (
        <div className="hl-dock-head">
          <nav className="hl-dock-tabs" aria-label="Bot account panels">
            {tabButtons}
          </nav>
          {refreshBtn}
        </div>
      ) : (
        <div className="term-dock-head">
          {isPage && (
            <h2 className="term-dock-page-title">Trade history &amp; alerts</h2>
          )}
          <div className="term-dock-tabs">{tabButtons}</div>
          {refreshBtn}
        </div>
      )}

      <div className={bodyClass}>
        {tab === 'vault' ? (
          vaultPanel
        ) : needsSignIn ? (
          <div className={emptyClass}>
            Sign in to view trade history for your profile wallets.
          </div>
        ) : loading && rows.length === 0 && closedHistory.length === 0 ? (
          <div className={emptyClass}>Loading trade history…</div>
        ) : showClosedHistoryFeed ? (
          <table className={isHlSkin ? 'hl-table' : 'term-table term-table--history-overview'}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Time</th>
                <th>Position</th>
                <th>Size</th>
                <th>Leverage</th>
                <th>P/L</th>
                <th>Verify</th>
              </tr>
            </thead>
            <tbody>
              {closedHistory.map((t) => {
                const { date, time } = fmtDateParts(t.closedAt);
                const verify = verifyUrlForTrade(t);
                const rowId = t.positionId || t.id;
                const rowHighlight =
                  highlightPositionId === rowId || highlightPositionId === t.id;
                return (
                  <tr
                    key={t.id}
                    id={`term-row-${rowId}`}
                    className={rowHighlight ? 'term-row--highlight' : ''}
                  >
                    <td className="term-history-date">{date}</td>
                    <td className="term-history-time">{time}</td>
                    <td>
                      <span
                        className={
                          t.direction === 'LONG' ? 'term-dir-long' : 'term-dir-short'
                        }
                      >
                        {t.direction}
                      </span>{' '}
                      {t.tokenSymbol}
                    </td>
                    <td>{fmtUsd(t.entryAmount)}</td>
                    <td>{t.leverage}x</td>
                    <td
                      className={
                        t.profitLoss >= 0 ? 'term-pnl-pos' : 'term-pnl-neg'
                      }
                    >
                      {t.profitLoss >= 0 ? '+' : ''}
                      {fmtUsd(t.profitLoss)}
                    </td>
                    <td>
                      {verify ? (
                        <a
                          href={verify}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="term-history-verify"
                        >
                          Arbiscan
                          <ExternalLink size={12} />
                        </a>
                      ) : (
                        <span className="term-history-verify-muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : rows.length === 0 ? (
          <div className={emptyClass}>
            {hasWallet
              ? `No ${tab === 'open' ? 'open positions' : tab === 'history' ? 'closed trades' : 'trades'} yet for your linked wallets`
              : 'Link a wallet in Profile → Wallets to see your trade history'}
          </div>
        ) : (
          <table className={tableClass}>
            <thead>
              <tr>
                {useHistoryOverview ? (
                  <>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Position</th>
                    <th>Size</th>
                    <th>Leverage</th>
                    <th>P/L</th>
                    <th>Verify</th>
                  </>
                ) : (
                  <>
                    <th>Position</th>
                    <th>Size</th>
                    <th>P/L</th>
                    <th>Status</th>
                    <th>Time</th>
                    <th />
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const isClosed = p.status === 'closed' || p.status === 'failed';
                const pl = isClosed
                  ? Number(p.profit_loss) || 0
                  : calcPositionPnl(p, livePrices);
                const time = p.closed_at || p.created_at;
                const { date, time: timeOnly } = fmtDateParts(time);
                const isOpen = p.status === 'open';
                const isClosing = p.status === 'closing';
                const isFailed = p.status === 'failed';
                const txHash = p.exit_tx_hash || p.entry_tx_hash;
                const verifyHref = txHash
                  ? explorerTxUrl(p.chain_id, txHash)
                  : null;
                const rowHighlight = highlightPositionId === p.id;
                const showOverviewRow = useHistoryOverview && isClosed;

                if (useHistoryOverview && !isClosed) {
                  const opened = fmtDateParts(p.created_at);
                  return (
                    <tr
                      key={p.id}
                      id={`term-row-${p.id}`}
                      className={rowHighlight ? 'term-row--highlight' : ''}
                    >
                      <td className="term-history-date">{opened.date}</td>
                      <td className="term-history-time">{opened.time}</td>
                      <td>
                        <span
                          className={
                            p.direction === 'LONG' ? 'term-dir-long' : 'term-dir-short'
                          }
                        >
                          {p.direction}
                        </span>{' '}
                        {p.token_symbol}
                      </td>
                      <td>{fmtUsd(p.entry_amount || 0)}</td>
                      <td>{p.leverage_multiplier ?? 1}x</td>
                      <td className={pl >= 0 ? 'term-pnl-pos' : 'term-pnl-neg'}>
                        {pl >= 0 ? '+' : ''}
                        {fmtUsd(pl)}
                      </td>
                      <td className="capitalize term-dock-status">{p.status}</td>
                    </tr>
                  );
                }

                if (showOverviewRow) {
                  return (
                    <tr
                      key={p.id}
                      id={`term-row-${p.id}`}
                      className={rowHighlight ? 'term-row--highlight' : ''}
                    >
                      <td className="term-history-date">{date}</td>
                      <td className="term-history-time">{timeOnly}</td>
                      <td>
                        <span
                          className={
                            p.direction === 'LONG' ? 'term-dir-long' : 'term-dir-short'
                          }
                        >
                          {p.direction}
                        </span>{' '}
                        {p.token_symbol}
                      </td>
                      <td>{fmtUsd(p.entry_amount || 0)}</td>
                      <td>{p.leverage_multiplier ?? 1}x</td>
                      <td className={pl >= 0 ? 'term-pnl-pos' : 'term-pnl-neg'}>
                        {pl >= 0 ? '+' : ''}
                        {fmtUsd(pl)}
                      </td>
                      <td>
                        {verifyHref ? (
                          <a
                            href={verifyHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="term-history-verify"
                          >
                            Arbiscan
                            <ExternalLink size={12} />
                          </a>
                        ) : (
                          <span className="term-history-verify-muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr
                    key={p.id}
                    id={`term-row-${p.id}`}
                    className={rowHighlight ? 'term-row--highlight' : ''}
                  >
                    <td>
                      <span
                        className={
                          p.direction === 'LONG' ? 'term-dir-long' : 'term-dir-short'
                        }
                      >
                        {p.direction}
                      </span>{' '}
                      {p.token_symbol}
                      <span className="term-dock-meta ml-1">
                        {p.leverage_multiplier ?? 1}x
                      </span>
                    </td>
                    <td>{fmtUsd(p.entry_amount || 0)}</td>
                    <td className={pl >= 0 ? 'term-pnl-pos' : 'term-pnl-neg'}>
                      {pl >= 0 ? '+' : ''}
                      {fmtUsd(pl)}
                    </td>
                    <td className="capitalize term-dock-status">{p.status}</td>
                    <td className="term-dock-time whitespace-nowrap">
                      {fmtDate(time)}
                    </td>
                    <td className="term-dock-actions">
                      {isOpen && (
                        <button
                          type="button"
                          className="term-dock-close-btn"
                          disabled={closingId === p.id}
                          onClick={() =>
                            setConfirm({ id: p.id, token: p.token_symbol })
                          }
                        >
                          {closingId === p.id ? '…' : 'Close'}
                        </button>
                      )}
                      {isClosing && (
                        <span className="term-dock-closing text-xs">Closing…</span>
                      )}
                      {isFailed && (
                        <button
                          type="button"
                          className="term-dock-close-btn term-dock-close-btn--retry"
                          disabled={closingId === p.id}
                          onClick={() => handleRetry(p.id)}
                        >
                          Retry
                        </button>
                      )}
                      {verifyHref ? (
                        <a
                          href={verifyHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="term-dock-link"
                          title="Verify on chain"
                        >
                          <ExternalLink size={12} />
                        </a>
                      ) : (
                        <a
                          href={explorerUrl(p.chain_id, p.wallet_address)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="term-dock-link"
                          title="Wallet on explorer"
                        >
                          <ExternalLink size={12} />
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );

  if (isHlSkin && !isPage) {
    return (
      <section className="hl-dock hl-bot-dock-inner" id={id}>
        {dockInner}
        {confirm && (
          <TerminalModalFrame
            title="Close position?"
            subtitle={`${confirm.token} — bot closes in ~10s`}
            icon={<X size={18} />}
            onClose={() => setConfirm(null)}
            footer={
              <>
                <button
                  type="button"
                  className="term-modal-secondary"
                  onClick={() => setConfirm(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="term-modal-primary"
                  onClick={handleRequestClose}
                >
                  Close position
                </button>
              </>
            }
          >
            <p className="term-modal-hint">
              The bot will close your position on the next cycle. USDC returns to your
              vault balance after settlement.
            </p>
          </TerminalModalFrame>
        )}
      </section>
    );
  }

  return (
    <div
      className={`term-dock ${isPage ? 'term-dock--page' : ''} ${highlight ? 'term-dock--highlight' : ''} ${isHlSkin ? 'term-dock--hl-skin' : ''}`}
      id={id}
    >
      {dockInner}

      {confirm && (
        <TerminalModalFrame
          title="Close position?"
          subtitle={`${confirm.token} — bot closes in ~10s`}
          icon={<X size={18} />}
          onClose={() => setConfirm(null)}
          footer={
            <>
              <button
                type="button"
                className="term-modal-secondary"
                onClick={() => setConfirm(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="term-modal-primary"
                onClick={handleRequestClose}
              >
                Close position
              </button>
            </>
          }
        >
          <p className="term-modal-hint">
            The bot will close your position on the next cycle. USDC returns to your
            vault balance after settlement.
          </p>
        </TerminalModalFrame>
      )}
    </div>
  );
};

export default TerminalPositionsDock;
