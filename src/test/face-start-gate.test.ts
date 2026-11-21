// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { faceGateAction, lateFaceAction, FACE_REFUSAL_WINDOW_MS, type FaceStartSettlement } from "../lib/faceStartGate";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const conversation = read("../components/GeminiConversation.tsx");

const pending: FaceStartSettlement = { settled: false, outcome: null, error: null };
const started: FaceStartSettlement = { settled: true, outcome: { started: true, fallback: false }, error: null };
const videoFailed: FaceStartSettlement = { settled: true, outcome: { started: false, fallback: true }, error: null };
const notStarted: FaceStartSettlement = { settled: true, outcome: { started: false, fallback: false }, error: null };
const hardError: FaceStartSettlement = { settled: true, outcome: null, error: new Error("SOUND_BLOCKED") };

/**
 * Voice-first start gate (2026-11-21). The parent start used to
 * await the Simli face (first displayed frame, internal retries and
 * all) inside the same Promise.all that produced the voice session,
 * so the Gemini socket — and, on the prewarm path, the held
 * session's `ready` — was downstream of the face. A slow face on a
 * phone consumed the tap's 15 s activation race and surfaced "The
 * voice service did not respond in time" against a healthy voice
 * service. These tests pin the decoupled gate: a settled face keeps
 * its pre-change outcomes; a still-starting face proceeds
 * voice-first and can never fail the start afterwards.
 */
describe("face start gate (at the voice-ready moment)", () => {
  it("a face still starting proceeds voice-first instead of gating the socket", () => {
    expect(faceGateAction(pending)).toBe("voice-first");
  });

  it("a settled live face proceeds exactly as before", () => {
    expect(faceGateAction(started)).toBe("proceed");
  });

  it("a settled video-start failure degrades to the voice-only fallback", () => {
    expect(faceGateAction(videoFailed)).toBe("fallback");
  });

  it("a settled hard failure still fails the start (pre-change behavior)", () => {
    expect(faceGateAction(hardError)).toBe("fail");
  });

  it("a face that settled without starting or a fallback verdict fails the start", () => {
    expect(faceGateAction(notStarted)).toBe("fail");
  });
});

describe("late face settle (after the gate passed voice-first)", () => {
  it("a face that lands attaches", () => {
    expect(lateFaceAction(started)).toBe("attach");
  });

  it("a video-start failure degrades to voice-only — never fails the live start", () => {
    expect(lateFaceAction(videoFailed)).toBe("fallback");
  });

  it("a hard failure degrades to voice-only — never fails the live start", () => {
    expect(lateFaceAction(hardError)).toBe("fallback");
  });

  it("a face that settled without starting degrades to voice-only", () => {
    expect(lateFaceAction(notStarted)).toBe("fallback");
  });
});

describe("refusal window", () => {
  it("is long enough for a one-round-trip refusal, far shorter than a healthy face start", () => {
    expect(FACE_REFUSAL_WINDOW_MS).toBeGreaterThanOrEqual(250);
    expect(FACE_REFUSAL_WINDOW_MS).toBeLessThanOrEqual(2000);
  });

  it("the gate waits out the window before going voice-first", () => {
    expect(conversation).toContain("FACE_REFUSAL_WINDOW_MS");
    expect(conversation).toContain("await Promise.race([faceSettled,");
  });
});

describe("voice-first wiring in GeminiConversation", () => {
  it("the start gate consults the settlement, not the raw face promise", () => {
    expect(conversation).toContain('from "@/lib/faceStartGate"');
    expect(conversation).toContain("faceGateAction(faceSettlement)");
    expect(conversation).toContain("lateFaceAction(faceSettlement)");
    // The old shape awaited faceReady inside the session Promise.all.
    expect(conversation).not.toContain("micResume,\n        faceReady,\n      ]);");
  });

  it("chunks route locally while the parent face is pending", () => {
    expect(conversation).toContain("segmentFacePendingRef.current != null || parentFacePendingRef.current");
    expect(conversation).toContain("if (faceGate === 'voice-first' && avatarRequestedRef.current) parentFacePendingRef.current = true;");
  });

  it("teardown clears the parent pending flag with the segment one", () => {
    expect(conversation).toContain("segmentFacePendingRef.current = null;\n    parentFacePendingRef.current = false;");
  });

  it("warm activation re-kicks a dropped face instead of throwing the moving-face error", () => {
    expect(conversation).toContain("settleRekick");
    // The moving-face throw survives only at the pre-gate fail path.
    expect(conversation.match(/throw new Error\('The moving face could not connect/g) ?? []).toHaveLength(1);
  });
});
