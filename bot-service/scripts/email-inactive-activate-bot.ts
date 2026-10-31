/**
 * Nudge registered users who never approved the HL trading agent.
 *
 * Test only:
 *   cd bot-service && MOCK_FLYER_TO=lorenzo.vanza@hotmail.com npx tsx scripts/email-inactive-activate-bot.ts
 *
 * Dry-run inactive list (no send):
 *   cd bot-service && LIST_ONLY=1 npx tsx scripts/email-inactive-activate-bot.ts
 *
 * Send to inactive cohort (after test approved):
 *   cd bot-service && SEND_INACTIVE=1 npx tsx scripts/email-inactive-activate-bot.ts
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

function loadEnv() {
  for (const p of [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '.env.local'),
    resolve(process.cwd(), '../.env.local'),
  ]) {
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m || process.env[m[1]]) continue;
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
    }
  }
  if (!process.env.RESEND_API_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const kv = execSync('npx --yes @railway/cli@latest variables --kv', {
        cwd: process.cwd(),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      for (const line of kv.split('\n')) {
        const i = line.indexOf('=');
        if (i < 0) continue;
        const k = line.slice(0, i);
        const v = line.slice(i + 1);
        if (
          !process.env[k] &&
          (k === 'RESEND_API_KEY' ||
            k === 'RESEND_FROM' ||
            k === 'SUPABASE_URL' ||
            k === 'SUPABASE_SERVICE_ROLE_KEY' ||
            k === 'SUPABASE_SERVICE_KEY')
        ) {
          process.env[k] = v;
        }
      }
    } catch {
      /* ignore */
    }
  }
}

loadEnv();

const BRAND_NAME = 'HyperGain';
const BRAND_LOGO_URL = 'https://www.hypergain.io/email-logo.png';
const APP_URL = 'https://app.hypergain.io';
const SITE_URL = 'https://www.hypergain.io';
const BOT_URL = `${APP_URL}/?section=bot`;
const X_URL = 'https://x.com/HyperGainAi';

function stepRow(n: string, title: string, body: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;margin-bottom:10px;">
<tr><td style="padding:18px 20px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr>
<td width="40" valign="top" style="padding-right:14px;padding-top:2px;">
<p style="margin:0;font-size:20px;font-weight:700;color:#16a34a;letter-spacing:-0.02em;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">${n}</p>
</td>
<td valign="middle">
<p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#0a0a0a;letter-spacing:-0.02em;">${title}</p>
<p style="margin:0;font-size:14px;line-height:1.45;color:#525252;">${body}</p>
</td>
</tr>
</table>
</td></tr></table>`;
}

function activateBotEmailHtml(opts?: { displayName?: string }): string {
  const hello = opts?.displayName?.trim()
    ? `Hi ${opts.displayName.trim()},`
    : 'Hi,';
  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light">
<title>Top up &amp; start ${BRAND_NAME} bot trading</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;width:100% !important;-webkit-text-size-adjust:100%;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:100%;background:#ffffff;">
<tr><td align="center" style="padding:32px 24px;width:100%;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:100%;">

<tr><td align="center" style="padding-bottom:28px;">
<img src="${BRAND_LOGO_URL}" width="56" height="56" alt="${BRAND_NAME}" style="display:block;border:0;border-radius:14px;margin:0 auto 12px;" />
<span style="font-size:24px;font-weight:600;color:#0a0a0a;letter-spacing:-0.03em;">${BRAND_NAME}</span>
</td></tr>

<tr><td style="background:#f5f5f5;border-radius:20px;padding:40px 32px;width:100%;">

<p style="margin:0 0 12px;font-size:15px;color:#525252;text-align:center;">${hello}</p>
<h1 style="margin:0 0 12px;font-size:28px;font-weight:600;color:#0a0a0a;text-align:center;letter-spacing:-0.03em;line-height:1.25;">
Your account is ready.<br>Top up &amp; start the bot.
</h1>
<p style="margin:0 0 28px;font-size:16px;line-height:1.55;color:#525252;text-align:center;max-width:720px;margin-left:auto;margin-right:auto;">
You’re registered — one step left. Fund your Hyperliquid wallet and approve the trading agent once so the bot can trade for you (non-custodial — it cannot withdraw).
</p>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;margin-bottom:12px;">
<tr><td style="padding:28px 24px;text-align:center;">
<p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#737373;text-transform:uppercase;letter-spacing:0.08em;">Start auto trading from</p>
<p style="margin:0;font-size:40px;font-weight:700;color:#16a34a;letter-spacing:-0.03em;">$20</p>
<p style="margin:8px 0 0;font-size:14px;color:#525252;">USDC on Hyperliquid · your wallet stays in control</p>
</td></tr></table>

<p style="margin:0 0 14px;font-size:13px;font-weight:600;color:#0a0a0a;text-transform:uppercase;letter-spacing:0.08em;text-align:center;">Finish setup</p>

${stepRow('1', 'Open the app', 'Sign in to HyperGain with the email you registered.')}
${stepRow('2', 'Top up your wallet', 'Deposit USDC to your Hyperliquid account — from $20 is enough to start.')}
${stepRow('3', 'Approve the trading agent', 'One MetaMask approval. Trading only — never withdrawals.')}
${stepRow('4', 'Start the bot', 'Flip auto-trade on. The bot scans and manages positions while you live your life.')}

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;margin-top:18px;">
<tr><td style="padding:32px 28px;text-align:center;">
<p style="margin:0 0 8px;font-size:20px;font-weight:600;color:#0a0a0a;letter-spacing:-0.02em;">Top up &amp; start bot trading</p>
<p style="margin:0 0 22px;font-size:15px;line-height:1.5;color:#525252;">
Don’t leave your account idle — activate the agent and let the bot work.
</p>
<a href="${BOT_URL}" style="display:inline-block;padding:16px 36px;background:#0a0a0a;color:#ffffff;text-decoration:none;border-radius:50px;font-size:15px;font-weight:600;">Open bot →</a>
</td></tr></table>

</td></tr>

<tr><td style="padding-top:28px;text-align:center;">
<p style="margin:0 0 6px;font-size:13px;font-weight:500;color:#0a0a0a;">Team ${BRAND_NAME} · Hong Kong</p>
<p style="margin:0 0 12px;font-size:12px;color:#888;">
<a href="${SITE_URL}" style="color:#525252;text-decoration:none;">hypergain.io</a>
&nbsp;·&nbsp;
<a href="${X_URL}" style="color:#525252;text-decoration:none;">@HyperGainAi</a>
</p>
<p style="margin:0;font-size:11px;line-height:1.45;color:#a3a3a3;">
Software only. Crypto trading is risky. Only trade what you can afford to lose. No guaranteed returns.
</p>
</td></tr>

</table>
</td></tr></table>
</body></html>`;
}

async function sendResend(to: string[], subject: string, html: string) {
  const apiKey = process.env.RESEND_API_KEY || '';
  const from = process.env.RESEND_FROM || 'HyperGain <hello@hypergain.io>';
  if (!apiKey) throw new Error('RESEND_API_KEY missing');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html }),
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body: body.slice(0, 500), to };
}

type InactiveRow = {
  id: string;
  email: string;
  username: string | null;
  full_name: string | null;
  wallet_address: string | null;
  created_at: string | null;
};

const EMAIL_RE = /^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,24}$/i;
const SKIP_EMAILS = new Set(
  [
    'lorenzo.vanza@hotmail.com',
    'support@binance.com',
    'j.doe@inbox.com',
    'a602240cd7b14006850cf55b82b1f367@sentry.okg.com',
    'good@that.the',
    'input@all.in',
    'pairs@once.optimized',
    'recommended@all.some',
    'royalquantify@gmail.com.they',
    'info@jnb.ch.entgegen',
    'january@9am.see',
    'litigator@e.blum',
    'news@startupticker.ch.to',
    'principal@founderful.the',
  ].map((e) => e.toLowerCase())
);

function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase().replace(/^mailto:/, '');
  if (!EMAIL_RE.test(email)) return null;
  if (SKIP_EMAILS.has(email)) return null;
  if (email.endsWith('.sentry.io') || email.includes('@sentry.')) return null;
  return email;
}

function emailsFromCsv(path: string): string[] {
  if (!existsSync(path)) {
    console.warn('CSV missing:', path);
    return [];
  }
  const raw = readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines.slice(1)) {
    const first = (line.split(',')[0] ?? '')
      .trim()
      .replace(/^"+|"+$/g, '')
      .replace(/\\"/g, '');
    const email = normalizeEmail(first);
    if (email) out.push(email);
  }
  return out;
}

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    '';
  if (!url || !key) throw new Error('SUPABASE_URL / SERVICE_ROLE_KEY missing');
  return createClient(url, key);
}

/** Registered users whose bot is not currently running (auto-trade off / no settings). */
async function listNotRunningUsers(): Promise<InactiveRow[]> {
  const sb = supabaseAdmin();
  const { data: profiles, error: pe } = await sb
    .from('profiles')
    .select('id, email, username, full_name, wallet_address, created_at')
    .not('email', 'is', null)
    .order('created_at', { ascending: false })
    .limit(5000);
  if (pe) throw pe;

  const { data: userWallets } = await sb
    .from('user_wallets')
    .select('user_id, wallet_address')
    .limit(8000);

  const { data: running } = await sb
    .from('vault_settings')
    .select('wallet_address')
    .eq('auto_trade_enabled', true)
    .limit(8000);

  const runningWallets = new Set(
    (running || []).map((r) => String(r.wallet_address).toLowerCase())
  );

  const walletsByUser = new Map<string, string[]>();
  for (const row of userWallets || []) {
    const list = walletsByUser.get(row.user_id) || [];
    list.push(String(row.wallet_address).toLowerCase());
    walletsByUser.set(row.user_id, list);
  }

  return (profiles || [])
    .filter((p) => Boolean(p.email))
    .filter((p) => {
      const wallets = [
        ...(p.wallet_address ? [String(p.wallet_address).toLowerCase()] : []),
        ...(walletsByUser.get(p.id) || []),
      ];
      if (wallets.some((w) => runningWallets.has(w))) return false;
      return true;
    }) as InactiveRow[];
}

async function listInactiveUsers(): Promise<InactiveRow[]> {
  return listNotRunningUsers();
}

async function main() {
  const listOnly = process.env.LIST_ONLY === '1';
  const sendInactive = process.env.SEND_INACTIVE === '1';
  const sendBroadcast = process.env.SEND_BROADCAST === '1';
  const testTo = (process.env.MOCK_FLYER_TO || '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);

  const html = activateBotEmailHtml();
  const outDir = resolve(process.cwd(), 'tmp');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, 'mock-inactive-activate-bot.html'), html);

  const subject = `${BRAND_NAME} · Top up your wallet & start bot trading`;

  if (!listOnly && !sendInactive && !sendBroadcast) {
    const to = testTo.length ? testTo : ['lorenzo.vanza@hotmail.com'];
    const result = await sendResend(to, subject, html);
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exit(1);
    console.log('Test email sent (no [TEST] prefix).');
    return;
  }

  const dbUsers = await listNotRunningUsers();
  const dbByEmail = new Map<string, InactiveRow>();
  for (const p of dbUsers) {
    const email = normalizeEmail(p.email);
    if (!email) continue;
    dbByEmail.set(email, p);
  }

  const extraCsvs = (process.env.EXTRA_CSVS || '')
    .split('|')
    .map((p) => p.trim())
    .filter(Boolean);
  const extraRaw = (process.env.EXTRA_EMAILS || '')
    .split(/[\s,;]+/)
    .map((e) => e.trim())
    .filter(Boolean);

  const extra = new Set<string>();
  for (const csv of extraCsvs) {
    for (const e of emailsFromCsv(csv)) extra.add(e);
  }
  for (const raw of extraRaw) {
    const e = normalizeEmail(raw);
    if (e) extra.add(e);
  }

  const recipients = new Map<string, { name?: string; source: string }>();
  for (const [email, p] of dbByEmail) {
    recipients.set(email, {
      name: p.username || p.full_name?.split(' ')[0] || undefined,
      source: 'db',
    });
  }
  for (const email of extra) {
    if (!recipients.has(email)) recipients.set(email, { source: 'list' });
  }

  console.log(
    JSON.stringify({
      db_not_running: dbByEmail.size,
      extra: extra.size,
      unique_recipients: recipients.size,
    })
  );
  for (const [email, meta] of recipients) {
    console.log(`${meta.source.padEnd(4)} ${email}`);
  }

  if (listOnly || (!sendInactive && !sendBroadcast)) return;

  let sent = 0;
  let failed = 0;
  for (const [email, meta] of recipients) {
    const body = activateBotEmailHtml({ displayName: meta.name });
    const result = await sendResend([email], subject, body);
    console.log(email, result.status, result.ok ? 'ok' : result.body);
    if (result.ok) sent += 1;
    else failed += 1;
    await new Promise((r) => setTimeout(r, 350));
  }
  console.log({ sent, failed, total: recipients.size });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
