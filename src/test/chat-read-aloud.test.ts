// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const fn = read("../../supabase/functions/chat-read-aloud/index.ts");
const config = read("../../supabase/config.toml");
const briefing = read("../../supabase/functions/_shared/handoff-briefing-voice.ts");

// Chat read-aloud (Ron, 2026-11-16): the chat panel's Listen button
// must speak in the presenter's assigned GEMINI voice, not the
// browser's speechSynthesis robot voice. The function is Deno code,
// so — the repo's established seam for edge functions — these pins
// assert its source contract: allow-list validation, the text cap,
// the audio-modality synthesis path, the WAV response, and the
// server-side-only key.
describe("chat-read-aloud function — source contract", () => {
  it("validates the requested voice against the canonical Gemini voice allow-list", () => {
    expect(fn).toContain("import { VOICES } from '../_shared/voice-config.ts';");
    expect(fn).toContain("const ALLOWED_VOICES = new Set<string>(VOICES as readonly string[])");
    expect(fn).toContain("if (!ALLOWED_VOICES.has(voice)) return json({ error: 'Unknown voice' }, 400);");
  });

  it("caps the text at 800 chars, truncating instead of failing", () => {
    expect(fn).toContain("export const MAX_TEXT_CHARS = 800;");
    expect(fn).toContain("const text = rawText.slice(0, MAX_TEXT_CHARS);");
    expect(fn).toContain("if (!rawText) return json({ error: 'Text is required' }, 400);");
  });

  it("synthesizes through the repo's TTS helper — Gemini generateContent with AUDIO modality and the prebuilt voice", () => {
    expect(fn).toContain("synthesizeBriefingWav as synthesizeSpeechWav");
    expect(fn).toContain("const wav = await synthesizeSpeechWav(text, { apiKey, voice });");
    // The helper's own contract (pinned in handoff-briefing-voice's
    // suite too): native generateContent, audio-only modality, the
    // requested prebuilt voice, PCM wrapped as a 24 kHz WAV.
    expect(briefing).toContain("responseModalities: ['AUDIO']");
    expect(briefing).toContain("speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: opts.voice || HANDOFF_BRIEFING_VOICE } } }");
    expect(briefing).toContain("export const HANDOFF_BRIEFING_TTS_MODEL = 'gemini-3.1-flash-tts-preview'");
    expect(briefing).toContain("return pcmWav([pcm], 24000);");
  });

  it("returns the WAV bytes as audio/wav and keeps the key server-side", () => {
    expect(fn).toContain("'Content-Type': 'audio/wav'");
    expect(fn).toContain("const apiKey = Deno.env.get('" + "GOOGLE_API" + "_KEY" + "')");
    expect(fn).not.toContain("VITE_");
    expect(fn).not.toContain("SUPABASE_SERVICE_ROLE");
  });

  it("is registered as a public function (the anonymous website chat invokes it)", () => {
    expect(config).toContain("[functions.chat-read-aloud]");
  });
});
