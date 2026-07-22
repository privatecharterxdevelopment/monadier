export const BRAND_NAME = 'HyperGain';
export const BRAND_DOMAIN = 'hypergain.io';
export const BRAND_SITE_URL = 'https://hypergain.io';
export const BRAND_APP_URL = 'https://app.hypergain.io';
export const BRAND_LOGO_URL = `https://www.${BRAND_DOMAIN}/email-logo.png`;
export const SUPPORT_EMAIL = 'support@hypergain.io';
/** Ops inbox — new signups + support form (override via ADMIN_NOTIFY_EMAIL / SUPPORT_INBOX). */
export const ADMIN_NOTIFY_EMAIL = 'administration@hypergain.io';
export const EMAIL_FROM = `HyperGain <hello@${BRAND_DOMAIN}>`;
export const EMAIL_FROM_SUPPORT = `HyperGain Support <hello@${BRAND_DOMAIN}>`;

/** Profile → Security, trade close email toggle (notification unsubscribe). */
export function notificationEmailUnsubscribeUrl(
  baseUrl: string = BRAND_APP_URL
): string {
  const base = baseUrl.replace(/\/$/, '');
  return `${base}/?section=profile#profile-trade-email`;
}
