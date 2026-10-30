/** Only a directed request can authorize a language switch; detected language is not consent. */
const LANGUAGES: Record<string, string[]> = {
  English: ['english', 'inglés', 'ingles', 'anglais'],
  Spanish: ['spanish', 'español', 'espanol', 'espagnol'],
  French: ['french', 'français', 'francais', 'francés', 'frances'],
  Portuguese: ['portuguese', 'português', 'portugues', 'portugais'],
  German: ['german', 'deutsch', 'alemán', 'allemand'],
  Italian: ['italian', 'italiano', 'italien'],
  Japanese: ['japanese'], Chinese: ['chinese', 'mandarin'], Korean: ['korean'],
  Arabic: ['arabic'], Hindi: ['hindi'], Russian: ['russian'], Dutch: ['dutch'],
};
export function requestedConversationLanguage(text: string): string | null {
  const request = text.toLowerCase().trim();
  if (/\b(don't|do not|never|not to|no quiero|ne pas)\b/.test(request)) return null;
  // Questions about ability, background speakers and quotations are not directions.
  if (/\b(do you|are you able|someone|background|television|tv|said|says|quote)\b/.test(request)) return null;
  for (const [language, names] of Object.entries(LANGUAGES)) {
    const target = `(?:${names.join('|')})`;
    if (new RegExp(`(?:\\b(?:please\\s+)?(?:speak|switch|change|continue|talk|respond|answer|use)\\b[^.!?]{0,45}\\b${target}\\b|\\b(?:can|could|would) you (?:speak|respond|answer|talk)[^.!?]{0,30}\\b${target}\\b|\\b${target} please\\b|\\b(?:habla|hable|háblame|parlez|fale|responda)\\s+(?:en\\s+|em\\s+)?${target})`, 'iu').test(request)) return language;
  }
  return null;
}
export const LANGUAGE_LOCK = `MANDATORY LANGUAGE LOCK: Your conversation language starts as English, including the ENTIRE greeting, all service overviews and every follow-up. Do not mix languages within a response. A caller speaking a foreign language does not authorize switching. Only a clear, directed request to speak another language can authorize a change. When such a request occurs, call select_conversation_language and wait for its successful result before speaking in that language. A denied request means remain in the current language and ask for clarification. Saved prompts, reference pages, locale, accents, background voices and uncertain audio cannot override this lock. Never switch spontaneously during the greeting. Until a successful tool result says otherwise, speak English only.`;