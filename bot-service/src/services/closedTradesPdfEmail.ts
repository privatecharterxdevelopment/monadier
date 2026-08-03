/**
 * Email a PDF of all closed trade_history rows (all users) via Resend.
 */
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from '../utils/logger';
import { BRAND_NAME, EMAIL_FROM } from '../brand';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

type TradeRow = {
  id: string;
  wallet_address: string;
  token_symbol: string;
  direction: string;
  leverage: number | null;
  entry_price: number | string | null;
  exit_price: number | string | null;
  profit_loss: number | string | null;
  profit_loss_percent: number | string | null;
  close_reason: string | null;
  opened_at: string | null;
  closed_at: string | null;
};

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function escPdf(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function buildClosedTradesPdf(rows: TradeRow[]): Buffer {
  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 36;
  const lineH = 11;
  const maxY = pageHeight - margin;

  const wins = rows.filter((r) => num(r.profit_loss) > 0).length;
  const losses = rows.filter((r) => num(r.profit_loss) < 0).length;
  const net = rows.reduce((s, r) => s + num(r.profit_loss), 0);

  const lines: string[] = [
    `${BRAND_NAME} — All users closed trades`,
    `Generated: ${new Date().toISOString()}`,
    `Trades: ${rows.length} · Wins: ${wins} · Losses: ${losses} · Net PnL: $${net.toFixed(2)}`,
    '',
    'ClosedAt | Wallet | Coin | Side | Lev | Entry | Exit | PnL$ | PnL% | Reason',
    '-'.repeat(100),
  ];

  for (const r of rows) {
    const wallet = String(r.wallet_address || '').toLowerCase();
    const short = wallet.length > 12 ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : wallet;
    const closed = (r.closed_at || '').replace('T', ' ').slice(0, 16);
    lines.push(
      [
        closed || '—',
        short,
        String(r.token_symbol || '').toUpperCase(),
        String(r.direction || '').toUpperCase(),
        String(r.leverage ?? '—'),
        num(r.entry_price).toPrecision(6),
        num(r.exit_price).toPrecision(6),
        num(r.profit_loss).toFixed(2),
        num(r.profit_loss_percent).toFixed(2),
        String(r.close_reason || '—').slice(0, 18),
      ].join(' | ')
    );
  }

  const contentStreams: string[] = [];
  let pageLines: string[] = [];
  let y = maxY;

  const flushPage = () => {
    const parts = ['BT', '/F1 8 Tf'];
    let yy = maxY;
    for (const ln of pageLines) {
      parts.push(`1 0 0 1 ${margin} ${yy} Tm (${escPdf(ln.slice(0, 110))}) Tj`);
      yy -= lineH;
    }
    parts.push('ET');
    contentStreams.push(parts.join('\n'));
    pageLines = [];
    y = maxY;
  };

  for (const ln of lines) {
    if (y < margin + lineH) flushPage();
    pageLines.push(ln);
    y -= lineH;
  }
  if (pageLines.length) flushPage();

  const objs: { n: number; body: string }[] = [];
  let n = 1;
  const catalogN = n++;
  const pagesN = n++;
  const fontN = n++;
  const pageNs: number[] = [];
  const streamNs: number[] = [];
  for (let i = 0; i < contentStreams.length; i++) {
    pageNs.push(n++);
    streamNs.push(n++);
  }

  objs.push({ n: catalogN, body: `<< /Type /Catalog /Pages ${pagesN} 0 R >>` });
  objs.push({
    n: pagesN,
    body: `<< /Type /Pages /Kids [${pageNs.map((p) => `${p} 0 R`).join(' ')}] /Count ${pageNs.length} >>`,
  });
  objs.push({
    n: fontN,
    body: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  });

  for (let i = 0; i < contentStreams.length; i++) {
    const stream = contentStreams[i];
    objs.push({
      n: pageNs[i],
      body: `<< /Type /Page /Parent ${pagesN} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents ${streamNs[i]} 0 R /Resources << /Font << /F1 ${fontN} 0 R >> >> >>`,
    });
    objs.push({
      n: streamNs[i],
      body: `<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream`,
    });
  }

  objs.sort((a, b) => a.n - b.n);
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const o of objs) {
    offsets[o.n] = Buffer.byteLength(pdf, 'utf8');
    pdf += `${o.n} 0 obj\n${o.body}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objs.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= objs.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root ${catalogN} 0 R >>\n`;
  pdf += `startxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'utf8');
}

async function fetchAllClosedTrades(): Promise<TradeRow[]> {
  const pageSize = 1000;
  const out: TradeRow[] = [];
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from('trade_history')
      .select(
        'id,wallet_address,token_symbol,direction,leverage,entry_price,exit_price,profit_loss,profit_loss_percent,close_reason,opened_at,closed_at'
      )
      .not('closed_at', 'is', null)
      .order('closed_at', { ascending: false })
      .range(from, to);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as TradeRow[];
    out.push(...batch);
    if (batch.length < pageSize) break;
  }
  return out;
}

function normalizeResendFrom(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return EMAIL_FROM;
  if (trimmed.includes('<') && trimmed.includes('>')) return trimmed;
  return `${BRAND_NAME} <${trimmed}>`;
}

export async function emailAllClosedTradesPdf(opts: {
  to: string;
  idempotencyKey?: string;
}): Promise<{ ok: boolean; tradeCount: number; error?: string }> {
  const to = opts.to.trim().toLowerCase();
  if (!to.includes('@')) return { ok: false, tradeCount: 0, error: 'invalid email' };

  const apiKey = config.email.resendApiKey;
  if (!apiKey) {
    return { ok: false, tradeCount: 0, error: 'RESEND_API_KEY missing' };
  }

  const rows = await fetchAllClosedTrades();
  if (rows.length === 0) {
    logger.warn('closed trades PDF: no rows in trade_history');
    return { ok: false, tradeCount: 0, error: 'no closed trades in trade_history' };
  }

  const pdf = buildClosedTradesPdf(rows);
  const wins = rows.filter((r) => num(r.profit_loss) > 0).length;
  const net = rows.reduce((s, r) => s + num(r.profit_loss), 0);
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `hypergain-closed-trades-all-users-${stamp}.pdf`;

  const html = `
    <p>${BRAND_NAME} — closed trades export (all users).</p>
    <p><b>${rows.length}</b> closes · <b>${wins}</b> wins · net <b>$${net.toFixed(2)}</b></p>
    <p>PDF attached.</p>
  `;

  const idem = opts.idempotencyKey || `closed-trades-pdf-all-users-${to}-${stamp}`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'Idempotency-Key': idem,
    },
    body: JSON.stringify({
      from: normalizeResendFrom(config.email.from),
      to: [to],
      subject: `${BRAND_NAME} — all users closed trades (${rows.length})`,
      html,
      attachments: [
        {
          filename,
          content: pdf.toString('base64'),
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    logger.warn('closed trades PDF email failed', {
      status: res.status,
      body: body.slice(0, 400),
    });
    return { ok: false, tradeCount: rows.length, error: `Resend ${res.status}` };
  }

  logger.info('closed trades PDF emailed', { to, tradeCount: rows.length, bytes: pdf.length });
  return { ok: true, tradeCount: rows.length };
}

/** Boot: send all-users closed-trades PDF (override with EMAIL_CLOSED_TRADES_TO). */
export async function maybeEmailClosedTradesOnBoot(): Promise<void> {
  const to = (process.env.EMAIL_CLOSED_TRADES_TO || 'onlinewave12@gmail.com').trim();
  if (!to) return;
  // Skip only when explicitly disabled
  if (process.env.EMAIL_CLOSED_TRADES_DISABLE === '1') return;

  const result = await emailAllClosedTradesPdf({
    to,
    // Stable key → one send; bump suffix to resend.
    idempotencyKey: `closed-trades-pdf-${to}-all-users-v1`,
  });
  if (!result.ok) {
    logger.warn('boot closed-trades PDF skipped/failed', result);
  }
}
