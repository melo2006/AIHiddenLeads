import { describe, expect, it } from "vitest";
import { microphonePcm, shouldSendMicrophone, microphoneGate, microphoneAutoGain } from "../lib/voiceLabAudio";

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
  it("replay cannot be picked up as caller speech", () => {
    expect(shouldSendMicrophone("handsfree", false, false, true)).toBe(false);
    expect(shouldSendMicrophone("hold", true, false, true)).toBe(false);
    expect(shouldSendMicrophone("handsfree", false, false, false)).toBe(true);
  });
});