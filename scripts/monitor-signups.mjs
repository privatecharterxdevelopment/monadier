#!/usr/bin/env node
/**
 * Ops: list new HyperGain registrations (profiles.created_at).
 * Uses SUPABASE_URL + SUPABASE_SERVICE_KEY from env (Railway: railway run …).
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
const hours = Math.max(1, Number(process.env.SIGNUP_WINDOW_HOURS || 24));
const limit = Math.max(1, Number(process.env.SIGNUP_LIMIT || 100));

if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
const sb = createClient(url, key);
const { data, error, count } = await sb
  .from('profiles')
  .select('id, email, username, wallet_address, created_at', { count: 'exact' })
  .gte('created_at', since)
  .order('created_at', { ascending: false })
  .limit(limit);

if (error) {
  console.error(error.message);
  process.exit(1);
}

const total = await sb.from('profiles').select('*', { count: 'exact', head: true });

console.log(
  JSON.stringify(
    {
      windowHours: hours,
      signupsInWindow: data?.length ?? 0,
      totalProfiles: total.count ?? null,
      checkedAt: new Date().toISOString(),
      signups: data ?? [],
    },
    null,
    2
  )
);