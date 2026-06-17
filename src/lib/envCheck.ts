export type EnvIssue = {
  title: string;
  steps: string[];
};

/** Returns setup instructions when required Vite env vars are missing (local or Vercel). */
export function getEnvSetupIssue(): EnvIssue | null {
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;

  const anonMissing =
    !anonKey ||
    anonKey.includes('your-') ||
    anonKey.includes('example') ||
    anonKey === 'your-supabase-anon-key';

  if (!anonMissing) return null;

  const isDev = import.meta.env.DEV;
  const steps = isDev
    ? [
        'Copy .env.example to .env.local in the project root.',
        'Open Supabase → Project Settings → API → copy the anon (public) key.',
        'Set VITE_SUPABASE_ANON_KEY=eyJ... in .env.local (not the service_role key).',
        'Restart the dev server: stop npm run dev, then run it again.',
        'Run: npm run verify:supabase',
      ]
    : [
        'This deploy is missing VITE_SUPABASE_ANON_KEY in Vercel → Settings → Environment Variables.',
        'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY for Production and Preview.',
        'Redeploy after saving env vars.',
      ];

  if (!url || url.includes('your-')) {
    steps.unshift(
      isDev
        ? 'Set VITE_SUPABASE_URL in .env.local (see .env.example).'
        : 'Set VITE_SUPABASE_URL in Vercel environment variables.'
    );
  }

  return {
    title: isDev ? 'Local setup: Supabase env missing' : 'Deploy config: Supabase env missing',
    steps,
  };
}
