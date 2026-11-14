// Source contracts for the 2026-11-14 audio root fix (see
// paired-playout.test.ts for the routing unit tests and
// paired-playout-behavior.test.tsx for the through-the-component
// proof). These pin the wiring that must not regress:
//  - the avatar renders a dedicated MEDIA playout element for the tap;
//  - activate() records the sound request BEFORE its live guard, so a
//    too-early activation is completed later instead of lost;
//  - the silent-start path completes a recorded request at live;
//  - level application consults the tap before touching the element;
//  - start() no longer latches defaultMuted=true;
//  - the tap silences the direct element only AFTER its playout
//    element is confirmed playing;
//  - the warm activation verifies the armed state afterwards instead
//    of assuming the swallowed activate() result.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const simli = read("../components/SimliAvatar.tsx");
const conversation = read("../components/GeminiConversation.tsx");
const playout = read("../lib/pairedPlayout.ts");

const sliceBetween = (text: string, start: string, end: string) => {
  const a = text.indexOf(start);
  const b = text.indexOf(end, a + start.length);
  expect(a).toBeGreaterThanOrEqual(0);
  expect(b).toBeGreaterThan(a);
  return text.slice(a, b);
};

describe("paired playout contracts", () => {
  it("the avatar renders a dedicated playout element for the media tap", () => {
    expect(simli).toContain("<audio ref={playoutRef}");
    expect(simli.indexOf("<audio ref={audioRef}")).toBeLessThan(simli.indexOf("<audio ref={playoutRef}"));
  });

  it("activate() records the sound request before the live guard can return false", () => {
    const activate = sliceBetween(simli, "activate: async", "soundArmed:");
    expect(activate.indexOf("wantSoundRef.current = true;")).toBeLessThan(
      activate.indexOf("if (!liveRef.current || !audio.srcObject)"),
    );
    // The dead-face contract itself is unchanged (paired-audio guard).
    expect(activate).toContain("if (!liveRef.current || !audio.srcObject) { unlockMediaElements(video, audio); return false; }");
  });

  it("the silent start completes a recorded sound request when the face goes live", () => {
    expect(simli).toContain("if (wantSoundRef.current) void completeSound();");
  });

  it("level application is tap-aware and start() no longer latches a muted default", () => {
    const apply = sliceBetween(simli, "const applyPlaybackLevel", "const soundArmedNow");
    expect(apply).toContain("pairedPlayout().engaged");
    expect(simli).not.toContain("defaultMuted = true");
    expect(apply).toContain("audio.defaultMuted = false;");
  });

  it("the tap confirms playout before silencing the direct element", () => {
    const engage = sliceBetween(playout, "async engage(", "applyLevel(");
    expect(engage.indexOf("await playout.play()")).toBeLessThan(engage.indexOf("source.volume = 0"));
    // A suspended context must refuse rather than render silence.
    expect(engage).toContain('if (stateNow() !== "running") return false;');
  });

  it("the warm activation verifies the armed state instead of trusting activate()", () => {
    const warm = sliceBetween(conversation, "activateWarmRef.current = async", "// Prepare once on mount");
    expect(warm).toContain("verifySound");
    expect(warm).toContain("handle.soundArmed()");
    expect(warm).toContain("speakerMutedRef.current");
  });
});
