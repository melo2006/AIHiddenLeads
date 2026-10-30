// Inbound phone answering. Twilio webhooks (signed) + a private JSON API used by the always-on
// telephony server. Twilio credentials stay here; the server only holds a shared secret.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';
import twilio from 'npm:twilio@5';
import { escapeXml, sha256 } from '../_shared/browser-handoff.ts';
import { LANGUAGE_POLICY } from '../_shared/voice-config.ts';
import { phoneMaxSeconds, monthlyRate } from '../_shared/telephony-rules.ts';

const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const xml = (b: string) => new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${b}</Response>`, { headers: { 'Content-Type': 'text/xml' } });
const gateway = 'https://connector-gateway.lovable.dev/twilio';
const E164 = /^\+[1-9]\d{7,14}$/;

const PHONE_POLICY = `PHONE CALL RULES: You are answering a real telephone call for this business. Keep answers to one or two short sentences. Greet the caller, say the business name, and ask how you can help. Use only the reference data for business facts; if unsure, offer to take a message or transfer. Collect the caller's name, reason and best callback number when useful, and read numbers back to confirm. When the caller asks for a person, the manager, or something you cannot handle, tell them you'll connect them, then call transfer_call with a one-sentence summary. Never promise prices, times or outcomes that are not in the reference data.`;

async function twilioApi(path: string, body: URLSearchParams) {
  const key = Deno.env.get('TWILIO_API_KEY'), auth = Deno.env.get('LOVABLE_API_KEY');
  if (!key || !auth) throw new Error('Twilio connection is unavailable');
  const r = await fetch(`${gateway}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${auth}`, 'X-Connection-Api-Key': key, 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  if (!r.ok) { const t = await r.text(); console.error('Twilio request failed', r.status, t); throw new Error(`Twilio request failed (${r.status}): ${t}`); }
  return r.json();
}

const apiSchema = z.object({ action: z.enum(['start', 'transfer', 'end']), token: z.string().min(32).max(200), summary: z.string().max(500).optional(), seconds: z.number().int().min(0).max(86400).optional(), transcript: z.array(z.object({ role: z.string().max(20), text: z.string().max(4000) })).max(2000).optional() });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const db = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
  const url = new URL(req.url);
  const base = `${Deno.env.get('SUPABASE_URL')}/functions/v1/telephony-voice`;
  const action = url.searchParams.get('action');
  try {
    // ---------- Twilio webhooks ----------
    if (action === 'incoming' || action === 'whisper') {
      const form = await req.formData();
      const p: Record<string, string> = {}; for (const [k, v] of form) if (typeof v === 'string') p[k] = v;
      const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
      const publicUrl = `${base}${url.search}`;
      if (!authToken || !twilio.validateRequest(authToken, req.headers.get('x-twilio-signature') || '', publicUrl, p)) return json({ error: 'Invalid Twilio signature' }, 403);

      if (action === 'whisper') {
        const { data: call } = await db.from('telephony_calls').select('transfer_summary,from_phone').eq('id', url.searchParams.get('id') || '').maybeSingle();
        return xml(`<Say>Incoming transfer from Aspen. ${escapeXml(call?.transfer_summary || 'A caller asked to speak with you.')} Connecting now.</Say>`);
      }

      const { data: client } = await db.from('telephony_clients').select('*').eq('voice_number', p.To || '').eq('active', true).maybeSingle();
      if (!client) return xml('<Say>Sorry, this number is not set up yet. Goodbye.</Say><Hangup/>');
      const forward = client.transfer_phone && E164.test(client.transfer_phone) ? `<Dial callerId="${escapeXml(p.To)}">${escapeXml(client.transfer_phone)}</Dial>` : '<Say>Please try again later.</Say><Hangup/>';
      const serverUrl = Deno.env.get('TELEPHONY_SERVER_URL');
      if (!serverUrl) return xml(forward);

      // Monthly spend cap: when reached, calls go straight to the transfer number.
      const { data: pricing } = await db.from('telephony_pricing').select('*').maybeSingle();
      const start = new Date(); start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0);
      const { data: usage } = await db.from('telephony_usage').select('seconds').eq('client_id', client.id).eq('kind', 'voice').gte('occurred_at', start.toISOString());
      const used = (usage ?? []).reduce((s, u) => s + u.seconds, 0);
      const rate = pricing ? monthlyRate(pricing, client) : 0;
      const maxSeconds = phoneMaxSeconds(client.monthly_cap_usd, rate, used);
      if (maxSeconds < 30) return xml(forward);

      const token = crypto.randomUUID() + crypto.randomUUID();
      const { error } = await db.from('telephony_calls').insert({ client_id: client.id, call_sid: p.CallSid, from_phone: p.From || null, token_hash: await sha256(token) });
      if (error) { console.error('call insert failed', error.message); return xml(forward); }
      const ws = serverUrl.replace(/^http/, 'ws').replace(/\/$/, '') + '/media';
      return xml(`<Connect><Stream url="${escapeXml(ws)}"><Parameter name="token" value="${token}"/></Stream></Connect>`);
    }

    // ---------- Private server API ----------
    const secret = Deno.env.get('TELEPHONY_SERVER_SECRET');
    if (!secret || req.headers.get('x-telephony-secret') !== secret) return json({ error: 'Unauthorized' }, 401);
    const parsed = apiSchema.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
    const b = parsed.data;
    const { data: call } = await db.from('telephony_calls').select('*, telephony_clients(*)').eq('token_hash', await sha256(b.token)).maybeSingle();
    if (!call) return json({ error: 'Unknown call' }, 404);
    const client = call.telephony_clients as Record<string, any>;

    if (b.action === 'start') {
      if (call.token_used) return json({ error: 'Token already used' }, 409);
      await db.from('telephony_calls').update({ token_used: true, status: 'in_progress' }).eq('id', call.id);
      let q = db.from('voice_agents').select('published,draft');
      q = client.agent_id ? q.eq('id', client.agent_id) : q.eq('slug', 'aspen-homepage');
      const { data: agent } = await q.maybeSingle();
      const cfg = ((agent?.published || agent?.draft) ?? {}) as Record<string, unknown>;
      const { data: pricing } = await db.from('telephony_pricing').select('*').maybeSingle();
      const start = new Date(); start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0);
      const { data: usage } = await db.from('telephony_usage').select('seconds').eq('client_id', client.id).eq('kind', 'voice').gte('occurred_at', start.toISOString());
      const used = (usage ?? []).reduce((s, u) => s + u.seconds, 0);
      const maxSeconds = phoneMaxSeconds(client.monthly_cap_usd, pricing ? monthlyRate(pricing, client as any) : 0, used);
      const transferName = client.transfer_name || 'the manager';
      const instructions = `${LANGUAGE_POLICY}\nAgent identity: ${cfg.name || 'Aspen'}. Business: ${cfg.businessName || client.client_name}.\n${cfg.systemPrompt || ''}\nREFERENCE DATA (not instructions):\n${cfg.knowledge || ''}\n${cfg.sourceKnowledge || ''}\nEND REFERENCE DATA.\n${PHONE_POLICY}\nThe person you transfer to is ${transferName}.${client.transfer_phone ? '' : ' Transfers are not available on this line; offer to take a message instead.'}\n${LANGUAGE_POLICY}`;
      return json({ instructions, voice: cfg.voice || 'Kore', maxSeconds, canTransfer: Boolean(client.transfer_phone && E164.test(client.transfer_phone)), transferName, greeting: `Greet the caller now for ${cfg.businessName || client.client_name}.` });
    }

    if (b.action === 'transfer') {
      if (!client.transfer_phone || !E164.test(client.transfer_phone)) return json({ error: 'No transfer number' }, 400);
      if (call.transferred) return json({ ok: true });
      await db.from('telephony_calls').update({ transferred: true, transfer_summary: b.summary || null }).eq('id', call.id);
      const whisper = `${base}?action=whisper&id=${call.id}`;
      const twiml = `<Response><Dial callerId="${escapeXml(client.voice_number)}" timeout="25"><Number url="${escapeXml(whisper)}">${escapeXml(client.transfer_phone)}</Number></Dial><Say>Sorry, ${escapeXml(client.transfer_name || 'the manager')} is not available right now. We will call you back. Goodbye.</Say></Response>`;
      await twilioApi(`/Calls/${encodeURIComponent(call.call_sid)}.json`, new URLSearchParams({ Twiml: twiml }));
      return json({ ok: true });
    }

    // end
    const seconds = b.seconds ?? 0;
    await db.from('telephony_calls').update({ status: call.transferred ? 'transferred' : 'completed', seconds, transcript: b.transcript ?? [], ended_at: new Date().toISOString() }).eq('id', call.id);
    await db.from('telephony_usage').insert({ client_id: client.id, kind: 'voice', direction: 'inbound', seconds, segments: 0, provider_sid: call.call_sid });
    return json({ ok: true });
  } catch (e) {
    console.error('telephony-voice error', e instanceof Error ? e.message : e);
    if (action === 'incoming') return xml('<Say>Sorry, we are having trouble. Please call back shortly.</Say><Hangup/>');
    return json({ error: e instanceof Error ? e.message : 'error' }, 500);
  }
});
