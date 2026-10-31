#!/usr/bin/env node
/**
 * Read-only wallet fee / bot-trade audit (production DB).
 *
 * Usage:
 *   SUPABASE_SERVICE_KEY=... node scripts/admin-wallet-fee-audit.mjs 0x7d48...
 *   SUPABASE_SERVICE_KEY=... node scripts/admin-wallet-fee-audit.mjs --email onlinewave12@gmail.com
 *
 * Uses service_role RPC get_admin_wallet_fee_audit (no fee gate changes).
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

function loadEnvLocal() {
  const path = resolve(process.cwd(), '.env.local');
  if (!existsSync(path)) return {};
  const env = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

const env = { ...loadEnvLocal(), ...process.env };
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY)');
  process.exit(1);
}

const args = process.argv.slice(2);
let wallet = args.find((a) => /^0x[a-fA-F0-9]{40}$/.test(a))?.toLowerCase();
const emailArg = args.find((a) => a.startsWith('--email='))?.slice(8)
  ?? (args.includes('--email') ? args[args.indexOf('--email') + 1] : null);

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
};

async function rest(path) {
  const res = await fetch(`${url}/rest/v1/${path}`, { headers });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function rpc(name, body) {
  const res = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`RPC ${name} ${res.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

async function resolveWalletByEmail(email) {
  const rows = await rest(
    `profiles?select=wallet_address,email&id=not.is.null&email=eq.${encodeURIComponent(email)}&limit=1`
  );
  const profileWallet = rows?.[0]?.wallet_address?.toLowerCase();
  if (profileWallet) return profileWallet;

  const vaults = await rest(
    `vault_settings?select=wallet_address,user_id&limit=500`
  );
  const profiles = await rest(`profiles?select=id,wallet_address,email&email=eq.${encodeURIComponent(email)}&limit=1`);
  const userId = profiles?.[0]?.id;
  if (userId) {
    const vs = vaults?.find((v) => v.user_id === userId);
    if (vs?.wallet_address) return String(vs.wallet_address).toLowerCase();
  }
  return null;
}

async function main() {
  if (!wallet && emailArg) {
    wallet = await resolveWalletByEmail(emailArg);
    if (!wallet) {
      console.error(`No wallet found for email ${emailArg}`);
      process.exit(1);
    }
    console.log(`Resolved ${emailArg} → ${wallet}\n`);
  }

  if (!wallet) {
    console.error('Pass wallet 0x… or --email user@example.com');
    process.exit(1);
  }

  let audit;
  try {
    audit = await rpc('get_admin_wallet_fee_audit', { p_wallet: wallet });
  } catch (e) {
    console.error(String(e));
    console.error('\nIf RPC missing: run supabase db push / apply migration 20260703160000_admin_wallet_fee_audit.sql');
    process.exit(1);
  }

  const th = audit.trade_history ?? {};
  const fl = audit.fee_ledger ?? {};
  const paid = Number(audit.fees_paid_usd ?? 0);
  const accrued = Number(fl.fees_accrued_usd ?? 0);

  console.log('=== Wallet fee audit (read-only) ===');
  console.log('Wallet:', audit.wallet_address);
  console.log('Email:', audit.profile?.email ?? '—');
  console.log('Fee exempt:', audit.fee_exempt ? 'YES' : 'no');
  console.log('');
  console.log('Bot closes (trade_history):', th.closed_count ?? 0);
  console.log('  profitable closes:', th.profitable_count ?? 0);
  console.log('  closed P/L USD:', Number(th.closed_pnl_usd ?? 0).toFixed(4));
  console.log('  last close:', th.last_closed_at ?? '—');
  console.log('');
  console.log('Fee ledger (bot):');
  console.log('  unpaid wins (gate 0/20):', fl.unpaid_bot_wins ?? 0);
  console.log('  lifetime bot wins:', fl.lifetime_bot_wins ?? 0);
  console.log('  settled via builder:', fl.settled_bot_wins ?? 0);
  console.log('  fees accrued (owed):', accrued.toFixed(4));
  console.log('  fees settled (on-chain):', Number(fl.fees_settled_usd ?? 0).toFixed(4));
  console.log('  fees paid (USDC):', paid.toFixed(4));
  console.log('  fees still owed:', Math.max(0, accrued - paid).toFixed(4));
  console.log('');
  console.log('Cache wallet_platform_fee_state:', audit.cache_state ?? '—');
  console.log('Wallet mismatch:', JSON.stringify(audit.wallet_mismatch ?? {}, null, 2));
  console.log('');
  console.log('Recent closes:', (audit.recent_closes ?? []).length);
  for (const row of audit.recent_closes ?? []) {
    console.log(
      `  ${row.closed_at?.slice(0, 19)} ${row.token_symbol} ${row.direction} P/L ${Number(row.profit_loss ?? 0).toFixed(4)} fee ${row.platform_success_fee ?? 0} [${row.platform_fee_status ?? '—'}]`
    );
  }
  console.log('');
  console.log('Recent ledger rows:', (audit.recent_ledger_rows ?? []).length);
  for (const row of audit.recent_ledger_rows ?? []) {
    console.log(
      `  ${row.created_at?.slice(0, 19)} ${row.coin} gross ${Number(row.gross_profit_usd ?? 0).toFixed(4)} fee ${Number(row.success_fee_usd ?? 0).toFixed(4)} [${row.status}] src=${row.fee_source}`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
