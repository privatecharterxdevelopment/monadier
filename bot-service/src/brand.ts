/** Product branding — HyperGain (hypergain.io). */
export const BRAND_NAME = 'HyperGain';
export const BRAND_DOMAIN = 'hypergain.io';
export const BRAND_SITE_URL = process.env.APP_PUBLIC_URL || 'https://hypergain.io';
/** Absolute PNG for email clients (Gmail blocks SVG / relative URLs). */
export const BRAND_LOGO_URL =
  process.env.BRAND_LOGO_URL ||
  `https://www.${BRAND_DOMAIN}/email-logo.png`;
export const SUPPORT_EMAIL = 'administration@hypergain.io';
export const EMAIL_FROM =
  process.env.RESEND_FROM || `HyperGain <hello@${BRAND_DOMAIN}>`;

/** Profile → Security, notification email toggles. */
export function notificationEmailUnsubscribeUrl(
  baseUrl: string = BRAND_SITE_URL
): string {
  const base = baseUrl.replace(/\/$/, '');
  return `${base}/?section=profile&tab=security#profile-trade-email`;
}
