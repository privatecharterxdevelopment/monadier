/**
 * Marketing site vs app subdomain routing.
 * Production: VITE_SITE_URL=https://monadier.com, VITE_APP_URL=https://app.monadier.com
 * Dev: leave unset — same origin, app at /app
 */

const APP_BASE = (import.meta.env.VITE_APP_URL as string | undefined)?.replace(/\/$/, '') ?? '';
const SITE_BASE = (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/$/, '') ?? '';

function normalizePath(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}

/** Canonical in-app entry: Pro Trade terminal (app.monadier.com root in production). */
export function getAppEntryPath(): string {
  return APP_BASE ? '/' : '/app';
}

export function getAppUrl(path?: string): string {
  const p = normalizePath(path ?? getAppEntryPath());
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
  const entry = getAppEntryPath();
  const { pathname } = window.location;
  return pathname === entry || pathname.startsWith(`${entry}/`);
}

export function isAppPath(pathname: string): boolean {
  const entry = getAppEntryPath();
  if (entry === '/') {
    return pathname === '/' || pathname.startsWith('/?');
  }
  return pathname === entry || pathname.startsWith(`${entry}/`);
}

export function isExternalAppUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}

/** Full navigation to app (cross-subdomain) or returns in-app path for React Router */
export function goToApp(path?: string, replace = false): string | null {
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
  const target = path === '/dashboard2' || path.startsWith('/dashboard2/')
    ? getAppEntryPath()
    : path;
  const inApp = goToApp(target, true);
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

export function getLoginUrl(returnToApp = true): string {
  const base = getMarketingUrl('/login');
  if (!returnToApp) return base;
  return `${base}?from=${encodeURIComponent(getAppEntryPath())}`;
}

export function getRegisterUrl(returnToApp = true): string {
  const base = getMarketingUrl('/register');
  if (!returnToApp) return base;
  return `${base}?from=${encodeURIComponent(getAppEntryPath())}`;
}

/** Marketing landing — ?preview=landing skips auto-redirect back into the app when signed in. */
export function getLandingPageUrl(): string {
  const base = getMarketingUrl('/');
  return base.includes('?') ? `${base}&preview=landing` : `${base}?preview=landing`;
}

export function goToLanding(replace = false): string | null {
  return goToMarketing('/?preview=landing', replace);
}
