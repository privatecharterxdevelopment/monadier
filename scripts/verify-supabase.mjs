#!/usr/bin/env node
/**
 * Quick Supabase health check (uses .env.local via Vite-style load).
 * Run: node scripts/verify-supabase.mjs
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

function loadEnvLocal() {
  const path = resolve(process.cwd(), '.env.local');
  if (!existsSync(path)) return {};
  const text = readFileSync(path, 'utf8');
  const env = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

const env = { ...process.env, ...loadEnvLocal() };
const url = env.VITE_SUPABASE_URL || 'https://gbgafseabgqinnvlfslc.supabase.co';
const key = env.VITE_SUPABASE_ANON_KEY;

if (!key || key.includes('your-')) {
  console.error('❌ Set VITE_SUPABASE_ANON_KEY in .env.local');
  process.exit(1);
}

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
};

async function rest(path, opts = {}) {
  const res = await fetch(`${url}/rest/v1/${path}`, { headers, ...opts });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}

async function rpc(name, args = {}) {
  const res = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}

const tables = ['profiles', 'positions', 'trade_history', 'user_wallets', 'vault_settings'];
let failed = 0;

console.log('Supabase URL:', url);

for (const table of tables) {
  const r = await rest(`${table}?select=*&limit=0`);
  if (r.ok) {
    console.log(`✅ table ${table}`);
  } else if (r.status === 404 || r.body.includes('does not exist')) {
    console.log(`❌ table ${table} — missing (run supabase db push)`);
    failed++;
  } else {
    console.log(`⚠️  table ${table} — HTTP ${r.status} ${r.body.slice(0, 120)}`);
  }
}

// Anon cannot GET /bucket/{id}; probe public bucket via list (empty folder is OK)
const bucketRes = await fetch(`${url}/storage/v1/object/list/avatars`, {
  method: 'POST',
  headers: { ...headers, 'Content-Type': 'application/json' },
  body: JSON.stringify({ prefix: '', limit: 1 }),
});
const bucketMsg = await bucketRes.text();
if (
  bucketRes.ok ||
  (bucketRes.status === 400 && !bucketMsg.toLowerCase().includes('bucket not found'))
) {
  console.log('✅ storage bucket avatars');
} else {
  console.log('❌ storage bucket avatars — run supabase db push (ensure_avatars_bucket migration)');
  failed++;
}

const u = await rpc('is_username_available', { p_username: 'verify_test_user' });
if (u.ok) {
  console.log('✅ rpc is_username_available');
} else if (u.body.includes('Could not find the function')) {
  console.log('❌ rpc is_username_available — apply profiles_username migration');
  failed++;
} else {
  console.log(`⚠️  rpc is_username_available — ${u.status} ${u.body.slice(0, 120)}`);
}

const efs = await rpc('ensure_free_subscription');
if (!efs.body.includes('Could not find the function')) {
  console.log('✅ rpc ensure_free_subscription');
} else {
  console.log('❌ rpc ensure_free_subscription — apply signup_subscription_backfill migration');
  failed++;
}

for (const fn of ['register_my_wallet', 'get_my_positions_history', 'get_my_trade_history', 'sync_wallets_and_get_positions', 'get_wallet_position_history']) {
  const args =
    fn === 'register_my_wallet'
      ? { p_wallet: '0x0000000000000000000000000000000000000000' }
      : fn === 'sync_wallets_and_get_positions' || fn === 'get_wallet_position_history'
        ? { p_wallets: ['0x7d4805026aa980e25631bd3d700025129a8f7b57'], p_limit: 3 }
        : { p_limit: 1 };
  const r = await rpc(fn, args);
  if (!r.body.includes('Could not find the function')) {
    console.log(`✅ rpc ${fn}`);
  } else {
    console.log(`❌ rpc ${fn} — apply trade_history_rpc migration`);
    failed++;
  }
}

if (failed > 0) {
  console.log('\nSee docs/SUPABASE_SETUP.md');
  process.exit(1);
}
console.log('\nSupabase checks passed (schema reachable with anon key).');
