import { isPlaceholder, isRetiredSupabaseValue } from './publicEnvSanitize';

export type EnvIssue = {
  title: string;
  steps: string[];
};

/**
 * Returns setup instructions when required public Supabase env is missing.
 * Accepts VITE_* or NEXT_PUBLIC_* (misnamed Next.js vars on Vercel).
 * Falls back to baked-in public defaults — so production should not brick.
 */
export function getEnvSetupIssue(): EnvIssue | null {
  const env = import.meta.env as Record<string, string | undefined>;
  const anon = env.VITE_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const hasAny = Boolean(anon) && !isPlaceholder(anon) && !isRetiredSupabaseValue(anon);

  if (hasAny || import.meta.env.PROD) return null;

  return {
    title: 'Local setup: Supabase env missing (using built-in defaults)',
    steps: [
      'Optional: copy .env.example to .env.local.',
      'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (not NEXT_PUBLIC_* — this app is Vite).',
      'If you already set NEXT_PUBLIC_SUPABASE_* on Vercel, that works too after redeploy.',
      'Restart the dev server after changing .env.local.',
    ],
  };
}
