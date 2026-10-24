import { describe, expect, it } from "vitest";
import { shouldSendMicrophone } from "../lib/voiceLabAudio";

describe("Voice Lab microphone privacy controls", () => {
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