import { supabase } from './supabase';
import { getAuthUserId } from './userWallets';
import { devError } from './devLog';
import type { ActivityNotification } from './activityNotifications';

export type UserTradeNotificationRow = {
  id: string;
  user_id: string;
  trade_history_id: string | null;
  hl_betting_close_id?: string | null;
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
  const isBetting = row.kind === 'betting';
  return {
    id: `un-${row.id}`,
    kind: isBetting ? 'betting' : 'bot',
    headline: row.headline,
    detail: row.detail,
    eventType: row.event_type === 'open' ? 'open' : 'close',
    profitLoss: Number(row.profit_loss) || 0,
    profitLossPercent:
      row.profit_loss_percent != null ? Number(row.profit_loss_percent) : null,
    closedAt: row.closed_at,
    highlightId: row.trade_history_id ?? row.hl_betting_close_id ?? null,
    dbId: row.id,
    readAt: row.read_at,
  };
}

/** Only rows tied to a real close (or AI bet open) — matches email queue source. */
export function isBellEligibleNotification(row: UserTradeNotificationRow): boolean {
  if (row.kind === 'betting' && row.event_type === 'open') return true;
  if (row.trade_history_id) return true;
  if (row.hl_betting_close_id) return true;
  return false;
}

export async function fetchUserTradeNotifications(limit = 100): Promise<ActivityNotification[]> {
  const userId = await getAuthUserId();
  if (!userId) return [];

  const cols =
    'id, user_id, trade_history_id, hl_betting_close_id, wallet_address, kind, headline, detail, event_type, profit_loss, profit_loss_percent, closed_at, read_at';

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
