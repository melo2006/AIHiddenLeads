import { afterEach, describe, expect, it } from "vitest";
import { microphonePcm, shouldSendMicrophone, microphoneGate, microphoneAutoGain, initialCaptureMode, estimateNoiseFloor, pickNoiseFilterForFloor, ambientLevelForFloor, createAmbientGateState, pushAmbientRms, AMBIENT_WINDOW_MAX_SAMPLES, createSpeechGateState, pushSpeechGateFrame, autoNoiseFilter, appliedAmbientLevel, appliedNoiseFilter, deadAirRelaxedFilter, noiseThresholds, SPEECH_GATE_SUSTAIN_MS, SPEECH_GATE_SPEAKING_SUSTAIN_MS, SPEECH_GATE_SPEAKING_THRESHOLD, SPEECH_GATE_OPENING_MAX, type NoiseFilter, type SpeechGateState } from "../lib/voiceLabAudio";

describe("Voice Lab microphone privacy controls", () => {
  it('AGC stays on under strong filtering (restored 2026-11-18 — a quiet speaker must be liftable to the gate bar); hold-to-talk keeps it off', () => {
    expect(microphoneAutoGain('handsfree', 'strong')).toBe(true);
    expect(microphoneAutoGain('handsfree', 'balanced')).toBe(true);
    expect(microphoneAutoGain('hold', 'balanced')).toBe(false);
    expect(microphoneAutoGain('hold', 'strong')).toBe(false);
  });
  it("strong noise filtering blocks quiet background sound but lets louder speech through", () => {
    expect(microphoneGate(0.015, "strong", 1000, 0).open).toBe(false);
    expect(microphoneGate(0.03, "strong", 1000, 0).open).toBe(true);
    expect(microphoneGate(0.015, "light", 1000, 0).open).toBe(true);
  });
  it("keeps speech tails for 450 ms then sends silence", () => {
    const gate = microphoneGate(0.03, "balanced", 1000, 0);
    expect(gate.openUntil).toBe(1450);
    expect(microphoneGate(0, "balanced", 1400, gate.openUntil).open).toBe(true);
    expect(microphoneGate(0, "balanced", 1500, gate.openUntil).open).toBe(false);
  });
  it("converts a 48 kHz mobile input into genuine 16 kHz PCM", () => {
    const result = microphonePcm(new Float32Array(4800).fill(0.5), 48000);
    expect(result.length).toBe(1600);
    expect(result[100]).toBe(16383);
  });
  it("preserves 16 kHz timing and clips samples safely", () => {
    expect([...microphonePcm(new Float32Array([-2, 0, 2]), 16000)]).toEqual([-32768, 0, 32767]);
  });
  it("sends no background audio in hold mode until the caller presses talk", () => {
    expect(shouldSendMicrophone("hold", false, false, false)).toBe(false);
    expect(shouldSendMicrophone("hold", true, false, false)).toBe(true);
  });
  it("mute blocks audio in either mode", () => {
    expect(shouldSendMicrophone("handsfree", false, true, false)).toBe(false);
    expect(shouldSendMicrophone("hold", true, true, false)).toBe(false);
  });
  // Session-start rule (2026-11-09 incident): a persisted hold preference
  // must never make a new session start in hold-to-talk — the visitor speaks
  // while only silence is sent, and the raw mic meter still moves.
  describe("session start capture mode", () => {
    afterEach(() => { localStorage.clear(); });
    it("starts hands-free even when a previous session persisted hold", () => {
      localStorage.setItem("voice-capture-mode", "hold");
      expect(initialCaptureMode()).toBe("handsfree");
    });
    it("starts hands-free with no stored preference", () => {
      expect(initialCaptureMode()).toBe("handsfree");
    });
  });
  it("replay cannot be picked up as caller speech", () => {
    expect(shouldSendMicrophone("handsfree", false, false, true)).toBe(false);
    expect(shouldSendMicrophone("hold", true, false, true)).toBe(false);
    expect(shouldSendMicrophone("handsfree", false, false, false)).toBe(true);
  });
});

// Ambient estimation + auto-pick (Batch 1, 2026-11-12): the room's noise
// floor is the rolling window's ~20th percentile RMS — speech bursts live
// in the loud tail and must not read as room noise — and the pick carries
// hysteresis so a floor hovering at a band edge never flaps the filter.
describe("ambient noise floor estimation and auto-pick", () => {
  it("an empty window reads as silence", () => {
    expect(estimateNoiseFloor([])).toBe(0);
  });

  it("estimates the ~20th percentile, robust to speech bursts in the window", () => {
    // 80 quiet frames at the room floor + 20 loud speech frames: the
    // floor is the room, not the speech.
    const samples = [...Array(80).fill(0.005), ...Array(20).fill(0.2)];
    expect(estimateNoiseFloor(samples)).toBeCloseTo(0.005);
    // Even a window that is half speech keeps the floor near the quiet base.
    const halfSpeech = [...Array(50).fill(0.004), ...Array(50).fill(0.3)];
    expect(estimateNoiseFloor(halfSpeech)).toBeCloseTo(0.004);
  });

  it("ignores non-finite and negative samples", () => {
    expect(estimateNoiseFloor([Number.NaN, -1, 0.01, 0.01, 0.01, 0.01, 0.01])).toBeCloseTo(0.01);
  });

  it("plain bands: quiet room -> light, everyday -> balanced, noisy -> strong", () => {
    expect(pickNoiseFilterForFloor(0)).toBe("light");
    expect(pickNoiseFilterForFloor(0.0059)).toBe("light");
    expect(pickNoiseFilterForFloor(0.006)).toBe("balanced");
    expect(pickNoiseFilterForFloor(0.012)).toBe("balanced");
    expect(pickNoiseFilterForFloor(0.0179)).toBe("balanced");
    expect(pickNoiseFilterForFloor(0.018)).toBe("strong");
    expect(pickNoiseFilterForFloor(0.05)).toBe("strong");
  });

  it("the room label uses the same bands in Quiet / Normal / Noisy vocabulary", () => {
    expect(ambientLevelForFloor(0.003)).toBe("quiet");
    expect(ambientLevelForFloor(0.01)).toBe("normal");
    expect(ambientLevelForFloor(0.03)).toBe("noisy");
  });

  it("hysteresis: a floor oscillating around the balanced/strong edge does not flap", () => {
    // Hovering 0.016 <-> 0.020 across the plain 0.018 edge: whichever
    // filter is current holds through the whole oscillation.
    let fromBalanced = "balanced" as ReturnType<typeof pickNoiseFilterForFloor>;
    for (const floor of [0.02, 0.016, 0.02, 0.016, 0.02]) fromBalanced = pickNoiseFilterForFloor(floor, fromBalanced);
    expect(fromBalanced).toBe("balanced");
    let fromStrong = "strong" as ReturnType<typeof pickNoiseFilterForFloor>;
    for (const floor of [0.016, 0.02, 0.016, 0.02, 0.016]) fromStrong = pickNoiseFilterForFloor(floor, fromStrong);
    expect(fromStrong).toBe("strong");
  });

  it("hysteresis: a floor oscillating around the light/balanced edge does not flap", () => {
    let fromLight = "light" as ReturnType<typeof pickNoiseFilterForFloor>;
    for (const floor of [0.007, 0.005, 0.007, 0.005]) fromLight = pickNoiseFilterForFloor(floor, fromLight);
    expect(fromLight).toBe("light");
    let fromBalanced = "balanced" as ReturnType<typeof pickNoiseFilterForFloor>;
    for (const floor of [0.005, 0.007, 0.005, 0.007]) fromBalanced = pickNoiseFilterForFloor(floor, fromBalanced);
    expect(fromBalanced).toBe("balanced");
  });

  it("hysteresis is a dead zone, not a lock: a sustained move still crosses", () => {
    expect(pickNoiseFilterForFloor(0.03, "balanced")).toBe("strong");
    expect(pickNoiseFilterForFloor(0.03, "light")).toBe("strong");
    expect(pickNoiseFilterForFloor(0.002, "strong")).toBe("light");
    expect(pickNoiseFilterForFloor(0.002, "balanced")).toBe("light");
    expect(pickNoiseFilterForFloor(0.01, "strong")).toBe("balanced");
    expect(pickNoiseFilterForFloor(0.01, "light")).toBe("balanced");
  });

  it("the tracker reducer accumulates a window, estimates the floor and picks with hysteresis", () => {
    let state = createAmbientGateState("balanced");
    for (let i = 0; i < 100; i++) state = pushAmbientRms(state, 0.004);
    expect(state.samples).toHaveLength(100);
    expect(state.floor).toBeCloseTo(0.004);
    // 0.004 is below balanced's hysteresis dead zone (0.0042), so the
    // plain band applies: a genuinely quiet room settles on light.
    expect(state.filter).toBe("light");
  });

  it("the tracker follows a sustained noisy room up to strong and a quiet room down to light", () => {
    let noisy = createAmbientGateState("balanced");
    for (let i = 0; i < 120; i++) noisy = pushAmbientRms(noisy, 0.03);
    expect(noisy.filter).toBe("strong");
    let quiet = createAmbientGateState("balanced");
    for (let i = 0; i < 120; i++) quiet = pushAmbientRms(quiet, 0.002);
    expect(quiet.filter).toBe("light");
  });

  it("speech bursts over a quiet floor do not push the tracker to a stronger filter", () => {
    let state = createAmbientGateState("light");
    // 4 quiet frames out of every 5, 1 loud speech frame: the 20th
    // percentile stays on the room floor.
    for (let i = 0; i < 200; i++) state = pushAmbientRms(state, i % 5 === 4 ? 0.25 : 0.003);
    expect(state.floor).toBeCloseTo(0.003);
    expect(state.filter).toBe("light");
  });

  it("the rolling window trims to its cap so old room sound ages out", () => {
    let state = createAmbientGateState("balanced");
    for (let i = 0; i < AMBIENT_WINDOW_MAX_SAMPLES + 40; i++) state = pushAmbientRms(state, 0.03);
    expect(state.samples).toHaveLength(AMBIENT_WINDOW_MAX_SAMPLES);
    // Once the noisy samples age out, the floor and pick follow the new room.
    for (let i = 0; i < AMBIENT_WINDOW_MAX_SAMPLES; i++) state = pushAmbientRms(state, 0.002);
    expect(state.floor).toBeCloseTo(0.002);
    expect(state.filter).toBe("light");
  });
});

// Barge-in hardening (2026-11-17): the capture loops' send gate may only
// OPEN on sustained speech-level input. Ron's sessions: a fragment of
// room noise / speaker echo opened the old first-frame gate, streamed
// ~450 ms of real audio, and the provider cut Aspen off mid-sentence.
describe("speech gate — sustained input to open, higher bar while she speaks", () => {
  const STEP = 50; // ms per simulated capture frame
  /** Drive the gate through [rms, durationMs] segments at 50 ms frames. */
  const drive = (segments: { rms: number; ms: number }[], filter: NoiseFilter, speaking: boolean) => {
    let state: SpeechGateState = createSpeechGateState();
    let now = 0;
    let everOpened = false;
    let firstOpenAt = -1;
    for (const seg of segments) {
      const frames = Math.max(1, Math.round(seg.ms / STEP));
      for (let i = 0; i < frames; i++) {
        state = pushSpeechGateFrame(state, seg.rms, filter, now, speaking);
        if (state.open) { everOpened = true; if (firstOpenAt < 0) firstOpenAt = now; }
        now += STEP;
      }
    }
    return { state, everOpened, firstOpenAt };
  };

  it("a single transient frame never opens the gate, however loud", () => {
    const { everOpened } = drive([{ rms: 0.3, ms: STEP }, { rms: 0, ms: 1000 }], "strong", false);
    expect(everOpened).toBe(false);
  });

  it("sustained speech-level input opens the gate after the sustain window", () => {
    const { everOpened, firstOpenAt } = drive([{ rms: 0.08, ms: 600 }], "strong", false);
    expect(everOpened).toBe(true);
    // The sustain is ~80 ms (2026-11-18); at 50 ms frames the open
    // lands on the first frame at or past it.
    expect(firstOpenAt).toBe(Math.ceil(SPEECH_GATE_SUSTAIN_MS / STEP) * STEP);
  });

  it("single-frame bursts do not accumulate toward opening", () => {
    // One-frame (50 ms) bursts with quiet gaps: each run is under
    // the ~80 ms sustain window and a quiet frame resets the run.
    // (150 ms bursts DID stay shut under the old 200 ms window;
    // at the 2026-11-18 sustain they are indistinguishable from a
    // short real word and open by design — see the "yes" case.)
    const { everOpened } = drive([
      { rms: 0.08, ms: 50 }, { rms: 0, ms: 100 },
      { rms: 0.08, ms: 50 }, { rms: 0, ms: 100 },
      { rms: 0.08, ms: 50 }, { rms: 0, ms: 500 },
    ], "strong", false);
    expect(everOpened).toBe(false);
  });

  it("a quiet voice under the strong bar still opens the gate — the opening bar is capped at balanced (2026-11-18)", () => {
    expect(SPEECH_GATE_OPENING_MAX).toBe(noiseThresholds.balanced);
    // 0.015 sits BELOW the strong threshold (0.025) and above
    // balanced (0.012): the owner's whispered level. Sustained, it
    // must open the gate even with the strong filter applied.
    const { everOpened } = drive([{ rms: 0.015, ms: 400 }], "strong", false);
    expect(everOpened).toBe(true);
    // Below balanced it stays shut — room tone is not speech.
    const quiet = drive([{ rms: 0.008, ms: 1000 }], "strong", false);
    expect(quiet.everOpened).toBe(false);
  });

  it("a short real answer still opens the gate while she is silent", () => {
    // A ~300 ms "yes" at clear speech level must get through: the
    // sustain window is a noise bar, not a word-length test.
    const { everOpened } = drive([{ rms: 0.08, ms: 300 }], "strong", false);
    expect(everOpened).toBe(true);
  });

  it("the speaking bar is the strong floor itself (×1 since 2026-11-18), whatever filter is applied", () => {
    expect(SPEECH_GATE_SPEAKING_THRESHOLD).toBe(noiseThresholds.strong);
    // Below the bar, even a full two seconds while she speaks never
    // opens the gate.
    const { everOpened } = drive([{ rms: 0.02, ms: 2000 }], "balanced", true);
    expect(everOpened).toBe(false);
  });

  it("a real voice at the old echo level now interrupts when SUSTAINED — the sustain, not the level, is the echo defence (2026-11-18)", () => {
    // 0.03 sustained unbroken for 600 ms while she speaks: echo
    // breaks at her pauses and never sustains like this; a person
    // talking over her does. It opens after the speaking sustain.
    const { everOpened, firstOpenAt } = drive([{ rms: 0.03, ms: 600 }], "balanced", true);
    expect(everOpened).toBe(true);
    expect(firstOpenAt).toBe(SPEECH_GATE_SPEAKING_SUSTAIN_MS);
  });

  it("speaker echo simulation: periodic low-level bursts while she speaks never interrupt", () => {
    // Echo follows her speech envelope: bursts above the gate's
    // bar, broken by her natural pauses. Neither the near-bar
    // pattern (0.035) nor the above-bar-but-broken pattern (0.06 in
    // 150 ms bursts, under the 250 ms speaking sustain) may open.
    const pattern = (rms: number) => Array.from({ length: 12 }, () => [{ rms, ms: 150 }, { rms: 0.004, ms: 100 }]).flat();
    expect(drive(pattern(0.035), "strong", true).everOpened).toBe(false);
    expect(drive(pattern(0.06), "strong", true).everOpened).toBe(false);
  });

  it("real speech over her still interrupts: loud sustained input opens while she speaks", () => {
    const { everOpened, firstOpenAt } = drive([{ rms: 0.09, ms: 900 }], "strong", true);
    expect(everOpened).toBe(true);
    expect(firstOpenAt).toBe(SPEECH_GATE_SPEAKING_SUSTAIN_MS);
  });

  it("once open, the speech tail extends on the plain threshold and closes after the 450 ms hangover", () => {
    let state = createSpeechGateState();
    // Open while she is silent: 0.08 sustained past the sustain window.
    for (let t = 0; t <= 200; t += STEP) state = pushSpeechGateFrame(state, 0.08, "strong", t, false);
    expect(state.open).toBe(true);
    // She starts speaking mid-turn; the visitor's tail at the plain
    // strong threshold still extends the gate (no mid-word clipping).
    state = pushSpeechGateFrame(state, 0.03, "strong", 250, true);
    expect(state.open).toBe(true);
    // Last above-threshold frame was t=250, so the hangover ends at
    // t=700: still open just before, closed at the deadline.
    state = pushSpeechGateFrame(state, 0, "strong", 699, true);
    expect(state.open).toBe(true);
    state = pushSpeechGateFrame(state, 0, "strong", 700, true);
    expect(state.open).toBe(false);
  });
});

// Auto-pick policy (Ron's order, 2026-11-17): the room check may never
// relax filtering on its own — factory AND auto default are Strong /
// Noisy; only an explicit manual pick selects anything lighter.
describe("auto noise policy — strong and noisy unless the visitor chooses", () => {
  it("the auto pick holds strong whatever the tracker suggests", () => {
    expect(autoNoiseFilter("light")).toBe("strong");
    expect(autoNoiseFilter("balanced")).toBe("strong");
    expect(autoNoiseFilter("strong")).toBe("strong");
  });

  it("in auto mode the environment in force reads Noisy at any measured floor", () => {
    expect(appliedAmbientLevel(false, 0)).toBe("noisy");
    expect(appliedAmbientLevel(false, 0.01)).toBe("noisy");
    expect(appliedAmbientLevel(false, 0.03)).toBe("noisy");
  });

  it("after a manual pick the readout returns to the measured room", () => {
    expect(appliedAmbientLevel(true, 0.003)).toBe("quiet");
    expect(appliedAmbientLevel(true, 0.01)).toBe("normal");
    expect(appliedAmbientLevel(true, 0.03)).toBe("noisy");
  });

  // micDiag's nf= records the APPLIED filter (2026-11-17): in auto
  // that is strong by rule, whatever stale value the state holds —
  // a session's start stamp read nf=balanced in an auto session
  // because the raw state was stamped before auto resolution.
  it("the applied filter resolves auto to strong and honors a manual pick", () => {
    expect(appliedNoiseFilter(false, "light")).toBe("strong");
    expect(appliedNoiseFilter(false, "balanced")).toBe("strong");
    expect(appliedNoiseFilter(false, "strong")).toBe("strong");
    expect(appliedNoiseFilter(true, "light")).toBe("light");
    expect(appliedNoiseFilter(true, "balanced")).toBe("balanced");
    expect(appliedNoiseFilter(true, "strong")).toBe("strong");
  });
});

// Dead-air exception (2026-11-18): the ONE case where auto mode may
// relax — energy flowing, gate never opened, well into the session.
// The owner's sessions are the fixture: 675 energy frames, zero
// gate opens, zero turns, the whole conversation sent as silence.
describe("deadAirRelaxedFilter — the dead-air exception to never-relax", () => {
  const base = { applied: "strong" as NoiseFilter, manual: false, alreadyRelaxed: false, gateEverOpened: false, energyFrames: 675, liveMs: 87_000 };

  it("relaxes strong one level to balanced on the owner's evidence shape", () => {
    expect(deadAirRelaxedFilter(base)).toBe("balanced");
  });

  it("never overrides a manual pick, never relaxes twice, never fires once the gate has opened", () => {
    expect(deadAirRelaxedFilter({ ...base, manual: true })).toBeNull();
    expect(deadAirRelaxedFilter({ ...base, alreadyRelaxed: true })).toBeNull();
    expect(deadAirRelaxedFilter({ ...base, gateEverOpened: true })).toBeNull();
  });

  it("waits for real evidence: 20s live and watchdog-grade energy frames", () => {
    expect(deadAirRelaxedFilter({ ...base, liveMs: 19_999 })).toBeNull();
    expect(deadAirRelaxedFilter({ ...base, liveMs: 20_000 })).toBe("balanced");
    expect(deadAirRelaxedFilter({ ...base, energyFrames: 29 })).toBeNull();
    expect(deadAirRelaxedFilter({ ...base, energyFrames: 30 })).toBe("balanced");
    // A truly dead stream (no energy at all) is the watchdog's
    // case, not a relax case.
    expect(deadAirRelaxedFilter({ ...base, energyFrames: 0 })).toBeNull();
  });

  it("steps down one level at a time and stops at light", () => {
    expect(deadAirRelaxedFilter({ ...base, applied: "balanced" })).toBe("light");
    expect(deadAirRelaxedFilter({ ...base, applied: "light" })).toBeNull();
  });
});