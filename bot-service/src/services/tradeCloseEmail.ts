import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from '../utils/logger';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

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

function tradeCloseEmailHtml(params: {
  headline: string;
  profitUsd: number;
  roiPct: number | null;
  closedAt: string;
}): string {
  const { headline, profitUsd, roiPct, closedAt } = params;
  const pnlColor = profitUsd >= 0 ? '#16a34a' : '#dc2626';
  const when = new Date(closedAt).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#fff;padding:40px 20px;">
<tr><td align="center">
<table width="100%" style="max-width:480px;">
<tr><td align="center" style="padding-bottom:32px;">
<span style="font-size:24px;font-weight:600;color:#0a0a0a;">Monadier</span>
</td></tr>
<tr><td style="background:#f5f5f5;border-radius:16px;padding:32px;">
<h1 style="margin:0 0 8px;font-size:20px;font-weight:500;color:#0a0a0a;text-align:center;">Trade closed</h1>
<p style="margin:0 0 24px;font-size:15px;color:#525252;text-align:center;">${headline}</p>
<table width="100%" style="background:#fff;border-radius:12px;margin-bottom:24px;">
<tr><td style="padding:20px;text-align:center;">
<p style="margin:0 0 4px;font-size:13px;color:#737373;text-transform:uppercase;letter-spacing:0.5px;">P/L</p>
<p style="margin:0;font-size:28px;font-weight:600;color:${pnlColor};">${fmtUsd(profitUsd)}</p>
<p style="margin:8px 0 0;font-size:15px;color:#525252;">${fmtPct(roiPct)}</p>
</td></tr></table>
<p style="margin:0 0 24px;font-size:13px;color:#888;text-align:center;">Closed ${when}</p>
<a href="https://monadier.com/app?section=profile&tab=botTrades" style="display:block;text-align:center;padding:14px 24px;background:#0a0a0a;color:#fff;text-decoration:none;border-radius:50px;font-size:14px;font-weight:500;">View trade history</a>
</td></tr>
<tr><td style="padding-top:24px;text-align:center;">
<p style="margin:0;font-size:12px;color:#888;">Turn off trade emails in Profile → Security.</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

async function sendResendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const apiKey = config.email.resendApiKey;
  if (!apiKey) {
    logger.warn('RESEND_API_KEY missing — trade close email skipped');
    return false;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: config.email.from,
      to,
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    logger.warn('Resend trade close email failed', { status: res.status, body: body.slice(0, 200) });
    return false;
  }
  return true;
}

async function profileForUser(userId: string): Promise<{
  email: string | null;
  emailEnabled: boolean;
}> {
  const { data } = await supabase
    .from('profiles')
    .select('email, trade_close_email_enabled')
    .eq('id', userId)
    .maybeSingle();

  return {
    email: data?.email ? String(data.email) : null,
    emailEnabled: data?.trade_close_email_enabled !== false,
  };
}

/** Send pending trade-close emails (called after bot closes + on cron). */
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
  const now = new Date().toISOString();

  for (const row of rows) {
    try {
      const profile = await profileForUser(row.user_id);
      const profitUsd = Number(row.profit_loss) || 0;
      const roiPct =
        row.profit_loss_percent != null ? Number(row.profit_loss_percent) : null;

      if (profile.emailEnabled && profile.email) {
        const subject =
          profitUsd >= 0
            ? `Trade closed in profit · ${row.headline} (${fmtUsd(profitUsd)})`
            : `Trade closed · ${row.headline} (${fmtUsd(profitUsd)})`;
        const ok = await sendResendEmail(
          profile.email,
          subject,
          tradeCloseEmailHtml({
            headline: row.headline,
            profitUsd,
            roiPct,
            closedAt: row.closed_at,
          })
        );
        if (ok) sent += 1;
      }

      await supabase
        .from('user_trade_notifications')
        .update({ email_sent_at: now })
        .eq('id', row.id);
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
