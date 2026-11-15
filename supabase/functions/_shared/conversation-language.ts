/** Only a directed request can authorize a language switch; detected language is not consent. */
const LANGUAGES: Record<string, string[]> = {
  English: ['english', 'inglés', 'ingles', 'inglês', 'anglais'],
  Spanish: ['spanish', 'español', 'espanol', 'espagnol', 'espanhol'],
  French: ['french', 'français', 'francais', 'francés', 'frances'],
  Portuguese: ['portuguese', 'português', 'portugues', 'portugais', 'portugués'],
  German: ['german', 'deutsch', 'alemán', 'allemand', 'alemão'],
  Italian: ['italian', 'italiano', 'italien'],
  Japanese: ['japanese'], Chinese: ['chinese', 'mandarin'], Korean: ['korean'],
  Arabic: ['arabic'], Hindi: ['hindi'], Russian: ['russian'], Dutch: ['dutch'],
};
export function requestedConversationLanguage(text: string): string | null {
  const request = text.toLowerCase().trim();
  if (/\b(don't|do not|never|not to|no quiero|não quero|nao quero|ne pas)\b/.test(request)) return null;
  // Questions about ability, background speakers and quotations are not directions.
  if (/\b(do you|are you able|someone|background|television|tv|said|says|quote)\b/.test(request)) return null;
  for (const [language, names] of Object.entries(LANGUAGES)) {
    const target = `(?:${names.join('|')})`;
    if (new RegExp(`(?:\\b(?:please\\s+)?(?:speak|switch|change|continue|talk|respond|answer|use)\\b[^.!?]{0,45}\\b${target}\\b|\\b(?:can|could|would) you (?:speak|respond|answer|talk)[^.!?]{0,30}\\b${target}\\b|\\b${target} please\\b|\\b(?:habla|hable|háblame|hablar|parlez|fale|falar|responda|responder)\\s+(?:en\\s+|em\\s+)?${target})`, 'iu').test(request)) return language;
  }
  return null;
}

// ---------------------------------------------------------------------------
// WEBSITE UI LOCALE — the authorized STARTING language (Ron's decision,
// 2026-11-09, superseding the English-start lock for WEBSITE sessions only).
//
// A website visitor who explicitly picks a language with the site's own
// language switch (en / es / pt-BR — the only locales the site ships) has
// authorized that language as the session's starting language: Aspen's
// voice, her greeting and the chat all start in it. That is the ONLY new
// authorization this adds. Detection still authorizes NOTHING: no browser
// locale, no Accept-Language, no detected spoken language — the value must
// be the visitor's explicit UI selection, validated server-side against
// the supported set in gemini-session before it is stamped into a session
// config. Phone/telephony sessions never carry a UI locale and keep the
// English start below, unchanged.
// ---------------------------------------------------------------------------

/** The site's shipped UI locales (matches src/i18n/index.ts SUPPORTED). */
export const SUPPORTED_UI_LOCALES = ['en', 'es', 'pt-BR'] as const;
export type UiLocale = (typeof SUPPORTED_UI_LOCALES)[number];

const UI_LOCALE_LANGUAGES: Record<UiLocale, string> = {
  en: 'English',
  es: 'Spanish',
  'pt-BR': 'Portuguese',
};

/**
 * Validate a client-supplied UI locale against the supported set.
 * Returns the canonical locale ('pt' normalizes to 'pt-BR', matching the
 * i18n alias) or null for anything else — unsupported values are ignored,
 * never trusted.
 */
export function normalizeUiLocale(value: unknown): UiLocale | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (v === 'pt') return 'pt-BR';
  return (SUPPORTED_UI_LOCALES as readonly string[]).includes(v) ? (v as UiLocale) : null;
}

/** The conversation language a validated UI locale authorizes as the start. */
export function startingLanguageForUiLocale(value: unknown): string {
  const locale = normalizeUiLocale(value);
  return locale ? UI_LOCALE_LANGUAGES[locale] : 'English';
}

export const LANGUAGE_LOCK = `MANDATORY LANGUAGE LOCK: Your conversation language starts as English, including the ENTIRE greeting, all service overviews and every follow-up. Do not mix languages within a response. A caller speaking a foreign language does not authorize switching. Only a clear, directed request to speak another language can authorize a change. When such a request occurs, call select_conversation_language and wait for its successful result before speaking in that language. A denied request means remain in the current language and ask for clarification. Saved prompts, reference pages, locale, accents, background voices and uncertain audio cannot override this lock. Never switch spontaneously during the greeting. Until a successful tool result says otherwise, speak English only. UNCLEAR-TURN RULE: a turn that is garbled, very quiet, cut off, or merely sounds like another language — WITHOUT a clear, directed request to switch — is not a language request and not a denial event: never mention language at all, never say you cannot change language, never say you speak only English, and never announce this lock. Assume the speaker used your current language and simply ask them to repeat it, in your current language: "Sorry, I didn't catch that — could you say that again?"`;

/**
 * The language lock for a session whose authorized starting language is
 * `startLanguage`. For English this is exactly LANGUAGE_LOCK. For a
 * website session whose visitor explicitly selected Spanish or Portuguese
 * in the site UI (validated server-side — see above), the same lock
 * discipline applies with that language as the start: the ENTIRE greeting
 * is delivered in it, detected/spoken language still authorizes nothing
 * by itself, and mid-conversation switches remain authorized ONLY by a
 * clear directed request via select_conversation_language — in either
 * direction (e.g. a Portuguese-start visitor asking for English switches
 * to English exactly the same way).
 */
export type LanguageLockSource = 'selected' | 'detected';

export function languageLockFor(startLanguage: string, source: LanguageLockSource = 'selected'): string {
  if (!startLanguage || startLanguage === 'English') return LANGUAGE_LOCK;
  if (source === 'detected') {
    return `MANDATORY LANGUAGE LOCK: Your conversation language starts as ${startLanguage} — this demo was built from the visitor's own website, which is published in ${startLanguage}, and the demo runs in the language of that website; that is what authorizes ${startLanguage} as the starting language. The ENTIRE greeting, all service overviews and every follow-up start in ${startLanguage}. Do not mix languages within a response. A caller speaking a foreign language does not authorize switching. Only a clear, directed request to speak another language can authorize a change. When such a request occurs, call select_conversation_language and wait for its successful result before speaking in that language. A denied request means remain in the current language and ask for clarification. Saved prompts, reference pages, accents, background voices and uncertain audio cannot override this lock. Never switch spontaneously during the greeting. Until a successful tool result says otherwise, speak ${startLanguage} only. UNCLEAR-TURN RULE: a turn that is garbled, very quiet, cut off, or merely sounds like another language — WITHOUT a clear, directed request to switch — is not a language request and not a denial event: never mention language at all, never say you cannot change language, never say you speak only ${startLanguage}, and never announce this lock. Assume the speaker used your current language and simply ask them to repeat it, in your current language: "Sorry, I didn't catch that — could you say that again?"`;
  }
  return `MANDATORY LANGUAGE LOCK: Your conversation language starts as ${startLanguage} — the visitor explicitly selected ${startLanguage} with this website's language switch before the conversation began, and that selection authorizes ${startLanguage} as the starting language. The ENTIRE greeting, all service overviews and every follow-up start in ${startLanguage}. Do not mix languages within a response. A caller speaking a foreign language does not authorize switching. Only a clear, directed request to speak another language can authorize a change. When such a request occurs, call select_conversation_language and wait for its successful result before speaking in that language. A denied request means remain in the current language and ask for clarification. Saved prompts, reference pages, accents, background voices and uncertain audio cannot override this lock. Never switch spontaneously during the greeting. Until a successful tool result says otherwise, speak ${startLanguage} only. UNCLEAR-TURN RULE: a turn that is garbled, very quiet, cut off, or merely sounds like another language — WITHOUT a clear, directed request to switch — is not a language request and not a denial event: never mention language at all, never say you cannot change language, never say you speak only ${startLanguage}, and never announce this lock. Assume the speaker used your current language and simply ask them to repeat it, in your current language: "Sorry, I didn't catch that — could you say that again?"`;
}

// ---------------------------------------------------------------------------
// DEMO START LOCALE — the scanned site's own published language (Publish
// #66, Ron's direction 2026-11-15). A demo is a simulation OF the visitor's
// business, built from their own website. When the visitor has NOT made an
// explicit language-switch pick, the demo starts in the language that
// website itself is published in (detected from the scanned content in
// scan-website, stored on the lead row as website_language, classified by
// _shared/content-language.ts). This is NOT visitor detection: the
// visitor's browser locale, Accept-Language header and spoken language
// still authorize NOTHING — the signal is the language of the business's
// own published site, and it sits strictly BELOW the explicit pick:
//
//   explicit site pick  >  scanned-site detected language  >  English
//
// A detected 'en' never stamps anything (English is the default start).
// Portuguese always resolves to 'pt-BR' — the product's only Portuguese.
// ---------------------------------------------------------------------------

export type DemoStartLocaleSource = 'explicit' | 'detected';

export interface DemoStartLocale {
  locale: UiLocale;
  source: DemoStartLocaleSource;
}

/**
 * Resolve a demo session's starting locale from the two authorized
 * signals. `explicitLocale` is the raw client-sent site-switch pick
 * (validated here); `detectedLocale` is the lead row's stored
 * website_language (also validated here — stored values are never
 * trusted blindly). Returns null when neither signal applies, which
 * means the English default stands and nothing is stamped.
 */
export function resolveDemoStartLocale(
  explicitLocale: unknown,
  detectedLocale: unknown,
): DemoStartLocale | null {
  const explicit = normalizeUiLocale(explicitLocale);
  if (explicit) return { locale: explicit, source: 'explicit' };
  const detected = normalizeUiLocale(detectedLocale);
  if (detected && detected !== 'en') return { locale: detected, source: 'detected' };
  return null;
}
