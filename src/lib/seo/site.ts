/** Canonical marketing origin — runtime uses current host (Vercel preview until custom domain). */
export function getSiteOrigin(): string {
  if (typeof window !== 'undefined') return window.location.origin;
  const configured = (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/$/, '');
  return configured || 'https://monadier.vercel.app';
}

/** @deprecated use getSiteOrigin() — build-time fallback only */
export const SITE_ORIGIN = getSiteOrigin();

export const SITE_NAME = 'Monadier';

export function ogImageUrl(path = '/og-image.png'): string {
  return `${getSiteOrigin()}${path.startsWith('/') ? path : `/${path}`}`;
}

export const OG_IMAGE = ogImageUrl();

export const SUPPORT_EMAIL = 'support@monadier.io';

export function absoluteUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${getSiteOrigin()}${p}`;
}
