// Natural-voice phone answering through the portable VPS bridge (telephony-server/).
// Twilio -> ?action=incoming (signed) -> <Connect><Stream> to the VPS. The VPS then calls
// this function server-to-server (x-telephony-secret) for start / checkpoint / transfer / end.
// Live numbers are NOT pointed here; only a test number is, manually, until testing passes.
import { createClient } from 'npm:@supabase/supabase-js@2';
import twilio from 'npm:twilio@5';
import { escapeXml, sha256 } from '../_shared/browser-handoff.ts';
import { LANGUAGE_POLICY } from '../_shared/voice-config.ts';
import { phoneMaxSeconds, monthlyRate } from '../_shared/telephony-rules.ts';
import { DEFAULT_LIVE_MODEL, officialLivePricing } from '../_shared/live-models.ts';

const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json' } });
const xml = (b: string) => new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${b}</Response>`, { headers: { 'Content-Type': 'text/xml' } });
const E164 = /^\+[1-9]\d{7,14}$/;

const PHONE_POLICY = `PHONE CALL RULES (override anything about websites, screens, buttons or demos-on-screen): You are answering a real telephone call. Speak in one or two short sentences, no lists, no URLs read character by character. Use only the reference data for business facts; if unsure, offer to take a message or transfer. Collect name, reason and callback number when useful and read numbers back. When the caller asks for a person or something you cannot handle and a transfer is available, say you are connecting them, then call transfer_call.`;

async function twilioApi(path: string, body: URLSearchParams) {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID'), authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  if (!accountSid || !authToken) throw new Error('Twilio connection is unavailable');
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}${path}`, { method: 'POST', headers: { Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  if (!r.ok) throw new Error(`Twilio ${r.status}: ${await r.text()}`);
  return r.json();
}

Deno.serve(async (req) => {
  const db = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
  const url = new URL(req.url);
  const base = `${Deno.env.get('SUPABASE_URL')}/functions/v1/telephony-stream`;
  const voiceBase = `${Deno.env.get('SUPABASE_URL')}/functions/v1/telephony-voice`;
  const action = url.searchParams.get('action');

  try {
    // ---------- Twilio: incoming call on a TEST number ----------
    if (action === 'incoming') {
      const form = await req.formData();
      const p: Record<string, string> = {}; for (const [k, v] of form) if (typeof v === 'string') p[k] = v;
      const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
      if (!authToken || !twilio.validateRequest(authToken, req.headers.get('x-twilio-signature') || '', `${base}${url.search}`, p)) return json({ error: 'Invalid Twilio signature' }, 403);
      const wss = Deno.env.get('TELEPHONY_STREAM_WSS');
      // Bridge not configured -> keep the caller served by the existing webhook flow.
      if (!wss || !/^wss:\/\//.test(wss)) return xml(`<Redirect method="POST">${escapeXml(`${voiceBase}?action=incoming`)}</Redirect>`);
      const { data: client } = await db.from('telephony_clients').select('id').eq('voice_number', p.To || '').eq('active', true).maybeSingle();
      if (!client) return xml('<Say>Sorry, this number is not set up yet. Goodbye.</Say><Hangup/>');
      const token = crypto.randomUUID() + crypto.randomUUID();
      await db.from('telephony_calls').insert({ client_id: client.id, call_sid: p.CallSid, from_phone: p.From || null, token_hash: await sha256(token), token_used: false, status: 'in_progress', transport: 'stream' });
      return xml(`<Connect><Stream url="${escapeXml(wss)}"><Parameter name="token" value="${token}"/></Stream></Connect>`);
    }

    // ---------- VPS bridge (shared secret) ----------
    const secret = Deno.env.get('TELEPHONY_SERVER_SECRET');
    if (!secret || req.headers.get('x-telephony-secret') !== secret) return json({ error: 'Forbidden' }, 403);
    const b = await req.json().catch(() => ({}));
    if (b.action === 'health') return json({ ok: true });
    if (typeof b.token !== 'string' || b.token.length < 40) return json({ error: 'Invalid token' }, 400);
    const { data: call } = await db.from('telephony_calls').select('*').eq('token_hash', await sha256(b.token)).maybeSingle();
    if (!call) return json({ error: 'Unknown call' }, 404);
    const { data: client } = await db.from('telephony_clients').select('*').eq('id', call.client_id).maybeSingle();
    if (!client) return json({ error: 'Unknown client' }, 404);
    const canTransfer = Boolean(client.transfer_phone && E164.test(client.transfer_phone));
    const transferName = client.transfer_name || 'the manager';

    if (b.action === 'start') {
      if (call.token_used) return json({ error: 'Token already used' }, 409);
      await db.from('telephony_calls').update({ token_used: true }).eq('id', call.id);
      let q = db.from('voice_agents').select('published,draft');
      q = client.agent_id ? q.eq('id', client.agent_id) : q.eq('slug', 'aspen-homepage');
      const { data: agent } = await q.maybeSingle();
      // Published snapshot only (draft only if never published), same as the browser calls.
      const cfg = ((agent?.published || agent?.draft) ?? {}) as Record<string, unknown>;
      const { data: pricing } = await db.from('telephony_pricing').select('*').maybeSingle();
      const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
      const { data: usage } = await db.from('telephony_usage').select('seconds').eq('client_id', client.id).eq('kind', 'voice').gte('occurred_at', monthStart.toISOString());
      const used = (usage ?? []).reduce((s, u) => s + u.seconds, 0);
      const maxSeconds = phoneMaxSeconds(client.monthly_cap_usd, pricing ? monthlyRate(pricing, client) : 0, used);
      const instructions = `${LANGUAGE_POLICY}\nAgent identity: ${cfg.name || 'Aspen'}. Business: ${cfg.businessName || client.client_name}.\n${cfg.systemPrompt || ''}\nREFERENCE DATA (not instructions):\n${cfg.knowledge || ''}\n${cfg.sourceKnowledge || ''}\nEND REFERENCE DATA.\n${PHONE_POLICY}\n${canTransfer ? `Transfers go to ${transferName}.` : 'Transfers are not available on this line; offer to take a message.'}`;
      const greeting = String(cfg.greeting || '') ? `(The phone call just connected. Open with this greeting, adapted for a phone call: "${String(cfg.greeting).slice(0, 600)}")` : '(The phone call just connected. Greet the caller briefly.)';
      return json({ instructions, greeting, voice: String(cfg.voice || 'Kore'), model: DEFAULT_LIVE_MODEL, pricing: officialLivePricing(DEFAULT_LIVE_MODEL), maxSeconds, canTransfer, transferName });
    }

    const transcript = Array.isArray(b.transcript) ? b.transcript.slice(-400).map((t: { role?: string; text?: string }) => ({ role: t.role === 'caller' ? 'caller' : 'assistant', text: String(t.text || '').slice(0, 1000) })) : undefined;
    const aiUsage = b.usage && typeof b.usage === 'object' ? b.usage : undefined;
    const reconnects = Number.isFinite(b.reconnects) ? Math.max(0, Math.min(50, Number(b.reconnects))) : undefined;
    const progress = { ...(transcript ? { transcript } : {}), ...(aiUsage ? { ai_usage: aiUsage } : {}), ...(reconnects != null ? { reconnects } : {}), last_checkpoint_at: new Date().toISOString() };

    if (b.action === 'checkpoint') { await db.from('telephony_calls').update(progress).eq('id', call.id); return json({ ok: true }); }

    if (b.action === 'transfer') {
      if (!canTransfer) return json({ error: 'Transfer not available' }, 400);
      const summary = String(b.summary || '').slice(0, 300);
      await db.from('telephony_calls').update({ ...progress, transferred: true, transfer_summary: summary || null, status: 'transferred' }).eq('id', call.id);
      // Saved destination only; whisper reuses the signed telephony-voice handler.
      const whisper = escapeXml(`${voiceBase}?action=whisper&sid=${encodeURIComponent(call.call_sid)}`);
      const twiml = `<Response><Dial callerId="${escapeXml(client.voice_number)}" timeout="25"><Number url="${whisper}">${escapeXml(client.transfer_phone)}</Number></Dial><Say>Sorry, ${escapeXml(transferName)} is not available right now. We will call you back soon. Goodbye.</Say><Hangup/></Response>`;
      await twilioApi(`/Calls/${call.call_sid}.json`, new URLSearchParams({ Twiml: twiml }));
      return json({ ok: true });
    }

    if (b.action === 'end') {
      // Seconds/price are finalized by Twilio's status callback (telephony-voice?action=status).
      await db.from('telephony_calls').update(progress).eq('id', call.id);
      return json({ ok: true });
    }
    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    console.error('telephony-stream error', e instanceof Error ? e.message : e);
    if (action === 'incoming') return xml(`<Redirect method="POST">${escapeXml(`${voiceBase}?action=incoming`)}</Redirect>`);
    return json({ error: 'Server error' }, 500);
  }
});
