// Live probe — Gemini Live SETUP BISECT for the 2026-11-12 voice outage
// (AiHiddenLeads). Production sessions on BOTH proxies (Edge + VPS, two
// different code versions, two different GOOGLE_API_KEYs, byte-identical
// session config to the working Nov 11 era) die ~0.3 s after the provider
// socket opens: provider close code 1011, clean, BEFORE setupComplete.
// The proxies log only the close CODE — gemini-live-proxy's provider
// onclose (supabase/functions/gemini-live-proxy/index.ts) reads e.code
// and e.wasClean but never e.reason, and provider `error` frames are
// forwarded to the browser without being logged. So Google's own words
// exist ONLY on the provider socket at close time. This probe is the
// only instrument that captures them.
//
// It connects DIRECTLY to the Gemini Live endpoint exactly the way the
// proxy does (same URL, same v1beta surface, API key in the query
// string, setup as the first frame) — no Supabase session, no DB, no
// client socket — in three setup sizes, smallest first:
//
//   minimal  setup = { model } and nothing else.
//   voice    setup = model + the proxy's generationConfig
//            (responseModalities [AUDIO] + speechConfig voice Kore).
//   full     setup = the proxy's COMPLETE current setup payload for a
//            fresh platform-followup homepage session:
//            sessionResumption {}, model, generationConfig,
//            systemInstruction (one-line neutral prompt standing in for
//            the real one), tools (all 9 functionDeclarations verbatim
//            from gemini-live-proxy/index.ts @ 414d348),
//            realtimeInputConfig.automaticActivityDetection (server-VAD
//            variant), outputAudioTranscription {},
//            inputAudioTranscription {}.
//
// Reading the results:
//   minimal dies too   -> provider / model / API-key-project side.
//                         Nothing in OUR setup can explain it.
//   minimal lives,
//   voice dies         -> the generationConfig / speechConfig / voice
//                         name became unacceptable provider-side.
//   voice lives,
//   full dies          -> one of the full-only fields (sessionResumption,
//                         systemInstruction, tools, realtimeInputConfig,
//                         transcription configs) is the poison; narrow by
//                         deleting fields from FULL_SETUP below.
//   all three live     -> the provider accepts this key + payload from
//                         this host; the production failure then lives in
//                         something the probe does NOT reproduce (the
//                         real system prompt's size/content, a resumption
//                         HANDLE presented on reconnect, Deno-vs-Node WS
//                         framing, or the Supabase/Deno egress path).
//
// Evidence rules: GOOGLE_API_KEY is read from the process environment
// and NEVER printed (only its length). Close code + close REASON and
// any provider `error` frames are printed VERBATIM — that text is the
// entire point of the probe.
//
// Usage (on the VPS box, Node v22):
//   set -a; . /etc/aspen-voice.env; set +a        # or export the key any other way
//   node voice-proxy-server/live-probe.mjs          # all three modes, in order
//   node voice-proxy-server/live-probe.mjs full     # one mode only
//
// Optional env overrides (bisect aids; defaults = production values):
//   LIVE_PROBE_MODEL   default gemini-3.8-live (e.g. try
//                      gemini-3.1-flash-live-preview to test whether the
//                      failure follows the model id; it retires Nov 17)
//   LIVE_PROBE_VOICE   default Kore
//   LIVE_PROBE_TIMEOUT_MS  default 20000 (per mode)
//
// Exit code: 0 when every run mode reached setupComplete and was closed
// by the probe itself; 1 when any mode failed to complete setup; 2 for
// usage / environment errors.

const ENDPOINT =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
const MODEL = process.env.LIVE_PROBE_MODEL || 'gemini-3.8-live';
const VOICE = process.env.LIVE_PROBE_VOICE || 'Kore';
const TIMEOUT_MS = Number(process.env.LIVE_PROBE_TIMEOUT_MS || 20000);
const API_KEY = process.env.GOOGLE_API_KEY || '';

if (!API_KEY) {
  console.error('ERROR: GOOGLE_API_KEY is not set in the environment. Aborting (the key is never read from files or printed).');
  process.exit(2);
}

// The proxy's generationConfig, verbatim (gemini-live-proxy/index.ts,
// ws.onopen setup, lines 319-324 @ 414d348).
const GENERATION_CONFIG = {
  responseModalities: ['AUDIO'],
  speechConfig: {
    voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } },
  },
};

// The proxy's tool declarations, verbatim (index.ts lines 327-335 @
// 414d348): select_conversation_language is unconditional; the other
// eight are what a platform-followup homepage session sends.
const FUNCTION_DECLARATIONS = [
  {name:'select_conversation_language',description:'Authorize a language change ONLY after a clear caller request. Server checks actual caller transcription; background speech and foreign greetings do not count. Wait for a successful result before changing language.',parameters:{type:'OBJECT',properties:{language:{type:'STRING'}},required:['language']}},
  {name:'request_conversation_copy',description:'Only after the visitor requests an emailed private transcript and summary and verbally confirms spelled name/email. Shows a separate on-screen email confirmation; never authorizes marketing.',parameters:{type:'OBJECT',properties:{name:{type:'STRING'},email:{type:'STRING'}},required:['name','email']}},
  {name:'recommend_plan',description:'Highlight a reviewed AI Hidden Leads plan after the visitor expresses plan-selection or buying interest. Does not charge or navigate. Use Premium first unless needs warrant more.',parameters:{type:'OBJECT',properties:{plan:{type:'STRING',enum:['essentials','growth','fullservice']}},required:['plan']}},
  {name:'platform_availability',description:'Read real AI Hidden Leads sales-calendar availability; optionally check a requested ISO time and return actual alternatives. Never use for simulated business appointments.',parameters:{type:'OBJECT',properties:{requestedSlot:{type:'STRING',description:'Optional requested appointment ISO date/time including UTC offset, resolved in Eastern unless the caller specified another timezone.'}}}},
  {name:'request_platform_followup',description:'After visitor agrees to AI Hidden Leads sales follow-up, request on-screen confirmation of name/email/phone. Nothing is saved before confirmation.',parameters:{type:'OBJECT',properties:{name:{type:'STRING'},email:{type:'STRING'},phone:{type:'STRING'}},required:['name','email','phone']}},
  {name:'request_platform_appointment',description:'Request on-screen confirmation of a real AI Hidden Leads appointment in an available ISO slot. Requires contact confirmation first.',parameters:{type:'OBJECT',properties:{slotStart:{type:'STRING'}},required:['slotStart']}},
  {name:'get_availability',description:'Read real AI Hidden Leads sales-calendar availability for the slot-offer close. Returns the raw slots plus an offer set of up to 3 real slots (each with spokenLabel; one marked recommended) picked for the visitor preference. Offer ONLY slots from a tool result; never invent a time.',parameters:{type:'OBJECT',properties:{day:{type:'STRING',enum:['today','tomorrow','day_after'],description:"The visitor's stated day preference from the preference-first ask."},dayPart:{type:'STRING',enum:['morning','midday','afternoon','evening'],description:"The visitor's stated part of day, if any."}}}},
  {name:'check_time',description:'Check the exact time the visitor named for an AI Hidden Leads appointment. Returns bookable true with the slot, or bookable false with a reason and nearest real alternatives.',parameters:{type:'OBJECT',properties:{date:{type:'STRING',description:'ET calendar date the visitor named, YYYY-MM-DD.'},time:{type:'STRING',description:'ET wall time the visitor named, e.g. "2:30 PM".'},iso:{type:'STRING',description:'Full ISO datetime instead of date+time, when known.'}}}},
  {name:'book_call',description:'Book the AI Hidden Leads implementation call server-side in an exact slot from get_availability or check_time, using contact details ALREADY confirmed on this session (request_platform_followup) — never re-ask for them. Use ONLY when the visitor will not use the on-screen confirmation. The result reports per-channel confirmation outcomes; claim only what it confirms.',parameters:{type:'OBJECT',properties:{slotStart:{type:'STRING'},smsConsent:{type:'BOOLEAN',description:"The visitor's answer to the confirmation-text permission ask; omit when the demo form already recorded one (the server then uses the stored answer)."}},required:['slotStart']}},
];

// The proxy's full setup for a fresh session (index.ts lines 316-351 @
// 414d348), with the real system prompt replaced by a one-line neutral
// prompt. sessionResumption is {} for a fresh session
// (_shared/session-resumption.ts: sessionResumptionConfig(null) === {}).
const FULL_SETUP = {
  sessionResumption: {},
  model: `models/${MODEL}`,
  generationConfig: GENERATION_CONFIG,
  systemInstruction: { parts: [{ text: 'You are a diagnostic probe assistant. Greet the caller briefly and wait.' }] },
  tools: [{ functionDeclarations: FUNCTION_DECLARATIONS }],
  realtimeInputConfig: {
    automaticActivityDetection: {
      disabled: false,
      startOfSpeechSensitivity: 'START_SENSITIVITY_HIGH',
      endOfSpeechSensitivity: 'END_SENSITIVITY_LOW',
      prefixPaddingMs: 200,
      silenceDurationMs: 700,
    },
  },
  outputAudioTranscription: {},
  inputAudioTranscription: {},
};

const SETUPS = {
  minimal: { model: `models/${MODEL}` },
  voice: { model: `models/${MODEL}`, generationConfig: GENERATION_CONFIG },
  full: FULL_SETUP,
};

const now = (t0) => `+${String(Date.now() - t0).padStart(5, ' ')}ms`;

async function frameText(data) {
  if (typeof data === 'string') return data;
  if (data instanceof Blob) return await data.text();
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (ArrayBuffer.isView(data)) return new TextDecoder().decode(data);
  return String(data);
}

function runMode(mode) {
  return new Promise((resolve) => {
    const setup = SETUPS[mode];
    const t0 = Date.now();
    const state = {
      connected: false,
      setupComplete: false,
      setupCompleteAt: null,
      closedByProbe: false,
      closeCode: null,
      closeReason: null,
      wasClean: null,
      errorFrames: 0,
      finished: false,
    };
    console.log(`\n=== MODE ${mode} ===`);
    console.log(`[${now(t0)}] setup keys: ${Object.keys(setup).join(', ')}`);
    if (mode === 'full') console.log(`[${now(t0)}] setup payload: ${JSON.stringify(setup)}`);

    const ws = new WebSocket(`${ENDPOINT}?key=${API_KEY}`);
    let graceTimer = null;
    let hardTimer = null;

    const finish = () => {
      if (state.finished) return;
      state.finished = true;
      if (graceTimer) clearTimeout(graceTimer);
      if (hardTimer) clearTimeout(hardTimer);
      const verdict = state.setupComplete
        ? (state.closedByProbe ? 'SETUP_OK (probe closed it)' : 'SETUP_OK (provider closed after setup)')
        : 'SETUP_FAILED';
      console.log(
        `RESULT mode=${mode} connected=${state.connected} setupComplete=${state.setupComplete}` +
        ` closeCode=${state.closeCode} closeReason=${JSON.stringify(state.closeReason)}` +
        ` wasClean=${state.wasClean} errorFrames=${state.errorFrames} durationMs=${Date.now() - t0} verdict=${verdict}`,
      );
      resolve(state.setupComplete);
    };

    hardTimer = setTimeout(() => {
      console.log(`[${now(t0)}] TIMEOUT after ${TIMEOUT_MS}ms — forcing close`);
      try { ws.close(1000, 'live-probe timeout'); } catch { /* ignore */ }
      setTimeout(finish, 750);
    }, TIMEOUT_MS);

    ws.addEventListener('open', () => {
      state.connected = true;
      console.log(`[${now(t0)}] WS OPEN — sending setup as first frame`);
      ws.send(JSON.stringify({ setup }));
    });

    ws.addEventListener('message', async (event) => {
      const raw = await frameText(event.data);
      let msg = null;
      try { msg = JSON.parse(raw); } catch { /* non-JSON frame: print raw below */ }
      if (msg && 'setupComplete' in msg) {
        state.setupComplete = true;
        state.setupCompleteAt = Date.now() - t0;
        console.log(`[${now(t0)}] *** setupComplete RECEIVED *** frame: ${raw}`);
        // Short grace window: catches an immediate post-setup kill and
        // any trailing error/goAway frames, then the probe closes.
        graceTimer = setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            state.closedByProbe = true;
            console.log(`[${now(t0)}] setup held — probe closing with 1000`);
            try { ws.close(1000, 'live-probe done'); } catch { /* ignore */ }
          }
        }, 1500);
        return;
      }
      if (msg && msg.error) {
        state.errorFrames += 1;
        // VERBATIM — this may be the only place Google explains itself.
        console.log(`[${now(t0)}] *** PROVIDER ERROR FRAME (verbatim): ${JSON.stringify(msg.error)}`);
        console.log(`[${now(t0)}] full frame: ${raw}`);
        return;
      }
      if (msg && msg.goAway) {
        console.log(`[${now(t0)}] goAway frame: ${raw}`);
        return;
      }
      if (msg && msg.sessionResumptionUpdate) {
        const u = msg.sessionResumptionUpdate;
        const handle = typeof u.newHandle === 'string' ? `${u.newHandle.slice(0, 12)}…(${u.newHandle.length} chars)` : u.newHandle;
        console.log(`[${now(t0)}] sessionResumptionUpdate: resumable=${u.resumable} newHandle=${handle}`);
        return;
      }
      console.log(`[${now(t0)}] frame (${raw.length} chars): ${raw.slice(0, 600)}`);
    });

    ws.addEventListener('error', (event) => {
      const detail = event?.error?.message || event?.message || '(no message on error event)';
      console.log(`[${now(t0)}] WS ERROR EVENT: ${detail}`);
    });

    ws.addEventListener('close', (event) => {
      state.closeCode = event.code;
      state.closeReason = event.reason;
      state.wasClean = event.wasClean;
      // VERBATIM close frame — code AND reason, exactly as Google sent.
      console.log(`[${now(t0)}] *** WS CLOSE code=${event.code} reason=${JSON.stringify(event.reason)} wasClean=${event.wasClean} ***`);
      finish();
    });
  });
}

const requested = (process.argv[2] || 'all').toLowerCase();
if (requested !== 'all' && !SETUPS[requested]) {
  console.error(`ERROR: unknown mode "${requested}". Use minimal | voice | full (or no argument for all three).`);
  process.exit(2);
}
const modes = requested === 'all' ? Object.keys(SETUPS) : [requested];

console.log(`live-probe: endpoint=${ENDPOINT}`);
console.log(`live-probe: model=${MODEL} voice=${VOICE} apiKeyLen=${API_KEY.length} node=${process.version}`);

let allOk = true;
for (const mode of modes) {
  const ok = await runMode(mode);
  allOk = allOk && ok;
}
console.log(`\nlive-probe: overall ${allOk ? 'SETUP_OK for all run modes' : 'AT LEAST ONE MODE FAILED SETUP — see RESULT lines above'}`);
process.exit(allOk ? 0 : 1);
