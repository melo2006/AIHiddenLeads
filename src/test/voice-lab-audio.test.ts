import { describe, expect, it } from "vitest";
import { microphonePcm, shouldSendMicrophone } from "../lib/voiceLabAudio";

describe("Voice Lab microphone privacy controls", () => {
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