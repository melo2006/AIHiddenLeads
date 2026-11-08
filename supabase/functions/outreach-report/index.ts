// Outreach report API (cold-email campaign tracking). Admin-only: same
// auth pattern as reseed-homepage-agent — a signed-in user whose id holds
// a voice_platform_roles row. Aggregates with the service role because
// demo_invites / outreach_sends / campaign_visit_events are not readable
// by client roles at all.
//
// Honest-signal design: there is NO email-open data in this response.
// "Opened" always means the prospect opened their personal demo link
// (server-verified invite resolve). Demo minutes are derived from
// voice_started → voice_ended milestone spans per linked visit;
// recordedDemoMinutes is the voice proxy's exact per-lead session total,
// surfaced alongside for comparison, never blended in.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildOutreachReport } from '../_shared/outreach-report.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const PAGE = 1000;

async function fetchAll<T>(db: ReturnType<typeof createClient>, table: string, columns: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from(table).select(columns).range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const auth = req.headers.get('Authorization') ?? '';
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await anon.auth.getUser();
    if (!user) return json({ error: 'unauthorized' }, 401);
    const { data: role } = await db.from('voice_platform_roles').select('role').eq('user_id', user.id).maybeSingle();
    if (!role) return json({ error: 'forbidden' }, 403);

    const campaignFilter = new URL(req.url).searchParams.get('campaign')?.slice(0, 100) || null;

    const sends = await fetchAll(db, 'outreach_sends', 'lead_id,campaign,step,sent_at');
    const invites = await fetchAll(db, 'demo_invites', 'lead_id,campaign,first_opened_at,last_opened_at,open_count');

    // The report covers leads touched by outreach: anyone sent to or invited.
    const leadIds = [...new Set([...sends.map(s => (s as { lead_id: string }).lead_id), ...invites.map(i => (i as { lead_id: string }).lead_id)])];
    const leads: { id: string; business_name: string; full_name: string; email: string | null; website_url: string }[] = [];
    const events: { visit_id: string; lead_id: string | null; event: string; created_at: string }[] = [];
    const sessions: { lead_id: string | null; duration_seconds: number | null }[] = [];
    for (let i = 0; i < leadIds.length; i += 200) {
      const chunk = leadIds.slice(i, i + 200);
      if (!chunk.length) break;
      const [leadRows, eventRows, sessionRows] = await Promise.all([
        db.from('leads').select('id,business_name,full_name,email,website_url').in('id', chunk),
        db.from('campaign_visit_events').select('visit_id,lead_id,event,created_at').in('lead_id', chunk),
        db.from('gemini_voice_sessions').select('lead_id,duration_seconds').in('lead_id', chunk),
      ]);
      if (leadRows.error) throw leadRows.error;
      if (eventRows.error) throw eventRows.error;
      if (sessionRows.error) throw sessionRows.error;
      leads.push(...((leadRows.data ?? []) as typeof leads));
      events.push(...((eventRows.data ?? []) as typeof events));
      sessions.push(...((sessionRows.data ?? []) as typeof sessions));
    }

    let report = buildOutreachReport({ sends: sends as never, invites: invites as never, events, leads, sessions });
    if (campaignFilter) {
      report = {
        campaigns: report.campaigns.filter(c => c.campaign === campaignFilter),
        prospects: report.prospects.filter(p => p.campaign === campaignFilter),
      };
    }
    return json({ ok: true, generatedAt: new Date().toISOString(), ...report });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
