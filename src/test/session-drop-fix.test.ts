// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MAX_PROVIDER_RESUMPTION_RECONNECTS,
  goAwayReconnectDelayMs,
  goAwayTimeLeftSeconds,
  providerResumeAllowed,
  resumptionHandleFromUpdate,
  sessionResumptionConfig,
} from "../../supabase/functions/_shared/session-resumption";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const proxy = read("../../supabase/functions/gemini-live-proxy/index.ts");
const conversation = read("../components/GeminiConversation.tsx");

/**
 * The REAL session-drop fix (2026-11-09, Ron-approved): provider session
 * resumption in the proxy + client recovery for provider `closed`
 * messages, instead of a dead-end red "Session ended" error.
 */
describe("provider session resumption helpers", () => {
  it("starts a fresh session with an empty resumption config and resumes with the stored handle", () => {
    expect(sessionResumptionConfig(null)).toEqual({});
    expect(sessionResumptionConfig("handle-123")).toEqual({ handle: "handle-123" });
  });

  it("keeps the latest resumption handle from sessionResumptionUpdate messages", () => {
    expect(resumptionHandleFromUpdate(null, { newHandle: "h1", resumable: true })).toEqual({ handle: "h1", resumable: true });
    expect(resumptionHandleFromUpdate("h1", { newHandle: "h2", resumable: false }).handle).toBe("h2");
    expect(resumptionHandleFromUpdate("h2", {})).toEqual({ handle: "h2", resumable: null });
    expect(resumptionHandleFromUpdate("h2", null).handle).toBe("h2");
    expect(resumptionHandleFromUpdate("h2", "junk").handle).toBe("h2");
  });

  it("parses goAway timeLeft in every protobuf Duration JSON shape", () => {
    expect(goAwayTimeLeftSeconds({ timeLeft: "55s" })).toBe(55);
    expect(goAwayTimeLeftSeconds({ timeLeft: { seconds: "42" } })).toBe(42);
    expect(goAwayTimeLeftSeconds({ timeLeft: { seconds: 42 } })).toBe(42);
    expect(goAwayTimeLeftSeconds({ timeLeft: 30 })).toBe(30);
    expect(goAwayTimeLeftSeconds(null)).toBe(60);
    expect(goAwayTimeLeftSeconds({})).toBe(60);
    expect(goAwayTimeLeftSeconds({ timeLeft: "junk" })).toBe(60);
  });

  it("schedules the preemptive reconnect a few seconds ahead of the deadline, with a floor", () => {
    expect(goAwayReconnectDelayMs(60)).toBe(55000);
    expect(goAwayReconnectDelayMs(3)).toBe(250);
  });

  it("bounds consecutive resumption attempts and requires a handle", () => {
    expect(MAX_PROVIDER_RESUMPTION_RECONNECTS).toBe(3);
    expect(providerResumeAllowed(null, 0)).toBe(false);
    expect(providerResumeAllowed("h", 0)).toBe(true);
    expect(providerResumeAllowed("h", MAX_PROVIDER_RESUMPTION_RECONNECTS - 1)).toBe(true);
    expect(providerResumeAllowed("h", MAX_PROVIDER_RESUMPTION_RECONNECTS)).toBe(false);
  });
});

describe("proxy wiring", () => {
  it("sends sessionResumption in the setup message (empty first, stored handle on reconnect)", () => {
    expect(proxy).toContain("sessionResumption: sessionResumptionConfig(providerConnectHandle)");
    expect(proxy).toContain("connectProvider(null)");
    expect(proxy).toContain("connectProvider(resumptionHandle)");
  });

  it("stores handles from sessionResumptionUpdate and handles goAway preemptively", () => {
    expect(proxy).toContain("msg.sessionResumptionUpdate");
    expect(proxy).toContain("resumptionHandleFromUpdate(resumptionHandle, msg.sessionResumptionUpdate)");
    expect(proxy).toContain("msg.goAway");
    expect(proxy).toContain("startProviderReconnect('goaway')");
    expect(proxy).toContain("goAwayReconnectDelayMs(seconds)");
  });

  it("reconnects transparently on provider close and only surfaces the plain line when resumption is impossible", () => {
    expect(proxy).toContain("startProviderReconnect('provider_closed')");
    expect(proxy).toContain("failProviderToClient(e.code)");
    expect(proxy).toContain("reason: VOICE_DISCONNECT_PLAIN");
    // The provider error handler must not tear the session down before
    // onclose can attempt resumption.
    expect(proxy).not.toContain("Connection to Gemini failed");
  });

  it("does not re-send 'ready' or the opening on a resumed connection", () => {
    expect(proxy).toContain("if (!clientReadySent)");
    expect(proxy).toContain("clientReadySent = true");
  });
});

describe("client recovery for provider closed messages", () => {
  it("routes provider-coded closed messages to the recovery path in BOTH socket switches", () => {
    expect(conversation.split("recoverFromProviderClosed(msg.code)").length - 1).toBe(2);
    expect(conversation.split('typeof msg.code === "number"').length - 1).toBe(2);
  });

  it("keeps deliberate server endings (no provider code) on the clean end path", () => {
    expect(conversation).toContain('setError(`Session ended: ${msg.reason || "unknown"}`)');
  });

  it("reuses the bounded reconnect machinery (3 attempts, then manual Talk)", () => {
    expect(conversation).toContain("const recoverFromProviderClosed = useCallback((code: number) => {");
    expect(conversation).toContain("if (swapEnabledRef.current) { dropRecoverRef.current(); return; }");
  });
});
