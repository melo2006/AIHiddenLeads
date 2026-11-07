// AI Hidden Leads portable phone bridge: Twilio Media Streams <-> Gemini Live.
// Runs on any always-on host (Hostinger VPS via systemd, see DEPLOY.md).
// Env: GOOGLE_API_KEY, TELEPHONY_SERVER_SECRET, TELEPHONY_FUNCTION_URL, PORT (default 8080)
import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { twilioToGemini, geminiToTwilio, audioEstimate } from './codec.mjs';
import { createTelnyx } from './telnyx.mjs';
import { createLatencyTracker } from './latency.mjs';

const { GOOGLE_API_KEY, TELEPHONY_SERVER_SECRET, TELEPHONY_FUNCTION_URL } = process.env;
const GEMINI_WS = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
const MAX_RECONNECTS = 5, CHECKPOINT_MS = 15000;
for (const [k, v] of Object.entries({ GOOGLE_API_KEY, TELEPHONY_SERVER_SECRET, TELEPHONY_FUNCTION_URL })) if (!v) { console.error(`Missing ${k}`); process.exit(1); }

async function api(body) {
  const r = await fetch(TELEPHONY_FUNCTION_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-telephony-secret': TELEPHONY_SERVER_SECRET }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  const text = await r.text(); if (!r.ok) throw new Error(`[${r.status}] ${text}`); return JSON.parse(text);
}

let activeCalls = 0;
const telnyx = createTelnyx({ api, env: process.env, onActiveChange: (d) => { activeCalls += d; } });
const server = http.createServer((req, res) => {
  // Telnyx Call Control webhooks (raw body needed for Ed25519 verification).
  // Everything else keeps the original health response, byte-identical.
  if (req.method === 'POST' && req.url === '/telnyx/voice') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('error', () => { try { res.writeHead(400); res.end(); } catch {} });
    req.on('end', async () => {
      const { status } = await telnyx.handleWebhook(Buffer.concat(chunks), req.headers).catch(() => ({ status: 500 }));
      if (!res.writableEnded) { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end('{}'); }
    });
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, activeCalls, uptime: Math.round(process.uptime()) }));
});
const wss = new WebSocketServer({ server, path: '/media' });
const telnyxWss = new WebSocketServer({ server, path: '/telnyx/media' });
telnyxWss.on('connection', (ws) => telnyx.handleConnection(ws));

wss.on('connection', (twilioWs) => {
  activeCalls++;
  let streamSid = null, token = null, cfg = null, gemini = null, ended = false, transferring = false;
  let resumeHandle = null, reconnects = 0, inSec = 0, outSec = 0, limitTimer = null, cpTimer = null;
  // Opening gate: caller audio is NOT forwarded to Gemini until Aspen's first
  // turn completes. A phone line is live from the first ring — room noise,
  // handset echo of her own voice, or a caller saying "hello?" would otherwise
  // register as an interruption and cut her opening greeting short. The gate
  // opens on her first turnComplete, on a resume (no greeting is replayed),
  // or after a 75s failsafe so a call can never be stuck muted.
  let gateOpen = false, gateTimer = null;
  const transcript = [];
  const latency = createLatencyTracker('twilio'); // passive A/B instrumentation (SCOPE §5); zero = WS start (vantage differs from Telnyx's webhook-side t_init)
  let wsStartAt = null; // bridge-observed duration anchor (Twilio's status callback stays the billing authority)
  // Dashboard call report transfer block. On Twilio the bridge hands the
  // transfer to the backend and cannot observe the dial outcome, so outcome
  // is 'handoff_accepted' once the backend confirms — never 'connected' —
  // and connectMs stays null (the Telnyx path measures a real connect time).
  const transferInfo = { attempted: false, outcome: 'not_attempted', connectMs: null, reason: null, startedAt: null };
  const usage = () => ({ model: cfg?.model, input_audio_seconds: Math.round(inSec), output_audio_seconds: Math.round(outSec), audio_estimate_usd: audioEstimate(inSec, outSec, cfg?.pricing), cost_basis: 'published_audio_estimate_not_invoice' });
  const report = (action, extra = {}) => token && api({ action, token, transcript, usage: usage(), reconnects, ...extra });

  const finish = async () => {
    if (ended) return; ended = true; activeCalls--; clearTimeout(limitTimer); clearInterval(cpTimer); clearTimeout(gateTimer);
    try { gemini?.close(); } catch {}
    try { twilioWs.close(); } catch {}
    const latencySummary = latency.snapshot();
    const durationSec = wsStartAt ? Math.max(0, Math.round((Date.now() - wsStartAt) / 1000)) : null;
    // Symmetric per-call report for the provider comparison dashboard; the
    // Telnyx path in telnyx.mjs emits the identical shape.
    const callReport = { provider: 'twilio', transport: 'stream', durationSec, greetingMs: latencySummary.greetingMs, latency: latencySummary, transfer: { attempted: transferInfo.attempted, outcome: transferInfo.outcome, connectMs: transferInfo.connectMs, reason: transferInfo.reason } };
    console.log(JSON.stringify({ twilio_latency: latencySummary }));
    console.log(JSON.stringify({ twilio_call_report: callReport }));
    await report('end', { latency: latencySummary, durationSec, callReport })?.catch(e => console.error('end failed', e.message));
  };

  const sendTwilio = (o) => { if (twilioWs.readyState === WebSocket.OPEN) twilioWs.send(JSON.stringify(o)); };

  function openGemini(isResume) {
    if (isResume) gateOpen = true; // A resumed session already greeted; never re-gate.
    const ws = new WebSocket(`${GEMINI_WS}?key=${GOOGLE_API_KEY}`);
    gemini = ws;
    ws.on('open', () => ws.send(JSON.stringify({ setup: {
      model: `models/${cfg.model}`,
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: cfg.voice } } } },
      systemInstruction: { parts: [{ text: cfg.instructions }] },
      tools: cfg.canTransfer ? [{ functionDeclarations: [{ name: 'transfer_call', description: `Warm-transfer the caller to ${cfg.transferName}. Say you are connecting them first.`, parameters: { type: 'OBJECT', properties: { summary: { type: 'STRING', description: 'One sentence for the person receiving the call: who is calling and why.' } }, required: ['summary'] } }] }] : [],
      realtimeInputConfig: { automaticActivityDetection: { disabled: false, startOfSpeechSensitivity: 'START_SENSITIVITY_HIGH', endOfSpeechSensitivity: 'END_SENSITIVITY_LOW', prefixPaddingMs: 200, silenceDurationMs: 700 } },
      sessionResumption: resumeHandle ? { handle: resumeHandle } : {},
      contextWindowCompression: { slidingWindow: {} },
      inputAudioTranscription: {}, outputAudioTranscription: {},
    } })));
    ws.on('message', (data) => {
      if (ws !== gemini) return;
      const m = JSON.parse(data.toString());
      if (m.setupComplete) {
        if (!isResume) ws.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{ text: cfg.greeting }] }], turnComplete: true } }));
        return;
      }
      if (m.sessionResumptionUpdate?.resumable && m.sessionResumptionUpdate.newHandle) resumeHandle = m.sessionResumptionUpdate.newHandle;
      if (m.goAway) { reconnect('go_away'); return; }
      const sc = m.serverContent;
      if (sc?.turnComplete && !gateOpen) { gateOpen = true; clearTimeout(gateTimer); }
      if (sc?.interrupted) latency.noteInterrupted();
      if (sc?.interrupted && streamSid) sendTwilio({ event: 'clear', streamSid });
      for (const part of sc?.modelTurn?.parts || []) if (part.inlineData?.data && streamSid) {
        const payload = geminiToTwilio(part.inlineData.data);
        outSec += Buffer.byteLength(payload, 'base64') / 8000;
        latency.noteOutbound(Date.now());
        sendTwilio({ event: 'media', streamSid, media: { payload } });
      }
      if (sc?.inputTranscription?.text) transcript.push({ role: 'caller', text: sc.inputTranscription.text });
      if (sc?.outputTranscription?.text) transcript.push({ role: 'assistant', text: sc.outputTranscription.text });
      for (const call of m.toolCall?.functionCalls || []) {
        if (call.name !== 'transfer_call' || transferring) continue;
        transferring = true;
        ws.send(JSON.stringify({ toolResponse: { functionResponses: [{ id: call.id, name: call.name, response: { ok: true } }] } }));
        // Let Aspen finish "connecting you now"; Twilio then replaces this stream with the saved destination.
        transferInfo.attempted = true; transferInfo.outcome = 'requested'; transferInfo.startedAt = Date.now();
        setTimeout(() => report('transfer', { summary: String(call.args?.summary || '').slice(0, 300) })?.then(() => { if (transferInfo.outcome === 'requested') transferInfo.outcome = 'handoff_accepted'; }).catch(e => { transferring = false; transferInfo.outcome = 'failed'; transferInfo.reason = 'backend_error'; console.error('transfer failed', e.message); }), 2500);
      }
    });
    ws.on('close', () => { if (ws === gemini && !ended && !transferring) reconnect('closed'); });
    ws.on('error', (e) => console.error('gemini error', e.message));
  }

  function reconnect(reason) {
    if (ended) return;
    if (reconnects >= MAX_RECONNECTS || !resumeHandle) { console.error(`gemini ${reason}; cannot resume`); finish(); return; }
    reconnects++; console.log(`gemini ${reason}; resuming (${reconnects})`);
    const old = gemini; gemini = null; try { old?.close(); } catch {}
    openGemini(true);
  }

  twilioWs.on('message', async (raw) => {
    let msg; try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (msg.event === 'start') {
      latency.noteSetup('ws_start', Date.now());
      wsStartAt = Date.now();
      streamSid = msg.start.streamSid; token = msg.start.customParameters?.token;
      try { cfg = await api({ action: 'start', token }); } catch (e) { console.error('start failed', e.message); token = null; finish(); return; }
      if (cfg.maxSeconds < 30) { finish(); return; }
      limitTimer = setTimeout(finish, cfg.maxSeconds * 1000);
      gateTimer = setTimeout(() => { gateOpen = true; }, 75000);
      cpTimer = setInterval(() => report('checkpoint')?.catch(e => console.error('checkpoint failed', e.message)), CHECKPOINT_MS);
      openGemini(false);
    } else if (msg.event === 'media' && gemini?.readyState === WebSocket.OPEN) {
      latency.noteInbound(Date.now());
      if (!gateOpen) return; // Opening gate: drop caller audio until her first turn completes.
      const payload = msg.media.payload; inSec += Buffer.byteLength(payload, 'base64') / 8000;
      gemini.send(JSON.stringify({ realtimeInput: { audio: { data: twilioToGemini(payload), mimeType: 'audio/pcm;rate=16000' } } }));
    } else if (msg.event === 'stop') finish();
  });
  twilioWs.on('close', finish);
});

process.on('SIGTERM', () => { console.log('shutting down'); server.close(); setTimeout(() => process.exit(0), 5000); });
server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => console.log('telephony bridge listening'));
