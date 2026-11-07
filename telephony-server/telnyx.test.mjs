// Unit/integration tests for the Telnyx adapter (SCOPE §7). Everything is
// local: the backend api(), the Telnyx REST API and the Gemini Live socket
// are all stubbed — no live calls are made.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { createTelnyx, verifyTelnyxSignature, parseTelnyxStart, telnyxMediaFrame, telnyxClearFrame } from './telnyx.mjs';
import { createLatencyTracker } from './latency.mjs';

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

function makeHarness() {
  const backendCalls = [], telnyxCalls = [];
  const api = async (body) => {
    backendCalls.push(body);
    if (body.action === 'telnyx-start') return { token: TOKEN };
    if (body.action === 'start') return { instructions: 'You are Aspen.', greeting: 'Hello greeting', voice: 'Kore', model: 'test-model', pricing: null, maxSeconds: 600, canTransfer: true, transferName: 'Ron' };
    if (body.action === 'transfer') return { ok: true, mode: 'bridge-executed', transferPhone: '+19547706622', transferName: 'Ron' };
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
  assert.equal(answer.body.custom_parameters[0].value, TOKEN);

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
  assert.ok(speakCall); assert.match(speakCall.body.payload, /VIP caller needs Ron/); assert.match(speakCall.body.payload, /Press 1/);

  await fire('evt-b-spoke', 'call.speak.ended', { call_control_id: LEG_B, client_state: clientState });
  assert.ok(h.telnyxCalls.some(c => c.url.includes('/actions/gather_using_speak')));

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
