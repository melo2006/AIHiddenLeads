// Unit/integration tests for the Telnyx adapter (SCOPE §7). Everything is
// local: the backend api(), the Telnyx REST API and the Gemini Live socket
// are all stubbed — no live calls are made.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { createTelnyx, verifyTelnyxSignature, parseTelnyxStart, telnyxMediaFrame, telnyxClearFrame, phoneDemoToolDeclarations, PHONE_DEMO_TOOL_ACTIONS, PHONE_BOOKING_TOOL_ACTIONS, watchdogShouldFire, parsePhoneVadSilenceMs, pcm16Base64Rms, isSpeechPcm16, SPEECH_RMS_THRESHOLD, createToolCallRecord, finishToolCallRecord, TOOL_FILLER_NOTE } from './telnyx.mjs';
import { createLatencyTracker, SILENCE_GAP_MS } from './latency.mjs';

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const pubDer = publicKey.export({ type: 'spki', format: 'der' });
const PUB_B64 = pubDer.subarray(pubDer.length - 32).toString('base64'); // raw 32-byte form, as Telnyx shows it
const TOKEN = 't'.repeat(64);
const LEG_A = 'v2:leg-a-uuid', LEG_B = 'v2:leg-b-uuid';

const signHeaders = (body, tsSec = Math.floor(Date.now() / 1000)) => ({
  'telnyx-signature-ed25519': crypto.sign(null, Buffer.from(`${tsSec}|${body}`), privateKey).toString('base64'),
  'telnyx-timestamp': String(tsSec),
});
const evtBody = (id, event_type, payload) => JSON.stringify({ data: { record_type: 'event', event_type, id, occurred_at: new Date().toISOString(), payload } });
const waitFor = async (fn, timeout = 8000) => { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > timeout) throw new Error('waitFor timeout'); await new Promise(r => setTimeout(r, 10)); } };

function makeHarness(startOverrides = {}) {
  const backendCalls = [], telnyxCalls = [];
  const api = async (body) => {
    backendCalls.push(body);
    if (body.action === 'telnyx-start') return { token: TOKEN };
    if (body.action === 'start') return { instructions: 'You are Aspen.', greeting: 'Hello greeting', voice: 'Kore', model: 'test-model', pricing: null, maxSeconds: 600, canTransfer: true, transferName: 'Ron', ...startOverrides };
    if (body.action === 'transfer') return { ok: true, mode: 'bridge-executed', transferPhone: '+19547706622', transferName: 'Ron' };
    if (body.action === 'phone-demo-save') return { ok: true, leadId: 'lead-1', spellBack: { website: 's, i, 2, dot, com', email: null, mobile: null } };
    if (body.action === 'phone-demo-code') return { sent: false, mode: 'caller_id' };
    return { ok: true };
  };
  const fetchImpl = async (url, opts) => {
    const body = JSON.parse(opts.body);
    telnyxCalls.push({ url, body });
    const data = /\/calls$/.test(url) ? { call_control_id: LEG_B } : {};
    return { ok: true, status: 200, text: async () => JSON.stringify({ data }) };
  };
  // Stub Gemini Live server: replies setupComplete to the setup message.
  const geminiSockets = [], geminiReceived = [];
  const geminiWss = new WebSocketServer({ port: 0 });
  geminiWss.on('connection', (ws) => {
    geminiSockets.push(ws);
    ws.on('message', (d) => { const m = JSON.parse(d.toString()); geminiReceived.push(m); if (m.setup) ws.send(JSON.stringify({ setupComplete: {} })); });
  });
  const geminiSend = (obj) => geminiSockets[geminiSockets.length - 1].send(JSON.stringify(obj));
  return { backendCalls, telnyxCalls, api, fetchImpl, geminiWss, geminiSend, geminiReceived,
    env: async () => ({ TELNYX_API_KEY: 'test-key', TELNYX_PUBLIC_KEY: PUB_B64, TELNYX_CONNECTION_ID: 'conn-1', TELNYX_STREAM_WSS: 'wss://example.test/telnyx/media', GOOGLE_API_KEY: 'test-google', GEMINI_WS_URL: `ws://127.0.0.1:${geminiWss.address().port}` }) };
}

async function startCall(t, h, telnyx, legA) {
  const body = evtBody(`evt-init-${legA}`, 'call.initiated', { call_control_id: legA, direction: 'incoming', from: '+15551234567', to: '+17723624949', connection_id: 'conn-1' });
  const { status } = await telnyx.handleWebhook(Buffer.from(body), signHeaders(body));
  assert.equal(status, 200);
  await telnyx.whenIdle();
  // Media WS: real socket pair, server side handed to the adapter.
  const mediaWss = new WebSocketServer({ port: 0 });
  t.after(() => mediaWss.close());
  mediaWss.on('connection', (ws) => telnyx.handleConnection(ws));
  const client = new WebSocket(`ws://127.0.0.1:${mediaWss.address().port}`);
  const received = [];
  client.on('message', (d) => received.push(JSON.parse(d.toString())));
  await new Promise(r => client.on('open', r));
  client.send(JSON.stringify({ event: 'start', stream_id: 'stream-1', start: { call_control_id: legA, media_format: { encoding: 'PCMU', sample_rate: 8000, channels: 1 }, custom_parameters: [{ name: 'token', value: TOKEN }] } }));
  await waitFor(() => h.geminiReceived.some(m => m.setup));
  return { client, received };
}
const AUDIO_24K = Buffer.alloc(960).toString('base64'); // 20 ms of 24 kHz PCM16 silence
const AUDIO_MU = Buffer.alloc(160, 0xff).toString('base64'); // 20 ms of 8 kHz mu-law

test('signature verification: valid passes, tampered body and stale timestamp fail', () => {
  const body = '{"data":{}}', ts = Math.floor(Date.now() / 1000);
  const sig = crypto.sign(null, Buffer.from(`${ts}|${body}`), privateKey).toString('base64');
  assert.equal(verifyTelnyxSignature(body, sig, String(ts), publicKey), true);
  assert.equal(verifyTelnyxSignature(body + 'x', sig, String(ts), publicKey), false);
  assert.equal(verifyTelnyxSignature(body, sig, String(ts - 3600), publicKey), false);
  assert.equal(verifyTelnyxSignature(body, '', String(ts), publicKey), false);
});

test('frame helpers: outbound media carries no stream id; start parsing reads the token', () => {
  const f = telnyxMediaFrame('AAAA');
  assert.deepEqual(Object.keys(f.media), ['payload']);
  assert.equal('stream_id' in f || 'streamSid' in f, false);
  assert.deepEqual(telnyxClearFrame(), { event: 'clear' });
  const parsed = parseTelnyxStart({ stream_id: 's1', start: { call_control_id: LEG_A, custom_parameters: [{ name: 'token', value: TOKEN }] } });
  assert.equal(parsed.token, TOKEN); assert.equal(parsed.callControlId, LEG_A); assert.equal(parsed.streamId, 's1');
});

test('latency tracker: per-turn samples with average, median and greeting time', () => {
  const tr = createLatencyTracker('telnyx');
  tr.noteSetup('initiated', 1000);
  tr.noteOutbound(1400); // greeting audio (no inbound yet -> no turn)
  tr.noteInbound(2000); tr.noteInbound(2200);
  tr.noteOutbound(2900); // turn 1: 2900 - 2200 = 700
  tr.noteInbound(4000);
  tr.noteOutbound(4900); // turn 2: 4900 - 4000 = 900
  const snap = tr.snapshot();
  assert.equal(snap.greetingMs, 400);
  assert.equal(snap.turns.length, 2);
  assert.equal(snap.turns[0].t_last_in, 2200); assert.equal(snap.turns[0].t_first_out, 2900);
  assert.equal(snap.turnLatencyAvgMs, 800);
  assert.equal(snap.turnLatencyMedianMs, 700);
});

test('webhook dispatch: call.initiated creates the backend row and answers with rtp stream params; duplicates and bad signatures are no-ops', async (t) => {
  const h = makeHarness(); t.after(() => h.geminiWss.close());
  const telnyx = createTelnyx({ api: h.api, env: await h.env(), fetchImpl: h.fetchImpl });
  const body = evtBody('evt-1', 'call.initiated', { call_control_id: LEG_A, direction: 'incoming', from: '+15551234567', to: '+17723624949', connection_id: 'conn-1' });

  const bad = await telnyx.handleWebhook(Buffer.from(body), { 'telnyx-signature-ed25519': 'AAAA', 'telnyx-timestamp': String(Math.floor(Date.now() / 1000)) });
  assert.equal(bad.status, 401);
  assert.equal(h.backendCalls.length, 0);

  const ok = await telnyx.handleWebhook(Buffer.from(body), signHeaders(body));
  assert.equal(ok.status, 200);
  await telnyx.whenIdle();
  const start = h.backendCalls.find(c => c.action === 'telnyx-start');
  assert.ok(start); assert.equal(start.callControlId, LEG_A); assert.equal(start.to, '+17723624949');
  const answer = h.telnyxCalls.find(c => c.url.includes('/actions/answer'));
  assert.ok(answer);
  assert.equal(answer.body.stream_bidirectional_mode, 'rtp');
  assert.equal(answer.body.stream_bidirectional_codec, 'PCMU');
  assert.equal(answer.body.stream_track, 'inbound_track');
  assert.equal(answer.body.custom_parameters, undefined); // Telnyx API rejects the field (422)

  await telnyx.handleWebhook(Buffer.from(body), signHeaders(body)); // duplicate delivery, same event id
  await telnyx.whenIdle();
  assert.equal(h.backendCalls.filter(c => c.action === 'telnyx-start').length, 1);
  assert.equal(h.telnyxCalls.filter(c => c.url.includes('/actions/answer')).length, 1);
});

test('media session: greeting + turn flow produces a symmetric end callReport', async (t) => {
  const h = makeHarness(); t.after(() => h.geminiWss.close());
  const telnyx = createTelnyx({ api: h.api, env: await h.env(), fetchImpl: h.fetchImpl });
  const { client, received } = await startCall(t, h, telnyx, LEG_A);

  h.geminiSend({ serverContent: { modelTurn: { parts: [{ inlineData: { data: AUDIO_24K, mimeType: 'audio/pcm;rate=24000' } }] } } }); // greeting audio
  await waitFor(() => received.length >= 1);
  assert.equal(received[0].event, 'media');
  assert.equal('stream_id' in received[0] || 'streamSid' in received[0], false); // no stream id on outbound frames

  h.geminiSend({ serverContent: { turnComplete: true } }); // opens the gate
  client.send(JSON.stringify({ event: 'media', media: { track: 'inbound', chunk: 1, payload: AUDIO_MU } }));
  client.send(JSON.stringify({ event: 'media', media: { track: 'inbound', chunk: 2, payload: AUDIO_MU } }));
  await new Promise(r => setTimeout(r, 30));
  h.geminiSend({ serverContent: { modelTurn: { parts: [{ inlineData: { data: AUDIO_24K, mimeType: 'audio/pcm;rate=24000' } }] } } }); // her reply turn
  await waitFor(() => received.length >= 2);
  h.geminiSend({ serverContent: { interrupted: true } });
  await waitFor(() => received.some(m => m.event === 'clear'));

  client.send(JSON.stringify({ event: 'stop', stop: { call_control_id: LEG_A } }));
  await waitFor(() => h.backendCalls.some(c => c.action === 'end'));
  const end = h.backendCalls.find(c => c.action === 'end');
  assert.equal(typeof end.durationSec, 'number');
  const r = end.callReport;
  assert.equal(r.provider, 'telnyx'); assert.equal(r.transport, 'telnyx-stream');
  assert.equal(r.durationSec, end.durationSec);
  assert.equal(typeof r.greetingMs, 'number');
  assert.ok(r.latency.turns.length >= 1);
  assert.equal(typeof r.latency.turns[0].t_last_in, 'number');
  assert.equal(typeof r.latency.turns[0].t_first_out, 'number');
  assert.equal(typeof r.latency.turnLatencyAvgMs, 'number');
  assert.equal(r.transfer.attempted, false); assert.equal(r.transfer.outcome, 'not_attempted'); assert.equal(r.transfer.connectMs, null);
  client.close();
});

test('warm transfer: dial -> whisper speak -> gather -> press 1 -> bridge, reported as connected with connect time', async (t) => {
  const h = makeHarness(); t.after(() => h.geminiWss.close());
  const telnyx = createTelnyx({ api: h.api, env: await h.env(), fetchImpl: h.fetchImpl });
  const legA2 = 'v2:leg-a2-uuid';
  const { client } = await startCall(t, h, telnyx, legA2);
  h.geminiSend({ serverContent: { turnComplete: true } });

  h.geminiSend({ toolCall: { functionCalls: [{ id: 'fc1', name: 'transfer_call', args: { summary: 'VIP caller needs Ron' } }] } });
  await waitFor(() => h.telnyxCalls.some(c => /\/calls$/.test(c.url)), 9000); // dial after the 2.5 s "connecting you" pause
  const dial = h.telnyxCalls.find(c => /\/calls$/.test(c.url));
  assert.equal(dial.body.to, '+19547706622'); assert.equal(dial.body.from, '+17723624949');
  assert.equal(dial.body.connection_id, 'conn-1');
  const clientState = dial.body.client_state;

  const fire = async (id, event_type, payload) => { const b = evtBody(id, event_type, payload); await telnyx.handleWebhook(Buffer.from(b), signHeaders(b)); await telnyx.whenIdle(); };
  await fire('evt-b-init', 'call.initiated', { call_control_id: LEG_B, direction: 'outgoing', from: '+17723624949', to: '+19547706622', client_state: clientState });
  await fire('evt-b-ans', 'call.answered', { call_control_id: LEG_B, client_state: clientState });
  const speakCall = h.telnyxCalls.find(c => c.url.includes(encodeURIComponent(LEG_B)) && c.url.includes('/actions/speak'));
  assert.ok(speakCall); assert.match(speakCall.body.payload, /VIP caller needs Ron/);
  // Fix batch 2026-11-08: the whisper is summary-only in the neural voice —
  // the "Press 1" line lives exactly once, in the gather prompt below.
  assert.doesNotMatch(speakCall.body.payload, /Press 1/);
  assert.equal(speakCall.body.voice, 'Telnyx.KokoroTTS.af');

  await fire('evt-b-spoke', 'call.speak.ended', { call_control_id: LEG_B, client_state: clientState });
  const gatherCall = h.telnyxCalls.find(c => c.url.includes('/actions/gather_using_speak'));
  assert.ok(gatherCall);
  assert.equal(gatherCall.body.payload, 'Press 1 to accept the transfer.');
  assert.equal(gatherCall.body.voice, 'Telnyx.KokoroTTS.af');

  await fire('evt-b-gather', 'call.gather.ended', { call_control_id: LEG_B, client_state: clientState, digits: '1' });
  assert.ok(h.telnyxCalls.some(c => c.url.includes(encodeURIComponent(legA2)) && c.url.includes('/actions/streaming_stop')));
  const bridge = h.telnyxCalls.find(c => c.url.includes('/actions/bridge'));
  assert.ok(bridge); assert.equal(bridge.body.call_control_id, LEG_B);

  await waitFor(() => h.backendCalls.some(c => c.action === 'end'));
  const r = h.backendCalls.find(c => c.action === 'end').callReport;
  assert.equal(r.transfer.attempted, true);
  assert.equal(r.transfer.outcome, 'connected');
  assert.equal(typeof r.transfer.connectMs, 'number'); assert.ok(r.transfer.connectMs >= 2000); // includes the 2.5 s announcement pause
  client.close();
});

test('phone demo declarations: five demo tools, each mapped 1:1 to a phone-demo-* action', () => {
  const decls = phoneDemoToolDeclarations();
  const demoDecls = decls.filter(d => d.name in PHONE_DEMO_TOOL_ACTIONS);
  assert.equal(demoDecls.length, 5);
  for (const d of demoDecls) assert.match(PHONE_DEMO_TOOL_ACTIONS[d.name], /^phone-demo-/);
});

test('phone demo declarations: save_phone_demo_lead carries the step-3 smsConsent answer', () => {
  const save = phoneDemoToolDeclarations().find(d => d.name === 'save_phone_demo_lead');
  assert.ok(save);
  const prop = save.parameters.properties.smsConsent;
  assert.ok(prop, 'smsConsent parameter declared');
  assert.equal(prop.type, 'BOOLEAN');
  assert.match(prop.description, /texting-permission ask/);
  assert.match(prop.description, /true only when they explicitly agreed to receive the demo-link text/);
  // Optional, never required: the first intake save runs before the ask.
  assert.ok(!save.parameters.required.includes('smsConsent'));
});

test('phone booking declarations: three booking tools mapped to phone-booking-* actions (phase 2)', () => {
  const decls = phoneDemoToolDeclarations();
  assert.equal(decls.length, 8); // 5 demo + 3 booking
  assert.deepEqual(decls.map(d => d.name).sort(), [...Object.keys(PHONE_DEMO_TOOL_ACTIONS), ...Object.keys(PHONE_BOOKING_TOOL_ACTIONS)].sort());
  for (const name of Object.keys(PHONE_BOOKING_TOOL_ACTIONS)) assert.match(PHONE_BOOKING_TOOL_ACTIONS[name], /^phone-booking-/);
});

test('phone demo tools: absent from the setup when the backend does not enable them', async (t) => {
  const h = makeHarness(); t.after(() => h.geminiWss.close());
  const telnyx = createTelnyx({ api: h.api, env: await h.env(), fetchImpl: h.fetchImpl });
  const { client } = await startCall(t, h, telnyx, 'v2:leg-pd-off');
  const setup = h.geminiReceived.find(m => m.setup);
  const names = setup.setup.tools[0].functionDeclarations.map(d => d.name);
  assert.deepEqual(names, ['transfer_call']);
  client.close();
});

test('phone demo flow: save -> code (caller-ID mode) -> recap, results returned truthfully', async (t) => {
  const h = makeHarness({ phoneDemo: true }); t.after(() => h.geminiWss.close());
  const telnyx = createTelnyx({ api: h.api, env: await h.env(), fetchImpl: h.fetchImpl });
  const { client } = await startCall(t, h, telnyx, 'v2:leg-pd-on');
  const setup = h.geminiReceived.find(m => m.setup);
  const names = setup.setup.tools[0].functionDeclarations.map(d => d.name);
  assert.ok(names.includes('transfer_call'));
  for (const n of ['save_phone_demo_lead', 'send_demo_code', 'check_demo_code', 'resume_demo_by_code', 'send_demo_recap', 'get_availability', 'check_time', 'book_call']) assert.ok(names.includes(n), n);

  h.geminiSend({ serverContent: { turnComplete: true } });
  const toolResult = async (id) => {
    await waitFor(() => h.geminiReceived.some(m => m.toolResponse?.functionResponses?.[0]?.id === id));
    return h.geminiReceived.find(m => m.toolResponse?.functionResponses?.[0]?.id === id).toolResponse.functionResponses[0];
  };

  h.geminiSend({ toolCall: { functionCalls: [{ id: 'pd1', name: 'save_phone_demo_lead', args: { callerName: 'Sam', businessName: 'Speedy Tow', trade: 'towing', serviceArea: 'Dallas', services: ['emergency towing'], bestPractice: true, email: 'sam@example.com', mobile: '+15551234567', smsConsent: true } }] } });
  const r1 = await toolResult('pd1');
  const save = h.backendCalls.find(c => c.action === 'phone-demo-save');
  assert.ok(save); assert.equal(save.demo.businessName, 'Speedy Tow');
  assert.equal(save.demo.services[0], 'emergency towing');
  assert.equal(save.demo.smsConsent, true); // step-3 yes reaches the backend inside demo
  assert.equal(r1.response.leadId, 'lead-1');
  assert.equal(r1.response.spellBack.website, 's, i, 2, dot, com');

  // Correction save after the caller declines the text instead: the false
  // answer forwards too (a stored yes must never survive a later no).
  h.geminiSend({ toolCall: { functionCalls: [{ id: 'pd1b', name: 'save_phone_demo_lead', args: { businessName: 'Speedy Tow', smsConsent: false } }] } });
  await toolResult('pd1b');
  const saves = h.backendCalls.filter(c => c.action === 'phone-demo-save');
  assert.equal(saves.length, 2);
  assert.equal(saves[1].demo.smsConsent, false);
  assert.equal(saves[1].leadId, 'lead-1'); // correction pass updates the same lead

  // The SMS lane is closed in the stub: the result must say so, never "sent".
  h.geminiSend({ toolCall: { functionCalls: [{ id: 'pd2', name: 'send_demo_code', args: {} }] } });
  const r2 = await toolResult('pd2');
  const codeCall = h.backendCalls.find(c => c.action === 'phone-demo-code');
  assert.ok(codeCall); assert.equal(codeCall.leadId, 'lead-1');
  assert.equal(r2.response.sent, false);
  assert.equal(r2.response.mode, 'caller_id');

  // Recap before/after save carries the saved lead id.
  h.geminiSend({ toolCall: { functionCalls: [{ id: 'pd3', name: 'send_demo_recap', args: { summary: 'Demo covered emergency towing questions.' } }] } });
  await waitFor(() => h.backendCalls.some(c => c.action === 'phone-demo-recap'));
  const recap = h.backendCalls.find(c => c.action === 'phone-demo-recap');
  assert.equal(recap.leadId, 'lead-1');
  assert.match(recap.summary, /emergency towing/);

  // Phase 2 booking tools: availability carries the stated preference;
  // book_call carries the saved lead id + the exact slot + the in-flow
  // consent answer, and its result returns to the model truthfully.
  h.geminiSend({ toolCall: { functionCalls: [{ id: 'pb1', name: 'get_availability', args: { day: 'tomorrow', dayPart: 'morning' } }] } });
  const ra = await toolResult('pb1');
  const availCall = h.backendCalls.find(c => c.action === 'phone-booking-availability');
  assert.ok(availCall); assert.equal(availCall.day, 'tomorrow'); assert.equal(availCall.dayPart, 'morning');
  assert.equal(ra.response.ok, true);

  h.geminiSend({ toolCall: { functionCalls: [{ id: 'pb2', name: 'book_call', args: { slotStart: '2026-11-18T16:00:00.000Z', smsConsent: true } }] } });
  const rb = await toolResult('pb2');
  const bookCallReq = h.backendCalls.find(c => c.action === 'phone-booking-book');
  assert.ok(bookCallReq); assert.equal(bookCallReq.leadId, 'lead-1');
  assert.equal(bookCallReq.slotStart, '2026-11-18T16:00:00.000Z');
  assert.equal(bookCallReq.smsConsent, true);
  assert.equal(rb.response.ok, true);
  client.close();
});

test('rescue text: finish() asks the backend for the rescue only when a lead was saved, no recap ran, and no transfer happened', async (t) => {
  // One full session per case — finish() is first-wins per session, and
  // the warm-transfer machinery is already covered by its own test; here
  // the transferred case is driven only far enough for the bridge leg to
  // bridge (which sets s.transferred and runs finish() itself).
  const rescueCalls = (h) => h.backendCalls.filter(c => c.action === 'phone-demo-rescue');

  // Case 1 — lead saved, call ends (media stop) with NO recap: rescue fires
  // exactly once, carrying the saved lead id.
  {
    const h = makeHarness({ phoneDemo: true }); t.after(() => h.geminiWss.close());
    const telnyx = createTelnyx({ api: h.api, env: await h.env(), fetchImpl: h.fetchImpl });
    const { client } = await startCall(t, h, telnyx, 'v2:leg-rescue-1');
    h.geminiSend({ serverContent: { turnComplete: true } });
    h.geminiSend({ toolCall: { functionCalls: [{ id: 'rs1', name: 'save_phone_demo_lead', args: { businessName: 'Speedy Tow', smsConsent: true } }] } });
    await waitFor(() => h.geminiReceived.some(m => m.toolResponse?.functionResponses?.[0]?.id === 'rs1'));
    client.send(JSON.stringify({ event: 'stop', stop: { call_control_id: 'v2:leg-rescue-1' } }));
    await waitFor(() => h.backendCalls.some(c => c.action === 'end'));
    assert.equal(rescueCalls(h).length, 1);
    assert.equal(rescueCalls(h)[0].leadId, 'lead-1');
    client.close();
  }

  // Case 2 — lead saved AND send_demo_recap called: NO rescue (the recap
  // already carried the demo link; the backend dedupe is the second lock).
  {
    const h = makeHarness({ phoneDemo: true }); t.after(() => h.geminiWss.close());
    const telnyx = createTelnyx({ api: h.api, env: await h.env(), fetchImpl: h.fetchImpl });
    const { client } = await startCall(t, h, telnyx, 'v2:leg-rescue-2');
    h.geminiSend({ serverContent: { turnComplete: true } });
    h.geminiSend({ toolCall: { functionCalls: [{ id: 'rs2a', name: 'save_phone_demo_lead', args: { businessName: 'Speedy Tow', smsConsent: true } }] } });
    await waitFor(() => h.geminiReceived.some(m => m.toolResponse?.functionResponses?.[0]?.id === 'rs2a'));
    h.geminiSend({ toolCall: { functionCalls: [{ id: 'rs2b', name: 'send_demo_recap', args: { summary: 'Covered towing questions.' } }] } });
    await waitFor(() => h.backendCalls.some(c => c.action === 'phone-demo-recap'));
    client.send(JSON.stringify({ event: 'stop', stop: { call_control_id: 'v2:leg-rescue-2' } }));
    await waitFor(() => h.backendCalls.some(c => c.action === 'end'));
    assert.equal(rescueCalls(h).length, 0);
    client.close();
  }

  // Case 3 — NO lead was ever saved: NO rescue (nothing to rescue to).
  {
    const h = makeHarness({ phoneDemo: true }); t.after(() => h.geminiWss.close());
    const telnyx = createTelnyx({ api: h.api, env: await h.env(), fetchImpl: h.fetchImpl });
    const { client } = await startCall(t, h, telnyx, 'v2:leg-rescue-3');
    h.geminiSend({ serverContent: { turnComplete: true } });
    client.send(JSON.stringify({ event: 'stop', stop: { call_control_id: 'v2:leg-rescue-3' } }));
    await waitFor(() => h.backendCalls.some(c => c.action === 'end'));
    assert.equal(rescueCalls(h).length, 0);
    client.close();
  }

  // Case 4 — lead saved, then the call warm-transfers and bridges: NO
  // rescue (the caller reached a human), even though no recap ran.
  {
    const h = makeHarness({ phoneDemo: true }); t.after(() => h.geminiWss.close());
    const telnyx = createTelnyx({ api: h.api, env: await h.env(), fetchImpl: h.fetchImpl });
    const legA4 = 'v2:leg-rescue-4';
    const { client } = await startCall(t, h, telnyx, legA4);
    h.geminiSend({ serverContent: { turnComplete: true } });
    h.geminiSend({ toolCall: { functionCalls: [{ id: 'rs4a', name: 'save_phone_demo_lead', args: { businessName: 'Speedy Tow', smsConsent: true } }] } });
    await waitFor(() => h.geminiReceived.some(m => m.toolResponse?.functionResponses?.[0]?.id === 'rs4a'));
    h.geminiSend({ toolCall: { functionCalls: [{ id: 'rs4b', name: 'transfer_call', args: { summary: 'Caller wants Ron' } }] } });
    await waitFor(() => h.telnyxCalls.some(c => /\/calls$/.test(c.url)), 9000); // dial after the 2.5 s pause
    const dial = h.telnyxCalls.find(c => /\/calls$/.test(c.url));
    const fire = async (id, event_type, payload) => { const b = evtBody(id, event_type, payload); await telnyx.handleWebhook(Buffer.from(b), signHeaders(b)); await telnyx.whenIdle(); };
    await fire('evt-r4-init', 'call.initiated', { call_control_id: LEG_B, direction: 'outgoing', from: '+17723624949', to: '+19547706622', client_state: dial.body.client_state });
    await fire('evt-r4-ans', 'call.answered', { call_control_id: LEG_B, client_state: dial.body.client_state });
    await fire('evt-r4-spoke', 'call.speak.ended', { call_control_id: LEG_B, client_state: dial.body.client_state });
    await fire('evt-r4-gather', 'call.gather.ended', { call_control_id: LEG_B, client_state: dial.body.client_state, digits: '1' }); // press 1 -> bridge -> finish()
    await waitFor(() => h.backendCalls.some(c => c.action === 'end'));
    assert.equal(rescueCalls(h).length, 0);
    client.close();
  }
});

test('phone demo guard: check_demo_code before any save answers lead_not_saved without a backend call', async (t) => {
  const h = makeHarness({ phoneDemo: true }); t.after(() => h.geminiWss.close());
  const telnyx = createTelnyx({ api: h.api, env: await h.env(), fetchImpl: h.fetchImpl });
  const { client } = await startCall(t, h, telnyx, 'v2:leg-pd-guard');
  h.geminiSend({ serverContent: { turnComplete: true } });
  h.geminiSend({ toolCall: { functionCalls: [{ id: 'pdg1', name: 'check_demo_code', args: { code: '4321' } }] } });
  await waitFor(() => h.geminiReceived.some(m => m.toolResponse?.functionResponses?.[0]?.id === 'pdg1'));
  const fr = h.geminiReceived.find(m => m.toolResponse?.functionResponses?.[0]?.id === 'pdg1').toolResponse.functionResponses[0];
  assert.equal(fr.response.verified, false);
  assert.equal(fr.response.reason, 'lead_not_saved');
  assert.equal(h.backendCalls.some(c => c.action === 'phone-demo-verify'), false);
  client.close();
});

test('latency: SILENCE_GAP_MS is 1000, aligned with the phone VAD silenceDurationMs', () => {
  assert.equal(SILENCE_GAP_MS, 1000);
});

test('latency tracker: conversational turns measure last speech end -> first outbound of the reply', () => {
  const tr = createLatencyTracker('telnyx');
  tr.noteSetup('initiated', 1000);
  tr.noteOutbound(1400); // greeting: no caller burst yet -> no conversational turn
  // Burst 1: speech ending at 3000, a 300 ms non-speech gap completes it.
  tr.noteInbound(2000, { speech: true }); tr.noteInbound(2500, { speech: true }); tr.noteInbound(3000, { speech: true });
  tr.noteInbound(3300, { speech: false });
  tr.noteOutbound(4000); // reply: conv latency = 4000 - 3000 = 1000
  tr.noteOutbound(4100); // same outbound turn: must NOT record a second conv turn
  assert.equal(tr.snapshot().convTurns.length, 1);
  // Burst 2: a 100 ms mid-word pause must NOT split the burst; the reply is
  // measured from the burst's true end (6000), and the outbound frame itself
  // is the first observer of the completing gap.
  tr.noteInbound(5000, { speech: true }); tr.noteInbound(5400, { speech: true });
  tr.noteInbound(5500, { speech: false });
  tr.noteInbound(5600, { speech: true }); tr.noteInbound(6000, { speech: true });
  tr.noteOutbound(7000); // conv latency = 7000 - 6000 = 1000
  const snap = tr.snapshot();
  assert.deepEqual(snap.convTurns, [
    { t_last_speech_end: 3000, t_first_out: 4000, conv_turn_latency_ms: 1000 },
    { t_last_speech_end: 6000, t_first_out: 7000, conv_turn_latency_ms: 1000 },
  ]);
  assert.equal(snap.convTurnLatencyAvgMs, 1000);
  assert.equal(snap.convTurnLatencyMedianMs, 1000);
  assert.equal(snap.convTurnLatencyP95Ms, 1000);
  // Legacy turns are still produced alongside, unchanged in shape.
  assert.equal(snap.turns.length, 2);
  assert.equal(snap.turns[0].t_last_in, 3300);
  assert.equal(typeof snap.turnLatencyAvgMs, 'number');
});

test('latency tracker: a burst not yet completed (gap < 250 ms) records no conversational turn', () => {
  const tr = createLatencyTracker('telnyx');
  tr.noteInbound(1000, { speech: true }); tr.noteInbound(1100, { speech: true });
  tr.noteOutbound(1200); // only 100 ms after last speech: burst not completed
  const snap = tr.snapshot();
  assert.deepEqual(snap.convTurns, []);
  assert.equal(snap.convTurnLatencyAvgMs, null);
  assert.equal(snap.convTurnLatencyMedianMs, null);
  assert.equal(snap.convTurnLatencyP95Ms, null);
});

test('latency tracker: no speech flags ever supplied -> convTurns empty and conv summaries null (legacy shape)', () => {
  const tr = createLatencyTracker('twilio');
  tr.noteInbound(1000); tr.noteInbound(1200);
  tr.noteOutbound(2000);
  const snap = tr.snapshot();
  assert.equal(snap.turns.length, 1);
  assert.deepEqual(snap.convTurns, []);
  assert.equal(snap.convTurnLatencyAvgMs, null);
  assert.equal(snap.convTurnLatencyMedianMs, null);
  assert.equal(snap.convTurnLatencyP95Ms, null);
});

test('speech energy: silence sits far below the RMS threshold, clear speech above it', () => {
  assert.equal(SPEECH_RMS_THRESHOLD, 250);
  const silence = Buffer.alloc(640).toString('base64'); // PCM16 zeros
  assert.equal(pcm16Base64Rms(silence), 0);
  assert.equal(isSpeechPcm16(silence), false);
  const loud = Buffer.alloc(640);
  for (let i = 0; i < loud.length / 2; i++) loud.writeInt16LE(5000, i * 2);
  assert.equal(pcm16Base64Rms(loud.toString('base64')), 5000);
  assert.equal(isSpeechPcm16(loud.toString('base64')), true);
});

test('watchdogShouldFire: fires only when every condition holds', () => {
  const base = { ended: false, transferring: false, gateOpen: true, pendingTools: 0, callerSpoke: true, lastOutboundAt: 10000, lastCallerSpeechAt: 10000, watchdogFires: 0, lastWatchdogAt: null };
  assert.equal(watchdogShouldFire(base, 20000), true); // 10 s of mutual silence
  assert.equal(watchdogShouldFire(base, 14500), true); // exactly at the 4500 ms threshold
  assert.equal(watchdogShouldFire(base, 14499), false); // 1 ms under it (the ~3 s STEP-6 pause sits safely below)
  assert.equal(watchdogShouldFire({ ...base, ended: true }, 20000), false);
  assert.equal(watchdogShouldFire({ ...base, transferring: true }, 20000), false);
  assert.equal(watchdogShouldFire({ ...base, gateOpen: false }, 20000), false);
  assert.equal(watchdogShouldFire({ ...base, pendingTools: 1 }, 20000), false);
  assert.equal(watchdogShouldFire({ ...base, callerSpoke: false }, 20000), false);
  assert.equal(watchdogShouldFire({ ...base, lastOutboundAt: 17000 }, 20000), false); // Aspen spoke 3 s ago
  assert.equal(watchdogShouldFire({ ...base, lastCallerSpeechAt: 17000 }, 20000), false); // caller spoke 3 s ago
  assert.equal(watchdogShouldFire({ ...base, lastOutboundAt: null }, 20000), false);
  assert.equal(watchdogShouldFire({ ...base, lastCallerSpeechAt: null }, 20000), false);
  assert.equal(watchdogShouldFire({ ...base, watchdogFires: 2 }, 60000), false); // per-call cap
  assert.equal(watchdogShouldFire({ ...base, watchdogFires: 1, lastWatchdogAt: 15000 }, 20000), false); // 20 s refire suppression
  assert.equal(watchdogShouldFire({ ...base, watchdogFires: 1, lastWatchdogAt: 0, lastOutboundAt: 10000, lastCallerSpeechAt: 10000 }, 20000), true); // suppression window elapsed
  assert.equal(watchdogShouldFire(null, 20000), false);
});

test('VAD knob: parsePhoneVadSilenceMs accepts only integers in [700, 1500], else exactly 1000', () => {
  assert.deepEqual(parsePhoneVadSilenceMs(undefined), { ms: 1000, overridden: false });
  assert.deepEqual(parsePhoneVadSilenceMs(''), { ms: 1000, overridden: false });
  assert.deepEqual(parsePhoneVadSilenceMs('800'), { ms: 800, overridden: true });
  assert.deepEqual(parsePhoneVadSilenceMs('700'), { ms: 700, overridden: true });
  assert.deepEqual(parsePhoneVadSilenceMs('1500'), { ms: 1500, overridden: true });
  assert.deepEqual(parsePhoneVadSilenceMs('699'), { ms: 1000, overridden: false });
  assert.deepEqual(parsePhoneVadSilenceMs('1501'), { ms: 1000, overridden: false });
  assert.deepEqual(parsePhoneVadSilenceMs('abc'), { ms: 1000, overridden: false });
  assert.deepEqual(parsePhoneVadSilenceMs('800.5'), { ms: 1000, overridden: false });
});

test('VAD knob: PHONE_VAD_SILENCE_MS=800 lands in the Gemini setup payload', async (t) => {
  const h = makeHarness(); t.after(() => h.geminiWss.close());
  const env = { ...(await h.env()), PHONE_VAD_SILENCE_MS: '800' };
  const telnyx = createTelnyx({ api: h.api, env, fetchImpl: h.fetchImpl });
  const { client } = await startCall(t, h, telnyx, 'v2:leg-vad-800');
  const setup = h.geminiReceived.find(m => m.setup);
  assert.equal(setup.setup.realtimeInputConfig.automaticActivityDetection.silenceDurationMs, 800);
  client.close();
});

test('tool call record: create/finish produce the { name, action, startedAt, durationMs, ok } shape', () => {
  const rec = createToolCallRecord('save_phone_demo_lead', 'phone-demo-save', 1000);
  assert.deepEqual(rec, { name: 'save_phone_demo_lead', action: 'phone-demo-save', startedAt: 1000, durationMs: 0, ok: false });
  finishToolCallRecord(rec, true, 1750);
  assert.deepEqual(rec, { name: 'save_phone_demo_lead', action: 'phone-demo-save', startedAt: 1000, durationMs: 750, ok: true });
});

test('greeting prefetch: backend start fires at call.initiated, before any media socket, and is awaited (not re-called) at media start', async (t) => {
  const h = makeHarness(); t.after(() => h.geminiWss.close());
  const telnyx = createTelnyx({ api: h.api, env: await h.env(), fetchImpl: h.fetchImpl });
  const legA = 'v2:leg-prefetch';
  const body = evtBody(`evt-init-${legA}`, 'call.initiated', { call_control_id: legA, direction: 'incoming', from: '+15551234567', to: '+17723624949', connection_id: 'conn-1' });
  await telnyx.handleWebhook(Buffer.from(body), signHeaders(body));
  await telnyx.whenIdle();
  // No media socket exists yet, but the start config fetch is already done.
  assert.equal(h.backendCalls.filter(c => c.action === 'start').length, 1);
  const { client } = await startCallRest(t, h, telnyx, legA);
  assert.equal(h.backendCalls.filter(c => c.action === 'start').length, 1); // media start awaited the prefetch
  client.close();
});

// Media connection for a call whose webhook was already fired by the test.
async function startCallRest(t, h, telnyx, legA) {
  const mediaWss = new WebSocketServer({ port: 0 });
  t.after(() => mediaWss.close());
  mediaWss.on('connection', (ws) => telnyx.handleConnection(ws));
  const client = new WebSocket(`ws://127.0.0.1:${mediaWss.address().port}`);
  await new Promise(r => client.on('open', r));
  client.send(JSON.stringify({ event: 'start', stream_id: 'stream-1', start: { call_control_id: legA, media_format: { encoding: 'PCMU', sample_rate: 8000, channels: 1 }, custom_parameters: [{ name: 'token', value: TOKEN }] } }));
  await waitFor(() => h.geminiReceived.some(m => m.setup));
  return { client };
}

test('tool safety: a backend throw still answers the tool call with backend_error and records ok:false', async (t) => {
  const h = makeHarness({ phoneDemo: true }); t.after(() => h.geminiWss.close());
  const api = async (body) => { if (body.action === 'phone-demo-save') throw new Error('[500] backend exploded'); return h.api(body); };
  const telnyx = createTelnyx({ api, env: await h.env(), fetchImpl: h.fetchImpl });
  const { client } = await startCall(t, h, telnyx, 'v2:leg-tool-err');
  h.geminiSend({ serverContent: { turnComplete: true } });
  h.geminiSend({ toolCall: { functionCalls: [{ id: 'err1', name: 'save_phone_demo_lead', args: { businessName: 'Speedy Tow' } }] } });
  await waitFor(() => h.geminiReceived.some(m => m.toolResponse?.functionResponses?.[0]?.id === 'err1'));
  const fr = h.geminiReceived.find(m => m.toolResponse?.functionResponses?.[0]?.id === 'err1').toolResponse.functionResponses[0];
  assert.deepEqual(fr.response, { ok: false, reason: 'backend_error' }); // NEVER unanswered
  client.send(JSON.stringify({ event: 'stop', stop: { call_control_id: 'v2:leg-tool-err' } }));
  await waitFor(() => h.backendCalls.some(c => c.action === 'end'));
  const end = h.backendCalls.find(c => c.action === 'end');
  const rec = end.callReport.tools.find(x => x.name === 'save_phone_demo_lead');
  assert.ok(rec); assert.equal(rec.action, 'phone-demo-save'); assert.equal(rec.ok, false);
  assert.equal(typeof rec.startedAt, 'number'); assert.equal(typeof rec.durationMs, 'number');
  client.close();
});

test('tool timing + end report: happy-path tools land in callReport.tools and phoneDemo carries { leadId, recapCalled }', async (t) => {
  const h = makeHarness({ phoneDemo: true }); t.after(() => h.geminiWss.close());
  const telnyx = createTelnyx({ api: h.api, env: await h.env(), fetchImpl: h.fetchImpl });
  const { client } = await startCall(t, h, telnyx, 'v2:leg-tool-ok');
  h.geminiSend({ serverContent: { turnComplete: true } });
  h.geminiSend({ toolCall: { functionCalls: [{ id: 'ok1', name: 'save_phone_demo_lead', args: { businessName: 'Speedy Tow' } }] } });
  await waitFor(() => h.geminiReceived.some(m => m.toolResponse?.functionResponses?.[0]?.id === 'ok1'));
  client.send(JSON.stringify({ event: 'stop', stop: { call_control_id: 'v2:leg-tool-ok' } }));
  await waitFor(() => h.backendCalls.some(c => c.action === 'end'));
  const end = h.backendCalls.find(c => c.action === 'end');
  assert.deepEqual(end.phoneDemo, { leadId: 'lead-1', recapCalled: false });
  assert.equal(end.callReport.droppedFrames, 0);
  const rec = end.callReport.tools.find(x => x.name === 'save_phone_demo_lead');
  assert.ok(rec); assert.equal(rec.action, 'phone-demo-save'); assert.equal(rec.ok, true);
  assert.equal(typeof rec.startedAt, 'number'); assert.ok(rec.durationMs >= 0);
  client.close();
});

test('end report: non-phone-demo calls omit the phoneDemo field entirely', async (t) => {
  const h = makeHarness(); t.after(() => h.geminiWss.close());
  const telnyx = createTelnyx({ api: h.api, env: await h.env(), fetchImpl: h.fetchImpl });
  const { client } = await startCall(t, h, telnyx, 'v2:leg-no-demo');
  client.send(JSON.stringify({ event: 'stop', stop: { call_control_id: 'v2:leg-no-demo' } }));
  await waitFor(() => h.backendCalls.some(c => c.action === 'end'));
  const end = h.backendCalls.find(c => c.action === 'end');
  assert.equal('phoneDemo' in end, false);
  assert.deepEqual(end.callReport.tools, []);
  client.close();
});

test('dead-air filler: a slow tool gets exactly ONE non-committal acknowledgement, queued before the tool response', async (t) => {
  const h = makeHarness({ phoneDemo: true }); t.after(() => h.geminiWss.close());
  const api = async (body) => { if (body.action === 'phone-demo-save') await new Promise(r => setTimeout(r, 1800)); return h.api(body); };
  const telnyx = createTelnyx({ api, env: await h.env(), fetchImpl: h.fetchImpl });
  const { client } = await startCall(t, h, telnyx, 'v2:leg-filler');
  h.geminiSend({ serverContent: { turnComplete: true } });
  h.geminiSend({ toolCall: { functionCalls: [{ id: 'fill1', name: 'save_phone_demo_lead', args: { businessName: 'Speedy Tow' } }] } });
  await waitFor(() => h.geminiReceived.some(m => m.toolResponse?.functionResponses?.[0]?.id === 'fill1'), 9000);
  const fillers = h.geminiReceived.filter(m => m.clientContent?.turns?.[0]?.parts?.[0]?.text === TOOL_FILLER_NOTE);
  assert.equal(fillers.length, 1);
  assert.match(TOOL_FILLER_NOTE, /one moment while I save that/);
  assert.match(TOOL_FILLER_NOTE, /Do not claim anything has been saved/);
  const fillerIdx = h.geminiReceived.indexOf(fillers[0]);
  const responseIdx = h.geminiReceived.findIndex(m => m.toolResponse?.functionResponses?.[0]?.id === 'fill1');
  assert.ok(fillerIdx < responseIdx); // queued while the tool was still pending, not after its answer
  client.close();
});
