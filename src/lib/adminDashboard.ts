import { supabase } from './supabase';
import { getBotApiBase } from './signalService';
import { fetchHlBuilderPlatformStatus, type HlBuilderPlatformStatus } from './hyperliquid/builderPlatform';
import {
  fetchAdminHlLiveOpenPositions,
  sumAdminOpenUpnl,
  countAdminPositionsByCoin,
} from './adminHlLivePositions';

export type AdminHlStats = {
  total_users: number;
  users_with_wallet: number;
  /** Matches Railway bot-service cycle (chain 42161 + agent + no fee block). */
  hl_bots_active: number;
  /** Toggle ON in vault_settings (may not be runnable). */
  hl_bots_toggle_on?: number;
  /** Same as hl_bots_active — explicit alias from RPC. */
  hl_bots_runnable?: number;
  hl_bots_total: number;
  agents_approved: number;
  open_positions: number;
  open_upnl_total: number;
  closed_trades_24h: number;
  closed_trades_total: number;
  total_pnl: number;
  pnl_24h: number;
  win_rate: number;
  hl_fees_accrued_usd: number;
  hl_fees_settled_usd: number;
  hl_fees_total_usd: number;
  platform_fees_owed_usd?: number;
  platform_fees_paid_usd?: number;
  notifications_pending_email: number;
  betting_open: number;
  active_subscriptions: number;
};

export type AdminHlBot = {
  wallet_address: string;
  user_id: string | null;
  email: string | null;
  chain_id?: number;
  auto_trade_enabled: boolean;
  execution_venue: string;
  leverage_multiplier: number;
  take_profit_percent: number;
  stop_loss_percent: number;
  hl_bot_strategy: string | null;
  news_trade_mode: string | null;
  updated_at: string;
  agent_approved: boolean;
  agent_approved_at: string | null;
  agent_expires_at: string | null;
  bot_runnable?: boolean;
  blockers?: string;
  fees_accrued_usd?: number;
  fees_settled_usd?: number;
  fees_paid_usd?: number;
  fees_owed_usd?: number;
  fee_win_count?: number;
  fee_opens_blocked?: boolean;
  /** Display-only — all-time profitable bot closes in hl_fee_ledger */
  lifetime_bot_fee_wins?: number;
  /** Display-only — closed HL bot trades in trade_history */
  bot_closed_trades_count?: number;
  bot_profitable_closes?: number;
  bot_closed_pnl_usd?: number;
};

export type AdminWalletFee = {
  wallet_address: string;
  email: string | null;
  auto_trade_enabled: boolean;
  fees_accrued_usd: number;
  fees_settled_usd: number;
  fees_paid_usd: number;
  fees_owed_usd: number;
  fee_win_count: number;
  wins_until_fee: number;
  fee_opens_blocked: boolean;
  fee_payment_status: 'paid' | 'owed' | 'clear';
};

export type AdminOpenPosition = {
  id: string;
  wallet_address: string;
  email?: string | null;
  token_symbol: string;
  direction: string;
  status: string;
  /** Signed coin size (HL szi). */
  size?: number | null;
  abs_size?: number | null;
  notional_usd?: number | null;
  mark_price?: number | null;
  entry_amount: number;
  entry_price: number | null;
  profit_loss: number | null;
  profit_loss_percent: number | null;
  leverage_multiplier: number | null;
  created_at: string;
};

export type AdminTradeClose = {
  id: string;
  wallet_address: string;
  token_symbol: string;
  direction: string;
  leverage?: number | null;
  entry_price?: number | null;
  exit_price?: number | null;
  entry_amount?: number | null;
  exit_amount?: number | null;
  profit_loss: number | null;
  profit_loss_percent: number | null;
  snapshot_pnl_usd?: number | null;
  close_reason: string | null;
  execution_venue: string | null;
  platform_success_fee: number | null;
  platform_fee_status: string | null;
  closed_at: string;
  email: string | null;
};

export type AdminTradeHistoryUserStats = {
  wallet_address: string;
  email: string | null;
  closed_pnl_total: number;
  closed_trades_count: number;
  open_positions_count: number;
  fees_accrued_usd: number;
  fees_paid_usd: number;
  fee_win_count: number;
  wins_until_fee: number;
  lifetime_bot_fee_wins?: number;
  bot_closed_trades_count?: number;
};

export type AdminHlTradeHistoryPage = {
  total: number;
  limit: number;
  offset: number;
  rows: AdminTradeClose[];
  user_stats?: AdminTradeHistoryUserStats | null;
};

export type AdminTradeEvent = {
  id: string;
  user_id: string;
  email: string | null;
  wallet_address: string;
  kind: string;
  headline: string;
  profit_loss: number;
  profit_loss_percent: number | null;
  closed_at: string;
  read_at: string | null;
  email_sent_at: string | null;
  created_at: string;
};

export type AdminFeeLedgerRow = {
  id: string;
  wallet_address: string;
  coin: string;
  gross_profit_usd: number;
  snapshot_pnl_usd: number | null;
  success_fee_usd: number;
  status: string;
  close_reason: string | null;
  created_at: string;
  settled_at: string | null;
};

export type AdminBettingPosition = {
  id: string;
  wallet_address: string;
  market_name: string;
  side_label: string;
  size: number;
  entry_px: number;
  mark_px: number | null;
  unrealized_pnl: number | null;
  updated_at: string;
};

export type AdminBettingClose = {
  id: string;
  wallet_address: string;
  market_name: string;
  side_label: string;
  size: number;
  exit_px: number;
  realized_pnl: number;
  closed_at: string;
};

export type AdminUserRow = {
  id: string;
  email: string | null;
  wallet_address: string | null;
  membership_tier: string | null;
  trade_close_email_enabled?: boolean;
  created_at: string;
  username?: string | null;
  full_name?: string | null;
  country?: string | null;
  timezone?: string | null;
  kyc_status?: string | null;
  onboarding_completed?: boolean | null;
  closed_pnl_total?: number;
  closed_trades_count?: number;
  open_positions_count?: number;
  fees_accrued_usd?: number;
  fees_settled_usd?: number;
  fees_paid_usd?: number;
  fee_win_count?: number;
  wins_until_fee?: number;
  lifetime_bot_fee_wins?: number;
};

export type AdminSubscriptionRow = {
  id: string;
  user_id: string;
  wallet_address: string;
  plan_tier: string;
  status: string;
  billing_cycle: string;
  start_date: string;
  end_date: string;
};

export type AdminHlDashboard = {
  generated_at: string;
  stats: AdminHlStats;
  active_bots: AdminHlBot[];
  wallet_fees?: AdminWalletFee[];
  open_positions: AdminOpenPosition[];
  recent_closes: AdminTradeClose[];
  recent_events: AdminTradeEvent[];
  fee_ledger: AdminFeeLedgerRow[];
  betting_positions: AdminBettingPosition[];
  betting_closes: AdminBettingClose[];
  users: AdminUserRow[];
  subscriptions: AdminSubscriptionRow[];
};

const EMPTY_ADMIN_STATS: AdminHlStats = {
  total_users: 0,
  users_with_wallet: 0,
  hl_bots_active: 0,
  hl_bots_total: 0,
  agents_approved: 0,
  open_positions: 0,
  open_upnl_total: 0,
  closed_trades_24h: 0,
  closed_trades_total: 0,
  total_pnl: 0,
  pnl_24h: 0,
  win_rate: 0,
  hl_fees_accrued_usd: 0,
  hl_fees_settled_usd: 0,
  hl_fees_total_usd: 0,
  notifications_pending_email: 0,
  betting_open: 0,
  active_subscriptions: 0,
};

/** RPC jsonb may omit null array keys after schema changes — never crash admin UI. */
export function normalizeAdminHlDashboard(raw: Partial<AdminHlDashboard> | null | undefined): AdminHlDashboard {
  const dash = raw ?? {};
  return {
    generated_at: dash.generated_at ?? new Date().toISOString(),
    stats: normalizeAdminStats({ ...EMPTY_ADMIN_STATS, ...(dash.stats ?? {}) }),
    active_bots: dash.active_bots ?? [],
    wallet_fees: dash.wallet_fees ?? [],
    open_positions: dash.open_positions ?? [],
    recent_closes: dash.recent_closes ?? [],
    recent_events: dash.recent_events ?? [],
    fee_ledger: dash.fee_ledger ?? [],
    betting_positions: dash.betting_positions ?? [],
    betting_closes: dash.betting_closes ?? [],
    users: dash.users ?? [],
    subscriptions: dash.subscriptions ?? [],
  };
}

export type BotServiceHealth = {
  status: string;
  uptime?: string;
  tradesExecuted?: number;
  lastCheck?: string;
  version?: string;
  gitCommit?: string | null;
  lastCycle?: Record<string, unknown> | null;
};

export type BotWalletLiveStatus = {
  wallet: string;
  canTrade: boolean;
  wouldProcessOpens: boolean;
  summary: string;
  blockingGates: string[];
  equityUsd: number | null;
  openCoins: string[];
};

export type BotServiceStatus = {
  success: boolean;
  service?: string;
  executionVenue?: string;
  activeAutoTradeWallets?: number;
  activeWallets?: string[];
  walletStatus?: BotWalletLiveStatus[];
  sampleWallets?: string[];
  lastCycle?: Record<string, unknown> | null;
  tradeIntervalSec?: number;
  minHlAccountUsd?: number;
  timestamp?: string;
  error?: string;
};

export type AdminLiveContext = {
  builder: HlBuilderPlatformStatus;
  health: BotServiceHealth | null;
  serviceStatus: BotServiceStatus | null;
};

export type AdminSessionCheck = {
  uid: string | null;
  email: string;
  is_admin: boolean;
};

export type AdminHlDashboardResult = {
  data: AdminHlDashboard | null;
  error: string | null;
  source?: 'rpc' | 'tables';
};

export async function fetchAdminSessionCheck(): Promise<AdminSessionCheck | null> {
  const { data, error } = await supabase.rpc('get_admin_session_check');
  if (error || !data) return null;
  return data as AdminSessionCheck;
}

const HL_BOT_CHAIN_ID = 42161;
const FEE_WINS_BEFORE_BLOCK = 20;

function botBlockers(
  v: {
    auto_trade_enabled?: boolean | null;
    chain_id?: number | null;
    execution_venue?: string | null;
  },
  agentApproved: boolean,
  feesAccrued: number,
  feeWinCount: number
): string {
  const parts: string[] = [];
  if (!v.auto_trade_enabled) parts.push('toggle off');
  if (v.chain_id != null && v.chain_id !== HL_BOT_CHAIN_ID) parts.push(`chain ${v.chain_id}`);
  if (v.execution_venue == null) parts.push('venue null');
  if (v.execution_venue && v.execution_venue !== 'hyperliquid') parts.push(`venue ${v.execution_venue}`);
  if (!agentApproved) parts.push('no agent');
  if (feesAccrued > 0.000_001 && feeWinCount >= FEE_WINS_BEFORE_BLOCK) {
    parts.push(`fees due (${feeWinCount}/20 wins)`);
  }
  return parts.join(' · ');
}

function isBotRunnable(
  v: {
    auto_trade_enabled?: boolean | null;
    chain_id?: number | null;
    execution_venue?: string | null;
  },
  agentApproved: boolean,
  feesAccrued: number,
  feeWinCount: number
): boolean {
  return (
    Boolean(v.auto_trade_enabled) &&
    v.chain_id === HL_BOT_CHAIN_ID &&
    v.execution_venue === 'hyperliquid' &&
    agentApproved &&
    !(feesAccrued > 0.000_001 && feeWinCount >= FEE_WINS_BEFORE_BLOCK)
  );
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isHlBotCloseVenue(venue: string | null | undefined): boolean {
  return !venue || venue === 'hyperliquid';
}

type HlPnlAggregate = { sum: number; count: number; wins: number };

/** Authoritative HL bot close P/L — paginates trade_history (matches Trades panel filter). */
async function aggregateHlTradeHistoryPnl(sinceIso?: string): Promise<HlPnlAggregate> {
  const pageSize = 500;
  let offset = 0;
  let sum = 0;
  let count = 0;
  let wins = 0;

  while (true) {
    let query = supabase
      .from('trade_history')
      .select('profit_loss, execution_venue, closed_at')
      .not('closed_at', 'is', null)
      .order('closed_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (sinceIso) {
      query = query.gte('closed_at', sinceIso);
    }

    const { data, error } = await query;
    if (error) {
      console.warn('[adminDashboard] aggregateHlTradeHistoryPnl failed', error.message);
      break;
    }
    if (!data?.length) break;

    for (const row of data) {
      if (!isHlBotCloseVenue(row.execution_venue as string | null)) continue;
      const pl = num(row.profit_loss);
      sum += pl;
      count += 1;
      if (pl > 0) wins += 1;
    }

    if (data.length < pageSize) break;
    offset += pageSize;
  }

  return { sum, count, wins };
}

function normalizeAdminStats(raw: Partial<AdminHlStats> | undefined): AdminHlStats {
  const s = raw ?? {};
  return {
    total_users: num(s.total_users),
    users_with_wallet: num(s.users_with_wallet),
    hl_bots_active: num(s.hl_bots_active),
    hl_bots_toggle_on: num(s.hl_bots_toggle_on),
    hl_bots_runnable: num(s.hl_bots_runnable),
    hl_bots_total: num(s.hl_bots_total),
    agents_approved: num(s.agents_approved),
    open_positions: num(s.open_positions),
    open_upnl_total: num(s.open_upnl_total),
    closed_trades_24h: num(s.closed_trades_24h),
    closed_trades_total: num(s.closed_trades_total),
    total_pnl: num(s.total_pnl),
    pnl_24h: num(s.pnl_24h),
    win_rate: num(s.win_rate),
    hl_fees_accrued_usd: num(s.hl_fees_accrued_usd),
    hl_fees_settled_usd: num(s.hl_fees_settled_usd),
    hl_fees_total_usd: num(s.hl_fees_total_usd),
    platform_fees_owed_usd: num(s.platform_fees_owed_usd),
    platform_fees_paid_usd: num(s.platform_fees_paid_usd),
    notifications_pending_email: num(s.notifications_pending_email),
    betting_open: num(s.betting_open),
    active_subscriptions: num(s.active_subscriptions),
  };
}

async function fetchAdminHlDashboardViaTables(): Promise<AdminHlDashboard | null> {
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();

  const [
    profilesRes,
    vaultRes,
    agentsRes,
    positionsRes,
    tradeHistoryRes,
    eventsRes,
    feeRes,
    bettingPosRes,
    bettingCloseRes,
    subsRes,
    feePaymentsRes,
    feeWinViewRes,
    feeWinLedgerRes,
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('id,email,wallet_address,membership_tier,trade_close_email_enabled,created_at')
      .order('created_at', { ascending: false })
      .limit(500),
    supabase
      .from('vault_settings')
      .select(
        'wallet_address,user_id,chain_id,auto_trade_enabled,execution_venue,leverage_multiplier,take_profit_percent,stop_loss_percent,hl_bot_strategy,news_trade_mode,updated_at'
      )
      .order('updated_at', { ascending: false })
      .limit(200),
    supabase
      .from('hl_agent_approvals')
      .select('wallet_address,approved_at,expires_at,revoked_at')
      .is('revoked_at', null),
    supabase
      .from('positions')
      .select(
        'id,wallet_address,token_symbol,direction,status,entry_amount,entry_price,profit_loss,profit_loss_percent,leverage_multiplier,created_at'
      )
      .in('status', ['open', 'closing'])
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('trade_history')
      .select(
        'id,wallet_address,token_symbol,direction,profit_loss,profit_loss_percent,close_reason,execution_venue,platform_success_fee,platform_fee_status,closed_at'
      )
      .not('closed_at', 'is', null)
      .order('closed_at', { ascending: false })
      .limit(80),
    supabase
      .from('user_trade_notifications')
      .select(
        'id,user_id,wallet_address,kind,headline,profit_loss,profit_loss_percent,closed_at,read_at,email_sent_at,created_at'
      )
      .order('closed_at', { ascending: false })
      .limit(60),
    supabase
      .from('hl_fee_ledger')
      .select(
        'id,wallet_address,coin,gross_profit_usd,snapshot_pnl_usd,success_fee_usd,accrued_fee_usd,status,close_reason,created_at,settled_at'
      )
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('hl_betting_positions')
      .select('id,wallet_address,market_name,side_label,size,entry_px,mark_px,unrealized_pnl,updated_at')
      .order('updated_at', { ascending: false })
      .limit(50),
    supabase
      .from('hl_betting_closes')
      .select('id,wallet_address,market_name,side_label,size,exit_px,realized_pnl,closed_at')
      .order('closed_at', { ascending: false })
      .limit(40),
    supabase
      .from('subscriptions')
      .select('id,user_id,wallet_address,plan_tier,status,billing_cycle,start_date,end_date')
      .order('start_date', { ascending: false })
      .limit(200),
    supabase.from('platform_fee_payments').select('wallet_address,amount_usd'),
    supabase
      .from('wallet_unpaid_bot_fee_wins')
      .select('wallet_address,unpaid_bot_win_count'),
    supabase
      .from('hl_fee_ledger')
      .select('wallet_address,fee_source,status,success_fee_usd')
      .eq('fee_source', 'bot')
      .eq('status', 'accrued')
      .gt('success_fee_usd', 0),
  ]);

  const errors = [
    profilesRes.error,
    vaultRes.error,
    positionsRes.error,
    tradeHistoryRes.error,
    eventsRes.error,
    feeRes.error,
    subsRes.error,
  ].filter(Boolean);

  if (errors.length > 0) {
    console.error('[adminDashboard] table fallback partial errors', errors);
    const denied = errors.some((e) => /permission|policy|42501|admin/i.test(e?.message ?? ''));
    if (denied) return null;
  }

  const profiles = profilesRes.data ?? [];
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const profileByWallet = new Map(
    profiles
      .filter((p) => p.wallet_address)
      .map((p) => [String(p.wallet_address).toLowerCase(), p])
  );

  const agents = new Map(
    (agentsRes.data ?? []).map((a) => [String(a.wallet_address).toLowerCase(), a])
  );

  const hlVaults = (vaultRes.data ?? []).filter(
    (v) => !v.execution_venue || v.execution_venue === 'hyperliquid'
  );

  const feesByWallet = new Map<string, { accrued: number; settled: number }>();
  for (const row of feeRes.data ?? []) {
    const w = String(row.wallet_address ?? '').toLowerCase();
    const cur = feesByWallet.get(w) ?? { accrued: 0, settled: 0 };
    const amount = num(row.accrued_fee_usd) || num(row.success_fee_usd);
    if (row.status === 'accrued') cur.accrued += amount;
    if (row.status === 'settled') cur.settled += num(row.success_fee_usd);
    feesByWallet.set(w, cur);
  }

  const paidByWallet = new Map<string, number>();
  for (const row of feePaymentsRes.data ?? []) {
    const w = String(row.wallet_address ?? '').toLowerCase();
    paidByWallet.set(w, (paidByWallet.get(w) ?? 0) + num(row.amount_usd));
  }

  const feeWinByWallet = new Map<string, number>();
  if (!feeWinViewRes.error && (feeWinViewRes.data?.length ?? 0) > 0) {
    for (const row of feeWinViewRes.data ?? []) {
      feeWinByWallet.set(
        String(row.wallet_address ?? '').toLowerCase(),
        num(row.unpaid_bot_win_count)
      );
    }
  } else {
    for (const row of feeWinLedgerRes.data ?? []) {
      const w = String(row.wallet_address ?? '').toLowerCase();
      feeWinByWallet.set(w, (feeWinByWallet.get(w) ?? 0) + 1);
    }
  }

  const activeBots: AdminHlBot[] = hlVaults.map((v) => {
    const w = String(v.wallet_address ?? '').toLowerCase();
    const agent = agents.get(w);
    const profile = v.user_id ? profileById.get(v.user_id) : undefined;
    const fees = feesByWallet.get(w) ?? { accrued: 0, settled: 0 };
    const feesPaid = paidByWallet.get(w) ?? 0;
    const feeWinCount = feeWinByWallet.get(w) ?? 0;
    const agentApproved = Boolean(agent);
    const bot_runnable = isBotRunnable(v, agentApproved, fees.accrued, feeWinCount);
    return {
      wallet_address: w,
      user_id: v.user_id ?? null,
      email: profile?.email ?? null,
      chain_id: v.chain_id != null ? num(v.chain_id) : undefined,
      auto_trade_enabled: Boolean(v.auto_trade_enabled),
      execution_venue: v.execution_venue ?? 'hyperliquid',
      leverage_multiplier: num(v.leverage_multiplier) || 1,
      take_profit_percent: num(v.take_profit_percent),
      stop_loss_percent: num(v.stop_loss_percent),
      hl_bot_strategy: v.hl_bot_strategy ?? null,
      news_trade_mode: v.news_trade_mode ?? null,
      updated_at: v.updated_at ?? new Date().toISOString(),
      agent_approved: agentApproved,
      agent_approved_at: agent?.approved_at ?? null,
      agent_expires_at: agent?.expires_at ?? null,
      bot_runnable,
      blockers: botBlockers(v, agentApproved, fees.accrued, feeWinCount),
      fees_accrued_usd: fees.accrued,
      fees_settled_usd: fees.settled,
      fees_paid_usd: feesPaid,
      fees_owed_usd: Math.max(0, fees.accrued - feesPaid),
      fee_win_count: feeWinCount,
      fee_opens_blocked: fees.accrued > 0.000_001 && feeWinCount >= FEE_WINS_BEFORE_BLOCK,
    };
  });

  const walletFeesByWallet = new Map<string, AdminWalletFee>();
  for (const v of hlVaults) {
    const w = String(v.wallet_address ?? '').toLowerCase();
    if (walletFeesByWallet.has(w)) continue;
    const profile = v.user_id ? profileById.get(v.user_id) : undefined;
    const fees = feesByWallet.get(w) ?? { accrued: 0, settled: 0 };
    const feesPaid = paidByWallet.get(w) ?? 0;
    const feesOwed = Math.max(0, fees.accrued - feesPaid);
    const feeWinCount = feeWinByWallet.get(w) ?? 0;
    walletFeesByWallet.set(w, {
      wallet_address: w,
      email: profile?.email ?? null,
      auto_trade_enabled: Boolean(v.auto_trade_enabled),
      fees_accrued_usd: fees.accrued,
      fees_settled_usd: fees.settled,
      fees_paid_usd: feesPaid,
      fees_owed_usd: feesOwed,
      fee_win_count: feeWinCount,
      wins_until_fee: Math.max(0, FEE_WINS_BEFORE_BLOCK - feeWinCount),
      fee_opens_blocked: fees.accrued > 0.000_001 && feeWinCount >= FEE_WINS_BEFORE_BLOCK,
      fee_payment_status:
        feesOwed <= 0.000_001 && (feesPaid > 0 || fees.settled > 0)
          ? ('paid' as const)
          : fees.accrued > 0.000_001
            ? ('owed' as const)
            : ('clear' as const),
    });
  }
  const wallet_fees: AdminWalletFee[] = [...walletFeesByWallet.values()].sort(
    (a, b) => b.fees_owed_usd - a.fees_owed_usd || b.fees_accrued_usd - a.fees_accrued_usd
  );

  const openPositions: AdminOpenPosition[] = (positionsRes.data ?? []).map((p) => ({
    id: p.id,
    wallet_address: String(p.wallet_address ?? '').toLowerCase(),
    token_symbol: p.token_symbol,
    direction: p.direction ?? 'LONG',
    status: p.status,
    entry_amount: num(p.entry_amount),
    entry_price: p.entry_price != null ? num(p.entry_price) : null,
    profit_loss: p.profit_loss != null ? num(p.profit_loss) : null,
    profit_loss_percent: p.profit_loss_percent != null ? num(p.profit_loss_percent) : null,
    leverage_multiplier: p.leverage_multiplier != null ? num(p.leverage_multiplier) : null,
    created_at: p.created_at,
  }));

  const recentCloses: AdminTradeClose[] = (tradeHistoryRes.data ?? []).map((t) => ({
    id: t.id,
    wallet_address: String(t.wallet_address ?? '').toLowerCase(),
    token_symbol: t.token_symbol,
    direction: t.direction ?? 'LONG',
    profit_loss: t.profit_loss != null ? num(t.profit_loss) : null,
    profit_loss_percent: t.profit_loss_percent != null ? num(t.profit_loss_percent) : null,
    close_reason: t.close_reason ?? null,
    execution_venue: t.execution_venue ?? null,
    platform_success_fee: t.platform_success_fee != null ? num(t.platform_success_fee) : null,
    platform_fee_status: t.platform_fee_status ?? null,
    closed_at: t.closed_at ?? '',
    email: profileByWallet.get(String(t.wallet_address ?? '').toLowerCase())?.email ?? null,
  }));

  const recentEvents: AdminTradeEvent[] = (eventsRes.data ?? []).map((e) => ({
    id: e.id,
    user_id: e.user_id,
    email: profileById.get(e.user_id)?.email ?? null,
    wallet_address: String(e.wallet_address ?? '').toLowerCase(),
    kind: e.kind,
    headline: e.headline,
    profit_loss: num(e.profit_loss),
    profit_loss_percent: e.profit_loss_percent != null ? num(e.profit_loss_percent) : null,
    closed_at: e.closed_at,
    read_at: e.read_at ?? null,
    email_sent_at: e.email_sent_at ?? null,
    created_at: e.created_at,
  }));

  const feeLedger: AdminFeeLedgerRow[] = (feeRes.data ?? []).map((f) => ({
    id: f.id,
    wallet_address: String(f.wallet_address ?? '').toLowerCase(),
    coin: f.coin,
    gross_profit_usd: num(f.gross_profit_usd),
    snapshot_pnl_usd:
      f.snapshot_pnl_usd != null && Number.isFinite(num(f.snapshot_pnl_usd))
        ? num(f.snapshot_pnl_usd)
        : null,
    success_fee_usd: num(f.success_fee_usd),
    status: f.status,
    close_reason: f.close_reason ?? null,
    created_at: f.created_at,
    settled_at: f.settled_at ?? null,
  }));

  const pnlAll = await aggregateHlTradeHistoryPnl();
  const pnl24h = await aggregateHlTradeHistoryPnl(dayAgo);

  const toggleOn = hlVaults.filter((v) => v.auto_trade_enabled).length;
  const runnable = activeBots.filter((b) => b.bot_runnable).length;
  const platformFeesPaid = [...paidByWallet.values()].reduce((s, n) => s + n, 0);
  const platformFeesOwed = feeLedger
    .filter((f) => f.status === 'accrued')
    .reduce((s, f) => s + f.success_fee_usd, 0);

  const stats: AdminHlStats = {
    total_users: profiles.length,
    users_with_wallet: profiles.filter((p) => p.wallet_address?.trim()).length,
    hl_bots_active: runnable,
    hl_bots_toggle_on: toggleOn,
    hl_bots_runnable: runnable,
    hl_bots_total: hlVaults.length,
    agents_approved: agentsRes.data?.length ?? 0,
    open_positions: openPositions.length,
    open_upnl_total: 0,
    closed_trades_24h: pnl24h.count,
    closed_trades_total: pnlAll.count,
    total_pnl: pnlAll.sum,
    pnl_24h: pnl24h.sum,
    win_rate:
      pnlAll.count > 0 ? Math.round((pnlAll.wins / pnlAll.count) * 1000) / 10 : 0,
    hl_fees_accrued_usd: feeLedger
      .filter((f) => f.status === 'accrued')
      .reduce((s, f) => s + f.success_fee_usd, 0),
    hl_fees_settled_usd: feeLedger
      .filter((f) => f.status === 'settled')
      .reduce((s, f) => s + f.success_fee_usd, 0),
    hl_fees_total_usd: feeLedger.reduce((s, f) => s + f.success_fee_usd, 0),
    platform_fees_owed_usd: platformFeesOwed,
    platform_fees_paid_usd: platformFeesPaid,
    notifications_pending_email: recentEvents.filter((e) => !e.email_sent_at).length,
    betting_open: bettingPosRes.data?.length ?? 0,
    active_subscriptions: (subsRes.data ?? []).filter((s) => s.status === 'active').length,
  };

  return {
    generated_at: new Date().toISOString(),
    stats,
    active_bots: activeBots,
    wallet_fees,
    open_positions: openPositions,
    recent_closes: recentCloses,
    recent_events: recentEvents,
    fee_ledger: feeLedger,
    betting_positions: (bettingPosRes.data ?? []) as AdminBettingPosition[],
    betting_closes: (bettingCloseRes.data ?? []) as AdminBettingClose[],
    users: profiles as AdminUserRow[],
    subscriptions: (subsRes.data ?? []) as AdminSubscriptionRow[],
  };
}

function isStaleAdminRpc(dash: Partial<AdminHlDashboard> | null | undefined): boolean {
  if (!dash) return true;
  if (dash.stats?.hl_bots_runnable == null) return true;
  if (!Array.isArray(dash.wallet_fees)) return true;
  const bots = dash.active_bots ?? [];
  if (bots.length > 0 && bots.some((b) => b.bot_runnable === undefined)) return true;
  return false;
}

export async function fetchAdminHlDashboard(): Promise<AdminHlDashboardResult> {
  const { data, error } = await supabase.rpc('get_admin_hl_dashboard');
  if (!error && data && !isStaleAdminRpc(data as Partial<AdminHlDashboard>)) {
    const enriched = await enrichAdminHlDashboard(
      normalizeAdminHlDashboard(data as Partial<AdminHlDashboard>)
    );
    return { data: enriched, error: null, source: 'rpc' };
  }

  if (error) {
    console.error('[adminDashboard] rpc failed', error);
  } else if (data) {
    console.warn('[adminDashboard] rpc schema stale — using table fallback');
  }

  const fallback = await fetchAdminHlDashboardViaTables();
  if (fallback) {
    const enriched = await enrichAdminHlDashboard(normalizeAdminHlDashboard(fallback));
    return {
      data: enriched,
      error: null,
      source: 'tables',
    };
  }

  const session = await fetchAdminSessionCheck();
  const msg = error?.message?.trim() || error?.code || 'RPC failed';

  if (session && !session.is_admin) {
    return {
      data: null,
      error: `Supabase session is not admin (signed in as ${session.email || 'unknown'}). Sign in with lorenzo.vanza@hotmail.com or ipsunlorem@gmail.com.`,
    };
  }

  if (/admin access required/i.test(msg)) {
    return {
      data: null,
      error: `Admin RPC denied (${msg}). Session email: ${session?.email ?? 'unknown'}.`,
    };
  }

  if (/could not find the function/i.test(msg)) {
    return {
      data: null,
      error: `Admin RPC not found on Supabase (${msg}). Run pending migrations and reload API schema.`,
    };
  }

  if (/admin_dashboard:/i.test(msg)) {
    return { data: null, error: msg };
  }

  return {
    data: null,
    error: session
      ? `Admin snapshot failed: ${msg} (session ${session.email}, is_admin=${session.is_admin})`
      : `Admin snapshot failed: ${msg}`,
  };
}

export async function fetchAdminLiveContext(): Promise<AdminLiveContext> {
  const base = getBotApiBase();
  const builder = await fetchHlBuilderPlatformStatus();

  let health: BotServiceHealth | null = null;
  let serviceStatus: BotServiceStatus | null = null;

  try {
    const [healthRes, statusRes] = await Promise.all([
      fetch(`${base}/health`),
      fetch(`${base}/api/service-status`),
    ]);
    if (healthRes.ok) {
      health = (await healthRes.json()) as BotServiceHealth;
    }
    if (statusRes.ok) {
      serviceStatus = (await statusRes.json()) as BotServiceStatus;
    }
  } catch (e) {
    console.warn('[adminDashboard] bot-service unreachable', e);
  }

  return { builder, health, serviceStatus };
}

function closeReasonStem(reason: string | null | undefined): string {
  return (reason ?? '')
    .replace(/ ‖ fill pending$/, '')
    .replace(/ ‖ signal uPnL.*$/, '')
    .slice(0, 120);
}

function dedupeAdminTradeCloses(rows: AdminTradeClose[]): AdminTradeClose[] {
  const seen = new Set<string>();
  const out: AdminTradeClose[] = [];
  for (const t of rows) {
    const stem = closeReasonStem(t.close_reason);
    const key = `${t.wallet_address.toLowerCase()}:${t.token_symbol.toUpperCase()}:${t.direction}:${stem}:${t.profit_loss ?? t.snapshot_pnl_usd ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/** Ensure user rows always carry fee-cycle fields from wallet_fees / active_bots. */
function mergeAdminUserFeeFields(dash: AdminHlDashboard): AdminHlDashboard {
  const FEE_WINS_BEFORE_BLOCK = 20;
  const feeByWallet = new Map<string, AdminWalletFee>();
  for (const w of dash.wallet_fees ?? []) {
    feeByWallet.set(w.wallet_address.toLowerCase(), w);
  }

  const openByWallet = new Map<string, number>();
  for (const p of dash.open_positions ?? []) {
    const w = p.wallet_address.toLowerCase();
    openByWallet.set(w, (openByWallet.get(w) ?? 0) + 1);
  }

  const users = dash.users.map((u) => {
    const w = u.wallet_address?.trim().toLowerCase();
    if (!w) return u;

    const fee = feeByWallet.get(w);
    const bot = dash.active_bots.find((b) => b.wallet_address === w);
    const feeWinCount =
      fee?.fee_win_count ?? bot?.fee_win_count ?? u.fee_win_count ?? 0;
    const feesAccrued =
      fee?.fees_accrued_usd ?? bot?.fees_accrued_usd ?? u.fees_accrued_usd ?? 0;
    const feesPaid = fee?.fees_paid_usd ?? bot?.fees_paid_usd ?? u.fees_paid_usd ?? 0;
    const feesSettled =
      fee?.fees_settled_usd ?? bot?.fees_settled_usd ?? u.fees_settled_usd ?? 0;

    return {
      ...u,
      open_positions_count: openByWallet.get(w) ?? u.open_positions_count ?? 0,
      fees_accrued_usd: feesAccrued,
      fees_settled_usd: feesSettled,
      fees_paid_usd: feesPaid,
      fee_win_count: feeWinCount,
      wins_until_fee: Math.max(0, FEE_WINS_BEFORE_BLOCK - feeWinCount),
    };
  });

  return { ...dash, users };
}

type AdminWalletBotStatsRow = {
  wallet_address: string;
  bot_closed_trades_count: number;
  bot_profitable_closes: number;
  bot_closed_pnl_usd: number;
  lifetime_bot_fee_wins: number;
  unpaid_bot_fee_wins: number;
  fees_accrued_usd: number;
  fees_settled_usd: number;
  fees_paid_usd: number;
};

async function fetchAdminWalletBotStats(
  wallets: string[]
): Promise<Map<string, AdminWalletBotStatsRow>> {
  const unique = [...new Set(wallets.map((w) => w.trim().toLowerCase()).filter(Boolean))];
  const out = new Map<string, AdminWalletBotStatsRow>();
  if (unique.length === 0) return out;

  const { data, error } = await supabase.rpc('get_admin_wallet_bot_stats', {
    p_wallets: unique,
  });
  if (error) {
    console.warn('[adminDashboard] get_admin_wallet_bot_stats unavailable', error.message);
    return out;
  }

  for (const row of (data ?? []) as AdminWalletBotStatsRow[]) {
    const w = String(row.wallet_address ?? '').toLowerCase();
    if (w) out.set(w, row);
  }
  return out;
}

function mergeWalletBotStatsIntoDashboard(
  dash: AdminHlDashboard,
  statsByWallet: Map<string, AdminWalletBotStatsRow>
): AdminHlDashboard {
  if (statsByWallet.size === 0) return dash;

  const active_bots = dash.active_bots.map((b) => {
    const s = statsByWallet.get(b.wallet_address.toLowerCase());
    if (!s) return b;
    return {
      ...b,
      bot_closed_trades_count: s.bot_closed_trades_count,
      bot_profitable_closes: s.bot_profitable_closes,
      bot_closed_pnl_usd: s.bot_closed_pnl_usd,
      lifetime_bot_fee_wins: s.lifetime_bot_fee_wins,
      fee_win_count: s.unpaid_bot_fee_wins,
      fees_accrued_usd: s.fees_accrued_usd,
      fees_settled_usd: s.fees_settled_usd,
      fees_paid_usd: s.fees_paid_usd,
      fees_owed_usd: Math.max(0, s.fees_accrued_usd - s.fees_paid_usd),
    };
  });

  const botByUserId = new Map(
    active_bots.filter((b) => b.user_id).map((b) => [b.user_id as string, b])
  );
  const botByWallet = new Map(active_bots.map((b) => [b.wallet_address.toLowerCase(), b]));

  const users = dash.users.map((u) => {
    const w = u.wallet_address?.trim().toLowerCase() ?? '';
    const bot = (u.id ? botByUserId.get(u.id) : undefined) ?? (w ? botByWallet.get(w) : undefined);
    const effectiveWallet = bot?.wallet_address ?? w;
    const s = effectiveWallet ? statsByWallet.get(effectiveWallet) : undefined;
    if (!s && !bot) return u;
    return {
      ...u,
      wallet_address: effectiveWallet || u.wallet_address,
      closed_trades_count: s?.bot_closed_trades_count ?? u.closed_trades_count,
      closed_pnl_total: s?.bot_closed_pnl_usd ?? u.closed_pnl_total,
      fees_accrued_usd: s?.fees_accrued_usd ?? u.fees_accrued_usd,
      fees_settled_usd: s?.fees_settled_usd ?? u.fees_settled_usd,
      fees_paid_usd: s?.fees_paid_usd ?? u.fees_paid_usd,
      fee_win_count: s?.unpaid_bot_fee_wins ?? u.fee_win_count,
      wins_until_fee: Math.max(0, 20 - (s?.unpaid_bot_fee_wins ?? u.fee_win_count ?? 0)),
      lifetime_bot_fee_wins: s?.lifetime_bot_fee_wins,
    };
  });

  return { ...dash, active_bots, users };
}

export type AdminWalletFeeAudit = {
  wallet_address: string;
  generated_at: string;
  fee_exempt?: boolean;
  profile?: { email?: string | null; wallet_address?: string | null } | null;
  trade_history?: {
    closed_count?: number;
    profitable_count?: number;
    closed_pnl_usd?: number;
    last_closed_at?: string | null;
  };
  fee_ledger?: {
    unpaid_bot_wins?: number;
    lifetime_bot_wins?: number;
    settled_bot_wins?: number;
    fees_accrued_usd?: number;
    fees_settled_usd?: number;
    fees_total_usd?: number;
  };
  fees_paid_usd?: number;
  cache_state?: { success_win_count?: number; updated_at?: string } | null;
  wallet_mismatch?: Record<string, unknown>;
  recent_closes?: Array<Record<string, unknown>>;
  recent_ledger_rows?: Array<Record<string, unknown>>;
};

/** Read-only per-wallet audit (admin RPC). Does not change fee gates. */
export async function fetchAdminWalletFeeAudit(
  wallet: string
): Promise<AdminWalletFeeAudit | null> {
  const w = wallet.trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(w)) return null;
  const { data, error } = await supabase.rpc('get_admin_wallet_fee_audit', { p_wallet: w });
  if (error) {
    console.error('[adminDashboard] get_admin_wallet_fee_audit failed', error.message);
    return null;
  }
  return data as AdminWalletFeeAudit;
}

/** Overlay live HL perps + authoritative HL close P/L stats onto the DB snapshot. */
export async function enrichAdminHlDashboard(
  dash: AdminHlDashboard
): Promise<AdminHlDashboard> {
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const [hlLive, pnlAll, pnl24h] = await Promise.all([
    fetchAdminHlLiveOpenPositions(dash),
    aggregateHlTradeHistoryPnl(),
    aggregateHlTradeHistoryPnl(dayAgo),
  ]);

  const hlCloses = dedupeAdminTradeCloses(
    dash.recent_closes.filter((t) => isHlBotCloseVenue(t.execution_venue))
  );
  const openUpnl = sumAdminOpenUpnl(hlLive);

  const walletList = [
    ...dash.active_bots.map((b) => b.wallet_address),
    ...dash.users.map((u) => u.wallet_address ?? ''),
  ];
  const statsByWallet = await fetchAdminWalletBotStats(walletList);

  return mergeAdminUserFeeFields(
    mergeWalletBotStatsIntoDashboard(
      {
        ...dash,
        open_positions: hlLive,
        recent_closes: hlCloses,
        stats: {
          ...dash.stats,
          open_positions: hlLive.length,
          open_upnl_total: openUpnl,
          closed_trades_24h: pnl24h.count,
          closed_trades_total: pnlAll.count,
          total_pnl: pnlAll.sum,
          pnl_24h: pnl24h.sum,
          win_rate:
            pnlAll.count > 0 ? Math.round((pnlAll.wins / pnlAll.count) * 1000) / 10 : 0,
        },
        generated_at: new Date().toISOString(),
      },
      statsByWallet
    )
  );
}

function mapAdminTradeCloseRow(raw: Record<string, unknown>): AdminTradeClose {
  return {
    id: String(raw.id),
    wallet_address: String(raw.wallet_address ?? ''),
    token_symbol: String(raw.token_symbol ?? ''),
    direction: String(raw.direction ?? 'LONG'),
    leverage: raw.leverage != null ? num(raw.leverage) : null,
    entry_price: raw.entry_price != null ? num(raw.entry_price) : null,
    exit_price: raw.exit_price != null ? num(raw.exit_price) : null,
    entry_amount: raw.entry_amount != null ? num(raw.entry_amount) : null,
    exit_amount: raw.exit_amount != null ? num(raw.exit_amount) : null,
    profit_loss: raw.profit_loss != null ? num(raw.profit_loss) : null,
    profit_loss_percent:
      raw.profit_loss_percent != null ? num(raw.profit_loss_percent) : null,
    snapshot_pnl_usd: raw.snapshot_pnl_usd != null ? num(raw.snapshot_pnl_usd) : null,
    close_reason: raw.close_reason != null ? String(raw.close_reason) : null,
    execution_venue: raw.execution_venue != null ? String(raw.execution_venue) : null,
    platform_success_fee:
      raw.platform_success_fee != null ? num(raw.platform_success_fee) : null,
    platform_fee_status:
      raw.platform_fee_status != null ? String(raw.platform_fee_status) : null,
    closed_at: String(raw.closed_at ?? ''),
    email: raw.email != null ? String(raw.email) : null,
  };
}

function isMissingAdminTradeHistoryRpc(error: {
  code?: string;
  message?: string;
  details?: string;
}): boolean {
  const msg = `${error.message ?? ''} ${error.details ?? ''}`;
  return (
    error.code === 'PGRST202' ||
    error.code === '42883' ||
    /Could not find the function/i.test(msg) ||
    /function public\.get_admin_hl_trade_history/i.test(msg)
  );
}

function parseAdminHlTradeHistoryPayload(
  data: unknown,
  pageSize: number
): AdminHlTradeHistoryPage {
  const payload = (data ?? {}) as {
    total?: number;
    limit?: number;
    offset?: number;
    rows?: Record<string, unknown>[];
    user_stats?: Record<string, unknown> | null;
  };

  const rawStats = payload.user_stats;
  const userStats: AdminTradeHistoryUserStats | null = rawStats
    ? {
        wallet_address: String(rawStats.wallet_address ?? ''),
        email: rawStats.email != null ? String(rawStats.email) : null,
        closed_pnl_total: num(rawStats.closed_pnl_total),
        closed_trades_count: Number(rawStats.closed_trades_count) || 0,
        open_positions_count: Number(rawStats.open_positions_count) || 0,
        fees_accrued_usd: num(rawStats.fees_accrued_usd),
        fees_paid_usd: num(rawStats.fees_paid_usd),
        fee_win_count: Number(rawStats.fee_win_count) || 0,
        wins_until_fee: Number(rawStats.wins_until_fee) || 0,
        lifetime_bot_fee_wins: Number(rawStats.lifetime_bot_fee_wins) || 0,
      }
    : null;

  return {
    total: Number(payload.total) || 0,
    limit: Number(payload.limit) || pageSize,
    offset: Number(payload.offset) || 0,
    rows: (payload.rows ?? []).map(mapAdminTradeCloseRow),
    user_stats: userStats,
  };
}

/** Full paginated HL trade_history for admin History tab. */
export async function fetchAdminHlTradeHistory(
  opts: {
    limit?: number;
    offset?: number;
    wallet?: string | null;
    email?: string | null;
  } = {}
): Promise<AdminHlTradeHistoryPage> {
  const pageSize = Math.min(500, Math.max(1, opts.limit ?? 25));
  const offset = Math.max(0, opts.offset ?? 0);
  const wallet = opts.wallet?.trim() || null;
  const email = opts.email?.trim() || null;

  const { data, error } = await supabase.rpc('get_admin_hl_trade_history', {
    p_limit: pageSize,
    p_offset: offset,
    p_wallet: wallet,
    p_email: email,
  });

  if (!error) {
    return parseAdminHlTradeHistoryPayload(data, pageSize);
  }

  if (isMissingAdminTradeHistoryRpc(error)) {
    const legacy = await supabase.rpc('get_admin_hl_trade_history', {
      p_limit: pageSize,
      p_offset: offset,
    });
    if (!legacy.error) {
      const page = parseAdminHlTradeHistoryPayload(legacy.data, pageSize);
      if (!wallet && !email) return page;

      const walletNeedle = wallet?.toLowerCase() ?? '';
      const emailNeedle = email?.toLowerCase() ?? '';
      const rows = page.rows.filter((row) => {
        const walletMatch =
          !walletNeedle || row.wallet_address.toLowerCase().includes(walletNeedle);
        const emailMatch =
          !emailNeedle || (row.email ?? '').toLowerCase().includes(emailNeedle);
        return walletMatch && emailMatch;
      });
      return { ...page, rows, user_stats: null };
    }
    console.error('[adminDashboard] get_admin_hl_trade_history legacy failed', legacy.error);
    return { total: 0, limit: pageSize, offset, rows: [], user_stats: null };
  }

  console.error('[adminDashboard] get_admin_hl_trade_history failed', error);
  return { total: 0, limit: pageSize, offset, rows: [], user_stats: null };
}

/** Load every HL close row (paginated RPC, max 5k per page). */
export async function fetchAllAdminHlTradeHistory(): Promise<AdminHlTradeHistoryPage> {
  const pageSize = 5000;
  let offset = 0;
  let total = 0;
  const rows: AdminTradeClose[] = [];

  for (;;) {
    const page = await fetchAdminHlTradeHistory({ limit: pageSize, offset });
    total = page.total;
    const batch = page.rows ?? [];
    rows.push(...batch);
    offset += batch.length;
    if (batch.length === 0 || offset >= total) break;
  }

  return { total, limit: pageSize, offset: 0, rows };
}

export function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function shortWallet(addr: string | null | undefined, chars = 6): string {
  if (!addr) return '—';
  const a = addr.toLowerCase();
  if (a.length < chars * 2 + 2) return a;
  return `${a.slice(0, chars)}…${a.slice(-4)}`;
}

export function fmtUsd(
  n: number | null | undefined,
  signed = false,
  decimals = 2
): string {
  const v = Number(n) || 0;
  const prefix = signed && v > 0 ? '+' : '';
  return `${prefix}$${v.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

/** Admin trade P/L — 4 decimal places. */
export function fmtUsdTrade(n: number | null | undefined, signed = false): string {
  return fmtUsd(n, signed, 4);
}
