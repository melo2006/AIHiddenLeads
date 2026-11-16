// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { identityDriftName, spanishSlideInPortuguese } from '../../supabase/functions/_shared/drift-watch';

describe('drift watch (2026-11-16)', () => {
  it('catches self-identification as another persona in EN/PT/ES', () => {
    expect(identityDriftName("Hi, I'm Alex, how can I help?", 'Aspen')).toBe('Alex');
    expect(identityDriftName('Olá, eu sou o Alex da AI Hidden Leads.', 'Aspen')).toBe('Alex');
    expect(identityDriftName('Me chamo Sara, tudo bem?', 'Aspen')).toBe('Sara');
    expect(identityDriftName('Hola, soy Alex.', 'Aspen')).toBe('Alex');
    expect(identityDriftName('This is Frank speaking.', 'Aspen')).toBe('Frank');
  });

  it('never fires on her own name or on merely mentioning a colleague', () => {
    expect(identityDriftName("I'm Aspen, from AI Hidden Leads.", 'Aspen')).toBeNull();
    expect(identityDriftName('Let me introduce you to Alex, our specialist.', 'Aspen')).toBeNull();
    expect(identityDriftName('Alex can show you the investor side next.', 'Aspen')).toBeNull();
    expect(identityDriftName('Sou a Aspen, sua assistente.', 'Aspen')).toBeNull();
    expect(identityDriftName('How much does it cost?', 'Aspen')).toBeNull();
    expect(identityDriftName('', 'Aspen')).toBeNull();
  });

  it('in a Frank session, claiming Aspen fires; claiming Frank does not', () => {
    expect(identityDriftName("I'm Aspen, actually.", 'Frank')).toBe('Aspen');
    expect(identityDriftName("I'm Frank, the listing specialist.", 'Frank')).toBeNull();
  });

  it('Spanish orthography inside Portuguese fires; clean Portuguese does not', () => {
    expect(spanishSlideInPortuguese('¿Cómo puedo ayudar?')).toBe(true);
    expect(spanishSlideInPortuguese('O jalapeño é opcional.')).toBe(true);
    expect(spanishSlideInPortuguese('Posso ajudar com mais alguma coisa?')).toBe(false);
    expect(spanishSlideInPortuguese('O senhor tem um sonho de consumo?')).toBe(false);
    expect(spanishSlideInPortuguese('')).toBe(false);
  });

  it('the proxy wires the watch last in the boundary chain, once per kind', () => {
    const proxy = readFileSync(new URL('../../supabase/functions/gemini-live-proxy/index.ts', import.meta.url), 'utf8');
    expect(proxy).toContain("journal('identity_drift_correction'");
    expect(proxy).toContain("journal('language_drift_correction'");
    expect(proxy).toContain('!salesGateInjected && !bookingInjected');
  });
});
