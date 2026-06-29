import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { FALLBACK_SITE_ORIGIN } from './seo/site';

function requireEnv(name: string, value: string | undefined, hint?: string): string {
  if (!value || value.includes('your-') || value.includes('example')) {
    throw new Error(
      hint ||
        `Missing or placeholder ${name}. Copy .env.example to .env.local and set Supabase credentials.`
    );
  }
  return value;
}

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (client) return client;

  let url = import.meta.env.VITE_SUPABASE_URL;
  let anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!url || url.includes('your-')) {
    url = DEFAULT_SUPABASE_URL;
    if (import.meta.env.DEV) {
      console.warn('VITE_SUPABASE_URL missing — using Monadier Supabase URL');
    }
  }

  if (!anonKey || anonKey.includes('your-')) {
    requireEnv(
      'VITE_SUPABASE_ANON_KEY',
      anonKey,
      'Copy .env.example to .env.local and set the anon key (Supabase → Settings → API).'
    );
  }

  client = createClient(url, anonKey, {
    auth: {
      flowType: 'pkce',
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  return client;
}

/** Lazy proxy — avoids crashing module load before EnvSetupScreen can render. */
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const c = getSupabaseClient();
    const value = Reflect.get(c, prop, c);
    return typeof value === 'function' ? value.bind(c) : value;
  },
});

/** Live deploy origin until monadier.io custom domain + DNS are verified on Vercel. */
export const FALLBACK_SITE_ORIGIN = 'https://monadier.vercel.app';

function isLocalhostOrigin(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  } catch {
    return false;
  }
}

/**
 * Origin for Supabase auth email links (reset password, confirm email, OAuth).
 * Production bundles must NEVER send localhost — even if VITE_SITE_URL is missing.
 */
export function getAuthRedirectBase(): string {
  const fromEnv = [
    import.meta.env.VITE_SITE_URL,
    import.meta.env.VITE_APP_URL,
  ].filter((u): u is string => typeof u === 'string' && u.startsWith('http'));

  for (const raw of fromEnv) {
    const origin = raw.replace(/\/$/, '');
    if (!isLocalhostOrigin(origin)) return origin;
  }

  if (import.meta.env.PROD) {
    return FALLBACK_SITE_ORIGIN;
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }

  return 'http://localhost:5173';
}

/** Production Supabase project (Monadier). Used when env is missing in local preview. */
export const DEFAULT_SUPABASE_URL = 'https://gbgafseabgqinnvlfslc.supabase.co';
