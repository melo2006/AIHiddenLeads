// AI Hidden Leads always-on phone bridge: Twilio Media Streams <-> Gemini Live.
// Deploy on any host that keeps WebSockets open (Railway, Render, Fly.io).
// Env: GOOGLE_API_KEY, TELEPHONY_SERVER_SECRET, TELEPHONY_FUNCTION_URL, PORT (optional), GEMINI_MODEL (optional)
import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';

const { GOOGLE_API_KEY, TELEPHONY_SERVER_SECRET, TELEPHONY_FUNCTION_URL } = process.env;
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-live';
const GEMINI_WS = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
for (const [k, v] of Object.entries({ GOOGLE_API_KEY, TELEPHONY_SERVER_SECRET, TELEPHONY_FUNCTION_URL })) if (!v) { console.error(`Missing ${k}`); process.exit(1); }

// ---- G.711 mu-law <-> PCM16 ----
function muToPcm(u) { u = ~u & 0xff; const s = u & 0x80, e = (u >> 4) & 7, m = u & 0x0f; let x = ((m << 3) + 0x84) << e; x -= 0x84; return s ? -x : x; }
function pcmToMu(x) { const BIAS = 0x84, CLIP = 32635; let s = (x >> 8) & 0x80; if (s) x = -x; if (x > CLIP) x = CLIP; x += BIAS; let e = 7; for (let m = 0x4000; (x & m) === 0 && e > 0; e--, m >>= 1); const man = (x >> (e + 3)) & 0x0f; return ~(s | (e << 4) | man) & 0xff; }
/** Twilio 8 kHz mu-law -> Gemini 16 kHz PCM16 (linear upsample). */
export function twilioToGemini(b64) {
  const mu = Buffer.from(b64, 'base64'); const out = Buffer.alloc(mu.length * 4);
  for (let i = 0; i < mu.length; i++) { const a = muToPcm(mu[i]), b = i + 1 < mu.length ? muToPcm(mu[i + 1]) : a; out.writeInt16LE(a, i * 4); out.writeInt16LE((a + b) >> 1, i * 4 + 2); }
  return out.toString('base64');
}
/** Gemini 24 kHz PCM16 -> Twilio 8 kHz mu-law (3-sample average). */
export function geminiToTwilio(b64) {
  const pcm = Buffer.from(b64, 'base64'); const n = Math.floor(pcm.length / 6); const out = Buffer.alloc(n);
  for (let i = 0; i < n; i++) { const o = i * 6; out[i] = pcmToMu(Math.round((pcm.readInt16LE(o) + pcm.readInt16LE(o + 2) + pcm.readInt16LE(o + 4)) / 3)); }
  return out.toString('base64');
}

async function api(body) {
  const r = await fetch(TELEPHONY_FUNCTION_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-telephony-secret': TELEPHONY_SERVER_SECRET }, body: JSON.stringify(body) });
  const text = await r.text(); if (!r.ok) throw new Error(`[${r.status}] ${text}`); return JSON.parse(text);
}

const server = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok'); });
const wss = new WebSocketServer({ server, path: '/media' });

wss.on('connection', (twilioWs) => {
  let streamSid = null, token = null, gemini = null, startedAt = Date.now(), ended = false, timer = null;
  const transcript = [];
  const finish = async () => {
    if (ended) return; ended = true; clearTimeout(timer);
    try { gemini?.close(); } catch {}
    if (token) await api({ action: 'end', token, seconds: Math.round((Date.now() - startedAt) / 1000), transcript }).catch(e => console.error('end failed', e.message));
  };

  twilioWs.on('message', async (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.event === 'start') {
      streamSid = msg.start.streamSid; token = msg.start.customParameters?.token;
      let cfg; try { cfg = await api({ action: 'start', token }); } catch (e) { console.error('start failed', e.message); twilioWs.close(); return; }
      startedAt = Date.now();
      timer = setTimeout(() => { twilioWs.close(); }, cfg.maxSeconds * 1000);
      gemini = new WebSocket(`${GEMINI_WS}?key=${GOOGLE_API_KEY}`);
      gemini.on('open', () => gemini.send(JSON.stringify({ setup: {
        model: `models/${MODEL}`,
        generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: cfg.voice } } } },
        systemInstruction: { parts: [{ text: cfg.instructions }] },
        tools: cfg.canTransfer ? [{ functionDeclarations: [{ name: 'transfer_call', description: `Warm-transfer the caller to ${cfg.transferName}. Say you are connecting them first.`, parameters: { type: 'OBJECT', properties: { summary: { type: 'STRING', description: 'One sentence for the person receiving the call: who is calling and why.' } }, required: ['summary'] } }] }] : [],
        realtimeInputConfig: { automaticActivityDetection: { disabled: false, startOfSpeechSensitivity: 'START_SENSITIVITY_HIGH', endOfSpeechSensitivity: 'END_SENSITIVITY_LOW', prefixPaddingMs: 200, silenceDurationMs: 700 } },
        inputAudioTranscription: {}, outputAudioTranscription: {},
      } })));
      gemini.on('message', async (data) => {
        const m = JSON.parse(data.toString());
        if (m.setupComplete) { gemini.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{ text: cfg.greeting }] }], turnComplete: true } })); return; }
        const sc = m.serverContent;
        if (sc?.interrupted && streamSid) twilioWs.send(JSON.stringify({ event: 'clear', streamSid }));
        for (const part of sc?.modelTurn?.parts || []) if (part.inlineData?.data && streamSid) twilioWs.send(JSON.stringify({ event: 'media', streamSid, media: { payload: geminiToTwilio(part.inlineData.data) } }));
        if (sc?.inputTranscription?.text) transcript.push({ role: 'caller', text: sc.inputTranscription.text });
        if (sc?.outputTranscription?.text) transcript.push({ role: 'assistant', text: sc.outputTranscription.text });
        for (const call of m.toolCall?.functionCalls || []) {
          if (call.name !== 'transfer_call') continue;
          gemini.send(JSON.stringify({ toolResponse: { functionResponses: [{ id: call.id, name: call.name, response: { ok: true } }] } }));
          // Let Aspen finish "connecting you now" before Twilio replaces the stream with the transfer.
          setTimeout(() => api({ action: 'transfer', token, summary: String(call.args?.summary || '').slice(0, 500) }).catch(e => console.error('transfer failed', e.message)), 2500);
        }
      });
      gemini.on('close', () => { if (!ended) twilioWs.close(); });
      gemini.on('error', (e) => console.error('gemini error', e.message));
    } else if (msg.event === 'media' && gemini?.readyState === WebSocket.OPEN) {
      gemini.send(JSON.stringify({ realtimeInput: { audio: { data: twilioToGemini(msg.media.payload), mimeType: 'audio/pcm;rate=16000' } } }));
    } else if (msg.event === 'stop') finish();
  });
  twilioWs.on('close', finish);
});

server.listen(Number(process.env.PORT || 8080), () => console.log('telephony bridge listening'));
