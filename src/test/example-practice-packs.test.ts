import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  EXAMPLE_PRACTICE_LABELS,
  EXAMPLE_PRACTICE_PACKS,
  EXAMPLE_PRACTICE_TYPE_BY_SLUG,
  buildExamplePracticeLayer,
  examplePracticeLayerForType,
  examplePracticeTypeForSiteUrl,
  stampExamplePractice,
  type ExamplePracticeType,
} from '../../supabase/functions/_shared/example-practice-packs';
import { B2B_EXAMPLE_PACKS } from '../../supabase/functions/_shared/b2b-example-services';
import { REALTOR_EXAMPLE_PACKS } from '../../supabase/functions/_shared/realtor-example-listings';

const ALL_TYPES = Object.keys(EXAMPLE_PRACTICE_PACKS) as ExamplePracticeType[];

describe('example practice packs — coverage', () => {
  test('every pinned example slug has a practice type (52 examples)', () => {
    expect(Object.keys(EXAMPLE_PRACTICE_TYPE_BY_SLUG)).toHaveLength(52);
    for (const pack of [...REALTOR_EXAMPLE_PACKS, ...B2B_EXAMPLE_PACKS]) {
      expect(EXAMPLE_PRACTICE_TYPE_BY_SLUG[pack.slug], pack.slug).toBeTruthy();
    }
  });

  test('every type has a label and a substantive, honesty-headed pack', () => {
    for (const type of ALL_TYPES) {
      expect(EXAMPLE_PRACTICE_LABELS[type]).toBeTruthy();
      expect(EXAMPLE_PRACTICE_PACKS[type].length).toBeGreaterThan(900);
      const layer = buildExamplePracticeLayer(type);
      expect(layer).toContain('GENERAL PRACTICE GUIDE');
      expect(layer).toContain('NOT facts about this business');
      expect(layer).toContain('the business\'s own knowledge always wins');
      expect(layer).toContain(EXAMPLE_PRACTICE_LABELS[type]);
    }
  });

  test('packs never state business-specific facts (no prices, hours, or guarantees)', () => {
    for (const type of ALL_TYPES) {
      const pack = EXAMPLE_PRACTICE_PACKS[type];
      expect(pack).not.toMatch(/\$\d/);
      expect(pack).not.toMatch(/\b\d{1,2}:\d{2}\s?(a\.?m\.?|p\.?m\.?)\b/i);
    }
  });
});

describe('example practice packs — resolution', () => {
  test('resolves every roster URL to its type', () => {
    for (const pack of REALTOR_EXAMPLE_PACKS) {
      expect(examplePracticeTypeForSiteUrl(pack.url), pack.slug).toBe('real-estate');
    }
    for (const pack of B2B_EXAMPLE_PACKS) {
      expect(examplePracticeTypeForSiteUrl(pack.url), pack.slug).toBe(EXAMPLE_PRACTICE_TYPE_BY_SLUG[pack.slug]);
    }
  });

  test('the pool example resolves to the pools pack (www / slash tolerant)', () => {
    expect(examplePracticeTypeForSiteUrl('https://essigpools.com/')).toBe('pools');
    expect(examplePracticeTypeForSiteUrl('https://www.essigpools.com')).toBe('pools');
    expect(examplePracticeTypeForSiteUrl('essigpools.com')).toBe('pools');
  });

  test('unknown or malformed sites resolve to null', () => {
    expect(examplePracticeTypeForSiteUrl('https://some-random-business.com/')).toBeNull();
    expect(examplePracticeTypeForSiteUrl('')).toBeNull();
    expect(examplePracticeTypeForSiteUrl(null)).toBeNull();
    expect(examplePracticeTypeForSiteUrl(undefined)).toBeNull();
    expect(examplePracticeTypeForSiteUrl(42)).toBeNull();
  });

  test('layer rebuild from a stamped type round-trips; junk yields null', () => {
    expect(examplePracticeLayerForType('pools')).toBe(buildExamplePracticeLayer('pools'));
    expect(examplePracticeLayerForType('not-a-type')).toBeNull();
    expect(examplePracticeLayerForType(null)).toBeNull();
    expect(examplePracticeLayerForType({ type: 'pools' })).toBeNull();
  });
});

describe('example practice packs — the stamp', () => {
  test('appends the layer once and records the marker', () => {
    const config: Record<string, unknown> = { systemPrompt: 'BASE PROMPT' };
    stampExamplePractice(config, 'dental');
    expect(config.examplePractice).toEqual({ type: 'dental' });
    expect(String(config.systemPrompt)).toContain('BASE PROMPT');
    expect(String(config.systemPrompt)).toContain('GENERAL PRACTICE GUIDE — Dental Practice');
    const afterFirst = String(config.systemPrompt);
    stampExamplePractice(config, 'dental');
    expect(String(config.systemPrompt)).toBe(afterFirst);
    expect(String(config.systemPrompt).match(/GENERAL PRACTICE GUIDE/g)).toHaveLength(2); // header + END line share the words once each way
  });

  test('gemini-session wires the stamp on the parent and the Sara segment leg', () => {
    const src = readFileSync('supabase/functions/gemini-session/index.ts', 'utf8');
    expect(src).toContain("from '../_shared/example-practice-packs.ts'");
    expect(src).toContain('const practiceType=examplePracticeTypeForSiteUrl(siteUrl);');
    expect(src).toContain('if(practiceType) stampExamplePractice(config, practiceType);');
    expect(src).toContain('examplePracticeLayerForType((parent.examplePractice as {type?:unknown}|undefined)?.type)');
    expect(src).toContain('segmentLayer?{layer:segmentLayer}:undefined');
  });
});
