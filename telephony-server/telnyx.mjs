// Telnyx Call Control adapter for the Aspen phone bridge (see
// ~/workspace/telnyx-adapter/SCOPE.md). Telnyx-only concerns live here so the
// Twilio path in server.mjs is untouched: Ed25519 webhook verification, the
// Call Control REST client, webhook dispatch, the media-WebSocket session
// (a sibling of the Twilio handler — codec.mjs and the backend contract are
// shared unchanged), and the bridge-executed warm transfer
// (Dial + speak whisper + gather press-1 + Bridge, SCOPE §3.5).
//
// The bridge stays dumb about tenants (telephony-server/AGENTS.md): prompts,
// greetings, caps and the transfer target come from the telephony-stream
// backend via the shared-secret api() helper injected by server.mjs. For
// Telnyx rows the backend `transfer` action returns the saved destination
// with mode 'bridge-executed' instead of rewriting a live call — the carrier
// commands below are issued from here because they need call-leg timing the
// backend cannot own.
import crypto from 'node:crypto';
import { WebSocket } from 'ws';
import { twilioToGemini, geminiToTwilio, audioEstimate } from './codec.mjs';
import { createLatencyTracker } from './latency.mjs';

const GEMINI_WS_DEFAULT = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
const MAX_RECONNECTS = 5, CHECKPOINT_MS = 15000, SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000;
const STREAM_FALLBACK_MS = 3000, TRANSFER_DIAL_TIMEOUT_SEC = 25, TRANSFER_ATTEMPT_MS = 40000, TRANSFER_FALLBACK_HANGUP_MS = 9000;

// ---------- Phone-demo polish batch (2026-11-12): dead-air + observability ----------
// Speech detection for the conversational-latency tracker: RMS over the
// decoded PCM16 samples of one inbound frame. 250 on the int16 scale is a
// conservative floor for mu-law-decoded phone audio — comfort noise and
// line silence sit at ~0–30, while even soft speech peaks in the thousands
// (RMS well above 250) — so borderline room noise never counts as speech.
export const SPEECH_RMS_THRESHOLD = 250;
/** RMS amplitude of a base64 PCM16 (little-endian) buffer; 0 when empty. */
export function pcm16Base64Rms(b64) {
  try {
    const buf = Buffer.from(String(b64 || ''), 'base64');
    const n = Math.floor(buf.length / 2);
    if (!n) return 0;
    let sum = 0;
    for (let i = 0; i < n; i++) { const v = buf.readInt16LE(i * 2); sum += v * v; }
    return Math.sqrt(sum / n);
  } catch { return 0; }
}
export const isSpeechPcm16 = (b64) => pcm16Base64Rms(b64) > SPEECH_RMS_THRESHOLD;

// Anti-dead-air filler: a phone-demo/booking tool still pending this long
// with no outbound audio since it started gets ONE injected acknowledgement.
export const FILLER_DELAY_MS = 900;
export const TOOL_FILLER_NOTE = '(System note: a tool you called is still running and the caller has heard only silence so far. Say exactly one brief, non-committal line now, like: "Got it — one moment while I save that." Do not claim anything has been saved, sent, verified or booked — the tool result has not come back yet.)';

// Silence watchdog: checked once a second while a Gemini session is open.
// The 4500 ms threshold is deliberately ABOVE the intentional ~3 s STEP-6
// role-switch pause in the phone-demo script: that pause must never trigger
// a check-in, and Aspen's in-role greeting right after it resets
// lastOutboundAt anyway. After a fire, refires are suppressed for 20 s and
// capped at 2 per call so a genuinely thinking/paused caller is not nagged.
export const WATCHDOG_INTERVAL_MS = 1000;
export const WATCHDOG_SILENCE_MS = 4500;
export const WATCHDOG_REFIRE_SUPPRESS_MS = 20000;
export const WATCHDOG_MAX_FIRES = 2;
export const WATCHDOG_CHECKIN_NOTE = '(System note: the caller has gone quiet and you have not spoken for a while. Check in once, briefly and warmly — say something like: "I\'m still here — take your time." If you were waiting for their answer to a question, you may gently repeat that question instead. Do not add new offers, claims or content.)';
/**
 * Pure watchdog decision (unit-tested without sockets). Fires only when
 * EVERY condition holds: session live and not transferring, the opening
 * gate is open, no tool is pending, the caller has spoken at least once,
 * and BOTH Aspen and the caller have been silent for >= WATCHDOG_SILENCE_MS
 * — plus the per-call refire suppression / cap.
 */
export function watchdogShouldFire(state, now) {
  if (!state || state.ended || state.transferring) return false;
  if (!state.gateOpen) return false;
  if ((state.pendingTools || 0) > 0) return false;
  if (!state.callerSpoke) return false;
  if (state.lastOutboundAt == null || state.lastCallerSpeechAt == null) return false;
  if (now - state.lastOutboundAt < WATCHDOG_SILENCE_MS) return false;
  if (now - state.lastCallerSpeechAt < WATCHDOG_SILENCE_MS) return false;
  if ((state.watchdogFires || 0) >= WATCHDOG_MAX_FIRES) return false;
  if (state.lastWatchdogAt != null && now - state.lastWatchdogAt < WATCHDOG_REFIRE_SUPPRESS_MS) return false;
  return true;
}

// Endpointing experiment knob (item 8): PHONE_VAD_SILENCE_MS, read once at
// adapter creation. A measured A/B knob — judged by convTurnLatency +
// digit-capture accuracy on scripted test calls — NOT a default change:
// anything that does not parse to an integer in [700, 1500] falls back to
// exactly the production 1000 ms chosen on 2026-11-08.
export const PHONE_VAD_DEFAULT_MS = 1000;
export function parsePhoneVadSilenceMs(raw) {
  if (raw == null || String(raw).trim() === '') return { ms: PHONE_VAD_DEFAULT_MS, overridden: false };
  const n = Number(raw);
  if (Number.isInteger(n) && n >= 700 && n <= 1500) return { ms: n, overridden: true };
  return { ms: PHONE_VAD_DEFAULT_MS, overridden: false };
}

// Tool-call timing records (stored on the session, shipped in the end
// callReport as `tools`). `ok` means the execution completed with a backend
// answer — business outcomes (sent / verified / bookable) ride inside the
// tool result itself, not in this flag.
export function createToolCallRecord(name, action, startedAt = Date.now()) {
  return { name, action, startedAt, durationMs: 0, ok: false };
}
export function finishToolCallRecord(record, ok, endedAt = Date.now()) {
  record.durationMs = Math.max(0, endedAt - record.startedAt);
  record.ok = Boolean(ok);
  return record;
}

/** Outbound media frame: NO stream id field (one stream per socket; SCOPE §3.3). */
export const telnyxMediaFrame = (payload) => ({ event: 'media', media: { payload } });

// ---------- Phone demo tools (front-door lines; config-gated) ----------
// The bridge stays dumb about the demo (telephony-server/AGENTS.md): the
// declarations below only name the tools and their argument shapes. All
// state, knowledge building, verification and sending live in the
// telephony-stream backend, reached through the same report() contract as
// the transfer. Tools are declared only when the backend start response
// carries phoneDemo: true, and every tool's spoken claim waits for the
// backend's real result — Aspen never announces a save, code, verification
// or email the backend did not confirm.
export const PHONE_DEMO_TOOL_ACTIONS = {
  save_phone_demo_lead: 'phone-demo-save',
  send_demo_code: 'phone-demo-code',
  check_demo_code: 'phone-demo-verify',
  resume_demo_by_code: 'phone-demo-resume',
  send_demo_recap: 'phone-demo-recap',
};

/** Booking tools (phase 2) ride the same declarations + dispatch as the
 * demo tools but map to phone-booking-* backend actions. */
export const PHONE_BOOKING_TOOL_ACTIONS = {
  get_availability: 'phone-booking-availability',
  check_time: 'phone-booking-check',
  book_call: 'phone-booking-book',
};

export const PHONE_TOOL_ACTIONS = { ...PHONE_DEMO_TOOL_ACTIONS, ...PHONE_BOOKING_TOOL_ACTIONS };

export function phoneDemoToolDeclarations() {
  return [
    { name: 'save_phone_demo_lead', description: 'Save (or correct) the phone-demo lead from what the caller dictated. Call it once the intake details are collected, and again with corrected values when the caller fixes a spelling. The result carries spellBack text for the website, email and mobile — read those back to the caller word for word for confirmation.', parameters: { type: 'OBJECT', properties: {
      callerName: { type: 'STRING', description: "The caller's own name." },
      businessName: { type: 'STRING', description: 'The business name, as dictated.' },
      trade: { type: 'STRING', description: 'What the business does (its trade).' },
      serviceArea: { type: 'STRING', description: 'City / service area the business covers.' },
      websiteUrl: { type: 'STRING', description: 'The website address the caller dictated, or empty when they have no website.' },
      services: { type: 'ARRAY', items: { type: 'STRING' }, description: 'The main services the caller listed (used when there is no website).' },
      bestPractice: { type: 'BOOLEAN', description: 'True when the caller accepted best-practice fills for hours, emergencies and service area; false when they asked to stick strictly to what they stated.' },
      email: { type: 'STRING', description: "The caller's email address, as dictated." },
      mobile: { type: 'STRING', description: "The mobile number the demo link should be texted to (may be the number they are calling from)." },
      smsConsent: { type: 'BOOLEAN', description: "The caller's answer to the texting-permission ask — true only when they explicitly agreed to receive the demo-link text; false when they declined. Omit until the permission has been asked (the step 3 save carries the answer)." },
    }, required: ['businessName'] } },
    { name: 'send_demo_code', description: 'Text the 4-digit demo verification code to the saved mobile. Only say a code was sent when the result says sent is true; when it returns mode caller_id, texting is not switched on for this line yet and the demo proceeds on caller ID.', parameters: { type: 'OBJECT', properties: {} } },
    { name: 'check_demo_code', description: 'Check the 4-digit code the caller read back. Only say the caller is verified when the result says verified is true.', parameters: { type: 'OBJECT', properties: { code: { type: 'STRING', description: 'The 4 digits the caller read back.' } }, required: ['code'] } },
    { name: 'resume_demo_by_code', description: 'On a callback, resume an earlier phone demo: the caller gives the 4-digit code from the previous call. On verified true the result carries their saved business details so the demo can continue.', parameters: { type: 'OBJECT', properties: { code: { type: 'STRING', description: 'The 4-digit code from the earlier call.' } }, required: ['code'] } },
    { name: 'send_demo_recap', description: 'Email the caller the demo recap and the visual demo link at the saved email address. Only say the email was sent when the result says sent is true.', parameters: { type: 'OBJECT', properties: { summary: { type: 'STRING', description: 'Two or three sentences on what the demo covered: what Aspen answered as their receptionist and what the caller tried.' } }, required: ['summary'] } },
    { name: 'get_availability', description: 'Read REAL AI Hidden Leads sales-calendar availability for booking the implementation call live on this call. Returns the raw slots plus an offer set of up to 3 (each with spokenLabel and one marked recommended) already picked per the slot-offer method. Offer ONLY slots from this result — never invent a time. Call it after the caller answers the preference question.', parameters: { type: 'OBJECT', properties: { day: { type: 'STRING', enum: ['today', 'tomorrow', 'day_after'], description: "The caller's stated day preference from the preference-first ask." }, dayPart: { type: 'STRING', enum: ['morning', 'midday', 'afternoon', 'evening'], description: "The caller's stated part of day, if any." } } } },
    { name: 'check_time', description: 'Check the exact time the CALLER named for the implementation call. Returns bookable true with the slot, or bookable false with a reason and the nearest real alternatives. Never offer a time this tool did not return.', parameters: { type: 'OBJECT', properties: { date: { type: 'STRING', description: 'ET calendar date the caller named, YYYY-MM-DD.' }, time: { type: 'STRING', description: 'ET wall time the caller named, e.g. "2:30 PM".' }, iso: { type: 'STRING', description: 'Full ISO datetime instead of date+time, when known.' } } } },
    { name: 'book_call', description: 'Book the AI Hidden Leads implementation call in an exact slot returned by get_availability or check_time, using the contact details already saved on this call — never re-ask for them. The result reports confirmationSms and emailSent per channel: only claim the channel the result confirms. Call it only after the caller said yes to that exact slot read back in full.', parameters: { type: 'OBJECT', properties: { slotStart: { type: 'STRING', description: 'The exact ISO slot from get_availability or check_time.' }, smsConsent: { type: 'BOOLEAN', description: "The caller's answer when the confirmation-text permission was asked in-flow; omit when the step 3 answer already stands." } }, required: ['slotStart'] } },
  ];
}
/** Outbound clear frame: flush queued playback on barge-in. */
export const telnyxClearFrame = () => ({ event: 'clear' });

/** Extract { token, callControlId } from a Telnyx media-WS `start` event. */
export function parseTelnyxStart(msg) {
  const params = msg?.start?.custom_parameters;
  let token = null;
  if (Array.isArray(params)) token = params.find(p => p?.name === 'token')?.value || null;
  else if (params && typeof params === 'object') token = params.token || null;
  return { token, callControlId: msg?.start?.call_control_id || null, streamId: msg?.stream_id || null };
}

function ed25519PublicKey(publicKeyB64) {
  const raw = Buffer.from(publicKeyB64, 'base64');
  // Telnyx shows a raw 32-byte Ed25519 key; Node wants SPKI DER — wrap it.
  if (raw.length === 32) return crypto.createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), raw]), format: 'der', type: 'spki' });
  return crypto.createPublicKey({ key: raw, format: 'der', type: 'spki' });
}

/**
 * Verify a Telnyx webhook signature (SCOPE §3.1): Ed25519 over
 * `timestamp + "|" + rawBody`, with a ±5 min timestamp tolerance.
 * (Telnyx signs with a PIPE separator — a "." here made every genuine
 * webhook fail verification; found live 2026-11-08, Ron's first 772 call.)
 * `keyObject` may be a pre-built KeyObject or a base64 public key.
 */
export function verifyTelnyxSignature(rawBody, signatureB64, timestamp, keyObject, nowMs = Date.now()) {
  try {
    if (!signatureB64 || !timestamp) return false;
    const tsSec = Number(timestamp);
    if (!Number.isFinite(tsSec) || Math.abs(nowMs - tsSec * 1000) > SIGNATURE_TOLERANCE_MS) return false;
    const key = keyObject && typeof keyObject === 'object' && keyObject.type === 'public' ? keyObject : ed25519PublicKey(String(keyObject || ''));
    const signed = Buffer.concat([Buffer.from(`${timestamp}|`), Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody))]);
    return crypto.verify(null, signed, key, Buffer.from(signatureB64, 'base64'));
  } catch { return false; }
}

export function createTelnyx({ api, env = process.env, onActiveChange = () => {}, fetchImpl = fetch }) {
  const apiKey = env.TELNYX_API_KEY || '';
  const connectionId = env.TELNYX_CONNECTION_ID || '';
  const streamWss = env.TELNYX_STREAM_WSS || 'wss://voice.aihiddenleads.com/telnyx/media';
  const webhookUrl = env.TELNYX_WEBHOOK_URL || streamWss.replace(/^wss:/, 'https:').replace(/\/telnyx\/media$/, '/telnyx/voice');
  const apiBase = (env.TELNYX_API_BASE || 'https://api.telnyx.com/v2').replace(/\/$/, '');
  const geminiWsUrl = env.GEMINI_WS_URL || GEMINI_WS_DEFAULT;
  const googleApiKey = env.GOOGLE_API_KEY || '';
  const vad = parsePhoneVadSilenceMs(env.PHONE_VAD_SILENCE_MS); // endpointing A/B knob; see parsePhoneVadSilenceMs
  let publicKey = null;
  try { if (env.TELNYX_PUBLIC_KEY) publicKey = ed25519PublicKey(env.TELNYX_PUBLIC_KEY); } catch (e) { console.error('telnyx: bad TELNYX_PUBLIC_KEY', e.message); }
  const enabled = Boolean(apiKey && publicKey);
  if (!enabled) console.log('telnyx: adapter disabled (TELNYX_API_KEY / TELNYX_PUBLIC_KEY not configured)');

  const sessions = new Map(); // leg-A call_control_id -> session
  const byToken = new Map(); // backend session token -> session
  const legB = new Map(); // transfer leg-B call_control_id -> session
  const seenEvents = new Set(); // webhook dedupe on data.id
  const pending = new Set(); // in-flight webhook processing (tests/drain)
  const track = (p) => { pending.add(p); p.finally(() => pending.delete(p)); return p; };
  const whenIdle = async () => { while (pending.size) await Promise.allSettled([...pending]); };

  // ---------- Telnyx Call Control REST ----------
  async function telnyxApi(path, body = {}) {
    const r = await fetchImpl(`${apiBase}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ command_id: crypto.randomUUID(), ...body }),
      signal: AbortSignal.timeout(10000),
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`telnyx ${path} [${r.status}] ${text}`);
    return text ? JSON.parse(text) : {};
  }
  // NOTE: no custom_parameters here — Telnyx's answer/streaming_start API
  // rejects the field outright (422, pointer /custom_parameters; found live
  // 2026-11-08 on Ron's second 772 call). The media session binds by
  // call_control_id first (handleConnection), so the token echo is unneeded.
  const streamParams = (token) => ({
    stream_url: streamWss, stream_track: 'inbound_track',
    stream_bidirectional_mode: 'rtp', stream_bidirectional_codec: 'PCMU',
  });
  const answerCall = (id, token) => telnyxApi(`/calls/${encodeURIComponent(id)}/actions/answer`, streamParams(token));
  const startStreaming = (id, token) => telnyxApi(`/calls/${encodeURIComponent(id)}/actions/streaming_start`, streamParams(token));
  const stopStreaming = (id) => telnyxApi(`/calls/${encodeURIComponent(id)}/actions/streaming_stop`, {});
  const hangupCall = (id) => telnyxApi(`/calls/${encodeURIComponent(id)}/actions/hangup`, {});
  // Transfer whisper voice (fix batch 2026-11-08): Telnyx's neural KokoroTTS
  // instead of the basic service-level 'female' — the stock voice sounded
  // robotic on Ron's 877 test call. Voice id format per the Telnyx speak API
  // reference (<Provider>.<Model>.<VoiceId>; 'Telnyx.KokoroTTS.af' is the
  // documented example, the Kokoro American-female voice).
  const WHISPER_VOICE = 'Telnyx.KokoroTTS.af';
  const speak = (id, payload) => telnyxApi(`/calls/${encodeURIComponent(id)}/actions/speak`, { payload, voice: WHISPER_VOICE, language: 'en-US' });
  const gatherSpeak = (id, payload) => telnyxApi(`/calls/${encodeURIComponent(id)}/actions/gather_using_speak`, { payload, voice: WHISPER_VOICE, language: 'en-US', valid_digits: '1', minimum_digits: 1, maximum_digits: 1 });
  const bridgeLegs = (legA, legBId) => telnyxApi(`/calls/${encodeURIComponent(legA)}/actions/bridge`, { call_control_id: legBId });

  // ---------- Session ----------
  function newSession(callControlId, payload) {
    const s = {
      callControlId, from: payload?.from || null, to: payload?.to || null,
      token: null, cfg: null, gemini: null, mediaWs: null, streamId: null,
      ended: false, counted: false, transferring: false, transferred: false,
      resumeHandle: null, reconnects: 0, inSec: 0, outSec: 0,
      gateOpen: false, gateTimer: null, limitTimer: null, cpTimer: null, streamFallbackTimer: null, fallbackTimer: null,
      phoneDemoLeadId: null, // set by the phone-demo tool flow once the backend saves the lead
      phoneDemoRecapCalled: false, // set when Aspen calls send_demo_recap; finish() fires the dropped-call rescue only when this stays false
      // Polish-batch state: prefetched start config (set in onInitiated),
      // per-tool timing records, dead-air guards and drop accounting.
      cfgPromise: null, toolCalls: [], pendingTools: 0, droppedFrames: 0,
      lastOutboundAt: null, lastCallerSpeechAt: null, outboundCount: 0, callerSpoke: false,
      watchdogTimer: null, watchdogFires: 0, lastWatchdogAt: null, fillerTimers: new Set(),
      transcript: [], latency: createLatencyTracker('telnyx'), transfer: null,
      // Dashboard call report transfer block: outcome is 'connected' only when
      // the Bridge command succeeds; connectMs = tool-call -> bridged.
      transferInfo: { attempted: false, outcome: 'not_attempted', connectMs: null, reason: null, startedAt: null },
      tInit: Date.now(),
    };
    s.latency.noteSetup('initiated', s.tInit);
    sessions.set(callControlId, s);
    return s;
  }
  const usageOf = (s) => ({ model: s.cfg?.model, input_audio_seconds: Math.round(s.inSec), output_audio_seconds: Math.round(s.outSec), audio_estimate_usd: audioEstimate(s.inSec, s.outSec, s.cfg?.pricing), cost_basis: 'published_audio_estimate_not_invoice' });
  const report = (s, action, extra = {}) => s.token && api({ action, token: s.token, transcript: s.transcript, usage: usageOf(s), reconnects: s.reconnects, ...extra });
  const sendTelnyx = (s, o) => { if (s.mediaWs?.readyState === WebSocket.OPEN) s.mediaWs.send(JSON.stringify(o)); };

  async function finish(s) {
    if (s.ended) return; s.ended = true;
    if (s.counted) { s.counted = false; onActiveChange(-1); }
    clearTimeout(s.limitTimer); clearInterval(s.cpTimer); clearTimeout(s.gateTimer); clearTimeout(s.streamFallbackTimer); clearTimeout(s.fallbackTimer);
    clearInterval(s.watchdogTimer);
    for (const t of s.fillerTimers) clearTimeout(t); s.fillerTimers.clear();
    if (s.transfer?.timer) clearTimeout(s.transfer.timer);
    try { s.gemini?.close(); } catch {}
    try { s.mediaWs?.close(); } catch {}
    sessions.delete(s.callControlId);
    if (s.token) byToken.delete(s.token);
    if (s.transfer?.legBId) legB.delete(s.transfer.legBId);
    // Telnyx has no carrier status callback: report the observed duration
    // (call.initiated -> now) so the backend `end` action can finalize the
    // row's seconds/usage for telnyx-stream rows (SCOPE §4.2). Billing truth
    // still reconciles from Telnyx's own CDRs.
    const durationSec = Math.max(0, Math.round((Date.now() - s.tInit) / 1000));
    // Transfer outcome reconciliation (fix batch 2026-11-08): a media-socket
    // close during the transfer handshake (acceptTransfer stops streaming
    // before it writes the outcome) can run finish() after the legs have
    // bridged (s.transferred) while transferInfo still says 'pending' — and
    // finish() is first-wins, so the end report shipped 'pending' forever on
    // a transferred_done call (Ron's 877 test call). The backend fold applies
    // the same rule from the row's side; never ship a stale 'pending' for a
    // transfer that did bridge.
    if (s.transferInfo.outcome === 'pending' && s.transferred) {
      s.transferInfo.outcome = 'connected';
      if (s.transferInfo.connectMs == null && s.transferInfo.startedAt) s.transferInfo.connectMs = Date.now() - s.transferInfo.startedAt;
    }
    const latency = s.latency.snapshot();
    if (s.droppedFrames > 0) console.log(`telnyx call ${s.callControlId}: ${s.droppedFrames} inbound media frames dropped while the Gemini socket was not OPEN`);
    // Symmetric per-call report for the provider comparison dashboard; the
    // Twilio path in server.mjs emits the identical shape. `tools` (per-tool
    // name/action/start/duration/ok) and `droppedFrames` are additive
    // Telnyx-side fields the backend stores inside the call_report JSON.
    const callReport = { provider: 'telnyx', transport: 'telnyx-stream', durationSec, greetingMs: latency.greetingMs, latency, droppedFrames: s.droppedFrames, tools: s.toolCalls, transfer: { attempted: s.transferInfo.attempted, outcome: s.transferInfo.outcome, connectMs: s.transferInfo.connectMs, reason: s.transferInfo.reason } };
    console.log(JSON.stringify({ telnyx_latency: latency }));
    console.log(JSON.stringify({ telnyx_call_report: callReport }));
    // Dropped-call rescue (2026-11-11): the call ended with a saved demo
    // lead but Aspen never called send_demo_recap (drop, hang-up, max
    // duration) — ask the backend for the ONE rescue text. The bridge
    // decides nothing: the backend re-checks consent, opt-out, prior
    // sends and bookings from the database before sending. Transferred
    // calls are excluded (the caller reached a human; a rescue text
    // would be wrong). Fire-and-forget, fired BEFORE the awaited end
    // report so the rescue decision never waits on — and can never
    // block or break — the end-of-session path.
    if (s.phoneDemoLeadId && !s.phoneDemoRecapCalled && !s.transferred) {
      report(s, 'phone-demo-rescue', { leadId: s.phoneDemoLeadId })?.catch(e => console.error('telnyx rescue failed', e.message));
    }
    // End-of-call lead audit contract for the backend workstream: on
    // phone-demo calls the end report carries exactly
    // phoneDemo: { leadId, recapCalled }; omitted on all other calls.
    await report(s, 'end', { durationSec, latency, callReport, ...(s.cfg?.phoneDemo ? { phoneDemo: { leadId: s.phoneDemoLeadId ?? null, recapCalled: s.phoneDemoRecapCalled } } : {}) })?.catch(e => console.error('telnyx end failed', e.message));
  }

  // ---------- Silence watchdog ----------
  // One interval per call session (not per Gemini socket): it survives
  // reconnects and is cleared in finish(). The decision itself is the pure
  // exported watchdogShouldFire(); this wrapper only injects the check-in.
  function ensureWatchdog(s) {
    if (s.watchdogTimer) return;
    s.watchdogTimer = setInterval(() => {
      if (s.ended) return;
      const now = Date.now();
      if (!watchdogShouldFire({ ended: s.ended, transferring: s.transferring, gateOpen: s.gateOpen, pendingTools: s.pendingTools, callerSpoke: s.callerSpoke, lastOutboundAt: s.lastOutboundAt, lastCallerSpeechAt: s.lastCallerSpeechAt, watchdogFires: s.watchdogFires, lastWatchdogAt: s.lastWatchdogAt }, now)) return;
      if (s.gemini?.readyState !== WebSocket.OPEN) return;
      s.watchdogFires++; s.lastWatchdogAt = now;
      console.log(`telnyx watchdog: check-in injected for call ${s.callControlId} (fire ${s.watchdogFires})`);
      s.gemini.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{ text: WATCHDOG_CHECKIN_NOTE }] }], turnComplete: true } }));
    }, WATCHDOG_INTERVAL_MS);
    s.watchdogTimer.unref?.();
  }

  // ---------- Gemini session (sibling of the Twilio handler in server.mjs) ----------
  function openGemini(s, isResume) {
    if (isResume) s.gateOpen = true; // A resumed session already greeted; never re-gate.
    const cfg = s.cfg;
    const ws = new WebSocket(`${geminiWsUrl}?key=${googleApiKey}`);
    s.gemini = ws;
    const declarations = [];
    if (cfg.canTransfer) declarations.push({ name: 'transfer_call', description: `Warm-transfer the caller to ${cfg.transferName}. Say you are connecting them first.`, parameters: { type: 'OBJECT', properties: { summary: { type: 'STRING', description: 'One sentence for the person receiving the call: who is calling and why.' } }, required: ['summary'] } });
    if (cfg.phoneDemo) declarations.push(...phoneDemoToolDeclarations());
    ws.on('open', () => { ensureWatchdog(s); if (vad.overridden) console.log(`telnyx: PHONE_VAD_SILENCE_MS override active — silenceDurationMs=${vad.ms} (endpointing A/B experiment)`); ws.send(JSON.stringify({ setup: {
      model: `models/${cfg.model}`,
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: cfg.voice } } } },
      systemInstruction: { parts: [{ text: cfg.instructions }] },
      tools: declarations.length ? [{ functionDeclarations: declarations }] : [],
      // VAD tuning (fix batch 2026-11-08): HIGH start sensitivity let loud
      // ambient noise open false speech segments and chop soft, accented
      // speech into fragments (which fed the language-mirroring flips).
      // LOW requires stronger speech evidence; a longer silence window
      // (700 -> 1000 ms) stops mid-phrase chopping. Mirrors server.mjs.
      // silenceDurationMs comes from the PHONE_VAD_SILENCE_MS experiment
      // knob (default exactly 1000; see parsePhoneVadSilenceMs) — no other
      // VAD parameter is knobbed.
      realtimeInputConfig: { automaticActivityDetection: { disabled: false, startOfSpeechSensitivity: 'START_SENSITIVITY_LOW', endOfSpeechSensitivity: 'END_SENSITIVITY_LOW', prefixPaddingMs: 200, silenceDurationMs: vad.ms } },
      sessionResumption: s.resumeHandle ? { handle: s.resumeHandle } : {},
      contextWindowCompression: { slidingWindow: {} },
      inputAudioTranscription: {}, outputAudioTranscription: {},
    } })); });
    ws.on('message', (data) => {
      if (ws !== s.gemini) return;
      const m = JSON.parse(data.toString());
      if (m.setupComplete) {
        if (!isResume) ws.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{ text: cfg.greeting }] }], turnComplete: true } }));
        return;
      }
      if (m.sessionResumptionUpdate?.resumable && m.sessionResumptionUpdate.newHandle) s.resumeHandle = m.sessionResumptionUpdate.newHandle;
      if (m.goAway) { reconnect(s, 'go_away'); return; }
      const sc = m.serverContent;
      if (sc?.turnComplete && !s.gateOpen) { s.gateOpen = true; clearTimeout(s.gateTimer); }
      if (sc?.interrupted) { s.latency.noteInterrupted(); sendTelnyx(s, telnyxClearFrame()); }
      for (const part of sc?.modelTurn?.parts || []) if (part.inlineData?.data) {
        const payload = geminiToTwilio(part.inlineData.data);
        s.outSec += Buffer.byteLength(payload, 'base64') / 8000;
        const outAt = Date.now();
        s.lastOutboundAt = outAt; s.outboundCount++;
        // First outbound audio since a tool started cancels its dead-air
        // filler — Aspen is speaking, no bridge line is needed.
        if (s.fillerTimers.size) { for (const t of s.fillerTimers) clearTimeout(t); s.fillerTimers.clear(); }
        s.latency.noteOutbound(outAt);
        sendTelnyx(s, telnyxMediaFrame(payload)); // no stream id — SCOPE §3.3
      }
      if (sc?.inputTranscription?.text) { s.transcript.push({ role: 'caller', text: sc.inputTranscription.text }); s.callerSpoke = true; s.lastCallerSpeechAt = Date.now(); }
      if (sc?.outputTranscription?.text) s.transcript.push({ role: 'assistant', text: sc.outputTranscription.text });
      for (const call of m.toolCall?.functionCalls || []) {
        const demoAction = PHONE_TOOL_ACTIONS[call.name];
        if (demoAction && cfg.phoneDemo) {
          runPhoneDemoTool(s, ws, call, demoAction).catch(e => console.error('telnyx phone-demo tool failed', e.message));
          continue;
        }
        if (call.name !== 'transfer_call' || s.transferring) continue;
        s.transferring = true;
        // Tool timing record: transfer_call is answered optimistically, so
        // its record covers the invocation/answer; the dial outcome and
        // connect time live in transferInfo / callReport.transfer. It gets
        // NO dead-air filler — the optimistic answer is immediate.
        s.toolCalls.push(finishToolCallRecord(createToolCallRecord(call.name, 'transfer'), true));
        ws.send(JSON.stringify({ toolResponse: { functionResponses: [{ id: call.id, name: call.name, response: { ok: true } }] } }));
        // Let Aspen finish "connecting you now"; the bridge then executes the
        // warm transfer itself (the backend only returns the saved target).
        const summary = String(call.args?.summary || '').slice(0, 300);
        s.transferInfo = { attempted: true, outcome: 'pending', connectMs: null, reason: null, startedAt: Date.now() };
        setTimeout(() => { startTransfer(s, summary).catch(e => { s.transferring = false; if (s.transferInfo.outcome === 'pending') { s.transferInfo.outcome = 'failed'; s.transferInfo.reason = 'setup_failed'; } console.error('telnyx transfer failed', e.message); }); }, 2500);
      }
    });
    ws.on('close', () => { if (ws === s.gemini && !s.ended && !s.transferring) reconnect(s, 'closed'); });
    ws.on('error', (e) => console.error('telnyx gemini error', e.message));
  }

  // ---------- Phone demo tool execution ----------
  // Unlike the transfer (which answers optimistically and executes in the
  // background), phone-demo tools WAIT for the backend result before the
  // toolResponse goes back: Aspen's next spoken claim — saved, code sent,
  // verified, recap emailed — is only ever as true as that result.
  async function runPhoneDemoTool(s, ws, call, action) {
    const record = createToolCallRecord(call.name, action);
    s.toolCalls.push(record);
    s.pendingTools++;
    const respond = (response) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ toolResponse: { functionResponses: [{ id: call.id, name: call.name, response }] } })); };
    // Anti-dead-air filler (one-shot, at most ONE per tool call): if this
    // tool is still pending after FILLER_DELAY_MS and no outbound audio has
    // been sent since it started, queue ONE non-committal acknowledgement
    // as a clientContent note. The timer is cleared when the tool responds
    // (finally below) or on first outbound audio (the modelTurn loop), and
    // the fire-time outboundCount check double-guards the race. NOTE: this
    // guarantees an acknowledgement is QUEUED instead of bare silence —
    // whether Gemini voices it before or just after the tool result lands
    // can only be proven on a live call.
    const outboundCountAtStart = s.outboundCount;
    const fillerTimer = setTimeout(() => {
      s.fillerTimers.delete(fillerTimer);
      if (s.ended || ws.readyState !== WebSocket.OPEN) return;
      if (s.outboundCount !== outboundCountAtStart) return; // Aspen already spoke
      ws.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{ text: TOOL_FILLER_NOTE }] }], turnComplete: true } }));
    }, FILLER_DELAY_MS);
    fillerTimer.unref?.();
    s.fillerTimers.add(fillerTimer);
    try {
    const args = (call.args && typeof call.args === 'object') ? call.args : {};
    const str = (v) => (v == null ? '' : String(v));
    const extra = {};
    if (action === 'phone-demo-save') {
      extra.demo = {
        callerName: str(args.callerName), businessName: str(args.businessName), trade: str(args.trade),
        serviceArea: str(args.serviceArea), websiteUrl: str(args.websiteUrl),
        services: Array.isArray(args.services) ? args.services.map((v) => String(v)).slice(0, 8) : [],
        bestPractice: args.bestPractice !== false,
        email: str(args.email), mobile: str(args.mobile),
      };
      // The step-3 texting-permission answer rides inside demo (the backend
      // reads d.smsConsent); forward it only when the model actually
      // supplied a boolean, so an un-asked permission never overwrites a
      // stored answer — same guard as phone-booking-book's top-level field.
      if (typeof args.smsConsent === 'boolean') extra.demo.smsConsent = args.smsConsent;
      if (s.phoneDemoLeadId) extra.leadId = s.phoneDemoLeadId; // correction pass updates the same lead
    } else if (action === 'phone-demo-verify' || action === 'phone-demo-resume') {
      extra.code = str(args.code);
      if (action === 'phone-demo-verify') {
        if (!s.phoneDemoLeadId) return respond({ verified: false, reason: 'lead_not_saved' });
        extra.leadId = s.phoneDemoLeadId;
      }
    } else if (action === 'phone-demo-recap') {
      if (!s.phoneDemoLeadId) return respond({ sent: false, reason: 'lead_not_saved' });
      s.phoneDemoRecapCalled = true; // the rescue in finish() must never double-send after a recap call
      extra.leadId = s.phoneDemoLeadId;
      extra.summary = str(args.summary).slice(0, 1500);
    } else if (action === 'phone-booking-availability') {
      extra.day = str(args.day); extra.dayPart = str(args.dayPart);
    } else if (action === 'phone-booking-check') {
      extra.date = str(args.date); extra.time = str(args.time); extra.iso = str(args.iso);
    } else if (action === 'phone-booking-book') {
      if (!s.phoneDemoLeadId) return respond({ ok: false, error: 'lead_not_saved' });
      extra.leadId = s.phoneDemoLeadId;
      extra.slotStart = str(args.slotStart);
      if (typeof args.smsConsent === 'boolean') extra.smsConsent = args.smsConsent;
    } else { // phone-demo-code
      if (!s.phoneDemoLeadId) return respond({ sent: false, reason: 'lead_not_saved' });
      extra.leadId = s.phoneDemoLeadId;
    }
    // CRITICAL: a tool call must NEVER go unanswered. server.mjs's api()
    // throws on any non-200 backend response; before this wrap, that throw
    // escaped to a bare .catch(console.error) in the message handler and
    // the Gemini tool call hung forever (the caller heard pure silence and
    // nothing was timed or recorded). On any backend throw we still answer
    // — { ok: false, reason: 'backend_error' } — so Aspen can speak a
    // truthful fallback instead of stalling.
    let res;
    try {
      res = await report(s, action, extra);
    } catch (e) {
      console.error(`telnyx phone-demo tool ${call.name} (${action}) backend error`, e.message);
      respond({ ok: false, reason: 'backend_error' });
      return;
    }
    if ((action === 'phone-demo-save' || action === 'phone-demo-resume') && res?.leadId) s.phoneDemoLeadId = res.leadId;
    record.ok = Boolean(res && typeof res === 'object'); // backend answered (business outcome rides in the result)
    respond(res && typeof res === 'object' ? res : { ok: false, reason: 'no_response' });
    } finally {
      finishToolCallRecord(record, record.ok);
      clearTimeout(fillerTimer); s.fillerTimers.delete(fillerTimer);
      s.pendingTools = Math.max(0, s.pendingTools - 1);
    }
  }

  function reconnect(s, reason) {
    if (s.ended) return;
    if (s.reconnects >= MAX_RECONNECTS || !s.resumeHandle) { console.error(`telnyx gemini ${reason}; cannot resume`); finish(s); return; }
    s.reconnects++; console.log(`telnyx gemini ${reason}; resuming (${s.reconnects})`);
    console.log(`telnyx gemini ${reason}; inbound frames dropped while socket not OPEN so far: ${s.droppedFrames}`);
    const old = s.gemini; s.gemini = null; try { old?.close(); } catch {}
    openGemini(s, true);
  }

  // ---------- Warm transfer: Dial + speak whisper + gather press-1 + Bridge ----------
  async function startTransfer(s, summary) {
    const res = await report(s, 'transfer', { summary });
    if (res?.mode !== 'bridge-executed' || !res.transferPhone) throw new Error('backend did not return a bridge-executed transfer target');
    if (!connectionId) throw new Error('TELNYX_CONNECTION_ID not configured');
    const clientState = Buffer.from(JSON.stringify({ kind: 'transfer', token: s.token })).toString('base64');
    const dial = await telnyxApi('/calls', { to: res.transferPhone, from: s.to, connection_id: connectionId, webhook_url: webhookUrl, timeout_secs: TRANSFER_DIAL_TIMEOUT_SEC, client_state: clientState });
    const legBId = dial?.data?.call_control_id;
    if (!legBId) throw new Error('telnyx dial returned no call_control_id');
    s.transfer = { legBId, phase: 'dialing', target: res.transferPhone, name: res.transferName || 'the manager', summary, timer: null };
    s.transfer.timer = setTimeout(() => { failTransfer(s, 'no_answer_timeout').catch(e => console.error('telnyx transfer cleanup failed', e.message)); }, TRANSFER_ATTEMPT_MS);
    legB.set(legBId, s);
    console.log(`telnyx transfer: leg B ${legBId} dialed for call ${s.callControlId}`);
  }

  async function failTransfer(s, reason) {
    const t = s.transfer;
    if (!t || t.phase === 'bridged' || s.ended) return;
    if (s.transferInfo.outcome === 'pending') { s.transferInfo.outcome = 'failed'; s.transferInfo.reason = reason; }
    console.log(`telnyx transfer failed (${reason}) for call ${s.callControlId}`);
    if (t.timer) clearTimeout(t.timer);
    legB.delete(t.legBId);
    s.transfer = null; s.transferring = false;
    try { await hangupCall(t.legBId); } catch {}
    // v1 fallback (SCOPE §3.5): same spoken outcome as the Twilio path — Aspen
    // delivers the not-available message, then the call ends. Resume-on-fail
    // is the documented fast follow, not v1.
    if (s.gemini?.readyState === WebSocket.OPEN) {
      s.gemini.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{ text: `(The transfer could not be completed. Say exactly this to the caller now, as your whole turn: "Sorry, ${t.name} is not available right now. We will call you back soon. Goodbye.")` }] }], turnComplete: true } }));
      s.fallbackTimer = setTimeout(() => { hangupCall(s.callControlId).catch(() => {}); finish(s); }, TRANSFER_FALLBACK_HANGUP_MS);
    } else finish(s);
  }

  async function acceptTransfer(s) {
    const t = s.transfer;
    if (!t || t.phase === 'bridged') return;
    t.phase = 'bridged';
    if (t.timer) clearTimeout(t.timer);
    s.transferred = true;
    try { await stopStreaming(s.callControlId); } catch (e) { console.error('telnyx streaming_stop failed', e.message); }
    await bridgeLegs(s.callControlId, t.legBId);
    s.transferInfo.outcome = 'connected';
    s.transferInfo.connectMs = s.transferInfo.startedAt ? Date.now() - s.transferInfo.startedAt : null;
    console.log(`telnyx transfer: bridged ${s.callControlId} <-> ${t.legBId}`);
    await finish(s); // Aspen's session ends; the bridged legs talk on without us.
  }

  function sessionForLegB(payload) {
    if (payload?.call_control_id && legB.has(payload.call_control_id)) return legB.get(payload.call_control_id);
    try {
      const cs = JSON.parse(Buffer.from(String(payload?.client_state || ''), 'base64').toString('utf8'));
      if (cs?.kind === 'transfer' && cs.token && byToken.has(cs.token)) return byToken.get(cs.token);
    } catch {}
    return null;
  }

  // ---------- Webhook processing ----------
  async function onInitiated(payload) {
    if (payload.direction === 'incoming') {
      const s = newSession(payload.call_control_id, payload);
      const res = await api({ action: 'telnyx-start', provider: 'telnyx', callControlId: s.callControlId, from: s.from, to: s.to });
      if (!res?.token) throw new Error('telnyx-start returned no token');
      s.token = res.token; byToken.set(s.token, s);
      // Greeting trim: the session token exists NOW, but the backend
      // `start` call (agent config, pricing, usage — several DB queries)
      // used to wait until the media WebSocket connected and then run
      // serially in front of openGemini (call.initiated -> first audio was
      // 6,236 ms on the 2026-11-12 A&R call). Fire it immediately so it
      // overlaps the answer + streaming setup; handleConnection awaits
      // this promise instead of calling again. The no-op catch keeps a
      // rejection from going unhandled if the media socket never connects
      // — the await in handleConnection still surfaces it identically.
      try { const p = api({ action: 'start', token: s.token }); s.cfgPromise = p && typeof p.catch === 'function' ? p : Promise.resolve(p); s.cfgPromise.catch(() => {}); } catch { s.cfgPromise = null; }
      s.latency.noteSetup('answer_cmd', Date.now());
      await answerCall(s.callControlId, s.token); // stream params ON the answer (SCOPE §3.3 race)
      return;
    }
    // Outgoing leg: a transfer leg B we dialed (or an unrelated outbound leg).
    const s = sessionForLegB(payload);
    if (s?.transfer && payload.call_control_id) { s.transfer.legBId = payload.call_control_id; legB.set(payload.call_control_id, s); }
  }

  async function processEvent(eventType, payload) {
    switch (eventType) {
      case 'call.initiated': await onInitiated(payload); break;
      case 'call.answered': {
        const s = sessions.get(payload.call_control_id);
        if (s) {
          s.latency.noteSetup('answered', Date.now());
          // Belt-and-braces: if streaming.started never arrives, start it once.
          clearTimeout(s.streamFallbackTimer);
          s.streamFallbackTimer = setTimeout(() => { if (!s.ended && !s.streamStarted) startStreaming(s.callControlId, s.token).catch(e => console.error('telnyx streaming_start fallback failed', e.message)); }, STREAM_FALLBACK_MS);
        } else {
          const sb = sessionForLegB(payload);
          if (sb?.transfer?.legBId === payload.call_control_id && sb.transfer.phase === 'dialing') {
            sb.transfer.phase = 'whisper';
            const t = sb.transfer;
            // Summary only (fix batch 2026-11-08): the gather prompt that
            // follows carries the single "Press 1" line — ending the whisper
            // with it too made the receiver hear it twice.
            await speak(payload.call_control_id, `Transfer from Aspen. ${t.summary || 'A caller is waiting.'}`);
          }
        }
        break;
      }
      case 'streaming.started': {
        const s = sessions.get(payload.call_control_id);
        if (s) { s.streamStarted = true; clearTimeout(s.streamFallbackTimer); s.latency.noteSetup('stream_started', Date.now()); }
        break;
      }
      case 'streaming.stopped': break; // finish() is driven by WS stop / call.hangup
      case 'call.speak.ended': {
        const sb = sessionForLegB(payload);
        if (sb?.transfer?.legBId === payload.call_control_id && sb.transfer.phase === 'whisper') {
          sb.transfer.phase = 'gather';
          await gatherSpeak(payload.call_control_id, 'Press 1 to accept the transfer.');
        }
        break;
      }
      case 'call.gather.ended': {
        const sb = sessionForLegB(payload);
        if (sb?.transfer?.legBId === payload.call_control_id) {
          if (String(payload.digits || '').includes('1')) await acceptTransfer(sb);
          else await failTransfer(sb, 'declined');
        }
        break;
      }
      case 'call.bridged': {
        const s = sessions.get(payload.call_control_id) || sessionForLegB(payload);
        if (s && s.transfer) { s.transferred = true; s.transfer.phase = 'bridged'; if (s.transfer.timer) clearTimeout(s.transfer.timer); if (s.transferInfo.outcome === 'pending') { s.transferInfo.outcome = 'connected'; s.transferInfo.connectMs = s.transferInfo.startedAt ? Date.now() - s.transferInfo.startedAt : null; } await finish(s); }
        break;
      }
      case 'call.hangup': {
        const s = sessions.get(payload.call_control_id);
        if (s) { await finish(s); break; }
        const sb = sessionForLegB(payload);
        if (sb?.transfer?.legBId === payload.call_control_id && sb.transfer.phase !== 'bridged') await failTransfer(sb, 'leg_b_hangup');
        break;
      }
      default: break; // recordings etc. ignored in v1 (SCOPE §4.5)
    }
  }

  /**
   * Webhook entry point called by server.mjs with the RAW body (signature
   * verification needs it byte-exact). Verifies, dedupes, acks fast with the
   * HTTP status to send, and processes the event asynchronously.
   */
  async function handleWebhook(rawBody, headers = {}) {
    if (!enabled) return { status: 503 };
    const ok = verifyTelnyxSignature(rawBody, headers['telnyx-signature-ed25519'], headers['telnyx-timestamp'], publicKey);
    if (!ok) { console.error('telnyx webhook: signature verification failed'); return { status: 401 }; }
    let env;
    try { env = JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody)); } catch { return { status: 400 }; }
    const data = env?.data;
    if (!data?.event_type || !data?.payload) return { status: 400 };
    if (data.id) { if (seenEvents.has(data.id)) return { status: 200 }; seenEvents.add(data.id); if (seenEvents.size > 2000) seenEvents.delete(seenEvents.values().next().value); }
    track(processEvent(data.event_type, data.payload).catch(e => console.error(`telnyx webhook ${data.event_type} failed`, e.message)));
    return { status: 200 };
  }

  // ---------- Media WebSocket ----------
  function handleConnection(ws) {
    let session = null;
    ws.on('message', async (raw) => {
      let msg; try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg.event === 'start') {
        const { token, callControlId, streamId } = parseTelnyxStart(msg);
        session = (callControlId && sessions.get(callControlId)) || (token && byToken.get(token)) || null;
        if (!session) { console.error('telnyx media: no session for start event'); try { ws.close(); } catch {} return; }
        session.mediaWs = ws; session.streamId = streamId; session.streamStarted = true;
        clearTimeout(session.streamFallbackTimer);
        if (!session.counted) { session.counted = true; onActiveChange(1); }
        session.latency.noteSetup('ws_start', Date.now());
        if (!session.token && token) { session.token = token; byToken.set(token, session); }
        try { session.cfg = session.cfgPromise ? await session.cfgPromise : await api({ action: 'start', token: session.token }); } catch (e) { console.error('telnyx start failed', e.message); session.token = null; finish(session); return; }
        if (session.cfg.maxSeconds < 30) { hangupCall(session.callControlId).catch(() => {}); finish(session); return; }
        session.limitTimer = setTimeout(() => { hangupCall(session.callControlId).catch(() => {}); finish(session); }, session.cfg.maxSeconds * 1000);
        session.gateTimer = setTimeout(() => { session.gateOpen = true; }, 75000);
        session.cpTimer = setInterval(() => report(session, 'checkpoint')?.catch(e => console.error('telnyx checkpoint failed', e.message)), CHECKPOINT_MS);
        openGemini(session, false);
      } else if (msg.event === 'media' && session) {
        const inAt = Date.now();
        const payload = msg.media?.payload;
        // Decode once: the PCM16 form is both what Gemini is forwarded
        // (below) and what the speech-energy check runs on — a single RMS
        // pass over the samples, no extra decode cost per frame.
        const decoded = payload ? twilioToGemini(payload) : null;
        const speech = decoded ? isSpeechPcm16(decoded) : false;
        session.latency.noteInbound(inAt, { speech });
        if (speech) { session.callerSpoke = true; session.lastCallerSpeechAt = inAt; }
        if (msg.media?.track && msg.media.track !== 'inbound') return; // defensive (SCOPE §4.6)
        if (!session.gateOpen) return; // Opening gate: same rule as the Twilio path.
        if (session.gemini?.readyState !== WebSocket.OPEN) { session.droppedFrames++; return; } // dropped, not buffered — counted for the call report (reconnect windows used to swallow speech invisibly)
        if (!payload) return;
        session.inSec += Buffer.byteLength(payload, 'base64') / 8000;
        session.gemini.send(JSON.stringify({ realtimeInput: { audio: { data: decoded, mimeType: 'audio/pcm;rate=16000' } } }));
      } else if (msg.event === 'stop' && session) finish(session);
    });
    ws.on('close', () => { if (session) finish(session); });
    ws.on('error', (e) => console.error('telnyx media error', e.message));
  }

  return { enabled, handleWebhook, handleConnection, whenIdle, _sessions: sessions };
}
