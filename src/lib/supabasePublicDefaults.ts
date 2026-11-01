/** Public HyperGain Supabase defaults (anon key is publishable by design). */
export const DEFAULT_SUPABASE_URL = 'https://hathjgtvmgyxahqfhjka.supabase.co';
export const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhdGhqZ3R2bWd5eGFocWZoamthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM1NDQ3OTcsImV4cCI6MjEwOTEyMDc5N30.xx4S9U-TpFoGBhmVeZ46B6I6yC_nhZGRwXWLYJOK184';

/** Deleted / retired Supabase projects — never use even if still set on Vercel. */
const RETIRED_SUPABASE_REFS = [
  'gbgafseabgqinnvlfslc', // pre-restore HyperGain (deleted)
] as const;

function isPlaceholder(value: string | undefined): boolean {
  if (!value) return true;
  return value.includes('your-') || value.includes('example');
}

function isRetiredSupabaseValue(value: string | undefined): boolean {
  if (!value) return false;
  const lower = value.toLowerCase();
  return RETIRED_SUPABASE_REFS.some((ref) => lower.includes(ref));
}

function isUsableEnvValue(value: string | undefined): boolean {
  return Boolean(value) && !isPlaceholder(value) && !isRetiredSupabaseValue(value);
}

/**
 * Resolve Supabase URL / anon key from Vite env, Next-style env, or public defaults.
 * Vite only exposes `VITE_*` unless `envPrefix` also includes `NEXT_PUBLIC_`.
 * Stale Vercel env pointing at a deleted project is ignored → hathjgt defaults.
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

  const url = urlCandidates.find((v) => isUsableEnvValue(v)) ?? DEFAULT_SUPABASE_URL;
  const anonKey =
    anonCandidates.find((v) => isUsableEnvValue(v)) ?? DEFAULT_SUPABASE_ANON_KEY;

  return { url, anonKey };
}
