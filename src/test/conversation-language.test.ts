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
