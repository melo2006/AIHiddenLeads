import { describe, expect, it } from 'vitest';
import { requestedConversationLanguage } from '../../supabase/functions/_shared/conversation-language';
describe('caller-authorized language changes', () => {
  it('keeps English for silence, foreign greetings and background speech', () => {
    for (const text of ['', 'Hola, gracias.', 'Bonjour Aspen', 'Someone in the background said speak Spanish', 'Do you speak French?', 'Do not switch to Spanish']) expect(requestedConversationLanguage(text)).toBeNull();
  });
  it('authorizes Spanish only on a directed caller request', () => {
    expect(requestedConversationLanguage('Please switch to Spanish.')).toBe('Spanish');
    expect(requestedConversationLanguage('Can you speak Spanish please?')).toBe('Spanish');
  });
  it('supports explicit French and a return to English', () => {
    expect(requestedConversationLanguage('Please speak French')).toBe('French');
    expect(requestedConversationLanguage('Switch back to English')).toBe('English');
  });
  it('accepts clear requests expressed in another language', () => {
    expect(requestedConversationLanguage('Habla español por favor')).toBe('Spanish');
    expect(requestedConversationLanguage('Parlez français')).toBe('French');
  });
});
describe('first-person requests in the visitor’s own language (Publish #67, 2026-11-15)', () => {
  // Ron's live test: "Eu só falo português" — the old verb list held
  // only imperative/infinitive forms (fale/falar), so his directed
  // request authorized nothing and the session refused him.
  it('authorizes the language a caller says they speak, in first person', () => {
    expect(requestedConversationLanguage('Eu só falo português')).toBe('Portuguese');
    expect(requestedConversationLanguage('Eu falo português')).toBe('Portuguese');
    expect(requestedConversationLanguage('Yo solo hablo español')).toBe('Spanish');
    expect(requestedConversationLanguage('Hablo español')).toBe('Spanish');
    expect(requestedConversationLanguage('Je parle français')).toBe('French');
    expect(requestedConversationLanguage('Je parle en français')).toBe('French');
    expect(requestedConversationLanguage('Ich spreche Deutsch')).toBe('German');
    expect(requestedConversationLanguage('Parlo italiano')).toBe('Italian');
    expect(requestedConversationLanguage('I only speak Portuguese')).toBe('Portuguese');
  });
  it('never authorizes the language a caller says they do NOT speak', () => {
    expect(requestedConversationLanguage('Eu não falo inglês')).toBeNull();
    expect(requestedConversationLanguage('No hablo inglés')).toBeNull();
    expect(requestedConversationLanguage('Je ne parle pas français')).toBeNull();
    expect(requestedConversationLanguage('Non parlo inglese')).toBeNull();
  });
});
describe('explicit requests are never refused (Publish #67, 2026-11-15)', () => {
  it('every lock variant carries the never-refuse clause', async () => {
    const { LANGUAGE_LOCK, languageLockFor, explicitRequestNeverRefused } = await import('../../supabase/functions/_shared/conversation-language');
    expect(LANGUAGE_LOCK).toContain('EXPLICIT REQUESTS ARE NEVER REFUSED');
    expect(LANGUAGE_LOCK).toContain('Never say you are "only trained in" English');
    expect(languageLockFor('Portuguese')).toContain('EXPLICIT REQUESTS ARE NEVER REFUSED');
    expect(languageLockFor('Portuguese')).toContain('Never say you are "only trained in" Portuguese');
    expect(languageLockFor('Portuguese', 'detected')).toContain('EXPLICIT REQUESTS ARE NEVER REFUSED');
    expect(languageLockFor('Spanish')).toContain(explicitRequestNeverRefused('Spanish'));
  });
});
describe('unclear-turn rule (Publish #62, 2026-11-15)', () => {
  it('the English lock turns a garbled turn into a repeat request, never a language announcement', async () => {
    const { LANGUAGE_LOCK } = await import('../../supabase/functions/_shared/conversation-language');
    expect(LANGUAGE_LOCK).toContain('UNCLEAR-TURN RULE');
    expect(LANGUAGE_LOCK).toContain('never say you cannot change language');
    expect(LANGUAGE_LOCK).toContain('never say you speak only English');
    expect(LANGUAGE_LOCK).toContain('Sorry, I didn\'t catch that — could you say that again?');
  });

  it('the non-English lock carries the same unclear-turn rule', async () => {
    const { languageLockFor } = await import('../../supabase/functions/_shared/conversation-language');
    const spanish = languageLockFor('Spanish');
    expect(spanish).toContain('UNCLEAR-TURN RULE');
    expect(spanish).toContain('never say you speak only Spanish');
  });
});
