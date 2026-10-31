import { supabase } from './supabase';

export type AdminNotification = {
  id: string;
  kind: 'signup' | 'support' | string;
  title: string;
  body: string | null;
  payload: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
};

/** Real signups from profiles (not stale admin_notifications). Rolling window. */
export type RecentSignupRow = {
  id: string;
  email: string | null;
  username: string | null;
  full_name: string | null;
  wallet_address: string | null;
  created_at: string;
};

export async function fetchAdminNotifications(limit = 40): Promise<AdminNotification[]> {
  const { data, error } = await supabase
    .from('admin_notifications')
    .select('id, kind, title, body, payload, read_at, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as AdminNotification[];
}

/**
 * Profiles created in the last `withinHours` (default 24).
 * Source of truth for Admin “New registrations” — drops week-old unread noise.
 */
export async function fetchRecentProfileSignups(
  withinHours = 24,
  limit = 100
): Promise<RecentSignupRow[]> {
  const since = new Date(Date.now() - withinHours * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, username, full_name, wallet_address, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as RecentSignupRow[];
}

export async function markAdminNotificationsRead(ids?: string[]): Promise<number> {
  const { data, error } = await supabase.rpc('mark_admin_notifications_read', {
    p_ids: ids?.length ? ids : null,
  });
  if (error) throw error;
  return Number(data ?? 0);
}
