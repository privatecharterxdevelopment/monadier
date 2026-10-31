#!/usr/bin/env node
/**
 * Delete dead / spam auth users by email (service role).
 *
 * Usage (repo root, .env.local with SUPABASE_SERVICE_ROLE_KEY):
 *   node scripts/admin-delete-users.mjs --emails a@x.com,b@y.com
 *   node scripts/admin-delete-users.mjs --dry-run --emails a@x.com
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

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const emailsArg = args.find((a) => a.startsWith('--emails='))?.slice('--emails='.length)
  || (args.includes('--emails') ? args[args.indexOf('--emails') + 1] : '');

const emails = String(emailsArg || '')
  .split(/[,\s]+/)
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

if (!emails.length) {
  console.error('Usage: node scripts/admin-delete-users.mjs [--dry-run] --emails a@x.com,b@y.com');
  process.exit(1);
}

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!url || !serviceKey) {
  console.error('Missing VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Paginate auth users and map email → id */
async function findUsersByEmail(want) {
  const wantSet = new Set(want);
  const found = new Map();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const users = data?.users ?? [];
    for (const u of users) {
      const em = String(u.email || '').toLowerCase();
      if (wantSet.has(em)) found.set(em, u.id);
    }
    if (users.length < 200) break;
  }
  return found;
}

const found = await findUsersByEmail(emails);
console.log('Requested:', emails.length);
console.log('Found:', found.size);

for (const email of emails) {
  const id = found.get(email);
  if (!id) {
    console.log(`MISS  ${email}`);
    continue;
  }
  // Safety: skip if they have any closed PnL / open activity markers
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, wallet_address, created_at')
    .eq('id', id)
    .maybeSingle();

  const wallet = profile?.wallet_address ? String(profile.wallet_address).toLowerCase() : null;
  let tradeCount = 0;
  let feeWins = 0;
  if (wallet) {
    const { count } = await supabase
      .from('trade_history')
      .select('id', { count: 'exact', head: true })
      .ilike('wallet_address', wallet);
    tradeCount = count ?? 0;
  }
  let feeWins = 0;
  if (wallet) {
    const { count: feeCount } = await supabase
      .from('hl_fee_ledger')
      .select('id', { count: 'exact', head: true })
      .ilike('wallet_address', wallet);
    feeWins = feeCount ?? 0;
  }

  if (tradeCount > 0 || feeWins > 0) {
    console.log(`SKIP  ${email} id=${id} trades=${tradeCount} fees=${feeWins} (not empty)`);
    continue;
  }

  if (dryRun) {
    console.log(`DRY   ${email} id=${id} created=${profile?.created_at ?? '?'}`);
    continue;
  }

  const { error: delErr } = await supabase.auth.admin.deleteUser(id);
  if (delErr) {
    console.log(`FAIL  ${email} ${delErr.message}`);
  } else {
    console.log(`DEL   ${email} id=${id}`);
  }
}

console.log('done');
