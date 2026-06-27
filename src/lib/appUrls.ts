/**
 * Marketing site vs app subdomain routing.
 * Production: VITE_SITE_URL=https://monadier.com, VITE_APP_URL=https://app.monadier.com
 * Dev (no env): marketing landing at `/`, Pro Trade at `/app`
 */

const APP_BASE = (import.meta.env.VITE_APP_URL as string | undefined)?.replace(/\/$/, '') ?? '';
const SITE_BASE = (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/$/, '') ?? '';

/** Local dev app entry when marketing and app share one origin. */
const DEV_APP_PATH = '/app';

function normalizePath(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}

/** Marketing landing at site root. */
export const LANDING_PATH = '/';

/** Pro Trade — main app at site root on app subdomain. */
export const OPEN_APP_PATH = '/';

/** Pro Trade entry on app subdomain (app.monadier.com/). */
export function getAppEntryPath(): string {
  return OPEN_APP_PATH;
}

/** Resolved in-app path to open Pro Trade on the current origin. */
export function getOpenAppPath(): string {
  if (typeof window === 'undefined') return OPEN_APP_PATH;
  if (APP_BASE) {
    try {
      if (new URL(APP_BASE).hostname === window.location.hostname) {
        return OPEN_APP_PATH;
      }
    } catch {
      /* fall through */
    }
  }
  if (window.location.hostname.startsWith('app.')) return OPEN_APP_PATH;
  if (!APP_BASE) return DEV_APP_PATH;
  return OPEN_APP_PATH;
}

const MARKETING_EXACT_PATHS = [
  '/',
  '/login',
  '/register',
  '/how-it-works',
  '/trading-bot',
  '/sports-betting',
  '/about',
  '/technology',
  '/support',
  '/pricing',
  '/terms',
  '/privacy',
  '/forgot-password',
  '/reset-password',
  '/kyc',
] as const;

const MARKETING_PREFIX_PATHS = ['/auth', '/your-funds'] as const;

export function isMarketingPath(pathname: string): boolean {
  const path = pathname.split('?')[0];
  if ((MARKETING_EXACT_PATHS as readonly string[]).includes(path)) return true;
  return MARKETING_PREFIX_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
}

/**
 * Navigate to Pro Trade (hard navigation — reliable from marketing CTAs).
 */
export function goToOpenApp(search = '', replace = false): void {
  const path = getOpenAppPath() + search;
  if (APP_BASE && typeof window !== 'undefined') {
    try {
      const appHost = new URL(APP_BASE).hostname;
      if (window.location.hostname !== appHost) {
        const url = `${APP_BASE}${OPEN_APP_PATH}${search}`;
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
  if (path === DEV_APP_PATH || path.startsWith(`${DEV_APP_PATH}/`)) return true;
  return false;
}

export function isAppPath(pathname: string): boolean {
  const path = pathname.split('?')[0];
  if (path === OPEN_APP_PATH && isAppHost()) return true;
  return path === DEV_APP_PATH || path.startsWith(`${DEV_APP_PATH}/`);
}

/** Legacy dashboard1 / dashboard2 / /app — redirect into Pro Trade. */
export function isLegacyAppPath(pathname: string): boolean {
  const path = pathname.split('?')[0];
  if (
    path === '/dashboard' ||
    path.startsWith('/dashboard/') ||
    path === '/dashboard2' ||
    path.startsWith('/dashboard2/')
  ) {
    return true;
  }
  if (path === '/app' || path.startsWith('/app/')) {
    return !!APP_BASE;
  }
  return false;
}

/**
 * Map legacy dashboard1/dashboard2/app URLs → Pro Trade entry path.
 */
export function mapLegacyPathToProTrade(pathname: string, search = ''): string {
  const path = pathname.split('?')[0].replace(/\/$/, '') || '/';
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);

  const build = (section?: string) => {
    const next = new URLSearchParams(params);
    if (section) next.set('section', section);
    const q = next.toString();
    const base = getOpenAppPath();
    return q ? `${base}?${q}` : base;
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
  if (pathname === LANDING_PATH && !isAppHost()) {
    return getOpenAppPath();
  }
  return path;
}

/** After login/register — land on Pro Trade, never legacy dashboard2. */
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
  return `${base}?from=${encodeURIComponent(getOpenAppPath())}`;
}

export function getRegisterUrl(returnToApp = true): string {
  const base = getMarketingUrl('/register');
  if (!returnToApp) return base;
  return `${base}?from=${encodeURIComponent(getOpenAppPath())}`;
}

/** ?preview=landing skips auto-redirect into Pro Trade when signed in. */
export function getLandingPageUrl(): string {
  const base = getMarketingUrl(LANDING_PATH);
  return base.includes('?') ? `${base}&preview=landing` : `${base}?preview=landing`;
}

export function goToLanding(replace = false): string | null {
  return goToMarketing(`${LANDING_PATH}?preview=landing`, replace);
}
