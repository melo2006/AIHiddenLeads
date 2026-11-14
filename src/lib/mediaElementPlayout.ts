/**
 * Media-element playout — the heard voice terminates in a PLAIN
 * media element playing a media RESOURCE (volume-speaker fix,
 * 2026-11-14; Ron's fifth report of dead hardware volume keys on the
 * phone speaker, after Publish #48's local-first rebuild).
 *
 * What #48 left standing: in local mode the audible graph ended in a
 * WebAudio MediaStreamDestination — an AudioDestinationNode — whose
 * stream a detached <audio> element rendered. The session record
 * (config.playoutDiag) proved the element was playing
 * (sink=ready), yet the keys still did nothing on the speaker. The
 * one playout shape Ron has PROVEN the keys govern on that phone is
 * a plain media element playing a media file with no call-like
 * session around it (his Muse-app voice notes). This module
 * reproduces that shape for the live voice:
 *
 *   Gemini PCM (24 kHz) → WebCodecs Opus encode → WebM mux →
 *   MediaSource → <audio> element with a blob: URL.
 *
 * No AudioContext, no MediaStream, no WebRTC track is in the heard
 * chain at all — the element decodes a media resource through the
 * platform media pipeline, and the session's level controls drive
 * the ELEMENT's own muted/volume properties, exactly like a
 * voice-note player. The WebAudio graph (mediaSink.ts) remains as
 * the fallback: this engine is feature-detected, and any failure —
 * unsupported platform, encoder error, MSE error — hands the
 * session back to the graph path chunk-by-chunk (the caller routes
 * each chunk to exactly one path, and this engine only accepts a
 * chunk once it is ready, so a dead engine can never silence a
 * call).
 *
 * Latency / lip sync: the element is fed through a small hold queue
 * that keeps the element's buffered-ahead ("trail") near a target.
 * Heard delay ≈ trail + MEDIA_ELEMENT_PIPELINE_SEC (encode + MSE +
 * decode, a nominal constant). For paired (Simli) chunks the caller
 * sets the trail target to PAIRED_CAPTION_DELAY_SEC −
 * MEDIA_ELEMENT_PIPELINE_SEC, so the voice keeps its established
 * ~+0.4 s offset against the lips; the caller also shifts caption
 * windows by the measured delay (trail + pipeline), so captions
 * track the heard voice rather than the schedule clock. The diag
 * snapshot stamps the measured trail per session, so the residual
 * error is visible in the record instead of guessed.
 */
import { clampPlaybackVolume } from "@/lib/playbackVolume";
import { opusHead, webmOpusCluster, webmOpusInitSegment } from "@/lib/webmOpusMux";

/** Nominal encode + MSE + decode latency of this engine, seconds.
 *  Heard-delay bookkeeping (trail targets, caption shift) treats the
 *  pipeline as costing this much; the playout diag stamps the
 *  measured trail so the assumption is checkable per session. */
export const MEDIA_ELEMENT_PIPELINE_SEC = 0.15;

/** Gemini PCM input format: 24 kHz mono PCM16. */
export const MEDIA_ELEMENT_INPUT_RATE = 24000;

const MSE_TYPE = 'audio/webm; codecs="opus"';
const OPUS_ENCODER_CONFIG = {
  codec: "opus",
  sampleRate: MEDIA_ELEMENT_INPUT_RATE,
  numberOfChannels: 1,
  bitrate: 40_000,
} as const;

/* ------------------------------------------------------------------ */
/* Structural types for the platform pieces (WebCodecs is not in the  */
/* repo's TS DOM lib; everything is feature-detected at runtime).     */
/* ------------------------------------------------------------------ */

export interface EncodedChunkLike {
  timestamp: number; // microseconds
  duration?: number | null; // microseconds
  byteLength: number;
  copyTo: (destination: ArrayBuffer) => void;
}
export interface EncoderOutputMeta {
  decoderConfig?: { description?: ArrayBuffer | Uint8Array } | null;
}
export interface AudioEncoderLike {
  state: string;
  encode: (data: unknown) => void;
  flush: () => Promise<void>;
  close: () => void;
}
export interface SourceBufferLike {
  updating: boolean;
  buffered: { length: number; start: (i: number) => number; end: (i: number) => number };
  appendBuffer: (data: Uint8Array) => void;
  remove: (start: number, end: number) => void;
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
}
export interface MediaSourceLike {
  readyState: string;
  addSourceBuffer: (type: string) => SourceBufferLike;
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
  endOfStream: () => void;
}

export interface MediaElementPlayoutDeps {
  createElement: () => HTMLAudioElement;
  createMediaSource: () => MediaSourceLike | null;
  createObjectUrl: (source: MediaSourceLike) => string;
  revokeObjectUrl: (url: string) => void;
  isTypeSupported: (type: string) => boolean;
  createEncoder: (
    output: (chunk: EncodedChunkLike, meta?: EncoderOutputMeta) => void,
    error: (err: unknown) => void,
  ) => AudioEncoderLike | null;
  encoderSupported: () => Promise<boolean>;
  createAudioData: (init: {
    format: string;
    sampleRate: number;
    numberOfFrames: number;
    numberOfChannels: number;
    timestamp: number;
    data: ArrayBuffer;
  }) => unknown;
}

/** Production deps: the real platform globals, feature-detected. */
export const defaultMediaElementDeps: MediaElementPlayoutDeps = {
  createElement: () => document.createElement("audio"),
  createMediaSource: () => {
    const Ctor = (globalThis as { MediaSource?: new () => MediaSourceLike }).MediaSource;
    return Ctor ? new Ctor() : null;
  },
  createObjectUrl: (source) => URL.createObjectURL(source as unknown as MediaSource),
  revokeObjectUrl: (url) => URL.revokeObjectURL(url),
  isTypeSupported: (type) => {
    const Ctor = (globalThis as { MediaSource?: typeof MediaSource }).MediaSource;
    return typeof Ctor?.isTypeSupported === "function" ? Ctor.isTypeSupported(type) : false;
  },
  createEncoder: (output, error) => {
    const Ctor = (globalThis as {
      AudioEncoder?: new (init: {
        output: (chunk: EncodedChunkLike, meta?: EncoderOutputMeta) => void;
        error: (err: unknown) => void;
      }) => AudioEncoderLike & { configure: (config: unknown) => void };
    }).AudioEncoder;
    if (!Ctor) return null;
    const encoder = new Ctor({
      output: (chunk, meta) => output(chunk, meta),
      error: (err) => error(err),
    });
    encoder.configure({ ...OPUS_ENCODER_CONFIG });
    return encoder;
  },
  encoderSupported: async () => {
    const Ctor = (globalThis as {
      AudioEncoder?: { isConfigSupported?: (config: unknown) => Promise<{ supported?: boolean }> };
    }).AudioEncoder;
    if (typeof Ctor?.isConfigSupported !== "function") return false;
    try {
      const result = await Ctor.isConfigSupported({ ...OPUS_ENCODER_CONFIG });
      return result?.supported === true;
    } catch {
      return false;
    }
  },
  createAudioData: (init) => {
    const Ctor = (globalThis as { AudioData?: new (init: unknown) => unknown }).AudioData;
    if (!Ctor) throw new Error("AudioData unavailable");
    return new Ctor(init);
  },
};

/** Cheap synchronous half of the support probe (the async half —
 *  the encoder config check — runs inside start()). */
export function mediaElementPlayoutMaybeSupported(deps: MediaElementPlayoutDeps = defaultMediaElementDeps): boolean {
  try {
    return deps.isTypeSupported(MSE_TYPE) && deps.createMediaSource() !== null;
  } catch {
    return false;
  }
}

export interface HeardLevel {
  muted: boolean;
  volume: number;
}

interface HeldChunk {
  samples: Int16Array;
  trailTargetSec: number;
}

export class MediaElementPlayout {
  readonly element: HTMLAudioElement;
  /** True once the element is attached to a live MSE stream and
   *  play() has been accepted — the caller may route chunks here. */
  ready = false;
  /** Sticky failure: the caller must keep chunks on the fallback. */
  failed = false;

  private readonly deps: MediaElementPlayoutDeps;
  private readonly onFatal: (reason: string) => void;
  private mediaSource: MediaSourceLike | null = null;
  private sourceBuffer: SourceBufferLike | null = null;
  private encoder: AudioEncoderLike | null = null;
  private objectUrl: string | null = null;
  private started = false;
  private disposed = false;
  private wantPlaying = true;
  /** Media-timeline seconds of audio handed to the encoder so far. */
  private fedEndSec = 0;
  /** Encoder session counter: each encoder (re)creation bumps it
   *  and its output callback closes over its own number, so audio
   *  encoded before a flush — whose encoder has been replaced —
   *  is discarded when it surfaces, never played late. */
  private encoderSession = 0;
  /** Stall watchdog: the playhead position/tick at last check. */
  private lastPlayheadSec = -1;
  private stalledTicks = 0;
  private holdQueue: HeldChunk[] = [];
  private pumpTimer: ReturnType<typeof setInterval> | null = null;
  private appendQueue: Uint8Array[] = [];
  private appending = false;

  constructor(deps: MediaElementPlayoutDeps = defaultMediaElementDeps, onFatal: (reason: string) => void = () => {}) {
    this.deps = deps;
    this.onFatal = onFatal;
    this.element = deps.createElement();
    this.element.preload = "auto";
    this.element.setAttribute("data-heard-engine", "media-element");
    this.element.setAttribute("aria-hidden", "true");
    this.element.style.display = "none";
  }

  /** Attach + open the stream. Resolves true when chunks may be
   *  routed here; false leaves the caller on its fallback path. */
  async start(): Promise<boolean> {
    if (this.started) return this.ready;
    this.started = true;
    try {
      if (!mediaElementPlayoutMaybeSupported(this.deps)) return this.fail("unsupported");
      if (!(await this.deps.encoderSupported())) return this.fail("encoder-unsupported");
      const mediaSource = this.deps.createMediaSource();
      if (!mediaSource) return this.fail("no-mediasource");
      this.mediaSource = mediaSource;
      this.objectUrl = this.deps.createObjectUrl(mediaSource);
      this.element.src = this.objectUrl;
      // A real element in the document, like a voice-note player —
      // not a detached renderer of a WebAudio stream.
      try {
        document.body?.appendChild(this.element);
      } catch {
        /* attachment is best-effort; playback does not depend on it */
      }
      const opened = await new Promise<boolean>((resolve) => {
        if (mediaSource.readyState === "open") return resolve(true);
        const timer = setTimeout(() => resolve(false), 4000);
        mediaSource.addEventListener("sourceopen", () => {
          clearTimeout(timer);
          resolve(true);
        });
      });
      if (!opened || this.disposed) return this.fail("sourceopen-timeout");
      this.sourceBuffer = mediaSource.addSourceBuffer(MSE_TYPE);
      // The init segment goes out first, ahead of any cluster. The
      // CodecPrivate is the self-built OpusHead (pre-skip 0): the
      // encoder is created after this append by construction, so a
      // metadata-reported OpusHead could never arrive in time —
      // the residual is a few ms of pipeline latency, absorbed in
      // MEDIA_ELEMENT_PIPELINE_SEC.
      this.appendQueue.push(webmOpusInitSegment(opusHead(MEDIA_ELEMENT_INPUT_RATE, 1, 0)));
      this.pumpAppends();
      if (!this.startEncoder()) return this.fail("no-encoder");
      await this.tryPlay();
      this.ready = true;
      this.element.addEventListener("error", () => {
        if (this.ready && !this.disposed) this.fail("element-error");
      });
      this.ensurePump();
      return true;
    } catch {
      return this.fail("exception");
    }
  }

  /** Create the encoder, wiring callbacks that only honor their
   *  own session (see encoderSession). */
  private startEncoder(): boolean {
    const session = ++this.encoderSession;
    const encoder = this.deps.createEncoder(
      (chunk) => {
        if (session === this.encoderSession) this.onEncoded(chunk);
      },
      () => {
        if (session === this.encoderSession) this.fail("encoder-error");
      },
    );
    if (!encoder) return false;
    this.encoder = encoder;
    return true;
  }

  private fail(reason: string): false {
    if (!this.failed) {
      this.failed = true;
      this.ready = false;
      try {
        this.onFatal(reason);
      } catch {
        /* the caller's fallback must never throw through here */
      }
    }
    return false;
  }

  private async tryPlay(): Promise<void> {
    if (!this.wantPlaying || this.disposed) return;
    try {
      await this.element.play();
    } catch {
      /* Autoplay refusal mid-start: the next enqueue retries; the
         caller keeps the fallback graph until ready flips — start()
         only reports ready after this attempt, and a rejected
         play() here is retried on every enqueue while unpaused. */
    }
  }

  /**
   * Offer one PCM16 chunk (24 kHz mono) to the engine. Returns
   * false when the chunk was NOT accepted (not ready / failed /
   * disposed) — the caller must play it on the fallback path
   * instead; a chunk is never accepted twice or dropped silently.
   * Accepted chunks are held until the element's trail (buffered
   * audio ahead of the playhead) falls to the chunk's target, then
   * encoded in order.
   */
  enqueuePcm16(samples: Int16Array, trailTargetSec: number): boolean {
    if (!this.ready || this.failed || this.disposed || !this.encoder) return false;
    // Copy: the caller's buffer is reused/decoded per chunk upstream.
    this.holdQueue.push({ samples: new Int16Array(samples), trailTargetSec });
    this.ensurePump();
    this.pumpHold();
    if (this.element.paused && this.wantPlaying) void this.tryPlay();
    return true;
  }

  private ensurePump(): void {
    if (this.pumpTimer !== null) return;
    this.pumpTimer = setInterval(() => {
      if (this.disposed || this.failed) return;
      this.pumpHold();
      this.watchdog();
    }, 40);
  }

  /** If the element stops advancing while audible audio is fed and
   *  waiting, the engine has failed in a way no event reported:
   *  hand the session back to the fallback rather than swallowing
   *  chunks the caller believes were accepted. User pause and an
   *  empty trail are not stalls. */
  private watchdog(): void {
    if (!this.ready || !this.wantPlaying) {
      this.stalledTicks = 0;
      return;
    }
    const playhead = this.element.currentTime;
    if (playhead !== this.lastPlayheadSec) {
      this.lastPlayheadSec = playhead;
      this.stalledTicks = 0;
      return;
    }
    if (this.fedEndSec - playhead > 0.5 && this.element.readyState < 3) {
      this.stalledTicks += 1;
      if (this.stalledTicks > 60) this.fail("element-stalled");
    } else {
      this.stalledTicks = 0;
    }
  }

  private pumpHold(): void {
    if (!this.encoder || this.failed || this.disposed) return;
    while (this.holdQueue.length > 0) {
      const next = this.holdQueue[0];
      // Trail gate: release while the element's buffered-ahead is
      // at or under the head chunk's target. The very first chunk
      // always releases (an empty stream must start), and a chunk
      // is atomic — the trail may overshoot the target by one
      // chunk's duration, then the next chunk waits it out.
      if (this.fedEndSec > 0 && this.trailSec() > next.trailTargetSec) break;
      this.holdQueue.shift();
      const frames = next.samples.length;
      const timestamp = Math.round(this.fedEndSec * 1_000_000);
      const data = new ArrayBuffer(frames * 2);
      new Int16Array(data).set(next.samples);
      try {
        const audioData = this.deps.createAudioData({
          format: "s16",
          sampleRate: MEDIA_ELEMENT_INPUT_RATE,
          numberOfFrames: frames,
          numberOfChannels: 1,
          timestamp,
          data,
        });
        this.encoder.encode(audioData);
      } catch {
        this.fail("encode-exception");
        return;
      }
      this.fedEndSec += frames / MEDIA_ELEMENT_INPUT_RATE;
    }
  }

  private onEncoded(chunk: EncodedChunkLike): void {
    if (this.disposed || this.failed) return;
    void (async () => {
      try {
        const bytes = new ArrayBuffer(chunk.byteLength);
        chunk.copyTo(bytes);
        if (this.disposed || this.failed) return;
        const timecodeMs = Math.max(0, Math.round(chunk.timestamp / 1000));
        this.appendQueue.push(webmOpusCluster(timecodeMs, new Uint8Array(bytes)));
        this.pumpAppends();
      } catch {
        this.fail("mux-exception");
      }
    })();
  }

  private pumpAppends(): void {
    const buffer = this.sourceBuffer;
    if (!buffer || this.appending || this.disposed) return;
    if (buffer.updating) {
      // An append/remove is still in flight (e.g. flush surgery):
      // resume when it settles instead of throwing into the catch.
      const retry = () => {
        buffer.removeEventListener("updateend", retry);
        this.pumpAppends();
      };
      buffer.addEventListener("updateend", retry);
      return;
    }
    const next = this.appendQueue.shift();
    if (!next) return;
    this.appending = true;
    const done = () => {
      this.appending = false;
      this.pumpAppends();
    };
    buffer.addEventListener("updateend", function handler() {
      buffer.removeEventListener("updateend", handler);
      done();
    });
    try {
      buffer.appendBuffer(next);
    } catch {
      // A full buffer (long stall): trim what is already heard and
      // retry once; persistent failure hands the session back.
      try {
        const played = this.element.currentTime;
        if (played > 5 && !buffer.updating) buffer.remove(0, played - 2);
        this.appendQueue.unshift(next);
        this.appending = false;
        return;
      } catch {
        this.fail("append-exception");
      }
      this.appending = false;
    }
  }

  /** Buffered audio ahead of the playhead, seconds — the heard
   *  delay this engine is currently imposing (before pipeline). */
  trailSec(): number {
    if (!this.ready) return 0;
    const ahead = this.fedEndSec - this.element.currentTime;
    return Math.min(4, Math.max(0, ahead));
  }

  /** The session level, applied to the ELEMENT (mute + slider):
   *  this is the control the hardware keys complement, not fight —
   *  the element's own volume property, as on a media player. */
  setLevel(level: HeardLevel): void {
    this.element.muted = level.muted;
    this.element.volume = clampPlaybackVolume(level.volume);
  }

  setPaused(paused: boolean): void {
    this.wantPlaying = !paused;
    if (paused) {
      try {
        this.element.pause();
      } catch {
        /* ignore */
      }
    } else {
      void this.tryPlay();
    }
  }

  /** Barge-in: drop everything not yet heard. The element keeps at
   *  most the already-decoded tail (<~0.2 s); held audio is dropped,
   *  buffered-ahead media is removed, and the encoder is REPLACED
   *  (its pending outputs belong to the old session and are
   *  discarded by the session check) so nothing pre-flush can
   *  surface late. If the encoder cannot be replaced, the engine
   *  fails and the caller falls back — a flush that cannot flush
   *  must not pretend. */
  flush(): void {
    if (this.disposed || this.failed) return;
    this.holdQueue = [];
    this.appendQueue = [];
    const buffer = this.sourceBuffer;
    if (buffer && !buffer.updating) {
      try {
        const end = this.bufferedEnd();
        const from = this.element.currentTime + 0.02;
        if (end > from) buffer.remove(from, end);
      } catch {
        /* buffer surgery is best-effort; the encoder replacement
           already keeps stale audio out of the append queue */
      }
    }
    try {
      this.encoder?.close();
    } catch {
      /* ignore */
    }
    this.encoder = null;
    // Re-anchor the media timeline at the playhead so later chunks
    // append contiguously instead of behind a removed range.
    this.fedEndSec = this.element.currentTime + 0.02;
    if (!this.startEncoder()) this.fail("encoder-restart");
  }

  private bufferedEnd(): number {
    try {
      const buffered = this.sourceBuffer?.buffered;
      if (!buffered || buffered.length === 0) return this.element.currentTime;
      return buffered.end(buffered.length - 1);
    } catch {
      return this.element.currentTime;
    }
  }

  /** Playout-diag state: the terminal sink IS this element. */
  diagState(): { paused: boolean; readyState: number } {
    return { paused: this.element.paused, readyState: this.element.readyState };
  }

  dispose(): void {
    this.disposed = true;
    this.ready = false;
    if (this.pumpTimer !== null) {
      clearInterval(this.pumpTimer);
      this.pumpTimer = null;
    }
    this.holdQueue = [];
    this.appendQueue = [];
    try {
      this.encoder?.close();
    } catch {
      /* ignore */
    }
    this.encoder = null;
    try {
      this.element.pause();
    } catch {
      /* ignore */
    }
    try {
      this.element.removeAttribute("src");
      this.element.load();
    } catch {
      /* ignore */
    }
    try {
      this.element.remove();
    } catch {
      /* ignore */
    }
    if (this.objectUrl) {
      try {
        this.deps.revokeObjectUrl(this.objectUrl);
      } catch {
        /* ignore */
      }
      this.objectUrl = null;
    }
    this.sourceBuffer = null;
    this.mediaSource = null;
  }
}
