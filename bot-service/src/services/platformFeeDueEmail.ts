import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from '../utils/logger';
import {
  BRAND_NAME,
  BRAND_SITE_URL,
  EMAIL_FROM,
  notificationEmailUnsubscribeUrl,
  platformFeePayDeepLink,
} from '../brand';
import { isFeeExemptWallet } from './feeExempt';
import {
  getPlatformFeeStatus,
  PLATFORM_FEE_WINS_BEFORE_BLOCK,
} from './platformFees';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

const APP_PUBLIC_URL =
  process.env.APP_PUBLIC_URL ||
  process.env.APP_TRADE_HISTORY_URL ||
  BRAND_SITE_URL;

function fmtUsd(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '$0.00';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
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
    logger.warn('RESEND_API_KEY missing — platform fee due email skipped');
    return false;
  }

  const from = normalizeResendFrom(config.email.from);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ from, to, subject, html }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    logger.warn('Resend platform fee due email failed', {
      status: res.status,
      from,
      body: body.slice(0, 300),
    });
    return false;
  }
  return true;
}

async function resolveUserIdForWallet(wallet: string): Promise<string | null> {
  const { data: userWallet } = await supabase
    .from('user_wallets')
    .select('user_id')
    .eq('wallet_address', wallet)
    .maybeSingle();
  if (userWallet?.user_id) return userWallet.user_id;

  const { data: vaultRow } = await supabase
    .from('vault_settings')
    .select('user_id')
    .eq('wallet_address', wallet)
    .eq('chain_id', 42161)
    .maybeSingle();
  if (vaultRow?.user_id) return vaultRow.user_id;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('wallet_address', wallet)
    .maybeSingle();
  if (profile?.id) return profile.id;

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('user_id')
    .eq('wallet_address', wallet)
    .maybeSingle();
  return sub?.user_id ?? null;
}

async function resolveUserEmail(userId: string): Promise<string | null> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('email')
    .eq('id', userId)
    .maybeSingle();

  let email = profile?.email ? String(profile.email).trim() : null;
  if (email) return email;

  const { data: authData, error: authErr } = await supabase.auth.admin.getUserById(userId);
  if (authErr) {
    logger.warn('auth.admin.getUserById failed for fee due email', {
      userId,
      error: authErr.message,
    });
    return null;
  }

  email = authData.user?.email?.trim() || null;
  if (email) {
    await supabase.from('profiles').update({ email }).eq('id', userId);
  }
  return email;
}

async function feeDueEmailAlreadySent(wallet: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('wallet_platform_fee_state')
    .select('fee_due_email_sent_at')
    .eq('wallet_address', wallet)
    .maybeSingle();

  if (error) {
    logger.debug('fee due email state read failed', {
      wallet: wallet.slice(0, 10),
      error: error.message,
    });
    return false;
  }
  return Boolean(data?.fee_due_email_sent_at);
}

async function markFeeDueEmailSent(wallet: string): Promise<void> {
  const now = new Date().toISOString();
  await supabase.from('wallet_platform_fee_state').upsert(
    {
      wallet_address: wallet,
      fee_due_email_sent_at: now,
      updated_at: now,
    },
    { onConflict: 'wallet_address' }
  );
}

function platformFeeDueEmailHtml(params: {
  accruedUsd: number;
  successWinCount: number;
  winsBeforeBlock: number;
}): string {
  const { accruedUsd, successWinCount, winsBeforeBlock } = params;
  const payUrl = platformFeePayDeepLink(APP_PUBLIC_URL);
  const unsubscribeUrl = notificationEmailUnsubscribeUrl(APP_PUBLIC_URL);
  const owed = fmtUsd(accruedUsd);

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
<h1 style="margin:0 0 8px;font-size:20px;font-weight:500;color:#0a0a0a;text-align:center;">Bot fees due — action required</h1>
<p style="margin:0 0 24px;font-size:15px;color:#525252;text-align:center;line-height:1.5;">
You reached <strong>${successWinCount}/${winsBeforeBlock}</strong> winning bot trades with unpaid platform fees.
Bot trading is paused until fees are settled.
</p>
<table width="100%" style="background:#fff;border-radius:12px;margin-bottom:24px;">
<tr><td style="padding:20px;text-align:center;">
<p style="margin:0 0 4px;font-size:13px;color:#737373;text-transform:uppercase;letter-spacing:0.5px;">Fees owed</p>
<p style="margin:0;font-size:28px;font-weight:600;color:#0a0a0a;">${owed} USDC</p>
<p style="margin:8px 0 0;font-size:13px;color:#525252;">Pay from your connected wallet on Arbitrum One</p>
</td></tr></table>
<p style="margin:0 0 24px;font-size:14px;color:#525252;line-height:1.55;text-align:center;">
Sign in to your dashboard and pay the accrued success fees (10% of winning closes).
After payment, your win counter resets and bot trading resumes.
</p>
<a href="${payUrl}" style="display:block;text-align:center;padding:14px 24px;background:#0a0a0a;color:#fff;text-decoration:none;border-radius:50px;font-size:14px;font-weight:500;">Pay fees in dashboard</a>
</td></tr>
<tr><td style="padding-top:24px;text-align:center;">
<p style="margin:0 0 8px;font-size:12px;color:#888;">Direct USDC transfer on Arbitrum — not Hyperliquid builder fees</p>
<p style="margin:0;font-size:12px;color:#888;">
<a href="${unsubscribeUrl}" style="color:#525252;text-decoration:underline;">Manage email preferences</a>
 in your ${BRAND_NAME} dashboard.
</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

/**
 * Send one fee-due email when the user hits the win gate with unpaid accrued fees.
 * Idempotent per fee cycle via wallet_platform_fee_state.fee_due_email_sent_at.
 */
export async function maybeSendPlatformFeeDueEmail(walletAddress: string): Promise<boolean> {
  const wallet = walletAddress.toLowerCase();
  if (await isFeeExemptWallet(wallet)) return false;

  const status = await getPlatformFeeStatus(wallet);
  if (!status.opensBlocked || status.accruedUsd <= 0.000_001) return false;
  if (status.successWinCount < PLATFORM_FEE_WINS_BEFORE_BLOCK) return false;
  if (await feeDueEmailAlreadySent(wallet)) return false;

  const userId = await resolveUserIdForWallet(wallet);
  if (!userId) {
    logger.warn('Platform fee due email skipped — no user for wallet', {
      wallet: wallet.slice(0, 10),
    });
    return false;
  }

  const email = await resolveUserEmail(userId);
  if (!email) {
    logger.warn('Platform fee due email skipped — no email for user', {
      wallet: wallet.slice(0, 10),
      userId: userId.slice(0, 8),
    });
    return false;
  }

  const subject = `${BRAND_NAME} · Bot fees due · ${fmtUsd(status.accruedUsd)} USDC (${status.successWinCount}/${PLATFORM_FEE_WINS_BEFORE_BLOCK} wins)`;
  const ok = await sendResendEmail(
    email,
    subject,
    platformFeeDueEmailHtml({
      accruedUsd: status.accruedUsd,
      successWinCount: status.successWinCount,
      winsBeforeBlock: PLATFORM_FEE_WINS_BEFORE_BLOCK,
    })
  );

  if (!ok) return false;

  await markFeeDueEmailSent(wallet);
  logger.info('Platform fee due email sent', {
    wallet: wallet.slice(0, 10),
    userId: userId.slice(0, 8),
    accruedUsd: status.accruedUsd.toFixed(4),
    wins: status.successWinCount,
  });
  return true;
}

/** Backfill fee-due emails for wallets already blocked before this feature shipped. */
export async function processPendingPlatformFeeDueEmails(limit = 20): Promise<number> {
  const { data, error } = await supabase
    .from('wallet_platform_fee_state')
    .select('wallet_address, success_win_count, fee_due_email_sent_at')
    .gte('success_win_count', PLATFORM_FEE_WINS_BEFORE_BLOCK)
    .is('fee_due_email_sent_at', null)
    .order('updated_at', { ascending: true })
    .limit(limit);

  if (error) {
    logger.warn('Pending platform fee due email query failed', { error: error.message });
    return 0;
  }

  let sent = 0;
  for (const row of data ?? []) {
    const wallet = String(row.wallet_address).toLowerCase();
    try {
      const didSend = await maybeSendPlatformFeeDueEmail(wallet);
      if (didSend) sent += 1;
    } catch (err) {
      logger.warn('Platform fee due email row failed', {
        wallet: wallet.slice(0, 10),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (sent > 0) {
    logger.info('Platform fee due emails batch', { sent });
  }
  return sent;
}
