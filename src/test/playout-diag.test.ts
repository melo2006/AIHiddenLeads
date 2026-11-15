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

describe("playoutDiagDetail — terminal sink (volume-speaker fix)", () => {
  it("a media-element terminal proves no AudioContext is in the heard chain", () => {
    const detail = playoutDiagDetail({
      ...localSettled,
      terminal: { sink: "media-element", paused: false, readyState: 4, ctxInChain: false, trailSec: 0.25 },
    });
    expect(detail).toContain("term=media-element");
    expect(detail).toContain("tp=0");
    expect(detail).toContain("trs=4");
    expect(detail).toContain("ctxchain=0");
    expect(detail).toContain("trail=0.25");
  });

  it("the #48 media-stream terminal reports the context in the chain and no trail", () => {
    const detail = playoutDiagDetail({
      ...localSettled,
      terminal: { sink: "media-stream", paused: true, readyState: 2, ctxInChain: true, trailSec: null },
    });
    expect(detail).toContain("term=media-stream");
    expect(detail).toContain("tp=1");
    expect(detail).toContain("ctxchain=1");
    expect(detail).toContain("trail=-");
  });

  it("snapshots without a terminal keep the pre-fix detail shape", () => {
    expect(playoutDiagDetail(localSettled)).not.toContain("term=");
  });
});

describe("playoutDiagDetail — round 4 engine proof", () => {
  it("a settled media-element terminal proves engine ready, encoder rate, unmuted element at the slider volume", () => {
    const detail = playoutDiagDetail({
      ...localSettled,
      terminal: {
        sink: "media-element", paused: false, readyState: 4, ctxInChain: false, trailSec: 0.25,
        engineState: "ready", engineFailure: null, encoderRate: 48000, elementMuted: false, elementVolume: 0.3,
      },
    });
    expect(detail).toContain("term=media-element");
    expect(detail).toContain("eng=ready");
    expect(detail).toContain("efail=-");
    expect(detail).toContain("erate=48000");
    expect(detail).toContain("emut=0");
    expect(detail).toContain("evol=0.30");
  });

  it("a sink terminal after an engine death names the failure instead of hiding it (the #51 record could not)", () => {
    const detail = playoutDiagDetail({
      ...localSettled,
      terminal: {
        sink: "media-stream", paused: false, readyState: 4, ctxInChain: true, trailSec: null,
        engineState: "failed", engineFailure: "encoder-unsupported", encoderRate: null, elementMuted: false, elementVolume: 1,
      },
    });
    expect(detail).toContain("term=media-stream");
    expect(detail).toContain("eng=failed");
    expect(detail).toContain("efail=encoder-unsupported");
    expect(detail).toContain("erate=-");
    expect(detail).toContain("emut=0");
    expect(detail).toContain("evol=1.00");
  });

  it("an engine still starting reads as such, and a context terminal has no element to prove", () => {
    const starting = playoutDiagDetail({
      ...localSettled,
      terminal: {
        sink: "context", paused: true, readyState: 0, ctxInChain: true, trailSec: null,
        engineState: "starting", engineFailure: null, encoderRate: null, elementMuted: null, elementVolume: null,
      },
    });
    expect(starting).toContain("eng=starting");
    expect(starting).toContain("emut=-");
    expect(starting).toContain("evol=-");
  });

  it("the full round-4 line still fits the server's 400-char detail cap", () => {
    const payload = playoutDiagPayload("s", {
      ...localSettled,
      terminal: {
        sink: "media-element", paused: false, readyState: 4, ctxInChain: false, trailSec: 0.25,
        engineState: "ready", engineFailure: null, encoderRate: 48000, elementMuted: false, elementVolume: 0.3,
      },
    }, 1, ";sink=ready;pctx=running;cap=raw");
    expect(payload.detail.length).toBeLessThanOrEqual(400);
    expect(payload.detail).toContain("term=media-element");
    expect(payload.detail).toContain("cap=raw");
  });
});

describe("playoutDiagDetail — blob-element terminal (Publish #54)", () => {
  it("a blob/file terminal stamps term=blob-element, distinctly from the MSE engine's term=media-element", () => {
    const detail = playoutDiagDetail({
      ...localSettled,
      terminal: {
        sink: "blob-element", paused: false, readyState: 4, ctxInChain: false, trailSec: 0.4,
        engineState: "ready", engineFailure: null, encoderRate: 24000, elementMuted: false, elementVolume: 1,
        stalls: 1, recoveries: 1,
      },
    });
    expect(detail).toContain("term=blob-element");
    expect(detail).not.toContain("term=media-element");
    expect(detail).toContain("eng=ready");
    expect(detail).toContain("stalls=1");
    expect(detail).toContain("rec=1");
    expect(detail).toContain("trail=0.40");
  });
});

describe("playoutDiagDetail — round 5 stall counters", () => {
  it("a media-element terminal reports stall episodes opened and recovered in place", () => {
    const detail = playoutDiagDetail({
      ...localSettled,
      terminal: {
        sink: "media-element", paused: false, readyState: 4, ctxInChain: false, trailSec: 0.25,
        engineState: "ready", engineFailure: null, encoderRate: 24000, elementMuted: false, elementVolume: 1,
        stalls: 3, recoveries: 2,
      },
    });
    expect(detail).toContain("stalls=3");
    expect(detail).toContain("rec=2");
  });

  it("a sink terminal after an engine death still carries the counters from before the flip", () => {
    const detail = playoutDiagDetail({
      ...localSettled,
      terminal: {
        sink: "media-stream", paused: false, readyState: 4, ctxInChain: true, trailSec: null,
        engineState: "failed", engineFailure: "element-stalled", encoderRate: 24000, elementMuted: false, elementVolume: 1,
        stalls: 4, recoveries: 3,
      },
    });
    expect(detail).toContain("efail=element-stalled");
    expect(detail).toContain("stalls=4");
    expect(detail).toContain("rec=3");
  });

  it("no engine to count them reads as '-'", () => {
    const detail = playoutDiagDetail({
      ...localSettled,
      terminal: {
        sink: "context", paused: true, readyState: 0, ctxInChain: true, trailSec: null,
        engineState: "off", engineFailure: null, encoderRate: null, elementMuted: null, elementVolume: null,
      },
    });
    expect(detail).toContain("stalls=-");
    expect(detail).toContain("rec=-");
  });

  it("the full round-5 line still fits the server's 400-char detail cap", () => {
    const payload = playoutDiagPayload("s", {
      ...localSettled,
      terminal: {
        sink: "media-element", paused: false, readyState: 4, ctxInChain: false, trailSec: 0.25,
        engineState: "ready", engineFailure: null, encoderRate: 48000, elementMuted: false, elementVolume: 0.3,
        stalls: 12, recoveries: 11,
      },
    }, 1, ";sink=ready;pctx=running;cap=raw");
    expect(payload.detail.length).toBeLessThanOrEqual(400);
    expect(payload.detail).toContain("stalls=12");
    expect(payload.detail).toContain("rec=11");
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

  it("dedupe is session-scoped: a reconnect's identical state still stamps (reconnect-stamp fix)", () => {
    // Ron's failing 238 s session (2026-11-14) was a reconnect whose
    // playout state matched the prior session's last stamp; with a
    // session-blind key its first stamp would have been suppressed.
    const a = playoutDiagPayload("session-a", localSettled, 1);
    const b = playoutDiagPayload("session-b", localSettled, 1);
    expect(playoutDiagSignature(a)).not.toBe(playoutDiagSignature(b));
  });
});
