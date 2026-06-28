import { supabase } from './supabase';
import { getBotApiBase } from './signalService';
import { fetchHlBuilderPlatformStatus, type HlBuilderPlatformStatus } from './hyperliquid/builderPlatform';

export type AdminHlStats = {
  total_users: number;
  users_with_wallet: number;
  hl_bots_active: number;
  hl_bots_total: number;
  agents_approved: number;
  open_positions: number;
  closed_trades_24h: number;
  closed_trades_total: number;
  total_pnl: number;
  pnl_24h: number;
  win_rate: number;
  hl_fees_accrued_usd: number;
  hl_fees_settled_usd: number;
  hl_fees_total_usd: number;
  notifications_pending_email: number;
  betting_open: number;
  active_subscriptions: number;
};

export type AdminHlBot = {
  wallet_address: string;
  user_id: string | null;
  email: string | null;
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
};

export type AdminOpenPosition = {
  id: string;
  wallet_address: string;
  token_symbol: string;
  direction: string;
  status: string;
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
  profit_loss: number | null;
  profit_loss_percent: number | null;
  close_reason: string | null;
  execution_venue: string | null;
  platform_success_fee: number | null;
  platform_fee_status: string | null;
  closed_at: string;
  email: string | null;
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

export type AdminPaymentRow = {
  id: string;
  user_id: string;
  wallet_address: string;
  plan_tier: string;
  billing_cycle: string;
  expected_amount: number;
  status: string;
  tx_hash: string | null;
  created_at: string;
  completed_at: string | null;
};

export type AdminHlDashboard = {
  generated_at: string;
  stats: AdminHlStats;
  active_bots: AdminHlBot[];
  open_positions: AdminOpenPosition[];
  recent_closes: AdminTradeClose[];
  recent_events: AdminTradeEvent[];
  fee_ledger: AdminFeeLedgerRow[];
  betting_positions: AdminBettingPosition[];
  betting_closes: AdminBettingClose[];
  users: AdminUserRow[];
  subscriptions: AdminSubscriptionRow[];
  payments: AdminPaymentRow[];
};

export type BotServiceHealth = {
  status: string;
  uptime?: string;
  tradesExecuted?: number;
  lastCheck?: string;
  version?: string;
  gitCommit?: string | null;
  lastCycle?: Record<string, unknown> | null;
};

export type BotServiceStatus = {
  success: boolean;
  service?: string;
  executionVenue?: string;
  activeAutoTradeWallets?: number;
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

export async function fetchAdminHlDashboard(): Promise<AdminHlDashboard | null> {
  const { data, error } = await supabase.rpc('get_admin_hl_dashboard');
  if (error) {
    console.error('[adminDashboard] rpc failed', error);
    return null;
  }
  return data as AdminHlDashboard;
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

export function fmtUsd(n: number | null | undefined, signed = false): string {
  const v = Number(n) || 0;
  const prefix = signed && v > 0 ? '+' : '';
  return `${prefix}$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
