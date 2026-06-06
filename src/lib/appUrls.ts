/**
 * Marketing site vs app subdomain routing.
 * Production: VITE_SITE_URL=https://monadier.com, VITE_APP_URL=https://app.monadier.com
 * Dev: leave unset — same origin, paths like /dashboard2
 */

const APP_BASE = (import.meta.env.VITE_APP_URL as string | undefined)?.replace(/\/$/, '') ?? '';
const SITE_BASE = (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/$/, '') ?? '';

function normalizePath(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}

export function getAppUrl(path = '/dashboard2'): string {
  const p = normalizePath(path);
  return APP_BASE ? `${APP_BASE}${p}` : p;
}

export function getMarketingUrl(path = '/'): string {
  const p = normalizePath(path);
  return SITE_BASE ? `${SITE_BASE}${p}` : p;
}

export function isAppHost(): boolean {
  if (typeof window === 'undefined') return false;
  if (APP_BASE) {
    try {
      return new URL(APP_BASE).hostname === window.location.hostname;
    } catch {
      return false;
    }
  }
  return window.location.pathname.startsWith('/dashboard');
}

export function isExternalAppUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}

/** Full navigation to app (cross-subdomain) or returns in-app path for React Router */
export function goToApp(path = '/dashboard2', replace = false): string | null {
  const url = getAppUrl(path);
  if (isExternalAppUrl(url)) {
    if (replace) window.location.replace(url);
    else window.location.assign(url);
    return null;
  }
  return url;
}

/** After login/register — hop to app subdomain when configured */
export function afterAuthGo(
  path: string,
  navigate: (p: string, opts?: { replace?: boolean }) => void
): void {
  const inApp = goToApp(path, true);
  if (inApp) navigate(inApp, { replace: true });
}

export function goToMarketing(path = '/', replace = false): string | null {
  const url = getMarketingUrl(path);
  if (isExternalAppUrl(url)) {
    if (replace) window.location.replace(url);
    else window.location.assign(url);
    return null;
  }
  return url;
}
