import { fetchBotApi } from './botApiFetch';
import { supabase } from './supabase';

export type TwitterSettings = {
  id: number;
  enabled: boolean;
  require_approval: boolean;
  posts_per_day: number;
  post_hours_utc: number[];
  brand_handle: string | null;
  site_url: string | null;
  last_generated_at: string | null;
  last_posted_at: string | null;
  updated_at: string;
};

export type TwitterPost = {
  id: string;
  body: string;
  status: string;
  source: string;
  scheduled_for: string | null;
  posted_at: string | null;
  twitter_id: string | null;
  error: string | null;
  stats_snapshot: Record<string, unknown> | null;
  slot_key: string | null;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
};

function adminSecret(): string {
  return (import.meta.env.VITE_BOT_ADMIN_SECRET as string | undefined)?.trim() ?? '';
}

export async function fetchTwitterSettings(): Promise<TwitterSettings | null> {
  const { data, error } = await supabase
    .from('twitter_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw error;
  return data as TwitterSettings | null;
}

export async function fetchTwitterPosts(limit = 40): Promise<TwitterPost[]> {
  const { data, error } = await supabase
    .from('twitter_posts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as TwitterPost[];
}

export async function updateTwitterSettings(
  patch: Partial<
    Pick<
      TwitterSettings,
      | 'enabled'
      | 'require_approval'
      | 'posts_per_day'
      | 'post_hours_utc'
      | 'brand_handle'
      | 'site_url'
    >
  >
): Promise<void> {
  const { error } = await supabase
    .from('twitter_settings')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', 1);
  if (error) throw error;
}

export async function approveTwitterPost(postId: string, approvedBy: string): Promise<void> {
  const { error } = await supabase
    .from('twitter_posts')
    .update({
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: approvedBy,
      scheduled_for: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      error: null,
    })
    .eq('id', postId)
    .in('status', ['draft', 'failed']);
  if (error) throw error;
}

export async function rejectTwitterPost(postId: string): Promise<void> {
  const { error } = await supabase
    .from('twitter_posts')
    .update({
      status: 'rejected',
      updated_at: new Date().toISOString(),
    })
    .eq('id', postId)
    .in('status', ['draft', 'approved', 'scheduled', 'failed']);
  if (error) throw error;
}

export async function updateTwitterPostBody(postId: string, body: string): Promise<void> {
  const trimmed = body.trim();
  if (!trimmed || trimmed.length > 280) {
    throw new Error('Tweet must be 1–280 characters');
  }
  const { error } = await supabase
    .from('twitter_posts')
    .update({ body: trimmed, updated_at: new Date().toISOString() })
    .eq('id', postId)
    .in('status', ['draft', 'approved', 'scheduled', 'failed']);
  if (error) throw error;
}

async function adminTwitterFetch<T>(
  path: string,
  init?: RequestInit
): Promise<{ ok: boolean; data: T; error?: string }> {
  const secret = adminSecret();
  if (!secret) {
    return { ok: false, data: {} as T, error: 'Set VITE_BOT_ADMIN_SECRET (same as Railway BOT_ADMIN_SECRET)' };
  }
  const res = await fetchBotApi(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-bot-admin-secret': secret,
      ...(init?.headers ?? {}),
    },
  });
  const data = (await res.json()) as T & { success?: boolean; error?: string };
  if (!res.ok || data.success === false) {
    return { ok: false, data, error: data.error || `HTTP ${res.status}` };
  }
  return { ok: true, data };
}

export async function twitterGenerateDraft(): Promise<{
  ok: boolean;
  post?: TwitterPost;
  error?: string;
}> {
  const result = await adminTwitterFetch<{ success: boolean; post?: TwitterPost; error?: string }>(
    '/api/admin/twitter/generate',
    { method: 'POST', body: '{}' }
  );
  return { ok: result.ok, post: result.data.post, error: result.error };
}

export async function twitterPublishNow(postId: string): Promise<{
  ok: boolean;
  twitterId?: string;
  error?: string;
}> {
  const result = await adminTwitterFetch<{
    success: boolean;
    twitterId?: string;
    error?: string;
  }>('/api/admin/twitter/publish', {
    method: 'POST',
    body: JSON.stringify({ postId }),
  });
  return {
    ok: result.ok,
    twitterId: result.data.twitterId,
    error: result.error,
  };
}

export async function twitterCredentialsStatus(): Promise<{
  ok: boolean;
  configured?: boolean;
  error?: string;
}> {
  const result = await adminTwitterFetch<{
    success: boolean;
    configured?: boolean;
    error?: string;
  }>('/api/admin/twitter/credentials');
  return {
    ok: result.ok,
    configured: result.data.configured,
    error: result.error,
  };
}
