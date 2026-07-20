import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { BRAND_SITE_URL } from './brand';
import { authCookieStorage } from './authCookieStorage';

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
      console.warn('VITE_SUPABASE_URL missing — using HyperGain Supabase URL');
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
      // Shared across www / apex / app.hypergain.io (cookie domain .hypergain.io).
      storage: authCookieStorage,
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

/**
 * Fallback only when there is no browser origin and no VITE_* URL.
 * Prefer the current test host so local/preview deploys keep working until
 * hypergain.io DNS is live.
 */
export const FALLBACK_SITE_ORIGIN = 'https://www.hypergain.io';

function isLocalhostOrigin(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  } catch {
    return false;
  }
}

/**
 * Origin for Supabase OAuth / email redirects.
 *
 * In the browser this MUST be the current origin (PKCE code verifier is
 * origin-scoped). That keeps Google login working on vercel.app, localhost,
 * and hypergain.io without rewriting env.
 */
export function getAuthRedirectBase(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/$/, '');
  }

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

  return 'http://localhost:5173';
}

/** Hosts to allowlist in Supabase Redirect URLs + Google JS origins (additive). */
export const AUTH_PRODUCTION_ORIGINS = [
  'https://monadier.vercel.app',
  BRAND_SITE_URL,
  'https://www.hypergain.io',
  'https://app.hypergain.io',
] as const;

/** Production Supabase project. Used when env is missing in local preview. */
export const DEFAULT_SUPABASE_URL = 'https://gbgafseabgqinnvlfslc.supabase.co';
