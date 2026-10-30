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