// Chat read-aloud (Ron, 2026-11-16): the chat panel's Listen button
// spoke with the browser's built-in speechSynthesis voice — "an ugly
// browser TTS voice", not hers. Read-aloud now synthesizes with the
// presenter's OWN Gemini voice: the client resolves the voice the
// same way the voice sessions do (persona registry + per-language
// remap — Aspen is Kore in English, Despina in pt-BR, …) and sends
// { text, voice } here. This function validates the voice against
// the known Gemini voice-name allow-list (voice-config's VOICES —
// the one canonical list), caps the text, synthesizes through the
// repo's one TTS→WAV helper (the handoff-briefing module: native
// generateContent, responseModalities AUDIO + prebuiltVoiceConfig,
// PCM wrapped as a 24 kHz WAV) and returns the WAV bytes for the
// client to play. The API key stays server-side: GOOGLE_API_KEY,
// the same key every function here already reads.

import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { VOICES } from '../_shared/voice-config.ts';
import { synthesizeBriefingWav as synthesizeSpeechWav } from '../_shared/handoff-briefing-voice.ts';

/** Read-aloud is for a chat reply, not a narration job: 800 chars
 *  covers several paragraphs and bounds the synthesis cost. Longer
 *  replies are truncated — the request still succeeds. */
export const MAX_TEXT_CHARS = 800;

const ALLOWED_VOICES = new Set<string>(VOICES as readonly string[]);

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body: { text?: unknown; voice?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const voice = typeof body.voice === 'string' ? body.voice : '';
  if (!ALLOWED_VOICES.has(voice)) return json({ error: 'Unknown voice' }, 400);

  const rawText = typeof body.text === 'string' ? body.text.trim() : '';
  if (!rawText) return json({ error: 'Text is required' }, 400);
  const text = rawText.slice(0, MAX_TEXT_CHARS);

  const apiKey = Deno.env.get('GOOGLE_API_KEY');
  if (!apiKey) return json({ error: 'Read-aloud is not configured' }, 500);

  const wav = await synthesizeSpeechWav(text, { apiKey, voice });
  if (!wav) return json({ error: 'Synthesis failed' }, 502);

  return new Response(wav, {
    headers: { ...corsHeaders, 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store' },
  });
});
