import {
  LIVE_SUPABASE_ANON_KEY,
  LIVE_SUPABASE_URL,
  isPlaceholder,
  isRetiredSupabaseValue,
  sanitizeSupabaseAnonKey,
  sanitizeSupabaseUrl,
} from './publicEnvSanitize';

/** Public HyperGain Supabase defaults (anon key is publishable by design). */
export const DEFAULT_SUPABASE_URL = LIVE_SUPABASE_URL;
export const DEFAULT_SUPABASE_ANON_KEY = LIVE_SUPABASE_ANON_KEY;

function isUsableEnvValue(value: string | undefined): boolean {
  return Boolean(value) && !isPlaceholder(value) && !isRetiredSupabaseValue(value);
}

/**
 * Resolve Supabase URL / anon key from Vite env, Next-style env, or public defaults.
 * Stale Vercel env (deleted gbgafse project) is ignored — URL and JWT must match.
 */
export function resolveSupabasePublicEnv(): { url: string; anonKey: string } {
  const env = import.meta.env as Record<string, string | undefined>;
  const url = sanitizeSupabaseUrl(
    [env.VITE_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_URL, DEFAULT_SUPABASE_URL].find(
      (v) => isUsableEnvValue(v)
    )
  );
  const anonKey = sanitizeSupabaseAnonKey(
    [env.VITE_SUPABASE_ANON_KEY, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, DEFAULT_SUPABASE_ANON_KEY].find(
      (v) => isUsableEnvValue(v)
    ),
    url
  );
  return { url, anonKey };
}
