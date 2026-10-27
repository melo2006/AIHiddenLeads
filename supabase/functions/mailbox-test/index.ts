import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { OWNER_MAILBOX, bookingAlert, followupAlert, visitorFollowup, dailySummary, sendOwnerMail } from '../_shared/hostinger-mail.ts';

// Sends fixed sample emails only to the owner's own inbox; no caller input is used.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const sample = { name: 'Test Visitor', email: OWNER_MAILBOX, phone: '+1 561-275-5757', businessName: 'Sample Business (TEST)' };
  const mails = [
    bookingAlert({ ...sample, slotStart: new Date(Date.now() + 2 * 864e5).toISOString(), notes: 'TEST booking alert' }),
    followupAlert(sample),
    { ...visitorFollowup(sample), to: OWNER_MAILBOX, subject: '[TEST copy] ' + visitorFollowup(sample).subject },
    dailySummary({ day: 'TEST', visits: 12, scans: 3, voiceCalls: 2, followups: ['Test Visitor <info@aihiddenleads.com>'], bookings: [] }),
  ];
  const results: Record<string, string> = {};
  for (const m of mails) {
    try { await sendOwnerMail(m); results[m.subject] = 'sent'; } catch (e) { results[m.subject] = (e as Error).message; }
  }
  return new Response(JSON.stringify(results), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
