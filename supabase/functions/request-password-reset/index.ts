import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createSupabaseAdmin } from '../_shared/supabase.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const FROM_ADDRESS = 'Monadier <hello@monadier.io>';

/** Hardcoded — never localhost. Matches Vercel production + Supabase allowlist. */
const PASSWORD_RESET_REDIRECT = 'https://monadier.vercel.app/reset-password';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function resetEmailHtml(resetLink: string): string {
  const safe = escapeHtml(resetLink);
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="100%" style="max-width:480px;background:#f5f5f5;border-radius:16px;">
          <tr>
            <td style="padding:40px 32px;text-align:center;">
              <p style="margin:0 0 8px;font-size:28px;font-weight:600;color:#0a0a0a;">+Monadier</p>
              <h1 style="margin:0 0 16px;font-size:22px;font-weight:500;color:#0a0a0a;">Reset your password</h1>
              <p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:#525252;">
                Click the button below to choose a new password. This link expires in about an hour.
              </p>
              <a href="${safe}" style="display:inline-block;padding:14px 28px;background:#0a0a0a;color:#fff;text-decoration:none;border-radius:10px;font-size:15px;font-weight:500;">
                Reset password
              </a>
              <p style="margin:28px 0 0;font-size:12px;line-height:1.5;color:#737373;word-break:break-all;">
                Or copy this link:<br><a href="${safe}" style="color:#525252;">${safe}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function sendViaResend(to: string, resetLink: string): Promise<boolean> {
  if (!RESEND_API_KEY) return false;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: [to],
      subject: 'Reset your Monadier password',
      html: resetEmailHtml(resetLink),
    }),
  });
  return res.ok;
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, error: 'POST required' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const email = String(body.email ?? '')
      .trim()
      .toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ success: false, error: 'Valid email required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: PASSWORD_RESET_REDIRECT },
    });

    if (error) {
      console.error('generateLink failed', error.message);
      // Do not reveal whether the email exists
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const resetLink =
      data.properties?.action_link ||
      (data as { action_link?: string }).action_link;

    if (!resetLink) {
      console.error('generateLink missing action_link');
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const sent = await sendViaResend(email, resetLink);
    if (!sent) {
      const { error: mailErr } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: PASSWORD_RESET_REDIRECT,
      });
      if (mailErr) {
        console.error('resetPasswordForEmail fallback failed', mailErr.message);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('request-password-reset error', err);
    return new Response(JSON.stringify({ success: false, error: 'Request failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
