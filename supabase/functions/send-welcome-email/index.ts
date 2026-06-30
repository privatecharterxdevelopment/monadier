import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  BRAND_APP_URL,
  BRAND_NAME,
  EMAIL_FROM,
  SUPPORT_EMAIL,
} from "../_shared/brand.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

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

serve(async (req) => {
  try {
    const { email, name } = await req.json();

    if (!email) {
      return new Response(JSON.stringify({ error: "Email is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: email,
        subject: `Welcome to ${BRAND_NAME}`,
        html: welcomeEmailHtml(name || ""),
      }),
    });

    const data = await res.json();

    return new Response(JSON.stringify(data), {
      status: res.ok ? 200 : 400,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
