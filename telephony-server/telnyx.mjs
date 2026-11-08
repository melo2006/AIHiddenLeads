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
    }, required: ['businessName'] } },
    { name: 'send_demo_code', description: 'Text the 4-digit demo verification code to the saved mobile. Only say a code was sent when the result says sent is true; when it returns mode caller_id, texting is not switched on for this line yet and the demo proceeds on caller ID.', parameters: { type: 'OBJECT', properties: {} } },
    { name: 'check_demo_code', description: 'Check the 4-digit code the caller read back. Only say the caller is verified when the result says verified is true.', parameters: { type: 'OBJECT', properties: { code: { type: 'STRING', description: 'The 4 digits the caller read back.' } }, required: ['code'] } },
    { name: 'resume_demo_by_code', description: 'On a callback, resume an earlier phone demo: the caller gives the 4-digit code from the previous call. On verified true the result carries their saved business details so the demo can continue.', parameters: { type: 'OBJECT', properties: { code: { type: 'STRING', description: 'The 4-digit code from the earlier call.' } }, required: ['code'] } },
    { name: 'send_demo_recap', description: 'Email the caller the demo recap and the visual demo link at the saved email address. Only say the email was sent when the result says sent is true.', parameters: { type: 'OBJECT', properties: { summary: { type: 'STRING', description: 'Two or three sentences on what the demo covered: what Aspen answered as their receptionist and what the caller tried.' } }, required: ['summary'] } },
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
  const speak = (id, payload) => telnyxApi(`/calls/${encodeURIComponent(id)}/actions/speak`, { payload, voice: 'female', language: 'en-US' });
  const gatherSpeak = (id, payload) => telnyxApi(`/calls/${encodeURIComponent(id)}/actions/gather_using_speak`, { payload, voice: 'female', language: 'en-US', valid_digits: '1', minimum_digits: 1, maximum_digits: 1 });
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
    const latency = s.latency.snapshot();
    // Symmetric per-call report for the provider comparison dashboard; the
    // Twilio path in server.mjs emits the identical shape.
    const callReport = { provider: 'telnyx', transport: 'telnyx-stream', durationSec, greetingMs: latency.greetingMs, latency, transfer: { attempted: s.transferInfo.attempted, outcome: s.transferInfo.outcome, connectMs: s.transferInfo.connectMs, reason: s.transferInfo.reason } };
    console.log(JSON.stringify({ telnyx_latency: latency }));
    console.log(JSON.stringify({ telnyx_call_report: callReport }));
    await report(s, 'end', { durationSec, latency, callReport })?.catch(e => console.error('telnyx end failed', e.message));
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
    ws.on('open', () => ws.send(JSON.stringify({ setup: {
      model: `models/${cfg.model}`,
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: cfg.voice } } } },
      systemInstruction: { parts: [{ text: cfg.instructions }] },
      tools: declarations.length ? [{ functionDeclarations: declarations }] : [],
      realtimeInputConfig: { automaticActivityDetection: { disabled: false, startOfSpeechSensitivity: 'START_SENSITIVITY_HIGH', endOfSpeechSensitivity: 'END_SENSITIVITY_LOW', prefixPaddingMs: 200, silenceDurationMs: 700 } },
      sessionResumption: s.resumeHandle ? { handle: s.resumeHandle } : {},
      contextWindowCompression: { slidingWindow: {} },
      inputAudioTranscription: {}, outputAudioTranscription: {},
    } })));
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
        s.latency.noteOutbound(Date.now());
        sendTelnyx(s, telnyxMediaFrame(payload)); // no stream id — SCOPE §3.3
      }
      if (sc?.inputTranscription?.text) s.transcript.push({ role: 'caller', text: sc.inputTranscription.text });
      if (sc?.outputTranscription?.text) s.transcript.push({ role: 'assistant', text: sc.outputTranscription.text });
      for (const call of m.toolCall?.functionCalls || []) {
        const demoAction = PHONE_DEMO_TOOL_ACTIONS[call.name];
        if (demoAction && cfg.phoneDemo) {
          runPhoneDemoTool(s, ws, call, demoAction).catch(e => console.error('telnyx phone-demo tool failed', e.message));
          continue;
        }
        if (call.name !== 'transfer_call' || s.transferring) continue;
        s.transferring = true;
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
    const respond = (response) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ toolResponse: { functionResponses: [{ id: call.id, name: call.name, response }] } })); };
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
      if (s.phoneDemoLeadId) extra.leadId = s.phoneDemoLeadId; // correction pass updates the same lead
    } else if (action === 'phone-demo-verify' || action === 'phone-demo-resume') {
      extra.code = str(args.code);
      if (action === 'phone-demo-verify') {
        if (!s.phoneDemoLeadId) return respond({ verified: false, reason: 'lead_not_saved' });
        extra.leadId = s.phoneDemoLeadId;
      }
    } else if (action === 'phone-demo-recap') {
      if (!s.phoneDemoLeadId) return respond({ sent: false, reason: 'lead_not_saved' });
      extra.leadId = s.phoneDemoLeadId;
      extra.summary = str(args.summary).slice(0, 1500);
    } else { // phone-demo-code
      if (!s.phoneDemoLeadId) return respond({ sent: false, reason: 'lead_not_saved' });
      extra.leadId = s.phoneDemoLeadId;
    }
    const res = await report(s, action, extra);
    if ((action === 'phone-demo-save' || action === 'phone-demo-resume') && res?.leadId) s.phoneDemoLeadId = res.leadId;
    respond(res && typeof res === 'object' ? res : { ok: false, reason: 'no_response' });
  }

  function reconnect(s, reason) {
    if (s.ended) return;
    if (s.reconnects >= MAX_RECONNECTS || !s.resumeHandle) { console.error(`telnyx gemini ${reason}; cannot resume`); finish(s); return; }
    s.reconnects++; console.log(`telnyx gemini ${reason}; resuming (${s.reconnects})`);
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
            await speak(payload.call_control_id, `Transfer from Aspen. ${t.summary || 'A caller is waiting.'} Press 1 to accept.`);
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
        try { session.cfg = await api({ action: 'start', token: session.token }); } catch (e) { console.error('telnyx start failed', e.message); session.token = null; finish(session); return; }
        if (session.cfg.maxSeconds < 30) { hangupCall(session.callControlId).catch(() => {}); finish(session); return; }
        session.limitTimer = setTimeout(() => { hangupCall(session.callControlId).catch(() => {}); finish(session); }, session.cfg.maxSeconds * 1000);
        session.gateTimer = setTimeout(() => { session.gateOpen = true; }, 75000);
        session.cpTimer = setInterval(() => report(session, 'checkpoint')?.catch(e => console.error('telnyx checkpoint failed', e.message)), CHECKPOINT_MS);
        openGemini(session, false);
      } else if (msg.event === 'media' && session) {
        session.latency.noteInbound(Date.now());
        if (msg.media?.track && msg.media.track !== 'inbound') return; // defensive (SCOPE §4.6)
        if (!session.gateOpen) return; // Opening gate: same rule as the Twilio path.
        if (session.gemini?.readyState !== WebSocket.OPEN) return;
        const payload = msg.media?.payload;
        if (!payload) return;
        session.inSec += Buffer.byteLength(payload, 'base64') / 8000;
        session.gemini.send(JSON.stringify({ realtimeInput: { audio: { data: twilioToGemini(payload), mimeType: 'audio/pcm;rate=16000' } } }));
      } else if (msg.event === 'stop' && session) finish(session);
    });
    ws.on('close', () => { if (session) finish(session); });
    ws.on('error', (e) => console.error('telnyx media error', e.message));
  }

  return { enabled, handleWebhook, handleConnection, whenIdle, _sessions: sessions };
}
