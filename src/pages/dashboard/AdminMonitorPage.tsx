import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Activity,
  Bell,
  Bot,
  Coins,
  CreditCard,
  Crosshair,
  DollarSign,
  ExternalLink,
  Flag,
  MessageCircle,
  PauseCircle,
  RefreshCw,
  Server,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { isAdminEmail } from '../../lib/admin';
import { recordAdminPathProbe } from '../../lib/authLockout';
import AdminMfaGate from '../../components/admin/AdminMfaGate';
import { adminReconcilePlatformFee } from '../../lib/platformFeesApi';
import {
  fetchAdminHlDashboard,
  fetchAdminHlTradeHistory,
  fetchAdminLiveContext,
  fetchAdminWalletFeeAudit,
  fmtUsd,
  fmtUsdTrade,
  formatTimeAgo,
  shortWallet,
  type AdminHlDashboard,
  type AdminLiveContext,
  type AdminTradeClose,
  type AdminTradeHistoryUserStats,
  type AdminWalletFee,
  type AdminWalletFeeAudit,
} from '../../lib/adminDashboard';
import { fmtPrice, fmtSize } from '../../lib/hyperliquid/format';
import {
  fetchHlBotTrailSnapshots,
  type HlBotTrailSnapshot,
} from '../../lib/hlBotTrailStatus';
import { countAdminPositionsByCoin } from '../../lib/adminHlLivePositions';
import AdminAffiliateOps from '../../components/admin/AdminAffiliateOps';
import AdminTwitterSocial from '../../components/admin/AdminTwitterSocial';
import AdminForceOpenPanel from '../../components/admin/AdminForceOpenPanel';
import AdminLetRunPanel from '../../components/admin/AdminLetRunPanel';
import { BotTradeDiagnosisPanel } from '../../components/admin/BotTradeDiagnosisPanel';
import {
  fetchAdminSupportRequests,
  resolveSupportRequest,
  reopenSupportRequest,
  type SupportRequestRow,
} from '../../lib/adminSupportRequests';
import {
  fetchSupportMessages,
  sendSupportChatReply,
  subscribeSupportMessages,
  type SupportMessageRow,
} from '../../lib/supportChat';
import {
  fetchAdminCommunityReports,
  hideCommunityComment,
  hideCommunityPost,
  updateCommunityReportStatus,
  type CommunityReportRow,
} from '../../lib/adminCommunityReports';
import {
  fetchRecentProfileSignups,
  type RecentSignupRow,
} from '../../lib/adminNotifications';

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
  | 'affiliate'
  | 'twitter'
  | 'forceopen'
  | 'letrun';

const SECTIONS: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <Activity size={16} /> },
  { id: 'bots', label: 'HL bots', icon: <Bot size={16} /> },
  { id: 'letrun', label: 'Let run', icon: <PauseCircle size={16} /> },
  { id: 'forceopen', label: 'Force open', icon: <Crosshair size={16} /> },
  { id: 'positions', label: 'Open', icon: <Zap size={16} /> },
  { id: 'trades', label: 'History', icon: <TrendingUp size={16} /> },
  { id: 'events', label: 'Events', icon: <Bell size={16} /> },
  { id: 'fees', label: 'Fees', icon: <Coins size={16} /> },
  { id: 'betting', label: 'Betting', icon: <DollarSign size={16} /> },
  { id: 'users', label: 'Users', icon: <Users size={16} /> },
  { id: 'subscriptions', label: 'Plans', icon: <CreditCard size={16} /> },
  { id: 'affiliate', label: 'Affiliate', icon: <Users size={16} /> },
  { id: 'twitter', label: 'X / Twitter', icon: <MessageCircle size={16} /> },
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
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [mfaOk, setMfaOk] = useState(false);
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

  const refresh = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
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
      if (user?.email && isAdminEmail(user.email)) {
        setEmail(user.email);
        setIsAdmin(true);
        return;
      }
      setIsAdmin(false);
      void recordAdminPathProbe();
      navigate('/', { replace: true });
    })();
  }, [navigate]);

  useEffect(() => {
    if (!isAdmin || !mfaOk) return;
    void refresh();
    const poll = setInterval(() => void refresh({ silent: true }), 60_000);
    return () => clearInterval(poll);
  }, [isAdmin, mfaOk, refresh]);

  useEffect(() => {
    if (!isAdmin || !mfaOk) return;
    const channel = supabase
      .channel('admin-trade-events')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'user_trade_notifications' },
        () => {
          void refresh({ silent: true });
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'admin_notifications' },
        () => {
          void refresh({ silent: true });
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isAdmin, mfaOk, refresh]);

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
    return null;
  }

  if (!mfaOk && email) {
    return <AdminMfaGate email={email} onVerified={() => setMfaOk(true)} />;
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
        <OverviewPanel stats={stats} live={live} events={mergedEvents} refreshAt={lastRefresh} />
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
          onRefresh={refresh}
        />
      )}
      {section === 'betting' && dash && (
        <BettingPanel positions={dash.betting_positions} closes={dash.betting_closes} />
      )}
      {section === 'users' && dash && (
        <div className="space-y-4">
          <NewSignupsCard refreshAt={lastRefresh} />
          <UsersPanel
            rows={dash.users}
            openPositions={dash.open_positions}
            onViewHistory={(wallet, email) => {
              setHistoryFilter({ wallet, email: email ?? undefined });
              setSection('trades');
            }}
          />
        </div>
      )}
      {section === 'subscriptions' && dash && <SubsPanel rows={dash.subscriptions} />}
      {section === 'affiliate' && <AdminAffiliateOps />}
      {section === 'twitter' && <AdminTwitterSocial />}
      {section === 'letrun' && <AdminLetRunPanel />}
      {section === 'forceopen' && <AdminForceOpenPanel />}

      {!dash &&
        !loading &&
        section !== 'affiliate' &&
        section !== 'twitter' &&
        section !== 'letrun' &&
        section !== 'forceopen' && (
        <p className="text-secondary text-sm py-8 text-center">No dashboard data yet.</p>
      )}
    </div>
  );
};

function OverviewPanel({
  stats,
  live,
  events,
  refreshAt,
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
  refreshAt: Date;
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
          sub={`HL bot closes · ${stats.closed_trades_24h} in 24h · all-time ${fmtUsd(stats.total_pnl, true)}`}
          positive={stats.pnl_24h >= 0}
        />
        <Kpi
          label="Loss closes 24h"
          value={String(stats.loss_closes_24h ?? 0)}
          sub={fmtUsd(stats.loss_pnl_24h ?? 0, true)}
          positive={(stats.loss_pnl_24h ?? 0) >= 0}
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
        <SupportRequestsCard refreshAt={refreshAt} />
      </div>

      <CommunityReportsCard refreshAt={refreshAt} />

      <NewSignupsCard refreshAt={refreshAt} />

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
      {svc?.walletStatus && svc.walletStatus.length > 0 ? (
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-xs text-secondary mb-2">
            Live per-wallet gates (Railway) — same signal, individual blockers
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-secondary">
                  <th className="py-1 pr-2">Wallet</th>
                  <th className="py-1 pr-2">Opens?</th>
                  <th className="py-1 pr-2">Equity</th>
                  <th className="py-1 pr-2">Open</th>
                  <th className="py-1">Blocking</th>
                </tr>
              </thead>
              <tbody>
                {svc.walletStatus.map((w) => (
                  <tr key={w.wallet} className="border-t border-border/50">
                    <td className="py-1 pr-2 font-mono">{shortWallet(w.wallet, 6)}</td>
                    <td className={`py-1 pr-2 ${w.wouldProcessOpens ? 'text-green-400' : 'text-red-400'}`}>
                      {w.wouldProcessOpens ? 'YES' : 'NO'}
                    </td>
                    <td className="py-1 pr-2 font-mono">
                      {w.equityUsd != null ? fmtUsd(w.equityUsd, true) : '—'}
                    </td>
                    <td className="py-1 pr-2 font-mono">{w.openCoins.join(', ') || '—'}</td>
                    <td className="py-1 text-amber-400/90">{w.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
      {health?.lastCycle && (
        <pre className="mt-3 text-[10px] text-secondary bg-black/20 rounded p-2 overflow-x-auto max-h-24">
          {JSON.stringify(health.lastCycle, null, 0)}
        </pre>
      )}
    </div>
  );
}

function NewSignupsCard({ refreshAt }: { refreshAt: Date }) {
  const [rows, setRows] = useState<RecentSignupRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const WITHIN_HOURS = 24;

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      // Source of truth: profiles.created_at — not stale admin_notifications.
      const recent = await fetchRecentProfileSignups(WITHIN_HOURS, 100);
      const cutoff = Date.now() - WITHIN_HOURS * 60 * 60 * 1000;
      setRows(
        recent.filter((r) => {
          const t = Date.parse(r.created_at);
          return Number.isFinite(t) && t >= cutoff;
        })
      );
    } catch (err) {
      console.error(err);
      setLoadError('Could not load signups from profiles');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshAt]);

  // Rolling 24h: drop rows that age out even if the list wasn't re-fetched.
  useEffect(() => {
    const id = window.setInterval(() => {
      const cutoff = Date.now() - WITHIN_HOURS * 60 * 60 * 1000;
      setRows((prev) =>
        prev.filter((r) => {
          const t = Date.parse(r.created_at);
          return Number.isFinite(t) && t >= cutoff;
        })
      );
      void load();
    }, 60_000);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel('admin-signup-profiles')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'profiles' },
        (payload) => {
          const row = payload.new as RecentSignupRow;
          if (!row?.id || !row.created_at) return;
          const t = Date.parse(row.created_at);
          if (!Number.isFinite(t) || Date.now() - t > WITHIN_HOURS * 60 * 60 * 1000) return;
          setRows((prev) => [row, ...prev.filter((r) => r.id !== row.id)].slice(0, 100));
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="bg-card-dark rounded-xl border border-border overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex flex-wrap items-center gap-2">
        <Users size={18} className="text-emerald-400" />
        <h3 className="font-semibold text-primary">New registrations</h3>
        {rows.length > 0 && (
          <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
            {rows.length} in 24h
          </span>
        )}
        <span className="text-xs text-secondary ml-auto">profiles · last 24h · auto-refresh</span>
        <button
          type="button"
          onClick={() => void load()}
          className="text-xs px-2 py-1 rounded-md border border-border text-secondary hover:text-primary inline-flex items-center gap-1"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>
      {loadError && (
        <p className="px-4 py-2 text-amber-500 text-xs border-b border-border">{loadError}</p>
      )}
      <div className="divide-y divide-border max-h-[320px] overflow-y-auto">
        {loading && rows.length === 0 ? (
          <p className="p-6 text-secondary text-sm text-center flex items-center justify-center gap-2">
            <RefreshCw size={14} className="animate-spin" /> Loading…
          </p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-secondary text-sm text-center">No new registrations in the last 24h</p>
        ) : (
          rows.map((r) => (
            <div
              key={r.id}
              className="px-4 py-3 flex flex-wrap gap-x-4 gap-y-1 text-sm bg-emerald-500/[0.04]"
            >
              <span className="text-secondary whitespace-nowrap min-w-[7.5rem]">
                <span className="block text-primary/90 text-xs">
                  {formatSignupAt(r.created_at)}
                </span>
                <span className="block text-[10px] opacity-70">{formatTimeAgo(r.created_at)}</span>
              </span>
              <span className="text-primary font-medium min-w-[160px]">{r.email ?? '—'}</span>
              {r.username ? <span className="text-xs text-cyan-400">@{r.username}</span> : null}
              {r.full_name ? <span className="text-xs text-secondary">{r.full_name}</span> : null}
              {r.wallet_address ? (
                <span className="text-[10px] font-mono text-secondary ml-auto">
                  {shortWallet(r.wallet_address, 6)}
                </span>
              ) : (
                <span className="text-[10px] text-secondary ml-auto">no wallet yet</span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function SupportRequestsCard({ refreshAt }: { refreshAt: Date }) {
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const [rows, setRows] = useState<SupportRequestRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessageRow[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [reply, setReply] = useState('');
  const [replyBusy, setReplyBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const result = await fetchAdminSupportRequests({ status: filter, limit: 50 });
    if (result.error) {
      setLoadError(result.error);
      setRows([]);
    } else {
      setRows(result.rows);
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load, refreshAt]);

  const loadMessages = useCallback(async (requestId: string) => {
    setMessagesLoading(true);
    const result = await fetchSupportMessages(requestId);
    if (result.error) {
      setLoadError(result.error);
      setMessages([]);
    } else {
      setMessages(result.rows);
    }
    setMessagesLoading(false);
  }, []);

  useEffect(() => {
    if (!expandedId) {
      setMessages([]);
      setReply('');
      return;
    }
    void loadMessages(expandedId);
    const unsub = subscribeSupportMessages(expandedId, (row) => {
      setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
    });
    return unsub;
  }, [expandedId, loadMessages]);

  const openCount = rows.filter((r) => r.status === 'open').length;

  const handleResolve = async (id: string) => {
    setBusyId(id);
    const result = await resolveSupportRequest(id);
    if (!result.ok) {
      setLoadError(result.error ?? 'Could not resolve');
    } else {
      await load();
    }
    setBusyId(null);
  };

  const handleReopen = async (id: string) => {
    setBusyId(id);
    const result = await reopenSupportRequest(id);
    if (!result.ok) {
      setLoadError(result.error ?? 'Could not reopen');
    } else {
      await load();
    }
    setBusyId(null);
  };

  const handleReply = async (requestId: string) => {
    const text = reply.trim();
    if (!text) return;
    setReplyBusy(true);
    const result = await sendSupportChatReply(requestId, text, 'admin');
    setReplyBusy(false);
    if (result.error) {
      setLoadError(result.error);
      return;
    }
    if (result.row) {
      setMessages((prev) =>
        prev.some((m) => m.id === result.row!.id) ? prev : [...prev, result.row!]
      );
    }
    setReply('');
    await load();
  };

  return (
    <div className="rounded-xl border border-border bg-card-dark p-5">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <MessageCircle size={20} className="text-cyan-400" />
        <h3 className="font-semibold text-primary">Live support chat</h3>
        <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400">
          {filter === 'open' ? `${openCount} open` : `${rows.length} shown`}
        </span>
      </div>
      <p className="text-xs text-secondary mb-3">
        In-app Help Center chat — open a ticket to see the thread and full user profile.
      </p>

      <div className="flex gap-2 mb-3">
        <button
          type="button"
          className={`text-xs px-2.5 py-1 rounded-md border ${
            filter === 'open'
              ? 'border-cyan-500/50 text-cyan-400 bg-cyan-500/10'
              : 'border-border text-secondary'
          }`}
          onClick={() => setFilter('open')}
        >
          Open
        </button>
        <button
          type="button"
          className={`text-xs px-2.5 py-1 rounded-md border ${
            filter === 'all'
              ? 'border-cyan-500/50 text-cyan-400 bg-cyan-500/10'
              : 'border-border text-secondary'
          }`}
          onClick={() => setFilter('all')}
        >
          All
        </button>
      </div>

      {loadError ? (
        <p className="text-xs text-amber-400 mb-2" role="alert">
          {loadError}
          {loadError.includes('support_') ? (
            <span> — run Supabase migration for support live chat.</span>
          ) : null}
        </p>
      ) : null}

      <div className="max-h-[520px] overflow-y-auto divide-y divide-border -mx-1">
        {loading ? (
          <p className="text-sm text-secondary py-6 text-center">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-secondary py-6 text-center">
            {filter === 'open' ? 'No open support chats.' : 'No support chats yet.'}
          </p>
        ) : (
          rows.map((row) => {
            const expanded = expandedId === row.id;
            const userLabel =
              row.user_email ||
              row.user_username ||
              row.user_full_name ||
              shortWallet(row.wallet_address ?? '', 6);
            return (
              <div key={row.id} className="py-3 px-1 text-sm">
                <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
                  <span className="text-secondary text-xs whitespace-nowrap w-16 shrink-0">
                    {formatTimeAgo(row.created_at)}
                  </span>
                  <div className="flex-1 min-w-[180px]">
                    <p className="font-medium text-primary">{row.subject}</p>
                    <p className="text-xs text-secondary mt-0.5">
                      {userLabel}
                      {row.channel ? ` · ${row.channel}` : ''}
                    </p>
                  </div>
                  <span
                    className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${
                      row.status === 'open'
                        ? 'bg-amber-500/15 text-amber-400'
                        : 'bg-green-500/15 text-green-400'
                    }`}
                  >
                    {row.status}
                  </span>
                </div>
                <button
                  type="button"
                  className="text-xs text-cyan-400 mt-1 hover:underline"
                  onClick={() => setExpandedId(expanded ? null : row.id)}
                >
                  {expanded ? 'Hide chat' : 'Open chat + profile'}
                </button>
                {!expanded ? (
                  <p className="mt-1 text-xs text-secondary line-clamp-2">{row.message}</p>
                ) : (
                  <div className="mt-2 grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(200px,0.8fr)]">
                    <div className="rounded-lg border border-border bg-black/20 p-2">
                      <div className="max-h-[240px] overflow-y-auto space-y-2 mb-2">
                        {messagesLoading ? (
                          <p className="text-xs text-secondary py-4 text-center">Loading thread…</p>
                        ) : messages.length === 0 ? (
                          <p className="text-xs text-secondary whitespace-pre-wrap">{row.message}</p>
                        ) : (
                          messages.map((m) => (
                            <div
                              key={m.id}
                              className={`rounded-md px-2 py-1.5 text-xs ${
                                m.sender_role === 'admin'
                                  ? 'bg-cyan-500/10 border border-cyan-500/20'
                                  : 'bg-black/25 border border-border'
                              }`}
                            >
                              <p className="text-[10px] uppercase tracking-wide text-secondary mb-0.5">
                                {m.sender_role === 'admin' ? 'Support' : 'User'} ·{' '}
                                {formatTimeAgo(m.created_at)}
                              </p>
                              <p className="text-primary/90 whitespace-pre-wrap">{m.body}</p>
                            </div>
                          ))
                        )}
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={reply}
                          onChange={(e) => setReply(e.target.value)}
                          placeholder="Reply in live chat…"
                          className="flex-1 text-xs rounded-md border border-border bg-black/30 px-2 py-1.5 text-primary"
                          disabled={replyBusy}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              void handleReply(row.id);
                            }
                          }}
                        />
                        <button
                          type="button"
                          disabled={replyBusy || !reply.trim()}
                          className="text-xs px-2.5 py-1 rounded-md bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 disabled:opacity-50"
                          onClick={() => void handleReply(row.id)}
                        >
                          {replyBusy ? '…' : 'Send'}
                        </button>
                      </div>
                    </div>
                    <div className="rounded-lg border border-border bg-black/20 p-2 text-xs space-y-1.5">
                      <p className="font-semibold text-primary">User profile</p>
                      <p className="text-secondary">
                        Name:{' '}
                        <span className="text-primary">{row.user_full_name || '—'}</span>
                      </p>
                      <p className="text-secondary">
                        Email:{' '}
                        <span className="text-primary break-all">{row.user_email || '—'}</span>
                      </p>
                      <p className="text-secondary">
                        Username:{' '}
                        <span className="text-primary">
                          {row.user_username ? `@${row.user_username}` : '—'}
                        </span>
                      </p>
                      <p className="text-secondary">
                        Wallet:{' '}
                        <span className="text-primary font-mono break-all">
                          {row.wallet_address || '—'}
                        </span>
                      </p>
                      <p className="text-secondary">
                        User ID:{' '}
                        <span className="text-primary font-mono break-all">{row.user_id}</span>
                      </p>
                    </div>
                  </div>
                )}
                <div className="mt-2 flex gap-2">
                  {row.status === 'open' ? (
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      className="text-xs px-2.5 py-1 rounded-md bg-green-500/15 text-green-400 border border-green-500/30 disabled:opacity-50"
                      onClick={() => void handleResolve(row.id)}
                    >
                      {busyId === row.id ? '…' : 'Mark resolved'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      className="text-xs px-2.5 py-1 rounded-md border border-border text-secondary disabled:opacity-50"
                      onClick={() => void handleReopen(row.id)}
                    >
                      Reopen
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function CommunityReportsCard({ refreshAt }: { refreshAt: Date }) {
  const [rows, setRows] = useState<CommunityReportRow[]>([]);
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const result = await fetchAdminCommunityReports({
      status: filter === 'open' ? 'open' : 'all',
      limit: 50,
    });
    if (result.error) {
      setLoadError(result.error);
      setRows([]);
    } else {
      setRows(result.rows);
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load, refreshAt]);

  const openCount = rows.filter((r) => r.status === 'open').length;

  const setStatus = async (id: string, status: 'reviewed' | 'dismissed' | 'actioned') => {
    setBusyId(id);
    const result = await updateCommunityReportStatus(id, status);
    if (!result.ok) setLoadError(result.error ?? 'Update failed');
    else await load();
    setBusyId(null);
  };

  const hideContent = async (row: CommunityReportRow) => {
    setBusyId(row.id);
    let result: { ok: boolean; error?: string };
    if (row.post_id) result = await hideCommunityPost(row.post_id, true);
    else if (row.comment_id) result = await hideCommunityComment(row.comment_id, true);
    else result = { ok: false, error: 'No content linked' };
    if (!result.ok) {
      setLoadError(result.error ?? 'Hide failed');
      setBusyId(null);
      return;
    }
    await updateCommunityReportStatus(row.id, 'actioned', 'Content hidden');
    await load();
    setBusyId(null);
  };

  return (
    <div className="rounded-xl border border-border bg-card-dark p-5">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Flag size={20} className="text-amber-400" />
        <h3 className="font-semibold text-primary">Community reports</h3>
        <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400">
          {filter === 'open' ? `${openCount} open` : `${rows.length} shown`}
        </span>
      </div>
      <p className="text-xs text-secondary mb-3">
        User reports from Community / Help Center — hide spam or dismiss after review.
      </p>

      <div className="flex gap-2 mb-3">
        <button
          type="button"
          className={`text-xs px-2.5 py-1 rounded-md border ${
            filter === 'open'
              ? 'border-amber-500/50 text-amber-400 bg-amber-500/10'
              : 'border-border text-secondary'
          }`}
          onClick={() => setFilter('open')}
        >
          Open
        </button>
        <button
          type="button"
          className={`text-xs px-2.5 py-1 rounded-md border ${
            filter === 'all'
              ? 'border-amber-500/50 text-amber-400 bg-amber-500/10'
              : 'border-border text-secondary'
          }`}
          onClick={() => setFilter('all')}
        >
          All
        </button>
      </div>

      {loadError ? (
        <p className="text-xs text-amber-400 mb-2" role="alert">
          {loadError}
          {loadError.includes('community_reports') ? (
            <span> — run migration 20270122180000_community_help_center.</span>
          ) : null}
        </p>
      ) : null}

      <div className="max-h-[340px] overflow-y-auto divide-y divide-border -mx-1">
        {loading ? (
          <p className="text-sm text-secondary py-6 text-center">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-secondary py-6 text-center">
            {filter === 'open' ? 'No open community reports.' : 'No community reports yet.'}
          </p>
        ) : (
          rows.map((row) => {
            const expanded = expandedId === row.id;
            const reporter =
              row.reporter_username || row.reporter_email || shortWallet(row.reporter_id, 8);
            const preview = row.post_title
              ? `Post: ${row.post_title}`
              : row.comment_body
                ? `Comment: ${row.comment_body.slice(0, 120)}`
                : 'Content removed';
            return (
              <div key={row.id} className="py-3 px-1 text-sm">
                <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
                  <span className="text-secondary text-xs whitespace-nowrap w-16 shrink-0">
                    {formatTimeAgo(row.created_at)}
                  </span>
                  <div className="flex-1 min-w-[180px]">
                    <p className="font-medium text-primary">{preview}</p>
                    <p className="text-xs text-secondary mt-0.5">Reporter: {reporter}</p>
                    <p className="text-xs text-primary/80 mt-1">{row.reason}</p>
                  </div>
                  <span
                    className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${
                      row.status === 'open'
                        ? 'bg-amber-500/15 text-amber-400'
                        : 'bg-green-500/15 text-green-400'
                    }`}
                  >
                    {row.status}
                  </span>
                </div>
                {(row.post_body || row.comment_body) && (
                  <button
                    type="button"
                    className="text-xs text-cyan-400 mt-1 hover:underline"
                    onClick={() => setExpandedId(expanded ? null : row.id)}
                  >
                    {expanded ? 'Hide content' : 'Show content'}
                  </button>
                )}
                {expanded ? (
                  <p className="mt-2 text-xs text-primary/90 whitespace-pre-wrap rounded-lg bg-black/20 p-2 border border-border">
                    {row.post_body || row.comment_body}
                  </p>
                ) : null}
                {row.status === 'open' ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      className="text-xs px-2.5 py-1 rounded-md bg-red-500/15 text-red-400 border border-red-500/30 disabled:opacity-50"
                      onClick={() => void hideContent(row)}
                    >
                      {busyId === row.id ? '…' : 'Hide content'}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      className="text-xs px-2.5 py-1 rounded-md bg-green-500/15 text-green-400 border border-green-500/30 disabled:opacity-50"
                      onClick={() => void setStatus(row.id, 'reviewed')}
                    >
                      Mark reviewed
                    </button>
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      className="text-xs px-2.5 py-1 rounded-md border border-border text-secondary disabled:opacity-50"
                      onClick={() => void setStatus(row.id, 'dismissed')}
                    >
                      Dismiss
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
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
  const [auditWallet, setAuditWallet] = useState<string | null>(null);
  const [auditData, setAuditData] = useState<AdminWalletFeeAudit | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const runnable = runnableCount ?? bots.filter((b) => b.bot_runnable).length;
  const toggleOn = bots.filter((b) => b.auto_trade_enabled).length;
  const { pageRows, totalPages, safePage, total } = useMemo(
    () => paginate(bots, page),
    [bots, page]
  );

  const openAudit = async (wallet: string) => {
    setAuditWallet(wallet);
    setAuditData(null);
    setAuditLoading(true);
    try {
      setAuditData(await fetchAdminWalletFeeAudit(wallet));
    } finally {
      setAuditLoading(false);
    }
  };

  return (
    <>
      <BotTradeDiagnosisPanel bots={bots} />
      {auditWallet ? (
        <div className="rounded-xl border border-border bg-card-dark p-4 space-y-3 mb-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium">
              Fee audit · {shortWallet(auditWallet, 8)}
              {auditData?.profile?.email ? (
                <span className="text-secondary font-normal"> · {auditData.profile.email}</span>
              ) : null}
            </h3>
            <button
              type="button"
              className="text-xs text-secondary hover:text-primary"
              onClick={() => {
                setAuditWallet(null);
                setAuditData(null);
              }}
            >
              Close
            </button>
          </div>
          {auditLoading ? (
            <p className="text-sm text-secondary">Loading audit…</p>
          ) : auditData ? (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
              <Kpi
                label="Bot closes"
                value={String(auditData.trade_history?.closed_count ?? 0)}
                sub={`${auditData.trade_history?.profitable_count ?? 0} profitable · P/L ${fmtUsdTrade(Number(auditData.trade_history?.closed_pnl_usd ?? 0), true)}`}
              />
              <Kpi
                label="Unpaid wins (gate)"
                value={`${auditData.fee_ledger?.unpaid_bot_wins ?? 0} / 20`}
                sub="opens block at 20 if fees owed"
              />
              <Kpi
                label="Lifetime fee wins"
                value={String(auditData.fee_ledger?.lifetime_bot_wins ?? 0)}
                sub={`${auditData.fee_ledger?.settled_bot_wins ?? 0} settled on-chain`}
              />
              <Kpi label="Fees accrued" value={fmtUsd(auditData.fee_ledger?.fees_accrued_usd ?? 0)} />
              <Kpi label="Fees paid" value={fmtUsd(auditData.fees_paid_usd ?? 0)} />
              <Kpi
                label="Fee exempt"
                value={auditData.fee_exempt ? 'yes' : 'no'}
                sub={
                  auditData.cache_state?.success_win_count != null
                    ? `cache ${auditData.cache_state.success_win_count}`
                    : undefined
                }
              />
            </div>
          ) : (
            <p className="text-sm text-amber-400">
              Audit RPC unavailable — apply migration 20260703160000_admin_wallet_fee_audit.sql
            </p>
          )}
        </div>
      ) : null}
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
          <th className="px-4 py-3" title="Closed HL bot trades in trade_history">Bot closes</th>
          <th className="px-4 py-3">Fees owed</th>
          <th className="px-4 py-3">Fees paid</th>
          <th className="px-4 py-3" title="Unpaid profitable closes toward 20-win block (hl_fee_ledger accrued)">
            Unpaid / 20
          </th>
          <th className="px-4 py-3" title="All-time profitable bot closes with platform fee">
            Lifetime wins
          </th>
          <th className="px-4 py-3">Blockers</th>
          <th className="px-4 py-3">Lev</th>
          <th className="px-4 py-3">Strategy</th>
          <th className="px-4 py-3">Audit</th>
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
            <td className="px-4 py-2 text-xs">
              {b.bot_closed_trades_count ?? '—'}
              {(b.bot_profitable_closes ?? 0) > 0 ? (
                <span className="block text-[10px] text-secondary">
                  {b.bot_profitable_closes} win
                </span>
              ) : null}
            </td>
            <td className="px-4 py-2 font-mono text-xs">
              <span className={(b.fees_owed_usd ?? 0) > 0 ? 'text-amber-400' : 'text-secondary'}>
                {fmtUsd(b.fees_owed_usd ?? 0)}
              </span>
            </td>
            <td className="px-4 py-2 font-mono text-xs text-green-400/90">
              {fmtUsd(b.fees_paid_usd ?? 0)}
            </td>
            <td className="px-4 py-2 text-xs">
              <span className={(b.fee_win_count ?? 0) >= 20 ? 'text-amber-400 font-medium' : ''}>
                {b.fee_win_count ?? 0}
              </span>
              <span className="text-secondary"> / 20</span>
            </td>
            <td className="px-4 py-2 text-xs font-mono">
              {b.lifetime_bot_fee_wins ?? '—'}
              {(b.fees_settled_usd ?? 0) > 0 ? (
                <span className="block text-[10px] text-secondary">
                  {fmtUsd(b.fees_settled_usd ?? 0)} settled
                </span>
              ) : null}
            </td>
            <td className="px-4 py-2 text-xs text-amber-400/90 max-w-[200px]">
              {b.blockers || '—'}
            </td>
            <td className="px-4 py-2">{b.leverage_multiplier}x</td>
            <td className="px-4 py-2 text-xs">{b.hl_bot_strategy ?? '—'}</td>
            <td className="px-4 py-2">
              <button
                type="button"
                className="text-xs text-cyan-400 hover:underline"
                onClick={() => void openAudit(b.wallet_address)}
              >
                Audit
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </TableShell>
    </>
  );
}

function PositionsPanel({ rows }: { rows: AdminHlDashboard['open_positions'] }) {
  const [page, setPage] = useState(0);
  const [trails, setTrails] = useState<Record<string, HlBotTrailSnapshot>>({});
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
  const trailWallets = useMemo(
    () => [...new Set(rows.map((p) => p.wallet_address.toLowerCase()))].sort(),
    [rows]
  );
  const trailWalletKey = trailWallets.join(',');

  useEffect(() => {
    if (!trailWalletKey) {
      setTrails({});
      return;
    }
    let cancelled = false;
    const wallets = trailWalletKey.split(',');
    const load = async () => {
      const batches = await Promise.all(
        wallets.map(async (wallet) => ({
          wallet,
          rows: await fetchHlBotTrailSnapshots(wallet),
        }))
      );
      if (cancelled) return;
      const next: Record<string, HlBotTrailSnapshot> = {};
      for (const batch of batches) {
        for (const trail of batch.rows) {
          next[`${batch.wallet}:${trail.coin.toUpperCase()}`] = trail;
        }
      }
      setTrails(next);
    };
    void load();
    const id = window.setInterval(() => void load(), 8_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [trailWalletKey]);

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
          <th className="px-4 py-3">Trail stop</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={12} className="px-4 py-8 text-center text-secondary text-sm">
              No open perps on tracked wallets
            </td>
          </tr>
        ) : (
          pageRows.map((p) => {
            const trail =
              trails[
                `${p.wallet_address.toLowerCase()}:${p.token_symbol.toUpperCase()}`
              ];
            return (
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
              <td
                className="px-4 py-2 font-mono text-xs"
                title={
                  trail
                    ? `phase=${trail.phase} · peak=${fmtUsdTrade(trail.peakPnlUsd, true)} · extreme=${trail.favorableExtremePx != null ? fmtPrice(trail.favorableExtremePx) : '—'} · distance=${trail.trailDistancePx != null ? fmtPrice(trail.trailDistancePx) : '—'}`
                    : 'No live trail snapshot'
                }
              >
                {trail?.stopPx != null ? (
                  <span className={trail.wouldCloseNow ? 'text-red-400' : 'text-green-400'}>
                    {fmtPrice(trail.stopPx)}
                    <span className="ml-1 text-secondary">({trail.phase})</span>
                  </span>
                ) : trail ? (
                  <span className="text-amber-400">Arming ({trail.phase})</span>
                ) : (
                  '—'
                )}
              </td>
            </tr>
            );
          })
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
  const [pnlFilter, setPnlFilter] = useState<'all' | 'wins' | 'losses'>('all');
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

  const visibleRows = useMemo(() => {
    if (pnlFilter === 'wins') return rows.filter((t) => (t.profit_loss ?? 0) > 0);
    if (pnlFilter === 'losses') return rows.filter((t) => (t.profit_loss ?? 0) < 0);
    return rows;
  }, [rows, pnlFilter]);

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
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          <Kpi
            label="Closed P/L"
            value={fmtUsdTrade(userStats.closed_pnl_total, true)}
            positive={userStats.closed_pnl_total >= 0}
          />
          <Kpi
            label="Gross profits"
            value={fmtUsdTrade(userStats.closed_profit_total ?? 0, true)}
            positive
            sub={`${userStats.closed_win_count ?? 0} wins`}
          />
          <Kpi
            label="Gross losses"
            value={fmtUsdTrade(userStats.closed_loss_total ?? 0, true)}
            positive={(userStats.closed_loss_total ?? 0) >= 0}
            sub={`${userStats.closed_loss_count ?? 0} losses`}
          />
          <Kpi label="Closed trades" value={String(userStats.closed_trades_count)} />
          <Kpi label="Open positions" value={String(userStats.open_positions_count)} />
          <Kpi
            label="Fees owed"
            value={fmtUsd(userStats.fees_accrued_usd)}
            sub={userStats.fees_accrued_usd > 0 ? 'pending payment' : 'clear'}
          />
          <Kpi
            label="Fees paid"
            value={fmtUsd(userStats.fees_paid_usd)}
          />
          <Kpi
            label="Fee wins"
            value={String(userStats.fee_win_count)}
            sub={`${userStats.wins_until_fee} until block`}
          />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-secondary">Show:</span>
        {(
          [
            ['all', 'All'],
            ['losses', 'Losses only'],
            ['wins', 'Wins only'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setPnlFilter(id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
              pnlFilter === id
                ? id === 'losses'
                  ? 'bg-red-500/20 border-red-500/50 text-red-300'
                  : id === 'wins'
                    ? 'bg-green-500/20 border-green-500/50 text-green-300'
                    : 'bg-white text-black border-white'
                : 'border-border text-secondary hover:text-primary'
            }`}
          >
            {label}
          </button>
        ))}
        <span className="text-xs text-secondary ml-auto">
          Page P/L {fmtUsdTrade(pagePnl, true)} · showing {visibleRows.length}/{rows.length}
        </span>
      </div>

      <TableShell
        title={`Closed HL trades (${total})`}
        subtitle={`Page P/L ${fmtUsdTrade(pagePnl, true)} · hyperliquid only${
          pnlFilter === 'losses' ? ' · losses only' : pnlFilter === 'wins' ? ' · wins only' : ''
        }`}
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
              <td colSpan={14} className="px-4 py-8 text-center text-secondary text-sm">
                Loading trade history…
              </td>
            </tr>
          ) : visibleRows.length === 0 ? (
            <tr>
              <td colSpan={14} className="px-4 py-8 text-center text-secondary text-sm">
                No closed HL trades match this filter.
              </td>
            </tr>
          ) : (
            visibleRows.map((t) => {
              const snap = t.snapshot_pnl_usd;
              const fill = t.profit_loss;
              const isLoss = (fill ?? 0) < 0;
              const snapMismatch =
                snap != null &&
                fill != null &&
                Number.isFinite(snap) &&
                Number.isFinite(fill) &&
                Math.abs(snap - fill) > 0.02;
              return (
                <tr
                  key={t.id}
                  className={`border-t border-border text-sm hover:bg-black/[0.03] align-top ${
                    isLoss ? 'bg-red-500/10' : ''
                  }`}
                >
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
                  <td className="px-4 py-2 font-medium">
                    {t.token_symbol}
                    {isLoss ? (
                      <span className="ml-2 text-[10px] uppercase tracking-wide text-red-400 font-semibold">
                        LOSS
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2">{t.direction}</td>
                  <td className="px-4 py-2">{t.leverage != null ? `${t.leverage}x` : '—'}</td>
                  <td className="px-4 py-2 font-mono text-xs">
                    {t.entry_price != null ? fmtUsd(t.entry_price) : '—'}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">
                    {t.exit_price != null ? fmtUsd(t.exit_price) : '—'}
                  </td>
                  <td
                    className={`px-4 py-2 font-mono font-semibold ${
                      isLoss ? 'text-red-400' : 'text-green-400'
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
  onRefresh,
}: {
  ledger: AdminHlDashboard['fee_ledger'];
  walletFees: AdminWalletFee[];
  stats: AdminHlDashboard['stats'];
  builder: AdminLiveContext['builder'];
  onRefresh: () => void | Promise<void>;
}) {
  const [ledgerPage, setLedgerPage] = useState(0);
  const [walletPage, setWalletPage] = useState(0);
  const [reconcileEmail, setReconcileEmail] = useState('');
  const [reconcileWallet, setReconcileWallet] = useState('');
  const [reconcileTx, setReconcileTx] = useState('');
  const [reconcileSecret, setReconcileSecret] = useState(
    () => (import.meta.env.VITE_BOT_ADMIN_SECRET as string | undefined) ?? ''
  );
  const [reconcileBusy, setReconcileBusy] = useState(false);
  const [reconcileMsg, setReconcileMsg] = useState<string | null>(null);
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

  const handleReconcile = async () => {
    if (!reconcileTx.trim()) {
      setReconcileMsg('Arbitrum tx hash required.');
      return;
    }
    if (!reconcileSecret.trim() && !import.meta.env.VITE_BOT_ADMIN_SECRET) {
      setReconcileMsg('Admin secret required.');
      return;
    }
    setReconcileBusy(true);
    setReconcileMsg(null);
    try {
      const result = await adminReconcilePlatformFee({
        txHash: reconcileTx.trim(),
        email: reconcileEmail.trim() || undefined,
        wallet: reconcileWallet.trim() || undefined,
        adminSecret: reconcileSecret.trim(),
      });
      if (result.success) {
        setReconcileMsg(
          `Settled ${fmtUsd(result.settledUsd ?? result.amountUsd ?? 0)} for ${result.wallet?.slice(0, 10) ?? 'wallet'}…`
        );
        setReconcileTx('');
        await onRefresh();
      } else {
        setReconcileMsg(result.error ?? 'Reconcile failed');
      }
    } catch (err: unknown) {
      setReconcileMsg(err instanceof Error ? err.message : 'Reconcile failed');
    } finally {
      setReconcileBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card-dark p-4 text-sm space-y-3">
        <p className="text-primary font-medium">Record on-chain fee payment (recovery)</p>
        <p className="text-secondary text-xs">
          If USDC arrived on treasury but the app did not confirm, paste the Arbitrum tx hash.
          Uses bot-service verify + ledger settle.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <input
            type="email"
            className="rounded-lg border border-border bg-black/20 px-3 py-2 text-xs font-mono"
            placeholder="User email (e.g. claudio.steyskal@icloud.com)"
            value={reconcileEmail}
            onChange={(e) => setReconcileEmail(e.target.value)}
          />
          <input
            type="text"
            className="rounded-lg border border-border bg-black/20 px-3 py-2 text-xs font-mono"
            placeholder="Wallet 0x… (optional if email set)"
            value={reconcileWallet}
            onChange={(e) => setReconcileWallet(e.target.value)}
          />
          <input
            type="text"
            className="rounded-lg border border-border bg-black/20 px-3 py-2 text-xs font-mono md:col-span-2"
            placeholder="Arbitrum tx hash 0x…"
            value={reconcileTx}
            onChange={(e) => setReconcileTx(e.target.value)}
          />
          {!import.meta.env.VITE_BOT_ADMIN_SECRET ? (
            <input
              type="password"
              className="rounded-lg border border-border bg-black/20 px-3 py-2 text-xs font-mono md:col-span-2"
              placeholder="BOT_ADMIN_SECRET"
              value={reconcileSecret}
              onChange={(e) => setReconcileSecret(e.target.value)}
            />
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            disabled={reconcileBusy}
            onClick={() => void handleReconcile()}
          >
            {reconcileBusy ? 'Reconciling…' : 'Reconcile payment'}
          </button>
          {reconcileMsg ? (
            <span className={`text-xs ${reconcileMsg.startsWith('Settled') ? 'text-green-400' : 'text-amber-400'}`}>
              {reconcileMsg}
            </span>
          ) : null}
        </div>
      </div>
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
        subtitle="owed vs paid · opens blocked at 20 unpaid bot wins + fees owed"
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
            <th className="px-4 py-3">Unpaid wins</th>
            <th className="px-4 py-3">Opens blocked</th>
            <th className="px-4 py-3">Withdraw blocked</th>
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
                {fmtUsd(w.fees_owed_usd ?? 0)}
              </td>
              <td className="px-4 py-2 font-mono text-green-400">
                {fmtUsd(w.fees_paid_usd ?? 0)}
              </td>
              <td className="px-4 py-2 font-mono">{fmtUsd(w.fees_accrued_usd)}</td>
              <td className="px-4 py-2 font-mono text-secondary">{fmtUsd(w.fees_settled_usd)}</td>
              <td className="px-4 py-2 text-xs">
                <span className={w.fee_win_count >= 20 ? 'text-amber-400 font-medium' : ''}>
                  {w.fee_win_count}
                </span>
                <span className="text-secondary"> / 20</span>
              </td>
              <td className="px-4 py-2">
                <StatusPill on={!w.fee_opens_blocked} onLabel="no" offLabel="BLOCKED" />
              </td>
              <td className="px-4 py-2">
                <StatusPill
                  on={w.fees_owed_usd <= 0.000_001}
                  onLabel="no"
                  offLabel="BLOCKED"
                />
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

function formatSignupAt(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const t = Date.parse(dateStr);
  if (!Number.isFinite(t)) return '—';
  return new Date(t).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isRecentSignup(dateStr: string | null | undefined, withinHours = 24): boolean {
  if (!dateStr) return false;
  const t = Date.parse(dateStr);
  if (!Number.isFinite(t)) return false;
  return Date.now() - t <= withinHours * 60 * 60 * 1000;
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
  const [search, setSearch] = useState('');
  /** Default newest — open-first buried brand-new signups under old traders. */
  const [sortMode, setSortMode] = useState<'newest' | 'open'>('newest');
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

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((u) => {
      const email = (u.email ?? '').toLowerCase();
      const wallet = (u.wallet_address ?? '').toLowerCase();
      const username = (u.username ?? '').toLowerCase();
      const name = (u.full_name ?? '').toLowerCase();
      return (
        email.includes(needle) ||
        wallet.includes(needle) ||
        username.includes(needle) ||
        name.includes(needle)
      );
    });
  }, [rows, search]);

  const sortedRows = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      if (sortMode === 'newest') {
        const at = Date.parse(a.created_at) || 0;
        const bt = Date.parse(b.created_at) || 0;
        return bt - at || (a.email ?? '').localeCompare(b.email ?? '');
      }
      const aOpen = a.open_positions_count ?? (a.wallet_address
        ? (positionsByWallet.get(a.wallet_address.toLowerCase())?.length ?? 0)
        : 0);
      const bOpen = b.open_positions_count ?? (b.wallet_address
        ? (positionsByWallet.get(b.wallet_address.toLowerCase())?.length ?? 0)
        : 0);
      return bOpen - aOpen || (a.email ?? '').localeCompare(b.email ?? '');
    });
  }, [filteredRows, positionsByWallet, sortMode]);

  const recentCount = useMemo(
    () => filteredRows.filter((u) => isRecentSignup(u.created_at)).length,
    [filteredRows]
  );

  const { pageRows, totalPages, safePage, total } = useMemo(
    () => paginate(sortedRows, page),
    [sortedRows, page]
  );

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card-dark p-4 flex flex-wrap gap-3 items-end">
        <label className="flex flex-col gap-1 text-xs text-secondary min-w-[240px] flex-1">
          Search users
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="email, wallet, username, name…"
            className="px-3 py-2 rounded-lg bg-black/30 border border-border text-sm text-primary"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-secondary">
          Sort
          <select
            value={sortMode}
            onChange={(e) => {
              setSortMode(e.target.value as 'newest' | 'open');
              setPage(0);
            }}
            className="px-3 py-2 rounded-lg bg-black/30 border border-border text-sm text-primary"
          >
            <option value="newest">Newest signup</option>
            <option value="open">Open positions first</option>
          </select>
        </label>
        {recentCount > 0 ? (
          <span className="text-xs px-2 py-2 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            {recentCount} joined &lt;24h
          </span>
        ) : null}
        {search.trim() ? (
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setPage(0);
            }}
            className="px-4 py-2 rounded-lg border border-border text-sm text-secondary hover:text-primary"
          >
            Clear
          </button>
        ) : null}
      </div>
      <TableShell
        title={`Users (${total}${search.trim() ? ` · filtered from ${rows.length}` : ''})`}
        subtitle={
          sortMode === 'newest'
            ? 'newest signup first · closed P/L · fees · open positions'
            : 'open positions first · closed P/L · fees'
        }
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
          const feesAccrued = u.fees_accrued_usd ?? 0;
          const feesPaid = u.fees_paid_usd ?? 0;
          const feesOwed = Math.max(0, feesAccrued - feesPaid);
          const winsUntil = u.wins_until_fee ?? Math.max(0, 20 - (u.fee_win_count ?? 0));
          const feeWins = u.fee_win_count ?? 0;

          const fresh = isRecentSignup(u.created_at);
          return (
            <tr
              key={u.id}
              className={`border-t border-border text-sm hover:bg-black/[0.03] align-top ${
                fresh ? 'bg-emerald-500/[0.06]' : ''
              }`}
            >
              <td className="px-4 py-2 text-xs max-w-[160px] truncate">
                {u.email ?? '—'}
                {fresh ? (
                  <span className="ml-1 text-[10px] uppercase text-emerald-400">new</span>
                ) : null}
              </td>
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
                <span className={feesOwed > 0 ? 'text-amber-400' : 'text-secondary'}>
                  {fmtUsd(feesOwed)}
                </span>
              </td>
              <td className="px-4 py-2 font-mono text-xs text-green-400/90">
                {fmtUsd(feesPaid)}
              </td>
              <td className="px-4 py-2 text-xs">
                <span className={feeWins >= 20 ? 'text-amber-400 font-medium' : 'text-secondary'}>
                  {feeWins} / 20
                </span>
                {(u.lifetime_bot_fee_wins ?? 0) > 0 ? (
                  <span className="block text-[10px] text-secondary">
                    {u.lifetime_bot_fee_wins} lifetime
                  </span>
                ) : null}
                {feeWins >= 20 && feesOwed > 0 ? (
                  <span className="block text-[10px] text-amber-400">blocked</span>
                ) : (
                  <span className="block text-[10px] text-secondary">{winsUntil} until block</span>
                )}
              </td>
              <td className="px-4 py-2 text-secondary text-xs whitespace-nowrap">
                <div className={fresh ? 'text-emerald-300' : 'text-primary/90'}>
                  {formatSignupAt(u.created_at)}
                </div>
                <div className="text-[10px] opacity-70">{formatTimeAgo(u.created_at)}</div>
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
    </div>
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
