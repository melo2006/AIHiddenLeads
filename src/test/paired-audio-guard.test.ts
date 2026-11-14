// Paired-audio guard (2026-11-10 — publish #16 candidate).
// Investigation: ~/workspace/segment-death-investigation-2026-11-10.md.
// Root cause: playPcmChunk's paired-send guard called stopEverything()
// on the first PCM chunk a dead-but-latched-"ready" Simli face refused,
// finalizing every Sara doorway/resume segment as user_ended/1000 in
// ~2–3 s. The fix set pinned here:
//  1. a failed paired send DEGRADES to voice-only local playback (the
//     chunk itself included) instead of killing the call;
//  2. both face slots report liveness through one slot-aware handler —
//     a staged (concealed) face's death invalidates the readiness
//     latches the gate-wait reads;
//  3. cutoverAudioSync reports liveness and executeSwap ABORTS a swap
//     onto a dead face BEFORE partialTeardownForSwap closes the old
//     socket, routing the failure through handleSegmentFailure;
//  4. a failed face re-stage on manual resume clears avatarRequested
//     so the resumed segment routes LOCAL, not 'wait'-as-paired;
//  5. the degradation emits an 'audio-degraded' swap-diag event.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { assistantOutput, pairedAudioShouldDegrade } from '@/lib/avatarAudioTransition';
import { recordSwapDiag, resetSwapDiagnostics, swapDiagnostics } from '@/lib/personaSwap';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
const convo = read('src/components/GeminiConversation.tsx');
const simli = read('src/components/SimliAvatar.tsx');

const playBody = convo.slice(
  convo.indexOf('const playPcmChunk = useCallback'),
  convo.indexOf('// Interrupt: drop all queued playback instantly'),
);
const execBody = convo.slice(
  convo.indexOf('executeSwapRef.current = async'),
  convo.indexOf('dropRecoverRef.current = () =>'),
);
const resumeBody = convo.slice(
  convo.indexOf('resumeSegmentChainRef.current = async'),
  convo.indexOf('const engageVideoFallback = useCallback'),
);

describe('1 — degradation decision (pairedAudioShouldDegrade)', () => {
  test('paired + live + sent → no degradation (the healthy path is untouched)', () => {
    expect(pairedAudioShouldDegrade('paired', true, true)).toBe(false);
  });

  test('paired + send refused → degrade, even if the live ref still said live', () => {
    expect(pairedAudioShouldDegrade('paired', true, false)).toBe(true);
  });

  test('paired + face not live → degrade', () => {
    expect(pairedAudioShouldDegrade('paired', false, false)).toBe(true);
  });

  test("'wait' is NOT survivable paired output: video requested but face not live degrades too", () => {
    // assistantOutput returns 'wait' when a face was requested but is
    // not live; the old player treated 'wait' as paired and the guard
    // killed the call on the first such chunk.
    expect(assistantOutput(true, false, false)).toBe('wait');
    expect(pairedAudioShouldDegrade('wait', false, false)).toBe(true);
  });

  test('local output never degrades — voice-only and replay stay exactly as they were', () => {
    expect(pairedAudioShouldDegrade('local', false, false)).toBe(false);
    // Replay forces local even when a face was requested and is live.
    expect(assistantOutput(true, true, true)).toBe('local');
    expect(pairedAudioShouldDegrade(assistantOutput(true, true, true), true, true)).toBe(false);
    // Preview sessions never request the face → local → untouched.
    expect(assistantOutput(false, false, false)).toBe('local');
  });
});

describe('1 — playPcmChunk wiring (source pins)', () => {
  test('the fatal guard is GONE: no stopEverything + banner on a failed paired send, anywhere', () => {
    expect(convo).not.toContain('The moving face disconnected');
    const guardRegion = playBody.slice(
      playBody.indexOf('const output = assistantOutput'),
      playBody.indexOf('captionClockRef.current.audio'),
    );
    expect(guardRegion).not.toContain('stopEverything()');
    expect(guardRegion).not.toContain('return;');
  });

  test('a failed send engages the voice-only fallback and falls through to local playback of THIS chunk', () => {
    expect(playBody).toContain('pairedAudioShouldDegrade(output, wasLive, sendSucceeded)');
    expect(playBody).toContain('engageVideoFallback();');
    expect(playBody).toContain('pairedVideo = false;');
    // The local branch is keyed on the (possibly flipped) flag, so the
    // degrading chunk — and, via avatarRequested now false, every
    // later chunk — plays through the local speaker path.
    // (Volume-stream fix, 2026-11-14: the branch ALSO admits
    // pairedLocal — a still-paired chunk on the local-first path.
    // The degrade fall-through is unchanged: degrade flips
    // pairedVideo false in the branch ABOVE the mode check, so a
    // degrading chunk never sets pairedLocal.)
    expect(playBody).toContain('if (!pairedVideo || pairedLocal) {');
    expect(playBody.indexOf('engageVideoFallback();')).toBeLessThan(playBody.indexOf('if (!pairedVideo || pairedLocal) {'));
  });

  test('the send is only attempted when the face claimed live (no send into a known-dead face)', () => {
    expect(playBody).toContain("const sendSucceeded = wasLive ? (avatarRef.current?.sendPcm24k(base64) ?? false) : false;");
  });

  test('captions: the degrading chunk rides the LOCAL clock (paired delay applies only while still paired)', () => {
    // (Volume-stream fix, 2026-11-14: the delay is resolved by
    // pairedCaptionDelaySec — pairedVideo=false yields 0 in BOTH
    // modes (unit-pinned in paired-audible.test.ts), so the
    // degrading chunk still rides the local clock; on the stream
    // path a still-paired chunk keeps the 0.4 s shift, and on the
    // local-first path the shift lives in the audible schedule
    // instead, never in both.)
    expect(playBody).toContain('const captionDelay = pairedCaptionDelaySec(pairedVideo, pairedAudibleMode());');
    // pairedVideo flips before the caption window is computed.
    expect(playBody.indexOf('pairedVideo = false;')).toBeLessThan(playBody.indexOf('const captionDelay'));
  });

  test('engageVideoFallback is the session-start pattern (defined before playPcmChunk, shared by both)', () => {
    expect(convo.indexOf('const engageVideoFallback = useCallback')).toBeLessThan(convo.indexOf('const playPcmChunk = useCallback'));
    const fallbackBody = convo.slice(convo.indexOf('const engageVideoFallback = useCallback'), convo.indexOf('const playPcmChunk = useCallback'));
    expect(fallbackBody).toContain('avatarRequestedRef.current = false;');
    expect(fallbackBody).toContain('avatarLiveRef.current = false;');
    expect(fallbackBody).toContain('setVideoFallback(true);');
  });
});

describe('5 — diag blind spot closed', () => {
  test("playPcmChunk records an 'audio-degraded' diag at the degradation point, BEFORE engaging the fallback", () => {
    expect(playBody).toContain("recordSwapDiag({ event: 'audio-degraded'");
    expect(playBody.indexOf("event: 'audio-degraded'")).toBeLessThan(playBody.indexOf('engageVideoFallback();'));
    expect(playBody).toContain('avatarLive=${wasLive} send=${sendSucceeded} slot=${faceSlotOwnerRef.current}');
  });

  test("the diag vocabulary accepts 'audio-degraded' and the ring buffer stores it", () => {
    const swap = read('src/lib/personaSwap.ts');
    // Voice-first batch: the union grew ('voice-first-cutover' /
    // 'face-takeover' appended after 'audio-degraded'), so the pin is
    // on the member itself, not the line terminator.
    expect(swap).toContain("| 'audio-degraded'");
    expect(swap).toContain("'voice-first-cutover' | 'face-takeover'");
    resetSwapDiagnostics();
    recordSwapDiag({ event: 'audio-degraded', persona: 'sara', detail: 'output=wait avatarLive=false send=false slot=second' });
    const entries = swapDiagnostics();
    expect(entries).toHaveLength(1);
    expect(entries[0].event).toBe('audio-degraded');
    expect(entries[0].detail).toContain('output=wait');
    resetSwapDiagnostics();
  });
});

describe('2 — face-slot liveness wiring (source pins)', () => {
  test("the second slot's SimliAvatar now HAS an onLiveChange, routed through the shared slot-aware handler", () => {
    expect(convo).toContain("onLiveChange={live => handleFaceLiveChange('second', live, secondFace)}");
    expect(convo).toContain("onLiveChange={live => handleFaceLiveChange('main', live, mainFace)}");
    expect(convo).toContain("onLiveChange={live => handleFaceLiveChange('main', live, null)}");
  });

  test('the handler is owner-gated exactly like the legacy main handler (active face clears avatarLiveRef + faceLive)', () => {
    const handler = convo.slice(convo.indexOf('const handleFaceLiveChange'), convo.indexOf('const mainFaceLayer'));
    expect(handler).toContain('if (faceSlotOwnerRef.current === slot) {');
    expect(handler).toContain('setFaceLive(live);');
    expect(handler).toContain('if (!live) avatarLiveRef.current = false;');
  });

  test('a staged (concealed) face death invalidates the stage latch AND the warmed-face record', () => {
    const handler = convo.slice(convo.indexOf('const handleFaceLiveChange'), convo.indexOf('const mainFaceLayer'));
    // Retiring/fading (revealed, non-owner) reports are ignored first.
    expect(handler).toContain('if (!face || face.revealed) return;');
    // Handover fix (2026-11-10): the invalidation is judged by the
    // face-liveness machine — a not-live report latches the failure
    // ONLY for a face that was live before (or whose start settled
    // failed); a warm-up transient changes nothing. Both records are
    // written from the machine's verdict, slot- AND boundary-gated as
    // before.
    expect(handler).toContain('faceLivenessOnNotLive(current)');
    expect(handler).toContain('if (next === current) return;');
    expect(handler).toContain('preStageRef.current = { ...stage, faceReady: next.ready, faceFailed: next.failed ? true : undefined, faceEverLive: next.everLive, faceStartFailed: next.startFailed };');
    expect(handler).toContain('warmedFaceRef.current = { ...warmed, ready: next.ready, failed: next.failed, everLive: next.everLive, startFailed: next.startFailed };');
    // Both invalidations are slot- AND boundary-gated.
    expect(handler).toContain('preStageRef.current?.slot === slot && preStageRef.current.boundary === face.boundary');
    expect(handler).toContain('warmedFaceRef.current?.slot === slot && warmedFaceRef.current.boundary === face.boundary');
  });
});

describe('3 — cut-over on a dead incoming face: DEMOTED to voice-first (source pins)', () => {
  // Voice-first batch (2026-11-10): this describe originally pinned
  // the ABORT (restore outgoing pointers, discard the stage, retry
  // ledger). The investigation (Q3-D4) demoted that abort to a MODE
  // SELECTION: the sync is still checked BEFORE partialTeardown, and
  // an explicit false now selects voice-first (attach pended, revival
  // kicked) instead of aborting the swap. The pins below assert the
  // demoted shape with the same protective intent: a dead face can
  // never strand or kill the segment.
  test('SimliAvatar reports liveness honestly: dead face resolves false from BOTH cutoverAudioSync and activate', () => {
    const cutover = simli.slice(simli.indexOf('cutoverAudioSync: async'), simli.indexOf('sendPcm24k:', simli.indexOf('cutoverAudioSync: async')));
    expect(cutover).toContain('if (!liveRef.current || !audio.srcObject) { unlockMediaElements(video, audio); return false; }');
    expect(cutover).toContain('return true;');
    const activate = simli.slice(simli.indexOf('activate: async'), simli.indexOf('stop,', simli.indexOf('activate: async')));
    expect(activate).toContain('if (!liveRef.current || !audio.srcObject) { unlockMediaElements(video, audio); return false; }');
    expect(activate).toContain('return true;');
    // Bug 1 (2026-11-13): the sync now also carries the in-panel volume.
    expect(simli).toContain('cutoverAudioSync?: (sync: { muted: boolean; deviceId: string | null; volume?: number }) => Promise<boolean>;');
    expect(simli).toContain('activate: () => Promise<boolean | void>;');
  });

  test('executeSwap checks the sync result and demotes BEFORE partialTeardownForSwap (no ledger abort remains)', () => {
    const syncAt = execBody.indexOf('incomingHandle.cutoverAudioSync(sync)');
    const demoteAt = execBody.indexOf("mode = 'voice-first';");
    const teardownAt = execBody.indexOf('partialTeardownForSwap();');
    expect(syncAt).toBeGreaterThanOrEqual(0);
    expect(demoteAt).toBeGreaterThan(syncAt);
    expect(teardownAt).toBeGreaterThan(demoteAt);
    // The old ledger abort is gone from the whole component.
    expect(execBody).not.toContain("handleSegmentFailureRef.current(boundary, 'cutover-face-dead')");
  });

  test('the demotion pends the face attach with the cutover-face-dead reason instead of discarding the stage', () => {
    const demote = execBody.slice(execBody.indexOf('if (!incomingFaceLive) {'), execBody.indexOf('partialTeardownForSwap();'));
    expect(demote).toContain("mode = 'voice-first';");
    expect(demote).toContain("voiceFirstReason = 'cutover-face-dead';");
    // The outgoing pointers are NOT restored and the stage is NOT
    // discarded through the ledger — the cut-over proceeds.
    expect(demote).not.toContain('avatarRef.current = outgoing;');
    expect(demote).not.toContain('handleSegmentFailureRef');
    expect(execBody).toContain('segmentFacePendingRef.current = { boundary, persona: incoming, slot: staged.slot };');
    // Only an explicit false demotes: legacy handles resolving
    // undefined proceed face-first, as does a SOUND_BLOCKED refusal.
    expect(execBody).toContain('incomingFaceLive = (await incomingHandle.cutoverAudioSync(sync)) !== false;');
    expect(execBody).toContain('incomingFaceLive = (await incomingHandle.activate()) !== false;');
  });
});

describe('4 — manual-resume coherence (source pins)', () => {
  test('a failed face re-stage on resume clears avatarRequested so output routes LOCAL for the resumed session', () => {
    const failed = resumeBody.slice(resumeBody.indexOf('Her face could not re-stage'));
    expect(failed).toContain('avatarRequestedRef.current = false;');
    expect(failed).toContain('avatarLiveRef.current = false;');
    // …and the segment socket still connects (voice-only continuation).
    expect(resumeBody).toContain('connectSegmentSocketRef.current(segment.token);');
    expect(failed.indexOf('avatarRequestedRef.current = false;')).toBeLessThan(resumeBody.indexOf('connectSegmentSocketRef.current(segment.token);') - resumeBody.indexOf('Her face could not re-stage'));
  });
});
