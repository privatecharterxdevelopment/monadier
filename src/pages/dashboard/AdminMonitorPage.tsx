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
  Wallet,
  Zap,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { isAdminEmail } from '../../lib/admin';
import {
  enrichAdminHlDashboard,
  fetchAdminHlDashboard,
  fetchAdminLiveContext,
  fmtUsd,
  formatTimeAgo,
  shortWallet,
  type AdminHlDashboard,
  type AdminLiveContext,
} from '../../lib/adminDashboard';
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
  | 'payments'
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
  { id: 'payments', label: 'Payments', icon: <Wallet size={16} /> },
  { id: 'affiliate', label: 'Affiliate', icon: <Users size={16} /> },
];

const SECTION_IDS = new Set<Section>(SECTIONS.map((s) => s.id));

function sectionFromQuery(tab: string | null): Section {
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
      setRpcError(snapshotResult.error);
      const enriched = await enrichAdminHlDashboard(snapshotResult.data);
      setDash(enriched);
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
    const fromNotifs = dash.recent_events.map((e) => ({
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

      <nav className="flex gap-1.5 p-1 bg-card-dark rounded-lg border border-border flex-wrap w-full">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSection(s.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
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

      {section === 'bots' && dash && <BotsPanel bots={dash.active_bots} />}
      {section === 'positions' && dash && <PositionsPanel rows={dash.open_positions} />}
      {section === 'trades' && dash && <TradesPanel rows={dash.recent_closes} />}
      {section === 'events' && dash && <EventsPanel rows={dash.recent_events} />}
      {section === 'fees' && dash && live && (
        <FeesPanel ledger={dash.fee_ledger} stats={dash.stats} builder={live.builder} />
      )}
      {section === 'betting' && dash && (
        <BettingPanel positions={dash.betting_positions} closes={dash.betting_closes} />
      )}
      {section === 'users' && dash && (
        <UsersPanel rows={dash.users} openPositions={dash.open_positions} />
      )}
      {section === 'subscriptions' && dash && <SubsPanel rows={dash.subscriptions} />}
      {section === 'payments' && dash && <PaymentsPanel rows={dash.payments} />}
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
          label="HL bots on"
          value={String(stats.hl_bots_active)}
          sub={`${stats.hl_bots_total} configured · ${stats.agents_approved} agents`}
        />
        <Kpi label="Open perps" value={String(stats.open_positions)} sub={`${stats.betting_open} bets open`} />
        <Kpi
          label="P/L 24h"
          value={fmtUsd(stats.pnl_24h, true)}
          sub={`HL closes only · total ${fmtUsd(stats.total_pnl, true)}`}
          positive={stats.pnl_24h >= 0}
        />
        <Kpi label="Win rate" value={`${stats.win_rate}%`} sub={`${stats.closed_trades_24h} closes / 24h`} />
        <Kpi
          label="HL fees (10%)"
          value={fmtUsd(stats.hl_fees_total_usd)}
          sub={`${fmtUsd(stats.hl_fees_settled_usd)} on builder wallet`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BotServiceCard live={live} activeBots={stats.hl_bots_active} />
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
                  {fmtUsd(e.pnl, true)}
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
}: {
  live: AdminLiveContext | null;
  activeBots: number;
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
          <dd className="text-primary">{svc?.activeAutoTradeWallets ?? activeBots}</dd>
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

  return (
    <div className={`rounded-xl border p-5 ${ready ? 'border-green-500/30' : 'border-red-500/40'} bg-card-dark`}>
      <div className="flex items-center gap-2 mb-3">
        <Coins size={20} className={ready ? 'text-green-400' : 'text-red-400'} />
        <h3 className="font-semibold text-primary">Builder wallet — fee destination</h3>
        <span
          className={`ml-auto text-xs px-2 py-0.5 rounded-full ${
            ready ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
          }`}
        >
          {ready ? 'auto fee collection ON' : 'underfunded'}
        </span>
      </div>
      <p className="text-2xl font-bold text-primary">{fmtUsd(b?.accountUsd ?? 0)}</p>
      <p className="text-xs text-secondary mt-1 break-all font-mono">{b?.builderAddress}</p>
      <dl className="mt-4 grid grid-cols-1 gap-2 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-secondary">Success fee rate</dt>
          <dd className="text-primary font-medium">{feeRatePct}% of profit on every winning close</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-secondary">Collection</dt>
          <dd className="text-primary">Automatic via HL builder — no per-close wallet prompt</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-secondary">HL minimum</dt>
          <dd className="text-primary">{fmtUsd(b?.minUsd ?? 100)} on perps</dd>
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

function BotsPanel({ bots }: { bots: AdminHlDashboard['active_bots'] }) {
  return (
    <TableShell title={`HL bot configs (${bots.length})`} subtitle="vault_settings · agent · strategy">
      <thead>
        <tr className="text-left text-secondary text-xs">
          <th className="px-4 py-3">Wallet</th>
          <th className="px-4 py-3">User</th>
          <th className="px-4 py-3">Bot</th>
          <th className="px-4 py-3">Agent</th>
          <th className="px-4 py-3">Lev</th>
          <th className="px-4 py-3">TP / SL</th>
          <th className="px-4 py-3">Strategy</th>
          <th className="px-4 py-3">Updated</th>
        </tr>
      </thead>
      <tbody>
        {bots.map((b) => (
          <tr key={b.wallet_address} className="border-t border-border text-sm hover:bg-black/[0.03]">
            <td className="px-4 py-2 font-mono text-xs">{shortWallet(b.wallet_address, 8)}</td>
            <td className="px-4 py-2 text-xs text-secondary max-w-[160px] truncate">{b.email ?? '—'}</td>
            <td className="px-4 py-2">
              <StatusPill on={b.auto_trade_enabled} onLabel="RUNNING" offLabel="stopped" />
            </td>
            <td className="px-4 py-2">
              <StatusPill on={b.agent_approved} onLabel="approved" offLabel="missing" />
            </td>
            <td className="px-4 py-2">{b.leverage_multiplier}x</td>
            <td className="px-4 py-2 text-xs">
              {b.take_profit_percent}% / {b.stop_loss_percent}%
            </td>
            <td className="px-4 py-2 text-xs">{b.hl_bot_strategy ?? '—'}</td>
            <td className="px-4 py-2 text-secondary text-xs">{formatTimeAgo(b.updated_at)}</td>
          </tr>
        ))}
      </tbody>
    </TableShell>
  );
}

function PositionsPanel({ rows }: { rows: AdminHlDashboard['open_positions'] }) {
  return (
    <TableShell
      title={`Open HL positions (${rows.length})`}
      subtitle="Live from Hyperliquid API · not legacy vault positions table"
      scrollable
    >
      <thead>
        <tr className="text-left text-secondary text-xs">
          <th className="px-4 py-3">Wallet</th>
          <th className="px-4 py-3">Pair</th>
          <th className="px-4 py-3">Dir</th>
          <th className="px-4 py-3">Size</th>
          <th className="px-4 py-3">Lev</th>
          <th className="px-4 py-3">uPnL</th>
          <th className="px-4 py-3">Status</th>
          <th className="px-4 py-3">Opened</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <tr key={p.id} className="border-t border-border text-sm hover:bg-black/[0.03]">
            <td className="px-4 py-2 font-mono text-xs">{shortWallet(p.wallet_address, 8)}</td>
            <td className="px-4 py-2 font-medium">{p.token_symbol}</td>
            <td className="px-4 py-2">{p.direction}</td>
            <td className="px-4 py-2 font-mono">{fmtUsd(p.entry_amount)}</td>
            <td className="px-4 py-2">{p.leverage_multiplier ?? 1}x</td>
            <td
              className={`px-4 py-2 font-mono ${
                (p.profit_loss ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'
              }`}
            >
              {p.profit_loss != null ? fmtUsd(p.profit_loss, true) : '—'}
            </td>
            <td className="px-4 py-2">
              <StatusPill on={p.status === 'open'} onLabel={p.status} offLabel={p.status} />
            </td>
            <td className="px-4 py-2 text-secondary text-xs">{formatTimeAgo(p.created_at)}</td>
          </tr>
        ))}
      </tbody>
    </TableShell>
  );
}

function TradesPanel({ rows }: { rows: AdminHlDashboard['recent_closes'] }) {
  return (
    <TableShell
      title={`Closed HL trades (${rows.length})`}
      subtitle="trade_history · hyperliquid venue only"
      scrollable
    >
      <thead>
        <tr className="text-left text-secondary text-xs">
          <th className="px-4 py-3">Closed</th>
          <th className="px-4 py-3">Wallet</th>
          <th className="px-4 py-3">Pair</th>
          <th className="px-4 py-3">Dir</th>
          <th className="px-4 py-3">P/L</th>
          <th className="px-4 py-3">10% fee</th>
          <th className="px-4 py-3">Fee status</th>
          <th className="px-4 py-3">Reason</th>
          <th className="px-4 py-3">Venue</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((t) => (
          <tr key={t.id} className="border-t border-border text-sm hover:bg-black/[0.03]">
            <td className="px-4 py-2 text-secondary text-xs whitespace-nowrap">
              {formatTimeAgo(t.closed_at)}
            </td>
            <td className="px-4 py-2 font-mono text-xs">{shortWallet(t.wallet_address, 8)}</td>
            <td className="px-4 py-2">{t.token_symbol}</td>
            <td className="px-4 py-2">{t.direction}</td>
            <td
              className={`px-4 py-2 font-mono ${
                (t.profit_loss ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'
              }`}
            >
              {fmtUsd(t.profit_loss ?? 0, true)}
            </td>
            <td className="px-4 py-2 font-mono text-xs text-green-400/90">
              {t.platform_success_fee != null ? fmtUsd(t.platform_success_fee) : '—'}
            </td>
            <td className="px-4 py-2 text-xs uppercase">
              {t.platform_fee_status === 'settled' ? (
                <span className="text-green-400">settled → builder</span>
              ) : t.platform_fee_status === 'accrued' ? (
                <span className="text-amber-400">accrued</span>
              ) : (
                <span className="text-secondary">—</span>
              )}
            </td>
            <td className="px-4 py-2 text-xs text-secondary max-w-[120px] truncate">
              {t.close_reason ?? '—'}
            </td>
            <td className="px-4 py-2 text-xs uppercase">{t.execution_venue ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </TableShell>
  );
}

function EventsPanel({ rows }: { rows: AdminHlDashboard['recent_events'] }) {
  return (
    <TableShell
      title={`Notifications (${rows.length})`}
      subtitle="user_trade_notifications · email queue"
      scrollable
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
        {rows.map((n) => (
          <tr key={n.id} className="border-t border-border text-sm hover:bg-black/[0.03]">
            <td className="px-4 py-2 text-secondary text-xs">{formatTimeAgo(n.closed_at)}</td>
            <td className="px-4 py-2 text-xs uppercase text-cyan-400">{n.kind}</td>
            <td className="px-4 py-2 max-w-xs truncate">{n.headline}</td>
            <td className="px-4 py-2 text-xs text-secondary truncate max-w-[140px]">{n.email ?? shortWallet(n.wallet_address)}</td>
            <td className={`px-4 py-2 font-mono ${n.profit_loss >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {fmtUsd(n.profit_loss, true)}
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
  stats,
  builder,
}: {
  ledger: AdminHlDashboard['fee_ledger'];
  stats: AdminHlDashboard['stats'];
  builder: AdminLiveContext['builder'];
}) {
  const builderAddr = builder?.builderAddress ?? '—';

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card-dark p-4 text-sm">
        <p className="text-primary font-medium">10% success fee — automatic on every profitable close</p>
        <p className="text-secondary mt-1">
          Collected via Hyperliquid builder fee and credited to{' '}
          <span className="font-mono text-xs break-all">{builderAddr}</span>. Users approve once at
          bot setup; closes never prompt again.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Kpi label="Total fees (10%)" value={fmtUsd(stats.hl_fees_total_usd)} />
        <Kpi label="Accrued" value={fmtUsd(stats.hl_fees_accrued_usd)} sub="missing HL settlement" />
        <Kpi
          label="Settled on builder"
          value={fmtUsd(stats.hl_fees_settled_usd)}
          sub={builder?.ready ? `wallet ${fmtUsd(builder.accountUsd)}` : 'builder underfunded'}
        />
      </div>
      <TableShell title="Fee ledger" subtitle="hl_fee_ledger · 10% of gross profit per winning close">
        <thead>
          <tr className="text-left text-secondary text-xs">
            <th className="px-4 py-3">When</th>
            <th className="px-4 py-3">User wallet</th>
            <th className="px-4 py-3">Coin</th>
            <th className="px-4 py-3">Gross profit</th>
            <th className="px-4 py-3">10% fee</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Reason</th>
          </tr>
        </thead>
        <tbody>
          {ledger.map((f) => (
            <tr key={f.id} className="border-t border-border text-sm">
              <td className="px-4 py-2 text-xs text-secondary">{formatTimeAgo(f.created_at)}</td>
              <td className="px-4 py-2 font-mono text-xs">{shortWallet(f.wallet_address, 8)}</td>
              <td className="px-4 py-2">{f.coin}</td>
              <td className="px-4 py-2 font-mono text-green-400">{fmtUsd(f.gross_profit_usd)}</td>
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
  return (
    <div className="space-y-6">
      <TableShell title={`Open bets (${positions.length})`} subtitle="hl_betting_positions">
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
          {positions.map((p) => (
            <tr key={p.id} className="border-t border-border text-sm">
              <td className="px-4 py-2">{p.market_name}</td>
              <td className="px-4 py-2">{p.side_label}</td>
              <td className="px-4 py-2 font-mono">{p.size}</td>
              <td className="px-4 py-2 font-mono">{p.entry_px}</td>
              <td className="px-4 py-2 font-mono">{p.mark_px ?? '—'}</td>
              <td className={`px-4 py-2 font-mono ${(p.unrealized_pnl ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {p.unrealized_pnl != null ? fmtUsd(p.unrealized_pnl, true) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </TableShell>
      <TableShell title={`Recent bet closes (${closes.length})`} subtitle="hl_betting_closes">
        <thead>
          <tr className="text-left text-secondary text-xs">
            <th className="px-4 py-3">Closed</th>
            <th className="px-4 py-3">Market</th>
            <th className="px-4 py-3">Side</th>
            <th className="px-4 py-3">Realized</th>
          </tr>
        </thead>
        <tbody>
          {closes.map((c) => (
            <tr key={c.id} className="border-t border-border text-sm">
              <td className="px-4 py-2 text-xs text-secondary">{formatTimeAgo(c.closed_at)}</td>
              <td className="px-4 py-2">{c.market_name}</td>
              <td className="px-4 py-2">{c.side_label}</td>
              <td className={`px-4 py-2 font-mono ${c.realized_pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {fmtUsd(c.realized_pnl, true)}
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
}: {
  rows: AdminHlDashboard['users'];
  openPositions: AdminHlDashboard['open_positions'];
}) {
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
      const aOpen = a.wallet_address
        ? (positionsByWallet.get(a.wallet_address.toLowerCase())?.length ?? 0)
        : 0;
      const bOpen = b.wallet_address
        ? (positionsByWallet.get(b.wallet_address.toLowerCase())?.length ?? 0)
        : 0;
      return bOpen - aOpen || (a.email ?? '').localeCompare(b.email ?? '');
    });
  }, [rows, positionsByWallet]);

  return (
    <TableShell
      title={`Users (${rows.length})`}
      subtitle={`${openPositions.length} open position(s) across wallets`}
    >
      <thead>
        <tr className="text-left text-secondary text-xs">
          <th className="px-4 py-3">Email</th>
          <th className="px-4 py-3">Wallet</th>
          <th className="px-4 py-3">Open positions</th>
          <th className="px-4 py-3">uPnL (open)</th>
          <th className="px-4 py-3">Tier</th>
          <th className="px-4 py-3">Joined</th>
        </tr>
      </thead>
      <tbody>
        {sortedRows.map((u) => {
          const walletKey = u.wallet_address?.toLowerCase() ?? '';
          const positions = walletKey ? positionsByWallet.get(walletKey) ?? [] : [];
          const openUpnl = positions.reduce((sum, p) => sum + (p.profit_loss ?? 0), 0);
          return (
            <tr key={u.id} className="border-t border-border text-sm hover:bg-black/[0.03]">
              <td className="px-4 py-2">{u.email ?? '—'}</td>
              <td className="px-4 py-2 font-mono text-xs">{shortWallet(u.wallet_address, 8)}</td>
              <td className="px-4 py-2 text-xs">
                {positions.length === 0 ? (
                  <span className="text-secondary">—</span>
                ) : (
                  <span className="font-medium">
                    {positions
                      .map((p) => `${p.token_symbol} ${p.direction}`)
                      .join(' · ')}
                  </span>
                )}
              </td>
              <td
                className={`px-4 py-2 font-mono text-xs ${
                  openUpnl >= 0 ? 'text-green-400' : 'text-red-400'
                }`}
              >
                {positions.length > 0 ? fmtUsd(openUpnl, true) : '—'}
              </td>
              <td className="px-4 py-2 text-xs">{u.membership_tier ?? 'free'}</td>
              <td className="px-4 py-2 text-secondary text-xs">{formatTimeAgo(u.created_at)}</td>
            </tr>
          );
        })}
      </tbody>
    </TableShell>
  );
}

function SubsPanel({ rows }: { rows: AdminHlDashboard['subscriptions'] }) {
  return (
    <TableShell title={`Subscriptions (${rows.length})`}>
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
        {rows.map((s) => (
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

function PaymentsPanel({ rows }: { rows: AdminHlDashboard['payments'] }) {
  return (
    <TableShell title={`Payments (${rows.length})`} subtitle="pending_payments">
      <thead>
        <tr className="text-left text-secondary text-xs">
          <th className="px-4 py-3">When</th>
          <th className="px-4 py-3">Wallet</th>
          <th className="px-4 py-3">Plan</th>
          <th className="px-4 py-3">Amount</th>
          <th className="px-4 py-3">Status</th>
          <th className="px-4 py-3">Tx</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <tr key={p.id} className="border-t border-border text-sm">
            <td className="px-4 py-2 text-xs text-secondary">{formatTimeAgo(p.created_at)}</td>
            <td className="px-4 py-2 font-mono text-xs">{shortWallet(p.wallet_address, 8)}</td>
            <td className="px-4 py-2">{p.plan_tier}</td>
            <td className="px-4 py-2 font-mono">${p.expected_amount}</td>
            <td className="px-4 py-2 text-xs">{p.status}</td>
            <td className="px-4 py-2 font-mono text-xs">{p.tx_hash ? `${p.tx_hash.slice(0, 10)}…` : '—'}</td>
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

function TableShell({
  title,
  subtitle,
  scrollable = false,
  children,
}: {
  title: string;
  subtitle?: string;
  scrollable?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card-dark rounded-xl border border-border overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="font-semibold text-primary">{title}</h3>
        {subtitle && <p className="text-xs text-secondary mt-0.5">{subtitle}</p>}
      </div>
      <div className={scrollable ? 'admin-monitor-table-scroll overflow-x-auto' : 'overflow-x-auto'}>
        <table className="w-full">{children}</table>
      </div>
    </div>
  );
}

export default AdminMonitorPage;
