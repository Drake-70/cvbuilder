import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import enCommon from './locales/en/common.json';
import enAuth from './locales/en/auth.json';
import enTailor from './locales/en/tailor.json';
import frCommon from './locales/fr/common.json';
import frAuth from './locales/fr/auth.json';
import frTailor from './locales/fr/tailor.json';

const STORAGE_KEY = 'cvboost-lang';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        common: enCommon,
        auth: enAuth,
        tailor: enTailor
      },
      fr: {
        common: frCommon,
        auth: frAuth,
        tailor: frTailor
      }
    },
    fallbackLng: 'en',
    ns: ['common', 'auth', 'tailor'],
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    detection: {
      order: ['querystring', 'localStorage', 'navigator'],
      lookupQuerystring: 'lang',
      lookupLocalStorage: STORAGE_KEY,
      caches: ['localStorage']
    }
  });

// Update <html lang> attribute and persist
i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
  try { localStorage.setItem(STORAGE_KEY, lng); } catch {}
});

export default i18n;
