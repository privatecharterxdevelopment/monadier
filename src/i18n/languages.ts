export const LANGUAGE_STORAGE_KEY = 'monadier-lang';
/** Cookie name — same value as localStorage so www / app share the preferred language. */
export const LANGUAGE_COOKIE_KEY = 'monadier-lang';
const LANGUAGE_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 365;

export type AppLanguage = 'en' | 'de' | 'zh' | 'ja' | 'th' | 'es' | 'it' | 'ru';

export type LanguageOption = {
  code: AppLanguage;
  labelKey: string;
  dir?: 'ltr' | 'rtl';
};

/** Supported UI languages — labelKey resolves via i18n `languages.*`. */
export const APP_LANGUAGES: readonly LanguageOption[] = [
  { code: 'en', labelKey: 'languages.en' },
  { code: 'de', labelKey: 'languages.de' },
  { code: 'zh', labelKey: 'languages.zh' },
  { code: 'ja', labelKey: 'languages.ja' },
  { code: 'th', labelKey: 'languages.th' },
  { code: 'es', labelKey: 'languages.es' },
  { code: 'it', labelKey: 'languages.it' },
  { code: 'ru', labelKey: 'languages.ru' },
] as const;

export const DEFAULT_LANGUAGE: AppLanguage = 'en';

export function isAppLanguage(value: string | null | undefined): value is AppLanguage {
  return APP_LANGUAGES.some((lang) => lang.code === value);
}

function languageCookieDomain(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const h = window.location.hostname.toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1' || h === '[::1]') return undefined;
  if (h.endsWith('.vercel.app')) return undefined;
  const parts = h.split('.').filter(Boolean);
  if (parts.length < 2) return undefined;
  return `.${parts.slice(-2).join('.')}`;
}

/** Persist UI language in localStorage + cookie (shared across hypergain.io hosts). */
export function persistAppLanguage(code: AppLanguage): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, code);
  } catch {
    /* private mode */
  }
  try {
    const domain = languageCookieDomain();
    const domainAttr = domain ? `; Domain=${domain}` : '';
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${encodeURIComponent(LANGUAGE_COOKIE_KEY)}=${encodeURIComponent(code)}; Path=/; Max-Age=${LANGUAGE_COOKIE_MAX_AGE_SEC}; SameSite=Lax${domainAttr}${secure}`;
  } catch {
    /* cookie blocked */
  }
  document.documentElement.lang = code;
}
