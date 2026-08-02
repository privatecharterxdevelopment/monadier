import { BRAND_NAME, BRAND_SITE_URL, SUPPORT_EMAIL } from '../brand';

/** Canonical marketing origin for crawlers / OG / sitemap (www). */
export const FALLBACK_SITE_ORIGIN = BRAND_SITE_URL;

/**
 * Origin for absolute SEO URLs.
 * Prefer the live page host, but never emit the bare apex when www is canonical.
 */
export function getSiteOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    const origin = window.location.origin.replace(/\/$/, '');
    if (origin === 'https://hypergain.io') return FALLBACK_SITE_ORIGIN;
    return origin;
  }
  const configured = (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/$/, '');
  if (configured === 'https://hypergain.io') return FALLBACK_SITE_ORIGIN;
  return configured || FALLBACK_SITE_ORIGIN;
}

/** @deprecated use getSiteOrigin() — build-time / SSR fallback only */
export const SITE_ORIGIN = BRAND_SITE_URL;

export const SITE_NAME = BRAND_NAME;

export function ogImageUrl(path = '/og-image-v2.png'): string {
  return `${getSiteOrigin()}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Build-time absolute OG image for index.html parity / helmet fallbacks.
 *  v2 filename busts WhatsApp/Telegram/iMessage caches of the old Monadier art. */
export const OG_IMAGE = `${BRAND_SITE_URL}/og-image-v2.png`;

export { SUPPORT_EMAIL };

export function absoluteUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${getSiteOrigin()}${p}`;
}
