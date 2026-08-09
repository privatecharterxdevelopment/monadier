import { resolveSupabasePublicEnv } from './supabasePublicDefaults';

const FN = 'auth-lockout';

async function callLockout(body: Record<string, unknown>): Promise<{
  blocked?: boolean;
  blockedUntil?: string | null;
  error?: string;
}> {
  const { url, anonKey } = resolveSupabasePublicEnv();
  const base = url.replace(/\/$/, '');
  try {
    const res = await fetch(`${base}/functions/v1/${FN}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as {
      blocked?: boolean;
      blockedUntil?: string | null;
      error?: string;
    };
    if (!res.ok) {
      return { blocked: res.status === 403, ...json };
    }
    return json;
  } catch {
    return {};
  }
}

export async function checkAuthIpBlocked(): Promise<{
  blocked: boolean;
  blockedUntil?: string | null;
}> {
  const r = await callLockout({ action: 'check' });
  return { blocked: Boolean(r.blocked), blockedUntil: r.blockedUntil };
}

/** Record a failed password sign-in. Only admin-allowlist emails count toward lockout. */
export async function recordAuthIpFailure(email: string): Promise<{
  blocked: boolean;
  blockedUntil?: string | null;
}> {
  const r = await callLockout({ action: 'fail', email: email.trim().toLowerCase() });
  return { blocked: Boolean(r.blocked), blockedUntil: r.blockedUntil };
}

/** Probe of secret admin path by non-admin / anon — counts as failure. */
export async function recordAdminPathProbe(): Promise<void> {
  await callLockout({ action: 'probe' });
}
