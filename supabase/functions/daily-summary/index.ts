import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { dailySummary, sendOwnerMail, endOutcome } from '../_shared/hostinger-mail.ts';

type Row = { caller_name: string | null; caller_email: string | null; caller_phone: string | null; business_name: string | null; duration_seconds: number | null; transcript: string | null; metadata: Record<string, any> | null };

const toText = (t: unknown): string => Array.isArray(t) ? t.map((x: any) => `${x?.role || '?'}: ${x?.text || ''}`).join('\n') : typeof t === 'string' ? t : '';

// One batched AI call: an English one-sentence summary per conversation. Falls back to null on any failure.
async function aiSummaries(transcripts: string[]): Promise<(string | null)[]> {
  const key = Deno.env.get('LOVABLE_API_KEY');
  const idx = transcripts.map((t, i) => [i, t.slice(-3500)] as const).filter(([, t]) => t.trim().length > 0);
  if (!key || !idx.length) return transcripts.map(() => null);
  try {
    const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
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
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const since = new Date(Date.now() - 864e5).toISOString();
    const { data: events } = await db.from('campaign_visit_events').select('visit_id,event').gte('created_at', since);
    const ev = events || [];
    const count = (e: string) => new Set(ev.filter(x => x.event === e).map(x => x.visit_id)).size;
    const { data: callsRaw } = await db.from('call_history').select('caller_name,caller_email,caller_phone,business_name,duration_seconds,transcript,metadata').gte('created_at', since).order('created_at', { ascending: false });
    const calls = (callsRaw || []) as Row[];
    const refs = calls.map(c => c.metadata?.session_id).filter(Boolean).map(id => `gemini_${id}`);
    const { data: recs } = refs.length ? await db.from('conversation_records').select('session_ref,transcript').in('session_ref', refs) : { data: [] };
    const recMap = new Map((recs || []).map((r: any) => [r.session_ref, toText(r.transcript)]));
    const transcripts = calls.map(c => c.transcript || recMap.get(`gemini_${c.metadata?.session_id}`) || '');
    const summaries = await aiSummaries(transcripts);
    const followups = calls.filter(c => c.metadata?.followup_consent_at).map(c => `${c.caller_name || '?'} <${c.caller_email || '?'}> – ${c.business_name || ''}`);
    const conversations = calls.map((c, i) => {
      const m = c.metadata || {}; const r = m.review || {};
      const callerTurns = transcripts[i].split('\n').filter(l => /^(user|caller|visitor)\s*:/i.test(l)).length;
      return { name: c.caller_name || 'Anonymous visitor', business: c.business_name || '', contact: c.caller_email || c.caller_phone || '', minutes: Math.max(0, Math.round((c.duration_seconds || 0) / 60)), seconds: c.duration_seconds || 0, score: typeof r.score === 'number' ? r.score : null, interests: Array.isArray(r.interest) ? r.interest.map((x: any) => x.label).filter(Boolean) : [], summary: summaries[i], outcome: endOutcome(m.end_reason, c.duration_seconds || 0, callerTurns || (typeof r.score === 'number' ? 1 : 0)), followup: !!m.followup_consent_at };
    });
    const { data: booked } = await db.from('implementation_calls').select('name,email,slot_start').neq('status', 'cancelled').gte('created_at', since);
    const bookings = (booked || []).map(b => `${b.name} <${b.email}> – ${new Date(b.slot_start).toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`);
    const day = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium' });
    await sendOwnerMail(dailySummary({ day, visits: count('page_view'), scans: count('scan_started'), voiceCalls: count('voice_started'), followups, bookings, conversations }));
    return json({ sent: true, conversations: conversations.length, summarized: summaries.filter(Boolean).length });
  } catch (e) {
    return json({ sent: false, error: (e as Error).message }, 500);
  }
});
