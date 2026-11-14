// Source contracts for the local-first paired playout
// (volume-stream fix, 2026-11-14). These pin the wiring that must
// not regress:
//  - every face GeminiConversation renders runs in the session's
//    resolved stream-audio mode and reports playout telemetry;
//  - a paired chunk in local mode is sent to Simli AND played
//    through the local branch, with the paired shift in the audible
//    schedule and NOT in the caption window;
//  - the stream path keeps the #47 behavior (silent clock + caption
//    shift) untouched behind the same branch;
//  - SimliAvatar's muted mode can never unmute its element, and its
//    sound completion starves instead of engaging the tap;
//  - the speaker slider writes the LOCAL gain (the audible one in
//    local mode) as well as the face instances;
//  - the playoutDiag channel exists on both ends (client post +
//    server append at config.playoutDiag).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const simli = read("../components/SimliAvatar.tsx");
const conversation = read("../components/GeminiConversation.tsx");
const geminiSession = read("../../supabase/functions/gemini-session/index.ts");

const sliceBetween = (text: string, start: string, end: string) => {
  const a = text.indexOf(start);
  const b = text.indexOf(end, a + start.length);
  expect(a).toBeGreaterThanOrEqual(0);
  expect(b).toBeGreaterThan(a);
  return text.slice(a, b);
};
const count = (text: string, needle: string) => text.split(needle).length - 1;

describe("local-first paired playout contracts", () => {
  it("every rendered face gets the session's stream-audio mode and the diag sink", () => {
    expect(count(conversation, "streamAudio={pairedAudibleMode() === 'local' ? 'muted' : 'audible'}")).toBe(3);
    expect(count(conversation, "onPlayoutDiag={handlePlayoutDiag}")).toBe(3);
  });

  it("a paired chunk in local mode plays locally with the shift in the schedule, not the captions", () => {
    const chunk = sliceBetween(conversation, "const playPcmChunk = useCallback", "// Interrupt: drop all queued playback instantly");
    expect(chunk).toContain("pairedAudibleMode() === 'local'");
    expect(chunk).toContain("pairedLocal = true");
    expect(chunk).toContain("if (!pairedVideo || pairedLocal)");
    expect(chunk).toContain("voiceChunkStartAt(now, playTimeRef.current, pairedLocal ? PAIRED_CAPTION_DELAY_SEC : 0)");
    expect(chunk).toContain("pairedCaptionDelaySec(pairedVideo, pairedAudibleMode())");
    // The degrade guard still runs BEFORE the mode branch: a failed
    // send degrades exactly as before, in both modes.
    expect(chunk.indexOf("pairedAudioShouldDegrade(output, wasLive, sendSucceeded)")).toBeLessThan(
      chunk.indexOf("pairedAudibleMode() === 'local'"),
    );
    // The stream path's silent clock survives in the else branch.
    expect(chunk).toContain("clockGain.gain.value = 0");
  });

  it("SimliAvatar muted mode force-mutes in level application and starves instead of tapping", () => {
    const apply = sliceBetween(simli, "const applyPlaybackLevel", "const soundArmedNow");
    expect(apply).toContain('if (streamMuted()) { audio.muted = true; audio.volume = 0; return; }');
    const complete = sliceBetween(simli, "const completeSound = async", "const retrySoundCompletion");
    expect(complete.indexOf("if (streamMuted())")).toBeLessThan(complete.indexOf("pairedPlayout().engage"));
    expect(complete).toContain("runStarve()");
  });

  it("the speaker slider scales the local gain — the audible gain in local mode — and every face", () => {
    const apply = sliceBetween(conversation, "const applyPlaybackVolume = useCallback", "// Silence speaker");
    expect(apply).toContain("speakerGainRef.current.gain.value = effectivePlaybackLevel(speakerMutedRef.current, level)");
    expect(apply).toContain("setPlaybackVolume?.(level)");
  });

  it("playout telemetry posts from the client and appends on the server session row", () => {
    expect(conversation).toContain("playoutDiag: payload");
    expect(conversation).toContain("parentSessionIdRef.current");
    expect(geminiSession).toContain("playoutDiagSchema");
    expect(geminiSession).toContain("playoutDiag:[...priorPlayout,playoutEntry].slice(-30)");
    expect(geminiSession).toContain("if(b.playoutDiag)");
  });
});
