import { BRAND_NAME, BRAND_SITE_URL, SUPPORT_EMAIL } from '../brand';

/** Live deploy origin until hypergain.io custom domain + DNS are verified on Vercel. */
export const FALLBACK_SITE_ORIGIN = BRAND_SITE_URL;

/** Canonical marketing origin — always prefer the page the user is actually on. */
export function getSiteOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  const configured = (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/$/, '');
  return configured || FALLBACK_SITE_ORIGIN;
}

/** @deprecated use getSiteOrigin() — build-time / SSR fallback only */
export const SITE_ORIGIN = BRAND_SITE_URL;

export const SITE_NAME = BRAND_NAME;

export function ogImageUrl(path = '/og-image.png'): string {
  return `${getSiteOrigin()}${path.startsWith('/') ? path : `/${path}`}`;
}

export const OG_IMAGE = ogImageUrl();

export { SUPPORT_EMAIL };

export function absoluteUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${getSiteOrigin()}${p}`;
}
