import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createSupabaseAdmin, getUserFromToken } from '../_shared/supabase.ts';

import { BRAND_NAME, EMAIL_FROM_SUPPORT } from '../_shared/brand.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
/** Ops inbox for support tickets — override with SUPPORT_INBOX secret if needed. */
const SUPPORT_INBOX =
  Deno.env.get('SUPPORT_INBOX') || 'administration@hypergain.io';
const FROM_ADDRESS = EMAIL_FROM_SUPPORT;

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
      <p style="margin:0 0 8px;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#71717a;">${BRAND_NAME} support</p>
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
    const channel = body?.channel === 'chat' ? 'chat' : 'form';

    if (subject.length < 3 || subject.length > MAX_SUBJECT) {
      return new Response(JSON.stringify({ error: 'Subject must be 3–120 characters' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (channel === 'chat') {
      if (message.length < 1 || message.length > MAX_MESSAGE) {
        return new Response(JSON.stringify({ error: 'Message must be 1–5000 characters' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } else if (message.length < 10 || message.length > MAX_MESSAGE) {
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

    // Resume an open ticket instead of opening duplicates (live chat).
    const { data: existingOpen } = await supabase
      .from('support_requests')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let ticketId: string | null = existingOpen?.id ?? null;
    const isNewTicket = !ticketId;

    if (ticketId) {
      const { error: msgErr } = await supabase.from('support_messages').insert({
        request_id: ticketId,
        sender_id: user.id,
        sender_role: 'user',
        body: message,
      });
      if (msgErr) {
        console.error('[send-support-message] message insert error:', msgErr);
        return new Response(JSON.stringify({ error: 'Failed to send message' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } else {
      const { data: ticket, error: insertErr } = await supabase
        .from('support_requests')
        .insert({
          user_id: user.id,
          subject,
          message,
          user_email: userEmail,
          user_full_name: fullName || null,
          user_username: username || null,
          wallet_address: walletAddress || null,
          status: 'open',
          channel,
        })
        .select('id')
        .single();

      if (insertErr) {
        console.error('[send-support-message] DB insert error:', insertErr);
        return new Response(
          JSON.stringify({
            error: insertErr.message?.includes('relation')
              ? 'Support inbox not ready — contact administration@hypergain.io'
              : 'Failed to save support request',
          }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      ticketId = ticket?.id ?? null;

      if (ticketId) {
        const { error: msgErr } = await supabase.from('support_messages').insert({
          request_id: ticketId,
          sender_id: user.id,
          sender_role: 'user',
          body: message,
        });
        if (msgErr) {
          console.error('[send-support-message] first message insert error:', msgErr);
        }
      }
    }

    let emailSent = false;
    if (isNewTicket) {
      if (!RESEND_API_KEY) {
        console.error('[send-support-message] RESEND_API_KEY missing — ticket saved only');
      } else {
        const mailSubject = `[${BRAND_NAME}] ${subject}`;
        const html = supportEmailHtml({
          subject,
          message,
          userId: user.id,
          email: userEmail,
          fullName,
          username,
          walletAddress,
        });

        try {
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
          } else {
            emailSent = true;
          }
        } catch (mailErr) {
          console.error('[send-support-message] Resend fetch failed:', mailErr);
        }
      }
    }

    // Ticket is source of truth for Admin Monitor — never fail the user after save.
    return new Response(
      JSON.stringify({ ok: true, ticketId, emailSent }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    const status = msg.includes('token') ? 401 : 500;
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
