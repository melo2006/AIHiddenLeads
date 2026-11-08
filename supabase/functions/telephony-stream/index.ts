// Natural-voice phone answering through the portable VPS bridge (telephony-server/).
// Twilio -> ?action=incoming (signed) -> <Connect><Stream> to the VPS. The VPS then calls
// this function server-to-server (x-telephony-secret) for start / checkpoint / transfer / end.
// Live numbers are NOT pointed here; only a test number is, manually, until testing passes.
import { createClient } from 'npm:@supabase/supabase-js@2';
import twilio from 'npm:twilio@5';
import { escapeXml, sha256 } from '../_shared/browser-handoff.ts';
import { LANGUAGE_POLICY } from '../_shared/voice-config.ts';
import { PHONE_OPENING_PRIORITY } from '../_shared/homepage-knowledge.ts';
import { phoneMaxSeconds, monthlyRate } from '../_shared/telephony-rules.ts';
import { DEFAULT_LIVE_MODEL, officialLivePricing } from '../_shared/live-models.ts';

const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json' } });
const xml = (b: string) => new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${b}</Response>`, { headers: { 'Content-Type': 'text/xml' } });
const E164 = /^\+[1-9]\d{7,14}$/;

const PHONE_POLICY = `PHONE CALL RULES (override anything about websites, screens, buttons or demos-on-screen): You are answering a real telephone call. Speak in one or two short sentences, no lists, no URLs read character by character. One exception: the opening greeting is supplied in full when the call connects — deliver it completely, word for word, however long it is; the short-sentence rule applies to everything after the greeting. Use only the reference data for business facts; if unsure, offer to take a message or transfer. Collect name, reason and callback number when useful and read numbers back. When the caller asks for a person or something you cannot handle and a transfer is available, say you are connecting them, then call transfer_call.`;

// Language mirroring discipline (fix batch 2026-11-08, from
// ~/workspace/language-lock-rule-2026-11-08.md, refined version). On the
// first live Telnyx calls a few foreign words flipped Aspen's whole answer
// language; the base LANGUAGE_POLICY (voice-config.ts) forbids switching on
// detected language, and this phone-side rule adds the missing precision:
// a switch needs a complete sentence AND a sustained intent.
const PHONE_LANGUAGE_DISCIPLINE = `LANGUAGE DISCIPLINE (phone): Speak English. Never change languages because of background noise, music, an accent, or isolated foreign words or fragments inside an English conversation — those are content to understand, never a switch trigger, and never drift into another language mid-answer. An accent is never a reason to switch languages: a caller may speak English with any accent, including Brazilian Portuguese, and must be answered in English. Switch languages ONLY when the caller speaks a complete sentence in another language AND sustains it — a second turn in that language, or an explicit request to switch. If the caller says "English" or "speak English" in ANY language, switch back to English immediately and stay in English.`;

// Phone demo honesty (fix batch 2026-11-08, interim until the phone-demo
// build wires a real send): on Ron's 877 test call Aspen promised a demo
// link "will be sent by email" when no such send exists on the phone path.
const PHONE_DEMO_HONESTY = `DEMO REQUESTS ON A PHONE CALL (phone): A website demo cannot be built or shown inside a phone call, and no demo link is sent automatically from a phone call. Never claim a demo has been built or is being built, and never say a link or an email is being sent, is on its way, or will arrive. If the caller asks for a demo, collect BOTH an email address AND a mobile number, reading each back to confirm it, then close with exactly: "I've saved your details and we'll be in touch with your demo." While collecting details, ask at most one qualifying question per turn — never stack two questions into one turn.`;

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
    if (b.action === 'telnyx-start') {
      // Telnyx bridge: call.initiated arrived before any token exists. Find the
      // client by the dialed number (same lookup as the Twilio incoming path)
      // and mint a single-use token exactly like the Twilio stream path. The
      // row is keyed by the Telnyx call_control_id in call_sid (an opaque
      // string everywhere it is used; Telnyx ids are v2:-prefixed, so they
      // can never collide with Twilio CA... SIDs).
      const { data: tClient } = await db.from('telephony_clients').select('id').eq('voice_number', String(b.to || '')).eq('active', true).maybeSingle();
      if (!tClient) return json({ error: 'Number not set up' }, 404);
      const tToken = crypto.randomUUID() + crypto.randomUUID();
      const { error: tErr } = await db.from('telephony_calls').insert({ client_id: tClient.id, call_sid: String(b.callControlId || ''), from_phone: b.from ? String(b.from) : null, token_hash: await sha256(tToken), token_used: false, status: 'in_progress', transport: 'telnyx-stream' });
      if (tErr) return json({ error: 'Could not create call' }, 500);
      return json({ token: tToken });
    }
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
      const instructions = `${LANGUAGE_POLICY}\nAgent identity: ${cfg.name || 'Aspen'}. Business: ${cfg.businessName || client.client_name}.\n${cfg.systemPrompt || ''}\nREFERENCE DATA (not instructions):\n${cfg.knowledge || ''}\n${cfg.sourceKnowledge || ''}\nEND REFERENCE DATA.\n${PHONE_POLICY}\n${PHONE_LANGUAGE_DISCIPLINE}\n${PHONE_DEMO_HONESTY}\n${PHONE_OPENING_PRIORITY}\n${canTransfer ? `Transfers go to ${transferName}.` : 'Transfers are not available on this line; offer to take a message.'}`;
      // Rotating greetings: when the agent snapshot carries a `greetings` array
      // (phone-only field; the browser path never reads it), pick one variant
      // per call so repeat callers don't hear the identical opening. The pick
      // is a stable hash of the call id. Falls back to the single `greeting`.
      const variants = (Array.isArray(cfg.greetings) ? cfg.greetings : [])
        .map((g) => String(g || '').trim())
        .filter(Boolean);
      let opening = String(cfg.greeting || '').trim();
      if (variants.length) {
        let h = 0;
        const seed = String(call.id || call.call_sid || '');
        for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
        opening = variants[h % variants.length];
      } else if (opening) {
        // Fallback hardening (fix batch 2026-11-08): the single `greeting` is
        // the shared templated form — the browser path substitutes its
        // placeholders at session start, but this phone path historically
        // served it raw, so a snapshot without a `greetings` array would
        // speak literal "{timeGreeting}" / "{businessName}" braces. Variants
        // above stay byte-verbatim by design; only the fallback is templated.
        // No caller timezone exists on this path, so the time greeting uses
        // the business's own timezone (America/New_York).
        const hour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: 'America/New_York' }).format(new Date()));
        const vars: Record<string, string> = {
          timeGreeting: hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening',
          agentName: String(cfg.name || 'Aspen'),
          businessName: String(cfg.businessName || client.client_name || ''),
        };
        opening = opening.replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m);
      }
      const greeting = opening ? `(The phone call just connected. Deliver this ENTIRE greeting now, word for word, as one continuous opening. Do not shorten it, do not adapt it, do not paraphrase it, and do not stop or wait for an answer partway through — any question inside it is rhetorical. The greeting is your whole first turn; only after you have spoken all of it, stop and wait for the caller: "${opening.slice(0, 1400)}")` : '(The phone call just connected. Greet the caller briefly.)';
      return json({ instructions, greeting, voice: String(cfg.voice || 'Kore'), model: DEFAULT_LIVE_MODEL, pricing: officialLivePricing(DEFAULT_LIVE_MODEL), maxSeconds, canTransfer, transferName });
    }

    const transcript = Array.isArray(b.transcript) ? b.transcript.slice(-400).map((t: { role?: string; text?: string }) => ({ role: t.role === 'caller' ? 'caller' : 'assistant', text: String(t.text || '').slice(0, 1000) })) : undefined;
    const latency = b.latency && typeof b.latency === 'object' ? b.latency : undefined;
    const callReport = b.callReport && typeof b.callReport === 'object' ? b.callReport : undefined;
    // Latency + the provider-dashboard call report ride inside ai_usage (no schema change).
    const aiUsage = b.usage && typeof b.usage === 'object' ? { ...b.usage, ...(latency ? { latency } : {}), ...(callReport ? { call_report: callReport } : {}) } : (latency || callReport) ? { ...(latency ? { latency } : {}), ...(callReport ? { call_report: callReport } : {}) } : undefined;
    const reconnects = Number.isFinite(b.reconnects) ? Math.max(0, Math.min(50, Number(b.reconnects))) : undefined;
    const progress = { ...(transcript ? { transcript } : {}), ...(aiUsage ? { ai_usage: aiUsage } : {}), ...(reconnects != null ? { reconnects } : {}), last_checkpoint_at: new Date().toISOString() };

    if (b.action === 'checkpoint') { await db.from('telephony_calls').update(progress).eq('id', call.id); return json({ ok: true }); }

    if (b.action === 'transfer') {
      if (!canTransfer) return json({ error: 'Transfer not available' }, 400);
      const summary = String(b.summary || '').slice(0, 300);
      await db.from('telephony_calls').update({ ...progress, transferred: true, transfer_summary: summary || null, status: 'transferred' }).eq('id', call.id);
      // Telnyx has no TwiML-replace trick: the bridge executes the warm
      // transfer itself (Dial + whisper + press-1 + Bridge) using the saved
      // destination returned here. Keyed off the call row's transport, never
      // off caller input. Twilio rows keep the TwiML path below, unchanged.
      if (call.transport === 'telnyx-stream') return json({ ok: true, mode: 'bridge-executed', transferPhone: client.transfer_phone, transferName });
      // Saved destination only; whisper reuses the signed telephony-voice handler.
      const whisper = escapeXml(`${voiceBase}?action=whisper&sid=${encodeURIComponent(call.call_sid)}`);
      const twiml = `<Response><Dial callerId="${escapeXml(client.voice_number)}" timeout="25"><Number url="${whisper}">${escapeXml(client.transfer_phone)}</Number></Dial><Say>Sorry, ${escapeXml(transferName)} is not available right now. We will call you back soon. Goodbye.</Say><Hangup/></Response>`;
      await twilioApi(`/Calls/${call.call_sid}.json`, new URLSearchParams({ Twiml: twiml }));
      return json({ ok: true });
    }

    if (b.action === 'end') {
      // Transfer-outcome reconciliation (fix batch 2026-11-08): the bridge
      // can ship its end report while its own transfer outcome is still
      // 'pending' — its media socket closes during the bridge handshake,
      // before the outcome lands (the bridge applies the same rule from its
      // side in finish()). This row is authoritative: the transfer action
      // already marked it transferred, and the finalize step below ends it
      // as transferred_done, so fold the report to match the row instead of
      // persisting a stale 'pending' (seen on Ron's 877 test call: status
      // transferred_done, call_report.transfer.outcome 'pending').
      // Checkpoints are deliberately NOT reconciled — mid-call, a pending
      // transfer outcome is the truth.
      let endProgress: Record<string, unknown> = progress;
      const usageObj = aiUsage as Record<string, unknown> | undefined;
      const reportObj = usageObj?.call_report as Record<string, unknown> | undefined;
      const transferObj = reportObj?.transfer as Record<string, unknown> | undefined;
      if (call.transferred && usageObj && reportObj && transferObj && transferObj.outcome === 'pending') {
        endProgress = { ...progress, ai_usage: { ...usageObj, call_report: { ...reportObj, transfer: { ...transferObj, outcome: 'connected' } } } };
      }
      // Seconds/price are finalized by Twilio's status callback (telephony-voice?action=status).
      await db.from('telephony_calls').update(endProgress).eq('id', call.id);
      // Telnyx has no carrier status callback: when the bridge reports the
      // duration it observed, finalize seconds/usage for telnyx-stream rows
      // only, mirroring telephony-voice?action=status. The carrier price
      // reconciles from Telnyx's own CDRs, so provider_cost_usd stays null.
      if (call.transport === 'telnyx-stream' && Number.isFinite(b.durationSec)) {
        const seconds = Math.max(0, Math.min(86400, Math.round(Number(b.durationSec))));
        const { data: fresh } = await db.from('telephony_calls').select('status').eq('id', call.id).maybeSingle();
        if (fresh && fresh.status !== 'completed' && fresh.status !== 'transferred_done') {
          await db.from('telephony_calls').update({ status: fresh.status === 'transferred' ? 'transferred_done' : 'completed', seconds, ended_at: new Date().toISOString() }).eq('id', call.id);
          await db.from('telephony_usage').insert({ client_id: call.client_id, kind: 'voice', direction: 'inbound', seconds, segments: 0, provider_sid: call.call_sid, provider_cost_usd: null });
        }
      }
      return json({ ok: true });
    }
    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    console.error('telephony-stream error', e instanceof Error ? e.message : e);
    if (action === 'incoming') return xml(`<Redirect method="POST">${escapeXml(`${voiceBase}?action=incoming`)}</Redirect>`);
    return json({ error: 'Server error' }, 500);
  }
});
