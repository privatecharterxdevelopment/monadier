import { supabase } from './supabase';
import { getAuthUserId } from './userWallets';
import { devError } from './devLog';
import type { ActivityNotification } from './activityNotifications';

export type UserTradeNotificationRow = {
  id: string;
  user_id: string;
  trade_history_id: string | null;
  wallet_address: string;
  kind: 'bot' | 'manual' | 'betting';
  headline: string;
  detail: string | null;
  event_type: 'open' | 'close' | null;
  profit_loss: number;
  profit_loss_percent: number | null;
  closed_at: string;
  read_at: string | null;
};

export function userTradeNotificationToActivity(row: UserTradeNotificationRow): ActivityNotification {
  return {
    id: `un-${row.id}`,
    kind: row.kind === 'betting' ? 'betting' : 'bot',
    headline: row.headline,
    detail: row.detail,
    eventType: row.event_type === 'open' ? 'open' : 'close',
    profitLoss: Number(row.profit_loss) || 0,
    profitLossPercent:
      row.profit_loss_percent != null ? Number(row.profit_loss_percent) : null,
    closedAt: row.closed_at,
    highlightId: row.trade_history_id,
    dbId: row.id,
    readAt: row.read_at,
  };
}

export async function fetchUserTradeNotifications(limit = 100): Promise<ActivityNotification[]> {
  const userId = await getAuthUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from('user_trade_notifications')
    .select(
      'id, user_id, trade_history_id, wallet_address, kind, headline, detail, event_type, profit_loss, profit_loss_percent, closed_at, read_at'
    )
    .eq('user_id', userId)
    .order('closed_at', { ascending: false })
    .limit(limit);

  if (error) {
    // detail/event_type may be missing pre-migration
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
    return (legacy.data ?? []).map((row) =>
      userTradeNotificationToActivity({
        ...(row as UserTradeNotificationRow),
        detail: null,
        event_type: 'close',
      })
    );
  }

  return (data ?? []).map((row) =>
    userTradeNotificationToActivity(row as UserTradeNotificationRow)
  );
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
