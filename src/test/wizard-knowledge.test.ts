import { describe, it, expect } from 'vitest';
import { replaceSection, REVIEWED_KNOWLEDGE_MARK, GUARDRAILS_MARK } from '../../supabase/functions/_shared/wizard-knowledge';

describe('reviewed wizard knowledge', () => {
  it('preserves original facts while replacing only accepted guidance', () => {
    const original = `Verified source facts\n\n${REVIEWED_KNOWLEDGE_MARK}\nOld draft`;
    expect(replaceSection(original, REVIEWED_KNOWLEDGE_MARK, 'Reviewed refrigeration guidance')).toBe(`Verified source facts\n\n${REVIEWED_KNOWLEDGE_MARK}\nReviewed refrigeration guidance`);
  });
  it('keeps existing safety rules when custom restrictions change', () => {
    const original = `Never invent prices.\n\n${GUARDRAILS_MARK}\nOld restriction`;
    expect(replaceSection(original, GUARDRAILS_MARK, 'Do not offer emergency service.')).toBe(`Never invent prices.\n\n${GUARDRAILS_MARK}\nDo not offer emergency service.`);
    expect(replaceSection(original, GUARDRAILS_MARK, '')).toBe('Never invent prices.');
  });
});