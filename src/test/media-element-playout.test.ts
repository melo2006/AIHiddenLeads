// @vitest-environment jsdom
// Media-element playout engine (volume-speaker fix, 2026-11-14):
// the heard voice must terminate in a plain media element playing
// a media RESOURCE — Gemini PCM is Opus-encoded (WebCodecs),
// WebM-muxed and MSE-appended, with NO AudioContext anywhere in
// the chain. These tests run the engine against fakes for the
// platform pieces (encoder / MediaSource / SourceBuffer) and pin:
// acceptance only once ready, the init segment preceding clusters,
// the dense media timeline, the trail gate that carries the lip
// offset, level landing on the ELEMENT's muted/volume properties,
// flush replacing the encoder and dropping its late outputs, and
// honest failure (the caller keeps its fallback graph) when the
// platform cannot support the engine.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MediaElementPlayout,
  mediaElementPlayoutMaybeSupported,
  type EncodedChunkLike,
  type MediaElementPlayoutDeps,
  type MediaSourceLike,
  type SourceBufferLike,
} from "@/lib/mediaElementPlayout";

class FakeSourceBuffer implements SourceBufferLike {
  updating = false;
  appended: Uint8Array[] = [];
  removed: Array<[number, number]> = [];
  buffered = { length: 0, start: () => 0, end: () => 0 };
  private listeners = new Map<string, Set<() => void>>();
  addEventListener(type: string, fn: () => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
  }
  removeEventListener(type: string, fn: () => void) {
    this.listeners.get(type)?.delete(fn);
  }
  appendBuffer(data: Uint8Array) {
    this.appended.push(new Uint8Array(data));
    this.updating = true;
    queueMicrotask(() => {
      this.updating = false;
      for (const fn of [...(this.listeners.get("updateend") ?? [])]) fn();
    });
  }
  remove(start: number, end: number) {
    this.removed.push([start, end]);
  }
}

class FakeMediaSource implements MediaSourceLike {
  readyState = "open";
  buffers: FakeSourceBuffer[] = [];
  addSourceBuffer() {
    const buffer = new FakeSourceBuffer();
    this.buffers.push(buffer);
    return buffer;
  }
  addEventListener() {}
  removeEventListener() {}
  endOfStream() {}
}

interface FakeEncoder {
  state: string;
  encoded: Array<{ timestamp: number; numberOfFrames: number; sampleRate: number; format: string }>;
  closed: boolean;
  encode: (data: unknown) => void;
  flush: () => Promise<void>;
  close: () => void;
  /** Fire a late output as if from pending pre-flush work. */
  lateOutput: (timestamp: number) => void;
}

const makeDeps = (overrides: Partial<MediaElementPlayoutDeps> = {}) => {
  const mediaSource = new FakeMediaSource();
  const encoders: FakeEncoder[] = [];
  const element = document.createElement("audio");
  let playhead = 0;
  let readyState = 4;
  let pausedFlag = true;
  Object.defineProperty(element, "currentTime", {
    get: () => playhead,
    set: (v: number) => { playhead = v; },
    configurable: true,
  });
  Object.defineProperty(element, "readyState", { get: () => readyState, configurable: true });
  Object.defineProperty(element, "paused", { get: () => pausedFlag, configurable: true });
  element.play = vi.fn(async () => { pausedFlag = false; });
  element.pause = vi.fn(() => { pausedFlag = true; });
  const deps: MediaElementPlayoutDeps = {
    createElement: () => element,
    createMediaSource: () => mediaSource,
    createObjectUrl: () => "blob:fake",
    revokeObjectUrl: () => {},
    isTypeSupported: () => true,
    encoderSupported: async () => true,
    createAudioData: (init) => init,
    createEncoder: (output) => {
      const encoder: FakeEncoder = {
        state: "configured",
        encoded: [],
        closed: false,
        encode: (data) => {
          const init = data as { timestamp: number; numberOfFrames: number; sampleRate: number; format: string };
          encoder.encoded.push(init);
          const chunk: EncodedChunkLike = {
            timestamp: init.timestamp,
            duration: Math.round((init.numberOfFrames * 1_000_000) / init.sampleRate),
            byteLength: 3,
            copyTo: (dest: ArrayBuffer) => { new Uint8Array(dest).set([0xaa, 0xbb, 0xcc]); },
          };
          queueMicrotask(() => output(chunk));
        },
        flush: async () => {},
        close: () => { encoder.closed = true; },
        lateOutput: (timestamp: number) => {
          output({
            timestamp,
            duration: 20000,
            byteLength: 3,
            copyTo: (dest: ArrayBuffer) => { new Uint8Array(dest).set([0xdd, 0xdd, 0xdd]); },
          });
        },
      };
      encoders.push(encoder);
      return encoder;
    },
    ...overrides,
  };
  return {
    deps,
    element,
    mediaSource,
    encoders,
    setPlayhead: (v: number) => { playhead = v; },
    setReadyState: (v: number) => { readyState = v; },
  };
};

const settle = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
const pcm = (seconds: number) => new Int16Array(Math.round(seconds * 24000)).fill(1000);

describe("mediaElementPlayoutMaybeSupported", () => {
  it("requires MSE opus support and a MediaSource constructor", () => {
    const { deps } = makeDeps();
    expect(mediaElementPlayoutMaybeSupported(deps)).toBe(true);
    expect(mediaElementPlayoutMaybeSupported({ ...deps, isTypeSupported: () => false })).toBe(false);
    expect(mediaElementPlayoutMaybeSupported({ ...deps, createMediaSource: () => null })).toBe(false);
  });
});

describe("MediaElementPlayout", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("refuses chunks before it is ready, so the caller keeps its fallback", async () => {
    const { deps } = makeDeps();
    const engine = new MediaElementPlayout(deps);
    expect(engine.enqueuePcm16(pcm(0.2), 0.1)).toBe(false);
    await engine.start();
    expect(engine.ready).toBe(true);
    expect(engine.enqueuePcm16(pcm(0.2), 0.1)).toBe(true);
    engine.dispose();
  });

  it("appends the WebM init segment before any cluster, on a dense media timeline", async () => {
    const { deps, mediaSource, encoders, setPlayhead } = makeDeps();
    const engine = new MediaElementPlayout(deps);
    await engine.start();
    await settle();
    const buffer = mediaSource.buffers[0];
    expect(buffer.appended.length).toBe(1);
    expect([...buffer.appended[0].slice(0, 4)]).toEqual([0x1a, 0x45, 0xdf, 0xa3]); // EBML magic

    engine.enqueuePcm16(pcm(0.2), 0.1);
    await settle();
    expect(encoders[0].encoded.length).toBe(1);
    expect(encoders[0].encoded[0].format).toBe("s16");
    expect(encoders[0].encoded[0].sampleRate).toBe(24000);
    expect(encoders[0].encoded[0].timestamp).toBe(0);
    expect(buffer.appended.length).toBe(2);
    expect([...buffer.appended[1].slice(0, 4)]).toEqual([0x1f, 0x43, 0xb6, 0x75]); // Cluster

    // The second chunk waits out the trail gate, then encodes at
    // exactly the first chunk's end on the media timeline.
    engine.enqueuePcm16(pcm(0.2), 0.1);
    setPlayhead(0.15);
    vi.advanceTimersByTime(80);
    await settle();
    expect(encoders[0].encoded.length).toBe(2);
    expect(encoders[0].encoded[1].timestamp).toBe(200_000);
    engine.dispose();
  });

  it("holds chunks while the trail exceeds the target, then releases as the playhead advances", async () => {
    const { deps, encoders, setPlayhead } = makeDeps();
    const engine = new MediaElementPlayout(deps);
    await engine.start();
    await settle();
    engine.enqueuePcm16(pcm(0.2), 0.1); // first chunk always releases; trail now 0.2
    await settle();
    expect(encoders[0].encoded.length).toBe(1);
    engine.enqueuePcm16(pcm(0.2), 0.1); // trail 0.2 > target 0.1 → held
    await settle();
    vi.advanceTimersByTime(200);
    await settle();
    expect(encoders[0].encoded.length).toBe(1);
    setPlayhead(0.15); // trail falls to 0.05 → the held chunk releases
    vi.advanceTimersByTime(80);
    await settle();
    expect(encoders[0].encoded.length).toBe(2);
    expect(engine.trailSec()).toBeCloseTo(0.25, 5); // fed 0.4 − playhead 0.15
    engine.dispose();
  });

  it("applies the session level to the ELEMENT's muted/volume properties", async () => {
    const { deps, element } = makeDeps();
    const engine = new MediaElementPlayout(deps);
    await engine.start();
    engine.setLevel({ muted: false, volume: 0.3 });
    expect(element.muted).toBe(false);
    expect(element.volume).toBeCloseTo(0.3);
    engine.setLevel({ muted: true, volume: 0.3 });
    expect(element.muted).toBe(true);
    engine.setLevel({ muted: false, volume: 9 });
    expect(element.volume).toBe(1); // clamped
    engine.dispose();
  });

  it("reports its terminal state for the playout diag (paused + readyState off the element)", async () => {
    const { deps } = makeDeps();
    const engine = new MediaElementPlayout(deps);
    await engine.start();
    await settle();
    expect(engine.diagState()).toEqual({ paused: false, readyState: 4 });
    engine.setPaused(true);
    expect(engine.diagState().paused).toBe(true);
    engine.dispose();
  });

  it("flush removes buffered-ahead media, replaces the encoder, and drops the old encoder's late outputs", async () => {
    const { deps, mediaSource, encoders, setPlayhead } = makeDeps();
    const engine = new MediaElementPlayout(deps);
    await engine.start();
    await settle();
    engine.enqueuePcm16(pcm(0.5), 0.25);
    await settle();
    const buffer = mediaSource.buffers[0];
    buffer.buffered = { length: 1, start: () => 0, end: () => 0.5 };
    setPlayhead(0.1);
    const appendsBefore = buffer.appended.length;
    engine.flush();
    expect(encoders[0].closed).toBe(true);
    expect(encoders.length).toBe(2); // replaced, not flushed in place
    expect(buffer.removed.length).toBe(1);
    expect(buffer.removed[0][0]).toBeCloseTo(0.12); // everything past playhead + 0.02
    expect(buffer.removed[0][1]).toBe(0.5);
    encoders[0].lateOutput(0); // pre-flush audio surfacing late
    await settle();
    expect(buffer.appended.length).toBe(appendsBefore); // discarded by the session guard
    engine.dispose();
  });

  it("fails honestly when the platform cannot support it, and stays failed", async () => {
    const onFatal = vi.fn();
    const { deps } = makeDeps({ encoderSupported: async () => false });
    const engine = new MediaElementPlayout(deps, onFatal);
    expect(await engine.start()).toBe(false);
    expect(engine.failed).toBe(true);
    expect(engine.ready).toBe(false);
    expect(onFatal).toHaveBeenCalledWith("encoder-unsupported");
    expect(engine.enqueuePcm16(pcm(0.2), 0.1)).toBe(false);
    engine.dispose();
  });

  it("fails when MSE cannot take the opus type", async () => {
    const onFatal = vi.fn();
    const { deps } = makeDeps({ isTypeSupported: () => false });
    const engine = new MediaElementPlayout(deps, onFatal);
    expect(await engine.start()).toBe(false);
    expect(onFatal).toHaveBeenCalledWith("unsupported");
    engine.dispose();
  });
});
