/** Product branding — HyperGain (hypergain.io). */
export const BRAND_NAME = 'HyperGain';
export const BRAND_DOMAIN = 'hypergain.io';
export const BRAND_SITE_URL = process.env.APP_PUBLIC_URL || 'https://hypergain.io';
export const SUPPORT_EMAIL = 'support@hypergain.io';
export const EMAIL_FROM =
  process.env.RESEND_FROM || `HyperGain <hello@${BRAND_DOMAIN}>`;

/** Profile → Security, trade close email toggle (notification unsubscribe). */
export function notificationEmailUnsubscribeUrl(
  baseUrl: string = BRAND_SITE_URL
): string {
  const base = baseUrl.replace(/\/$/, '');
  return `${base}/?section=profile#profile-trade-email`;
}

/** Dashboard deep link — opens bot section and fee payment modal. */
export function platformFeePayDeepLink(baseUrl: string = BRAND_SITE_URL): string {
  const base = baseUrl.replace(/\/$/, '');
  return `${base}/?section=bot&payFees=1`;
}
