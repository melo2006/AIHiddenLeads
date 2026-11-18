// @vitest-environment node
import { describe, expect, it } from 'vitest';
import en from '../i18n/locales/en.json';
import es from '../i18n/locales/es.json';
import pt from '../i18n/locales/pt-BR.json';
import fr from '../i18n/locales/fr.json';

function leafKeys(o: unknown, prefix = '', out: string[] = []): string[] {
  if (o && typeof o === 'object' && !Array.isArray(o)) {
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) leafKeys(v, prefix ? `${prefix}.${k}` : k, out);
  } else out.push(prefix);
  return out;
}

describe('locale coverage', () => {
  // PT-BR reached full EN coverage on 2026-11-16 (the last 24 keys:
  // the pricing map-visibility set + avatar.intro). A missing key
  // silently falls back to English on the Portuguese pages — pin
  // full coverage so it cannot regress unnoticed. Spanish closed
  // its 366-key gap on 2026-11-17 and is pinned the same way.
  it('pt-BR covers every English leaf key', () => {
    const ptKeys = new Set(leafKeys(pt));
    const missing = leafKeys(en).filter((k) => !ptKeys.has(k));
    expect(missing).toEqual([]);
  });

  it('es covers every English leaf key', () => {
    const esKeys = new Set(leafKeys(es));
    const missing = leafKeys(en).filter((k) => !esKeys.has(k));
    expect(missing).toEqual([]);
  });

  // French (fr-CA) shipped at full parity with the French package
  // (2026-11-18) and is pinned the same way: a dropped leaf would
  // silently render English on the French pages.
  it('fr-CA covers every English leaf key', () => {
    const frKeys = new Set(leafKeys(fr));
    const missing = leafKeys(en).filter((k) => !frKeys.has(k));
    expect(missing).toEqual([]);
  });

  it('fr-CA adds no leaf keys English does not have', () => {
    const enKeys = new Set(leafKeys(en));
    const extra = leafKeys(fr).filter((k) => !enKeys.has(k));
    expect(extra).toEqual([]);
  });
});
