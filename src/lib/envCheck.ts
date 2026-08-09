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
  // Public defaults keep the app bootable; only surface a soft hint in DEV
  // when neither VITE_ nor NEXT_PUBLIC_ is set.
  const env = import.meta.env as Record<string, string | undefined>;
  const hasAny =
    Boolean(env.VITE_SUPABASE_ANON_KEY && !env.VITE_SUPABASE_ANON_KEY.includes('your-')) ||
    Boolean(
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
        !env.NEXT_PUBLIC_SUPABASE_ANON_KEY.includes('your-')
    );

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
