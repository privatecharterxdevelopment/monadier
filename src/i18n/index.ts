import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { APP_LANGUAGES, DEFAULT_LANGUAGE, isAppLanguage, LANGUAGE_STORAGE_KEY } from './languages';
import en from './locales/en.json';
import de from './locales/de.json';
import zh from './locales/zh.json';
import ja from './locales/ja.json';
import th from './locales/th.json';
import es from './locales/es.json';
import it from './locales/it.json';
import ru from './locales/ru.json';

const supportedLngs = APP_LANGUAGES.map((lang) => lang.code);

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      de: { translation: de },
      zh: { translation: zh },
      ja: { translation: ja },
      th: { translation: th },
      es: { translation: es },
      it: { translation: it },
      ru: { translation: ru },
    },
    supportedLngs,
    fallbackLng: DEFAULT_LANGUAGE,
    defaultNS: 'translation',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: ['localStorage'],
      convertDetectedLanguage: (lng) => {
        const base = lng.split('-')[0]?.toLowerCase();
        if (base === 'zh') return 'zh';
        return isAppLanguage(base) ? base : DEFAULT_LANGUAGE;
      },
    },
  });

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
});

document.documentElement.lang = i18n.language;

export default i18n;
