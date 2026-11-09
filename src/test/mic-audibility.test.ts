// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  MIC_HINT_COOLDOWN_MS,
  MIC_HINT_SILENCE_MS,
  shouldShowMicHint,
  type MicAudibilitySnapshot,
} from "@/lib/micAudibility";

/**
 * "We can't hear you" trigger (mic-path hardening, 2026-11-09): the
 * Durgin forensics showed sessions with ZERO user turns while the
 * visitor believed he was speaking. The hint fires only when Aspen has
 * finished a turn, the silence window has passed, capture is running —
 * and literally nothing has crossed the noise gate or been transcribed
 * since her turn ended.
 */
const base: MicAudibilitySnapshot = {
  now: 100_000,
  live: true,
  handsFree: true,
  muted: false,
  paused: false,
  replaying: false,
  assistantSpeaking: false,
  awaitingSince: 100_000 - MIC_HINT_SILENCE_MS - 1_000,
  lastGateOpenAt: 0,
  lastUserTranscriptAt: 0,
  lastHintAt: 0,
  recoveryActive: false,
};

describe("mic audibility hint", () => {
  it("fires after the silence window with zero gate passes and zero transcriptions", () => {
    expect(shouldShowMicHint(base)).toBe(true);
    expect(shouldShowMicHint({ ...base, awaitingSince: base.now - MIC_HINT_SILENCE_MS })).toBe(true);
  });

  it("stays quiet before the window, or when Aspen has not finished a turn", () => {
    expect(shouldShowMicHint({ ...base, awaitingSince: base.now - MIC_HINT_SILENCE_MS + 1 })).toBe(false);
    expect(shouldShowMicHint({ ...base, awaitingSince: null })).toBe(false);
    expect(shouldShowMicHint({ ...base, assistantSpeaking: true })).toBe(false);
  });

  it("stays quiet when the mic path demonstrably works", () => {
    expect(shouldShowMicHint({ ...base, lastGateOpenAt: (base.awaitingSince ?? 0) + 1 })).toBe(false);
    expect(shouldShowMicHint({ ...base, lastUserTranscriptAt: (base.awaitingSince ?? 0) + 1 })).toBe(false);
  });

  it("respects the cooldown between showings", () => {
    expect(shouldShowMicHint({ ...base, lastHintAt: base.now - MIC_HINT_COOLDOWN_MS + 1 })).toBe(false);
    expect(shouldShowMicHint({ ...base, lastHintAt: base.now - MIC_HINT_COOLDOWN_MS })).toBe(true);
  });

  it("never fires in hold mode, while muted/paused/replaying, during recovery, or when not live", () => {
    expect(shouldShowMicHint({ ...base, handsFree: false })).toBe(false);
    expect(shouldShowMicHint({ ...base, muted: true })).toBe(false);
    expect(shouldShowMicHint({ ...base, paused: true })).toBe(false);
    expect(shouldShowMicHint({ ...base, replaying: true })).toBe(false);
    expect(shouldShowMicHint({ ...base, recoveryActive: true })).toBe(false);
    expect(shouldShowMicHint({ ...base, live: false })).toBe(false);
  });
});
