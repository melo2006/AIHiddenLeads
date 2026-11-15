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

describe("media-element heard engine contracts (volume-speaker fix, 2026-11-14)", () => {
  it("a local chunk is offered to the media element FIRST; the sink graph is the fallback inside the same branch", () => {
    const chunk = sliceBetween(conversation, "const playPcmChunk = useCallback", "// Interrupt: drop all queued playback instantly");
    expect(chunk).toContain("const engine = ensureMediaElement();");
    expect(chunk).toContain("engineRouted = engine.enqueuePcm16(samples, trailTarget);");
    // The graph path survives verbatim behind the refusal branch.
    expect(chunk).toContain("if (!engineRouted) {");
    expect(chunk).toContain("spkGain.connect(mediaOutputNode(ctx))");
    // Engine routing never applies to the stream path's silent clock
    // or while the session is paused.
    expect(chunk).toContain("mediaElementStateRef.current === 'ready' && !captureRef.current.paused");
    // Simli still receives every paired chunk for lip-sync BEFORE
    // the local routing (the send lives in the paired block above).
    expect(chunk.indexOf("sendPcm24k(base64)")).toBeLessThan(chunk.indexOf("engine.enqueuePcm16"));
    // The paired lip offset moves into the engine's trail target.
    expect(chunk).toContain("PAIRED_CAPTION_DELAY_SEC - MEDIA_ELEMENT_PIPELINE_SEC");
    // Engine chunks keep their end-of-chunk bookkeeping via timers,
    // and the drain checks wait for BOTH routes.
    expect(chunk).toContain("engineTimersRef.current.size === 0");
  });

  it("the speaker mute and the slider drive the media element itself (setLevel), gain path untouched", () => {
    const apply = sliceBetween(conversation, "const applyPlaybackVolume = useCallback", "// Silence speaker");
    expect(apply).toContain("mediaElementRef.current?.setLevel({ muted: speakerMutedRef.current, volume: level })");
    const mute = sliceBetween(conversation, "const toggleSpeakerMute = useCallback", "// Apply a speaker-output device");
    expect(mute).toContain("mediaElementRef.current?.setLevel({ muted: next, volume: playbackVolumeRef.current })");
    // The #48 button semantics are unchanged: the amber/red/green
    // controls call these same handlers (pinned in
    // button-state-colors.test.tsx); nothing here re-colours them.
  });

  it("interrupt flushes the engine, stop disposes it, and the engine is primed in the start tap", () => {
    const clear = sliceBetween(conversation, "const clearPlayback = useCallback", "const pauseCapture = useCallback");
    expect(clear).toContain("mediaElementRef.current?.flush()");
    expect(conversation).toContain("mediaElementRef.current?.dispose()");
    // Primed inside the start tap, right after the sink priming and
    // before the timeline reset (so the element unlocks on the tap).
    const prime = sliceBetween(conversation, "mediaOutputNode(playCtx);", "playTimeRef.current = 0;");
    expect(prime).toContain("ensureMediaElement();");
  });

  it("the playout diag stamps the local terminal and the capture processing mode", () => {
    expect(conversation).toContain("terminal: localTerminalDiag()");
    expect(conversation).toContain("cap=${captureModeStamp()}");
    expect(conversation).toContain("applyCaptureProcessing(true)");
    expect(conversation).toContain("applyCaptureProcessing(false)");
  });

  it("every session stamps the diag — go-live (first connect AND reconnect), first chunk, engine transitions", () => {
    // The helper pulls the avatar handle's live snapshot when one
    // answers (the reconnect case: the face never went away) and
    // falls back to a local-path snapshot otherwise.
    expect(conversation).toContain("const stampPlayoutDiag = useCallback(");
    expect(conversation).toContain("mainSlotRef.current?.playoutSnapshot?.()");
    expect(conversation).toContain("avatarRef.current?.playoutSnapshot?.()");
    // goLive is the common point of first connect, reconnect and
    // resume — the stamp lives there, not on any Simli settle point
    // (a reconnect crosses none; Ron's 238 s reconnect session,
    // 2026-11-14, carried no playoutDiag at all).
    const goLive = sliceBetween(conversation, "const goLive = () => {", "openingGateRef.current = true;");
    expect(goLive).toContain("if (!preview && !warm) stampPlayoutDiag();");
    expect(goLive).toContain("diagChunkStampRef.current = false;");
    // The first locally-routed chunk of a session re-stamps with the
    // settled terminal; engine ready/fatal transitions re-stamp too.
    const chunk = sliceBetween(conversation, "const playPcmChunk = useCallback", "// Interrupt: drop all queued playback instantly");
    expect(chunk).toContain("diagChunkStampRef.current = true;");
    expect(chunk).toContain("stampPlayoutDiag();");
    expect(count(conversation, "stampPlayoutDiag();")).toBe(4);
  });

  it("the paired-mode kill switch is untouched by the engine switch", () => {
    expect(conversation).toContain("resolveHeardEngine(window.location.search, stored)");
    expect(count(conversation, "streamAudio={pairedAudibleMode() === 'local' ? 'muted' : 'audible'}")).toBe(3);
  });
});

describe("blob/file heard engine contracts (Publish #54)", () => {
  it("the default construction is the blob engine; the MSE engine is built only in the opt-in branch", () => {
    const ensure = sliceBetween(conversation, "const ensureMediaElement", "const applyCaptureProcessing");
    expect(ensure).toContain("heardEngine() === 'blob'");
    expect(ensure).toContain("new BlobElementPlayout(undefined, onEngineFatal)");
    expect(ensure).toContain("new MediaElementPlayout(undefined, onEngineFatal)");
    // The blob construction comes FIRST in the selection — it is
    // the default the resolver falls through to.
    expect(ensure.indexOf("new BlobElementPlayout")).toBeLessThan(ensure.indexOf("new MediaElementPlayout"));
    // 'sink' constructs no element engine at all.
    expect(ensure).toContain("if (heardEngine() === 'sink') return null;");
  });

  it("the engine-first hold arms for both element engines and never for the sink", () => {
    const chunk = sliceBetween(conversation, "const playPcmChunk = useCallback", "// Interrupt: drop all queued playback instantly");
    expect(chunk).toContain("pairedAudibleMode() !== 'stream' && heardEngine() !== 'sink'");
  });

  it("the diag terminal names the engine that is actually running (kind → sink)", () => {
    const diag = sliceBetween(conversation, "const localTerminalDiag", "const wsRef");
    expect(diag).toContain("engine.kind === 'blob' ? 'blob-element' : 'media-element'");
    expect(diag).toContain("heardEngine() === 'sink' ? 'off' : mediaElementStateRef.current");
  });

  it("the paired-stream kill switch still wins over BOTH element engines", () => {
    // In stream mode a paired chunk never reaches the local
    // branch at all (pairedLocal is only set in local mode), so
    // neither element engine can become audible — the engine
    // routing stays inside the same !pairedVideo || pairedLocal
    // branch the #48/#52 contracts pinned.
    const chunk = sliceBetween(conversation, "const playPcmChunk = useCallback", "// Interrupt: drop all queued playback instantly");
    expect(chunk).toContain("} else if (pairedAudibleMode() === 'local') {");
    expect(chunk).toContain("if (!pairedVideo || pairedLocal) {");
    expect(chunk.indexOf("if (!pairedVideo || pairedLocal) {")).toBeLessThan(chunk.indexOf("engine.enqueuePcm16"));
  });
});
