import { afterEach, describe, expect, it } from "vitest";
import { microphonePcm, shouldSendMicrophone, microphoneGate, microphoneAutoGain, initialCaptureMode, estimateNoiseFloor, pickNoiseFilterForFloor, ambientLevelForFloor, createAmbientGateState, pushAmbientRms, AMBIENT_WINDOW_MAX_SAMPLES } from "../lib/voiceLabAudio";

describe("Voice Lab microphone privacy controls", () => {
  it('strong filtering does not automatically amplify background noise', () => {
    expect(microphoneAutoGain('handsfree', 'strong')).toBe(false);
    expect(microphoneAutoGain('handsfree', 'balanced')).toBe(true);
    expect(microphoneAutoGain('hold', 'balanced')).toBe(false);
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