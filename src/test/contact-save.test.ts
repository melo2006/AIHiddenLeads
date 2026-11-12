// @vitest-environment node
// Fix 7 (Batch 1, 2026-11-12) — contact-save diagnosis fixes.
//
// D3 call 1: right after the visitor confirmed their phone number on
// screen, Aspen said "I'm having a technical issue saving your
// contact details at the moment." Trace of the old confirm path: the
// leads update and the call_history upsert each ran ONCE and any
// error threw a raw internal string that went straight to the model
// as the tool result (which Aspen verbalized); sessions with no lead
// row threw before writing anything; and a provider-cancelled tool
// call left the pending action deleted, so a late confirmation hit a
// silent `return` and the tool call was never answered at all.
// saveConfirmedFollowup (injected writers) is pinned here, plus the
// proxy wiring that keeps raw errors away from the model.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  CONTACT_SAVE_CLIENT_ERROR,
  CONTACT_SAVE_FALLBACK_TOOL_RESPONSE,
  attemptTwice,
  saveConfirmedFollowup,
  type ConfirmedFollowupWriters,
} from '../../supabase/functions/_shared/contact-save';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

const CONTACT = { name: 'Alan Smith', email: 'alan@example.com', phone: '+15615550100' };
const INPUT = { sessionId: 'sess-1', leadId: 'lead-1', prospectId: null, businessName: 'Acme', contact: CONTACT };

function writers(overrides: Partial<ConfirmedFollowupWriters> = {}): ConfirmedFollowupWriters {
  return {
    readLead: async () => ({ data: { full_name: '', email: 'old@example.com', phone: null, website_screenshot: 'shot.png' }, error: null }),
    updateLead: async () => ({ error: null }),
    upsertHistory: async () => ({ error: null }),
    ...overrides,
  };
}

describe('attemptTwice', () => {
  it('returns a first-try success with one attempt', async () => {
    const { result, attempts } = await attemptTwice(async () => ({ error: null, value: 1 }));
    expect(result.error).toBeNull();
    expect(attempts).toBe(1);
  });

  it('retries once on an error result and on a thrown exception', async () => {
    let calls = 0;
    const flaky = await attemptTwice(async () => ({ error: ++calls === 1 ? new Error('blip') : null }));
    expect(flaky.attempts).toBe(2);
    expect(flaky.result.error).toBeNull();
    let throws = 0;
    const throwing = await attemptTwice(async () => { if (++throws === 1) throw new Error('net'); return { error: null }; });
    expect(throwing.attempts).toBe(2);
    expect(throwing.result.error).toBeNull();
  });

  it('stops after the second failure', async () => {
    const op = vi.fn(async () => ({ error: new Error('down') }));
    const { result, attempts } = await attemptTwice(op);
    expect(attempts).toBe(2);
    expect(op).toHaveBeenCalledTimes(2);
    expect(result.error).toBeTruthy();
  });
});

describe('saveConfirmedFollowup', () => {
  it('fills only empty lead fields and upserts the confirmed contact onto call_history', async () => {
    const updateLead = vi.fn(async () => ({ error: null }));
    const upsertHistory = vi.fn(async (_row: Record<string, unknown>) => ({ error: null }));
    const saved = await saveConfirmedFollowup(writers({ updateLead, upsertHistory }), INPUT);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.lead?.website_screenshot).toBe('shot.png');
    expect(saved.attempts).toEqual({ update: 1, history: 1 });
    // full_name was empty -> filled; email was populated -> preserved.
    expect(updateLead).toHaveBeenCalledWith({ full_name: 'Alan Smith', email: 'old@example.com', phone: '+15615550100' });
    const row = upsertHistory.mock.calls[0][0] as Record<string, unknown>;
    expect(row.retell_call_id).toBe('gemini_sess-1');
    expect(row.caller_name).toBe('Alan Smith');
    expect(row.caller_email).toBe('alan@example.com');
    expect(row.caller_phone).toBe('+15615550100');
  });

  it('a transient leads-update failure is retried and the save still succeeds', async () => {
    let calls = 0;
    const updateLead = vi.fn(async () => ({ error: ++calls === 1 ? { message: 'blip' } : null }));
    const saved = await saveConfirmedFollowup(writers({ updateLead }), INPUT);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.attempts.update).toBe(2);
    expect(updateLead).toHaveBeenCalledTimes(2);
  });

  it('a persistent leads-update failure reports stage=update and never writes history', async () => {
    const upsertHistory = vi.fn(async (_row: Record<string, unknown>) => ({ error: null }));
    const saved = await saveConfirmedFollowup(writers({ updateLead: async () => ({ error: { message: 'down' } }), upsertHistory }), INPUT);
    expect(saved).toMatchObject({ ok: false, stage: 'update', attempts: { update: 2, history: 0 } });
    expect(upsertHistory).not.toHaveBeenCalled();
  });

  it('a transient history-upsert failure is retried', async () => {
    let calls = 0;
    const saved = await saveConfirmedFollowup(writers({ upsertHistory: async () => ({ error: ++calls === 1 ? { message: 'blip' } : null }) }), INPUT);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.attempts.history).toBe(2);
  });

  it('a persistent history failure reports stage=history', async () => {
    const saved = await saveConfirmedFollowup(writers({ upsertHistory: async () => ({ error: { message: 'down' } }) }), INPUT);
    expect(saved).toMatchObject({ ok: false, stage: 'history' });
  });

  it('a lead read failure reports stage=read and writes nothing', async () => {
    const updateLead = vi.fn(async () => ({ error: null }));
    const upsertHistory = vi.fn(async (_row: Record<string, unknown>) => ({ error: null }));
    const saved = await saveConfirmedFollowup(writers({ readLead: async () => ({ data: null, error: { message: 'gone' } }), updateLead, upsertHistory }), INPUT);
    expect(saved).toMatchObject({ ok: false, stage: 'read' });
    expect(updateLead).not.toHaveBeenCalled();
    expect(upsertHistory).not.toHaveBeenCalled();
  });

  it('a session with NO lead row still records the contact on call_history', async () => {
    const readLead = vi.fn(async () => { throw new Error('must not be called'); });
    const updateLead = vi.fn(async () => { throw new Error('must not be called'); });
    const upsertHistory = vi.fn(async (_row: Record<string, unknown>) => ({ error: null }));
    const saved = await saveConfirmedFollowup(
      writers({ readLead, updateLead, upsertHistory }),
      { ...INPUT, leadId: null, prospectId: 'prospect-9' },
    );
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.lead).toBeNull();
    expect(readLead).not.toHaveBeenCalled();
    expect(updateLead).not.toHaveBeenCalled();
    const row = upsertHistory.mock.calls[0][0] as Record<string, unknown>;
    expect(row.lead_id).toBeNull();
    expect(row.prospect_id).toBe('prospect-9');
    expect(row.caller_email).toBe('alan@example.com');
  });
});

describe('the failure shaping (Fix 7c)', () => {
  it('the model-facing fallback carries NO raw error and forbids the technical-issue confession', () => {
    expect('error' in CONTACT_SAVE_FALLBACK_TOOL_RESPONSE).toBe(false);
    expect(CONTACT_SAVE_FALLBACK_TOOL_RESPONSE.saved).toBe(false);
    expect(CONTACT_SAVE_FALLBACK_TOOL_RESPONSE.keptInCallRecord).toBe(true);
    expect(CONTACT_SAVE_FALLBACK_TOOL_RESPONSE.instruction).toContain('Do not mention any technical issue');
    expect(CONTACT_SAVE_FALLBACK_TOOL_RESPONSE.instruction).toContain('kept in the call record');
    expect(CONTACT_SAVE_FALLBACK_TOOL_RESPONSE.instruction).toContain('team will follow up from those');
  });

  it('the client keeps its own honest error marker, separate from the model response', () => {
    expect(CONTACT_SAVE_CLIENT_ERROR).toContain('could not be saved');
    expect(CONTACT_SAVE_CLIENT_ERROR).toContain('call record');
  });
});

describe('proxy wiring — PARKED (INCIDENT 2026-11-12 rollback)', () => {
  const src = read('supabase/functions/gemini-live-proxy/index.ts');

  it('the retrying save helper is NOT wired into the rolled-back proxy', () => {
    // On 2026-11-12 the Edge proxy was rolled back to the
    // last-known-good 17331b2 file after the provider began closing
    // every session at setup (code 1011). The helper module and its
    // tests above remain; the rolled-back followup path is the old
    // single-shot code, and the wiring returns with the Batch 1
    // proxy re-land.
    expect(src).not.toContain('saveConfirmedFollowup({');
    expect(src).not.toContain('orphanedToolCalls');
    expect(src).toContain('This demo has no visitor record for follow-up.');
  });
});
