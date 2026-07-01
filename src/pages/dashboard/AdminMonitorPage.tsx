import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Activity,
  Bell,
  Bot,
  Coins,
  CreditCard,
  DollarSign,
  ExternalLink,
  Lock,
  RefreshCw,
  Server,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { isAdminEmail } from '../../lib/admin';
import {
  fetchAdminHlDashboard,
  fetchAdminHlTradeHistory,
  fetchAdminLiveContext,
  fmtUsd,
  fmtUsdTrade,
  formatTimeAgo,
  shortWallet,
  type AdminHlDashboard,
  type AdminLiveContext,
  type AdminTradeClose,
  type AdminTradeHistoryUserStats,
  type AdminWalletFee,
} from '../../lib/adminDashboard';
import { fmtPrice, fmtSize } from '../../lib/hyperliquid/format';
import { countAdminPositionsByCoin } from '../../lib/adminHlLivePositions';
import AdminAffiliateOps from '../../components/admin/AdminAffiliateOps';

type Section =
  | 'overview'
  | 'bots'
  | 'positions'
  | 'trades'
  | 'events'
  | 'fees'
  | 'betting'
  | 'users'
  | 'subscriptions'
  | 'affiliate';

const SECTIONS: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <Activity size={16} /> },
  { id: 'bots', label: 'HL bots', icon: <Bot size={16} /> },
  { id: 'positions', label: 'Open', icon: <Zap size={16} /> },
  { id: 'trades', label: 'History', icon: <TrendingUp size={16} /> },
  { id: 'events', label: 'Events', icon: <Bell size={16} /> },
  { id: 'fees', label: 'Fees', icon: <Coins size={16} /> },
  { id: 'betting', label: 'Betting', icon: <DollarSign size={16} /> },
  { id: 'users', label: 'Users', icon: <Users size={16} /> },
  { id: 'subscriptions', label: 'Plans', icon: <CreditCard size={16} /> },
  { id: 'affiliate', label: 'Affiliate', icon: <Users size={16} /> },
];

const SECTION_IDS = new Set<Section>(SECTIONS.map((s) => s.id));
const ADMIN_PAGE_SIZE = 25;

type HistoryUserFilter = { wallet?: string; email?: string } | null;

type PaginationProps = {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
};

function paginate<T>(items: T[], page: number, pageSize = ADMIN_PAGE_SIZE) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  return {
    pageRows: items.slice(safePage * pageSize, safePage * pageSize + pageSize),
    totalPages,
    safePage,
    total,
  };
}

function sectionFromQuery(tab: string | null): Section {
  if (tab === 'payments') return 'overview';
  if (tab && SECTION_IDS.has(tab as Section)) return tab as Section;
  return 'overview';
}

const AdminMonitorPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [section, setSection] = useState<Section>(() =>
    sectionFromQuery(searchParams.get('tab'))
  );
  const [dash, setDash] = useState<AdminHlDashboard | null>(null);
  const [live, setLive] = useState<AdminLiveContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [rpcError, setRpcError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [historyFilter, setHistoryFilter] = useState<HistoryUserFilter>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setRpcError(null);
    const [snapshotResult, ctx] = await Promise.all([
      fetchAdminHlDashboard(),
      fetchAdminLiveContext(),
    ]);
    if (!snapshotResult.data) {
      setRpcError(
        snapshotResult.error ??
          'Admin snapshot unavailable — sign in with an admin email and refresh.'
      );
      setDash(null);
    } else {
      setRpcError(null);
      setDash(snapshotResult.data);
    }
    setLive(ctx);
    setLastRefresh(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab) setSection(sectionFromQuery(tab));
  }, [searchParams]);

  useEffect(() => {
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.email) {
        setEmail(user.email);
        setIsAdmin(isAdminEmail(user.email));
      } else {
        setIsAdmin(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    void refresh();
    const poll = setInterval(refresh, 60_000);
    return () => clearInterval(poll);
  }, [isAdmin, refresh]);

  useEffect(() => {
    if (!isAdmin) return;
    const channel = supabase
      .channel('admin-trade-events')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'user_trade_notifications' },
        () => {
          void refresh();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isAdmin, refresh]);

  const stats = dash?.stats;

  const mergedEvents = useMemo(() => {
    if (!dash) return [];
    const fromNotifs = (dash.recent_events ?? []).map((e) => ({
      id: e.id,
      at: e.closed_at,
      kind: e.kind,
      headline: e.headline,
      wallet: e.wallet_address,
      email: e.email,
      pnl: e.profit_loss,
      emailSent: Boolean(e.email_sent_at),
    }));
    return fromNotifs.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 40);
  }, [dash]);

  if (isAdmin === null) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 text-muted animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <Lock className="w-16 h-16 text-red-500 mb-4" />
        <h1 className="text-2xl font-bold text-primary mb-2">Access Denied</h1>
        <p className="text-secondary">Admin only · {email ?? 'not signed in'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary">Admin — Hyperliquid</h1>
          <p className="text-secondary text-sm mt-1">
            Live DB + bot-service · {lastRefresh.toLocaleTimeString()} · {email}
          </p>
          {rpcError && (
            <p className="text-amber-500 text-xs mt-2 max-w-xl">{rpcError}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-black/[0.04] hover:bg-black/[0.06] text-primary text-sm"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </header>

      <nav className="admin-monitor-tabs flex gap-1.5 p-1 bg-card-dark rounded-lg border border-border flex-nowrap w-full overflow-x-auto">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSection(s.id)}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              section === s.id
                ? 'bg-white text-black'
                : 'text-secondary hover:text-primary hover:bg-black/[0.04]'
            }`}
          >
            {s.icon}
            {s.label}
          </button>
        ))}
      </nav>

      {section === 'overview' && stats && (
        <OverviewPanel stats={stats} live={live} events={mergedEvents} />
      )}

      {section === 'bots' && dash && (
        <BotsPanel bots={dash.active_bots} runnableCount={dash.stats.hl_bots_runnable} />
      )}
      {section === 'positions' && dash && <PositionsPanel rows={dash.open_positions} />}
      {section === 'trades' && (
        <TradesPanel
          userFilter={historyFilter}
          onClearUserFilter={() => setHistoryFilter(null)}
        />
      )}
      {section === 'events' && dash && <EventsPanel rows={dash.recent_events} />}
      {section === 'fees' && dash && live && (
        <FeesPanel
          ledger={dash.fee_ledger}
          walletFees={dash.wallet_fees ?? []}
          stats={dash.stats}
          builder={live.builder}
        />
      )}
      {section === 'betting' && dash && (
        <BettingPanel positions={dash.betting_positions} closes={dash.betting_closes} />
      )}
      {section === 'users' && dash && (
        <UsersPanel
          rows={dash.users}
          openPositions={dash.open_positions}
          onViewHistory={(wallet, email) => {
            setHistoryFilter({ wallet, email: email ?? undefined });
            setSection('trades');
          }}
        />
      )}
      {section === 'subscriptions' && dash && <SubsPanel rows={dash.subscriptions} />}
      {section === 'affiliate' && <AdminAffiliateOps />}

      {!dash && !loading && section !== 'affiliate' && (
        <p className="text-secondary text-sm py-8 text-center">No dashboard data yet.</p>
      )}
    </div>
  );
};

function OverviewPanel({
  stats,
  live,
  events,
}: {
  stats: NonNullable<AdminHlDashboard['stats']>;
  live: AdminLiveContext | null;
  events: {
    id: string;
    at: string;
    kind: string;
    headline: string;
    wallet: string;
    email: string | null;
    pnl: number;
    emailSent: boolean;
  }[];
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi label="Users" value={String(stats.total_users)} sub={`${stats.users_with_wallet} wallets`} />
        <Kpi
          label="HL bots runnable"
          value={String(stats.hl_bots_runnable ?? stats.hl_bots_active)}
          sub={`${stats.hl_bots_toggle_on ?? stats.hl_bots_active} toggle on · ${stats.hl_bots_total} configured · ${stats.agents_approved} agents`}
        />
        <Kpi label="Open perps" value={String(stats.open_positions)} sub={`uPnL ${fmtUsd(stats.open_upnl_total, true)}`} />
        <Kpi
          label="P/L 24h"
          value={fmtUsd(stats.pnl_24h, true)}
          sub={`HL closes only · total ${fmtUsd(stats.total_pnl, true)}`}
          positive={stats.pnl_24h >= 0}
        />
        <Kpi label="Win rate" value={`${stats.win_rate}%`} sub={`${stats.closed_trades_24h} closes / 24h`} />
        <Kpi
          label="Platform fees"
          value={fmtUsd(stats.platform_fees_owed_usd ?? stats.hl_fees_accrued_usd)}
          sub={`owed · ${fmtUsd(stats.platform_fees_paid_usd ?? stats.hl_fees_settled_usd)} paid`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BotServiceCard
          live={live}
          activeBots={stats.hl_bots_runnable ?? stats.hl_bots_active}
          toggleOn={stats.hl_bots_toggle_on}
        />
        <BuilderCard live={live} pendingEmail={stats.notifications_pending_email} />
      </div>

      <div className="bg-card-dark rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Bell size={18} className="text-cyan-400" />
          <h3 className="font-semibold text-primary">Recent activity</h3>
          <span className="text-xs text-secondary ml-auto">trade closes · notifications · realtime</span>
        </div>
        <div className="divide-y divide-border max-h-[420px] overflow-y-auto">
          {events.length === 0 ? (
            <p className="p-6 text-secondary text-sm text-center">No events yet</p>
          ) : (
            events.map((e) => (
              <div key={e.id} className="px-4 py-3 flex flex-wrap gap-x-4 gap-y-1 text-sm hover:bg-black/[0.03]">
                <span className="text-secondary whitespace-nowrap w-20">{formatTimeAgo(e.at)}</span>
                <span className="text-xs uppercase tracking-wide text-cyan-400/90 w-14">{e.kind}</span>
                <span className="text-primary flex-1 min-w-[200px]">{e.headline}</span>
                <span className="font-mono text-xs text-secondary">{shortWallet(e.wallet)}</span>
                {e.email && <span className="text-xs text-secondary truncate max-w-[140px]">{e.email}</span>}
                <span className={e.pnl >= 0 ? 'text-green-400 font-mono' : 'text-red-400 font-mono'}>
                  {fmtUsdTrade(e.pnl, true)}
                </span>
                {!e.emailSent && (
                  <span className="text-[10px] uppercase text-amber-400">email pending</span>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function BotServiceCard({
  live,
  activeBots,
  toggleOn,
}: {
  live: AdminLiveContext | null;
  activeBots: number;
  toggleOn?: number;
}) {
  const health = live?.health;
  const svc = live?.serviceStatus;
  const ok = health?.status === 'healthy' && svc?.success !== false;

  return (
    <div className={`rounded-xl border p-5 ${ok ? 'border-green-500/30 bg-card-dark' : 'border-amber-500/40 bg-card-dark'}`}>
      <div className="flex items-center gap-2 mb-3">
        <Server size={20} className={ok ? 'text-green-400' : 'text-amber-400'} />
        <h3 className="font-semibold text-primary">Bot service (Railway)</h3>
        <span
          className={`ml-auto text-xs px-2 py-0.5 rounded-full ${
            ok ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'
          }`}
        >
          {ok ? 'online' : 'degraded / offline'}
        </span>
      </div>
      {health ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-secondary">Uptime</dt>
          <dd className="text-primary">{health.uptime ?? '—'}</dd>
          <dt className="text-secondary">Version</dt>
          <dd className="text-primary font-mono text-xs">{health.version ?? '—'}</dd>
          <dt className="text-secondary">Trades executed</dt>
          <dd className="text-primary">{health.tradesExecuted ?? '—'}</dd>
          <dt className="text-secondary">Auto-trade wallets</dt>
          <dd className="text-primary">
            {svc?.activeAutoTradeWallets ?? activeBots}
            {toggleOn != null && toggleOn !== (svc?.activeAutoTradeWallets ?? activeBots) ? (
              <span className="text-secondary text-xs"> · {toggleOn} toggle on</span>
            ) : null}
          </dd>
          <dt className="text-secondary">Scan interval</dt>
          <dd className="text-primary">{svc?.tradeIntervalSec ? `${svc.tradeIntervalSec}s` : '—'}</dd>
          <dt className="text-secondary">Venue</dt>
          <dd className="text-primary uppercase">{svc?.executionVenue ?? 'hyperliquid'}</dd>
        </dl>
      ) : (
        <p className="text-secondary text-sm">Cannot reach bot-service — check VITE_BOT_API_URL / Railway.</p>
      )}
      {health?.lastCycle && (
        <pre className="mt-3 text-[10px] text-secondary bg-black/20 rounded p-2 overflow-x-auto max-h-24">
          {JSON.stringify(health.lastCycle, null, 0)}
        </pre>
      )}
    </div>
  );
}

function BuilderCard({
  live,
  pendingEmail,
}: {
  live: AdminLiveContext | null;
  pendingEmail: number;
}) {
  const b = live?.builder;
  const ready = b?.ready;
  const feeRatePct = 10;
  const fetchFailed = Boolean(b?.fetchError);

  return (
    <div
      className={`rounded-xl border p-5 ${
        fetchFailed
          ? 'border-amber-500/40'
          : ready
            ? 'border-green-500/30'
            : 'border-red-500/40'
      } bg-card-dark`}
    >
      <div className="flex items-center gap-2 mb-3">
        <Coins size={20} className={ready && !fetchFailed ? 'text-green-400' : 'text-amber-400'} />
        <h3 className="font-semibold text-primary">Builder wallet — fee destination</h3>
        <span
          className={`ml-auto text-xs px-2 py-0.5 rounded-full ${
            fetchFailed
              ? 'bg-amber-500/20 text-amber-400'
              : ready
                ? 'bg-green-500/20 text-green-400'
                : 'bg-red-500/20 text-red-400'
          }`}
        >
          {fetchFailed ? 'fetch failed' : ready ? 'auto fee collection ON' : 'underfunded'}
        </span>
      </div>
      <p className="text-2xl font-bold text-primary">{fmtUsd(b?.accountUsd ?? 0)}</p>
      {b?.unifiedAccount && (b.spotUsdcUsd > 0 || b.perpUsd >= 0) ? (
        <p className="text-xs text-secondary mt-1">
          Unified HL · spot USDC {fmtUsd(b.spotUsdcUsd)} · perp {fmtUsd(b.perpUsd)}
        </p>
      ) : null}
      <p className="text-xs text-secondary mt-1 break-all font-mono">{b?.builderAddress}</p>
      {fetchFailed ? (
        <p className="text-xs text-amber-400 mt-2">
          Could not load builder balance ({b?.fetchError}). Check /bot-service proxy and Railway.
        </p>
      ) : null}
      <dl className="mt-4 grid grid-cols-1 gap-2 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-secondary">Success fee rate</dt>
          <dd className="text-primary font-medium">{feeRatePct}% of profit on every winning close</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-secondary">Collection</dt>
          <dd className="text-primary">
            {b?.feeCollectionActive
              ? 'Active via HL builder'
              : 'Inactive until wallet ≥ $100 on HL'}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-secondary">HL minimum</dt>
          <dd className="text-primary">{fmtUsd(b?.minUsd ?? 100)} tradable on HL</dd>
        </div>
      </dl>
      <p className="text-xs text-secondary mt-3">{pendingEmail} trade emails pending</p>
      {b?.builderAddress && (
        <a
          href={`https://app.hyperliquid.xyz/explorer/address/${b.builderAddress}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-blue-400 text-sm mt-3"
        >
          Hyperliquid explorer <ExternalLink size={12} />
        </a>
      )}
    </div>
  );
}

function BotsPanel({
  bots,
  runnableCount,
}: {
  bots: AdminHlDashboard['active_bots'];
  runnableCount?: number;
}) {
  const [page, setPage] = useState(0);
  const runnable = runnableCount ?? bots.filter((b) => b.bot_runnable).length;
  const toggleOn = bots.filter((b) => b.auto_trade_enabled).length;
  const { pageRows, totalPages, safePage, total } = useMemo(
    () => paginate(bots, page),
    [bots, page]
  );

  return (
    <TableShell
      title={`HL bot configs (${total})`}
      subtitle={`${runnable} runnable (Railway cycle) · ${toggleOn} toggle on · chain 42161 + agent required`}
      scrollable
      pagination={{
        page: safePage,
        totalPages,
        total,
        onPageChange: setPage,
      }}
    >
      <thead>
        <tr className="text-left text-secondary text-xs">
          <th className="px-4 py-3">Wallet</th>
          <th className="px-4 py-3">User</th>
          <th className="px-4 py-3">Runnable</th>
          <th className="px-4 py-3">Toggle</th>
          <th className="px-4 py-3">Agent</th>
          <th className="px-4 py-3">Chain</th>
          <th className="px-4 py-3">Fees owed</th>
          <th className="px-4 py-3">Blockers</th>
          <th className="px-4 py-3">Lev</th>
          <th className="px-4 py-3">Strategy</th>
        </tr>
      </thead>
      <tbody>
        {pageRows.map((b) => (
          <tr key={`${b.wallet_address}-${b.chain_id ?? 'x'}`} className="border-t border-border text-sm hover:bg-black/[0.03] align-top">
            <td className="px-4 py-2 font-mono text-xs">{shortWallet(b.wallet_address, 8)}</td>
            <td className="px-4 py-2 text-xs text-secondary max-w-[140px] truncate">{b.email ?? '—'}</td>
            <td className="px-4 py-2">
              <StatusPill on={Boolean(b.bot_runnable)} onLabel="yes" offLabel="no" />
            </td>
            <td className="px-4 py-2">
              <StatusPill on={b.auto_trade_enabled} onLabel="ON" offLabel="off" />
            </td>
            <td className="px-4 py-2">
              <StatusPill on={b.agent_approved} onLabel="yes" offLabel="no" />
            </td>
            <td className="px-4 py-2 text-xs font-mono">{b.chain_id ?? '—'}</td>
            <td className="px-4 py-2 font-mono text-xs">
              {(b.fees_owed_usd ?? 0) > 0 ? (
                <span className="text-amber-400">{fmtUsd(b.fees_owed_usd)}</span>
              ) : (
                <span className="text-secondary">—</span>
              )}
            </td>
            <td className="px-4 py-2 text-xs text-amber-400/90 max-w-[200px]">
              {b.blockers || '—'}
            </td>
            <td className="px-4 py-2">{b.leverage_multiplier}x</td>
            <td className="px-4 py-2 text-xs">{b.hl_bot_strategy ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </TableShell>
  );
}

function PositionsPanel({ rows }: { rows: AdminHlDashboard['open_positions'] }) {
  const [page, setPage] = useState(0);
  const totalUpnl = rows.reduce((s, p) => s + (p.profit_loss ?? 0), 0);
  const { pageRows, totalPages, safePage, total } = useMemo(
    () => paginate(rows, page),
    [rows, page]
  );
  const coinSummary = useMemo(() => {
    const counts = countAdminPositionsByCoin(rows);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([coin, n]) => (n > 1 ? `${coin}×${n}` : coin))
      .join(' · ');
  }, [rows]);

  return (
    <TableShell
      title={`Open HL positions (${total})`}
      subtitle={`Live Hyperliquid · total uPnL ${fmtUsdTrade(totalUpnl, true)}${coinSummary ? ` · ${coinSummary}` : ''}`}
      scrollable
      pagination={{
        page: safePage,
        totalPages,
        total,
        onPageChange: setPage,
      }}
    >
      <thead>
        <tr className="text-left text-secondary text-xs">
          <th className="px-4 py-3">User</th>
          <th className="px-4 py-3">Wallet</th>
          <th className="px-4 py-3">Pair</th>
          <th className="px-4 py-3">Dir</th>
          <th className="px-4 py-3">Size</th>
          <th className="px-4 py-3">Notional</th>
          <th className="px-4 py-3">Entry</th>
          <th className="px-4 py-3">Mark</th>
          <th className="px-4 py-3">Lev</th>
          <th className="px-4 py-3">uPnL</th>
          <th className="px-4 py-3">ROE</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={11} className="px-4 py-8 text-center text-secondary text-sm">
              No open perps on tracked wallets
            </td>
          </tr>
        ) : (
          pageRows.map((p) => (
            <tr key={p.id} className="border-t border-border text-sm hover:bg-black/[0.03]">
              <td className="px-4 py-2 text-xs text-secondary max-w-[140px] truncate">
                {p.email ?? '—'}
              </td>
              <td className="px-4 py-2 font-mono text-xs">{shortWallet(p.wallet_address, 8)}</td>
              <td className="px-4 py-2 font-medium">{p.token_symbol}</td>
              <td className="px-4 py-2">{p.direction}</td>
              <td className="px-4 py-2 font-mono">
                {p.abs_size != null ? fmtSize(p.abs_size) : '—'}
              </td>
              <td className="px-4 py-2 font-mono">
                {fmtUsd(p.notional_usd ?? p.entry_amount)}
              </td>
              <td className="px-4 py-2 font-mono">
                {p.entry_price != null ? fmtPrice(p.entry_price) : '—'}
              </td>
              <td className="px-4 py-2 font-mono">
                {p.mark_price != null ? fmtPrice(p.mark_price) : '—'}
              </td>
              <td className="px-4 py-2">{p.leverage_multiplier ?? 1}x</td>
              <td
                className={`px-4 py-2 font-mono ${
                  (p.profit_loss ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'
                }`}
              >
                {p.profit_loss != null ? fmtUsdTrade(p.profit_loss, true) : '—'}
              </td>
              <td
                className={`px-4 py-2 font-mono text-xs ${
                  (p.profit_loss_percent ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'
                }`}
              >
                {p.profit_loss_percent != null
                  ? `${p.profit_loss_percent >= 0 ? '+' : ''}${p.profit_loss_percent.toFixed(2)}%`
                  : '—'}
              </td>
            </tr>
          ))
        )}
      </tbody>
    </TableShell>
  );
}

function TradesPanel({
  userFilter,
  onClearUserFilter,
}: {
  userFilter: HistoryUserFilter;
  onClearUserFilter: () => void;
}) {
  const [rows, setRows] = useState<AdminTradeClose[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [userStats, setUserStats] = useState<AdminTradeHistoryUserStats | null>(null);
  const [walletInput, setWalletInput] = useState(userFilter?.wallet ?? '');
  const [emailInput, setEmailInput] = useState(userFilter?.email ?? '');
  const [appliedFilter, setAppliedFilter] = useState({
    wallet: userFilter?.wallet?.trim() ?? '',
    email: userFilter?.email?.trim() ?? '',
  });

  useEffect(() => {
    const wallet = userFilter?.wallet?.trim() ?? '';
    const email = userFilter?.email?.trim() ?? '';
    setWalletInput(wallet);
    setEmailInput(email);
    setAppliedFilter({ wallet, email });
    setPage(0);
  }, [userFilter?.wallet, userFilter?.email]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const result = await fetchAdminHlTradeHistory({
        limit: ADMIN_PAGE_SIZE,
        offset: page * ADMIN_PAGE_SIZE,
        wallet: appliedFilter.wallet || null,
        email: appliedFilter.email || null,
      });
      setRows(result.rows);
      setTotal(result.total);
      setUserStats(result.user_stats ?? null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load trade history');
      setRows([]);
      setTotal(0);
      setUserStats(null);
    } finally {
      setLoading(false);
    }
  }, [page, appliedFilter.wallet, appliedFilter.email]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  const pagePnl = useMemo(
    () => rows.reduce((s, t) => s + (t.profit_loss ?? 0), 0),
    [rows]
  );

  const applyFilter = () => {
    setAppliedFilter({
      wallet: walletInput.trim(),
      email: emailInput.trim(),
    });
    setPage(0);
  };

  const hasFilter = Boolean(appliedFilter.wallet || appliedFilter.email);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card-dark p-4 flex flex-wrap gap-3 items-end">
        <label className="flex flex-col gap-1 text-xs text-secondary min-w-[200px] flex-1">
          Filter by email
          <input
            type="search"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            placeholder="user@example.com"
            className="px-3 py-2 rounded-lg bg-black/30 border border-border text-sm text-primary"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-secondary min-w-[200px] flex-1">
          Filter by wallet
          <input
            type="search"
            value={walletInput}
            onChange={(e) => setWalletInput(e.target.value)}
            placeholder="0x…"
            className="px-3 py-2 rounded-lg bg-black/30 border border-border text-sm text-primary font-mono"
          />
        </label>
        <button
          type="button"
          onClick={applyFilter}
          className="px-4 py-2 rounded-lg bg-white text-black text-sm font-medium"
        >
          Apply
        </button>
        {(hasFilter || walletInput || emailInput) && (
          <button
            type="button"
            onClick={() => {
              setWalletInput('');
              setEmailInput('');
              setAppliedFilter({ wallet: '', email: '' });
              onClearUserFilter();
              setPage(0);
            }}
            className="px-4 py-2 rounded-lg border border-border text-sm text-secondary hover:text-primary"
          >
            Clear filter
          </button>
        )}
      </div>

      {userStats && hasFilter ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <Kpi
            label="Closed P/L"
            value={fmtUsdTrade(userStats.closed_pnl_total, true)}
            positive={userStats.closed_pnl_total >= 0}
          />
          <Kpi label="Closed trades" value={String(userStats.closed_trades_count)} />
          <Kpi label="Open positions" value={String(userStats.open_positions_count)} />
          <Kpi
            label="Fees owed"
            value={fmtUsd(userStats.fees_accrued_usd)}
            sub={userStats.fees_accrued_usd > 0 ? 'pending payment' : 'clear'}
          />
          <Kpi label="Fees paid" value={fmtUsd(userStats.fees_paid_usd)} />
          <Kpi
            label="Fee wins"
            value={String(userStats.fee_win_count)}
            sub={`${userStats.wins_until_fee} until next block`}
          />
          <Kpi
            label="User"
            value={userStats.email ?? shortWallet(userStats.wallet_address, 6)}
            sub={shortWallet(userStats.wallet_address, 8)}
          />
        </div>
      ) : null}

      <TableShell
        title={`Closed HL trades (${total})`}
        subtitle={`Page P/L ${fmtUsdTrade(pagePnl, true)} · hyperliquid only`}
        scrollable
        pagination={{
          page,
          totalPages,
          total,
          onPageChange: setPage,
        }}
        headerRight={
          <button
            type="button"
            className="text-xs text-cyan-400 hover:underline disabled:opacity-50"
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? 'Loading…' : 'Reload'}
          </button>
        }
      >
        {loadError && (
          <p className="px-4 py-2 text-sm text-red-400 border-b border-border">{loadError}</p>
        )}
        <thead>
          <tr className="text-left text-secondary text-xs">
            <th className="px-4 py-3 whitespace-nowrap">Closed (UTC)</th>
            <th className="px-4 py-3">ID</th>
            <th className="px-4 py-3">User</th>
            <th className="px-4 py-3">Wallet</th>
            <th className="px-4 py-3">Pair</th>
            <th className="px-4 py-3">Dir</th>
            <th className="px-4 py-3">Lev</th>
            <th className="px-4 py-3">Entry</th>
            <th className="px-4 py-3">Exit</th>
            <th className="px-4 py-3">Fill P/L</th>
            <th className="px-4 py-3">Snap P/L</th>
            <th className="px-4 py-3">Builder fee</th>
            <th className="px-4 py-3">Fee status</th>
            <th className="px-4 py-3 min-w-[280px]">Reason (full)</th>
          </tr>
        </thead>
        <tbody>
          {loading && rows.length === 0 ? (
            <tr>
              <td colSpan={13} className="px-4 py-8 text-center text-secondary text-sm">
                Loading trade history…
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={13} className="px-4 py-8 text-center text-secondary text-sm">
                No closed HL trades match this filter.
              </td>
            </tr>
          ) : (
            rows.map((t) => {
              const snap = t.snapshot_pnl_usd;
              const fill = t.profit_loss;
              const snapMismatch =
                snap != null &&
                fill != null &&
                Number.isFinite(snap) &&
                Number.isFinite(fill) &&
                Math.abs(snap - fill) > 0.02;
              return (
                <tr key={t.id} className="border-t border-border text-sm hover:bg-black/[0.03] align-top">
                  <td className="px-4 py-2 text-secondary text-xs whitespace-nowrap font-mono">
                    {t.closed_at ? new Date(t.closed_at).toISOString().replace('T', ' ').slice(0, 19) : '—'}
                    <div className="text-[10px] opacity-70">{formatTimeAgo(t.closed_at)}</div>
                  </td>
                  <td className="px-4 py-2 font-mono text-[10px] text-secondary max-w-[72px] break-all">
                    {t.id.slice(0, 8)}…
                  </td>
                  <td className="px-4 py-2 text-xs text-secondary max-w-[120px] truncate">
                    {t.email ?? '—'}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{shortWallet(t.wallet_address, 8)}</td>
                  <td className="px-4 py-2 font-medium">{t.token_symbol}</td>
                  <td className="px-4 py-2">{t.direction}</td>
                  <td className="px-4 py-2">{t.leverage != null ? `${t.leverage}x` : '—'}</td>
                  <td className="px-4 py-2 font-mono text-xs">
                    {t.entry_price != null ? fmtUsd(t.entry_price) : '—'}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">
                    {t.exit_price != null ? fmtUsd(t.exit_price) : '—'}
                  </td>
                  <td
                    className={`px-4 py-2 font-mono ${
                      (fill ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}
                  >
                    {fill != null ? fmtUsdTrade(fill, true) : '—'}
                  </td>
                  <td
                    className={`px-4 py-2 font-mono text-xs ${
                      snapMismatch ? 'text-amber-400' : 'text-secondary'
                    }`}
                  >
                    {snap != null ? fmtUsdTrade(snap, true) : '—'}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-green-400/90">
                    {t.platform_success_fee != null ? fmtUsd(t.platform_success_fee) : '—'}
                  </td>
                  <td className="px-4 py-2 text-xs uppercase whitespace-nowrap">
                    {t.platform_fee_status === 'settled' ? (
                      <span className="text-green-400">settled</span>
                    ) : t.platform_fee_status === 'accrued' ? (
                      <span className="text-amber-400">accrued</span>
                    ) : t.platform_fee_status === 'waived' ? (
                      <span className="text-secondary">waived</span>
                    ) : t.platform_fee_status === 'pending_fill' ? (
                      <span className="text-cyan-400">pending_fill</span>
                    ) : (
                      <span className="text-secondary">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs text-secondary whitespace-pre-wrap break-words max-w-md">
                    {t.close_reason ?? '—'}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </TableShell>
    </div>
  );
}

function EventsPanel({ rows }: { rows: AdminHlDashboard['recent_events'] }) {
  const [page, setPage] = useState(0);
  const { pageRows, totalPages, safePage, total } = useMemo(
    () => paginate(rows, page),
    [rows, page]
  );

  return (
    <TableShell
      title={`Notifications (${total})`}
      subtitle="user_trade_notifications · email queue"
      scrollable
      pagination={{
        page: safePage,
        totalPages,
        total,
        onPageChange: setPage,
      }}
    >
      <thead>
        <tr className="text-left text-secondary text-xs">
          <th className="px-4 py-3">When</th>
          <th className="px-4 py-3">Kind</th>
          <th className="px-4 py-3">Headline</th>
          <th className="px-4 py-3">User</th>
          <th className="px-4 py-3">P/L</th>
          <th className="px-4 py-3">Email</th>
          <th className="px-4 py-3">Read</th>
        </tr>
      </thead>
      <tbody>
        {pageRows.map((n) => (
          <tr key={n.id} className="border-t border-border text-sm hover:bg-black/[0.03]">
            <td className="px-4 py-2 text-secondary text-xs">{formatTimeAgo(n.closed_at)}</td>
            <td className="px-4 py-2 text-xs uppercase text-cyan-400">{n.kind}</td>
            <td className="px-4 py-2 max-w-xs truncate">{n.headline}</td>
            <td className="px-4 py-2 text-xs text-secondary truncate max-w-[140px]">{n.email ?? shortWallet(n.wallet_address)}</td>
            <td className={`px-4 py-2 font-mono ${n.profit_loss >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {fmtUsdTrade(n.profit_loss, true)}
            </td>
            <td className="px-4 py-2 text-xs">{n.email_sent_at ? 'sent' : 'pending'}</td>
            <td className="px-4 py-2 text-xs">{n.read_at ? 'yes' : 'no'}</td>
          </tr>
        ))}
      </tbody>
    </TableShell>
  );
}

function FeesPanel({
  ledger,
  walletFees,
  stats,
  builder,
}: {
  ledger: AdminHlDashboard['fee_ledger'];
  walletFees: AdminWalletFee[];
  stats: AdminHlDashboard['stats'];
  builder: AdminLiveContext['builder'];
}) {
  const [ledgerPage, setLedgerPage] = useState(0);
  const [walletPage, setWalletPage] = useState(0);
  const ledgerPaginated = useMemo(
    () => paginate(ledger, ledgerPage),
    [ledger, ledgerPage]
  );
  const walletPaginated = useMemo(
    () => paginate(walletFees, walletPage),
    [walletFees, walletPage]
  );
  const builderAddr = builder?.builderAddress ?? '—';
  const owedTotal = stats.platform_fees_owed_usd ?? stats.hl_fees_accrued_usd;
  const paidTotal = stats.platform_fees_paid_usd ?? 0;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card-dark p-4 text-sm">
        <p className="text-primary font-medium">Platform success fees & HL builder fees</p>
        <p className="text-secondary mt-1">
          Success fees accrue on profitable closes; users pay owed fees before new opens when win
          count exceeds threshold. HL builder fees (opt-in) settle to{' '}
          <span className="font-mono text-xs break-all">{builderAddr}</span>.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Kpi label="Fees owed (platform)" value={fmtUsd(owedTotal)} sub="unpaid accrued" />
        <Kpi label="Fees paid" value={fmtUsd(paidTotal)} sub="user payments recorded" />
        <Kpi label="HL builder accrued" value={fmtUsd(stats.hl_fees_accrued_usd)} sub="missing HL settlement" />
        <Kpi
          label="HL builder settled"
          value={fmtUsd(stats.hl_fees_settled_usd)}
          sub={builder?.ready ? `wallet ${fmtUsd(builder.accountUsd)}` : 'builder underfunded'}
        />
      </div>
      <TableShell
        title={`Per-wallet fees (${walletPaginated.total})`}
        subtitle="owed vs paid · opens blocked when owed + win threshold"
        scrollable
        pagination={{
          page: walletPaginated.safePage,
          totalPages: walletPaginated.totalPages,
          total: walletPaginated.total,
          onPageChange: setWalletPage,
        }}
      >
        <thead>
          <tr className="text-left text-secondary text-xs">
            <th className="px-4 py-3">Wallet</th>
            <th className="px-4 py-3">User</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Owed</th>
            <th className="px-4 py-3">Paid</th>
            <th className="px-4 py-3">Accrued</th>
            <th className="px-4 py-3">Settled (HL)</th>
            <th className="px-4 py-3">Wins</th>
            <th className="px-4 py-3">Opens blocked</th>
          </tr>
        </thead>
        <tbody>
          {walletPaginated.pageRows.map((w) => (
            <tr key={w.wallet_address} className="border-t border-border text-sm hover:bg-black/[0.03]">
              <td className="px-4 py-2 font-mono text-xs">{shortWallet(w.wallet_address, 8)}</td>
              <td className="px-4 py-2 text-xs text-secondary max-w-[140px] truncate">{w.email ?? '—'}</td>
              <td className="px-4 py-2">
                <FeeStatusPill status={w.fee_payment_status} />
              </td>
              <td className="px-4 py-2 font-mono text-amber-400">
                {w.fees_owed_usd > 0 ? fmtUsd(w.fees_owed_usd) : '—'}
              </td>
              <td className="px-4 py-2 font-mono text-green-400">
                {w.fees_paid_usd > 0 ? fmtUsd(w.fees_paid_usd) : '—'}
              </td>
              <td className="px-4 py-2 font-mono">{fmtUsd(w.fees_accrued_usd)}</td>
              <td className="px-4 py-2 font-mono text-secondary">{fmtUsd(w.fees_settled_usd)}</td>
              <td className="px-4 py-2 text-xs">
                {w.fee_win_count}
                <span className="text-secondary"> / {w.wins_until_fee} left</span>
              </td>
              <td className="px-4 py-2">
                <StatusPill on={!w.fee_opens_blocked} onLabel="no" offLabel="BLOCKED" />
              </td>
            </tr>
          ))}
        </tbody>
      </TableShell>
      <TableShell
        title={`Fee ledger (${ledgerPaginated.total})`}
        subtitle="hl_fee_ledger · per-close fee rows"
        scrollable
        pagination={{
          page: ledgerPaginated.safePage,
          totalPages: ledgerPaginated.totalPages,
          total: ledgerPaginated.total,
          onPageChange: setLedgerPage,
        }}
      >
        <thead>
          <tr className="text-left text-secondary text-xs">
            <th className="px-4 py-3">When</th>
            <th className="px-4 py-3">User wallet</th>
            <th className="px-4 py-3">Coin</th>
            <th className="px-4 py-3">Realized</th>
            <th className="px-4 py-3">Signal uPnL</th>
            <th className="px-4 py-3">Builder fee</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Reason</th>
          </tr>
        </thead>
        <tbody>
          {ledgerPaginated.pageRows.map((f) => (
            <tr key={f.id} className="border-t border-border text-sm">
              <td className="px-4 py-2 text-xs text-secondary">{formatTimeAgo(f.created_at)}</td>
              <td className="px-4 py-2 font-mono text-xs">{shortWallet(f.wallet_address, 8)}</td>
              <td className="px-4 py-2">{f.coin}</td>
              <td
                className={`px-4 py-2 font-mono ${
                  f.gross_profit_usd >= 0 ? 'text-green-400' : 'text-red-400'
                }`}
              >
                {fmtUsdTrade(f.gross_profit_usd, true)}
              </td>
              <td className="px-4 py-2 font-mono text-secondary">
                {f.snapshot_pnl_usd != null ? fmtUsdTrade(f.snapshot_pnl_usd, true) : '—'}
              </td>
              <td className="px-4 py-2 font-mono text-cyan-400">{fmtUsd(f.success_fee_usd)}</td>
              <td className="px-4 py-2 text-xs uppercase">
                {f.status === 'settled' ? (
                  <span className="text-green-400">settled → builder</span>
                ) : (
                  <span className="text-amber-400">{f.status}</span>
                )}
              </td>
              <td className="px-4 py-2 text-xs text-secondary max-w-[140px] truncate">
                {f.close_reason ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </TableShell>
    </div>
  );
}

function BettingPanel({
  positions,
  closes,
}: {
  positions: AdminHlDashboard['betting_positions'];
  closes: AdminHlDashboard['betting_closes'];
}) {
  const [openPage, setOpenPage] = useState(0);
  const [closePage, setClosePage] = useState(0);
  const openPaginated = useMemo(() => paginate(positions, openPage), [positions, openPage]);
  const closePaginated = useMemo(() => paginate(closes, closePage), [closes, closePage]);

  return (
    <div className="space-y-6">
      <TableShell
        title={`Open bets (${openPaginated.total})`}
        subtitle="hl_betting_positions"
        scrollable
        pagination={{
          page: openPaginated.safePage,
          totalPages: openPaginated.totalPages,
          total: openPaginated.total,
          onPageChange: setOpenPage,
        }}
      >
        <thead>
          <tr className="text-left text-secondary text-xs">
            <th className="px-4 py-3">Market</th>
            <th className="px-4 py-3">Side</th>
            <th className="px-4 py-3">Size</th>
            <th className="px-4 py-3">Entry</th>
            <th className="px-4 py-3">Mark</th>
            <th className="px-4 py-3">uPnL</th>
          </tr>
        </thead>
        <tbody>
          {openPaginated.pageRows.map((p) => (
            <tr key={p.id} className="border-t border-border text-sm">
              <td className="px-4 py-2">{p.market_name}</td>
              <td className="px-4 py-2">{p.side_label}</td>
              <td className="px-4 py-2 font-mono">{p.size}</td>
              <td className="px-4 py-2 font-mono">{p.entry_px}</td>
              <td className="px-4 py-2 font-mono">{p.mark_px ?? '—'}</td>
              <td className={`px-4 py-2 font-mono ${(p.unrealized_pnl ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {p.unrealized_pnl != null ? fmtUsdTrade(p.unrealized_pnl, true) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </TableShell>
      <TableShell
        title={`Recent bet closes (${closePaginated.total})`}
        subtitle="hl_betting_closes"
        scrollable
        pagination={{
          page: closePaginated.safePage,
          totalPages: closePaginated.totalPages,
          total: closePaginated.total,
          onPageChange: setClosePage,
        }}
      >
        <thead>
          <tr className="text-left text-secondary text-xs">
            <th className="px-4 py-3">Closed</th>
            <th className="px-4 py-3">Market</th>
            <th className="px-4 py-3">Side</th>
            <th className="px-4 py-3">Realized</th>
          </tr>
        </thead>
        <tbody>
          {closePaginated.pageRows.map((c) => (
            <tr key={c.id} className="border-t border-border text-sm">
              <td className="px-4 py-2 text-xs text-secondary">{formatTimeAgo(c.closed_at)}</td>
              <td className="px-4 py-2">{c.market_name}</td>
              <td className="px-4 py-2">{c.side_label}</td>
              <td className={`px-4 py-2 font-mono ${c.realized_pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {fmtUsdTrade(c.realized_pnl, true)}
              </td>
            </tr>
          ))}
        </tbody>
      </TableShell>
    </div>
  );
}

function UsersPanel({
  rows,
  openPositions,
  onViewHistory,
}: {
  rows: AdminHlDashboard['users'];
  openPositions: AdminHlDashboard['open_positions'];
  onViewHistory: (wallet: string, email: string | null) => void;
}) {
  const [page, setPage] = useState(0);
  const positionsByWallet = useMemo(() => {
    const map = new Map<string, AdminHlDashboard['open_positions']>();
    for (const p of openPositions) {
      const key = p.wallet_address.toLowerCase();
      const list = map.get(key);
      if (list) list.push(p);
      else map.set(key, [p]);
    }
    return map;
  }, [openPositions]);

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const aOpen = a.open_positions_count ?? (a.wallet_address
        ? (positionsByWallet.get(a.wallet_address.toLowerCase())?.length ?? 0)
        : 0);
      const bOpen = b.open_positions_count ?? (b.wallet_address
        ? (positionsByWallet.get(b.wallet_address.toLowerCase())?.length ?? 0)
        : 0);
      return bOpen - aOpen || (a.email ?? '').localeCompare(b.email ?? '');
    });
  }, [rows, positionsByWallet]);

  const { pageRows, totalPages, safePage, total } = useMemo(
    () => paginate(sortedRows, page),
    [sortedRows, page]
  );

  return (
    <TableShell
      title={`Users (${total})`}
      subtitle="profiles · closed P/L · fees · open positions"
      scrollable
      pagination={{
        page: safePage,
        totalPages,
        total,
        onPageChange: setPage,
      }}
    >
      <thead>
        <tr className="text-left text-secondary text-xs">
          <th className="px-4 py-3">Email</th>
          <th className="px-4 py-3">Username</th>
          <th className="px-4 py-3">Name</th>
          <th className="px-4 py-3">Wallet</th>
          <th className="px-4 py-3">Country</th>
          <th className="px-4 py-3">Tier</th>
          <th className="px-4 py-3">Closed P/L</th>
          <th className="px-4 py-3">Trades</th>
          <th className="px-4 py-3">Open</th>
          <th className="px-4 py-3">Open uPnL</th>
          <th className="px-4 py-3">Fees owed</th>
          <th className="px-4 py-3">Fees paid</th>
          <th className="px-4 py-3">Fee cycle</th>
          <th className="px-4 py-3">Joined</th>
          <th className="px-4 py-3">Actions</th>
        </tr>
      </thead>
      <tbody>
        {pageRows.map((u) => {
          const walletKey = u.wallet_address?.toLowerCase() ?? '';
          const positions = walletKey ? positionsByWallet.get(walletKey) ?? [] : [];
          const openCount = u.open_positions_count ?? positions.length;
          const openUpnl = positions.reduce((sum, p) => sum + (p.profit_loss ?? 0), 0);
          const closedPnl = u.closed_pnl_total ?? 0;
          const feesOwed = u.fees_accrued_usd ?? 0;
          const feesPaid = u.fees_paid_usd ?? 0;
          const winsUntil = u.wins_until_fee ?? 20;
          const feeWins = u.fee_win_count ?? 0;

          return (
            <tr key={u.id} className="border-t border-border text-sm hover:bg-black/[0.03] align-top">
              <td className="px-4 py-2 text-xs max-w-[160px] truncate">{u.email ?? '—'}</td>
              <td className="px-4 py-2 text-xs">{u.username ? `@${u.username}` : '—'}</td>
              <td className="px-4 py-2 text-xs max-w-[120px] truncate">{u.full_name ?? '—'}</td>
              <td className="px-4 py-2 font-mono text-[10px] break-all max-w-[120px]">
                {u.wallet_address ? shortWallet(u.wallet_address, 8) : '—'}
              </td>
              <td className="px-4 py-2 text-xs">{u.country ?? '—'}</td>
              <td className="px-4 py-2 text-xs">{u.membership_tier ?? 'free'}</td>
              <td
                className={`px-4 py-2 font-mono text-xs ${
                  closedPnl >= 0 ? 'text-green-400' : 'text-red-400'
                }`}
              >
                {fmtUsdTrade(closedPnl, true)}
              </td>
              <td className="px-4 py-2 text-xs">{u.closed_trades_count ?? 0}</td>
              <td className="px-4 py-2 text-xs">
                {openCount === 0 ? (
                  '—'
                ) : (
                  <span className="font-medium">
                    {positions.length > 0
                      ? positions.map((p) => `${p.token_symbol} ${p.direction}`).join(' · ')
                      : openCount}
                  </span>
                )}
              </td>
              <td
                className={`px-4 py-2 font-mono text-xs ${
                  openUpnl >= 0 ? 'text-green-400' : 'text-red-400'
                }`}
              >
                {openCount > 0 ? fmtUsdTrade(openUpnl, true) : '—'}
              </td>
              <td className="px-4 py-2 font-mono text-xs">
                {feesOwed > 0 ? (
                  <span className="text-amber-400">{fmtUsd(feesOwed)} pending</span>
                ) : (
                  <span className="text-secondary">—</span>
                )}
              </td>
              <td className="px-4 py-2 font-mono text-xs text-green-400/90">
                {feesPaid > 0 ? fmtUsd(feesPaid) : '—'}
              </td>
              <td className="px-4 py-2 text-xs">
                <span className="text-secondary">{feeWins} wins</span>
                <span className="block text-[10px] text-secondary">{winsUntil} until block</span>
              </td>
              <td className="px-4 py-2 text-secondary text-xs whitespace-nowrap">
                {formatTimeAgo(u.created_at)}
              </td>
              <td className="px-4 py-2">
                {u.wallet_address ? (
                  <button
                    type="button"
                    className="text-xs text-cyan-400 hover:underline whitespace-nowrap"
                    onClick={() => onViewHistory(u.wallet_address!, u.email)}
                  >
                    History
                  </button>
                ) : (
                  '—'
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </TableShell>
  );
}

function SubsPanel({ rows }: { rows: AdminHlDashboard['subscriptions'] }) {
  const [page, setPage] = useState(0);
  const { pageRows, totalPages, safePage, total } = useMemo(
    () => paginate(rows, page),
    [rows, page]
  );

  return (
    <TableShell
      title={`Subscriptions (${total})`}
      scrollable
      pagination={{
        page: safePage,
        totalPages,
        total,
        onPageChange: setPage,
      }}
    >
      <thead>
        <tr className="text-left text-secondary text-xs">
          <th className="px-4 py-3">Wallet</th>
          <th className="px-4 py-3">Plan</th>
          <th className="px-4 py-3">Status</th>
          <th className="px-4 py-3">Billing</th>
          <th className="px-4 py-3">Expires</th>
        </tr>
      </thead>
      <tbody>
        {pageRows.map((s) => (
          <tr key={s.id} className="border-t border-border text-sm">
            <td className="px-4 py-2 font-mono text-xs">{shortWallet(s.wallet_address, 8)}</td>
            <td className="px-4 py-3 uppercase text-xs">{s.plan_tier}</td>
            <td className="px-4 py-2 text-xs">{s.status}</td>
            <td className="px-4 py-2 text-xs">{s.billing_cycle}</td>
            <td className="px-4 py-2 text-secondary text-xs">{formatTimeAgo(s.end_date)}</td>
          </tr>
        ))}
      </tbody>
    </TableShell>
  );
}

function Kpi({
  label,
  value,
  sub,
  positive,
}: {
  label: string;
  value: string;
  sub?: string;
  positive?: boolean;
}) {
  return (
    <div className="bg-card-dark rounded-xl border border-border p-4">
      <p className="text-xs text-secondary uppercase tracking-wide">{label}</p>
      <p
        className={`text-xl font-bold mt-1 ${
          positive === undefined ? 'text-primary' : positive ? 'text-green-400' : 'text-red-400'
        }`}
      >
        {value}
      </p>
      {sub && <p className="text-[11px] text-secondary mt-1">{sub}</p>}
    </div>
  );
}

function FeeStatusPill({ status }: { status: AdminWalletFee['fee_payment_status'] }) {
  const styles =
    status === 'paid'
      ? 'bg-green-500/20 text-green-400'
      : status === 'owed'
        ? 'bg-amber-500/20 text-amber-400'
        : 'bg-gray-500/20 text-secondary';
  return (
    <span className={`text-[10px] uppercase px-2 py-0.5 rounded-full font-medium ${styles}`}>
      {status}
    </span>
  );
}

function StatusPill({ on, onLabel, offLabel }: { on: boolean; onLabel: string; offLabel: string }) {
  return (
    <span
      className={`text-[10px] uppercase px-2 py-0.5 rounded-full font-medium ${
        on ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-secondary'
      }`}
    >
      {on ? onLabel : offLabel}
    </span>
  );
}

function PaginationBar({ page, totalPages, total, onPageChange }: PaginationProps) {
  const start = total === 0 ? 0 : page * ADMIN_PAGE_SIZE + 1;
  const end = Math.min(total, (page + 1) * ADMIN_PAGE_SIZE);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-border bg-black/20 text-xs text-secondary">
      <span>
        Showing {start}–{end} of {total}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page <= 0}
          onClick={() => onPageChange(page - 1)}
          className="px-3 py-1.5 rounded-md border border-border disabled:opacity-40 hover:bg-white/5"
        >
          Previous
        </button>
        <span className="text-primary font-medium">
          Page {page + 1} / {totalPages}
        </span>
        <button
          type="button"
          disabled={page >= totalPages - 1}
          onClick={() => onPageChange(page + 1)}
          className="px-3 py-1.5 rounded-md border border-border disabled:opacity-40 hover:bg-white/5"
        >
          Next
        </button>
      </div>
    </div>
  );
}

function TableShell({
  title,
  subtitle,
  scrollable = false,
  headerRight,
  pagination,
  children,
}: {
  title: string;
  subtitle?: string;
  scrollable?: boolean;
  headerRight?: React.ReactNode;
  pagination?: PaginationProps;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`bg-card-dark rounded-xl border border-border overflow-hidden flex flex-col min-w-0 ${
        scrollable ? 'h-[min(62dvh,680px)]' : ''
      }`}
    >
      <div className="px-4 py-3 border-b border-border flex items-start justify-between gap-3 shrink-0 min-w-0">
        <div className="min-w-0">
          <h3 className="font-semibold text-primary">{title}</h3>
          {subtitle && <p className="text-xs text-secondary mt-0.5">{subtitle}</p>}
        </div>
        {headerRight}
      </div>
      <div
        className={
          scrollable
            ? 'admin-monitor-table-scroll flex-1 min-h-0 min-w-0'
            : 'overflow-x-auto flex-1 min-h-0 min-w-0'
        }
      >
        <table className="w-full min-w-max">{children}</table>
      </div>
      {pagination ? <PaginationBar {...pagination} /> : null}
    </div>
  );
}

export default AdminMonitorPage;
