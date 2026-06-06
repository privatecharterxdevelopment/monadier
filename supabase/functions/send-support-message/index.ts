import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createSupabaseAdmin, getUserFromToken } from '../_shared/supabase.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const SUPPORT_INBOX = 'support@monadier.com';
const FROM_ADDRESS = 'Monadier Support <hello@monadier.com>';

const MAX_SUBJECT = 120;
const MAX_MESSAGE = 5000;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function supportEmailHtml(opts: {
  subject: string;
  message: string;
  userId: string;
  email: string;
  fullName: string;
  username: string;
  walletAddress: string;
}) {
  const rows = [
    ['User ID', opts.userId],
    ['Email', opts.email],
    ['Name', opts.fullName || '—'],
    ['Username', opts.username || '—'],
    ['Wallet', opts.walletAddress || '—'],
    ['Subject', opts.subject],
  ];

  const metaRows = rows
    .map(
      ([label, value]) => `
      <tr>
        <td style="padding:8px 12px;font-size:12px;font-weight:600;color:#71717a;vertical-align:top;width:100px;">${escapeHtml(label)}</td>
        <td style="padding:8px 12px;font-size:13px;color:#0a0a0a;word-break:break-word;">${escapeHtml(value)}</td>
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f4f4f5;">
  <table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e4e4e7;">
    <tr><td style="padding:24px;">
      <p style="margin:0 0 8px;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#71717a;">Dashboard2 support</p>
      <h1 style="margin:0 0 20px;font-size:18px;font-weight:600;color:#0a0a0a;">${escapeHtml(opts.subject)}</h1>
      <table role="presentation" width="100%" style="margin-bottom:20px;border-collapse:collapse;background:#fafafa;border-radius:8px;">${metaRows}</table>
      <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#71717a;">Message</p>
      <div style="padding:14px;border-radius:8px;background:#fafafa;font-size:14px;line-height:1.55;color:#27272a;white-space:pre-wrap;">${escapeHtml(opts.message)}</div>
    </td></tr>
  </table>
</body></html>`;
}

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: 'Email service not configured' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const user = await getUserFromToken(authHeader);
    const body = await req.json();
    const subject = String(body?.subject ?? '').trim();
    const message = String(body?.message ?? '').trim();

    if (subject.length < 3 || subject.length > MAX_SUBJECT) {
      return new Response(JSON.stringify({ error: 'Subject must be 3–120 characters' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (message.length < 10 || message.length > MAX_MESSAGE) {
      return new Response(JSON.stringify({ error: 'Message must be 10–5000 characters' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createSupabaseAdmin();
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, full_name, username, wallet_address')
      .eq('id', user.id)
      .maybeSingle();

    const userEmail = profile?.email || user.email || 'unknown';
    const fullName = profile?.full_name || (user.user_metadata?.full_name as string) || '';
    const username = profile?.username || '';
    const walletAddress = profile?.wallet_address || '';

    const mailSubject = `[Monadier] ${subject}`;
    const html = supportEmailHtml({
      subject,
      message,
      userId: user.id,
      email: userEmail,
      fullName,
      username,
      walletAddress,
    });

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: SUPPORT_INBOX,
        reply_to: userEmail,
        subject: mailSubject,
        html,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error('[send-support-message] Resend error:', data);
      return new Response(JSON.stringify({ error: 'Failed to send message' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, id: data.id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    const status = msg.includes('token') ? 401 : 500;
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
