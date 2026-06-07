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

/** Pro Trade on app subdomain root (app.monadier.com/). */
export function getAppEntryPath(): string {
  return APP_BASE ? '/' : '/app';
}

/** Same-origin Pro Trade route — always /app on marketing / localhost. */
export const OPEN_APP_PATH = '/app';

/** Router path to Pro Trade from current host (marketing → /app, app host → /). */
export function getOpenAppPath(): string {
  if (typeof window !== 'undefined' && isAppHost()) {
    return getAppEntryPath();
  }
  return OPEN_APP_PATH;
}

/**
 * Navigate to Pro Trade from marketing / legacy links.
 * Uses same-origin /app (never legacy /dashboard2).
 */
export function goToOpenApp(search = '', replace = false): string | null {
  const path = getOpenAppPath() + search;
  if (typeof window !== 'undefined' && isAppHost() && APP_BASE) {
    return goToApp(getAppEntryPath() + search, replace);
  }
  if (replace) {
    window.location.replace(path);
    return null;
  }
  return path;
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
  const { hostname, pathname } = window.location;
  if (hostname.startsWith('app.')) return true;
  if (APP_BASE) {
    try {
      return new URL(APP_BASE).hostname === hostname;
    } catch {
      return false;
    }
  }
  if (pathname === OPEN_APP_PATH || pathname.startsWith(`${OPEN_APP_PATH}/`)) {
    return true;
  }
  const entry = getAppEntryPath();
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

/** After login/register — always land on Pro Trade (/app), never legacy dashboard2. */
export function afterAuthGo(
  path: string,
  navigate: (p: string, opts?: { replace?: boolean }) => void
): void {
  let target = path;
  if (target === '/dashboard2' || target.startsWith('/dashboard2/')) {
    const q = target.includes('?') ? target.slice(target.indexOf('?')) : '';
    target = OPEN_APP_PATH + q;
  } else if (target === '/' || target === getAppEntryPath()) {
    target = getOpenAppPath();
  }
  const search = target.includes('?') ? target.slice(target.indexOf('?')) : '';
  const pathname = target.split('?')[0];
  const inApp = goToOpenApp(search, true);
  if (inApp) navigate(pathname + search, { replace: true });
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
  return `${base}?from=${encodeURIComponent(OPEN_APP_PATH)}`;
}

export function getRegisterUrl(returnToApp = true): string {
  const base = getMarketingUrl('/register');
  if (!returnToApp) return base;
  return `${base}?from=${encodeURIComponent(OPEN_APP_PATH)}`;
}

/** Marketing landing — ?preview=landing skips auto-redirect back into the app when signed in. */
export function getLandingPageUrl(): string {
  const base = getMarketingUrl('/');
  return base.includes('?') ? `${base}&preview=landing` : `${base}?preview=landing`;
}

export function goToLanding(replace = false): string | null {
  return goToMarketing('/?preview=landing', replace);
}
