/**
 * Marketing site vs app subdomain routing.
 * Production (live domain): VITE_SITE_URL=https://www.monadier.io, VITE_APP_URL=https://app.monadier.io
 * Vercel preview / local dev: marketing at `/`, Pro Trade at `/app` on the same origin
 */

const APP_BASE = (import.meta.env.VITE_APP_URL as string | undefined)?.replace(/\/$/, '') ?? '';
const SITE_BASE = (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/$/, '') ?? '';

/** Same-origin app entry when marketing + app share one host (Vercel preview, local dev). */
const DEV_APP_PATH = '/app';

function normalizePath(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}

function getSiteHostname(): string | null {
  if (!SITE_BASE) return null;
  try {
    return new URL(SITE_BASE).hostname;
  } catch {
    return null;
  }
}

function getAppHostname(): string | null {
  if (!APP_BASE) return null;
  try {
    return new URL(APP_BASE).hostname;
  } catch {
    return null;
  }
}

/** Live split setup: marketing and app on different hostnames (monadier.io vs app.monadier.io). */
function usesSplitDomainSetup(): boolean {
  const siteHost = getSiteHostname();
  const appHost = getAppHostname();
  return Boolean(siteHost && appHost && siteHost !== appHost);
}

/** Current page is the configured production marketing host. */
function isOnMarketingHost(): boolean {
  if (typeof window === 'undefined') return false;
  const siteHost = getSiteHostname();
  if (!siteHost) return false;
  return window.location.hostname === siteHost;
}

/** Hard-navigate marketing → app subdomain (only when split domains are live). */
function shouldCrossNavigateToApp(): boolean {
  return usesSplitDomainSetup() && isOnMarketingHost();
}

/** Marketing landing at site root. */
export const LANDING_PATH = '/';

/** Pro Trade at site root on the app subdomain. */
export const OPEN_APP_PATH = '/';

export function getAppEntryPath(): string {
  return OPEN_APP_PATH;
}

/** Resolved in-app path to open Pro Trade on the current origin. */
export function getOpenAppPath(): string {
  if (typeof window === 'undefined') return OPEN_APP_PATH;

  const { hostname } = window.location;
  const appHost = getAppHostname();

  if (appHost && hostname === appHost) return OPEN_APP_PATH;
  if (hostname.startsWith('app.')) return OPEN_APP_PATH;

  if (shouldCrossNavigateToApp()) return OPEN_APP_PATH;

  return DEV_APP_PATH;
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

/** In-app deep link — works on app subdomain (`/`) and same-origin dev (`/app`). */
export function getAppQueryLink(search: string): string {
  const q = search.startsWith('?') ? search : `?${search}`;
  return `${getOpenAppPath()}${q}`;
}

/** Navigate to Pro Trade (hard navigation — reliable from marketing CTAs). */
export function goToOpenApp(search = '', replace = false): void {
  if (shouldCrossNavigateToApp() && APP_BASE) {
    const url = `${APP_BASE}${OPEN_APP_PATH}${search}`;
    if (replace) window.location.replace(url);
    else window.location.assign(url);
    return;
  }

  const path = getOpenAppPath() + search;
  if (replace) window.location.replace(path);
  else window.location.assign(path);
}

export function getAppUrl(path?: string): string {
  const p = normalizePath(path ?? getAppEntryPath());
  if (shouldCrossNavigateToApp() && APP_BASE) return `${APP_BASE}${p}`;
  if (typeof window !== 'undefined') {
    const local = getOpenAppPath();
    return p === OPEN_APP_PATH ? local : p;
  }
  return APP_BASE ? `${APP_BASE}${p}` : DEV_APP_PATH;
}

export function getMarketingUrl(path = LANDING_PATH): string {
  const p = normalizePath(path);
  return SITE_BASE ? `${SITE_BASE}${p}` : p;
}

export function isAppHost(): boolean {
  if (typeof window === 'undefined') return false;
  const { hostname, pathname } = window.location;
  const appHost = getAppHostname();
  if (appHost && hostname === appHost) return true;
  if (hostname.startsWith('app.')) return true;
  const path = pathname.split('?')[0];
  return path === DEV_APP_PATH || path.startsWith(`${DEV_APP_PATH}/`);
}

export function isAppPath(pathname: string): boolean {
  const path = pathname.split('?')[0];
  if (path === OPEN_APP_PATH && isAppHost()) return true;
  return path === DEV_APP_PATH || path.startsWith(`${DEV_APP_PATH}/`);
}

/** Legacy dashboard1 / dashboard2 / /app on marketing host when app lives on subdomain. */
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
    return shouldCrossNavigateToApp();
  }
  return false;
}

/** Map legacy dashboard1/dashboard2/app URLs → Pro Trade entry path. */
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

  if (path === '/dashboard/monitor' || path.startsWith('/dashboard/monitor/')) {
    return getAdminDashboardPath();
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

/** Full URL to the HL admin monitor (works on app subdomain and local dev). */
export function getAdminDashboardPath(): string {
  return '/admin';
}

export function getAdminDashboardUrl(): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}${getAdminDashboardPath()}`;
  }
  if (APP_BASE) return `${APP_BASE}${getAdminDashboardPath()}`;
  return getAdminDashboardPath();
}

/** Hard-navigate from any legacy app path into Pro Trade (or /admin for monitor). */
export function redirectLegacyToProTrade(
  pathname: string,
  search = '',
  replace = true
): void {
  const target = mapLegacyPathToProTrade(pathname, search);
  if (target === getAdminDashboardPath()) {
    if (replace) window.location.replace(target);
    else window.location.assign(target);
    return;
  }
  const searchOnly = target.includes('?') ? target.slice(target.indexOf('?')) : '';
  goToOpenApp(searchOnly, replace);
}

export function isExternalAppUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}

/** Full navigation to app (cross-subdomain) or returns in-app path for React Router */
export function goToApp(path?: string, replace = false): string | null {
  const url = getAppUrl(path);
  if (isExternalAppUrl(url) && shouldCrossNavigateToApp()) {
    if (replace) window.location.replace(url);
    else window.location.assign(url);
    return null;
  }
  return isExternalAppUrl(url) ? getOpenAppPath() : url;
}

function normalizeAuthTarget(path: string): string {
  const [pathname, search = ''] = path.split('?');
  if (pathname === getAdminDashboardPath() || pathname.startsWith(`${getAdminDashboardPath()}/`)) {
    return path;
  }
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

  if (shouldCrossNavigateToApp()) {
    goToOpenApp(search, true);
    return;
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
