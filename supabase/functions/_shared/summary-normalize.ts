// Summary JSON normalization at the persistence boundary
// (callerTone save-loss fix, 2026-11-21).
//
// summarizeRecord() asks the model for callerTone / leadRating as
// free-form JSON strings and then validates with a strict Zod enum
// via SummarySchema.parse(). The prompt names the allowed values,
// but the model still returns near-miss labels — on 2026-11-20 it
// answered "persistent" for callerTone — and .parse() throws on ANY
// invalid field, so one bad optional label discarded the ENTIRE
// summary (summary, needs, nextSteps and outreachDraft were all
// lost and the record was marked summary_status 'failed').
//
// This normalizer runs on the parsed JSON immediately before the
// schema parse, so an out-of-enum label can never again lose a
// summary:
// - callerTone present but not one of the five allowed values is
//   clamped to 'neutral' (the honest fallback: no tone claim).
// - leadRating present but not hot/warm/cold is REMOVED, never
//   guessed — the generator prompt itself says to omit the rating
//   rather than guess, and inventing one would fabricate lead data.
// - Everything else passes through untouched, and non-object input
//   is returned as-is so genuinely malformed model output still
//   fails loudly at the schema parse instead of being papered over.
//
// Dependency-free on purpose: the Deno function imports it, and the
// vitest suite imports it directly (src/test/summary-tone-clamp.test.ts)
// because the parent module pulls npm:zod and Deno mail deps.

export const CALLER_TONES = ['calm', 'interested', 'frustrated', 'angry', 'neutral'] as const;
export const LEAD_RATINGS = ['hot', 'warm', 'cold'] as const;

export function normalizeSummaryJson(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const obj = raw as Record<string, unknown>;
  if ('callerTone' in obj && !(CALLER_TONES as readonly unknown[]).includes(obj.callerTone)) {
    obj.callerTone = 'neutral';
  }
  if ('leadRating' in obj && !(LEAD_RATINGS as readonly unknown[]).includes(obj.leadRating)) {
    delete obj.leadRating;
  }
  return obj;
}
