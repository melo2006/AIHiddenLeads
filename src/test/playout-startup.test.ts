// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createPlayoutStartupWatch,
  heardEngineWhy,
  STARTUP_BLOCKED_AFTER_MS,
  startupDiagDetail,
  startupDiagPayload,
  startupDiagSignature,
  type PlayoutProbe,
} from "../lib/playoutStartup";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

/**
 * Playout startup guard (chat-fix3, 2026-11-16): session b21b5884 —
 * the server transcript proved Aspen spoke, Ron's mic was live, and
 * he heard nothing for 32 s. The steady-state engines are locked;
 * the hole was startup: an auto-started session has no fresh tap
 * gesture, so the terminal's first play() can be refused (or the
 * context left suspended) with the refusal swallowed. The watch in
 * lib/playoutStartup.ts is the mechanical answer: baseline at
 * first audio, a "blocked" verdict (→ Tap-for-sound pill) when the
 * terminal clock has not advanced 1.5 s later AND the terminal is
 * gesture-fixable, and a startupDiag stamp either way. These tests
 * drive the detector with abstracted probes — no DOM, no engine.
 */
const T0 = 1_000_000;
const probe = (over: Partial<PlayoutProbe> = {}): PlayoutProbe => ({
  clockSec: 0,
  paused: false,
  muted: false,
  ctxState: "running",
  ...over,
});
const armedWatch = (baselineProbe: PlayoutProbe = probe()) => {
  const watch = createPlayoutStartupWatch();
  watch.noteFirstAudio({ atMs: T0, engine: "blob", why: "default", terminal: "blob-element", probe: baselineProbe });
  return watch;
};

describe("playout startup watch — the blocked detector", () => {
  it("is pending before anything is armed, and inside the decision window", () => {
    const watch = createPlayoutStartupWatch();
    expect(watch.armed).toBe(false);
    expect(watch.evaluate(probe({ paused: true }), T0 + 60_000)).toBe("pending");
    const armed = armedWatch();
    expect(armed.evaluate(probe({ paused: true }), T0 + STARTUP_BLOCKED_AFTER_MS - 1)).toBe("pending");
  });

  it("advancing: the terminal clock moved past the epsilon, whatever the element state", () => {
    const watch = armedWatch(probe({ clockSec: 0.4 }));
    expect(watch.advanced(probe({ clockSec: 0.4 + 0.2 }))).toBe(true);
    expect(watch.evaluate(probe({ clockSec: 0.6, paused: true }), T0 + 5_000)).toBe("advancing");
  });

  it("blocked: delivered, not advancing at 1.5 s, element paused (the autoplay-refusal shape)", () => {
    const watch = armedWatch(probe({ clockSec: 0, paused: true }));
    expect(watch.evaluate(probe({ clockSec: 0, paused: true }), T0 + STARTUP_BLOCKED_AFTER_MS)).toBe("blocked");
  });

  it("blocked: context suspended even while the element claims not-paused", () => {
    const watch = armedWatch(probe({ ctxState: "suspended" }));
    expect(watch.evaluate(probe({ ctxState: "suspended" }), T0 + STARTUP_BLOCKED_AFTER_MS)).toBe("blocked");
  });

  it("frozen: not advancing but NOT gesture-fixable (element playing, context running) — no pill, the engines' stall ladder owns it", () => {
    const watch = armedWatch(probe({ clockSec: 1.2 }));
    expect(watch.evaluate(probe({ clockSec: 1.2 }), T0 + STARTUP_BLOCKED_AFTER_MS)).toBe("frozen");
  });

  it("a null clock (no terminal yet) never reads as advancing; a paused no-clock terminal is still the gesture-fixable shape", () => {
    const watch = armedWatch(probe({ clockSec: null, paused: true, ctxState: "none" }));
    expect(watch.advanced(probe({ clockSec: null }))).toBe(false);
    // Paused with no clock and no context: still the gesture-fixable
    // shape (nothing has ever played) — the pill is the right ask.
    expect(watch.evaluate(probe({ clockSec: null, paused: true, ctxState: "none" }), T0 + STARTUP_BLOCKED_AFTER_MS)).toBe("blocked");
  });

  it("first baseline wins; reset re-arms for the next session", () => {
    const watch = armedWatch(probe({ clockSec: 0 }));
    watch.noteFirstAudio({ atMs: T0 + 999, engine: "sink", why: "query", terminal: "context", probe: probe({ clockSec: 9 }) });
    expect(watch.baseline?.engine).toBe("blob");
    expect(watch.baseline?.atMs).toBe(T0);
    watch.reset();
    expect(watch.armed).toBe(false);
    watch.noteFirstAudio({ atMs: T0 + 999, engine: "sink", why: "query", terminal: "context", probe: probe({ clockSec: 9 }) });
    expect(watch.baseline?.engine).toBe("sink");
  });
});

describe("heardEngineWhy — mirrors resolveHeardEngine precedence", () => {
  it("query param wins, then the stored preference, then default", () => {
    expect(heardEngineWhy("?heardEngine=element", "sink")).toBe("query");
    expect(heardEngineWhy("?x=1", "sink")).toBe("stored");
    expect(heardEngineWhy("", null)).toBe("default");
    expect(heardEngineWhy("?heardEngine=bogus", "bogus")).toBe("default");
    expect(heardEngineWhy(null, "blob")).toBe("stored");
  });
});

describe("startupDiag stamp — micDiag's sibling shape", () => {
  it("renders the first-audio facts: engine + why, context state, element paused/muted, advance unknown", () => {
    const detail = startupDiagDetail({
      event: "first", engine: "blob", why: "default", terminal: "blob-element",
      ctxState: "suspended", paused: true, muted: false, advanced: null,
    });
    expect(detail).toBe("ev=first;eng=blob;why=default;term=blob-element;ctx=suspended;epaused=1;emut=0;adv=-");
  });

  it("renders the check stamp with the 2 s advance verdict", () => {
    const detail = startupDiagDetail({
      event: "check", engine: "blob", why: "stored", terminal: "media-stream",
      ctxState: "running", paused: false, muted: null, advanced: false, verdict: "blocked",
    });
    expect(detail).toContain("emut=-");
    expect(detail).toContain("adv=0");
    expect(detail).toContain("verdict=blocked");
  });

  it("payload caps the detail at 400 chars and the signature is session-scoped", () => {
    const payload = startupDiagPayload("11111111-1111-1111-1111-111111111111", {
      event: "blocked", engine: "blob", why: "default", terminal: "blob-element",
      ctxState: "running", paused: true, muted: false, advanced: false, verdict: "blocked",
    }, 42);
    expect(payload.detail.length).toBeLessThanOrEqual(400);
    expect(payload.at).toBe(42);
    expect(startupDiagSignature(payload)).toContain(payload.sessionId);
    expect(startupDiagSignature(payload)).toBe(`${payload.sessionId}|${payload.detail}`);
  });
});

describe("startup guard wiring — conversation + session function", () => {
  const conversation = read("../components/GeminiConversation.tsx");
  const sessionFn = read("../../supabase/functions/gemini-session/index.ts");

  it("the conversation arms the watch on the first locally-routed chunk and re-arms at go-live", () => {
    expect(conversation).toContain("noteStartupFirstAudio()");
    expect(conversation).toContain("startupWatchRef.current.reset()");
    expect(conversation).toContain("stampStartupDiag('first')");
    expect(conversation).toContain("stampStartupDiag('blocked'");
    expect(conversation).toContain("stampStartupDiag('check'");
    expect(conversation).toContain("stampStartupDiag('healed'");
  });

  it("the Tap-for-sound pill renders in both panel layouts and its tap re-primes inside the gesture", () => {
    expect(conversation.match(/panel\.tapForSound/g)?.length).toBe(2);
    expect(conversation).toContain("const primeSound = useCallback");
    expect(conversation).toContain("engine.element.play()");
    expect(conversation).toContain("ctx.resume()");
    // The heal never touches the locked speaker path.
    const prime = conversation.slice(conversation.indexOf("const primeSound"), conversation.indexOf("const primeSound") + 1600);
    expect(prime).not.toContain(".volume");
    expect(prime).not.toContain(".muted =");
  });

  it("gemini-session accepts and appends startupDiag at config.startupDiag, bounded like micDiag", () => {
    expect(sessionFn).toContain("startupDiag:startupDiagSchema.optional()");
    expect(sessionFn).toContain("if(b.startupDiag)");
    expect(sessionFn).toContain("startupDiag:[...priorStartup,startupEntry].slice(-30)");
  });
});
