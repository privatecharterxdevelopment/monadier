#!/usr/bin/env node
/**
 * Admin: set a user's password directly (no email link).
 *
 * Usage (from repo root, needs service role in .env.local):
 *   node scripts/admin-set-password.mjs user@email.com 'NewPassword123'
 *
 * Get service role: Supabase → Project Settings → API → service_role (secret)
 * Add to .env.local: SUPABASE_SERVICE_ROLE_KEY=eyJ...
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

function loadEnvLocal() {
  const path = resolve(process.cwd(), '.env.local');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

loadEnvLocal();

const email = process.argv[2]?.trim().toLowerCase();
const password = process.argv[3];

if (!email || !password) {
  console.error('Usage: node scripts/admin-set-password.mjs user@email.com "NewPassword123"');
  process.exit(1);
}

if (password.length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Missing VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: list, error: listErr } = await supabase.auth.admin.listUsers({
  page: 1,
  perPage: 1000,
});

if (listErr) {
  console.error('listUsers failed:', listErr.message);
  process.exit(1);
}

const user = list.users.find((u) => u.email?.toLowerCase() === email);
if (!user) {
  console.error(`No auth user found for ${email}`);
  process.exit(1);
}

const { data, error } = await supabase.auth.admin.updateUserById(user.id, { password });

if (error) {
  console.error('updateUserById failed:', error.message);
  process.exit(1);
}

console.log(`OK — password updated for ${data.user.email} (${data.user.id})`);
console.log('User can sign in at https://monadier.vercel.app/login');
