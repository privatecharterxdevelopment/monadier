import { supabase } from './supabase';
import { getAuthUserId } from './userWallets';
import { devError } from './devLog';
import type { ActivityNotification } from './activityNotifications';

export type UserTradeNotificationRow = {
  id: string;
  user_id: string;
  trade_history_id: string | null;
  hl_betting_close_id?: string | null;
  community_post_id?: string | null;
  community_comment_id?: string | null;
  wallet_address: string;
  kind: 'bot' | 'manual' | 'betting' | 'community' | 'follow';
  headline: string;
  detail: string | null;
  event_type: 'open' | 'close' | 'mention' | null;
  profit_loss: number;
  profit_loss_percent: number | null;
  closed_at: string;
  read_at: string | null;
  /** Joined when present — source of truth for closed PnL (matches email). */
  trade_history?:
    | {
        profit_loss: number | string | null;
        profit_loss_percent: number | string | null;
      }
    | Array<{
        profit_loss: number | string | null;
        profit_loss_percent: number | string | null;
      }>
    | null;
};

function realizedPnlFromRow(row: UserTradeNotificationRow): {
  profitLoss: number;
  profitLossPercent: number | null;
} {
  const thRaw = row.trade_history;
  const th = Array.isArray(thRaw) ? thRaw[0] ?? null : thRaw ?? null;
  const fromTh =
    th?.profit_loss != null && Number.isFinite(Number(th.profit_loss))
      ? Number(th.profit_loss)
      : null;
  const profitLoss = fromTh != null ? fromTh : Number(row.profit_loss) || 0;
  const pctRaw = th?.profit_loss_percent ?? row.profit_loss_percent;
  const profitLossPercent =
    pctRaw != null && Number.isFinite(Number(pctRaw)) ? Number(pctRaw) : null;
  return { profitLoss, profitLossPercent };
}

export function userTradeNotificationToActivity(row: UserTradeNotificationRow): ActivityNotification {
  if (row.kind === 'community') {
    return {
      id: `un-${row.id}`,
      kind: 'community',
      headline: row.headline,
      detail: row.detail,
      eventType: 'mention',
      profitLoss: 0,
      profitLossPercent: null,
      closedAt: row.closed_at,
      highlightId: row.community_post_id ?? null,
      dbId: row.id,
      readAt: row.read_at,
    };
  }

  if (row.kind === 'follow') {
    const wallet = row.wallet_address?.toLowerCase() ?? '';
    return {
      id: `un-${row.id}`,
      kind: 'follow',
      headline: row.headline,
      detail: row.detail,
      eventType: 'open',
      profitLoss: 0,
      profitLossPercent: null,
      closedAt: row.closed_at,
      highlightId: wallet || null,
      verifyUrl: /^0x[a-f0-9]{40}$/.test(wallet)
        ? `https://hypurrscan.io/address/${wallet}`
        : null,
      dbId: row.id,
      readAt: row.read_at,
    };
  }

  const isBetting = row.kind === 'betting';
  const { profitLoss, profitLossPercent } = realizedPnlFromRow(row);
  return {
    id: `un-${row.id}`,
    kind: isBetting ? 'betting' : 'bot',
    headline: row.headline,
    detail: row.detail,
    eventType: row.event_type === 'open' ? 'open' : 'close',
    profitLoss,
    profitLossPercent,
    closedAt: row.closed_at,
    highlightId: row.trade_history_id ?? row.hl_betting_close_id ?? null,
    dbId: row.id,
    readAt: row.read_at,
  };
}

/** Only rows tied to a real close (or AI bet open / community mention) — matches email queue. */
export function isBellEligibleNotification(row: UserTradeNotificationRow): boolean {
  if (row.kind === 'follow') return true;
  if (row.kind === 'community' && row.community_post_id) return true;
  if (row.kind === 'betting' && row.event_type === 'open') return true;
  if (row.trade_history_id) return true;
  if (row.hl_betting_close_id) return true;
  return false;
}

export async function fetchUserTradeNotifications(limit = 100): Promise<ActivityNotification[]> {
  const userId = await getAuthUserId();
  if (!userId) return [];

  const cols =
    'id, user_id, trade_history_id, hl_betting_close_id, community_post_id, community_comment_id, wallet_address, kind, headline, detail, event_type, profit_loss, profit_loss_percent, closed_at, read_at, trade_history ( profit_loss, profit_loss_percent )';

  const { data, error } = await supabase
    .from('user_trade_notifications')
    .select(cols)
    .eq('user_id', userId)
    .order('closed_at', { ascending: false })
    .limit(limit);

  if (error) {
    const legacy = await supabase
      .from('user_trade_notifications')
      .select(
        'id, user_id, trade_history_id, wallet_address, kind, headline, profit_loss, profit_loss_percent, closed_at, read_at'
      )
      .eq('user_id', userId)
      .order('closed_at', { ascending: false })
      .limit(limit);
    if (legacy.error) {
      devError('[fetchUserTradeNotifications]', legacy.error);
      return [];
    }
    return (legacy.data ?? [])
      .map((row) =>
        userTradeNotificationToActivity({
          ...(row as UserTradeNotificationRow),
          detail: null,
          event_type: 'close',
          hl_betting_close_id: null,
          community_post_id: null,
          community_comment_id: null,
        })
      )
      .filter((n) => Boolean(n.highlightId) || n.eventType === 'open');
  }

  return (data ?? [])
    .filter((row) => isBellEligibleNotification(row as UserTradeNotificationRow))
    .map((row) => userTradeNotificationToActivity(row as UserTradeNotificationRow));
}

export async function markUserTradeNotificationsReadThrough(closedAt: string): Promise<void> {
  const userId = await getAuthUserId();
  if (!userId) return;

  const { error } = await supabase
    .from('user_trade_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null)
    .lte('closed_at', closedAt);

  if (error) devError('[markUserTradeNotificationsReadThrough]', error);
}

export async function markAllUserTradeNotificationsRead(): Promise<void> {
  const userId = await getAuthUserId();
  if (!userId) return;

  const { error } = await supabase
    .from('user_trade_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null);

  if (error) devError('[markAllUserTradeNotificationsRead]', error);
}
