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

export async function fetchAdminNotifications(limit = 40): Promise<AdminNotification[]> {
  const { data, error } = await supabase
    .from('admin_notifications')
    .select('id, kind, title, body, payload, read_at, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as AdminNotification[];
}

export async function markAdminNotificationsRead(ids?: string[]): Promise<number> {
  const { data, error } = await supabase.rpc('mark_admin_notifications_read', {
    p_ids: ids?.length ? ids : null,
  });
  if (error) throw error;
  return Number(data ?? 0);
}
