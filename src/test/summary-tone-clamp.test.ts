// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { normalizeSummaryJson } from '../../supabase/functions/_shared/summary-normalize';

// 2026-11-20 live incident: the summary model answered callerTone
// "persistent" — a reasonable word that is not in the SummarySchema
// enum — and Zod's .parse() threw, discarding the ENTIRE summary
// (summary, needs, nextSteps, outreachDraft) and marking the record
// summary_status 'failed'. normalizeSummaryJson runs on the parsed
// JSON immediately before the schema parse in
// supabase/functions/_shared/conversation-records.ts so an
// out-of-enum optional label can never lose a summary again.

const base = () => ({
  summary: 'Visitor asked about pricing for a dental office.',
  needs: ['Answer calls after hours'],
  nextSteps: ['Send the plans link'],
  outreachDraft: 'Hi — following up on your visit…',
});

describe('normalizeSummaryJson — callerTone clamp', () => {
  test('the incident case: "persistent" becomes "neutral", everything else untouched', () => {
    const input = { ...base(), callerTone: 'persistent', toneEvidence: 'Kept asking three times' };
    const out = normalizeSummaryJson(input) as Record<string, unknown>;
    expect(out.callerTone).toBe('neutral');
    expect(out.summary).toBe(base().summary);
    expect(out.needs).toEqual(base().needs);
    expect(out.nextSteps).toEqual(base().nextSteps);
    expect(out.outreachDraft).toBe(base().outreachDraft);
    expect(out.toneEvidence).toBe('Kept asking three times');
  });

  test.each(['calm', 'interested', 'frustrated', 'angry', 'neutral'])(
    'valid tone "%s" passes through unchanged',
    (tone) => {
      const out = normalizeSummaryJson({ ...base(), callerTone: tone }) as Record<string, unknown>;
      expect(out.callerTone).toBe(tone);
    },
  );

  test('omitted callerTone stays omitted (no tone is invented)', () => {
    const out = normalizeSummaryJson(base()) as Record<string, unknown>;
    expect('callerTone' in out).toBe(false);
  });

  test('non-string callerTone (null) is clamped to neutral, not passed to the enum', () => {
    const out = normalizeSummaryJson({ ...base(), callerTone: null }) as Record<string, unknown>;
    expect(out.callerTone).toBe('neutral');
  });
});

describe('normalizeSummaryJson — leadRating guard', () => {
  test('invalid rating "lukewarm" is removed, never guessed', () => {
    const out = normalizeSummaryJson({ ...base(), leadRating: 'lukewarm', leadReason: 'Asked once' }) as Record<string, unknown>;
    expect('leadRating' in out).toBe(false);
    expect(out.leadReason).toBe('Asked once');
  });

  test.each(['hot', 'warm', 'cold'])('valid rating "%s" passes through unchanged', (rating) => {
    const out = normalizeSummaryJson({ ...base(), leadRating: rating }) as Record<string, unknown>;
    expect(out.leadRating).toBe(rating);
  });

  test('omitted leadRating stays omitted', () => {
    const out = normalizeSummaryJson(base()) as Record<string, unknown>;
    expect('leadRating' in out).toBe(false);
  });
});

describe('normalizeSummaryJson — malformed input still fails loudly', () => {
  test.each([null, undefined, 'a string', 42, ['an', 'array']])(
    'non-object input %j is returned as-is for the schema parse to reject',
    (raw) => {
      expect(normalizeSummaryJson(raw)).toBe(raw);
    },
  );
});

describe('wiring pin', () => {
  test('conversation-records.ts normalizes before the SummarySchema parse', () => {
    const src = readFileSync('supabase/functions/_shared/conversation-records.ts', 'utf8');
    expect(src).toContain('normalizeSummaryJson(JSON.parse(');
    expect(src).toContain("from './summary-normalize.ts'");
  });

  test('the VPS deploy closure carries summary-normalize.ts', () => {
    const deploy = readFileSync('voice-proxy-server/deploy.sh', 'utf8');
    expect(deploy).toContain('summary-normalize.ts');
  });
});
