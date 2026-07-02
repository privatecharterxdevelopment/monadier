import { supabase } from './supabase';

export type SupportRequestStatus = 'open' | 'resolved';

export type SupportRequestRow = {
  id: string;
  user_id: string;
  subject: string;
  message: string;
  user_email: string | null;
  user_full_name: string | null;
  user_username: string | null;
  wallet_address: string | null;
  status: SupportRequestStatus;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  admin_notes: string | null;
};

export async function fetchAdminSupportRequests(opts?: {
  status?: SupportRequestStatus | 'all';
  limit?: number;
}): Promise<{ rows: SupportRequestRow[]; error: string | null }> {
  const limit = opts?.limit ?? 100;
  let query = supabase
    .from('support_requests')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (opts?.status && opts.status !== 'all') {
    query = query.eq('status', opts.status);
  }

  const { data, error } = await query;
  if (error) {
    return { rows: [], error: error.message };
  }
  return { rows: (data ?? []) as SupportRequestRow[], error: null };
}

export async function resolveSupportRequest(
  requestId: string
): Promise<{ ok: boolean; error: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: 'Not signed in' };
  }

  const { error } = await supabase
    .from('support_requests')
    .update({
      status: 'resolved',
      resolved_at: new Date().toISOString(),
      resolved_by: user.id,
    })
    .eq('id', requestId)
    .eq('status', 'open');

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true, error: null };
}

export async function reopenSupportRequest(
  requestId: string
): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await supabase
    .from('support_requests')
    .update({
      status: 'open',
      resolved_at: null,
      resolved_by: null,
    })
    .eq('id', requestId)
    .eq('status', 'resolved');

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true, error: null };
}
