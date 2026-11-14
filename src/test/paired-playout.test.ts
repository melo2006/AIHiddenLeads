// Paired playout tap (hardware-volume root fix, 2026-11-14): the
// Simli/LiveKit WebRTC stream must be re-originated through WebAudio
// into a plain media element so Android's hardware volume keys —
// which govern the MEDIA stream — control the persona's voice while
// mic capture is live. Direct WebRTC element playout is classified
// with the voice-communication channel in that state, which is why
// the keys appeared dead on the phone speaker (reports 2026-11-09,
// 2026-11-13, 2026-11-14). These tests pin the routing decisions:
// engage only when the tap is confirmed playing, never silence the
// working direct path on a failure, level lands on the gain while
// tapped and on the element while direct.
import { describe, expect, it, vi } from "vitest";
import { PairedPlayout, pairedGainValue, pairedSoundAudible } from "@/lib/pairedPlayout";

class FakeGain {
  gain = { value: 1 };
  connect = vi.fn();
}
class FakeSourceNode {
  connect = vi.fn();
  disconnect = vi.fn();
}
class FakeCtx {
  state: AudioContextState = "running";
  gains: FakeGain[] = [];
  sources: FakeSourceNode[] = [];
  destStream = { id: "tap-stream" } as unknown as MediaStream;
  resume = vi.fn(async () => {});
  close = vi.fn(async () => { this.state = "closed"; });
  createGain = () => { const g = new FakeGain(); this.gains.push(g); return g as unknown as GainNode; };
  createMediaStreamSource = (_stream: MediaStream) => { const s = new FakeSourceNode(); this.sources.push(s); return s as unknown as MediaStreamAudioSourceNode; };
  createMediaStreamDestination = () => ({ stream: this.destStream }) as unknown as MediaStreamAudioDestinationNode;
}

const fakeStream = (tracks = 1) =>
  ({ getAudioTracks: () => Array.from({ length: tracks }, () => ({})) }) as unknown as MediaStream;

const fakeElement = (stream?: MediaStream) => {
  const el = document.createElement("audio");
  let paused = true;
  Object.defineProperty(el, "paused", { configurable: true, get: () => paused });
  el.play = vi.fn(async () => { paused = false; });
  el.pause = vi.fn(() => { paused = true; });
  if (stream !== undefined) el.srcObject = stream;
  return el;
};

const level = { muted: false, volume: 0.8 };

describe("pairedGainValue / pairedSoundAudible", () => {
  it("mute wins and the trim clamps to unity", () => {
    expect(pairedGainValue({ muted: true, volume: 0.8 })).toBe(0);
    expect(pairedGainValue({ muted: false, volume: 0.8 })).toBeCloseTo(0.8);
    expect(pairedGainValue({ muted: false, volume: 1.6 })).toBe(1);
    expect(pairedGainValue({ muted: false, volume: -0.2 })).toBe(0);
  });

  it("armed means the level asks for sound AND the carrying element plays", () => {
    expect(pairedSoundAudible({ level, engaged: false, sourcePaused: false, playoutPaused: true })).toBe(true);
    expect(pairedSoundAudible({ level, engaged: false, sourcePaused: true, playoutPaused: false })).toBe(false);
    expect(pairedSoundAudible({ level, engaged: true, sourcePaused: false, playoutPaused: false })).toBe(true);
    // In tap mode a paused SOURCE starves the tap even if the playout plays.
    expect(pairedSoundAudible({ level, engaged: true, sourcePaused: true, playoutPaused: false })).toBe(false);
    expect(pairedSoundAudible({ level, engaged: true, sourcePaused: false, playoutPaused: true })).toBe(false);
    // A user-chosen mute is never "armed".
    expect(pairedSoundAudible({ level: { muted: true, volume: 1 }, engaged: true, sourcePaused: false, playoutPaused: false })).toBe(false);
  });
});

describe("PairedPlayout.engage", () => {
  it("refuses without a stream or audio tracks and leaves the element untouched", async () => {
    const tap = new PairedPlayout(() => new FakeCtx() as unknown as AudioContext);
    const bare = fakeElement();
    bare.volume = 0.8;
    await expect(tap.engage(bare, fakeElement(), level)).resolves.toBe(false);
    const silent = fakeElement(fakeStream(0));
    await expect(tap.engage(silent, fakeElement(), level)).resolves.toBe(false);
    expect(tap.engaged).toBe(false);
    expect(bare.volume).toBeCloseTo(0.8);
  });

  it("refuses while the context cannot run (a suspended tap would be silent)", async () => {
    const ctx = new FakeCtx();
    ctx.state = "suspended"; // resume() deliberately does not flip it
    const tap = new PairedPlayout(() => ctx as unknown as AudioContext);
    const source = fakeElement(fakeStream());
    source.volume = 0.8;
    await expect(tap.engage(source, fakeElement(), level)).resolves.toBe(false);
    expect(tap.engaged).toBe(false);
    expect(source.volume).toBeCloseTo(0.8); // direct path untouched
  });

  it("engages: playout carries the tap stream, gain carries the level, source is pinned silent-but-rendering", async () => {
    const ctx = new FakeCtx();
    const tap = new PairedPlayout(() => ctx as unknown as AudioContext);
    const source = fakeElement(fakeStream());
    const playout = fakeElement();
    await expect(tap.engage(source, playout, level)).resolves.toBe(true);
    expect(tap.engaged).toBe(true);
    expect(playout.srcObject).toBe(ctx.destStream);
    expect(ctx.gains[0].gain.value).toBeCloseTo(0.8);
    expect(source.volume).toBe(0);
    expect(source.muted).toBe(false); // volume 0, NOT muted: the stream must keep rendering for the tap
    expect(playout.paused).toBe(false);
    expect(source.paused).toBe(false);
  });

  it("keeps the direct path audible when the playout element refuses to play", async () => {
    const ctx = new FakeCtx();
    const tap = new PairedPlayout(() => ctx as unknown as AudioContext);
    const source = fakeElement(fakeStream());
    source.volume = 0.8;
    const playout = fakeElement();
    playout.play = vi.fn(async () => { throw new Error("NotAllowedError"); });
    await expect(tap.engage(source, playout, level)).resolves.toBe(false);
    expect(tap.engaged).toBe(false);
    expect(source.volume).toBeCloseTo(0.8); // never silenced
  });

  it("rebuilds the source node when the stream identity changes (client retry / new room)", async () => {
    const ctx = new FakeCtx();
    const tap = new PairedPlayout(() => ctx as unknown as AudioContext);
    const source = fakeElement(fakeStream());
    const playout = fakeElement();
    await tap.engage(source, playout, level);
    source.srcObject = fakeStream();
    await expect(tap.engage(source, playout, level)).resolves.toBe(true);
    expect(ctx.sources).toHaveLength(2);
    expect(ctx.sources[0].disconnect).toHaveBeenCalled();
  });
});

describe("PairedPlayout.lastEngageError — every refusal names its gate (volume-stream fix)", () => {
  it("records no-audio-track when the element carries no stream", async () => {
    const tap = new PairedPlayout(() => new FakeCtx() as unknown as AudioContext);
    await expect(tap.engage(fakeElement(), fakeElement(), level)).resolves.toBe(false);
    expect(tap.lastEngageError).toBe("no-audio-track");
  });

  it("records ctx-suspended when the context cannot run", async () => {
    const ctx = new FakeCtx();
    ctx.state = "suspended";
    const tap = new PairedPlayout(() => ctx as unknown as AudioContext);
    await expect(tap.engage(fakeElement(fakeStream()), fakeElement(), level)).resolves.toBe(false);
    expect(tap.lastEngageError).toBe("ctx-suspended");
  });

  it("records playout-blocked when the playout element will not play", async () => {
    const ctx = new FakeCtx();
    const tap = new PairedPlayout(() => ctx as unknown as AudioContext);
    const playout = fakeElement();
    // play() resolves but the element stays paused — the browser refused.
    playout.play = vi.fn(async () => {});
    await expect(tap.engage(fakeElement(fakeStream()), playout, level)).resolves.toBe(false);
    expect(tap.lastEngageError).toBe("playout-blocked");
  });

  it("records source-not-rendering when the source element stays paused", async () => {
    const ctx = new FakeCtx();
    const tap = new PairedPlayout(() => ctx as unknown as AudioContext);
    const source = fakeElement(fakeStream());
    source.play = vi.fn(async () => {}); // never unpauses
    await expect(tap.engage(source, fakeElement(), level)).resolves.toBe(false);
    expect(tap.lastEngageError).toBe("source-not-rendering");
  });

  it("clears the error on a successful engage and exposes gain + context state", async () => {
    const ctx = new FakeCtx();
    const tap = new PairedPlayout(() => ctx as unknown as AudioContext);
    const source = fakeElement(fakeStream());
    await expect(tap.engage(source, fakeElement(), level)).resolves.toBe(true);
    expect(tap.lastEngageError).toBeNull();
    expect(tap.contextState).toBe("running");
    expect(tap.gainValue).toBeCloseTo(0.8);
  });
});

describe("PairedPlayout.applyLevel / release", () => {
  it("routes the level to the gain while engaged and to the element while direct", async () => {
    const ctx = new FakeCtx();
    const tap = new PairedPlayout(() => ctx as unknown as AudioContext);
    const source = fakeElement(fakeStream());
    tap.applyLevel(source, { muted: false, volume: 0.5 });
    expect(source.volume).toBeCloseTo(0.5);
    expect(source.muted).toBe(false);
    tap.applyLevel(source, { muted: true, volume: 0.5 });
    expect(source.volume).toBe(0);
    expect(source.muted).toBe(true);

    const playout = fakeElement();
    await tap.engage(source, playout, { muted: false, volume: 0.5 });
    tap.applyLevel(source, { muted: false, volume: 0.25 });
    expect(ctx.gains[0].gain.value).toBeCloseTo(0.25);
    expect(source.volume).toBe(0); // stays pinned while tapped
    tap.applyLevel(source, { muted: true, volume: 0.25 });
    expect(ctx.gains[0].gain.value).toBe(0);
  });

  it("release pauses the playout, clears it and closes the context", async () => {
    const ctx = new FakeCtx();
    const tap = new PairedPlayout(() => ctx as unknown as AudioContext);
    const source = fakeElement(fakeStream());
    const playout = fakeElement();
    await tap.engage(source, playout, level);
    tap.release(playout);
    expect(tap.engaged).toBe(false);
    expect(playout.paused).toBe(true);
    expect(playout.srcObject).toBeNull();
    expect(ctx.sources[0].disconnect).toHaveBeenCalled();
    expect(ctx.close).toHaveBeenCalled();
  });
});
