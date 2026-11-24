// Manager-leg briefing in Aspen's own voice (Handoff improvement
// batch, 2026-11-12). Ron's live test: the press-1 briefing on the
// manager leg was read by Twilio's built-in robotic TTS. This module
// synthesizes the SAME briefing text with the Gemini TTS model in
// Aspen's prebuilt voice (Kore — the voice the Live proxy uses for
// her), wraps the returned PCM in a WAV header with the repo's
// existing pcmWav() helper, and the handoff function stores it where
// Twilio can fetch it, so the manager leg <Play>s her voice inside
// the existing press-1 <Gather>. Every failure path returns null and
// the caller falls back to the current Twilio <Say> briefing — the
// handoff must never fail because the nicer voice did.
//
// Item 11 fix (2026-11-21): synthesis originally started only when
// the visitor leg joined the conference, in parallel with the
// owner dial — a fast answer beat it and the owner leg's single
// storage lookup silently fell back to <Say> forever. The handoff
// function now synthesizes ALL THREE spoken lines (briefing,
// connecting, stay) at handoff-ARM time (token issuance), keeps
// the join-time pass as a logged backup, polls briefly on the
// owner leg before falling back, and every synthesis/upload
// failure is logged with its reason via the detailed helpers
// below (synthesizeBriefingWavDetailed / storeHandoffBriefing /
// pollForBriefingUrl).
//
// Synthesis uses the native generateContent endpoint: its audio
// response shape (base64 PCM16, 24 kHz mono, in inlineData) is the
// documented one, unlike the voice-lab function's opaque gateway
// bytes. No new credentials: GOOGLE_API_KEY is the same key family
// every function here already reads.

import { pcmWav } from './recording-audio.ts';
import { isComposedHandoffSummary } from './handoff-summary.ts';

/** Private bucket the session recordings already live in; briefing
 *  audio rides the same service-role upload + signed-URL pattern. */
export const HANDOFF_BRIEFING_BUCKET = 'conversation-recordings';

/** Aspen's prebuilt Gemini voice — the same voiceName the Live
 *  proxy's setup sends for her (gemini-live-proxy: voice defaults
 *  to 'Kore'). */
export const HANDOFF_BRIEFING_VOICE = 'Kore';

export const HANDOFF_BRIEFING_TTS_MODEL = 'gemini-3.1-flash-tts-preview';

/** Deterministic storage path per handoff — no schema change: the
 *  owner-leg action derives the path from the handoff id it already
 *  has and mints a fresh signed URL at answer time. */
export function handoffBriefingPath(handoffId: string): string {
  return `handoff-briefings/${handoffId}.wav`;
}

/** Deterministic path for the manager-side "connecting you now"
 *  line (Item 11 fix, 2026-11-21): the fixed lines are synthesized
 *  in Aspen's voice at the same arm moment as the briefing, so no
 *  leg of the manager handoff needs the carrier's <Say> voice. */
export function handoffConnectingPath(handoffId: string): string {
  return `handoff-briefings/${handoffId}-connecting.wav`;
}

/** Deterministic path for the visitor-side stay line (Item 11 fix,
 *  2026-11-21) — same treatment as the connecting line. */
export function handoffStayPath(handoffId: string): string {
  return `handoff-briefings/${handoffId}-stay.wav`;
}

/** Briefing language (2026-11-16, Ron's ruling): the whisper the
 *  manager hears is OUR words in the SESSION's language — never the
 *  carrier's English default. The language rides the voice
 *  session's own config (startLanguage / uiLocale); no schema
 *  change on the handoff row. */
export type BriefingLanguage = 'en' | 'pt' | 'es' | 'fr';

export function briefingLanguageFrom(signals: { startLanguage?: unknown; uiLocale?: unknown }): BriefingLanguage {
  const s = `${String(signals.startLanguage ?? '')} ${String(signals.uiLocale ?? '')}`.toLowerCase();
  // French first: its tokens ('french', 'français', 'fr-ca') contain
  // neither 'pt' nor 'es', but checking it first keeps that true by
  // construction rather than by accident.
  if (s.includes('french') || s.includes('français') || s.includes('francais') || s.includes('fr-ca')) return 'fr';
  if (s.includes('portug') || s.includes('pt')) return 'pt';
  if (s.includes('span') || s.includes('es')) return 'es';
  return 'en';
}

/** BCP-47 tag for the Twilio <Say language> attribute. */
export function briefingSayLanguage(language: BriefingLanguage): string {
  return language === 'pt' ? 'pt-BR' : language === 'es' ? 'es-ES' : language === 'fr' ? 'fr-CA' : 'en-US';
}

/** The one briefing text, shared by the <Say> fallback and the TTS
 *  input so the two can never diverge. English wording identical to
 *  what browser-voice-handoff spoke through Twilio TTS before this
 *  batch; PT/ES are the same words in the session's language
 *  (2026-11-16).
 *
 *  SUMMARY RULE (fix batch 2026-11-24): the stored summary is
 *  embedded ONLY when it is a composed summary in the exact
 *  template _shared/handoff-summary.ts builds from structured
 *  facts. Anything else — above all a legacy row still carrying
 *  the raw-ASR stitch the Live proxy used to write every turn —
 *  is treated as NO summary, and the briefing falls back to the
 *  clean templated line below. Raw caller ASR is never spoken to
 *  the manager. */
export function managerBriefingText(handoff: { manager_name?: unknown; summary?: unknown }, language: BriefingLanguage = 'en'): string {
  const name = typeof handoff.manager_name === 'string' && handoff.manager_name.trim() ? handoff.manager_name : 'the manager';
  const summary = isComposedHandoffSummary(handoff.summary) ? (handoff.summary as string).trim() : null;
  if (language === 'pt') return `Olá ${name}. Um visitante do site está esperando. Esta é uma transferência automática. ${summary ?? 'O visitante pediu para falar com a sua equipe.'} Pressione 1 para aceitar e conectar. Pressione qualquer outra tecla para recusar.`;
  if (language === 'es') return `Hola ${name}. Un visitante del sitio web está esperando. Esta es una transferencia automática. ${summary ?? 'El visitante ha pedido hablar con su equipo.'} Presione 1 para aceptar y conectar. Presione cualquier otra tecla para rechazar.`;
  if (language === 'fr') return `Bonjour ${name}. Un visiteur du site Web attend. Il s'agit d'un transfert automatique. ${summary ?? 'Le visiteur a demandé à parler à votre équipe.'} Appuyez sur 1 pour accepter et vous connecter. Appuyez sur n'importe quelle autre touche pour refuser.`;
  return `Hello ${name}. A website visitor is waiting. This is an automated handoff. ${summary ?? 'The visitor has requested to speak with your team.'} Press 1 to accept and connect. Press any other key to decline.`;
}

/** Visitor-side line while the manager is being dialed. */
export function handoffStayLine(language: BriefingLanguage): string {
  if (language === 'pt') return 'Por favor, aguarde na linha — vou ficar aqui até você ser conectado com o gerente, depois eu saio.';
  if (language === 'es') return 'Por favor, permanezca en línea — me quedaré hasta que esté conectado con el gerente, luego me retiraré.';
  if (language === 'fr') return 'Veuillez rester en ligne — je resterai jusqu\'à ce que vous soyez connecté avec le gérant, puis je me retirerai.';
  return "Please stay here — I'll stay on until you're connected with the manager, then I'll step away.";
}

/** Manager-side line once he presses 1. */
export function handoffConnectingLine(language: BriefingLanguage): string {
  if (language === 'pt') return 'Conectando você agora.';
  if (language === 'es') return 'Conectándolo ahora.';
  if (language === 'fr') return 'Je vous connecte maintenant.';
  return 'Connecting you now.';
}

/** Extract the PCM16 bytes from a generateContent AUDIO response:
 *  candidates[0].content.parts[*].inlineData.data (base64). Returns
 *  null on any shape mismatch — callers treat null as "use <Say>". */
export function ttsPcmFromResponse(payload: unknown): Uint8Array | null {
  try {
    const parts = (payload as { candidates?: { content?: { parts?: unknown } }[] } | null)?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) return null;
    for (const part of parts) {
      const data = (part as { inlineData?: { data?: unknown } } | null)?.inlineData?.data;
      if (typeof data === 'string' && data.length > 0) {
        const binary = atob(data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** Why a synthesis produced no audio (Item 11 fix, 2026-11-21):
 *  the original module returned a bare null on every failure path,
 *  so a dead whisper left no trace in the logs and the manager leg
 *  silently fell back to the carrier voice forever. Every failure
 *  now carries one of these reasons, and the storing caller logs
 *  it as a structured event. */
export type BriefingSynthesisFailure =
  | 'no_api_key'
  | 'empty_text'
  | 'http_error'
  | 'no_audio_in_payload'
  | 'fetch_exception';

export interface BriefingSynthesisOutcome {
  wav: Uint8Array | null;
  /** Null exactly when wav is non-null. */
  failure: BriefingSynthesisFailure | null;
  /** Set on 'http_error'. */
  httpStatus?: number;
  /** Short provider/exception detail for the log line, when any. */
  detail?: string;
}

/** Synthesize as a complete WAV (24 kHz mono PCM16 — the TTS
 *  model's output rate, matching pcmWav's production use for
 *  assistant audio), reporting WHY when it cannot. Never throws. */
export async function synthesizeBriefingWavDetailed(
  text: string,
  opts: { apiKey?: string; voice?: string; fetchImpl?: typeof fetch },
): Promise<BriefingSynthesisOutcome> {
  const apiKey = opts.apiKey || '';
  if (!apiKey) return { wav: null, failure: 'no_api_key' };
  if (!text.trim()) return { wav: null, failure: 'empty_text' };
  const doFetch = opts.fetchImpl ?? fetch;
  try {
    const res = await doFetch(`https://generativelanguage.googleapis.com/v1beta/models/${HANDOFF_BRIEFING_TTS_MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: opts.voice || HANDOFF_BRIEFING_VOICE } } },
        },
      }),
    });
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.text()).slice(0, 300); } catch { /* status alone still logs */ }
      return { wav: null, failure: 'http_error', httpStatus: res.status, detail: detail || undefined };
    }
    const pcm = ttsPcmFromResponse(await res.json());
    if (!pcm || pcm.length === 0) return { wav: null, failure: 'no_audio_in_payload' };
    return { wav: pcmWav([pcm], 24000), failure: null };
  } catch (e) {
    return { wav: null, failure: 'fetch_exception', detail: e instanceof Error ? e.message : 'error' };
  }
}

/** Synthesize the briefing as a complete WAV. Returns null on ANY
 *  failure (no key, HTTP error, unexpected payload) so the caller
 *  falls back to <Say>. Thin wrapper over the detailed variant —
 *  callers that need the failure reason use that one. */
export async function synthesizeBriefingWav(
  text: string,
  opts: { apiKey?: string; voice?: string; fetchImpl?: typeof fetch },
): Promise<Uint8Array | null> {
  return (await synthesizeBriefingWavDetailed(text, opts)).wav;
}

/** One structured log line per briefing-store outcome, so a whisper
 *  failure is findable in the function logs by event name instead
 *  of vanishing into a null (Item 11 fix, 2026-11-21). */
export type BriefingStoreLog = (event: string, fields: Record<string, unknown>) => void;

const defaultBriefingStoreLog: BriefingStoreLog = (event, fields) => {
  console.info(event, JSON.stringify(fields));
};

export interface HandoffBriefingStoreArgs {
  handoffId: string;
  /** Which spoken line this is: 'briefing' | 'connecting' | 'stay'. */
  line: string;
  /** Deterministic storage path (the handoff*Path helpers). */
  path: string;
  text: string;
  apiKey?: string;
  /** Storage upload adapter: resolves {error:null} on success. */
  upload: (path: string, wav: Uint8Array) => Promise<{ error: { message: string } | null }>;
  log?: BriefingStoreLog;
  fetchImpl?: typeof fetch;
}

/** Synthesize one handoff line in Aspen's voice and store it.
 *  Returns true only when the WAV is in storage. EVERY failure —
 *  synthesis (with its reason) or upload — is logged as a
 *  structured event; success logs 'handoff_briefing_stored' with
 *  the byte count. Never throws: the handoff must not fail because
 *  the nicer voice did. */
export async function storeHandoffBriefing(args: HandoffBriefingStoreArgs): Promise<boolean> {
  const log = args.log ?? defaultBriefingStoreLog;
  try {
    const outcome = await synthesizeBriefingWavDetailed(args.text, { apiKey: args.apiKey, fetchImpl: args.fetchImpl });
    if (!outcome.wav) {
      log('handoff_briefing_synthesis_failed', {
        handoffId: args.handoffId,
        line: args.line,
        reason: outcome.failure,
        ...(outcome.httpStatus ? { httpStatus: outcome.httpStatus } : {}),
        ...(outcome.detail ? { detail: outcome.detail } : {}),
      });
      return false;
    }
    const { error } = await args.upload(args.path, outcome.wav);
    if (error) {
      log('handoff_briefing_upload_failed', { handoffId: args.handoffId, line: args.line, detail: error.message });
      return false;
    }
    log('handoff_briefing_stored', { handoffId: args.handoffId, line: args.line, bytes: outcome.wav.length });
    return true;
  } catch (e) {
    log('handoff_briefing_store_failed', { handoffId: args.handoffId, line: args.line, detail: e instanceof Error ? e.message : 'error' });
    return false;
  }
}

/** Owner-leg lookup budget (Item 11 fix, 2026-11-21): the owner
 *  action polls storage for the briefing WAV for up to ~4 s before
 *  falling back to the carrier <Say> — the fallback is the last
 *  resort, never the default. Bounded well inside Twilio's TwiML
 *  response window; arm-time synthesis makes the first lookup the
 *  one that normally lands. */
export const BRIEFING_OWNER_POLL_BUDGET_MS = 4000;
export const BRIEFING_OWNER_POLL_STEP_MS = 650;

export interface BriefingUrlPollOutcome {
  url: string | null;
  attempts: number;
  waitedMs: number;
  /** Last lookup error seen ('not found' class) when url is null. */
  lastError: string | null;
}

/** Poll a signed-URL lookup until it yields a URL or the budget
 *  runs out. Lookup/sleep/clock are injectable for tests. */
export async function pollForBriefingUrl(args: {
  lookup: () => Promise<{ url: string | null; error?: string | null }>;
  budgetMs?: number;
  stepMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}): Promise<BriefingUrlPollOutcome> {
  const budgetMs = args.budgetMs ?? BRIEFING_OWNER_POLL_BUDGET_MS;
  const stepMs = args.stepMs ?? BRIEFING_OWNER_POLL_STEP_MS;
  const sleep = args.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = args.now ?? (() => Date.now());
  const start = now();
  let attempts = 0;
  let lastError: string | null = null;
  for (;;) {
    attempts++;
    const result = await args.lookup();
    if (result.url) return { url: result.url, attempts, waitedMs: now() - start, lastError: null };
    if (result.error) lastError = result.error;
    if (now() - start >= budgetMs) return { url: null, attempts, waitedMs: now() - start, lastError };
    await sleep(stepMs);
  }
}
