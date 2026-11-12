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
// Synthesis uses the native generateContent endpoint: its audio
// response shape (base64 PCM16, 24 kHz mono, in inlineData) is the
// documented one, unlike the voice-lab function's opaque gateway
// bytes. No new credentials: GOOGLE_API_KEY is the same key family
// every function here already reads.

import { pcmWav } from './recording-audio.ts';

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

/** The one briefing text, shared by the <Say> fallback and the TTS
 *  input so the two can never diverge. Identical wording to what
 *  browser-voice-handoff spoke through Twilio TTS before this
 *  batch. */
export function managerBriefingText(handoff: { manager_name?: unknown; summary?: unknown }): string {
  const name = typeof handoff.manager_name === 'string' && handoff.manager_name.trim() ? handoff.manager_name : 'the manager';
  const summary = typeof handoff.summary === 'string' && handoff.summary.trim() ? handoff.summary : 'The visitor has requested to speak with your team.';
  return `Hello ${name}. A website visitor is waiting. This is an automated handoff. ${summary} Press 1 to accept and connect. Press any other key to decline.`;
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

/** Synthesize the briefing as a complete WAV (24 kHz mono PCM16 —
 *  the TTS model's output rate, matching pcmWav's production use
 *  for assistant audio). Returns null on ANY failure (no key, HTTP
 *  error, unexpected payload) so the caller falls back to <Say>. */
export async function synthesizeBriefingWav(
  text: string,
  opts: { apiKey?: string; voice?: string; fetchImpl?: typeof fetch },
): Promise<Uint8Array | null> {
  const apiKey = opts.apiKey || '';
  if (!apiKey || !text.trim()) return null;
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
    if (!res.ok) return null;
    const pcm = ttsPcmFromResponse(await res.json());
    if (!pcm || pcm.length === 0) return null;
    return pcmWav([pcm], 24000);
  } catch {
    return null;
  }
}
