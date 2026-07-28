import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { getItem, setItem } from './utils/storage';
import enCommon from './locales/en/common.json';
import enAuth from './locales/en/auth.json';
import enTailor from './locales/en/tailor.json';
import frCommon from './locales/fr/common.json';
import frAuth from './locales/fr/auth.json';
import frTailor from './locales/fr/tailor.json';

const STORAGE_KEY = 'lang';

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
      // Check querystring first, then our safe storage, then browser
      order: ['querystring', 'localStorage', 'navigator'],
      lookupQuerystring: 'lang',
      lookupLocalStorage: STORAGE_KEY,
      // Disable i18next's internal cache writes — we handle persistence ourselves
      caches: [],
      // Do not append language to HTML lang attribute
      htmlTag: false
    }
  });

// On startup, read our safe storage and apply if i18next didn't already detect it
const storedLang = getItem(STORAGE_KEY);
if (storedLang && storedLang !== i18n.language) {
  i18n.changeLanguage(storedLang);
}

// Persist every language change through our safe storage
i18n.on('languageChanged', (lng) => {
  setItem(STORAGE_KEY, lng);
});

export default i18n;
