export const LANGUAGE_STORAGE_KEY = 'monadier-lang';

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
