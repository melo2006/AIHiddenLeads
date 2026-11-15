// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  MIC_ENERGY_EPSILON,
  MIC_MUTED_START_GRACE_MS,
  MIC_WATCHDOG_STALL_MS,
  MIC_WATCHDOG_STARTUP_MS,
  createMicFlowState,
  micDiagDetail,
  micDiagPayload,
  micDiagSignature,
  micDiagStamp,
  micInputSeconds,
  micTrackStartVerdict,
  noteMicFrame,
  noteMicSessionLive,
  noteMicWatchdogFired,
  shouldShowMicWatchdog,
  type MicWatchdogSnapshot,
} from "@/lib/micWatchdog";

/**
 * Mic zero-input guard (2026-11-14): session ef9986df ran 4m53s
 * with input_audio_seconds = 0 — a dead microphone the presenter
 * monologued into, uninterruptible, until the silence machinery
 * closed the call, with no mic state on the session record. These
 * tests pin the guard that replaces that shape: a pure decision
 * over the per-frame flow tracker, plus the micDiag stamp shape.
 */

const T0 = 1_000_000;

function snapshot(overrides: Partial<MicWatchdogSnapshot> = {}): MicWatchdogSnapshot {
  return {
    now: T0 + MIC_WATCHDOG_STARTUP_MS + 1_000,
    live: true,
    handsFree: true,
    muted: false,
    paused: false,
    handoff: false,
    recoveryActive: false,
    liveSince: T0,
    firstFlowAt: 0,
    lastFlowAt: 0,
    firedForStretch: false,
    ...overrides,
  };
}

describe("mic flow tracker", () => {
  it("counts frames and only counts energy above the epsilon as flow", () => {
    const flow = createMicFlowState();
    noteMicSessionLive(flow, T0);
    noteMicFrame(flow, 0, T0 + 100);
    noteMicFrame(flow, MIC_ENERGY_EPSILON / 2, T0 + 200);
    expect(flow.frames).toBe(2);
    expect(flow.energyFrames).toBe(0);
    expect(flow.firstFlowAt).toBe(0);
    noteMicFrame(flow, 0.01, T0 + 300);
    expect(flow.frames).toBe(3);
    expect(flow.energyFrames).toBe(1);
    expect(flow.firstFlowAt).toBe(T0 + 300);
    expect(flow.lastFlowAt).toBe(T0 + 300);
    noteMicFrame(flow, 0.02, T0 + 900);
    expect(flow.firstFlowAt).toBe(T0 + 300); // first flow is sticky
    expect(flow.lastFlowAt).toBe(T0 + 900);
  });

  it("resets the window on a new session live", () => {
    const flow = createMicFlowState();
    noteMicSessionLive(flow, T0);
    noteMicFrame(flow, 0.5, T0 + 10);
    noteMicWatchdogFired(flow);
    noteMicSessionLive(flow, T0 + 60_000);
    expect(flow.liveSince).toBe(T0 + 60_000);
    expect(flow.frames).toBe(0);
    expect(flow.firstFlowAt).toBe(0);
    expect(flow.watchdogFired).toBe(false);
    expect(flow.firedForStretch).toBe(false);
  });

  it("re-arms after firing when audio flows again", () => {
    const flow = createMicFlowState();
    noteMicSessionLive(flow, T0);
    noteMicWatchdogFired(flow);
    expect(flow.firedForStretch).toBe(true);
    expect(flow.watchdogFired).toBe(true);
    noteMicFrame(flow, 0.5, T0 + 9_000);
    expect(flow.firedForStretch).toBe(false);
    expect(flow.watchdogFired).toBe(true); // the session-level fact stays
  });

  it("converts frames to input seconds from the capture geometry", () => {
    // 2048-sample buffers at the 16 kHz mic rate: 78 frames ≈ 10 s.
    expect(micInputSeconds(78, 2048, 16000)).toBeCloseTo(9.98, 2);
    expect(micInputSeconds(0, 2048, 16000)).toBe(0);
    expect(micInputSeconds(10, 0, 16000)).toBe(0);
  });
});

describe("mic watchdog decision", () => {
  it("fires on zero flow once the startup window passes", () => {
    expect(shouldShowMicWatchdog(snapshot())).toBe(true);
    expect(shouldShowMicWatchdog(snapshot({ now: T0 + MIC_WATCHDOG_STARTUP_MS }))).toBe(true);
  });

  it("stays silent before the startup window", () => {
    expect(shouldShowMicWatchdog(snapshot({ now: T0 + MIC_WATCHDOG_STARTUP_MS - 1 }))).toBe(false);
    expect(shouldShowMicWatchdog(snapshot({ now: T0 + 1_000 }))).toBe(false);
  });

  it("stays silent when audio flowed at startup, however quiet the visitor is after", () => {
    const flowed = { firstFlowAt: T0 + 500, lastFlowAt: T0 + 500 };
    expect(shouldShowMicWatchdog(snapshot({ ...flowed, now: T0 + MIC_WATCHDOG_STALL_MS - 1 + 500 }))).toBe(false);
    expect(shouldShowMicWatchdog(snapshot({ ...flowed, now: T0 + 60_000, lastFlowAt: T0 + 59_000 }))).toBe(false);
  });

  it("never fires when the user deliberately muted", () => {
    expect(shouldShowMicWatchdog(snapshot({ muted: true }))).toBe(false);
    expect(shouldShowMicWatchdog(snapshot({ muted: true, now: T0 + 300_000 }))).toBe(false);
  });

  it("never fires when not live — Type/chat mode has no live voice session", () => {
    expect(shouldShowMicWatchdog(snapshot({ live: false }))).toBe(false);
    expect(shouldShowMicWatchdog(snapshot({ liveSince: 0 }))).toBe(false);
  });

  it("never fires in hold mode, while paused, during a handoff leg, or during recovery", () => {
    expect(shouldShowMicWatchdog(snapshot({ handsFree: false }))).toBe(false);
    expect(shouldShowMicWatchdog(snapshot({ paused: true }))).toBe(false);
    expect(shouldShowMicWatchdog(snapshot({ handoff: true }))).toBe(false);
    expect(shouldShowMicWatchdog(snapshot({ recoveryActive: true }))).toBe(false);
  });

  it("fires only once per silent stretch", () => {
    expect(shouldShowMicWatchdog(snapshot({ firedForStretch: true }))).toBe(false);
    expect(shouldShowMicWatchdog(snapshot({ firedForStretch: true, now: T0 + 300_000 }))).toBe(false);
  });

  it("re-fires after a mid-session stall once flow has resumed and died again", () => {
    const flow = createMicFlowState();
    noteMicSessionLive(flow, T0);
    // Flow at startup, watchdog never fires.
    noteMicFrame(flow, 0.4, T0 + 400);
    expect(shouldShowMicWatchdog(snapshot({
      liveSince: flow.liveSince, firstFlowAt: flow.firstFlowAt, lastFlowAt: flow.lastFlowAt,
      firedForStretch: flow.firedForStretch, now: T0 + 10_000,
    }))).toBe(false);
    // The path dies: 25 s of zero flow after having flowed → fires.
    const stalledAt = T0 + 400 + MIC_WATCHDOG_STALL_MS;
    expect(shouldShowMicWatchdog(snapshot({
      liveSince: flow.liveSince, firstFlowAt: flow.firstFlowAt, lastFlowAt: flow.lastFlowAt,
      firedForStretch: flow.firedForStretch, now: stalledAt - 1,
    }))).toBe(false);
    expect(shouldShowMicWatchdog(snapshot({
      liveSince: flow.liveSince, firstFlowAt: flow.firstFlowAt, lastFlowAt: flow.lastFlowAt,
      firedForStretch: flow.firedForStretch, now: stalledAt,
    }))).toBe(true);
    // Fires once for the stretch; flow re-arms; a second stall fires again.
    noteMicWatchdogFired(flow);
    expect(shouldShowMicWatchdog(snapshot({
      liveSince: flow.liveSince, firstFlowAt: flow.firstFlowAt, lastFlowAt: flow.lastFlowAt,
      firedForStretch: flow.firedForStretch, now: stalledAt + 60_000,
    }))).toBe(false);
    noteMicFrame(flow, 0.4, stalledAt + 61_000);
    expect(flow.firedForStretch).toBe(false);
    expect(shouldShowMicWatchdog(snapshot({
      liveSince: flow.liveSince, firstFlowAt: flow.firstFlowAt, lastFlowAt: flow.lastFlowAt,
      firedForStretch: flow.firedForStretch, now: stalledAt + 61_000 + MIC_WATCHDOG_STALL_MS,
    }))).toBe(true);
  });
});

describe("mic watchdog recalibration (Publish #56 — quiet speech must not trip it)", () => {
  it("tracks the alive tier separately: any non-zero frame, however quiet", () => {
    const flow = createMicFlowState();
    noteMicSessionLive(flow, T0);
    noteMicFrame(flow, 0, T0 + 100);
    expect(flow.lastAliveAt).toBe(0); // an exact-zero frame is not a sign of life
    noteMicFrame(flow, MIC_ENERGY_EPSILON / 2, T0 + 200); // under the energy epsilon, still non-zero
    expect(flow.lastAliveAt).toBe(T0 + 200);
    expect(flow.energyFrames).toBe(0); // but it is NOT speech-level flow
    expect(flow.firstFlowAt).toBe(0);
    noteMicSessionLive(flow, T0 + 50_000); // a new window resets the alive tier too
    expect(flow.lastAliveAt).toBe(0);
  });

  it("does NOT fire at startup when quiet-room frames tick non-zero under the epsilon", () => {
    // The owner's quiet room: NS-processed room tone / whispered
    // speech that never crosses MIC_ENERGY_EPSILON, but is not
    // digital silence either. The old single-tier test fired here.
    const alive = { firstFlowAt: 0, lastFlowAt: 0, lastAliveAt: T0 + 7_500 };
    expect(shouldShowMicWatchdog(snapshot({ ...alive, now: T0 + MIC_WATCHDOG_STARTUP_MS + 1 }))).toBe(false);
    expect(shouldShowMicWatchdog(snapshot({ ...alive, now: T0 + 120_000, lastAliveAt: T0 + 119_000 }))).toBe(false);
  });

  it("still fires at startup on true zero-input: frames of exact zeros", () => {
    const flow = createMicFlowState();
    noteMicSessionLive(flow, T0);
    for (let i = 0; i < 200; i++) noteMicFrame(flow, 0, T0 + 40 * i);
    expect(flow.frames).toBe(200);
    expect(flow.lastAliveAt).toBe(0);
    expect(shouldShowMicWatchdog(snapshot({
      liveSince: flow.liveSince, firstFlowAt: flow.firstFlowAt, lastFlowAt: flow.lastFlowAt,
      lastAliveAt: flow.lastAliveAt, firedForStretch: flow.firedForStretch,
      now: T0 + MIC_WATCHDOG_STARTUP_MS,
    }))).toBe(true);
  });

  it("does NOT re-fire mid-session while alive frames keep ticking under the epsilon", () => {
    // Flowed at startup, then a long quiet stretch: speech energy
    // is stale past the stall window, but the path keeps proving
    // itself alive — a listening visitor, not a dead mic.
    const base = { firstFlowAt: T0 + 400, lastFlowAt: T0 + 400 };
    expect(shouldShowMicWatchdog(snapshot({
      ...base, lastAliveAt: T0 + 400 + MIC_WATCHDOG_STALL_MS - 1_000,
      now: T0 + 400 + MIC_WATCHDOG_STALL_MS + 5_000,
    }))).toBe(false);
  });

  it("still fires mid-session when BOTH tiers go silent for the stall window", () => {
    const base = { firstFlowAt: T0 + 400, lastFlowAt: T0 + 400, lastAliveAt: T0 + 400 };
    const stalledAt = T0 + 400 + MIC_WATCHDOG_STALL_MS;
    expect(shouldShowMicWatchdog(snapshot({ ...base, now: stalledAt - 1 }))).toBe(false);
    expect(shouldShowMicWatchdog(snapshot({ ...base, now: stalledAt }))).toBe(true);
  });

  it("track evidence outranks levels: a muted/ended track fires even with alive ticks", () => {
    const alive = { firstFlowAt: 0, lastFlowAt: 0, lastAliveAt: T0 + 7_900, trackDead: true };
    expect(shouldShowMicWatchdog(snapshot({ ...alive, now: T0 + MIC_WATCHDOG_STARTUP_MS - 1 }))).toBe(false);
    expect(shouldShowMicWatchdog(snapshot({ ...alive, now: T0 + MIC_WATCHDOG_STARTUP_MS }))).toBe(true);
    // A mid-session track death is already past the startup clock:
    // it surfaces at the next evaluation, not after a stall window.
    expect(shouldShowMicWatchdog(snapshot({
      firstFlowAt: T0 + 400, lastFlowAt: T0 + 400, lastAliveAt: T0 + 59_000, trackDead: true,
      now: T0 + 60_000,
    }))).toBe(true);
  });

  it("track evidence never overrides the deliberate-state gates", () => {
    const dead = { trackDead: true, now: T0 + 300_000 };
    expect(shouldShowMicWatchdog(snapshot({ ...dead, muted: true }))).toBe(false);
    expect(shouldShowMicWatchdog(snapshot({ ...dead, paused: true }))).toBe(false);
    expect(shouldShowMicWatchdog(snapshot({ ...dead, handoff: true }))).toBe(false);
    expect(shouldShowMicWatchdog(snapshot({ ...dead, live: false }))).toBe(false);
  });
});

describe("mic track start verdict (Publish #56 — tracks that start muted)", () => {
  it("classifies the track's own testimony", () => {
    expect(micTrackStartVerdict(null)).toBe("none");
    expect(micTrackStartVerdict(undefined)).toBe("none");
    expect(micTrackStartVerdict({ readyState: "live", muted: false })).toBe("ok");
    expect(micTrackStartVerdict({ readyState: "live", muted: true })).toBe("muted");
    expect(micTrackStartVerdict({ readyState: "ended", muted: false })).toBe("ended");
    // An ended track is dead even if it also reports muted.
    expect(micTrackStartVerdict({ readyState: "ended", muted: true })).toBe("ended");
  });

  it("the muted-start grace is short — seconds, not the startup window", () => {
    expect(MIC_MUTED_START_GRACE_MS).toBeGreaterThan(0);
    expect(MIC_MUTED_START_GRACE_MS).toBeLessThan(MIC_WATCHDOG_STARTUP_MS);
  });
});

describe("micDiag stamp", () => {
  it("renders the compact k=v detail with the spec's fields", () => {
    const flow = createMicFlowState();
    noteMicSessionLive(flow, T0);
    for (let i = 0; i < 78; i++) noteMicFrame(flow, i === 3 ? 0.3 : 0, T0 + 100 * (i + 1));
    const stamp = micDiagStamp({ event: "end", flow, permission: "granted", track: "live", inputSec: micInputSeconds(flow.frames, 2048, 16000) });
    const detail = micDiagDetail(stamp);
    expect(detail).toBe("ev=end;perm=granted;track=live;flow=1;first=400;frames=78;sec=10.0;fired=0");
  });

  it("renders a never-flowed session honestly (the ef9986df shape)", () => {
    const flow = createMicFlowState();
    noteMicSessionLive(flow, T0);
    for (let i = 0; i < 40; i++) noteMicFrame(flow, 0, T0 + 128 * i);
    noteMicWatchdogFired(flow);
    const stamp = micDiagStamp({ event: "end", flow, permission: "granted", track: "muted", inputSec: micInputSeconds(flow.frames, 2048, 16000) });
    expect(micDiagDetail(stamp)).toBe("ev=end;perm=granted;track=muted;flow=0;first=-;frames=40;sec=5.1;fired=1");
  });

  it("payload is session-scoped, capped, and dedupes by signature", () => {
    const stamp = micDiagStamp({ event: "start", flow: createMicFlowState(), permission: "unknown", track: "none", inputSec: 0 });
    const a = micDiagPayload("11111111-1111-1111-1111-111111111111", stamp, 123);
    const b = micDiagPayload("22222222-2222-2222-2222-222222222222", stamp, 123);
    expect(a.detail.length).toBeLessThanOrEqual(400);
    expect(micDiagSignature(a)).not.toBe(micDiagSignature(b)); // a new session's first stamp always lands
    expect(micDiagSignature(a)).toBe(micDiagSignature({ ...a, at: 999 })); // identical repeats dedupe
  });
});
