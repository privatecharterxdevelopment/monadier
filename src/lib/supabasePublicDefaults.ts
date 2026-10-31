/** Public HyperGain Supabase defaults (anon key is publishable by design). */
export const DEFAULT_SUPABASE_URL = 'https://hnaldfvommthfgoryitt.supabase.co';
export const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhuYWxkZnZvbW10aGZnb3J5aXR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM0NjAzOTcsImV4cCI6MjEwOTAzNjM5N30.1xRlssWJUrBsW8RwoUQ1jH1GNFOdqp8BXMFCFPqXc9w';

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
