import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import enCommon from './locales/en/common.json';
import enAuth from './locales/en/auth.json';
import enTailor from './locales/en/tailor.json';
import enJobs from './locales/en/jobs.json';
import frCommon from './locales/fr/common.json';
import frAuth from './locales/fr/auth.json';
import frTailor from './locales/fr/tailor.json';
import frJobs from './locales/fr/jobs.json';

const STORAGE_KEY = 'cvboost-lang';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        common: enCommon,
        auth: enAuth,
        tailor: enTailor,
        jobs: enJobs
      },
      fr: {
        common: frCommon,
        auth: frAuth,
        tailor: frTailor,
        jobs: frJobs
      }
    },
    fallbackLng: 'en',
    ns: ['common', 'auth', 'tailor', 'jobs'],
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

// When a locale JSON changes under Vite HMR, re-inject the fresh bundles so
// the running i18next store never serves stale (or missing) keys.
if (import.meta.hot) {
  import.meta.hot.accept(
    [
      './locales/en/common.json', './locales/fr/common.json',
      './locales/en/auth.json', './locales/fr/auth.json',
      './locales/en/tailor.json', './locales/fr/tailor.json',
      './locales/en/jobs.json', './locales/fr/jobs.json'
    ],
    (modules) => {
      const langs = ['en', 'fr'];
      const nss = ['common', 'auth', 'tailor', 'jobs'];
      modules.forEach((mod, i) => {
        if (mod && mod.default) {
          i18n.addResourceBundle(langs[i % 2], nss[Math.floor(i / 2)], mod.default, true, true);
        }
      });
      i18n.changeLanguage(i18n.language);
    }
  );
}

export default i18n;
