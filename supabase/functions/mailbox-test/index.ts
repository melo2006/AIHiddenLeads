import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { OWNER_MAILBOX, bookingAlert, bookingConfirmation, followupAlert, visitorFollowup, dailySummary, sendOwnerMail } from '../_shared/hostinger-mail.ts';

// Sends fixed sample emails only to the owner's own inbox; no caller input is used.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const db = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
  const { data: shotLead } = await db.from('leads').select('website_screenshot,business_name').like('website_screenshot', 'https://%').order('created_at', { ascending: false }).limit(1).maybeSingle();
  const sample = { name: 'Test Visitor', email: OWNER_MAILBOX, phone: '+1 561-275-5757', businessName: shotLead?.business_name || 'Sample Business (TEST)' };
  const slotStart = new Date(Date.now() + 2 * 864e5).toISOString();
  const copy = (m: { to: string; subject: string; text: string; html?: string }) => ({ ...m, to: OWNER_MAILBOX, subject: '[TEST copy] ' + m.subject });
  const mails = [
    bookingAlert({ ...sample, slotStart, notes: 'TEST booking alert' }),
    copy(bookingConfirmation({ ...sample, slotStart })),
    followupAlert(sample),
    copy(visitorFollowup({ ...sample, screenshot: shotLead?.website_screenshot, didDemo: true })),
    copy(visitorFollowup({ ...sample, businessName: '' })),
    dailySummary({ day: 'TEST', visits: 12, scans: 3, voiceCalls: 2, followups: ['Test Visitor <info@aihiddenleads.com>'], bookings: [] }),
  ];
  const results: Record<string, string> = {};
  for (const m of mails) {
    try { await sendOwnerMail(m); results[m.subject] = 'sent'; } catch (e) { results[m.subject] = (e as Error).message; }
  }
  return new Response(JSON.stringify(results), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
