import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SLOT_MINUTES } from '../_shared/booking-slots.ts';
import { bookingNoShowRecovery, bookingReminder, trySend } from '../_shared/hostinger-mail.ts';
import {
  buildBookingReminderSms,
  buildNoShowRecoverySms,
  dueFollowupActions,
  type FollowupAction,
  type FollowupBooking,
} from '../_shared/followup.ts';
import { isSmsOptedOut, trySendFollowupSms } from '../_shared/twilio-sms.ts';

// Follow-up sweep for implementation-call bookings (follow-up pack,
// 2026-11-11): 24h-before email reminder, 1h-before SMS reminder
// (consented bookings only), and a one-time no-show recovery (email + SMS)
// once a confirmed slot has fully passed with no outcome recorded.
//
// Invoked on a schedule (pg_cron + pg_net wiring is documented in
// supabase/migrations/20261111090000_followup_pack.sql — a deploy step, not
// part of this function). When the FOLLOWUP_SWEEP_SECRET secret is set, the
// caller must present it as the x-followup-secret header (the telephony
// server-to-server pattern); when unset, calls are accepted like the
// project's other sweeps. All sends are stamp-gated: each action updates
// its implementation_calls stamp BEFORE sending (claim), and a failed send
// releases the claim — so overlapping sweeps never double-send and a
// transient failure is retried by the next run.

const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json' } });

const STAMP: Record<FollowupAction, string> = {
  reminder_24h_email: 'reminder_24h_sent_at',
  reminder_1h_sms: 'reminder_1h_sent_at',
  noshow_recovery: 'noshow_sent_at',
};

Deno.serve(async (req) => {
  const secret = Deno.env.get('FOLLOWUP_SWEEP_SECRET');
  if (secret && req.headers.get('x-followup-secret') !== secret) return json({ error: 'Forbidden' }, 403);

  const db = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
  const now = new Date();
  const horizon = new Date(now.getTime() + 24 * 3600_000).toISOString();

  // Candidates: confirmed bookings whose slot is inside the reminder
  // horizon or already past (no-show), with at least one stamp missing.
  const { data: rows, error } = await db.from('implementation_calls')
    .select('id, name, email, phone, business_name, slot_start, status, sms_consent, reminder_24h_sent_at, reminder_1h_sent_at, noshow_sent_at')
    .eq('status', 'confirmed')
    .lte('slot_start', horizon)
    .order('slot_start', { ascending: true })
    .limit(200);
  if (error) {
    // Pre-migration (followup columns missing): nothing can be stamped, so
    // nothing may be sent — report and exit cleanly.
    console.error('followup-sweep: booking query failed', error.message);
    return json({ ok: false, reason: 'followup_columns_unavailable', processed: 0, sent: {} });
  }

  const sent: Record<string, number> = { reminder_24h_email: 0, reminder_1h_sms: 0, noshow_recovery: 0 };
  let processed = 0;

  for (const row of (rows || []) as FollowupBooking[]) {
    let optedOut = false;
    if (row.sms_consent && row.phone) {
      try { optedOut = await isSmsOptedOut(db, row.phone); } catch { optedOut = false; }
    }
    const actions = dueFollowupActions({ ...row, optedOut }, now, SLOT_MINUTES);
    for (const action of actions) {
      const stampCol = STAMP[action];
      const stamp = new Date().toISOString();
      const { data: claimed, error: claimErr } = await db.from('implementation_calls')
        .update({ [stampCol]: stamp }).eq('id', row.id).is(stampCol, null).select('id');
      if (claimErr || !claimed?.length) continue; // claimed by another run
      processed++;
      const contact = { name: row.name || '', email: row.email || '', phone: row.phone || undefined, businessName: row.business_name || undefined, slotStart: row.slot_start };
      let ok = false;
      try {
        if (action === 'reminder_24h_email') {
          ok = await trySend(bookingReminder(contact));
        } else if (action === 'reminder_1h_sms') {
          const sms = await trySendFollowupSms(db, { to: row.phone || '', body: buildBookingReminderSms({ slotStartIso: row.slot_start }), templateId: 'booking_reminder_1h', bookingId: row.id });
          ok = sms.sent;
        } else {
          const mailOk = await trySend(bookingNoShowRecovery(contact));
          let smsOk = false;
          if (row.sms_consent && row.phone && !optedOut) {
            const sms = await trySendFollowupSms(db, { to: row.phone, body: buildNoShowRecoverySms({ slotStartIso: row.slot_start }), templateId: 'booking_noshow', bookingId: row.id });
            smsOk = sms.sent;
          }
          ok = mailOk || smsOk;
        }
      } catch (e) {
        console.error(`followup-sweep: ${action} failed for booking ${row.id}`, e instanceof Error ? e.message : e);
        ok = false;
      }
      if (ok) sent[action]++;
      else await db.from('implementation_calls').update({ [stampCol]: null }).eq('id', row.id); // release the claim for the next run
    }
  }

  return json({ ok: true, processed, sent });
});
