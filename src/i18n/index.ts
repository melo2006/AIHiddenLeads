import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "./locales/en.json";
import ptBR from "./locales/pt-BR.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import { initialUiLocale } from "@/lib/uiLocale";

const SUPPORTED = ["en", "pt-BR", "es", "fr-CA"] as const;
export type SupportedLang = (typeof SUPPORTED)[number];

// Initial language (Ron's rule, revised 2026-11-16 — chat-fix3):
// the visitor's in-session explicit choice (sessionStorage) when
// one exists, else their BROWSER language, else English. The old
// rule let a localStorage pick drive the first paint forever, so
// one Portuguese test left Ron's English-browser phone opening
// the site in Portuguese days later. The resolver lives in
// lib/uiLocale (initialUiLocale) so it is unit-testable.
const getInitialLang = (): string => initialUiLocale();

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      "pt-BR": { translation: ptBR },
      pt: { translation: ptBR },
      es: { translation: es },
      "fr-CA": { translation: fr },
      fr: { translation: fr },
    },
    lng: getInitialLang(),
    fallbackLng: "en",
    supportedLngs: ["en", "pt-BR", "pt", "es", "fr-CA", "fr"],
    load: "currentOnly",
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
    detection: {
      order: ["localStorage"],
      lookupLocalStorage: "lang",
      caches: ["localStorage"],
    },
  });

// Keep <html lang> in sync for SEO
const syncHtmlLang = (lng: string) => {
  document.documentElement.lang = lng;
};
syncHtmlLang(i18n.language || "en");
i18n.on("languageChanged", (lng) => {
  syncHtmlLang(lng);
  // An explicit in-session choice (Ron's rule, 2026-11-16): EVERY
  // language change — the LanguageSwitcher, a path pin (/demo/br),
  // a ?lang= demo link — is recorded in sessionStorage, where
  // lib/uiLocale reads the in-session pick, and mirrored to
  // localStorage for the other readers that expect it there. The
  // localStorage copy no longer drives a fresh session's initial
  // language (see getInitialLang above).
  try {
    sessionStorage.setItem("lang", lng);
    localStorage.setItem("lang", lng);
  } catch { /* storage unavailable — the switch itself still applies */ }
  console.log("[i18n] languageChanged →", lng, "| hero.badge =", i18n.t("hero.badge"));
});
// expose for debugging
(window as any).__i18n = i18n;

export default i18n;
