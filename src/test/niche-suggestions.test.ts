import { describe, it, expect } from 'vitest';
import { NICHE_PACKS, packForIndustry, mergeChecklistItems, parseChecklistJson } from '../../supabase/functions/_shared/niche-suggestions';

describe('niche suggestion packs', () => {
  it('gives every wizard industry a grounded pack with 4-6 services', () => {
    for (const [key, pack] of Object.entries(NICHE_PACKS)) {
      expect(pack.services.length, key).toBeGreaterThanOrEqual(4);
      expect(pack.services.length, key).toBeLessThanOrEqual(6);
      expect(pack.guardrails.length, key).toBeGreaterThanOrEqual(3);
    }
  });

  it('never invents specifics in service sentences (no prices, hours or guarantees)', () => {
    for (const pack of Object.values(NICHE_PACKS)) {
      for (const s of pack.services) {
        expect(s.sentence).not.toMatch(/\$\d|\d+\s?(am|pm)|\bguarantee/i);
        expect(s.sentence.endsWith('.')).toBe(true);
      }
    }
  });

  it('resolves wizard industry names and free-text aliases to packs', () => {
    expect(packForIndustry('Plumbing').key).toBe('plumbing');
    expect(packForIndustry('Legal').key).toBe('legal');
    expect(packForIndustry('B2B / industrial').key).toBe('industrial');
    expect(packForIndustry('Other', 'CNC machining shop').key).toBe('industrial');
    expect(packForIndustry('Underwater basket weaving').key).toBe('generic');
  });

  it('carries the law red line in the legal guardrails', () => {
    const legal = packForIndustry('Legal').pack;
    const redLine = legal.guardrails.find((g) => g.id === 'legal-never-you-have-a-case');
    expect(redLine?.sentence).toContain('Never tell a caller that they have a case');
  });

  it('merges AI candidates after pack items, deduplicated by label and capped', () => {
    const pack = packForIndustry('Plumbing').pack.services;
    const ai = [
      { id: 'ai-1', label: 'Drain Cleaning & Unclogging', sentence: 'We clear drains.' },
      { id: 'ai-2', label: 'Sewer camera inspections', sentence: 'We offer sewer camera inspections.' },
      { id: 'ai-3', label: 'Water softeners', sentence: 'We install water softeners.' },
      { id: 'ai-4', label: 'Tankless heaters', sentence: 'We install tankless water heaters.' },
    ];
    const merged = mergeChecklistItems(pack, ai);
    expect(merged.length).toBe(8);
    expect(merged[0].id).toBe(pack[0].id);
    expect(merged.filter((i) => i.label.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() === 'drain cleaning unclogging').length).toBe(1);
    expect(merged.some((i) => i.label === 'Sewer camera inspections')).toBe(true);
  });

  it('parses model JSON replies and rejects junk', () => {
    expect(parseChecklistJson('[{"label":"Drain cleaning","sentence":"We offer drain cleaning."}]'))
      .toEqual([{ id: 'ai-0-drain-cleaning', label: 'Drain cleaning', sentence: 'We offer drain cleaning.' }]);
    expect(parseChecklistJson('Here you go: [{"label":"X","sentence":"We do X."}] done')[0].label).toBe('X');
    expect(parseChecklistJson('no json here')).toEqual([]);
    expect(parseChecklistJson('[{"label":1}]')).toEqual([]);
  });
});
