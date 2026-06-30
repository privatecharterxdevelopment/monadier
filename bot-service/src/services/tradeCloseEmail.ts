import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from '../utils/logger';
import { BRAND_NAME, BRAND_SITE_URL, EMAIL_FROM } from '../brand';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

const APP_TRADE_HISTORY_URL =
  process.env.APP_TRADE_HISTORY_URL ||
  process.env.APP_PUBLIC_URL ||
  BRAND_SITE_URL;

type PendingRow = {
  id: string;
  user_id: string;
  headline: string;
  profit_loss: number;
  profit_loss_percent: number | null;
  closed_at: string;
  kind: string;
};

function fmtUsd(n: number): string {
  const sign = n >= 0 ? '+' : '-';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}% ROI`;
}

function tradeHistoryDeepLink(): string {
  const base = APP_TRADE_HISTORY_URL.replace(/\/$/, '');
  return `${base}/?section=profile&tab=botTrades`;
}

function tradeCloseEmailHtml(params: {
  headline: string;
  profitUsd: number;
  roiPct: number | null;
  closedAt: string;
  kind: string;
}): string {
  const { headline, profitUsd, roiPct, closedAt, kind } = params;
  const pnlColor = profitUsd >= 0 ? '#16a34a' : '#dc2626';
  const when = new Date(closedAt).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const title =
    kind === 'betting'
      ? profitUsd >= 0
        ? 'Bet settled — win'
        : profitUsd < 0
          ? 'Bet settled — loss'
          : 'Bet settled'
      : 'Trade closed';
  const historyUrl =
    kind === 'betting'
      ? `${APP_TRADE_HISTORY_URL.replace(/\/$/, '')}/?section=sportsbets`
      : tradeHistoryDeepLink();

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#fff;padding:40px 20px;">
<tr><td align="center">
<table width="100%" style="max-width:480px;">
<tr><td align="center" style="padding-bottom:32px;">
<span style="font-size:24px;font-weight:600;color:#0a0a0a;">${BRAND_NAME}</span>
</td></tr>
<tr><td style="background:#f5f5f5;border-radius:16px;padding:32px;">
<h1 style="margin:0 0 8px;font-size:20px;font-weight:500;color:#0a0a0a;text-align:center;">${title}</h1>
<p style="margin:0 0 24px;font-size:15px;color:#525252;text-align:center;">${headline}</p>
<table width="100%" style="background:#fff;border-radius:12px;margin-bottom:24px;">
<tr><td style="padding:20px;text-align:center;">
<p style="margin:0 0 4px;font-size:13px;color:#737373;text-transform:uppercase;letter-spacing:0.5px;">P/L</p>
<p style="margin:0;font-size:28px;font-weight:600;color:${pnlColor};">${fmtUsd(profitUsd)}</p>
<p style="margin:8px 0 0;font-size:15px;color:#525252;">${fmtPct(roiPct)}</p>
</td></tr></table>
<p style="margin:0 0 24px;font-size:13px;color:#888;text-align:center;">Closed ${when}</p>
<a href="${historyUrl}" style="display:block;text-align:center;padding:14px 24px;background:#0a0a0a;color:#fff;text-decoration:none;border-radius:50px;font-size:14px;font-weight:500;">View in ${BRAND_NAME}</a>
</td></tr>
<tr><td style="padding-top:24px;text-align:center;">
<p style="margin:0;font-size:12px;color:#888;">Turn off these emails in Profile → Security.</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function normalizeResendFrom(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return EMAIL_FROM;
  if (trimmed.includes('<') && trimmed.includes('>')) return trimmed;
  return `${BRAND_NAME} <${trimmed}>`;
}

async function sendResendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const apiKey = config.email.resendApiKey;
  if (!apiKey) {
    logger.warn('RESEND_API_KEY missing — trade close email skipped');
    return false;
  }

  const from = normalizeResendFrom(config.email.from);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    logger.warn('Resend trade close email failed', {
      status: res.status,
      from,
      body: body.slice(0, 300),
    });
    return false;
  }
  return true;
}

async function resolveUserEmail(userId: string): Promise<{
  email: string | null;
  emailEnabled: boolean;
}> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('email, trade_close_email_enabled')
    .eq('id', userId)
    .maybeSingle();

  let email = profile?.email ? String(profile.email).trim() : null;

  if (!email) {
    const { data: authData, error: authErr } = await supabase.auth.admin.getUserById(userId);
    if (authErr) {
      logger.warn('auth.admin.getUserById failed', { userId, error: authErr.message });
    } else {
      email = authData.user?.email?.trim() || null;
      if (email) {
        await supabase.from('profiles').update({ email }).eq('id', userId);
      }
    }
  }

  return {
    email,
    emailEnabled: profile?.trade_close_email_enabled !== false,
  };
}

/** Send pending trade-close emails (bot + betting + manual). */
export async function processPendingTradeCloseEmails(limit = 40): Promise<number> {
  const { data, error } = await supabase
    .from('user_trade_notifications')
    .select('id, user_id, headline, profit_loss, profit_loss_percent, closed_at, kind')
    .is('email_sent_at', null)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    logger.warn('Pending trade email query failed', { error: error.message });
    return 0;
  }

  const rows = (data ?? []) as PendingRow[];
  if (rows.length === 0) return 0;

  let sent = 0;

  for (const row of rows) {
    try {
      const profitUsd = Number(row.profit_loss) || 0;
      const roiPct =
        row.profit_loss_percent != null ? Number(row.profit_loss_percent) : null;

      // Successful trades only — losses stay in-app, no email.
      if (profitUsd <= 0) {
        await supabase
          .from('user_trade_notifications')
          .update({ email_sent_at: new Date().toISOString() })
          .eq('id', row.id);
        continue;
      }

      const { email, emailEnabled } = await resolveUserEmail(row.user_id);

      if (!emailEnabled) {
        await supabase
          .from('user_trade_notifications')
          .update({ email_sent_at: new Date().toISOString() })
          .eq('id', row.id);
        continue;
      }

      if (!email) {
        logger.warn('Trade close email skipped — no email for user', {
          userId: row.user_id,
          notificationId: row.id,
        });
        continue;
      }

      const subjectPrefix =
        row.kind === 'betting'
          ? profitUsd >= 0
            ? 'Bet won'
            : profitUsd < 0
              ? 'Bet lost'
              : 'Bet settled'
          : profitUsd >= 0
            ? 'Trade closed in profit'
            : 'Trade closed';

      const subject = `${subjectPrefix} · ${row.headline} (${fmtUsd(profitUsd)})`;
      const ok = await sendResendEmail(
        email,
        subject,
        tradeCloseEmailHtml({
          headline: row.headline,
          profitUsd,
          roiPct,
          closedAt: row.closed_at,
          kind: row.kind,
        })
      );

      if (ok) {
        sent += 1;
        await supabase
          .from('user_trade_notifications')
          .update({ email_sent_at: new Date().toISOString() })
          .eq('id', row.id);
      }
    } catch (err) {
      logger.warn('Trade close email row failed', {
        id: row.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (sent > 0) {
    logger.info('Trade close emails sent', { sent, processed: rows.length });
  }

  return sent;
}
