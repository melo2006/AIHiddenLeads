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
import { PHONE_DEMO_DISCLOSURE_VERSION, PHONE_DEMO_HOST_POLICY, PHONE_DEMO_LINK, BOOKING_PAGE_LINK, PHONE_GREETING, buildDictatedKnowledge, sanitizeSpokenCode, spellBackForSpeech, transcriptShowsCapturedContact } from '../_shared/phone-demo.ts';
import { buildRecapSmsBody, normalizePhoneE164, recapSmsDecision } from '../_shared/followup.ts';
import { isSmsOptedOut, priorSmsAttempts, trySendFollowupSms } from '../_shared/twilio-sms.ts';
import { resolvePhoneDemoRescue } from '../_shared/phone-rescue.ts';
import { platformAvailability } from '../_shared/platform-calendar.ts';
import { generateSlots } from '../_shared/booking-slots.ts';
import { checkTimeAvailability, parseDayPart, preferredDatesFor, resolveNamedTime, selectOfferSet } from '../_shared/booking-tools.ts';
import { bookCallWithConfirmations } from '../_shared/booking-confirm.ts';
import { logUsageEvent, phoneVoiceEventFromCall } from '../_shared/usage-ledger.ts';

const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json' } });
const xml = (b: string) => new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${b}</Response>`, { headers: { 'Content-Type': 'text/xml' } });
const E164 = /^\+[1-9]\d{7,14}$/;

const PHONE_POLICY = `PHONE CALL RULES (override anything about websites, screens, buttons or demos-on-screen): You are answering a real telephone call. Speak in one or two short sentences, no lists, no URLs read character by character. One exception: the opening greeting is supplied in full when the call connects — deliver it completely, word for word, however long it is; the short-sentence rule applies to everything after the greeting. Use only the reference data for business facts; if unsure, offer to take a message or transfer. Collect name, reason and callback number when useful. UNIVERSAL NUMBER PROTOCOL (mandatory gate, every mode): any phone number a caller dictates — a callback number, a service or appointment number, any number at all — must be read back grouped digit-by-digit, followed by "Did I get that right?", and the conversation proceeds ONLY on the caller's confirmation; a correction restarts the read-back of that number, never the whole conversation. Never move on from a dictated number without this read-back gate. When the caller asks for a person or something you cannot handle and a transfer is available, say you are connecting them, then call transfer_call.`;

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
// ---------- Phone demo plumbing (front-door lines only) ----------
// The verification engine is the demo-verification edge function (the same
// one the web gate uses): this function calls it server-to-server so codes,
// attempt caps, consent records and the verified flags live in exactly one
// place. SMS sending stays gated inside demo-verification by
// DEMO_VERIFICATION_SMS_ENABLED; while the lane is closed its 501 maps to
// the interim caller-ID mode here.
async function demoVerification(payload: Record<string, unknown>): Promise<{ status: number; data: Record<string, unknown> }> {
  const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/demo-verification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''}` },
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => ({})) as Record<string, unknown>;
  return { status: r.status, data };
}

function buildRecapEmailHtml(businessName: string, summary: string, link: string, booked: boolean): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:30px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <tr><td style="padding:30px 30px 10px;text-align:center;">
    <h1 style="margin:0;font-size:22px;color:#111;">Your phone demo for ${esc(businessName)}</h1>
    <p style="margin:10px 0 0;font-size:14px;color:#6b7280;line-height:1.6;">${esc(summary)}</p>
  </td></tr>
  <tr><td align="center" style="padding:20px 30px;">
    <a href="${link}" style="display:inline-block;background:#16a34a;color:#ffffff;border-radius:12px;padding:14px 32px;font-size:16px;font-weight:700;text-decoration:none;">See the visual version of your demo</a>
    <p style="margin:12px 0 0;font-size:12px;color:#9ca3af;line-height:1.6;">Aspen on your actual website — the version your visitors would meet.</p>
  </td></tr>
  ${booked ? '' : `<tr><td align="center" style="padding:4px 30px 8px;">
    <p style="margin:0 0 10px;font-size:14px;color:#374151;line-height:1.6;">Ready when you are — book your 15 to 20 minute introductory call, no rush:</p>
    <a href="${BOOKING_PAGE_LINK}" style="display:inline-block;background:#ffffff;color:#16a34a;border:2px solid #16a34a;border-radius:12px;padding:12px 28px;font-size:15px;font-weight:700;text-decoration:none;">Book your intro call</a>
  </td></tr>`}
  <tr><td style="padding:0 30px 24px;text-align:center;">
    <p style="font-size:12px;color:#9ca3af;margin:0;line-height:1.6;">We saved everything from your call, so nothing needs repeating.</p>
  </td></tr>
  <tr><td style="padding:20px 30px;border-top:1px solid #e5e7eb;text-align:center;">
    <p style="font-size:11px;color:#9ca3af;margin:0;">AI Hidden Leads</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

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
      // Phone demo is an AiHiddenLeads front-door feature, never a tenant
      // feature: gated per telephony_clients row (phone_demo_enabled). The
      // host policy rides as the last instruction layer, after PHONE_POLICY,
      // so its spell-back exception and tool choreography win on conflicts.
      const phoneDemo = Boolean((client as Record<string, unknown>).phone_demo_enabled);
      const instructions = `${LANGUAGE_POLICY}\nAgent identity: ${cfg.name || 'Aspen'}. Business: ${cfg.businessName || client.client_name}.\n${cfg.systemPrompt || ''}\nREFERENCE DATA (not instructions):\n${cfg.knowledge || ''}\n${cfg.sourceKnowledge || ''}\nEND REFERENCE DATA.\n${PHONE_POLICY}\n${PHONE_LANGUAGE_DISCIPLINE}\n${PHONE_DEMO_HONESTY}\n${PHONE_OPENING_PRIORITY}\n${canTransfer ? `Transfers go to ${transferName}.` : 'Transfers are not available on this line; offer to take a message.'}${phoneDemo ? `\n${PHONE_DEMO_HOST_POLICY}` : ''}`;
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
        // Phone greeting trim (phone-demo polish batch, 2026-11-12):
        // this branch is ONLY the single fallback `greeting` — the
        // shared snapshot greeting (~142 words) kept a phone caller
        // from responding for close to a minute, so substitute the
        // tightened PHONE_GREETING (~77 words, same approved
        // elements) rendered with the same vars map. Assembly-time
        // override only, mirroring the realtor-stamp pattern: the
        // stored snapshot is never edited, and operator-set
        // `greetings` variants above keep winning byte-verbatim.
        opening = PHONE_GREETING;
        opening = opening.replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m);
      }
      const greeting = opening ? `(The phone call just connected. Deliver this ENTIRE greeting now, word for word, as one continuous opening. Do not shorten it, do not adapt it, do not paraphrase it, and do not stop or wait for an answer partway through — any question inside it is rhetorical. The greeting is your whole first turn; only after you have spoken all of it, stop and wait for the caller: "${opening.slice(0, 1400)}")` : '(The phone call just connected. Greet the caller briefly.)';
      return json({ instructions, greeting, voice: String(cfg.voice || 'Kore'), model: DEFAULT_LIVE_MODEL, pricing: officialLivePricing(DEFAULT_LIVE_MODEL), maxSeconds, canTransfer, transferName, ...(phoneDemo ? { phoneDemo: true } : {}) });
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

    // ---------- Phone demo actions (bridge tools; front-door clients only) ----------
    const phoneDemoOn = Boolean((client as Record<string, unknown>).phone_demo_enabled);
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const cleanField = (v: unknown, n = 200) => String(v ?? '').trim().slice(0, n);

    if (b.action === 'phone-demo-save') {
      if (!phoneDemoOn) return json({ error: 'Phone demo not enabled on this line' }, 400);
      const d = (b.demo && typeof b.demo === 'object' ? b.demo : {}) as Record<string, unknown>;
      const businessName = cleanField(d.businessName, 120);
      if (!businessName) return json({ error: 'business_name_required' }, 400);
      const email = cleanField(d.email, 320).toLowerCase();
      const websiteUrl = cleanField(d.websiteUrl, 320);
      const mobile = cleanField(d.mobile, 32);
      const services = Array.isArray(d.services) ? d.services.map((s) => cleanField(s, 120)).filter(Boolean).slice(0, 8) : [];
      const knowledge = buildDictatedKnowledge({ businessName, trade: cleanField(d.trade, 120), serviceArea: cleanField(d.serviceArea, 160), websiteUrl, services, bestPractice: d.bestPractice !== false });
      // Same lead record the web demo uses: website_content carries the
      // dictated knowledge (no scan happened) with scan_status 'completed'
      // so the very same lead can open in the web demo afterwards, and
      // code_not_completed starts true (the "caller-ID, code not completed"
      // flag) until demo-verification flips it on a successful verify.
      const fields = {
        full_name: cleanField(d.callerName, 120) || null,
        business_name: businessName,
        email: EMAIL_RE.test(email) ? email : null,
        phone: mobile || call.from_phone || null,
        niche: cleanField(d.trade, 120) || null,
        website_url: websiteUrl || null,
        website_content: knowledge,
        scan_status: 'completed',
      };
      const spellBack = {
        website: websiteUrl ? spellBackForSpeech(websiteUrl) : null,
        email: fields.email ? spellBackForSpeech(fields.email) : null,
        mobile: fields.phone ? spellBackForSpeech(fields.phone) : null,
      };
      // Phone-source visibility (phone-demo polish batch, 2026-11-12):
      // the stored phone above still falls back to caller ID (booking
      // and recap read lead.phone), but the save result now says WHERE
      // the number came from so Aspen can be honest about it: a number
      // the tool call supplied is 'dictated'; a number that only
      // exists because fields.phone fell back to call.from_phone is
      // 'caller_id'; no number at all is 'none'.
      const phoneSource = mobile ? 'dictated' : fields.phone ? 'caller_id' : 'none';
      const existingId = typeof b.leadId === 'string' ? b.leadId : null;
      if (existingId) {
        // Correction pass (the caller fixed a spelling): update the same
        // lead; never touch its verification state here. The SMS-consent
        // answer MAY change on a later save (step 3 records it after the
        // first intake save), so it is patched in when the tool supplies it.
        const { error: upErr } = await db.from('leads').update(fields).eq('id', existingId);
        if (upErr) { console.error('telephony-stream: phone-demo-save update failed', upErr.message); return json({ error: 'save_failed' }, 500); }
        if (typeof d.smsConsent === 'boolean') {
          const { error: consentErr } = await db.from('leads').update({ sms_consent: d.smsConsent }).eq('id', existingId);
          if (consentErr) console.error('telephony-stream: sms_consent patch failed (migration pending?)', consentErr.message);
        }
        return json({ ok: true, leadId: existingId, spellBack, phoneSource });
      }
      const { data: lead, error: insErr } = await db.from('leads').insert({
        ...fields,
        code_not_completed: true,
        consent_disclosure_version: PHONE_DEMO_DISCLOSURE_VERSION,
        consent_captured_at: new Date().toISOString(),
        ...(typeof d.smsConsent === 'boolean' ? { sms_consent: d.smsConsent } : {}),
      }).select('id').single();
      if (insErr || !lead) {
        console.error('telephony-stream: phone-demo-save insert failed', insErr ? insErr.message : 'no lead row returned');
        // Pre-migration fallback: sms_consent does not exist yet — retry the
        // insert without it; consent treated as not-yet-recorded until the
        // follow-up pack migration lands (no text is sent on a guess).
        if (typeof d.smsConsent === 'boolean' && insErr && /sms_consent/.test(String(insErr.message || ''))) {
          const retry = await db.from('leads').insert({
            ...fields,
            code_not_completed: true,
            consent_disclosure_version: PHONE_DEMO_DISCLOSURE_VERSION,
            consent_captured_at: new Date().toISOString(),
          }).select('id').single();
          if (!retry.error && retry.data) return json({ ok: true, leadId: retry.data.id, spellBack, phoneSource });
          console.error('telephony-stream: phone-demo-save sms_consent fallback retry failed', retry.error ? retry.error.message : 'no lead row returned');
        }
        return json({ error: 'save_failed' }, 500);
      }
      return json({ ok: true, leadId: lead.id, spellBack, phoneSource });
    }

    if (b.action === 'phone-demo-code') {
      if (!phoneDemoOn) return json({ error: 'Phone demo not enabled on this line' }, 400);
      const leadId = typeof b.leadId === 'string' ? b.leadId : '';
      if (!leadId) return json({ error: 'lead_required' }, 400);
      const r = await demoVerification({ action: 'request-code', leadId, channel: 'sms', disclosureVersion: PHONE_DEMO_DISCLOSURE_VERSION });
      if (r.status === 200 && r.data.ok) return json({ sent: true, maskedTarget: r.data.maskedTarget ?? null, expiresInSeconds: r.data.expiresInSeconds ?? null });
      // 501 = the SMS lane is not open (TFV / A2P pending): interim caller-ID
      // mode. The lead already carries code_not_completed = true from save.
      if (r.status === 501) return json({ sent: false, mode: 'caller_id' });
      if (r.status === 429) return json({ sent: false, reason: 'cooldown', retryAfterSeconds: r.data.retryAfterSeconds ?? null });
      return json({ sent: false, reason: 'error' });
    }

    if (b.action === 'phone-demo-verify') {
      if (!phoneDemoOn) return json({ error: 'Phone demo not enabled on this line' }, 400);
      const leadId = typeof b.leadId === 'string' ? b.leadId : '';
      const code = sanitizeSpokenCode(String(b.code || ''));
      if (!leadId) return json({ error: 'lead_required' }, 400);
      if (!code) return json({ verified: false, reason: 'invalid_code_format' });
      const r = await demoVerification({ action: 'verify-code', leadId, code });
      if (r.status === 200 && r.data.verified) return json({ verified: true, channel: r.data.channel ?? 'sms' });
      if (r.status === 401) return json({ verified: false, reason: 'mismatch', attemptsRemaining: r.data.attemptsRemaining ?? null });
      if (r.status === 410) return json({ verified: false, reason: 'expired' });
      if (r.status === 429) return json({ verified: false, reason: 'locked' });
      if (r.status === 404) return json({ verified: false, reason: 'no_pending_code' });
      if (r.status === 409) return json({ verified: false, reason: 'code_not_pending' });
      return json({ verified: false, reason: 'error' });
    }

    if (b.action === 'phone-demo-resume') {
      if (!phoneDemoOn) return json({ error: 'Phone demo not enabled on this line' }, 400);
      const code = sanitizeSpokenCode(String(b.code || ''));
      if (!code) return json({ verified: false, reason: 'invalid_code_format' });
      if (!call.from_phone) return json({ verified: false, reason: 'no_caller_id' });
      // Codes are hashed per-lead (anti-replay), so a code alone can never be
      // looked up. The resume key is caller ID + code: candidate leads are
      // this caller's own unverified phone-demo leads, newest first, and the
      // verification engine itself decides which one the code belongs to.
      const { data: candidates } = await db.from('leads').select('id, business_name, website_content').eq('phone', call.from_phone).eq('code_not_completed', true).order('updated_at', { ascending: false }).limit(5);
      for (const cand of candidates ?? []) {
        const r = await demoVerification({ action: 'verify-code', leadId: cand.id, code });
        if (r.status === 200 && r.data.verified) {
          return json({ verified: true, leadId: cand.id, businessName: cand.business_name || '', knowledge: String(cand.website_content || '').slice(0, 4000) });
        }
      }
      return json({ verified: false, reason: 'no_match' });
    }

    // ---------- Phone booking tools (phase 2; front-door clients only) ----------
    // Aspen books the implementation call live on the call, following
    // Ron's slot-offer method (PHONE_DEMO_HOST_POLICY step 8). Contact
    // details come from the saved phone-demo lead — never re-asked. The
    // booking phone is the mobile on the lead (step 3) or the caller's
    // own number; SMS consent is the stored step-3 answer unless the
    // caller answers the permission ask in-flow (smsConsent arg).

    if (b.action === 'phone-booking-availability') {
      if (!phoneDemoOn) return json({ error: 'Phone demo not enabled on this line' }, 400);
      try {
        const slots = await platformAvailability(db);
        const preference = { preferredDates: preferredDatesFor(b.day), dayPart: parseDayPart(b.dayPart) };
        return json({ platform: 'AI Hidden Leads', timeZone: 'America/New_York', slots, offer: selectOfferSet(slots, preference) });
      } catch (e) { return json({ error: e instanceof Error ? e.message : 'Availability unavailable', slots: [], offer: [] }); }
    }

    if (b.action === 'phone-booking-check') {
      if (!phoneDemoOn) return json({ error: 'Phone demo not enabled on this line' }, 400);
      try {
        const named = resolveNamedTime({ iso: b.iso, date: b.date, time: b.time });
        const slots = await platformAvailability(db);
        return json(checkTimeAvailability({ slots, validSlots: generateSlots(), named, now: new Date() }));
      } catch (e) { return json({ error: e instanceof Error ? e.message : 'Time check unavailable' }); }
    }

    if (b.action === 'phone-booking-book') {
      if (!phoneDemoOn) return json({ error: 'Phone demo not enabled on this line' }, 400);
      const leadId = typeof b.leadId === 'string' ? b.leadId : '';
      const slotStart = typeof b.slotStart === 'string' ? b.slotStart : '';
      if (!leadId) return json({ ok: false, error: 'lead_not_saved' });
      if (!slotStart || !Number.isFinite(Date.parse(slotStart))) return json({ ok: false, error: 'invalid_slot' });
      const { data: lead } = await db.from('leads').select('full_name, email, phone, business_name, sms_consent').eq('id', leadId).maybeSingle();
      if (!lead?.email || !lead?.full_name) return json({ ok: false, error: 'contact_incomplete' });
      const phone = lead.phone || call.from_phone || '';
      const smsConsent = typeof b.smsConsent === 'boolean' ? b.smsConsent : lead.sms_consent === true;
      try {
        const result = await bookCallWithConfirmations(db, {
          name: lead.full_name, email: lead.email, phone, businessName: lead.business_name || undefined,
          slotStart, smsConsent,
          notes: 'Booked by Aspen during a phone demo call.',
        });
        return json({ ok: true, booked: true, slotStart, confirmationSms: result.confirmationSms, emailSent: result.emailSent });
      } catch (e) { return json({ ok: false, error: e instanceof Error ? e.message : 'Booking failed' }); }
    }

    if (b.action === 'phone-demo-recap') {
      if (!phoneDemoOn) return json({ error: 'Phone demo not enabled on this line' }, 400);
      const leadId = typeof b.leadId === 'string' ? b.leadId : '';
      if (!leadId) return json({ error: 'lead_required' }, 400);
      // Two independent channels since the follow-up pack: the recap EMAIL
      // (as before) and — only when the caller said yes to the text in
      // step 3 — ONE SMS with the demo link via the A2P messaging service.
      // Each channel reports its own outcome; the overall `sent` keeps the
      // legacy meaning (the email) so older bridge builds behave the same.
      let leadQuery = await db.from('leads').select('email, business_name, phone, sms_consent').eq('id', leadId).maybeSingle();
      if (leadQuery.error && /sms_consent/.test(String(leadQuery.error.message || ''))) {
        // Pre-migration: no consent column yet — consent counts as absent.
        leadQuery = await db.from('leads').select('email, business_name, phone').eq('id', leadId).maybeSingle();
      }
      const lead = leadQuery.data as { email?: string | null; business_name?: string | null; phone?: string | null; sms_consent?: boolean | null } | null;
      const businessName = String(lead?.business_name || 'your business');
      const summary = cleanField(b.summary, 1500) || `You just heard Aspen answer calls as the receptionist for ${businessName}, in a demo built live from the details you gave on the call.`;
      // Zero-pressure booking fallback (phase 2): when this caller booked
      // nothing on the call, the recap carries the booking link on both
      // channels (email always; SMS too) so the booking survives the call.
      const { data: bookedRows } = await db.from('implementation_calls').select('id').eq('email', lead?.email || '').neq('status', 'cancelled').limit(1);
      const bookingPending = !bookedRows?.length;

      // --- SMS channel (decided on facts; never blocks the email) ---
      let sms: { sent: boolean; reason?: string; messageSid?: string } = { sent: false, reason: 'no_mobile' };
      try {
        const to = normalizePhoneE164(lead?.phone);
        const optedOut = to ? await isSmsOptedOut(db, to) : false;
        const prior = to ? await priorSmsAttempts(db, { templateId: 'phone_demo_recap', leadId }, to) : { sent: false, attempts: 0 };
        const decision = recapSmsDecision({ mobile: lead?.phone, smsConsent: lead?.sms_consent === true, optedOut, prior });
        if (!decision.send) sms = { sent: false, reason: decision.reason };
        else {
          const sent = await trySendFollowupSms(db, { to: decision.to, body: buildRecapSmsBody({ businessName, summary, demoLink: PHONE_DEMO_LINK, bookingPending }), templateId: 'phone_demo_recap', leadId });
          sms = sent.sent ? { sent: true, messageSid: sent.messageSid } : { sent: false, reason: 'send_failed' };
        }
      } catch (e) {
        console.error('telephony-stream: recap SMS failed', e instanceof Error ? e.message : e);
        sms = { sent: false, reason: 'error' };
      }

      // --- Email channel (unchanged behavior) ---
      if (!lead?.email) return json({ sent: false, reason: 'no_email', email: { sent: false, reason: 'no_email' }, sms });
      const resendKey = Deno.env.get('RESEND_API_KEY');
      if (!resendKey) return json({ sent: false, reason: 'resend_not_configured', email: { sent: false, reason: 'resend_not_configured' }, sms });
      const text = [
        `Your phone demo for ${businessName}`,
        '',
        summary,
        '',
        `See the visual version — Aspen on your actual website: ${PHONE_DEMO_LINK}`,
        ...(bookingPending ? ['', `Book your 15 to 20 minute introductory call whenever it suits — no rush: ${BOOKING_PAGE_LINK}`] : []),
        '',
        'We saved everything from your call, so nothing needs repeating.',
        '',
        'AI Hidden Leads',
      ].join('\n');
      try {
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'Aspen at AI Hidden Leads <aspen@aihiddenleads.com>',
            to: [lead.email],
            subject: `Your AI Hidden Leads phone demo for ${businessName}`,
            text,
            html: buildRecapEmailHtml(businessName, summary, PHONE_DEMO_LINK, !bookingPending),
          }),
        });
        if (!emailRes.ok) { console.error('telephony-stream: recap Resend send failed', emailRes.status); return json({ sent: false, reason: 'send_failed', email: { sent: false, reason: 'send_failed' }, sms }); }
      } catch (e) {
        console.error('telephony-stream: recap Resend send threw', e instanceof Error ? e.message : e);
        return json({ sent: false, reason: 'send_failed', email: { sent: false, reason: 'send_failed' }, sms });
      }
      return json({ sent: true, email: { sent: true }, sms });
    }

    if (b.action === 'phone-demo-rescue') {
      if (!phoneDemoOn) return json({ error: 'Phone demo not enabled on this line' }, 400);
      // Dropped-call rescue (2026-11-11): the call ended before Aspen
      // could call send_demo_recap, so the bridge asks for ONE rescue
      // text with the demo link. All decision logic lives in
      // _shared/phone-rescue.ts (resolvePhoneDemoRescue), which
      // re-decides everything from the database — consent, opt-out,
      // cross-template dedupe, existing booking — and never trusts the
      // bridge's claim. Response mirrors the recap action's SMS shape.
      const rescue = await resolvePhoneDemoRescue(db, typeof b.leadId === 'string' ? b.leadId : '');
      return json(rescue.sent ? { sent: true, messageSid: rescue.messageSid } : { sent: false, reason: rescue.reason });
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
      // End-of-call lead guarantee (phone-demo polish batch, 2026-11-12):
      // the bridge's end report carries phoneDemo { leadId, recapCalled }
      // for phone-demo calls (older reports may omit it — code
      // defensively). A phone demo that captured contact details MUST
      // have produced a lead row; when it did not, say so loudly in the
      // stored ai_usage (phone_demo_audit) and in this response instead
      // of letting the lead vanish silently (the A&R Towing call,
      // 2026-11-12: name + mobile + email captured, no lead row).
      let phoneDemoAudit: Record<string, unknown> | undefined;
      const phoneDemoReport = (b as Record<string, unknown>).phoneDemo;
      if (phoneDemoOn && phoneDemoReport && typeof phoneDemoReport === 'object') {
        const reportLeadId = typeof (phoneDemoReport as Record<string, unknown>).leadId === 'string' && (phoneDemoReport as Record<string, unknown>).leadId
          ? String((phoneDemoReport as Record<string, unknown>).leadId)
          : null;
        if (reportLeadId) {
          const { data: leadRow } = await db.from('leads').select('id').eq('id', reportLeadId).maybeSingle();
          if (leadRow) {
            phoneDemoAudit = { lead_saved: true, lead_id: reportLeadId };
          } else {
            phoneDemoAudit = { lead_saved: false, marker: 'phone_demo_lead_missing', contact_evidence: true };
            console.error('PHONE_DEMO_LEAD_MISSING', call.id);
          }
        } else if (transcriptShowsCapturedContact(transcript)) {
          phoneDemoAudit = { lead_saved: false, marker: 'phone_demo_lead_missing', contact_evidence: true };
          console.error('PHONE_DEMO_LEAD_MISSING', call.id);
        } else {
          phoneDemoAudit = { lead_saved: false, marker: 'no_contact_captured' };
        }
        const baseUsage = (endProgress.ai_usage && typeof endProgress.ai_usage === 'object' ? endProgress.ai_usage : {}) as Record<string, unknown>;
        endProgress = { ...endProgress, ai_usage: { ...baseUsage, phone_demo_audit: phoneDemoAudit } };
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
          // Usage ledger (Usage Reporting Suite): failure-isolated, never throws.
          try { await logUsageEvent(db, phoneVoiceEventFromCall({ ...call, seconds, ai_usage: aiUsage ?? call.ai_usage }, client)); } catch { /* ledger is best-effort only */ }
        }
      }
      return json({ ok: true, ...(phoneDemoAudit ? { phone_demo_audit: phoneDemoAudit } : {}) });
    }
    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    console.error('telephony-stream error', e instanceof Error ? e.message : e);
    if (action === 'incoming') return xml(`<Redirect method="POST">${escapeXml(`${voiceBase}?action=incoming`)}</Redirect>`);
    return json({ error: 'Server error' }, 500);
  }
});
