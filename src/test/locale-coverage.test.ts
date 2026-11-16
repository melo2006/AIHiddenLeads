// @vitest-environment node
import { describe, expect, it } from 'vitest';
import en from '../i18n/locales/en.json';
import pt from '../i18n/locales/pt-BR.json';

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
  // full coverage so it cannot regress unnoticed. (Spanish is a
  // known, much larger gap — 366 keys at last count — and is NOT
  // pinned here; closing it is its own project.)
  it('pt-BR covers every English leaf key', () => {
    const ptKeys = new Set(leafKeys(pt));
    const missing = leafKeys(en).filter((k) => !ptKeys.has(k));
    expect(missing).toEqual([]);
  });
});
