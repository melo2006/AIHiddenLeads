/**
 * Website language resolution (Ron's rule, revised 2026-11-16 —
 * chat-fix3).
 *
 * The DEFAULT language is the visitor's BROWSER language. Ron's
 * phone made the old rule fail in the open: an earlier Portuguese
 * test had left localStorage "lang" = pt-BR behind, and because
 * that stored value drove the initial language FOREVER, his
 * English-browser phone kept opening the site (and Aspen) in
 * Portuguese days later. A stored pick may only speak for the
 * session that made it:
 *
 *   initial language = the in-session explicit choice
 *     (sessionStorage "lang" — written by the LanguageSwitcher via
 *     i18next's languageChanged hook in src/i18n/index.ts, and
 *     directly by path-pinned routes such as /demo/br)
 *   → else the browser language (navigator.language: pt* → pt-BR,
 *     es* → es, fr* → fr-CA, anything else → en)
 *   → else English.
 *
 * localStorage "lang" is still written in sync on every explicit
 * pick (other readers exist), but it NEVER drives the initial
 * language of a fresh browser session again.
 *
 * Session-start locales are a separate, stricter question: a voice
 * or chat session may only start in a language the visitor
 * EXPLICITLY picked this session (or a path pin forced), never in
 * a merely-detected browser language — see explicitUiLocale and
 * the 2026-11-09 rule it carries.
 */
export const SUPPORTED_UI_LOCALES = ["en", "es", "pt-BR", "fr-CA"] as const;
export type UiLocale = (typeof SUPPORTED_UI_LOCALES)[number];

/** Canonicalize a raw value to a supported UI locale, or null. */
export function normalizeUiLocale(value: unknown): UiLocale | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (v === "pt") return "pt-BR";
  if (v === "fr") return "fr-CA";
  return (SUPPORTED_UI_LOCALES as readonly string[]).includes(v) ? (v as UiLocale) : null;
}

/**
 * The visitor's in-session explicit language choice, if any: the
 * LanguageSwitcher's pick (or a path pin like /demo/br) as recorded
 * in sessionStorage. A stale localStorage value from an earlier
 * session is NOT an in-session choice and is never read here.
 */
export function sessionUiLocale(): UiLocale | undefined {
  try {
    return normalizeUiLocale(sessionStorage.getItem("lang")) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * The browser's own language mapped onto the supported set:
 * Portuguese (any region) → pt-BR, Spanish (any region) → es,
 * French (any region) → fr-CA, everything else → en. Reads
 * navigator.language first, then the
 * preferred-languages list; a browser that reports nothing usable
 * resolves to English.
 */
export function browserUiLocale(nav?: { language?: string; languages?: readonly string[] }): UiLocale {
  const source = nav ?? (typeof navigator !== "undefined" ? navigator : undefined);
  const candidates: string[] = [];
  if (source?.language) candidates.push(source.language);
  if (source?.languages) candidates.push(...source.languages);
  for (const raw of candidates) {
    const tag = raw.trim().toLowerCase();
    if (tag.startsWith("pt")) return "pt-BR";
    if (tag.startsWith("es")) return "es";
    if (tag.startsWith("fr")) return "fr-CA";
    if (tag.startsWith("en")) return "en";
  }
  return "en";
}

/**
 * The language a fresh page load starts in: the in-session explicit
 * choice when one exists, else the browser language (which itself
 * falls back to English). This is the i18n initial language.
 */
export function initialUiLocale(): UiLocale {
  return sessionUiLocale() ?? browserUiLocale();
}

/**
 * The explicit UI locale for a new session request, or undefined
 * when the visitor made no in-session pick (the server then
 * defaults the session to English, as before). Only the in-session
 * choice counts — see the module header for why localStorage no
 * longer speaks here.
 */
export function explicitUiLocale(): UiLocale | undefined {
  return sessionUiLocale();
}

/**
 * Whether a silently pre-authorized (prewarmed) voice session was
 * authorized under a different effective starting language than the
 * visitor's CURRENT explicit pick. The floating widget prewarms one
 * session at mount, in whatever language was picked at that moment;
 * if the visitor then changes the site language before tapping, the
 * held session is still authorized in the OLD language and must be
 * discarded and re-authorized — never activated (Ron's live test,
 * 2026-11-18: page switched to French, the prewarmed session still
 * greeted, narrated and captioned in English). No pick (undefined)
 * means the server defaults the session to English, so undefined and
 * an explicit "en" pick are the SAME effective language and never
 * force a re-authorization on their own.
 */
export function prewarmLocaleMismatch(
  warmLocale: UiLocale | undefined,
  currentLocale: UiLocale | undefined,
): boolean {
  return (warmLocale ?? "en") !== (currentLocale ?? "en");
}

const UI_LOCALE_LANGUAGES: Record<UiLocale, string> = {
  en: "English",
  es: "Spanish",
  "pt-BR": "Portuguese",
  "fr-CA": "French",
};

/** The conversation language a UI locale selects (English when none). */
export function uiLocaleLanguage(locale: unknown): string {
  const normalized = normalizeUiLocale(locale);
  return normalized ? UI_LOCALE_LANGUAGES[normalized] : "English";
}
