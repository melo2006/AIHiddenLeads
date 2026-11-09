/**
 * The visitor's explicit website-language selection — the ONLY locale a
 * voice or chat session may start in (Ron's rule, 2026-11-09).
 *
 * The LanguageSwitcher picks a language through i18next, which persists
 * the choice in localStorage under "lang" (see src/i18n/index.ts, whose
 * initial language likewise comes only from that stored selection —
 * never from browser-locale detection). Reading the same stored value
 * here keeps one source of truth: no stored selection means no locale
 * is sent and the server starts the session in English, as before.
 */
export const SUPPORTED_UI_LOCALES = ["en", "es", "pt-BR"] as const;
export type UiLocale = (typeof SUPPORTED_UI_LOCALES)[number];

/** Canonicalize a raw value to a supported UI locale, or null. */
export function normalizeUiLocale(value: unknown): UiLocale | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (v === "pt") return "pt-BR";
  return (SUPPORTED_UI_LOCALES as readonly string[]).includes(v) ? (v as UiLocale) : null;
}

/**
 * The explicit UI locale for a new session request, or undefined when the
 * visitor never picked a language (the server then defaults to English).
 */
export function explicitUiLocale(): UiLocale | undefined {
  try {
    return normalizeUiLocale(localStorage.getItem("lang")) ?? undefined;
  } catch {
    return undefined;
  }
}

const UI_LOCALE_LANGUAGES: Record<UiLocale, string> = {
  en: "English",
  es: "Spanish",
  "pt-BR": "Portuguese",
};

/** The conversation language a UI locale selects (English when none). */
export function uiLocaleLanguage(locale: unknown): string {
  const normalized = normalizeUiLocale(locale);
  return normalized ? UI_LOCALE_LANGUAGES[normalized] : "English";
}
