// Face revival on handoff return (2026-11-24 — Ron's session
// 4656e8c4): after a ~67 s phone handoff leg Aspen resumed speaking
// in the browser but her lips never moved. On leg start the client
// pauses capture, clears playback and suspends the playback
// context, starving the Simli face; on leg end it unpaused, resumed
// and sent handoff_ended — but NEVER checked or revived the face,
// so the preserved last frame stayed up while her voice played
// over it. The fix gives the return path the persona-swap path's
// treatment: at the first post-return audio chunk a probe watches
// the face's frame counter (~2 s); a frozen face earns ONE revival
// start through the SHARED personaSwap machinery
// (runFaceRevivalStart); the outcome is stamped into handoffDiag.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  HANDOFF_FACE_PROBE_MS,
  handoffDiagDetail,
  handoffDiagPayload,
  handoffFaceRevivalDiag,
  runHandoffFaceRevivalProbe,
  type HandoffFaceProbeDeps,
} from '@/lib/handoffRecovery';
import { runFaceRevivalStart, type FaceRevivalHandleLike } from '@/lib/personaSwap';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

/** A probe rig: a mutable frame counter + liveness, a counting
 *  kick, and a sleep that advances the rig's clock (and, when
 *  `advanceOnPoll` is set, its frames) one poll at a time. */
function probeRig(opts: {
  frames?: number | null;
  advanceOnPoll?: number;
  live?: boolean;
  starting?: boolean;
  kick?: { attempted: boolean; succeeded: boolean };
} = {}) {
  let frame = opts.frames === undefined ? 100 : opts.frames;
  const kick = vi.fn(async () => opts.kick ?? { attempted: true, succeeded: true });
  const deps: HandoffFaceProbeDeps = {
    readFrame: () => frame,
    readLiveness: () => ({ live: opts.live ?? true, starting: opts.starting ?? false }),
    kickRevival: kick,
    probeMs: 120,
    pollMs: 20,
    sleep: async () => { if (opts.advanceOnPoll) frame = (frame ?? 0) + opts.advanceOnPoll; },
  };
  return { deps, kick, setFrame: (v: number | null) => { frame = v; } };
}

describe('return probe — fires after the first post-return audio and decides from frame advancement', () => {
  it('the probe window is ~2 s', () => {
    expect(HANDOFF_FACE_PROBE_MS).toBe(2000);
  });

  it('frames advance → no revival is kicked', async () => {
    const { deps, kick } = probeRig({ advanceOnPoll: 3 });
    const outcome = await runHandoffFaceRevivalProbe(deps);
    expect(outcome).toEqual({ probe: 'advanced', revivalAttempted: false, revivalSucceeded: null });
    expect(kick).not.toHaveBeenCalled();
    expect(handoffFaceRevivalDiag(outcome)).toBe('advanced');
  });

  it('frames never advance (face claims live, frames stand still) → exactly ONE revival, success stamped', async () => {
    const { deps, kick } = probeRig({ frames: 42, kick: { attempted: true, succeeded: true } });
    const outcome = await runHandoffFaceRevivalProbe(deps);
    expect(outcome).toEqual({ probe: 'frozen', revivalAttempted: true, revivalSucceeded: true });
    expect(kick).toHaveBeenCalledTimes(1);
    expect(handoffFaceRevivalDiag(outcome)).toBe('frozen-revived');
  });

  it('a failed revival is stamped as failed, never retried inside the probe', async () => {
    const { deps, kick } = probeRig({ frames: 42, kick: { attempted: true, succeeded: false } });
    const outcome = await runHandoffFaceRevivalProbe(deps);
    expect(outcome).toEqual({ probe: 'frozen', revivalAttempted: true, revivalSucceeded: false });
    expect(kick).toHaveBeenCalledTimes(1);
    expect(handoffFaceRevivalDiag(outcome)).toBe('frozen-failed');
  });

  it('a dead face (liveness not live, not starting) is declared frozen on the first poll — the revival is not delayed by the full window', async () => {
    let polls = 0;
    const { deps, kick } = probeRig({ frames: 7, live: false });
    deps.sleep = async () => { polls += 1; };
    const outcome = await runHandoffFaceRevivalProbe(deps);
    expect(outcome.probe).toBe('frozen');
    expect(polls).toBe(1);
    expect(kick).toHaveBeenCalledTimes(1);
  });

  it('a face that is still starting is NOT declared dead — the probe waits and sees frames advance', async () => {
    let frame = 5;
    let polls = 0;
    const kick = vi.fn(async () => ({ attempted: true, succeeded: true }));
    const outcome = await runHandoffFaceRevivalProbe({
      readFrame: () => frame,
      readLiveness: () => ({ live: false, starting: polls < 2 }),
      kickRevival: kick,
      probeMs: 120,
      pollMs: 20,
      sleep: async () => { polls += 1; if (polls >= 2) frame += 4; },
    });
    expect(outcome.probe).toBe('advanced');
    expect(kick).not.toHaveBeenCalled();
  });

  it('no readable frame counter → no blind revival (a healthy face is never restarted on a guess)', async () => {
    const { deps, kick } = probeRig({ frames: null });
    deps.readFrame = () => null;
    const outcome = await runHandoffFaceRevivalProbe(deps);
    expect(outcome).toEqual({ probe: 'unavailable', revivalAttempted: false, revivalSucceeded: null });
    expect(kick).not.toHaveBeenCalled();
    expect(handoffFaceRevivalDiag(outcome)).toBe('no-counter');
  });

  it('a counter that only appears mid-probe becomes the baseline, then advancement wins', async () => {
    let frame: number | null = null;
    let polls = 0;
    const kick = vi.fn(async () => ({ attempted: true, succeeded: true }));
    const outcome = await runHandoffFaceRevivalProbe({
      readFrame: () => frame,
      readLiveness: () => ({ live: true, starting: false }),
      kickRevival: kick,
      probeMs: 120,
      pollMs: 20,
      sleep: async () => { polls += 1; if (polls === 1) frame = 10; if (polls >= 3) frame = 25; },
    });
    expect(outcome.probe).toBe('advanced');
    expect(kick).not.toHaveBeenCalled();
  });

  it('the session ending mid-probe aborts it — no revival for a dead session', async () => {
    let live = true;
    const { deps, kick } = probeRig({ frames: 9 });
    deps.isSessionLive = () => live;
    deps.sleep = async () => { live = false; };
    const outcome = await runHandoffFaceRevivalProbe(deps);
    expect(outcome.probe).toBe('aborted');
    expect(kick).not.toHaveBeenCalled();
    expect(handoffFaceRevivalDiag(outcome)).toBe('aborted');
  });

  it('a frozen face whose kick is gated out (already live/starting at kick time) stamps frozen-nokick', async () => {
    const { deps } = probeRig({ frames: 3, kick: { attempted: false, succeeded: false } });
    const outcome = await runHandoffFaceRevivalProbe(deps);
    expect(outcome).toEqual({ probe: 'frozen', revivalAttempted: false, revivalSucceeded: null });
    expect(handoffFaceRevivalDiag(outcome)).toBe('frozen-nokick');
  });
});

describe('shared revival start — the personaSwap machinery both paths run', () => {
  function fakeHandle(snap: { live: boolean; starting: boolean }, startResult: boolean | Error = true) {
    const start = vi.fn(async (_opts?: { silent?: boolean; maxAttempts?: number }) => {
      if (startResult instanceof Error) throw startResult;
      return startResult;
    });
    const handle: FaceRevivalHandleLike = { liveness: () => snap, start };
    return { handle, start };
  }

  it('a dead, idle face gets exactly one silent, single-attempt start', async () => {
    const { handle, start } = fakeHandle({ live: false, starting: false });
    await expect(runFaceRevivalStart(handle)).resolves.toBe('started');
    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith({ silent: true, maxAttempts: 1 });
  });

  it('a live face is never restarted (the defect-1 trap)', async () => {
    const { handle, start } = fakeHandle({ live: true, starting: false });
    await expect(runFaceRevivalStart(handle)).resolves.toBe('already-live');
    expect(start).not.toHaveBeenCalled();
  });

  it('a starting face is left alone', async () => {
    const { handle, start } = fakeHandle({ live: false, starting: true });
    await expect(runFaceRevivalStart(handle)).resolves.toBe('already-starting');
    expect(start).not.toHaveBeenCalled();
  });

  it('a start that resolves false or throws reads as failed', async () => {
    await expect(runFaceRevivalStart(fakeHandle({ live: false, starting: false }, false).handle)).resolves.toBe('failed');
    await expect(runFaceRevivalStart(fakeHandle({ live: false, starting: false }, new Error('nope')).handle)).resolves.toBe('failed');
  });

  it('a missing or pre-liveness handle reads as no-handle', async () => {
    await expect(runFaceRevivalStart(null)).resolves.toBe('no-handle');
    await expect(runFaceRevivalStart({})).resolves.toBe('no-handle');
  });
});

describe('handoffDiag stamp — the probe outcome is provable from the record', () => {
  it('the face-revival stamp carries ev/out/mic plus the face outcome token', () => {
    expect(handoffDiagDetail({ event: 'face-revival', outcome: 'completed', mic: 'live', face: 'frozen-revived' }))
      .toBe('ev=face-revival;out=completed;mic=live;face=frozen-revived');
    expect(handoffDiagDetail({ event: 'face-revival', outcome: 'unavailable', mic: 'live', face: 'advanced' }))
      .toBe('ev=face-revival;out=unavailable;mic=live;face=advanced');
  });

  it('stamps without a face outcome render byte-identically to before', () => {
    expect(handoffDiagDetail({ event: 'ended', outcome: 'completed', mic: 'live' })).toBe('ev=ended;out=completed;mic=live');
    const payload = handoffDiagPayload('session-1', { event: 'face-revival', outcome: 'completed', mic: 'live', face: 'frozen-failed' }, 99);
    expect(payload.detail).toBe('ev=face-revival;out=completed;mic=live;face=frozen-failed');
    expect(payload.detail.length).toBeLessThanOrEqual(400);
  });
});

describe('client wiring — GeminiConversation', () => {
  const src = read('src/components/GeminiConversation.tsx');

  it('the return path arms the probe only for an in-session come-back on a face session', () => {
    const ret = src.slice(src.indexOf('const onHandoffActive'), src.indexOf('const liftContactDraft'));
    expect(ret).toContain('if (socketOpen && avatarRequestedRef.current) {');
    expect(ret).toContain('handoffFaceProbeOutcomeRef.current = endedOutcome;');
    expect(ret).toContain('handoffFaceProbePendingRef.current = true;');
    // The come-back send itself is unchanged and still comes first.
    expect(ret.indexOf("type:'handoff_ended'")).toBeLessThan(ret.indexOf('handoffFaceProbePendingRef.current = true;'));
  });

  it('the probe fires at the first post-return chunk, at the head of playPcmChunk, and a replay never fires it', () => {
    const chunk = src.slice(src.indexOf('const playPcmChunk = useCallback'), src.indexOf('playPcmChunkRef.current = playPcmChunk'));
    expect(chunk).toContain('if (handoffFaceProbePendingRef.current && !captureRef.current.replaying) {');
    expect(chunk).toContain('handoffFaceProbeRef.current();');
    // Fired before the engine hold / scheduling, so it overlaps the line.
    expect(chunk.indexOf('handoffFaceProbeRef.current();')).toBeLessThan(chunk.indexOf('const captionRun'));
  });

  it('the probe reads the active face’s frame counter and kicks through the shared machinery', () => {
    expect(src).toContain('readFrame: () => avatarRef.current?.frameCounter?.() ?? null,');
    expect(src).toContain('readLiveness: () => avatarRef.current?.liveness?.() ?? null,');
    expect(src).toContain('const result = await runFaceRevivalStart(avatarRef.current);');
    expect(src).toContain('isSessionLive: () => liveRef.current,');
  });

  it('the probe outcome is stamped into handoffDiag as ev=face-revival', () => {
    expect(src).toContain('stampHandoffDiag("face-revival", handoffFaceProbeOutcomeRef.current, handoffMicState(), handoffFaceRevivalDiag(outcome));');
  });

  it('the swap-path kick now delegates to the same shared helper (no duplicated revival start)', () => {
    const kickStart = src.indexOf('kickFaceRevivalRef.current = (slot: FaceSlot)');
    const kick = src.slice(kickStart, src.indexOf('handoffFaceProbeRef.current = () => {', kickStart));
    expect(kick).toContain('void runFaceRevivalStart(handle);');
    expect(kick).not.toContain('handle.start({ silent: true, maxAttempts: 1 })');
  });

  it('by design preserved: the leg start still keeps the last frame — nothing on the handoff path stops or blanks the face', () => {
    const ret = src.slice(src.indexOf('const onHandoffActive'), src.indexOf('const liftContactDraft'));
    expect(ret).toContain('pauseCapture(); clearPlayback();');
    expect(ret).not.toContain('avatarRef.current?.stop');
    expect(ret).not.toContain('engageVideoFallback');
    expect(ret).not.toContain('setFaceLive(false)');
    // Teardown disarms an un-fired probe so a later session's first chunk is not mistaken for a return.
    expect(src).toContain('handoffFaceProbePendingRef.current = false;');
  });

  it('SimliAvatar exposes the frame counter the probe samples', () => {
    const simli = read('src/components/SimliAvatar.tsx');
    expect(simli).toContain('frameCounter?: () => number | null;');
    expect(simli).toContain('frameCounter: () => {');
    expect(simli).toContain('totalVideoFrames');
  });
});
