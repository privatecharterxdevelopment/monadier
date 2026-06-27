/** Canonical marketing origin — used for SEO tags and sitemap URLs. */
export const SITE_ORIGIN =
  (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/$/, '') ||
  'https://monadier.com';

export const SITE_NAME = 'Monadier';

export const OG_IMAGE = `${SITE_ORIGIN}/og-image.png`;

export function ogImageUrl(path = '/og-image.png'): string {
  return `${SITE_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;
}

export const SUPPORT_EMAIL = 'support@monadier.com';

export function absoluteUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${SITE_ORIGIN}${p}`;
}
