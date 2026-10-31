import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  ADMIN_NOTIFY_EMAIL,
  BRAND_APP_URL,
  BRAND_NAME,
  EMAIL_FROM,
  SUPPORT_EMAIL,
} from "../_shared/brand.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const ADMIN_INBOX =
  Deno.env.get("ADMIN_NOTIFY_EMAIL") ||
  Deno.env.get("SUPPORT_INBOX") ||
  ADMIN_NOTIFY_EMAIL;

const welcomeEmailHtml = (userName: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #ffffff;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 480px;">

          <tr>
            <td align="center" style="padding-bottom: 40px;">
              <span style="font-size: 28px; font-weight: 600; color: #0a0a0a; letter-spacing: -0.5px;">${BRAND_NAME}</span>
            </td>
          </tr>

          <tr>
            <td>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f5f5f5; border-radius: 16px;">
                <tr>
                  <td style="padding: 40px 32px;">

                    <h1 style="margin: 0 0 16px 0; font-size: 24px; font-weight: 500; color: #0a0a0a; text-align: center;">
                      Welcome to ${BRAND_NAME}${userName ? `, ${userName}` : ''}
                    </h1>

                    <p style="margin: 0 0 32px 0; font-size: 15px; line-height: 1.6; color: #525252; text-align: center;">
                      Your account is ready. Start automated Hyperliquid trading with live charts and 24/7 bot execution.
                    </p>

                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 32px;">
                      <tr>
                        <td style="padding: 16px 20px; background-color: #ffffff; border-radius: 12px;">
                          <p style="margin: 0 0 12px 0; font-size: 13px; font-weight: 500; color: #0a0a0a; text-transform: uppercase; letter-spacing: 0.5px;">
                            What you can do
                          </p>
                          <ul style="margin: 0; padding: 0 0 0 20px; font-size: 14px; line-height: 1.8; color: #525252;">
                            <li>Connect your wallet securely</li>
                            <li>Approve the HL trading agent once</li>
                            <li>Run the full-auto bot on Hyperliquid perps</li>
                            <li>Monitor performance 24/7</li>
                          </ul>
                        </td>
                      </tr>
                    </table>

                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td align="center">
                          <a href="${BRAND_APP_URL}/" style="display: inline-block; padding: 14px 32px; background-color: #0a0a0a; color: #ffffff; font-size: 14px; font-weight: 500; text-decoration: none; border-radius: 50px;">
                            Start Bot Trading
                          </a>
                        </td>
                      </tr>
                    </table>

                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding-top: 32px; text-align: center;">
              <p style="margin: 0 0 8px 0; font-size: 13px; color: #888888;">
                Questions? Contact us anytime
              </p>
              <a href="mailto:${SUPPORT_EMAIL}" style="font-size: 13px; color: #0a0a0a; text-decoration: none;">
                ${SUPPORT_EMAIL}
              </a>
              <p style="margin: 24px 0 0 0; font-size: 12px; color: #888888;">
                © 2026 ${BRAND_NAME}. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function adminSignupHtml(opts: {
  email: string;
  name: string;
  username?: string;
  country?: string;
  userId?: string;
}) {
  const rows = [
    ["Email", opts.email],
    ["Name", opts.name || "—"],
    ["Username", opts.username || "—"],
    ["Country", opts.country || "—"],
    ["User ID", opts.userId || "—"],
  ]
    .map(
      ([label, value]) => `
      <tr>
        <td style="padding:8px 12px;font-size:12px;font-weight:600;color:#71717a;width:100px;">${escapeHtml(label)}</td>
        <td style="padding:8px 12px;font-size:13px;color:#0a0a0a;">${escapeHtml(value)}</td>
      </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f4f4f5;">
  <table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e4e4e7;">
    <tr><td style="padding:24px;">
      <p style="margin:0 0 8px;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#71717a;">${BRAND_NAME} admin</p>
      <h1 style="margin:0 0 16px;font-size:18px;font-weight:600;color:#0a0a0a;">New registration</h1>
      <table role="presentation" width="100%" style="border-collapse:collapse;background:#fafafa;border-radius:8px;">${rows}</table>
      <p style="margin:20px 0 0;font-size:13px;color:#525252;">
        Open Admin Monitor → Overview to see the signup feed.
      </p>
    </td></tr>
  </table>
</body></html>`;
}

async function sendResend(payload: Record<string, unknown>) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  return { ok: res.ok, data };
}

serve(async (req) => {
  try {
    const body = await req.json();
    const email = String(body?.email ?? "").trim();
    const name = String(body?.name ?? "").trim();
    const username = String(body?.username ?? "").trim();
    const country = String(body?.country ?? "").trim();
    const userId = String(body?.userId ?? "").trim();
    const skipUserWelcome = Boolean(body?.adminOnly);

    if (!email) {
      return new Response(JSON.stringify({ error: "Email is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "Email service not configured" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }

    let welcome: { ok: boolean; data: unknown } | null = null;
    if (!skipUserWelcome) {
      welcome = await sendResend({
        from: EMAIL_FROM,
        to: email,
        subject: `Welcome to ${BRAND_NAME}`,
        html: welcomeEmailHtml(name || ""),
      });
    }

    const admin = await sendResend({
      from: EMAIL_FROM,
      to: ADMIN_INBOX,
      subject: `[${BRAND_NAME}] New registration — ${email}`,
      html: adminSignupHtml({ email, name, username, country, userId }),
    });

    if (!admin.ok) {
      console.error("[send-welcome-email] admin notify failed", admin.data);
    }

    const ok = skipUserWelcome ? admin.ok : Boolean(welcome?.ok);
    return new Response(
      JSON.stringify({
        welcome: welcome?.data ?? null,
        admin: admin.data,
        adminOk: admin.ok,
      }),
      {
        status: ok ? 200 : 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
