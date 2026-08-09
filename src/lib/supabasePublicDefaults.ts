/** Public HyperGain/HyperGain Supabase defaults (anon key is publishable by design). */
export const DEFAULT_SUPABASE_URL = 'https://gbgafseabgqinnvlfslc.supabase.co';
export const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdiZ2Fmc2VhYmdxaW5udmxmc2xjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYyOTIxNTksImV4cCI6MjA2MTg2ODE1OX0.G4fy9Oyy5BWsWjRh3zU2L0MIjpE4tdl87Iog_n9uoLw';

function isPlaceholder(value: string | undefined): boolean {
  if (!value) return true;
  return value.includes('your-') || value.includes('example');
}

/**
 * Resolve Supabase URL / anon key from Vite env, Next-style env, or public defaults.
 * Vite only exposes `VITE_*` unless `envPrefix` also includes `NEXT_PUBLIC_`.
 */
export function resolveSupabasePublicEnv(): { url: string; anonKey: string } {
  const env = import.meta.env as Record<string, string | undefined>;
  const urlCandidates = [
    env.VITE_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_URL,
    DEFAULT_SUPABASE_URL,
  ];
  const anonCandidates = [
    env.VITE_SUPABASE_ANON_KEY,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    DEFAULT_SUPABASE_ANON_KEY,
  ];

  const url = urlCandidates.find((v) => !isPlaceholder(v)) ?? DEFAULT_SUPABASE_URL;
  const anonKey =
    anonCandidates.find((v) => !isPlaceholder(v)) ?? DEFAULT_SUPABASE_ANON_KEY;

  return { url, anonKey };
}
