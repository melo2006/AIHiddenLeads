// Dropped-call rescue text — the server side of telephony-stream's
// 'phone-demo-rescue' action (2026-11-11).
//
// When a phone demo call ends before Aspen could call send_demo_recap
// (connection drop, hang-up mid-demo, max duration), the bridge asks for
// ONE rescue text with the demo link. The handler below re-decides
// EVERYTHING from the database — the bridge's claim is never trusted:
//
//   - the lead must exist;
//   - the lead's stored step-3 answer must be sms_consent === true;
//   - the number must not be on the sms_opt_outs list;
//   - neither the recap ('phone_demo_recap') nor a prior rescue
//     ('phone_demo_rescue') send may exist for this lead — dedupe runs
//     across BOTH templates, so a caller can never get recap + rescue;
//   - no booking may exist for the lead. implementation_calls has no
//     lead_id column, so "the lead's booking" means a non-cancelled row
//     whose email equals the lead's email — the exact lookup the recap
//     action already uses for its bookingPending flag.
//
// SMS only: the recap EMAIL belongs to completed calls; a rescue email
// for a dropped call is deliberately out of scope.
//
// The pure decision lives in _shared/followup.ts (rescueSmsDecision);
// this module is the impure shell — DB reads + the ledger-writing send
// via _shared/twilio-sms.ts — structured, like _shared/booking-ics.ts,
// so vitest can drive it with a stubbed db and a stubbed Twilio fetch
// instead of only pinning the decision function's truth table.
import { buildRescueSmsBody, normalizePhoneE164, rescueSmsDecision } from './followup.ts';
import { PHONE_DEMO_LINK } from './phone-demo.ts';
import { isSmsOptedOut, priorSmsAttemptsAny, trySendFollowupSms } from './twilio-sms.ts';

export const RESCUE_TEMPLATE_ID = 'phone_demo_rescue';
/** Both ledger templates count against the rescue's exactly-once rule. */
export const RESCUE_DEDUPE_TEMPLATE_IDS = ['phone_demo_recap', RESCUE_TEMPLATE_ID];

export type PhoneRescueResult =
  | { sent: true; messageSid?: string }
  | { sent: false; reason: string };

export async function resolvePhoneDemoRescue(db: any, leadId: string): Promise<PhoneRescueResult> {
  const id = typeof leadId === 'string' ? leadId : '';
  if (!id) return { sent: false, reason: 'lead_required' };

  let leadQuery = await db.from('leads').select('email, phone, sms_consent').eq('id', id).maybeSingle();
  if (leadQuery.error && /sms_consent/.test(String(leadQuery.error.message || ''))) {
    // Pre-migration: no consent column yet — consent counts as absent
    // (the same fallback the recap action uses).
    leadQuery = await db.from('leads').select('email, phone').eq('id', id).maybeSingle();
  }
  const lead = leadQuery.data as { email?: string | null; phone?: string | null; sms_consent?: boolean | null } | null;
  if (!lead) return { sent: false, reason: 'lead_not_found' };

  try {
    const to = normalizePhoneE164(lead.phone);
    const optedOut = to ? await isSmsOptedOut(db, to) : false;
    const prior = to ? await priorSmsAttemptsAny(db, { leadId: id }, RESCUE_DEDUPE_TEMPLATE_IDS, to) : { sent: false, attempts: 0 };
    const { data: bookedRows } = lead.email
      ? await db.from('implementation_calls').select('id').eq('email', lead.email).neq('status', 'cancelled').limit(1)
      : { data: null };
    const decision = rescueSmsDecision({
      mobile: lead.phone,
      smsConsent: lead.sms_consent === true,
      optedOut,
      prior,
      bookingExists: Boolean(bookedRows?.length),
    });
    if (!decision.send) return { sent: false, reason: decision.reason };
    // The demo link is the generic PHONE_DEMO_LINK: a personal invite
    // link cannot be rebuilt for a lead (only the code's SHA-256 hash is
    // stored) — see buildRescueSmsBody in followup.ts.
    const sent = await trySendFollowupSms(db, { to: decision.to, body: buildRescueSmsBody({ demoLink: PHONE_DEMO_LINK }), templateId: RESCUE_TEMPLATE_ID, leadId: id });
    return sent.sent ? { sent: true, messageSid: sent.messageSid } : { sent: false, reason: 'send_failed' };
  } catch (e) {
    console.error('phone-rescue: decision failed', e instanceof Error ? e.message : e);
    return { sent: false, reason: 'error' };
  }
}
