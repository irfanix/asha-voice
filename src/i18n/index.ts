// ------------------------------------------------------------------
// i18n setup. Three languages: English, Hindi, Telugu.
// The user's chosen language is stored in IndexedDB settings and
// applied by the Onboarding and Settings screens.
//
// All user-facing strings live in the three JSON files next to this
// one. Adding a new language only requires a new JSON file and one
// line in the resources object below.
// ------------------------------------------------------------------

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './en.json';
import hi from './hi.json';
import te from './te.json';

export const SUPPORTED_LANGUAGES = ['en', 'hi', 'te'] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

// Map our short codes to the BCP-47 tags the Web Speech API expects.
export const SPEECH_LOCALE: Record<AppLanguage, string> = {
  en: 'en-IN',
  hi: 'hi-IN',
  te: 'te-IN',
};

// i18next boot. Language is switched later by changeLanguage().
void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    hi: { translation: hi },
    te: { translation: te },
  },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: {
    // React already escapes by default; no need to double-escape.
    escapeValue: false,
  },
  returnNull: false,
});

export default i18n;