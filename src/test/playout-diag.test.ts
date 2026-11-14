// Playout telemetry shaping (volume-stream fix, 2026-11-14): the
// detail line stored at config.playoutDiag must carry every field
// the next phone test will be read from — path, mode, tap state and
// refusal gate, element states, returned-track state, starve
// outcome — in one eyeball-able line, and the payload must respect
// the server schema's 400-char cap.
import { describe, expect, it } from "vitest";
import { playoutDiagDetail, playoutDiagPayload, playoutDiagSignature, type PlayoutDiagSnapshot } from "@/lib/playoutDiag";

const localSettled: PlayoutDiagSnapshot = {
  path: "local", mode: "local", engaged: false, ctxState: "none", engageError: null,
  srcPaused: false, srcMuted: true, srcVolume: 0, track: "absent", starve: "unsubscribed",
  playoutPaused: true, gain: null,
};
const streamRefused: PlayoutDiagSnapshot = {
  path: "direct", mode: "stream", engaged: false, ctxState: "suspended", engageError: "ctx-suspended",
  srcPaused: false, srcMuted: false, srcVolume: 1, track: "live", starve: "n/a",
  playoutPaused: true, gain: null,
};

describe("playoutDiagDetail", () => {
  it("a settled local-first session reads as local + unsubscribed + no live track", () => {
    const detail = playoutDiagDetail(localSettled);
    expect(detail).toContain("path=local");
    expect(detail).toContain("mode=local");
    expect(detail).toContain("starve=unsubscribed");
    expect(detail).toContain("track=absent");
    expect(detail).toContain("err=-");
  });

  it("a refused tap names the gate that refused it", () => {
    const detail = playoutDiagDetail(streamRefused);
    expect(detail).toContain("path=direct");
    expect(detail).toContain("err=ctx-suspended");
    expect(detail).toContain("ctx=suspended");
    expect(detail).toContain("track=live");
  });

  it("an engaged tap reports its gain", () => {
    const detail = playoutDiagDetail({ ...streamRefused, path: "tap", engaged: true, ctxState: "running", engageError: null, gain: 0.4, playoutPaused: false });
    expect(detail).toContain("path=tap");
    expect(detail).toContain("engaged=1");
    expect(detail).toContain("gain=0.4");
  });
});

describe("playoutDiagPayload / signature", () => {
  it("builds the server payload and folds local-path state into the detail", () => {
    const payload = playoutDiagPayload("11111111-1111-4111-8111-111111111111", localSettled, 123, ";sink=ready;pctx=running");
    expect(payload.sessionId).toBe("11111111-1111-4111-8111-111111111111");
    expect(payload.path).toBe("local");
    expect(payload.at).toBe(123);
    expect(payload.detail).toContain("sink=ready");
    expect(payload.detail.length).toBeLessThanOrEqual(400);
  });

  it("identical snapshots dedupe; any state change re-posts", () => {
    const a = playoutDiagPayload("s", localSettled, 1);
    const b = playoutDiagPayload("s", localSettled, 2);
    expect(playoutDiagSignature(a)).toBe(playoutDiagSignature(b));
    const c = playoutDiagPayload("s", { ...localSettled, starve: "muted-only" }, 3);
    expect(playoutDiagSignature(c)).not.toBe(playoutDiagSignature(a));
  });
});
