// D1 scripted socket proof — Part 2 voice-proxy move (AiHiddenLeads).
//
// Faithful minimal client for gemini-live-proxy, mirroring the website
// widget's real flow (src/components/GeminiConversation.tsx @ aef47a7):
//   1. GET  voice-agent-public            -> public agent identity (widget does this)
//   2. POST gemini-session                -> single-use session token
//      (public publishable key only; body mirrors the widget's homepage start:
//       visitorKey uuid, agentId, campaign visit on '/', ET hour, consent:true)
//   3. WS   wss://voice-proxy.aihiddenleads.com?token=…&capture=hands-free
//      -> wait for {type:'ready'}, stream silence PCM frames (the real client
//         streams mic frames continuously; silence below its noise gate),
//         one typed text turn mid-hold (the client's own text path, which is
//         what keeps a homepage session "engaged" per homepage-pacing.ts),
//   4. End exactly like the client's End button: {type:'end_session',
//      reason:'user_ended'}, then close(1000).
//
// Evidence rules: the session TOKEN is never printed or written anywhere —
// only its length. Message payloads are logged as type + counts only.
// Usage: node d1-socket-proof.mjs [holdSeconds]   (default 450)

import { readFileSync, appendFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOLD_SECONDS = Number(process.argv[2] || 450);
// Paths resolve relative to this script (voice-proxy-server/ in the repo):
// the repo-root .env sits one level up; the evidence log lands next to the
// script. D1_ENV_FILE / D1_EVIDENCE still override both.
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ENV = process.env.D1_ENV_FILE || join(SCRIPT_DIR, '..', '.env');
const EVIDENCE = process.env.D1_EVIDENCE || join(SCRIPT_DIR, 'd1-evidence.jsonl');

const envText = readFileSync(REPO_ENV, 'utf8');
const pick = (name) => {
  const m = envText.match(new RegExp(`^${name}=(.*)$`, 'm'));
  if (!m) throw new Error(`missing ${name} in repo .env`);
  return m[1].trim();
};
const SUPABASE_URL = pick('VITE_SUPABASE_URL');
const PUBLISHABLE_KEY = pick('VITE_SUPABASE_PUBLISHABLE_KEY'); // public key, ships in the site bundle
const PROXY_HTTP = 'https://voice-proxy.aihiddenleads.com';
const PROXY_WS = 'wss://voice-proxy.aihiddenleads.com';

const t0 = Date.now();
const stamp = () => new Date().toISOString();
const elapsed = () => ((Date.now() - t0) / 1000).toFixed(1);
function log(event, data = {}) {
  const line = JSON.stringify({ t: stamp(), elapsed_s: Number(elapsed()), event, ...data });
  console.log(line);
  try { appendFileSync(EVIDENCE, line + '\n'); } catch { /* evidence file optional */ }
}
const fnHeaders = {
  apikey: PUBLISHABLE_KEY,
  Authorization: `Bearer ${PUBLISHABLE_KEY}`,
  'Content-Type': 'application/json',
};

async function main() {
  log('run_start', { hold_seconds: HOLD_SECONDS, proxy: PROXY_WS, supabase: SUPABASE_URL });

  // Step 0 — public ping of the VPS proxy (same check the runbook uses).
  try {
    const r = await fetch(`${PROXY_HTTP}/?ping=1`, { signal: AbortSignal.timeout(20000) });
    log('proxy_ping', { status: r.status, body: (await r.text()).slice(0, 120) });
  } catch (e) {
    log('proxy_ping_failed', { error: String(e && e.message || e), cause: String(e && e.cause && (e.cause.message || e.cause.code) || '') });
  }

  // Step 1 — public agent identity, exactly like the widget resolves it.
  const pubRes = await fetch(`${SUPABASE_URL}/functions/v1/voice-agent-public`, { headers: fnHeaders });
  const pub = await pubRes.json().catch(() => ({}));
  log('voice_agent_public', { status: pubRes.status, agent_id: pub.id || null, name: pub.name || null });
  if (!pub.id) throw new Error('voice-agent-public did not return an agent id');

  // Step 2 — authorize a real session (widget homepage shape).
  const visitorKey = randomUUID();
  const visitId = randomUUID();
  const hourET = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/New_York' }).format(new Date()));
  const body = {
    visitorKey,
    agentId: pub.id,
    campaign: { visitId, source: '', campaign: '', entryPath: '/' },
    hour: hourET,
    timeZone: 'America/New_York',
    visitorName: '',
    consent: true,
    prewarm: false,
    reconnect: false,
  };
  const sesRes = await fetch(`${SUPABASE_URL}/functions/v1/gemini-session`, {
    method: 'POST', headers: fnHeaders, body: JSON.stringify(body),
  });
  const ses = await sesRes.json().catch(() => ({}));
  log('gemini_session', {
    status: sesRes.status,
    session_id: ses.sessionId || null,
    visit_id: visitId,
    max_seconds: ses.maxSeconds ?? null,
    homepage_sales: ses.homepageSales ?? null,
    token_received: typeof ses.token === 'string' && ses.token.length > 0,
    token_length: typeof ses.token === 'string' ? ses.token.length : 0,
    error: ses.error || null,
  });
  if (sesRes.status !== 200 || !ses.token) throw new Error(`gemini-session failed: HTTP ${sesRes.status} ${ses.error || ''}`);

  // Step 3 — the socket.
  const wsUrl = `${PROXY_WS}?token=${encodeURIComponent(ses.token)}&capture=handsfree`;
  const counts = {};
  let audioBytes = 0, transcriptChars = 0, closedPayload = null, readyAt = null;
  const ws = new WebSocket(wsUrl);
  const connectStart = Date.now();
  log('ws_connecting', { session_id: ses.sessionId });

  const opened = new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('ws open timeout 30s')), 30000);
    ws.addEventListener('open', () => { clearTimeout(to); log('ws_open', { ms: Date.now() - connectStart }); resolve(); });
    ws.addEventListener('error', (e) => { clearTimeout(to); reject(new Error(`ws error during connect: ${e.message || 'unknown'}`)); });
  });
  ws.addEventListener('message', (ev) => {
    try {
      const msg = JSON.parse(String(ev.data));
      counts[msg.type || 'unknown'] = (counts[msg.type || 'unknown'] || 0) + 1;
      if (msg.type === 'audio') audioBytes += String(msg.data || '').length;
      if (msg.type === 'aspen_transcript' || msg.type === 'user_transcript') transcriptChars += String(msg.text || '').length;
      if (msg.type === 'ready' && !readyAt) { readyAt = Date.now(); log('proxy_ready', { ms_from_connect: readyAt - connectStart }); }
      if (msg.type === 'closed' || msg.type === 'error') { closedPayload = { type: msg.type, reason: String(msg.reason || msg.message || '').slice(0, 200), code: msg.code ?? null }; log('proxy_notice', closedPayload); }
    } catch { counts.unparseable = (counts.unparseable || 0) + 1; }
  });
  let serverClose = null;
  const closedPromise = new Promise((resolve) => {
    ws.addEventListener('close', (e) => { serverClose = { code: e.code, wasClean: e.wasClean, at: Date.now() }; log('ws_close_event', serverClose); resolve(); });
  });

  await opened;

  // Hold: continuous silence frames (100 ms of 16 kHz PCM silence every
  // 200 ms — the real client streams mic frames continuously; these are
  // its below-gate silence frames) + one typed text turn at ~40% of hold.
  const silenceB64 = Buffer.alloc(1600 * 2).toString('base64'); // 100 ms, 16-bit mono
  const holdEnd = Date.now() + HOLD_SECONDS * 1000;
  const frameTimer = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'audio', data: silenceB64 }));
  }, 200);
  const textAt = setTimeout(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'text', text: 'I am still here — please keep going.' }));
      log('text_turn_sent', {});
    }
  }, Math.round(HOLD_SECONDS * 0.4) * 1000);
  const holdTimer = setInterval(() => {
    if (Date.now() >= holdEnd || serverClose) {
      clearInterval(holdTimer); clearInterval(frameTimer); clearTimeout(textAt);
      finish();
    }
  }, 500);

  async function finish() {
    const heldSeconds = (Date.now() - connectStart) / 1000;
    if (!serverClose && ws.readyState === WebSocket.OPEN) {
      // Client End-button behaviour, then a clean 1000 close.
      try { ws.send(JSON.stringify({ type: 'end_session', reason: 'user_ended' })); } catch { /* ignore */ }
      setTimeout(() => { try { ws.close(1000); } catch { /* ignore */ } }, 1500);
      await Promise.race([closedPromise, new Promise((r) => setTimeout(r, 8000))]);
    } else {
      await Promise.race([closedPromise, new Promise((r) => setTimeout(r, 2000))]);
    }
    log('run_end', {
      session_id: ses.sessionId, visit_id: visitId,
      held_seconds: Number(heldSeconds.toFixed(1)),
      ready_received: !!readyAt,
      message_counts: counts, audio_b64_chars: audioBytes, transcript_chars: transcriptChars,
      proxy_notice: closedPayload, close: serverClose,
      verdict_socket_side: !serverClose || heldSeconds >= HOLD_SECONDS ? 'see close fields' : 'dropped early',
    });
    process.exit(0);
  }
}

main().catch((e) => { log('fatal', { error: String(e && e.message || e) }); process.exit(2); });
