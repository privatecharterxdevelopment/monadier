/**
 * Send a mock "trade closed in profit" notification email (no PNG)
 * using the same HTML as production win emails — for big-amount layout QA.
 *
 *   cd bot-service && npx tsx scripts/email-mock-win-notification.ts
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
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
const BRAND_SITE_URL = 'https://app.hypergain.io';

/** Same as tradeCloseEmail.fmtExactWinUsd — Swiss ' thousands separators */
function fmtExactWinUsd(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '$0.00';
  const abs = Math.abs(n);
  const digits = abs < 0.001 ? 4 : abs < 1 ? 3 : 2;
  const [intPart, frac = ''] = abs.toFixed(digits).split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  return `+$${grouped}.${frac}`;
}

function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}% ROI`;
}

function tradeCloseEmailHtml(params: {
  headline: string;
  profitUsd: number;
  roiPct: number | null;
  closedAt: string;
  kind: string;
}): string {
  const { headline, profitUsd, roiPct, closedAt, kind } = params;
  const winLabel = fmtExactWinUsd(profitUsd);
  const when = new Date(closedAt).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const title = kind === 'betting' ? 'Bet settled — win' : 'Trade closed in profit';
  const historyUrl = `${BRAND_SITE_URL}/?section=profile&tab=botTrades`;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#fff;padding:40px 20px;">
<tr><td align="center">
<table width="100%" style="max-width:480px;">
<tr><td align="center" style="padding-bottom:28px;">
<img src="${BRAND_LOGO_URL}" width="48" height="48" alt="${BRAND_NAME}" style="display:block;border:0;border-radius:12px;margin:0 auto 12px;" />
<span style="font-size:22px;font-weight:600;color:#0a0a0a;letter-spacing:-0.02em;">${BRAND_NAME}</span>
</td></tr>
<tr><td style="background:#f5f5f5;border-radius:16px;padding:32px;">
<h1 style="margin:0 0 8px;font-size:20px;font-weight:500;color:#0a0a0a;text-align:center;">${title}</h1>
<p style="margin:0 0 24px;font-size:15px;color:#525252;text-align:center;">${headline}</p>
<table width="100%" style="background:#fff;border-radius:12px;margin-bottom:24px;">
<tr><td style="padding:20px;text-align:center;">
<p style="margin:0 0 4px;font-size:13px;color:#737373;text-transform:uppercase;letter-spacing:0.5px;">Win (USD)</p>
<p style="margin:0;font-size:28px;font-weight:600;color:#16a34a;">${winLabel}</p>
<p style="margin:8px 0 0;font-size:15px;color:#525252;">${fmtPct(roiPct)}</p>
</td></tr></table>
<p style="margin:0 0 24px;font-size:13px;color:#888;text-align:center;">Closed ${when}</p>
<a href="${historyUrl}" style="display:block;text-align:center;padding:14px 24px;background:#0a0a0a;color:#fff;text-decoration:none;border-radius:50px;font-size:14px;font-weight:500;">View in ${BRAND_NAME}</a>
</td></tr>
<tr><td style="padding-top:24px;text-align:center;">
<p style="margin:0 0 8px;font-size:12px;color:#888;">One email per profitable close</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

async function main() {
  const profitUsd = 31762.55;
  const roiPct = 408.7;
  const headline = 'LONG BTC · lorelli33';
  const winLabel = fmtExactWinUsd(profitUsd);
  const to = (process.env.MOCK_FLYER_TO || 'onlinewave12@gmail.com,ipsunlorem@gmail.com')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);

  const html = tradeCloseEmailHtml({
    headline,
    profitUsd,
    roiPct,
    closedAt: new Date().toISOString(),
    kind: 'trade',
  });

  writeFileSync(resolve(process.cwd(), 'tmp/mock-win-notification.html'), html);

  const apiKey = process.env.RESEND_API_KEY || '';
  const from = process.env.RESEND_FROM || 'HyperGain <hello@hypergain.io>';
  if (!apiKey) {
    console.error('RESEND_API_KEY missing');
    process.exit(2);
  }

  const subject = `${BRAND_NAME} · Trade closed in profit · ${headline} (${winLabel})`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html }),
  });
  const body = await res.text();
  console.log({ winLabel, status: res.status, body: body.slice(0, 200), to });
  if (!res.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
