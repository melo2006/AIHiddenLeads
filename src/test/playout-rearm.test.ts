// Playout recovery guard (Publish #62): the policy that decides
// what happens when a heard-element engine dies, the counter
// arithmetic that keeps stalls/recoveries countable across
// engine instances, and the source contracts wiring the policy
// into GeminiConversation.
//
// The failure this guards (Ron's live test, 2026-11-15, sessions
// 71f6acf2 / ac082762): the blob engine died ONCE with
// "element-stalled", the fatal handler marked the engine slot
// 'failed' forever, and the session settled on the media-stream
// sink (term=media-stream, rw sagging 0.85..0.96) with rec=0.
// These tests pin: stall-class blob deaths re-arm while budget
// lasts, escalate to the reconnect path when it is spent, and
// everything else settles exactly as before.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BLOB_REARMABLE_REASONS,
  MAX_BLOB_ENGINE_REARMS,
  combineEngineCounters,
  engineRearmDecision,
} from "@/lib/playoutRearm";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const conversation = read("../components/GeminiConversation.tsx");
const sliceBetween = (text: string, start: string, end: string) => {
  const a = text.indexOf(start);
  const b = text.indexOf(end, a + start.length);
  expect(a).toBeGreaterThanOrEqual(0);
  expect(b).toBeGreaterThan(a);
  return text.slice(a, b);
};
const count = (text: string, needle: string) => text.split(needle).length - 1;

describe("engineRearmDecision", () => {
  it("a blob engine dying of a stall re-arms while the budget lasts", () => {
    expect(engineRearmDecision({ kind: "blob", reason: "element-stalled", rearmAttempts: 0 })).toBe("rearm");
    expect(engineRearmDecision({ kind: "blob", reason: "element-stalled", rearmAttempts: MAX_BLOB_ENGINE_REARMS - 1 })).toBe("rearm");
    expect(engineRearmDecision({ kind: "blob", reason: "element-error", rearmAttempts: 0 })).toBe("rearm");
  });

  it("a stall-class blob death with the budget spent escalates to the reconnect path — never the sink settle", () => {
    expect(engineRearmDecision({ kind: "blob", reason: "element-stalled", rearmAttempts: MAX_BLOB_ENGINE_REARMS })).toBe("reconnect");
    expect(engineRearmDecision({ kind: "blob", reason: "element-error", rearmAttempts: MAX_BLOB_ENGINE_REARMS + 3 })).toBe("reconnect");
  });

  it("platform/config deaths settle: a fresh instance would hit the same wall", () => {
    for (const reason of ["unsupported", "encoder-unsupported", "no-encoder", "encoder-error", "encode-exception", "mux-exception", "exception", "encoder-restart"]) {
      expect(engineRearmDecision({ kind: "blob", reason, rearmAttempts: 0 })).toBe("settle");
    }
  });

  it("the MSE opt-in and the no-engine case settle exactly as before the guard", () => {
    expect(engineRearmDecision({ kind: "mse", reason: "element-stalled", rearmAttempts: 0 })).toBe("settle");
    expect(engineRearmDecision({ kind: null, reason: "element-stalled", rearmAttempts: 0 })).toBe("settle");
  });

  it("the re-armable set is exactly the two stall-class reasons, and the budget is bounded", () => {
    expect([...BLOB_REARMABLE_REASONS].sort()).toEqual(["element-error", "element-stalled"]);
    expect(MAX_BLOB_ENGINE_REARMS).toBe(2);
    // A caller-supplied cap is honoured (the policy stays pure).
    expect(engineRearmDecision({ kind: "blob", reason: "element-stalled", rearmAttempts: 0, maxRearms: 0 })).toBe("reconnect");
  });
});

describe("combineEngineCounters", () => {
  it("no engine and no carry renders undefined — the pre-#62 '-' stamp shape", () => {
    expect(combineEngineCounters({ stalls: 0, recoveries: 0 }, null)).toEqual({ stalls: undefined, recoveries: undefined });
    expect(combineEngineCounters({ stalls: 0, recoveries: 0 }, undefined)).toEqual({ stalls: undefined, recoveries: undefined });
  });

  it("a live engine with no carry reports its own counters (the pre-#62 totals)", () => {
    expect(combineEngineCounters({ stalls: 0, recoveries: 0 }, { stallCount: 2, recoveryCount: 1 })).toEqual({ stalls: 2, recoveries: 1 });
  });

  it("a retired engine's counters carry into the totals of its replacement", () => {
    // Engine #1 died with 1 stall / 0 recoveries; the guard's
    // successful re-arm added 1 recovery to the carry; engine #2
    // has so far added a stall it recovered in place.
    expect(combineEngineCounters({ stalls: 1, recoveries: 1 }, { stallCount: 1, recoveryCount: 1 })).toEqual({ stalls: 2, recoveries: 2 });
    // Mid-re-arm (no live engine yet) the carry alone still
    // stamps — the bridging stamp shows the stall that caused it.
    expect(combineEngineCounters({ stalls: 1, recoveries: 0 }, null)).toEqual({ stalls: 1, recoveries: 0 });
  });
});

describe("playout recovery guard contracts (GeminiConversation)", () => {
  it("the fatal handler takes the guard's decision and retires a re-armed engine before re-creating", () => {
    const fatal = sliceBetween(conversation, "const onEngineFatal", "engine = heardEngine() === 'blob'");
    expect(fatal).toContain("engineRearmDecision({");
    expect(fatal).toContain("rearmAttempts: engineRearmRef.current.attempts");
    // Retire order: carry the counters, count the attempt, drain,
    // dispose, clear the slot — then the shared tail re-creates.
    expect(fatal).toContain("engineCarryRef.current.stalls + dying.stallCount");
    expect(fatal).toContain("engineRearmRef.current.attempts += 1");
    expect(fatal).toContain("engineRearmRef.current.pending = true");
    expect(fatal.indexOf("dying.drainPendingPcm()")).toBeLessThan(fatal.indexOf("dying.dispose()"));
    expect(fatal).toContain("mediaElementRef.current = null");
    expect(fatal).toContain("if (decision === 'rearm') ensureMediaElement();");
    // The settle branch keeps the pre-#62 permanent flip.
    expect(fatal).toContain("mediaElementStateRef.current = 'failed'");
  });

  it("a spent budget surfaces the existing bounded reconnect path, verbatim strings included", () => {
    const fatal = sliceBetween(conversation, "const onEngineFatal", "engine = heardEngine() === 'blob'");
    expect(fatal).toContain("if (decision === 'reconnect' && liveRef.current) {");
    expect(fatal).toContain('setStatus("Reconnecting…")');
    expect(fatal).toContain("reconnectRef.current.count < 3");
    expect(fatal).toContain("setError('The connection dropped and could not be restored. Press play to reconnect.')");
  });

  it("a re-arm start that settles READY counts exactly one recovery, into the carry", () => {
    const settle = sliceBetween(conversation, "void engine.start().then((ok) => {", "mediaElementStateRef.current = 'ready';");
    expect(settle).toContain("if (engineRearmRef.current.pending) {");
    expect(settle).toContain("engineCarryRef.current.recoveries + 1");
    // …and a failed start clears the flag without counting.
    expect(settle).toContain("engineRearmRef.current.pending = false");
  });

  it("the diag stamps the conversation totals, and stopEverything resets budget and carry", () => {
    const diag = sliceBetween(conversation, "const localTerminalDiag", "const wsRef");
    expect(diag).toContain("...combineEngineCounters(engineCarryRef.current, engine)");
    const teardown = sliceBetween(conversation, "mediaElementRef.current?.dispose();", "captureRawRef.current = false;");
    expect(teardown).toContain("engineCarryRef.current = { stalls: 0, recoveries: 0 };");
    expect(teardown).toContain("engineRearmRef.current = { attempts: 0, pending: false };");
  });

  it("the guard adds no new diag stamp call sites (the pinned count of five stands)", () => {
    expect(count(conversation, "stampPlayoutDiag();")).toBe(5);
  });
});
