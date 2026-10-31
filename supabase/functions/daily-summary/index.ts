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
    const { data: calls } = await db.from('call_history').select('caller_name,caller_email,caller_phone,business_name,duration_seconds,metadata').gte('created_at', since);
    const followups = (calls || []).filter(c => (c.metadata as Record<string, unknown>)?.followup_consent_at).map(c => `${c.caller_name || '?'} <${c.caller_email || '?'}> – ${c.business_name || ''}`);
    const conversations = (calls || []).map(c => {
      const m = (c.metadata || {}) as Record<string, any>; const r = m.review || {};
      return { name: c.caller_name || 'Anonymous visitor', business: c.business_name || '', contact: c.caller_email || c.caller_phone || '', minutes: Math.max(0, Math.round((c.duration_seconds || 0) / 60)), score: typeof r.score === 'number' ? r.score : null, interests: Array.isArray(r.interest) ? r.interest.map((i: any) => i.label).filter(Boolean) : [], lastSaid: typeof r.summary === 'string' ? (r.summary.split('Last visitor statement: ')[1] || '') : '', followup: !!m.followup_consent_at };
    });
    const { data: booked } = await db.from('implementation_calls').select('name,email,slot_start').neq('status', 'cancelled').gte('created_at', since);
    const bookings = (booked || []).map(b => `${b.name} <${b.email}> – ${new Date(b.slot_start).toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`);
    const day = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium' });
    await sendOwnerMail(dailySummary({ day, visits: count('page_view'), scans: count('scan_started'), voiceCalls: count('voice_started'), followups, bookings, conversations }));
    return json({ sent: true });
  } catch (e) {
    return json({ sent: false, error: (e as Error).message }, 500);
  }
});
