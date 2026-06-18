import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, X, ExternalLink } from 'lucide-react';
import { useAccount } from 'wagmi';
import { useAuth, DEMO_WALLET_ADDRESS } from '../../contexts/AuthContext';
import { useWeb3 } from '../../contexts/Web3Context';
import { supabase } from '../../lib/supabase';
import { fetchUserWalletAddresses, pickPrimaryVaultWallet } from '../../lib/userWallets';
import { reconcileWalletPositions } from '../../lib/positionReconciliation';
import { fetchUserPositions } from '../../lib/userPositions';
import {
  calcPositionPnl,
  fetchLiveTokenPrices,
} from '../../lib/positionLivePnl';
import {
  markPositionCloseFailed,
  markPositionClosing,
  recordManualVaultClose,
} from '../../lib/positionClose';
import TerminalModalFrame from './TerminalModalFrame';
import { explorerTxUrl } from '../../lib/tradeExplorer';
import {
  type ClosedTradeRow,
  fetchClosedTrades,
  mergeUnifiedHistory,
  verifyUrlForTrade,
} from '../../lib/closedTrades';
import DockCountBadge from '../protrade/DockCountBadge';
import { useTerminalVaultData } from '../../hooks/useTerminalVaultData';
import { useLinkedVaultOpenPositions } from '../../hooks/useLinkedVaultOpenPositions';
import { useHlBotSetup } from '../../hooks/useHlBotSetup';
import TerminalVaultActivity from './TerminalVaultActivity';
import {
  closeMethodMessage,
  executeVaultPositionClose,
} from '../../lib/vaultPositionClose';
import {
  isOnChainDockPositionId,
  mergeChainAndDbRows,
  vaultTokenFromDockRow,
} from '../../lib/vaultPositionDock';
import { getArbitrumPublicClient } from '../../lib/vault';
import { syncVaultChainHistoryForWallets } from '../../lib/syncVaultChainHistory';

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

function displaySymbol(sym: string) {
  if (sym === 'WETH') return 'ETH';
  if (sym === 'WBTC') return 'BTC';
  return sym;
}

function markPriceForRow(tokenSymbol: string, livePrices: Record<string, number>) {
  return (
    livePrices[tokenSymbol] ||
    livePrices[displaySymbol(tokenSymbol)] ||
    0
  );
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
  const { publicClient, walletClient } = useWeb3();
  const { isDemoUser, user, profile } = useAuth();
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
  const [walletsLoading, setWalletsLoading] = useState(true);
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});
  const [closingId, setClosingId] = useState<string | null>(null);
  const [closeNotice, setCloseNotice] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{
    id: string;
    token: string;
    wallet?: string;
  } | null>(null);
  const scrolledHighlightRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setWalletsLoading(true);
    (async () => {
      const list = await fetchUserWalletAddresses(address, isDemoUser);
      const vaultWallet = vaultData.wallet?.toLowerCase();
      const profileWallet = profile?.wallet_address?.trim().toLowerCase();
      const connected = address?.toLowerCase();
      if (vaultWallet && !list.includes(vaultWallet)) list.push(vaultWallet);
      if (profileWallet && !list.includes(profileWallet)) list.push(profileWallet);
      if (connected && !list.includes(connected)) list.push(connected);
      if (!cancelled) {
        setWallets(list);
        setWalletsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address, isDemoUser, user?.id, vaultData.wallet, profile?.wallet_address]);

  const queryWallets = useMemo(() => {
    if (isDemoUser) return [DEMO_WALLET_ADDRESS];
    const merged = new Set<string>();
    for (const w of wallets) merged.add(w.toLowerCase());
    const profileWallet = profile?.wallet_address?.trim().toLowerCase();
    if (profileWallet) merged.add(profileWallet);
    const connected = address?.toLowerCase();
    if (connected) merged.add(connected);
    const vaultWallet = vaultData.wallet?.toLowerCase();
    if (vaultWallet) merged.add(vaultWallet);
    return [...merged];
  }, [wallets, isDemoUser, profile?.wallet_address, address, vaultData.wallet]);

  const { chainRows, loading: chainLoading, resolved: chainResolved } =
    useLinkedVaultOpenPositions(queryWallets, refreshKey);

  const vaultWallet =
    pickPrimaryVaultWallet(queryWallets, address ?? vaultData.wallet) ?? vaultData.wallet;
  const hlSetup = useHlBotSetup(vaultWallet ?? address ?? undefined);

  const mergedRows = useMemo(
    () => mergeChainAndDbRows(allRows, chainRows),
    [allRows, chainRows]
  );

  const load = useCallback(
    async (silent = false) => {
      const queryWalletsLocal =
        queryWallets.length > 0
          ? queryWallets
          : isDemoUser
            ? [DEMO_WALLET_ADDRESS]
            : address
              ? [address.toLowerCase()]
              : [];

      if (!isDemoUser && !user && queryWalletsLocal.length === 0) {
        setAllRows([]);
        setClosedHistory([]);
        setLoading(false);
        return;
      }

      if (!silent) setLoading(true);
      try {
        if (!isDemoUser && user && queryWalletsLocal.length > 0) {
          await syncVaultChainHistoryForWallets(
            queryWalletsLocal,
            getArbitrumPublicClient() as import('viem').PublicClient
          );
        }

        const positionRows = await fetchUserPositions({
          isDemoUser,
          connectedAddress: address,
          wallets: queryWalletsLocal.length > 0 ? queryWalletsLocal : undefined,
          userId: user?.id,
          limit: 500,
        });

        setAllRows(positionRows as Position[]);

        const closed = await fetchClosedTrades({
          isDemoUser,
          wallets: queryWalletsLocal.length > 0 ? queryWalletsLocal : undefined,
          limit: 200,
        });
        setClosedHistory(closed);
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
    [queryWallets, isDemoUser, user, address]
  );

  useEffect(() => {
    load(false);
  }, [load, refreshKey]);

  useEffect(() => {
    const id = setInterval(() => load(true), 10000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (!user && !isDemoUser) return undefined;

    const channel = supabase
      .channel(`term-dock-history-${user?.id ?? 'demo'}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trade_history' },
        () => void load(true)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'positions' },
        () => void load(true)
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id, isDemoUser, load]);

  useEffect(() => {
    const tick = async () => setLivePrices(await fetchLiveTokenPrices());
    tick();
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, []);

  const openRows = useMemo(
    () => mergedRows.filter((p) => p.status === 'open' || p.status === 'closing'),
    [mergedRows]
  );
  const openCount = openRows.length;
  const historyRows = useMemo(() => {
    const merged = mergeUnifiedHistory(closedHistory, mergedRows);
    if (merged.length > 0) return merged;
    return mergedRows
      .filter((p) => p.status === 'closed' || p.status === 'failed' || p.status === 'closing')
      .map((p) => ({
        id: p.id,
        positionId: p.id,
        walletAddress: p.wallet_address,
        chainId: p.chain_id || 42161,
        tokenSymbol: p.token_symbol,
        direction: p.direction || 'LONG',
        leverage: p.leverage_multiplier ?? 1,
        entryAmount: p.entry_amount || 0,
        profitLoss: p.profit_loss,
        closedAt: p.closed_at || p.created_at,
        exitTxHash: p.exit_tx_hash,
        closeReason: p.close_reason,
        status: p.status as 'closed' | 'closing' | 'failed',
        source: 'position' as const,
      }));
  }, [closedHistory, mergedRows]);
  const historyCount = historyRows.length;
  const openNetPnl = useMemo(
    () => openRows.reduce((sum, p) => sum + calcPositionPnl(p, livePrices), 0),
    [openRows, livePrices]
  );
  const openTone: 'pos' | 'neg' | null =
    openCount > 0 ? (openNetPnl >= 0 ? 'pos' : 'neg') : null;

  const rows = useMemo(() => {
    if (tab === 'open') {
      return mergedRows.filter((p) => p.status === 'open' || p.status === 'closing');
    }
    if (tab === 'history') {
      return mergedRows.filter(
        (p) => p.status === 'closed' || p.status === 'failed' || p.status === 'closing'
      );
    }
    return mergedRows;
  }, [mergedRows, tab]);

  const handleRequestClose = async () => {
    if (!confirm) return;
    const positionId = confirm.id;
    const row = mergedRows.find((p) => p.id === positionId);
    const wallet = row?.wallet_address ?? confirm.wallet ?? vaultWallet;
    const token = vaultTokenFromDockRow(
      row ?? { id: positionId, token_symbol: confirm.token }
    );
    setConfirm(null);
    setClosingId(positionId);
    setCloseNotice(null);
    try {
      if (!wallet) {
        throw new Error('No wallet linked for this position — link wallet in Profile.');
      }
      const result = await executeVaultPositionClose({
        wallet,
        token,
        publicClient,
        walletClient,
        positionId: isOnChainDockPositionId(positionId) ? undefined : positionId,
      });
      if (result.method === 'on_chain' || isOnChainDockPositionId(positionId)) {
        await recordManualVaultClose({
          wallet,
          tokenSymbol: row?.token_symbol ?? (token === 'BTC' ? 'WBTC' : 'WETH'),
          direction: row?.direction,
          entryPrice: row?.entry_price,
          entryAmount: row?.entry_amount,
          leverage: row?.leverage_multiplier ?? 1,
          profitLoss: row?.profit_loss,
          exitTxHash: result.txHash,
          positionId: isOnChainDockPositionId(positionId) ? undefined : positionId,
        });
      }
      if (publicClient && wallet) {
        await reconcileWalletPositions(wallet, publicClient as import('viem').PublicClient);
      }
      setCloseNotice(closeMethodMessage(result));
      setTab('history');
      await load(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      if (!isOnChainDockPositionId(positionId)) {
        await markPositionCloseFailed(positionId, msg);
        await load(true);
      }
      setCloseNotice(msg);
      console.error('[TerminalPositionsDock] close', err);
    } finally {
      setClosingId(null);
    }
  };

  const handleRetry = async (positionId: string) => {
    const row = mergedRows.find((p) => p.id === positionId);
    const wallet = row?.wallet_address ?? vaultWallet;
    const token = vaultTokenFromDockRow(
      row ?? { id: positionId, token_symbol: 'WETH' }
    );
    setClosingId(positionId);
    setCloseNotice(null);
    try {
      if (isOnChainDockPositionId(positionId)) {
        if (!wallet) throw new Error('No wallet for this position');
        const result = await executeVaultPositionClose({
          wallet,
          token,
          publicClient,
          walletClient,
        });
        setCloseNotice(closeMethodMessage(result));
      } else {
        await markPositionClosing(positionId, 'retry_close');
        setCloseNotice('Close re-queued for the bot.');
      }
      setTab('history');
      await load(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Retry failed';
      setCloseNotice(msg);
      console.error('[TerminalPositionsDock] retry', e);
    } finally {
      setClosingId(null);
    }
  };

  const hasWallet = queryWallets.length > 0 || Boolean(address) || isDemoUser;
  const needsSignIn = !user && !isDemoUser && !address;
  const activityWallet = address ?? queryWallets[0];
  const awaitingWallets = !isDemoUser && Boolean(user) && walletsLoading && queryWallets.length === 0;
  const positionsLoading =
    loading || chainLoading || awaitingWallets || (queryWallets.length > 0 && !chainResolved);
  const showOpenTradingTable = isHlSkin && tab === 'open';

  const isPage = layout === 'page';
  const showUnifiedHistory = tab === 'history' || tab === 'all';
  const useHistoryOverview =
    (isPage || includeClosedHistoryFeed) && showUnifiedHistory;

  const dockTabs: { id: DockTab; label: string }[] = isHlSkin
    ? [
        { id: 'vault', label: 'Trading capital' },
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
      ) : tid === 'history' && historyCount > 0 ? (
        <span
          className={
            isHlSkin ? 'hl-dock-count hl-dock-count--muted' : 'term-dock-count term-dock-count--muted'
          }
        >
          ({historyCount})
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
          {user ? 'Link a wallet in Profile to view trading capital' : 'Connect wallet to view balance'}
        </p>
      ) : hlSetup.loading && vaultData.isLoading ? (
        <p className={emptyClass}>Loading balances…</p>
      ) : (
        <>
          <table className={tableClass}>
            <thead>
              <tr>
                <th>Source</th>
                <th>Balance</th>
                <th>Withdrawable</th>
                <th>Bot uses</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Hyperliquid (bot)</td>
                <td>{fmtUsd(hlSetup.accountUsd)}</td>
                <td>{fmtUsd(hlSetup.withdrawableUsd)}</td>
                <td>{fmtUsd(vaultData.maxTradeUsd)}</td>
              </tr>
              {vaultData.balanceUsd > 0 ? (
                <tr>
                  <td>Legacy GMX vault</td>
                  <td>{fmtUsd(vaultData.balanceUsd)}</td>
                  <td>{fmtUsd(vaultData.vaultUsd)}</td>
                  <td>—</td>
                </tr>
              ) : null}
            </tbody>
          </table>
          {vaultData.balanceUsd > 0 ? (
            <p className={isHlSkin ? 'hl-dock-hint' : 'term-hint term-hint--warn'}>
              Legacy vault on Arbitrum — bot trades on Hyperliquid only. Withdraw old vault funds if
              needed.
            </p>
          ) : null}
          {activityWallet ? (
            <TerminalVaultActivity
              wallet={activityWallet}
              refreshKey={refreshKey}
              variant="dock"
              skin={skin}
            />
          ) : null}
        </>
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
        {closeNotice ? (
          <p className={isHlSkin ? 'hl-dock-notice' : 'term-dock-notice'} role="status">
            {closeNotice}
          </p>
        ) : null}
        {tab === 'vault' ? (
          vaultPanel
        ) : needsSignIn ? (
          <div className={emptyClass}>
            Sign in to view trade history for your profile wallets.
          </div>
        ) : positionsLoading && tab === 'open' && rows.length === 0 ? (
          <div className={emptyClass}>Loading open positions…</div>
        ) : tab === 'history' && historyRows.length > 0 ? (
          <table className={isHlSkin ? 'hl-table' : 'term-table term-table--history-overview'}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Time</th>
                {queryWallets.length > 1 ? <th>Wallet</th> : null}
                <th>Position</th>
                <th>Size</th>
                <th>Lev</th>
                <th>P/L</th>
                <th>Status</th>
                <th>Verify</th>
              </tr>
            </thead>
            <tbody>
              {historyRows.map((t) => {
                const { date, time } = fmtDateParts(t.closedAt);
                const verify = verifyUrlForTrade(t);
                const rowId = t.positionId || t.id;
                const rowHighlight =
                  highlightPositionId === rowId || highlightPositionId === t.id;
                const pl = t.profitLoss ?? 0;
                return (
                  <tr
                    key={`${t.source}-${t.id}`}
                    id={`term-row-${rowId}`}
                    className={rowHighlight ? 'term-row--highlight' : ''}
                  >
                    <td className="term-history-date">{date}</td>
                    <td className="term-history-time">{time}</td>
                    {queryWallets.length > 1 ? (
                      <td className="term-history-wallet" title={t.walletAddress}>
                        {t.walletAddress.slice(0, 6)}…{t.walletAddress.slice(-4)}
                      </td>
                    ) : null}
                    <td>
                      <span
                        className={
                          t.direction === 'LONG' ? 'term-dir-long' : 'term-dir-short'
                        }
                      >
                        {t.direction}
                      </span>{' '}
                      {displaySymbol(t.tokenSymbol)}
                    </td>
                    <td>{fmtUsd(t.entryAmount)}</td>
                    <td>{t.leverage}x</td>
                    <td className={pl >= 0 ? 'term-pnl-pos' : 'term-pnl-neg'}>
                      {t.status === 'closing' ? '—' : `${pl >= 0 ? '+' : ''}${fmtUsd(pl)}`}
                    </td>
                    <td className="capitalize term-dock-status">{t.status}</td>
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
        ) : tab === 'history' ? (
          <div className={emptyClass}>
            {hasWallet
              ? queryWallets.length > 1
                ? `No closed trades yet across your ${queryWallets.length} linked wallets.`
                : 'No closed trades yet for your linked wallets.'
              : user
                ? 'Add wallets in Profile → Wallets to see trade history from all your vaults.'
                : 'Sign in and link wallets in Profile → Wallets to see trade history.'}
          </div>
        ) : positionsLoading && rows.length === 0 ? (
          <div className={emptyClass}>Loading…</div>
        ) : rows.length === 0 ? (
          <div className={emptyClass}>
            {hasWallet
              ? tab === 'open'
                ? 'No open positions on your linked vault wallets'
                : `No ${tab === 'history' ? 'closed trades' : 'trades'} yet for your linked wallets`
              : 'Link a wallet in Profile → Wallets to see your trade history'}
          </div>
        ) : showOpenTradingTable ? (
          <table className={`${tableClass} hl-table--positions`}>
            <thead>
              <tr>
                <th>Market</th>
                <th>Side</th>
                <th>Size</th>
                <th>Entry</th>
                <th>Mark</th>
                <th>Lev</th>
                <th>P/L</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const pl = calcPositionPnl(p, livePrices);
                const mark = markPriceForRow(p.token_symbol, livePrices);
                const isOpen = p.status === 'open';
                const isClosing = p.status === 'closing';
                const isFailed = p.status === 'failed';
                return (
                  <tr key={p.id} id={`term-row-${p.id}`}>
                    <td>
                      <strong>{displaySymbol(p.token_symbol)}</strong>
                      <span className="term-dock-meta"> · GMX</span>
                    </td>
                    <td>
                      <span
                        className={
                          p.direction === 'LONG' ? 'term-dir-long' : 'term-dir-short'
                        }
                      >
                        {p.direction}
                      </span>
                    </td>
                    <td>{fmtUsd(p.entry_amount || 0)}</td>
                    <td>
                      {p.entry_price
                        ? `$${Number(p.entry_price).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                        : '—'}
                    </td>
                    <td>
                      {mark > 0
                        ? `$${mark.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                        : '—'}
                    </td>
                    <td>{p.leverage_multiplier ?? 1}x</td>
                    <td className={pl >= 0 ? 'term-pnl-pos' : 'term-pnl-neg'}>
                      {pl >= 0 ? '+' : ''}
                      {fmtUsd(pl)}
                    </td>
                    <td className="term-dock-actions">
                      {isOpen && (
                        <button
                          type="button"
                          className="term-dock-close-btn"
                          disabled={closingId === p.id}
                          onClick={() =>
                            setConfirm({
                              id: p.id,
                              token: p.token_symbol,
                              wallet: p.wallet_address,
                            })
                          }
                        >
                          {closingId === p.id ? '…' : 'Close'}
                        </button>
                      )}
                      {isClosing && (
                        <>
                          <span className="term-dock-closing text-xs">Closing…</span>
                          <button
                            type="button"
                            className="term-dock-close-btn term-dock-close-btn--retry"
                            disabled={closingId === p.id}
                            onClick={() => handleRetry(p.id)}
                          >
                            Retry
                          </button>
                        </>
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
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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

                if (useHistoryOverview && isClosing) {
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
                        {displaySymbol(p.token_symbol)}
                      </td>
                      <td>{fmtUsd(p.entry_amount || 0)}</td>
                      <td>{p.leverage_multiplier ?? 1}x</td>
                      <td className={pl >= 0 ? 'term-pnl-pos' : 'term-pnl-neg'}>
                        {pl >= 0 ? '+' : ''}
                        {fmtUsd(pl)}
                      </td>
                      <td>
                        <span className="term-dock-closing">Closing…</span>
                      </td>
                    </tr>
                  );
                }

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
                            setConfirm({
                              id: p.id,
                              token: p.token_symbol,
                              wallet: p.wallet_address,
                            })
                          }
                        >
                          {closingId === p.id ? '…' : 'Close'}
                        </button>
                      )}
                      {isClosing && (
                        <>
                          <span className="term-dock-closing text-xs">Closing…</span>
                          <button
                            type="button"
                            className="term-dock-close-btn term-dock-close-btn--retry"
                            disabled={closingId === p.id}
                            onClick={() => handleRetry(p.id)}
                          >
                            Retry
                          </button>
                        </>
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
