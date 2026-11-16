// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { briefingLanguageFrom, briefingSayLanguage, handoffConnectingLine, handoffStayLine, managerBriefingText } from '../../supabase/functions/_shared/handoff-briefing-voice';

describe('handoff whisper language (2026-11-16) — our words, session language', () => {
  it('maps session language signals to a briefing language', () => {
    expect(briefingLanguageFrom({ startLanguage: 'Portuguese' })).toBe('pt');
    expect(briefingLanguageFrom({ uiLocale: 'pt-BR' })).toBe('pt');
    expect(briefingLanguageFrom({ startLanguage: 'Spanish' })).toBe('es');
    expect(briefingLanguageFrom({ uiLocale: 'es' })).toBe('es');
    expect(briefingLanguageFrom({ startLanguage: 'English' })).toBe('en');
    expect(briefingLanguageFrom({})).toBe('en');
  });

  it('the English briefing is byte-identical to the pre-localization wording', () => {
    expect(managerBriefingText({ manager_name: 'Ron Melo', summary: 'A caller asked about pricing.' })).toBe(
      'Hello Ron Melo. A website visitor is waiting. This is an automated handoff. A caller asked about pricing. Press 1 to accept and connect. Press any other key to decline.');
    expect(managerBriefingText({})).toContain('The visitor has requested to speak with your team.');
  });

  it('PT and ES briefings carry the same content in the session language', () => {
    const pt = managerBriefingText({ manager_name: 'Ron Melo', summary: 'Um cliente perguntou sobre preços.' }, 'pt');
    expect(pt).toContain('Olá Ron Melo.');
    expect(pt).toContain('Pressione 1 para aceitar e conectar.');
    const es = managerBriefingText({ manager_name: 'Ron Melo', summary: 'Un cliente preguntó por los precios.' }, 'es');
    expect(es).toContain('Hola Ron Melo.');
    expect(es).toContain('Presione 1 para aceptar y conectar.');
    expect(managerBriefingText({}, 'pt')).toContain('O visitante pediu para falar com a sua equipe.');
  });

  it('visitor-side lines localize and Say tags match', () => {
    expect(handoffStayLine('en')).toContain("I'll stay on until you're connected");
    expect(handoffStayLine('pt')).toContain('aguarde na linha');
    expect(handoffConnectingLine('es')).toBe('Conectándolo ahora.');
    expect(briefingSayLanguage('pt')).toBe('pt-BR');
    expect(briefingSayLanguage('es')).toBe('es-ES');
    expect(briefingSayLanguage('en')).toBe('en-US');
  });

  it('the handoff function wires the session language into every spoken line', () => {
    const fn = readFileSync(new URL('../../supabase/functions/browser-voice-handoff/index.ts', import.meta.url), 'utf8');
    expect(fn).toContain('sessionBriefingLanguage(handoff)');
    expect(fn).toContain('managerBriefingText(handoff,await sessionBriefingLanguage(handoff))');
    expect(fn).toContain('managerBriefingText(handoff,briefingLang)');
    expect(fn).toContain('handoffStayLine(stayLang)');
    expect(fn).toContain('handoffConnectingLine(acceptLang)');
  });
});
