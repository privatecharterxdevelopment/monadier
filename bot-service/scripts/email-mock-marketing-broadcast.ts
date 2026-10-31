/**
 * Conversion marketing email — register CTA, no invented stats.
 *
 *   cd bot-service && MOCK_FLYER_TO=lorenzo.vanza@hotmail.com npx tsx scripts/email-mock-marketing-broadcast.ts
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

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
  if (!process.env.RESEND_API_KEY) {
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
        if (k === 'RESEND_API_KEY' || k === 'RESEND_FROM') process.env[k] = v;
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
const REGISTER_URL = `${APP_URL}/?auth=register`;
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

function featureRow(title: string, body: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;margin-bottom:10px;">
<tr><td style="padding:18px 20px;">
<p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#0a0a0a;letter-spacing:-0.02em;">${title}</p>
<p style="margin:0;font-size:14px;line-height:1.45;color:#525252;">${body}</p>
</td></tr></table>`;
}

function marketingEmailHtml(): string {
  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light">
<title>Create your ${BRAND_NAME} account</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;width:100% !important;-webkit-text-size-adjust:100%;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:100%;background:#ffffff;">
<tr><td align="center" style="padding:32px 24px;width:100%;">

<!-- Full-width content (no 480px cage) -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:100%;">

<tr><td align="center" style="padding-bottom:28px;">
<img src="${BRAND_LOGO_URL}" width="56" height="56" alt="${BRAND_NAME}" style="display:block;border:0;border-radius:14px;margin:0 auto 12px;" />
<span style="font-size:24px;font-weight:600;color:#0a0a0a;letter-spacing:-0.03em;">${BRAND_NAME}</span>
</td></tr>

<tr><td style="background:#f5f5f5;border-radius:20px;padding:40px 32px;width:100%;">

<h1 style="margin:0 0 12px;font-size:28px;font-weight:600;color:#0a0a0a;text-align:center;letter-spacing:-0.03em;line-height:1.25;">
Stop watching charts.<br>Start earning with the bot.
</h1>
<p style="margin:0 0 28px;font-size:16px;line-height:1.55;color:#525252;text-align:center;max-width:720px;margin-left:auto;margin-right:auto;">
Create your free account and run a highly engineered Hyperliquid trading bot from your own wallet — your shot at passive trading income while you live your life.
</p>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;margin-bottom:12px;">
<tr><td style="padding:28px 24px;text-align:center;">
<p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#737373;text-transform:uppercase;letter-spacing:0.08em;">Start auto trading from</p>
<p style="margin:0;font-size:40px;font-weight:700;color:#16a34a;letter-spacing:-0.03em;">$20</p>
<p style="margin:8px 0 0;font-size:14px;color:#525252;">Small capital. Full bot stack.</p>
</td></tr></table>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;margin-bottom:28px;">
<tr><td style="padding:28px 24px;text-align:center;">
<p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#737373;text-transform:uppercase;letter-spacing:0.08em;">Proven average monthly win rate</p>
<p style="margin:0;font-size:40px;font-weight:700;color:#16a34a;letter-spacing:-0.03em;">72.4%</p>
<p style="margin:8px 0 0;font-size:14px;line-height:1.45;color:#525252;">
All on-chain. Non-custodial. Verifiable on the blockchain via <a href="https://hypurrscan.io/address/0xf7351a5c63e0403f6f7fc77d31b5e17a229c469c" style="color:#0a0a0a;text-decoration:underline;font-weight:500;">HypurrScan</a>. Past results do not guarantee future performance.
</p>
</td></tr></table>

<p style="margin:0 0 14px;font-size:13px;font-weight:600;color:#0a0a0a;text-transform:uppercase;letter-spacing:0.08em;text-align:center;">How it works</p>

${stepRow('1', 'Register for free', 'Create your HyperGain account in minutes — no commitment.')}
${stepRow('2', 'Connect your Hyperliquid wallet', 'Link your wallet securely. Non-custodial: you keep control of deposits and withdrawals.')}
${stepRow('3', 'Top up', 'Fund your Hyperliquid account and start auto trading from just $20.')}
${stepRow('4', 'Start the bot', 'Flip the bot on. Multi-timeframe analysis and risk controls run while you live your life.')}

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;margin-bottom:8px;">
<tr><td>
${featureRow(
  'All on-chain · Non-custodial',
  'Trades settle on Hyperliquid. We never hold your funds — connect your wallet and stay in charge. Performance is public and verifiable on-chain.'
)}
</td></tr>
</table>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;margin-top:10px;">
<tr><td style="padding:32px 28px;text-align:center;">
<p style="margin:0 0 8px;font-size:20px;font-weight:600;color:#0a0a0a;letter-spacing:-0.02em;">Create your account now</p>
<p style="margin:0 0 22px;font-size:15px;line-height:1.5;color:#525252;">
Register free. Fund from $20. Start the bot. Opportunity — not a guaranteed return.
</p>
<a href="${REGISTER_URL}" style="display:inline-block;padding:16px 36px;background:#0a0a0a;color:#ffffff;text-decoration:none;border-radius:50px;font-size:15px;font-weight:600;">Register free →</a>
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

async function main() {
  const to = (process.env.MOCK_FLYER_TO || 'lorenzo.vanza@hotmail.com')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);

  const html = marketingEmailHtml();
  const outDir = resolve(process.cwd(), 'tmp');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, 'mock-marketing-broadcast.html'), html);

  const apiKey = process.env.RESEND_API_KEY || '';
  const from = process.env.RESEND_FROM || 'HyperGain <hello@hypergain.io>';
  if (!apiKey) {
    console.error('RESEND_API_KEY missing');
    process.exit(2);
  }

  const subject = `${BRAND_NAME} · Start auto trading from $20 — register free`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html }),
  });
  const body = await res.text();
  console.log({ status: res.status, body: body.slice(0, 400), to });
  if (!res.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
