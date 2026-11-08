import { resolveSupabasePublicEnv } from '../supabasePublicDefaults';

let cached: boolean | null = null;
let inflight: Promise<boolean> | null = null;

/** Google OAuth is off on the live project until Client ID/Secret are set. */
export async function isGoogleAuthEnabled(): Promise<boolean> {
  if (cached != null) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { url, anonKey } = resolveSupabasePublicEnv();
      const res = await fetch(`${url.replace(/\/$/, '')}/auth/v1/settings`, {
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      });
      if (!res.ok) {
        cached = false;
        return false;
      }
      const data = (await res.json()) as { external?: { google?: boolean } };
      cached = Boolean(data.external?.google);
      return cached;
    } catch {
      cached = false;
      return false;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
