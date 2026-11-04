/**
 * Public build-time env sanitizer.
 * Vercel still injects deleted Supabase / Railway hosts; never bake those.
 */

export const LIVE_SUPABASE_URL = 'https://hathjgtvmgyxahqfhjka.supabase.co';
export const LIVE_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhdGhqZ3R2bWd5eGFocWZoamthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM1NDQ3OTcsImV4cCI6MjEwOTEyMDc5N30.xx4S9U-TpFoGBhmVeZ46B6I6yC_nhZGRwXWLYJOK184';
export const LIVE_BOT_API_URL = 'https://hypergain-bot-production.up.railway.app';

export const RETIRED_SUPABASE_REFS = ['gbgafseabgqinnvlfslc'] as const;
export const RETIRED_BOT_HOSTS = ['monadier-production.up.railway.app'] as const;

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const padded = part.replace(/-/g, '+').replace(/_/g, '/') + '==';
    const json =
      typeof atob === 'function'
        ? atob(padded)
        : Buffer.from(part, 'base64url').toString('utf8');
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function supabaseRefFromUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    const m = host.match(/^([a-z0-9]+)\.supabase\.co$/);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

export function isRetiredSupabaseValue(value: string | undefined): boolean {
  if (!value) return false;
  const lower = value.toLowerCase();
  if (RETIRED_SUPABASE_REFS.some((ref) => lower.includes(ref))) return true;
  const jwtRef = decodeJwtPayload(value)?.ref;
  return typeof jwtRef === 'string' && (RETIRED_SUPABASE_REFS as readonly string[]).includes(jwtRef);
}

export function isRetiredBotApiUrl(value: string | undefined): boolean {
  if (!value) return false;
  const lower = value.toLowerCase();
  return RETIRED_BOT_HOSTS.some((host) => lower.includes(host));
}

export function isPlaceholder(value: string | undefined): boolean {
  if (!value) return true;
  return value.includes('your-') || value.includes('example');
}

export function sanitizeSupabaseUrl(value: string | undefined): string {
  if (!value || isPlaceholder(value) || isRetiredSupabaseValue(value)) {
    return LIVE_SUPABASE_URL;
  }
  return value.replace(/\/$/, '');
}

export function sanitizeSupabaseAnonKey(value: string | undefined, url: string): string {
  if (!value || isPlaceholder(value) || isRetiredSupabaseValue(value)) {
    return LIVE_SUPABASE_ANON_KEY;
  }
  const jwtRef = decodeJwtPayload(value)?.ref;
  const urlRef = supabaseRefFromUrl(url);
  if (typeof jwtRef === 'string' && urlRef && jwtRef !== urlRef) {
    return LIVE_SUPABASE_ANON_KEY;
  }
  return value;
}

export function sanitizeBotApiUrl(value: string | undefined): string {
  if (!value || isPlaceholder(value) || isRetiredBotApiUrl(value)) {
    return LIVE_BOT_API_URL;
  }
  return value.replace(/\/$/, '');
}

type EnvMap = Record<string, string | undefined>;

/** Mutate Node/Vite process.env so the production bundle cannot bake dead hosts. */
export function scrubStalePublicEnv(env: EnvMap = process.env as EnvMap): EnvMap {
  const url = sanitizeSupabaseUrl(env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL);
  const anon = sanitizeSupabaseAnonKey(
    env.VITE_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    url
  );
  const bot = sanitizeBotApiUrl(env.VITE_BOT_API_URL);

  env.VITE_SUPABASE_URL = url;
  env.NEXT_PUBLIC_SUPABASE_URL = url;
  env.VITE_SUPABASE_ANON_KEY = anon;
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY = anon;
  env.VITE_BOT_API_URL = bot;
  return env;
}
