import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, X, ExternalLink } from 'lucide-react';
import { useAccount } from 'wagmi';
import { useAuth, DEMO_WALLET_ADDRESS } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { fetchUserWalletAddresses } from '../../lib/userWallets';
import {
  calcPositionPnl,
  computePositionStats,
  fetchLiveTokenPrices,
} from '../../lib/positionLivePnl';
import {
  markPositionCloseFailed,
  markPositionClosing,
} from '../../lib/positionClose';
import TerminalBotAnalysisBar from './TerminalBotAnalysisBar';
import TerminalModalFrame from './TerminalModalFrame';

type DockTab = 'open' | 'history' | 'all';

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
};

type Props = {
  refreshKey?: number;
  botRunning?: boolean;
  /** Sidebar "History" scroll target */
  id?: string;
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
}) => {
  const { address } = useAccount();
  const { isDemoUser } = useAuth();
  const [tab, setTab] = useState<DockTab>('open');
  const [allRows, setAllRows] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [wallets, setWallets] = useState<string[]>([]);
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});
  const [closingId, setClosingId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{
    id: string;
    token: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await fetchUserWalletAddresses(address, isDemoUser);
      if (!cancelled) setWallets(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [address, isDemoUser]);

  const load = useCallback(
    async (silent = false) => {
      if (wallets.length === 0 && !isDemoUser && !address) {
        setAllRows([]);
        setLoading(false);
        return;
      }
      const queryWallets =
        wallets.length > 0
          ? wallets
          : isDemoUser
            ? [DEMO_WALLET_ADDRESS]
            : address
              ? [address.toLowerCase()]
              : [];
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
            'id, wallet_address, chain_id, token_symbol, token_address, direction, entry_price, entry_amount, profit_loss, status, leverage_multiplier, highest_price, created_at, closed_at, close_reason'
          )
          .in('wallet_address', queryWallets)
          .order('created_at', { ascending: false })
          .limit(120);

        if (error) throw error;
        setAllRows((data as Position[]) || []);
      } catch (e) {
        console.error('[TerminalPositionsDock]', e);
        if (!silent) setAllRows([]);
      } finally {
        setLoading(false);
      }
    },
    [address, isDemoUser, wallets]
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

  const stats = useMemo(
    () => computePositionStats(allRows, livePrices),
    [allRows, livePrices]
  );

  const openCount = allRows.filter(
    (p) => p.status === 'open' || p.status === 'closing'
  ).length;
  const closedCount = allRows.filter(
    (p) => p.status === 'closed' || p.status === 'failed'
  ).length;

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

  const hasWallet = Boolean(address || isDemoUser);

  return (
    <div className="term-dock" id={id}>
      <div className="term-dock-stats">
        <div className="term-dock-stat">
          <span className="term-dock-stat-label">Total P/L</span>
          <span
            className={
              stats.totalProfit >= 0 ? 'term-pnl-pos' : 'term-pnl-neg'
            }
          >
            {stats.totalProfit >= 0 ? '+' : ''}
            {fmtUsd(stats.totalProfit)}
          </span>
        </div>
        <div className="term-dock-stat">
          <span className="term-dock-stat-label">Realized</span>
          <span>{fmtUsd(stats.realizedProfit)}</span>
        </div>
        <div className="term-dock-stat">
          <span className="term-dock-stat-label">Unrealized</span>
          <span
            className={
              stats.unrealizedProfit >= 0 ? 'term-pnl-pos' : 'term-pnl-neg'
            }
          >
            {stats.unrealizedProfit >= 0 ? '+' : ''}
            {fmtUsd(stats.unrealizedProfit)}
          </span>
        </div>
        <div className="term-dock-stat">
          <span className="term-dock-stat-label">Win rate</span>
          <span>{stats.closedTrades > 0 ? `${stats.winRate.toFixed(0)}%` : '—'}</span>
        </div>
      </div>

      <div className="term-dock-head">
        <div className="term-dock-tabs">
          {(
            [
              ['open', `Positions (${openCount})`],
              ['history', `History (${closedCount})`],
              ['all', 'All trades'],
            ] as const
          ).map(([tid, label]) => (
            <button
              key={tid}
              type="button"
              className={`term-dock-tab ${tab === tid ? 'term-dock-tab--active' : ''}`}
              onClick={() => setTab(tid)}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="term-dock-refresh"
          onClick={() => load(false)}
          aria-label="Refresh history"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="term-dock-body">
        {tab === 'open' && botRunning && rows.length === 0 && !loading && (
          <TerminalBotAnalysisBar active />
        )}
        {loading && rows.length === 0 ? (
          <div className="term-empty">Loading trade history…</div>
        ) : rows.length === 0 && !(tab === 'open' && botRunning) ? (
          <div className="term-empty">
            {hasWallet
              ? `No ${tab === 'open' ? 'open positions' : tab === 'history' ? 'closed trades' : 'trades'} yet`
              : 'Connect wallet to see history'}
          </div>
        ) : rows.length > 0 ? (
          <table className="term-table">
            <thead>
              <tr>
                <th>Position</th>
                <th>Size</th>
                <th>P/L</th>
                <th>Status</th>
                <th>Time</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const pl = calcPositionPnl(p, livePrices);
                const time = p.closed_at || p.created_at;
                const isOpen = p.status === 'open';
                const isClosing = p.status === 'closing';
                const isFailed = p.status === 'failed';
                return (
                  <tr key={p.id}>
                    <td>
                      <span
                        className={
                          p.direction === 'LONG' ? 'term-dir-long' : 'term-dir-short'
                        }
                      >
                        {p.direction}
                      </span>{' '}
                      {p.token_symbol}
                      <span className="text-[#a1a1aa] ml-1">
                        {p.leverage_multiplier ?? 1}x
                      </span>
                    </td>
                    <td>{fmtUsd(p.entry_amount || 0)}</td>
                    <td className={pl >= 0 ? 'term-pnl-pos' : 'term-pnl-neg'}>
                      {pl >= 0 ? '+' : ''}
                      {fmtUsd(pl)}
                    </td>
                    <td className="capitalize text-[#52525b]">{p.status}</td>
                    <td className="text-[#71717a] whitespace-nowrap">
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
                        <span className="text-[#a16207] text-xs">Closing…</span>
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
                      <a
                        href={explorerUrl(p.chain_id, p.wallet_address)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="term-dock-link"
                        title="Explorer"
                      >
                        <ExternalLink size={12} />
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}
      </div>

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
