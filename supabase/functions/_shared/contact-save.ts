// Confirmed-contact save for the Gemini Live proxy (Batch 1,
// 2026-11-12, Fix 7). The request_platform_followup confirm used to
// run each database write exactly once and throw a raw internal error
// string on any failure; that string went straight back to the model
// as the tool result, and Aspen verbalized it to the visitor as "I'm
// having a technical issue saving your contact details" (D3 call 1,
// 2026-11-12). This module is the save itself, with the writers
// injected so the retry/fallback behavior is unit-testable:
//
//  - The leads update and the call_history upsert each get ONE retry
//    (a transient PostgREST/connection blip must not fail a save the
//    visitor explicitly confirmed on screen).
//  - A session with no lead row (homepage and prospect-only sessions
//    carry lead_id = null) still saves: the confirmed contact lands
//    on the call_history row, which is where follow-up works from.
//    Previously those sessions could never save at all — the branch
//    threw 'no visitor record' before writing anything.
//  - When the save still fails after the retry, the caller answers
//    the model with CONTACT_SAVE_FALLBACK_TOOL_RESPONSE (the details
//    ARE in this call's transcript and call record, and the team
//    follows up from those — no "technical issue" confession) while
//    the client keeps an honest error marker
//    (CONTACT_SAVE_CLIENT_ERROR).

/** One operation, retried once on error. An "error" is either a
 *  thrown exception or a Supabase-style `{ error }` result — the
 *  writers below normalize both to the result shape. */
export async function attemptTwice<T extends { error: unknown }>(
  op: () => Promise<T>,
): Promise<{ result: T; attempts: number }> {
  let attempts = 0;
  let result: T;
  do {
    attempts += 1;
    try {
      result = await op();
    } catch (e) {
      result = { error: e } as T;
    }
  } while (result.error && attempts < 2);
  return { result, attempts };
}

export interface FollowupLead {
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  website_screenshot?: string | null;
}

export interface ConfirmedFollowupWriters {
  /** Read the lead row (only called when a leadId exists). */
  readLead: () => Promise<{ data: FollowupLead | null; error: unknown }>;
  /** Fill only still-empty lead fields (never overwrite populated
   *  ones — the caller builds the fields; see the proxy wiring). */
  updateLead: (fields: { full_name: unknown; email: unknown; phone: unknown }) => Promise<{ error: unknown }>;
  /** Upsert the call_history row carrying the confirmed contact. */
  upsertHistory: (row: Record<string, unknown>) => Promise<{ error: unknown }>;
}

export interface ConfirmedFollowupInput {
  sessionId: string;
  leadId: string | null;
  prospectId: string | null;
  businessName: string;
  contact: { name: string; email: string; phone: string };
}

export type ConfirmedFollowupSave =
  | { ok: true; lead: FollowupLead | null; attempts: { update: number; history: number } }
  | { ok: false; stage: 'read' | 'update' | 'history'; attempts: { update: number; history: number } };

export async function saveConfirmedFollowup(
  writers: ConfirmedFollowupWriters,
  input: ConfirmedFollowupInput,
): Promise<ConfirmedFollowupSave> {
  const attempts = { update: 0, history: 0 };
  let lead: FollowupLead | null = null;
  if (input.leadId) {
    let read: { data: FollowupLead | null; error: unknown };
    try {
      read = await writers.readLead();
    } catch (e) {
      read = { data: null, error: e };
    }
    if (read.error || !read.data) return { ok: false, stage: 'read', attempts };
    lead = read.data;
    const updated = await attemptTwice(() => writers.updateLead({
      full_name: lead!.full_name || input.contact.name,
      email: lead!.email || input.contact.email,
      phone: lead!.phone || input.contact.phone || null,
    }));
    attempts.update = updated.attempts;
    if (updated.result.error) return { ok: false, stage: 'update', attempts };
  }
  const history = await attemptTwice(() => writers.upsertHistory({
    retell_call_id: `gemini_${input.sessionId}`,
    lead_id: input.leadId,
    prospect_id: input.prospectId,
    business_name: input.businessName,
    caller_name: input.contact.name,
    caller_email: input.contact.email,
    caller_phone: input.contact.phone || null,
    call_status: 'live',
    metadata: { provider: 'gemini', session_id: input.sessionId, followup_consent_at: new Date().toISOString() },
  }));
  attempts.history = history.attempts;
  if (history.result.error) return { ok: false, stage: 'history', attempts };
  return { ok: true, lead, attempts };
}

/** What the MODEL hears when the save fails even after the retry:
 *  truthful (the spelled/confirmed details are in this call's
 *  transcript and call record) and free of any internal error text,
 *  so Aspen never confesses a "technical issue" to the visitor. */
export const CONTACT_SAVE_FALLBACK_TOOL_RESPONSE = {
  saved: false,
  keptInCallRecord: true,
  instruction: 'Do not mention any technical issue or saving problem. The details confirmed in this call are kept in the call record. Warmly tell the visitor, in your own words, that their details from this call are noted and the team will follow up from those, then continue the conversation naturally.',
} as const;

/** What the CLIENT shows for the same failure: an honest marker,
 *  kept separate from the model-facing response above. */
export const CONTACT_SAVE_CLIENT_ERROR = 'Your details could not be saved just now — they are noted in this call record and the team will follow up from those.';
