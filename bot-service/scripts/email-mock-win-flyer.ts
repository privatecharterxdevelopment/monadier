/**
 * One-off: render a big-roller win flyer and email the PNG for design QA.
 *
 *   cd bot-service && npx tsx scripts/email-mock-win-flyer.ts
 *
 * Needs RESEND_API_KEY in env / ../.env.local
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderWinFlyerPng } from '../src/services/tradeShareFlyer';

function loadEnvLocal() {
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
}

loadEnvLocal();

async function main() {
  const TO = (process.env.MOCK_FLYER_TO || 'onlinewave12@gmail.com,ipsunlorem@gmail.com')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);

  const pnl = 31762.55;
  const png = await renderWinFlyerPng({
    displayName: 'lorelli33',
    avatarUrl: null,
    coin: 'BTC',
    side: 'LONG',
    closedPnlUsd: pnl,
    closePrice: 65200,
    entryPrice: 64100,
    size: 4.85,
    closedAtMs: Date.now(),
    referralCode: 'LORELLI33',
    venueLabel: 'Hyperliquid Perp',
    leverage: 40,
    referralUrl: 'https://app.hypergain.io/?ref=LORELLI33',
  });

  const outDir = resolve(process.cwd(), 'tmp');
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, 'win-flyer-lorelli33-31762.png');
  writeFileSync(outPath, png);
  console.log('PNG written', outPath, 'bytes', png.length);

  const apiKey = process.env.RESEND_API_KEY || '';
  const from = process.env.RESEND_FROM || 'HyperGain <hello@hypergain.io>';
  if (!apiKey) {
    console.error('RESEND_API_KEY missing — PNG saved locally only');
    process.exit(2);
  }

  const b64 = png.toString('base64');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: TO,
      subject: `Win flyer QA — lorelli33 +$${pnl.toLocaleString('en-US')}`,
      html: `<p>Mock big-roller flyer for design check.</p>
<p><b>lorelli33</b> · LONG BTC · <b>+$${pnl.toLocaleString('en-US', { minimumFractionDigits: 2 })}</b></p>
<p>PNG attached.</p>`,
      attachments: [
        {
          filename: 'win-flyer-lorelli33-31762.png',
          content: b64,
        },
      ],
    }),
  });

  const body = await res.text();
  console.log('Resend', res.status, body.slice(0, 400));
  if (!res.ok) process.exit(1);
  console.log('Emailed to', TO.join(', '));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
