import { supabase } from './supabase';
import type { SupportRequestRow } from './adminSupportRequests';

export type SupportMessageRow = {
  id: string;
  request_id: string;
  sender_id: string;
  sender_role: 'user' | 'admin';
  body: string;
  created_at: string;
};

export async function fetchMyOpenSupportRequest(): Promise<{
  row: SupportRequestRow | null;
  error: string | null;
}> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { row: null, error: 'Not signed in' };

  const { data, error } = await supabase
    .from('support_requests')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { row: null, error: error.message };
  return { row: (data as SupportRequestRow | null) ?? null, error: null };
}

export async function fetchSupportMessages(
  requestId: string
): Promise<{ rows: SupportMessageRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('support_messages')
    .select('id, request_id, sender_id, sender_role, body, created_at')
    .eq('request_id', requestId)
    .order('created_at', { ascending: true })
    .limit(500);

  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as SupportMessageRow[], error: null };
}

export async function sendSupportChatReply(
  requestId: string,
  body: string,
  role: 'user' | 'admin' = 'user'
): Promise<{ row: SupportMessageRow | null; error: string | null }> {
  const text = body.trim();
  if (text.length < 1) {
    return { row: null, error: 'Message cannot be empty.' };
  }
  if (text.length > 5000) {
    return { row: null, error: 'Message is too long.' };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { row: null, error: 'Not signed in' };

  if (role === 'admin') {
    await supabase
      .from('support_requests')
      .update({
        status: 'open',
        resolved_at: null,
        resolved_by: null,
      })
      .eq('id', requestId)
      .eq('status', 'resolved');
  }

  const { data, error } = await supabase
    .from('support_messages')
    .insert({
      request_id: requestId,
      sender_id: user.id,
      sender_role: role,
      body: text,
    })
    .select('id, request_id, sender_id, sender_role, body, created_at')
    .single();

  if (error) return { row: null, error: error.message };
  return { row: data as SupportMessageRow, error: null };
}

export function subscribeSupportMessages(
  requestId: string,
  onInsert: (row: SupportMessageRow) => void
): () => void {
  const channel = supabase
    .channel(`support-messages-${requestId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'support_messages',
        filter: `request_id=eq.${requestId}`,
      },
      (payload) => {
        const row = payload.new as SupportMessageRow;
        if (row?.id) onInsert(row);
      }
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
