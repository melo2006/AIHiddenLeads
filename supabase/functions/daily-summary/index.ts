import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { dailySummary, sendOwnerMail } from '../_shared/hostinger-mail.ts';

// Once-a-day owner summary; recipient is fixed to the owner's inbox.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  try {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const since = new Date(Date.now() - 864e5).toISOString();
    const { data: events } = await db.from('campaign_visit_events').select('visit_id,event').gte('created_at', since);
    const ev = events || [];
    const count = (e: string) => new Set(ev.filter(x => x.event === e).map(x => x.visit_id)).size;
    const { data: calls } = await db.from('call_history').select('caller_name,caller_email,business_name,metadata').gte('created_at', since);
    const followups = (calls || []).filter(c => (c.metadata as Record<string, unknown>)?.followup_consent_at).map(c => `${c.caller_name || '?'} <${c.caller_email || '?'}> – ${c.business_name || ''}`);
    const { data: booked } = await db.from('implementation_calls').select('name,email,slot_start').neq('status', 'cancelled').gte('created_at', since);
    const bookings = (booked || []).map(b => `${b.name} <${b.email}> – ${new Date(b.slot_start).toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`);
    const day = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium' });
    await sendOwnerMail(dailySummary({ day, visits: count('page_view'), scans: count('scan_started'), voiceCalls: count('voice_started'), followups, bookings }));
    return json({ sent: true });
  } catch (e) {
    return json({ sent: false, error: (e as Error).message }, 500);
  }
});
