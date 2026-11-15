// @vitest-environment jsdom
// Blob/file media-element playout engine (Publish #54): the
// heard voice must terminate in a plain media element playing
// whole WebM FILES — Gemini PCM is Opus-encoded (WebCodecs) and
// WebM-muxed exactly as in the MSE engine, but the muxed bytes
// accumulate into segments that seal into Blobs behind object
// URLs, and the element plays files back to back. This replaces
// the MediaSource engine as the default after its stall ladder
// went 0-for-7 in the Publish #53 phone retest. These tests run
// the engine against fakes for the platform pieces (encoder /
// object URLs) and pin: acceptance only once ready, first-segment
// fast seal, segment chaining with URL revocation, the trail
// gate, level on the ELEMENT, idle sealing of utterance tails,
// stall episodes as playback-waiting events with a blob-shaped
// recovery ladder, honest failure with the stranded-PCM drain,
// and flush replacing the encoder.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BlobElementPlayout,
  blobElementPlayoutMaybeSupported,
  BLOB_ELEMENT_PIPELINE_SEC,
  type BlobElementPlayoutDeps,
} from "@/lib/blobElementPlayout";
import type { EncodedChunkLike } from "@/lib/mediaElementPlayout";
import { opusHead, webmOpusCluster, webmOpusInitSegment } from "@/lib/webmOpusMux";

interface FakeEncoder {
  state: string;
  encoded: Array<{ timestamp: number; numberOfFrames: number; sampleRate: number; format: string }>;
  closed: boolean;
  encode: (data: unknown) => void;
  flush: () => Promise<void>;
  close: () => void;
  /** Fire a late output as if from pending pre-flush work. */
  lateOutput: (timestamp: number) => void;
  /** Fire the encoder's error callback. */
  fail: (err: unknown) => void;
}

const FRAME = [0xaa, 0xbb, 0xcc];

const makeDeps = (overrides: Partial<BlobElementPlayoutDeps> = {}) => {
  const encoders: FakeEncoder[] = [];
  const element = document.createElement("audio");
  const blobs = new Map<string, Blob>();
  const createdUrls: string[] = [];
  const revokedUrls: string[] = [];
  let playhead = 0;
  let readyState = 4;
  let pausedFlag = true;
  let srcValue = "";
  let srcSets = 0;
  Object.defineProperty(element, "currentTime", {
    get: () => playhead,
    set: (v: number) => { playhead = v; },
    configurable: true,
  });
  Object.defineProperty(element, "readyState", { get: () => readyState, configurable: true });
  Object.defineProperty(element, "paused", { get: () => pausedFlag, configurable: true });
  // A real element resets its playhead when a new resource is
  // selected; the fake models that, because the engine's heard
  // bookkeeping depends on it at segment boundaries.
  Object.defineProperty(element, "src", {
    get: () => srcValue,
    set: (v: string) => { srcValue = v; srcSets += 1; playhead = 0; },
    configurable: true,
  });
  element.play = vi.fn(async () => { pausedFlag = false; });
  element.pause = vi.fn(() => { pausedFlag = true; });
  const deps: BlobElementPlayoutDeps = {
    createElement: () => element,
    createObjectUrl: (blob) => {
      const url = `blob:fake-${createdUrls.length}`;
      blobs.set(url, blob);
      createdUrls.push(url);
      return url;
    },
    revokeObjectUrl: (url) => { revokedUrls.push(url); },
    hasAudioEncoder: () => true,
    encoderSupported: async () => true,
    createAudioData: (init) => init,
    createEncoder: (output, error) => {
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
            copyTo: (dest: ArrayBuffer) => { new Uint8Array(dest).set(FRAME); },
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
        fail: (err: unknown) => error(err),
      };
      encoders.push(encoder);
      return encoder;
    },
    ...overrides,
  };
  return {
    deps,
    element,
    encoders,
    blobs,
    createdUrls,
    revokedUrls,
    setPlayhead: (v: number) => { playhead = v; },
    getPlayhead: () => playhead,
    setReadyState: (v: number) => { readyState = v; },
    srcSets: () => srcSets,
  };
};

const settle = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
const pcm = (seconds: number) => new Int16Array(Math.round(seconds * 24000)).fill(1000);

/** Start an engine and land its first segment (0.4 s of audio —
 *  past the 0.3 s first-segment seal) in the element. */
const startWithFirstSegment = async (h: ReturnType<typeof makeDeps>, onFatal?: (reason: string) => void) => {
  const engine = new BlobElementPlayout(h.deps, onFatal);
  await engine.start();
  await settle();
  engine.enqueuePcm16(pcm(0.2), 0.25);
  engine.enqueuePcm16(pcm(0.2), 0.25);
  await settle();
  expect(h.createdUrls.length).toBe(1);
  expect(h.element.src).toBe(h.createdUrls[0]);
  return engine;
};

describe("blobElementPlayoutMaybeSupported", () => {
  it("requires only the WebCodecs AudioEncoder API — no MediaSource", () => {
    const { deps } = makeDeps();
    expect(blobElementPlayoutMaybeSupported(deps)).toBe(true);
    expect(blobElementPlayoutMaybeSupported({ ...deps, hasAudioEncoder: () => false })).toBe(false);
  });
});

describe("BlobElementPlayout", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("is the blob engine, with the blob pipeline constant and the blob-element element marker", async () => {
    const { deps, element } = makeDeps();
    const engine = new BlobElementPlayout(deps);
    expect(engine.kind).toBe("blob");
    expect(engine.pipelineSec).toBe(BLOB_ELEMENT_PIPELINE_SEC);
    expect(element.getAttribute("data-heard-engine")).toBe("blob-element");
    await engine.start();
    engine.dispose();
  });

  it("refuses chunks before it is ready, so the caller keeps its fallback", async () => {
    const { deps } = makeDeps();
    const engine = new BlobElementPlayout(deps);
    expect(engine.enqueuePcm16(pcm(0.2), 0.1)).toBe(false);
    await engine.start();
    expect(engine.ready).toBe(true);
    expect(engine.enqueuePcm16(pcm(0.2), 0.1)).toBe(true);
    engine.dispose();
  });

  it("seals the first segment fast and plays it as one WebM file (init segment + rebased clusters)", async () => {
    const h = makeDeps();
    const engine = await startWithFirstSegment(h);
    expect(h.element.play).toHaveBeenCalled();
    const blob = h.blobs.get(h.createdUrls[0])!;
    expect(blob.type).toBe("audio/webm");
    // The file is byte-for-byte the muxed stream the MSE engine
    // would have appended: init segment, then one cluster per
    // encoded chunk with timecodes rebased to the segment's zero.
    const frame = new Uint8Array(FRAME);
    const expected =
      webmOpusInitSegment(opusHead(24000, 1, 0)).length +
      webmOpusCluster(0, frame).length +
      webmOpusCluster(200, frame).length;
    expect(blob.size).toBe(expected);
    // Heard delay bookkeeping: 0.4 s fed, nothing heard yet.
    expect(engine.trailSec()).toBeCloseTo(0.4, 5);
    expect(engine.encoderRate).toBe(24000);
    engine.dispose();
  });

  it("chains segments back to back: 'ended' revokes the finished file's URL and loads the next", async () => {
    const h = makeDeps();
    const engine = await startWithFirstSegment(h);
    // Feed the next segment (1.6 s — past the 1.5 s steady-state
    // target) behind a generous trail target so the gate never
    // meters it; it seals and QUEUES while segment 1 plays.
    for (let i = 0; i < 4; i++) engine.enqueuePcm16(pcm(0.4), 4);
    await settle();
    expect(h.createdUrls.length).toBe(2);
    expect(h.element.src).toBe(h.createdUrls[0]); // still the first file
    // Segment 1 plays out and ends.
    h.setPlayhead(0.4);
    h.element.dispatchEvent(new Event("ended"));
    expect(h.revokedUrls).toEqual([h.createdUrls[0]]);
    expect(h.element.src).toBe(h.createdUrls[1]);
    // The heard position crossed the seam: 0.4 played + the new
    // file at 0 — the trail is the remaining fed backlog.
    expect(engine.trailSec()).toBeCloseTo(2.0 - 0.4, 5);
    engine.dispose();
  });

  it("idle-seals an utterance tail instead of waiting out the segment target", async () => {
    const h = makeDeps();
    const engine = new BlobElementPlayout(h.deps);
    await engine.start();
    await settle();
    // 0.25 s: below the first-segment target (0.3) but above the
    // idle-seal floor (0.2). Nothing plays until arrivals stop.
    engine.enqueuePcm16(pcm(0.25), 0.25);
    await settle();
    expect(h.createdUrls.length).toBe(0);
    vi.advanceTimersByTime(200); // ~160 ms without a new cluster
    await settle();
    expect(h.createdUrls.length).toBe(1);
    expect(h.element.src).toBe(h.createdUrls[0]);
    expect(h.element.play).toHaveBeenCalled();
    engine.dispose();
  });

  it("holds chunks while the trail exceeds the target, then releases as the playhead advances", async () => {
    const h = makeDeps();
    const engine = new BlobElementPlayout(h.deps);
    await engine.start();
    await settle();
    engine.enqueuePcm16(pcm(0.2), 0.1); // first chunk always releases
    await settle();
    expect(h.encoders[0].encoded.length).toBe(1);
    engine.enqueuePcm16(pcm(0.2), 0.1); // trail 0.2 > target 0.1 → held
    await settle();
    vi.advanceTimersByTime(120);
    await settle();
    expect(h.encoders[0].encoded.length).toBe(1);
    // The first chunk idle-seals and starts playing; as the
    // playhead advances the trail falls and the held chunk feeds.
    vi.advanceTimersByTime(200);
    await settle();
    expect(h.createdUrls.length).toBe(1);
    h.setPlayhead(0.15);
    vi.advanceTimersByTime(80);
    await settle();
    expect(h.encoders[0].encoded.length).toBe(2);
    expect(engine.trailSec()).toBeCloseTo(0.25, 5); // fed 0.4 − heard 0.15
    engine.dispose();
  });

  it("applies the session level to the ELEMENT's muted/volume properties", async () => {
    const { deps, element } = makeDeps();
    const engine = new BlobElementPlayout(deps);
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

  it("reports its terminal state for the playout diag, stall counters included", async () => {
    const h = makeDeps();
    const engine = await startWithFirstSegment(h);
    expect(engine.diagState()).toEqual({ paused: false, readyState: 4, muted: false, volume: 1, stalls: 0, recoveries: 0 });
    engine.setPaused(true);
    expect(engine.diagState().paused).toBe(true);
    engine.dispose();
  });

  it("fails honestly when the platform cannot support it, and stays failed", async () => {
    const onFatal = vi.fn();
    const { deps } = makeDeps({ hasAudioEncoder: () => false });
    const engine = new BlobElementPlayout(deps, onFatal);
    expect(await engine.start()).toBe(false);
    expect(engine.failed).toBe(true);
    expect(engine.ready).toBe(false);
    expect(onFatal).toHaveBeenCalledWith("unsupported");
    expect(engine.failureReason).toBe("unsupported");
    expect(engine.enqueuePcm16(pcm(0.2), 0.1)).toBe(false);
    engine.dispose();
  });

  it("fails when no encoder ladder rung is supported", async () => {
    const onFatal = vi.fn();
    const { deps } = makeDeps({ encoderSupported: async () => false });
    const engine = new BlobElementPlayout(deps, onFatal);
    expect(await engine.start()).toBe(false);
    expect(onFatal).toHaveBeenCalledWith("encoder-unsupported");
    expect(engine.failureReason).toBe("encoder-unsupported");
    expect(engine.encoderRate).toBe(null);
    engine.dispose();
  });

  it("walks the encoder ladder to 48 kHz when 24 kHz is refused, upsampling the PCM ×2", async () => {
    const audioDataInits: Array<{ sampleRate: number; numberOfFrames: number; timestamp: number }> = [];
    const h = makeDeps({
      encoderSupported: async (config) => config.sampleRate === 48000,
      createAudioData: (init) => { audioDataInits.push(init); return init; },
    });
    const engine = new BlobElementPlayout(h.deps);
    expect(await engine.start()).toBe(true);
    expect(engine.encoderRate).toBe(48000);
    const ramp = new Int16Array(240);
    for (let i = 0; i < ramp.length; i++) ramp[i] = i * 10;
    expect(engine.enqueuePcm16(ramp, 0.1)).toBe(true);
    await settle();
    expect(audioDataInits.length).toBe(1);
    expect(audioDataInits[0].sampleRate).toBe(48000);
    expect(audioDataInits[0].numberOfFrames).toBe(480);
    expect(audioDataInits[0].timestamp).toBe(0);
    engine.dispose();
  });

  it("flush revokes queued files, replaces the encoder, drops its late outputs, and re-arms the fast first seal", async () => {
    const h = makeDeps();
    const engine = await startWithFirstSegment(h);
    // Queue a second segment behind the playing one.
    for (let i = 0; i < 4; i++) engine.enqueuePcm16(pcm(0.4), 4);
    await settle();
    expect(h.createdUrls.length).toBe(2);
    engine.flush();
    expect(h.encoders[0].closed).toBe(true);
    expect(h.encoders.length).toBe(2); // replaced, not flushed in place
    expect(h.revokedUrls).toContain(h.createdUrls[0]); // playing file revoked
    expect(h.revokedUrls).toContain(h.createdUrls[1]); // queued file revoked
    // Late output from the dead encoder is discarded by the
    // session guard — it must not seal into a file.
    h.encoders[0].lateOutput(0);
    await settle();
    vi.advanceTimersByTime(300);
    await settle();
    expect(h.createdUrls.length).toBe(2);
    // The reply after the barge-in seals at the FIRST-segment
    // target again, not the steady-state one.
    engine.enqueuePcm16(pcm(0.4), 0.25);
    await settle();
    expect(h.createdUrls.length).toBe(3);
    expect(h.element.src).toBe(h.createdUrls[2]);
    engine.dispose();
  });

  it("dispose revokes every live object URL", async () => {
    const h = makeDeps();
    const engine = await startWithFirstSegment(h);
    for (let i = 0; i < 4; i++) engine.enqueuePcm16(pcm(0.4), 4);
    await settle();
    expect(h.createdUrls.length).toBe(2);
    engine.dispose();
    expect(h.revokedUrls).toContain(h.createdUrls[0]);
    expect(h.revokedUrls).toContain(h.createdUrls[1]);
    expect(h.encoders[0].closed).toBe(true);
  });
});

describe("BlobElementPlayout — stalls are playback-waiting events", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("a wedged file is reload-resumed at the frozen offset, and the episode counts recovered when the playhead moves again", async () => {
    const onFatal = vi.fn();
    const h = makeDeps();
    const engine = await startWithFirstSegment(h, onFatal);
    // The file plays a little, then its playhead wedges at 0.1 s
    // with 0.3 s of the file unplayed.
    h.setPlayhead(0.1);
    const srcSetsBefore = h.srcSets();
    vi.advanceTimersByTime(400); // episode opens ~320 ms in; first pass reloads
    await settle();
    expect(engine.diagState().stalls).toBe(1);
    expect(h.srcSets()).toBeGreaterThan(srcSetsBefore); // the same file was re-set
    expect(h.getPlayhead()).toBeCloseTo(0.1); // …and seeked back to the frozen offset
    expect(engine.failed).toBe(false);
    expect(onFatal).not.toHaveBeenCalled();
    expect(engine.diagState().recoveries).toBe(0); // the reload alone is not recovery
    // Playback resumes under its own power.
    h.setPlayhead(0.3);
    vi.advanceTimersByTime(120);
    await settle();
    expect(engine.diagState().recoveries).toBe(1);
    expect(engine.failed).toBe(false);
    engine.dispose();
  });

  it("an element 'waiting' signal with a frozen playhead opens an episode even at the file's tail", async () => {
    const onFatal = vi.fn();
    const h = makeDeps();
    const engine = await startWithFirstSegment(h, onFatal);
    h.setPlayhead(0.39); // remainder < 0.05 — only the waiting signal marks it unplayed
    h.element.dispatchEvent(new Event("waiting"));
    vi.advanceTimersByTime(400);
    await settle();
    expect(engine.diagState().stalls).toBe(1);
    expect(engine.failed).toBe(false);
    h.element.dispatchEvent(new Event("playing"));
    h.setPlayhead(0.4);
    h.element.dispatchEvent(new Event("ended"));
    vi.advanceTimersByTime(120);
    await settle();
    expect(engine.failed).toBe(false);
    expect(onFatal).not.toHaveBeenCalled();
    engine.dispose();
  });

  it("unrecoverable stall: after ~6 s of failed recovery the engine fails with the MSE engine's reason string", async () => {
    const onFatal = vi.fn();
    const h = makeDeps();
    const engine = await startWithFirstSegment(h, onFatal);
    h.setPlayhead(0.1); // wedged forever: reloads and skips cannot move it
    for (let i = 0; i < 20; i++) {
      vi.advanceTimersByTime(500);
      await settle();
      // Every engine-caused jump (skip) re-bases the file; the
      // playhead stays at the same frozen offset within it.
      h.setPlayhead(0.1);
    }
    expect(onFatal).toHaveBeenCalledTimes(1);
    expect(onFatal).toHaveBeenCalledWith("element-stalled");
    expect(engine.failed).toBe(true);
    expect(engine.failureReason).toBe("element-stalled");
    expect(engine.diagState().stalls).toBeGreaterThanOrEqual(1);
    expect(engine.enqueuePcm16(pcm(0.2), 0.1)).toBe(false);
    engine.dispose();
  });

  it("no false stalls: silence between utterances and a user pause never open an episode", async () => {
    const onFatal = vi.fn();
    const h = makeDeps();
    const engine = new BlobElementPlayout(h.deps, onFatal);
    await engine.start();
    await settle();
    // Nothing fed at all for seconds.
    vi.advanceTimersByTime(5000);
    await settle();
    expect(engine.diagState().stalls).toBe(0);
    // A segment accumulating behind the trail gate while the
    // element is dry is a normal seam, not a stall.
    engine.enqueuePcm16(pcm(0.2), 0.1);
    await settle();
    engine.enqueuePcm16(pcm(0.6), 0.1); // held by the gate; arrivals continue
    await settle();
    vi.advanceTimersByTime(300);
    await settle();
    expect(engine.diagState().stalls).toBe(0);
    // The first chunk idle-seals and starts playing; the
    // playhead moves in step with the ticks (a real element's
    // does), then the USER pauses: frozen on purpose.
    expect(h.createdUrls.length).toBe(1);
    h.setPlayhead(0.05);
    vi.advanceTimersByTime(120);
    await settle();
    h.setPlayhead(0.12);
    vi.advanceTimersByTime(120);
    await settle();
    expect(engine.diagState().stalls).toBe(0);
    engine.setPaused(true);
    vi.advanceTimersByTime(3000);
    await settle();
    expect(engine.diagState().stalls).toBe(0);
    expect(engine.failed).toBe(false);
    expect(onFatal).not.toHaveBeenCalled();
    engine.dispose();
  });

  it("an erroring file is skipped to the next; two consecutive erroring files fail the engine", async () => {
    const onFatal = vi.fn();
    const h = makeDeps();
    const engine = await startWithFirstSegment(h, onFatal);
    for (let i = 0; i < 4; i++) engine.enqueuePcm16(pcm(0.4), 4);
    await settle();
    expect(h.createdUrls.length).toBe(2);
    // The playing file errors: it is skipped, its URL revoked,
    // the next file loads, and the skip counts as an episode.
    h.element.dispatchEvent(new Event("error"));
    expect(h.revokedUrls).toContain(h.createdUrls[0]);
    expect(h.element.src).toBe(h.createdUrls[1]);
    expect(engine.diagState().stalls).toBe(1);
    expect(engine.failed).toBe(false);
    // The replacement file errors too, with no playback progress
    // between them: an engine failure, not another skip.
    h.element.dispatchEvent(new Event("error"));
    expect(onFatal).toHaveBeenCalledWith("element-error");
    expect(engine.failed).toBe(true);
    expect(engine.failureReason).toBe("element-error");
    engine.dispose();
  });

  it("a fatal failure hands back the stranded PCM in order: the unsealed segment's chunks, then the held queue", async () => {
    const onFatal = vi.fn();
    const h = makeDeps();
    const engine = new BlobElementPlayout(h.deps, onFatal);
    await engine.start();
    await settle();
    // Chunk A encodes into the open segment (unsealed: below the
    // first-segment target, arrivals not yet idle).
    engine.enqueuePcm16(pcm(0.2), 0.5);
    await settle();
    expect(h.encoders[0].encoded.length).toBe(1);
    // Chunk B is held behind the trail gate (target 0.1 < the
    // 0.2 s trail chunk A left).
    engine.enqueuePcm16(pcm(0.6), 0.1);
    await settle();
    expect(h.encoders[0].encoded.length).toBe(1);
    // The encoder dies: both chunks were accepted but never
    // played, and both come back, in acceptance order.
    h.encoders[0].fail(new Error("boom"));
    expect(onFatal).toHaveBeenCalledWith("encoder-error");
    const drained = engine.drainPendingPcm();
    expect(drained.length).toBe(2);
    expect(drained[0].length).toBe(4800); // chunk A: 0.2 s at 24 kHz
    expect(drained[1].length).toBe(14400); // chunk B: 0.6 s
    expect(engine.drainPendingPcm()).toEqual([]); // drains once
    engine.dispose();
  });
});

describe("BlobElementPlayout — rate witness (Publish #54)", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("a file the element plays at its true rate notes ≈1.00 (fed vs raw playhead)", async () => {
    const h = makeDeps();
    const engine = await startWithFirstSegment(h); // 0.4 s file loaded
    expect(engine.rateWitness()).toEqual({ count: 0, min: null, max: null, last: null });
    // The element's own timeline agrees with the fed duration:
    // it ends the file at 0.4.
    h.setPlayhead(0.4);
    h.element.dispatchEvent(new Event("ended"));
    const w = engine.rateWitness();
    expect(w.count).toBe(1);
    expect(w.min).toBeCloseTo(1, 5);
    expect(w.max).toBeCloseTo(1, 5);
    expect(w.last).toBeCloseTo(1, 5);
    engine.dispose();
  });

  it("a platform that burns the file in half its fed duration reads the exact factor 2.00", async () => {
    const h = makeDeps();
    const engine = await startWithFirstSegment(h);
    // Queue the 1.6 s second file behind the first.
    for (let i = 0; i < 4; i++) engine.enqueuePcm16(pcm(0.4), 4);
    await settle();
    expect(h.createdUrls.length).toBe(2);
    // File 1 (0.4 s fed) ends honestly at 0.4.
    h.setPlayhead(0.4);
    h.element.dispatchEvent(new Event("ended"));
    expect(engine.rateWitness().last).toBeCloseTo(1, 5);
    // File 2 (1.6 s fed) ends with the element's raw playhead at
    // 0.8 — the platform derived half the duration from the
    // wrong rate. The witness names the factor.
    h.setPlayhead(0.8);
    h.element.dispatchEvent(new Event("ended"));
    const w = engine.rateWitness();
    expect(w.count).toBe(2);
    expect(w.min).toBeCloseTo(1, 5);
    expect(w.max).toBeCloseTo(2, 5);
    expect(w.last).toBeCloseTo(2, 5);
    engine.dispose();
  });

  it("a skipped file never enters the aggregate (its speech was lost, not mis-rated)", async () => {
    const h = makeDeps();
    const engine = await startWithFirstSegment(h);
    // The element errors on the loaded file: the engine skips it
    // (skipCurrentSegment) without an 'ended' — no witness note.
    h.element.dispatchEvent(new Event("error"));
    expect(engine.rateWitness().count).toBe(0);
    engine.dispose();
  });
});
