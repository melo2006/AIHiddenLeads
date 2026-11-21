// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { WARM_SESSION_MAX_AGE_MS, warmSessionUnusable, type WarmSessionHealth } from "../lib/warmSession";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const conversation = read("../components/GeminiConversation.tsx");

// WebSocket readyState values (WHATWG).
const CONNECTING = 0;
const OPEN = 1;
const CLOSING = 2;
const CLOSED = 3;

const NOW = 1_700_000_000_000;
const health = (over: Partial<WarmSessionHealth>): WarmSessionHealth => ({
  activated: false,
  readyAt: NOW,
  socketReadyState: OPEN,
  ...over,
});

/**
 * Stale-prewarm guard (2026-11-21). Server-side tests on 2026-11-20
 * proved a held, never-begun voice connection dies silently within
 * ~150 s, and the browser socket can sit half-open through the
 * death — so a demo visitor who read the page for a couple of
 * minutes before tapping always activated a corpse ("Connecting…"
 * forever, or "The voice service did not respond in time") and
 * every retry hit the same dead warm state. These tests pin the
 * tap-time decision: stale or dead warm sessions are discarded for
 * a cold start; a fresh, live one activates exactly as before.
 */
describe("warm session freshness (tap-time decision)", () => {
  it("(c) a fresh, live warm session is usable — warm activation unchanged", () => {
    expect(warmSessionUnusable(health({ readyAt: NOW }), NOW)).toBe(false);
    expect(warmSessionUnusable(health({ readyAt: NOW - 1_000 }), NOW)).toBe(false);
    expect(warmSessionUnusable(health({ readyAt: NOW - WARM_SESSION_MAX_AGE_MS + 1 }), NOW)).toBe(false);
    // Exactly at the bound is still fresh (the rule is strictly older-than).
    expect(warmSessionUnusable(health({ readyAt: NOW - WARM_SESSION_MAX_AGE_MS }), NOW)).toBe(false);
    // No socket handle recorded yet (mint raced the tap): age alone decides.
    expect(warmSessionUnusable(health({ readyAt: NOW - 5_000, socketReadyState: null }), NOW)).toBe(false);
  });

  it("(a) a stale warm session (age) is unusable — the tap must cold-start", () => {
    expect(warmSessionUnusable(health({ readyAt: NOW - WARM_SESSION_MAX_AGE_MS - 1 }), NOW)).toBe(true);
    // The proven failure shape: readied, then the visitor read the
    // page for ~150 s — the socket still claims OPEN (half-open
    // death), so age alone condemns it.
    expect(warmSessionUnusable(health({ readyAt: NOW - 150_000, socketReadyState: OPEN }), NOW)).toBe(true);
    expect(warmSessionUnusable(health({ readyAt: NOW - 600_000 }), NOW)).toBe(true);
  });

  it("(b) a dead warm socket is unusable — the tap must cold-start", () => {
    expect(warmSessionUnusable(health({ readyAt: NOW - 1_000, socketReadyState: CLOSED }), NOW)).toBe(true);
    expect(warmSessionUnusable(health({ readyAt: NOW - 1_000, socketReadyState: CLOSING }), NOW)).toBe(true);
    // A readied session whose socket fell back to CONNECTING is not OPEN either.
    expect(warmSessionUnusable(health({ readyAt: NOW - 1_000, socketReadyState: CONNECTING }), NOW)).toBe(true);
    // Died while still warming: never readied, socket terminally dead.
    expect(warmSessionUnusable(health({ readyAt: null, socketReadyState: CLOSED }), NOW)).toBe(true);
    expect(warmSessionUnusable(health({ readyAt: null, socketReadyState: CLOSING }), NOW)).toBe(true);
  });

  it("a still-warming session is not condemned — activation keeps waiting on ready", () => {
    expect(warmSessionUnusable(health({ readyAt: null, socketReadyState: CONNECTING }), NOW)).toBe(false);
    expect(warmSessionUnusable(health({ readyAt: null, socketReadyState: OPEN }), NOW)).toBe(false);
    expect(warmSessionUnusable(health({ readyAt: null, socketReadyState: null }), NOW)).toBe(false);
  });

  it("an activated session is a live conversation and is never discarded here", () => {
    expect(warmSessionUnusable(health({ activated: true, readyAt: NOW - 3_600_000, socketReadyState: CLOSED }), NOW)).toBe(false);
    expect(warmSessionUnusable(health({ activated: true, readyAt: null, socketReadyState: null }), NOW)).toBe(false);
  });
});

describe("warm session wiring (GeminiConversation)", () => {
  it("tracks when the warm session became ready and keeps its socket handle", () => {
    expect(conversation).toContain("readyAt: number | null; socket: WebSocket | null");
    expect(conversation).toContain("warmState.readyAt = Date.now()");
    expect(conversation).toContain("if (warm && warmState) warmState.socket = ws;");
  });

  it("checks freshness at tap time, BEFORE activating, and falls through to a cold start", () => {
    expect(conversation).toContain("const warmStale = !warmRef.current.activated && warmSessionUnusable({");
    expect(conversation).toContain("if (warmStale) {");
    // The discard is the same teardown the language guard uses; the
    // cold start then runs below (no early return on this path).
    const tapBlock = conversation.slice(conversation.indexOf("const warmStale"), conversation.indexOf("const reconnecting = reconnectRef.current.pending"));
    expect(tapBlock).toContain("stopEverything();");
    expect(tapBlock).toContain("await activateWarmRef.current(); return;");
  });

  it("clears the warm state when the warm socket closes or errors before activation", () => {
    expect(conversation).toContain("if (warm && warmState && warmRef.current === warmState && !warmState.activated) { failWarm(); return; }");
    // Both handlers carry the guard (error + close).
    expect(conversation.split("warmRef.current === warmState").length - 1).toBe(2);
  });
});
