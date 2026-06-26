/**
 * Marketing site vs app subdomain routing.
 * Production: VITE_SITE_URL=https://monadier.com, VITE_APP_URL=https://app.monadier.com
 * Dev: leave unset — Pro Trade at /, marketing landing at /welcome
 */

const APP_BASE = (import.meta.env.VITE_APP_URL as string | undefined)?.replace(/\/$/, '') ?? '';
const SITE_BASE = (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/$/, '') ?? '';

function normalizePath(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}

/** Marketing landing (was `/`). */
export const LANDING_PATH = '/welcome';

/** Pro Trade — main app at site root. */
export const OPEN_APP_PATH = '/';

/** Pro Trade entry on app subdomain (app.monadier.com/). */
export function getAppEntryPath(): string {
  return '/';
}

/** Always `/` — Pro Trade is the main app. */
export function getOpenAppPath(): string {
  return OPEN_APP_PATH;
}

const MARKETING_PREFIXES = [
  '/welcome',
  '/login',
  '/register',
  '/auth',
  '/how-it-works',
  '/card',
  '/trading-bot',
  '/sports-betting',
  '/forex',
  '/about',
  '/technology',
  '/support',
  '/pricing',
  '/your-funds',
  '/terms',
  '/privacy',
  '/forgot-password',
  '/reset-password',
  '/kyc',
  '/dashboard',
] as const;

export function isMarketingPath(pathname: string): boolean {
  const path = pathname.split('?')[0];
  return MARKETING_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

/**
 * Navigate to Pro Trade (hard navigation — reliable from marketing CTAs).
 */
export function goToOpenApp(search = '', replace = false): void {
  const path = OPEN_APP_PATH + search;
  if (APP_BASE && typeof window !== 'undefined') {
    try {
      const appHost = new URL(APP_BASE).hostname;
      if (window.location.hostname !== appHost) {
        const url = `${APP_BASE}${path}`;
        if (replace) window.location.replace(url);
        else window.location.assign(url);
        return;
      }
    } catch {
      /* fall through */
    }
  }
  if (replace) window.location.replace(path);
  else window.location.assign(path);
}

export function getAppUrl(path?: string): string {
  const p = normalizePath(path ?? getAppEntryPath());
  return APP_BASE ? `${APP_BASE}${p}` : p;
}

export function getMarketingUrl(path = LANDING_PATH): string {
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
  const path = pathname.split('?')[0];
  if (path === OPEN_APP_PATH) return true;
  if (path === '/app' || path.startsWith('/app/')) return true;
  return false;
}

export function isAppPath(pathname: string): boolean {
  const path = pathname.split('?')[0];
  return path === OPEN_APP_PATH || path === '/app' || path.startsWith('/app/');
}

/** Legacy dashboard1 / dashboard2 / /app — never shown, always Pro Trade. */
export function isLegacyAppPath(pathname: string): boolean {
  const path = pathname.split('?')[0];
  return (
    path === '/dashboard' ||
    path.startsWith('/dashboard/') ||
    path === '/dashboard2' ||
    path.startsWith('/dashboard2/') ||
    path === '/app' ||
    path.startsWith('/app/')
  );
}

/**
 * Map legacy dashboard1/dashboard2/app URLs → Pro Trade at `/`.
 */
export function mapLegacyPathToProTrade(pathname: string, search = ''): string {
  const path = pathname.split('?')[0].replace(/\/$/, '') || '/';
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);

  const build = (section?: string) => {
    const next = new URLSearchParams(params);
    if (section) next.set('section', section);
    const q = next.toString();
    return q ? `${OPEN_APP_PATH}?${q}` : OPEN_APP_PATH;
  };

  if (path === '/dashboard2' || path.startsWith('/dashboard2/')) {
    if (path.includes('/profile')) return build('profile');
    return build();
  }

  if (path === '/dashboard' || path.startsWith('/dashboard/')) {
    if (path.includes('/profile') || path.includes('/settings')) return build('profile');
    if (
      path.includes('/bot-trading') ||
      path.includes('/chart-trades') ||
      path.includes('/overview')
    ) {
      return build('bot');
    }
    return build();
  }

  if (path === '/app' || path.startsWith('/app/')) {
    return build();
  }

  return build();
}

/** Hard-navigate from any legacy app path into Pro Trade. */
export function redirectLegacyToProTrade(
  pathname: string,
  search = '',
  replace = true
): void {
  const target = mapLegacyPathToProTrade(pathname, search);
  const searchOnly = target.includes('?') ? target.slice(target.indexOf('?')) : '';
  goToOpenApp(searchOnly, replace);
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

function normalizeAuthTarget(path: string): string {
  const [pathname, search = ''] = path.split('?');
  if (isLegacyAppPath(pathname)) {
    return mapLegacyPathToProTrade(pathname, search ? `?${search}` : '');
  }
  if (pathname === LANDING_PATH || pathname.startsWith(`${LANDING_PATH}/`)) {
    return OPEN_APP_PATH;
  }
  return path;
}

/** After login/register — land on Pro Trade at `/`, never legacy dashboard2. */
export function afterAuthGo(
  path: string,
  navigate: (p: string, opts?: { replace?: boolean }) => void
): void {
  const target = normalizeAuthTarget(path);
  const search = target.includes('?') ? target.slice(target.indexOf('?')) : '';
  const pathname = target.split('?')[0];

  if (APP_BASE && typeof window !== 'undefined') {
    try {
      const appHost = new URL(APP_BASE).hostname;
      if (window.location.hostname !== appHost) {
        goToOpenApp(search, true);
        return;
      }
    } catch {
      /* fall through */
    }
  }

  navigate(pathname + search, { replace: true });
}

export function goToMarketing(path = LANDING_PATH, replace = false): string | null {
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

/** Marketing landing — ?preview=landing skips auto-redirect into Pro Trade when signed in. */
export function getLandingPageUrl(): string {
  const base = getMarketingUrl(LANDING_PATH);
  return base.includes('?') ? `${base}&preview=landing` : `${base}?preview=landing`;
}

export function goToLanding(replace = false): string | null {
  return goToMarketing(`${LANDING_PATH}?preview=landing`, replace);
}
