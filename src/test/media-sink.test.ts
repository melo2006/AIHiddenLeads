// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createMediaSink, mediaPlaybackNode } from "@/lib/mediaSink";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const conversation = read("../components/GeminiConversation.tsx");

/**
 * Hardware-volume fix (2026-11-09): the locally rendered voice must be
 * MEDIA playback (an HTMLAudioElement fed by a MediaStreamDestination)
 * so the phone's hardware media volume governs it on Android Chrome —
 * WebAudio straight to ctx.destination is classified with the
 * voice-communication channel while mic capture is active, where the
 * volume buttons appear dead. Until the element is actually playing,
 * output keeps the destination fallback so a blocked element can never
 * silence a call. No app-side gain override exists on this path: the
 * only gain is the speaker-mute toggle (0 / unity).
 */
describe("media sink", () => {
  it("is unavailable (destination fallback) when the context cannot create a stream destination", () => {
    const destination = {};
    const ctx = { destination } as unknown as AudioContext;
    expect(createMediaSink(ctx)).toBeNull();
    expect(mediaPlaybackNode(ctx, null)).toBe(destination);
  });

  it("feeds an audio element from the graph and only routes to it once playing", async () => {
    const stream = { fake: true } as unknown as MediaStream;
    const node = { kind: "dest" };
    const destination = { kind: "ctx-destination" };
    const ctx = {
      destination,
      createMediaStreamDestination: () => ({ stream }),
    } as unknown as AudioContext;
    // Give the destination node its identity for the routing assertion.
    (ctx.createMediaStreamDestination as () => unknown) = () => Object.assign(node, { stream });

    const sink = createMediaSink(ctx);
    expect(sink).not.toBeNull();
    if (!sink) return;
    expect(sink.element.srcObject).toBe(stream);
    expect(sink.ready).toBe(false);
    // Not playing yet → today's behaviour (destination), never silence.
    expect(mediaPlaybackNode(ctx, sink)).toBe(destination);

    sink.element.play = vi.fn(async () => {});
    sink.element.pause = vi.fn(() => {});
    await sink.play();
    expect(sink.ready).toBe(true);
    expect(mediaPlaybackNode(ctx, sink)).toBe(sink.node);

    sink.dispose();
    expect(sink.element.srcObject).toBeNull();
  });

  it("a blocked element never reports ready", async () => {
    const ctx = {
      destination: {},
      createMediaStreamDestination: () => ({ stream: {} as MediaStream }),
    } as unknown as AudioContext;
    const sink = createMediaSink(ctx);
    if (!sink) throw new Error("sink expected");
    sink.element.play = vi.fn(async () => { throw new Error("NotAllowedError"); });
    await sink.play();
    expect(sink.ready).toBe(false);
    expect(mediaPlaybackNode(ctx, sink)).toBe(ctx.destination);
  });
});

describe("conversation wiring", () => {
  it("routes the audible local voice through the media sink, not straight to the destination", () => {
    expect(conversation).toContain("spkGain.connect(mediaOutputNode(ctx))");
    expect(conversation).not.toContain("spkGain.connect(ctx.destination)");
    // Primed during the start tap, while user activation is fresh.
    expect(conversation).toContain("mediaOutputNode(playCtx)");
  });

  it("applies no app-side volume override on the local path (speaker toggle is 0 / unity only)", () => {
    expect(conversation).not.toMatch(/\.volume\s*=/);
    expect(conversation).toContain("spkGain.gain.value = speakerMutedRef.current ? 0 : 1");
  });

  it("surfaces the can't-hear-you hint with a settings shortcut, and the hold-to-talk chip", () => {
    expect(conversation).toContain("I can’t hear you — your microphone may be muted or set to the wrong one.");
    expect(conversation).toContain("onClick={() => setShowSettings(true)}>Check microphone</Button>");
    expect(conversation.split("Hold to talk is ON — hold the button while you speak").length - 1).toBe(2);
  });

  it("keeps the mic level meter visible in the open panel during voice mode (not gated on captions)", () => {
    expect(conversation).not.toContain('phase === "live" && (!faceFirst || captions)');
    expect(conversation).toContain('aria-label="Microphone level"');
  });
});
