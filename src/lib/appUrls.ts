/**
 * Marketing site vs app subdomain routing.
 * Production (live domain): VITE_SITE_URL=https://hypergain.io, VITE_APP_URL=https://app.hypergain.io
 * Vercel preview / local dev: marketing at `/`, Pro Trade at `/app` on the same origin
 */

/** Same-origin app entry when marketing + app share one host (Vercel preview, local dev). */
const DEV_APP_PATH = '/app';

function normalizePath(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}

function configuredSiteBase(): string {
  return (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/$/, '') ?? '';
}

function configuredAppBase(): string {
  return (import.meta.env.VITE_APP_URL as string | undefined)?.replace(/\/$/, '') ?? '';
}

/** Split marketing/app hosts only when explicitly enabled (production custom domains later). */
function splitDomainsEnabled(): boolean {
  return import.meta.env.VITE_SPLIT_DOMAINS === 'true';
}

/**
 * Preview / local — stay on current origin even when Vercel env has hypergain.io URLs.
 */
export function isUnifiedOriginHost(hostname?: string): boolean {
  if (splitDomainsEnabled()) {
    const h =
      hostname ?? (typeof window !== 'undefined' ? window.location.hostname : '');
    if (!h) return false;
    if (import.meta.env.VITE_UNIFIED_ORIGIN === 'true') return true;
    return h === 'localhost' || h === '127.0.0.1' || h.endsWith('.vercel.app');
  }
  return true;
}

function effectiveSiteBase(): string {
  if (typeof window !== 'undefined' && isUnifiedOriginHost()) return '';
  return configuredSiteBase();
}

function effectiveAppBase(): string {
  if (typeof window !== 'undefined' && isUnifiedOriginHost()) return '';
  return configuredAppBase();
}

function getSiteHostname(): string | null {
  const siteBase = effectiveSiteBase();
  if (!siteBase) return null;
  try {
    return new URL(siteBase).hostname;
  } catch {
    return null;
  }
}

function getAppHostname(): string | null {
  const appBase = effectiveAppBase();
  if (!appBase) return null;
  try {
    return new URL(appBase).hostname;
  } catch {
    return null;
  }
}

/** Live split setup: marketing and app on different hostnames (hypergain.io vs app.hypergain.io). */
function usesSplitDomainSetup(): boolean {
  if (typeof window !== 'undefined' && isUnifiedOriginHost()) return false;
  const siteHost = getSiteHostname();
  const appHost = getAppHostname();
  return Boolean(siteHost && appHost && siteHost !== appHost);
}

/** Current page is the configured production marketing host. */
function isOnMarketingHost(): boolean {
  if (typeof window === 'undefined') return false;
  if (isUnifiedOriginHost()) return false;
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
  '/ai-sports-betting',
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
  const appBase = effectiveAppBase();
  if (shouldCrossNavigateToApp() && appBase) {
    const url = `${appBase}${OPEN_APP_PATH}${search}`;
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
  const appBase = effectiveAppBase();
  if (shouldCrossNavigateToApp() && appBase) return `${appBase}${p}`;
  if (typeof window !== 'undefined') {
    const local = getOpenAppPath();
    return p === OPEN_APP_PATH ? local : p;
  }
  return appBase ? `${appBase}${p}` : DEV_APP_PATH;
}

export function getMarketingUrl(path = LANDING_PATH): string {
  const p = normalizePath(path);
  const siteBase = effectiveSiteBase();
  return siteBase ? `${siteBase}${p}` : p;
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
  const appBase = effectiveAppBase();
  if (appBase) return `${appBase}${getAdminDashboardPath()}`;
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
  if (isExternalAppUrl(url) && !isUnifiedOriginHost()) {
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

const LANDING_VIEW_INTENT_KEY = 'monadier:view-landing';
const LANDING_VIEW_INTENT_COOKIE = 'monadier_view_landing';

function landingIntentUsesCookie(): boolean {
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname;
  if (h === 'localhost' || h === '127.0.0.1' || h.endsWith('.vercel.app')) return false;
  return h.includes('.');
}

function landingIntentCookieDomain(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const parts = window.location.hostname.split('.');
  if (parts.length < 2) return undefined;
  return `.${parts.slice(-2).join('.')}`;
}

/** Remember explicit “back to landing” navigation (logo, home links). */
export function setLandingViewIntent(): void {
  if (typeof window === 'undefined') return;
  if (landingIntentUsesCookie()) {
    const domain = landingIntentCookieDomain();
    const domainAttr = domain ? `; domain=${domain}` : '';
    document.cookie = `${LANDING_VIEW_INTENT_COOKIE}=1; path=/${domainAttr}; max-age=120; SameSite=Lax`;
    return;
  }
  sessionStorage.setItem(LANDING_VIEW_INTENT_KEY, '1');
}

function clearLandingViewIntent(): void {
  if (typeof window === 'undefined') return;
  if (landingIntentUsesCookie()) {
    const domain = landingIntentCookieDomain();
    const domainAttr = domain ? `; domain=${domain}` : '';
    document.cookie = `${LANDING_VIEW_INTENT_COOKIE}=; path=/${domainAttr}; max-age=0; SameSite=Lax`;
    return;
  }
  sessionStorage.removeItem(LANDING_VIEW_INTENT_KEY);
}

/** True when user explicitly opened the marketing landing (consumes one-shot intent). */
export function consumeLandingViewIntent(): boolean {
  if (typeof window === 'undefined') return false;
  if (landingIntentUsesCookie()) {
    const has = document.cookie.split('; ').some((c) => c === `${LANDING_VIEW_INTENT_COOKIE}=1`);
    if (!has) return false;
    clearLandingViewIntent();
    return true;
  }
  const has = sessionStorage.getItem(LANDING_VIEW_INTENT_KEY) === '1';
  if (has) clearLandingViewIntent();
  return has;
}

export function getLandingPageUrl(): string {
  return getMarketingUrl(LANDING_PATH);
}

export function goToLanding(replace = false): string | null {
  setLandingViewIntent();
  return goToMarketing(LANDING_PATH, replace);
}
