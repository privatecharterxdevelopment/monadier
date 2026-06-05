import { supabase } from './supabase';

export type LoginEvent = {
  id: string;
  logged_in_at: string;
  ip_address: string | null;
  user_agent: string | null;
  platform: string | null;
};

const SESSION_KEY = 'monadier_login_recorded';

/** Record one login row per browser session (IP + user agent). */
export async function recordLoginActivity(userId: string): Promise<void> {
  const key = `${SESSION_KEY}:${userId}`;
  if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(key)) {
    return;
  }

  let ipAddress: string | null = null;
  try {
    const res = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const json = (await res.json()) as { ip?: string };
      ipAddress = json.ip ?? null;
    }
  } catch {
    /* optional */
  }

  const { error } = await supabase.from('user_login_events').insert({
    user_id: userId,
    ip_address: ipAddress,
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    platform: 'web',
  });

  if (error) {
    if (error.code === '42P01') {
      console.warn('[loginActivity] user_login_events table missing — run Supabase migration');
    } else {
      console.warn('[loginActivity] insert failed', error.message);
    }
    return;
  }

  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem(key, '1');
  }
}

export async function fetchLoginActivity(userId: string, limit = 20): Promise<LoginEvent[]> {
  const { data, error } = await supabase
    .from('user_login_events')
    .select('id, logged_in_at, ip_address, user_agent, platform')
    .eq('user_id', userId)
    .order('logged_in_at', { ascending: false })
    .limit(limit);

  if (error) {
    if (error.code !== '42P01') {
      console.warn('[loginActivity] fetch failed', error.message);
    }
    return [];
  }
  return (data as LoginEvent[]) ?? [];
}
