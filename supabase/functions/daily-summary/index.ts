import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { dailySummary, sendOwnerMail, endOutcome } from '../_shared/hostinger-mail.ts';
import { reportTime, visitJourney, callerLocation, type VisitEvent } from '../_shared/report-context.ts';

type Row = { caller_name: string | null; caller_email: string | null; caller_phone: string | null; business_name: string | null; duration_seconds: number | null; transcript: string | null; metadata: Record<string, any> | null; started_at: string; ended_at: string | null; channel?: string };

const toText = (t: unknown): string => Array.isArray(t) ? t.map((x: any) => `${x?.role || '?'}: ${x?.text || ''}`).join('\n') : typeof t === 'string' ? t : '';

// One batched AI call: an English one-sentence summary per conversation. Falls back to null on any failure.
async function aiSummaries(transcripts: string[]): Promise<(string | null)[]> {
  const key = Deno.env.get('GOOGLE_API_KEY');
  const idx = transcripts.map((t, i) => [i, t.slice(-3500)] as const).filter(([, t]) => t.trim().length > 0);
  if (!key || !idx.length) return transcripts.map(() => null);
  try {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemini-3-flash-preview',
        messages: [
          { role: 'system', content: 'You summarize sales-demo conversations between an AI assistant (Aspen) and a website visitor for the business owner. Always write in English, even if the transcript is in another language. For each conversation write ONE concise sentence (max 30 words): what the visitor wanted or asked, and how it ended. If the visitor barely spoke or only said noise/single words, say so plainly (e.g. "Visitor said almost nothing; likely background noise or a test."). Never invent details. Return JSON: {"summaries":[{"id":number,"summary":string}]}' },
          { role: 'user', content: idx.map(([i, t]) => `### id ${i}\n${t}`).join('\n\n') },
        ],
        response_format: { type: 'json_object' },
      }),
    });
    if (!r.ok) throw new Error(`gateway ${r.status}`);
    const j = await r.json();
    const parsed = JSON.parse(j.choices?.[0]?.message?.content || '{}');
    const out: (string | null)[] = transcripts.map(() => null);
    for (const s of parsed.summaries || []) if (typeof s?.id === 'number' && typeof s.summary === 'string' && s.id < out.length) out[s.id] = s.summary.slice(0, 300);
    return out;
  } catch (e) {
    console.error('summary generation failed', (e as Error).message);
    return transcripts.map(() => null);
  }
}

// Once-a-day owner summary; recipient is fixed to the owner's inbox.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  try {
    const db = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
    const since = new Date(Date.now() - 864e5).toISOString();
    const { data: events, error: eventsError } = await db.from('campaign_visit_events').select('visit_id,event,path,created_at').gte('created_at', since);
    if(eventsError) throw eventsError;
    const ev = events || [];
    const count = (e: string) => new Set(ev.filter(x => x.event === e).map(x => x.visit_id)).size;
    const { data: callsRaw, error: callsError } = await db.from('call_history').select('caller_name,caller_email,caller_phone,business_name,duration_seconds,transcript,metadata,started_at,ended_at,retell_call_id').gte('started_at', since).order('started_at', { ascending: false });
    if(callsError) throw callsError;
    const calls = (callsRaw || []).map(c => ({...c, channel: c.retell_call_id?.startsWith('gemini_') ? 'Website voice' : 'Unknown origin'})) as Row[];
    const sessionIds = calls.map(c => c.metadata?.session_id).filter(Boolean);
    const { data: sessions, error: sessionError } = sessionIds.length ? await db.from('gemini_voice_sessions').select('id,config').in('id',sessionIds) : {data:[],error:null};
    if(sessionError) throw sessionError;
    const sessionMap = new Map((sessions || []).map(s=>[s.id,s.config as Record<string,any>]));
    const visitIds = [...new Set(calls.map(c=> c.metadata?.campaign?.visitId || sessionMap.get(c.metadata?.session_id)?.campaign?.visitId).filter(Boolean))];
    const {data: journeyEvents, error: journeyError} = visitIds.length ? await db.from('campaign_visit_events').select('visit_id,event,path,created_at').in('visit_id',visitIds).order('created_at') : {data:[],error:null};
    if(journeyError) throw journeyError;
    const {data: phoneCalls, error: phoneError} = await db.from('telephony_calls').select('call_sid,from_phone,started_at,ended_at,seconds,transcript,status,telephony_clients(client_name)').gte('started_at',since);
    if(phoneError) throw phoneError;
    for(const p of phoneCalls || []) {
      if((callsRaw || []).some(c=>c.retell_call_id===p.call_sid)) continue;
      const client = p.telephony_clients as unknown as {client_name?:string}|null;
      calls.push({caller_name:null,caller_email:null,caller_phone:p.from_phone,business_name:client?.client_name || '',duration_seconds:p.seconds,transcript:toText(p.transcript),started_at:p.started_at,ended_at:p.ended_at,channel:'Telephone',metadata:{end_reason:p.status==='failed'?'error':undefined}});
    }
    const refs = calls.map(c => c.metadata?.session_id).filter(Boolean).map(id => `gemini_${id}`);
    const { data: recs } = refs.length ? await db.from('conversation_records').select('session_ref,transcript').in('session_ref', refs) : { data: [] };
    const recMap = new Map((recs || []).map((r: any) => [r.session_ref, toText(r.transcript)]));
    const transcripts = calls.map(c => c.transcript || recMap.get(`gemini_${c.metadata?.session_id}`) || '');
    const summaries = await aiSummaries(transcripts);
    const followups = calls.filter(c => c.metadata?.followup_consent_at).map(c => `${c.caller_name || '?'} <${c.caller_email || '?'}> – ${c.business_name || ''}`);
    const conversations = calls.map((c, i) => {
      const m = c.metadata || {}; const r = m.review || {};
      const callerTurns = transcripts[i].split('\n').filter(l => /^(user|caller|visitor)\s*:/i.test(l)).length;
      const config = sessionMap.get(m.session_id) || {};
      const campaign = m.campaign || config.campaign;
      const zone = config.timeZone || m.timeZone;
      const local = zone ? reportTime(c.started_at,zone) : null;
      return { name: c.caller_name || (c.channel==='Telephone'?'Anonymous caller':'Anonymous visitor'), business: c.business_name || '', contact: c.caller_email || c.caller_phone || '', minutes: Math.max(0, Math.round((c.duration_seconds || 0) / 60)), seconds: c.duration_seconds || 0, score: typeof r.score === 'number' ? r.score : null, interests: Array.isArray(r.interest) ? r.interest.map((x: any) => x.label).filter(Boolean) : [], summary: summaries[i], outcome: endOutcome(m.end_reason, c.duration_seconds || 0, callerTurns || (typeof r.score === 'number' ? 1 : 0)), followup: !!m.followup_consent_at,
        startedEastern: reportTime(c.started_at), startedLocal: local ? `${local} (${zone}; browser setting)` : null, channel: c.channel || 'Unknown origin', location: callerLocation(m.caller_location), journey: c.channel==='Telephone'?'Telephone call; website activity not linked':visitJourney((journeyEvents || []) as VisitEvent[],campaign?.visitId,c.ended_at), source: campaign?.source || null, entryPath: campaign?.entryPath || null };
    });
    const { data: booked } = await db.from('implementation_calls').select('name,email,slot_start').neq('status', 'cancelled').gte('created_at', since);
    const bookings = (booked || []).map(b => `${b.name} <${b.email}> – ${new Date(b.slot_start).toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`);
    const day = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium' });
    await sendOwnerMail(dailySummary({ day, visits: count('page_view'), scans: count('scan_started'), voiceCalls: count('voice_started'), telephoneCalls: (phoneCalls || []).length, followups, bookings, conversations }));
    return json({ sent: true, conversations: conversations.length, summarized: summaries.filter(Boolean).length });
  } catch (e) {
    return json({ sent: false, error: (e as Error).message }, 500);
  }
});
