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
 *
 * ROUND 4 (volume round 4, 2026-11-14 — Ron's SIXTH report, on
 * Publish #51): the #51 session record proved this engine never
 * became the heard terminal on his phone — every stamp read
 * term=media-stream (the #48 WebAudio sink) while the engine's
 * start outcome left no trace anywhere. Two structural defects
 * made that possible, and both are removed here:
 *  1. start() AWAITED element.play() before reporting ready. On a
 *     real MSE element with only an init segment appended, play()'s
 *     promise can stay pending until frames exist — and frames can
 *     only be encoded after ready. That is a deadlock: no data
 *     without ready, no ready without play() resolving. start()
 *     now requests play() WITHOUT awaiting it (enqueuePcm16 keeps
 *     retrying while the element is paused, and the stall watchdog
 *     still fails the engine honestly if the playhead never moves).
 *  2. The encoder was probed at exactly one configuration —
 *     Opus at the 24 kHz input rate. A platform whose WebCodecs
 *     Opus encoder only accepts 48 kHz failed the probe and killed
 *     the engine before it existed. start() now walks a ladder
 *     (24 kHz native, then 48 kHz with the PCM upsampled ×2 — one
 *     media second stays one media second) and records which rung
 *     won on the instance (encoderRate).
 * Every failure also records its reason on the instance
 * (failureReason) and the caller stamps it (efail=) — a start that
 * cannot succeed must say why in the session record, never vanish.
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

/** A WebCodecs Opus encoder configuration (round 4: the probe
 *  walks OPUS_ENCODER_RATES and the winner is kept, so the config
 *  travels with the encoder instead of being one fixed constant). */
export interface OpusEncoderConfigLike {
  codec: string;
  sampleRate: number;
  numberOfChannels: number;
  bitrate: number;
}

/** Encoder sample-rate ladder, most faithful first: the native
 *  24 kHz input rate, then 48 kHz (the rate WebCodecs Opus
 *  encoders most broadly accept; PCM is upsampled ×2 to feed it,
 *  which preserves the media timeline exactly). */
export const OPUS_ENCODER_RATES: readonly number[] = [MEDIA_ELEMENT_INPUT_RATE, 48000];

const opusEncoderConfig = (sampleRate: number): OpusEncoderConfigLike => ({
  codec: "opus",
  sampleRate,
  numberOfChannels: 1,
  bitrate: 40_000,
});

/** ×2 linear-interpolation upsample of PCM16 (24 kHz → 48 kHz for
 *  the ladder's second rung). Speech-grade: each input sample is
 *  kept, with the midpoint to its successor inserted between. */
export function upsample2x(samples: Int16Array): Int16Array {
  if (samples.length === 0) return new Int16Array(0);
  const out = new Int16Array(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    const cur = samples[i];
    const next = i + 1 < samples.length ? samples[i + 1] : cur;
    out[2 * i] = cur;
    out[2 * i + 1] = Math.round((cur + next) / 2);
  }
  return out;
}

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
    config: OpusEncoderConfigLike,
  ) => AudioEncoderLike | null;
  encoderSupported: (config: OpusEncoderConfigLike) => Promise<boolean>;
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
  createEncoder: (output, error, config) => {
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
    encoder.configure({ ...config });
    return encoder;
  },
  encoderSupported: async (config) => {
    const Ctor = (globalThis as {
      AudioEncoder?: { isConfigSupported?: (config: unknown) => Promise<{ supported?: boolean }> };
    }).AudioEncoder;
    if (typeof Ctor?.isConfigSupported !== "function") return false;
    try {
      const result = await Ctor.isConfigSupported({ ...config });
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
  /** The encoder ladder rung that won the probe (round 4), or
   *  null before start settles / when no rung was supported. The
   *  playout diag stamps it (erate=) so the record shows which
   *  configuration the platform actually accepted. */
  encoderRate: number | null = null;
  /** Why the engine failed (round 4): the fail() reason, kept on
   *  the instance because the #51 record proved a start failure
   *  that left no trace is indistinguishable from a start that
   *  never ran. The caller stamps it (efail=). */
  failureReason: string | null = null;
  /** The winning encoder configuration, reused by every encoder
   *  (re)creation (start + flush restarts). */
  private encoderConfig: OpusEncoderConfigLike | null = null;

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
      const config = await this.probeEncoderConfig();
      if (!config) return this.fail("encoder-unsupported");
      this.encoderConfig = config;
      this.encoderRate = config.sampleRate;
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
      // CodecPrivate is the self-built OpusHead (pre-skip 0),
      // declaring the ENCODER's rate (round 4): at the ladder's
      // 48 kHz rung the encoded frames really are 48 kHz samples,
      // so the header must say so. The encoder is created after
      // this append by construction, so a metadata-reported
      // OpusHead could never arrive in time — the residual is a
      // few ms of pipeline latency, absorbed in
      // MEDIA_ELEMENT_PIPELINE_SEC.
      this.appendQueue.push(webmOpusInitSegment(opusHead(config.sampleRate, 1, 0)));
      this.pumpAppends();
      if (!this.startEncoder()) return this.fail("no-encoder");
      // Round 4: play() is requested but NOT awaited. Its promise
      // can stay pending on an MSE element until frames exist,
      // and frames only exist once the caller routes chunks —
      // which waits for ready. Awaiting it deadlocked start() on
      // exactly the phones this engine exists for. The element
      // starts audibly when the first cluster lands;
      // enqueuePcm16 retries play() while it sits paused, and
      // the stall watchdog fails the engine if the playhead
      // never advances under load.
      void this.tryPlay();
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

  /** Walk the encoder ladder (round 4): the first configuration
   *  the platform's WebCodecs Opus encoder accepts wins. A rung
   *  whose probe throws counts as unsupported, not fatal — the
   *  next rung may still work. */
  private async probeEncoderConfig(): Promise<OpusEncoderConfigLike | null> {
    for (const rate of OPUS_ENCODER_RATES) {
      const config = opusEncoderConfig(rate);
      try {
        if (await this.deps.encoderSupported(config)) return config;
      } catch {
        /* probe failure on this rung — try the next */
      }
    }
    return null;
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
      this.encoderConfig ?? opusEncoderConfig(MEDIA_ELEMENT_INPUT_RATE),
    );
    if (!encoder) return false;
    this.encoder = encoder;
    return true;
  }

  private fail(reason: string): false {
    if (!this.failed) {
      this.failed = true;
      this.ready = false;
      this.failureReason = reason;
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
      /* Autoplay refusal: the next enqueue retries play() while
         the element sits paused, and setPaused(false) retries on
         resume — a rejected play() never fails the engine by
         itself; only the stall watchdog (fed but never advancing)
         does. */
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
      // Encode at the ladder's winning rate (round 4): at the
      // 48 kHz rung the 24 kHz input is upsampled ×2 first, so the
      // AudioData carries twice the frames at twice the rate —
      // the SAME media duration, and the timestamp (media-timeline
      // microseconds) is unchanged either way.
      const rate = this.encoderRate ?? MEDIA_ELEMENT_INPUT_RATE;
      const encoded = rate === MEDIA_ELEMENT_INPUT_RATE * 2 ? upsample2x(next.samples) : next.samples;
      const timestamp = Math.round(this.fedEndSec * 1_000_000);
      const data = new ArrayBuffer(encoded.length * 2);
      new Int16Array(data).set(encoded);
      try {
        const audioData = this.deps.createAudioData({
          format: "s16",
          sampleRate: rate,
          numberOfFrames: encoded.length,
          numberOfChannels: 1,
          timestamp,
          data,
        });
        this.encoder.encode(audioData);
      } catch {
        this.fail("encode-exception");
        return;
      }
      this.fedEndSec += next.samples.length / MEDIA_ELEMENT_INPUT_RATE;
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

  /** Playout-diag state: the terminal sink IS this element.
   *  Round 4 adds the element's own muted/volume — the record
   *  must prove the terminal is a decoded-media element, unmuted,
   *  at the visitor's slider level. */
  diagState(): { paused: boolean; readyState: number; muted: boolean; volume: number } {
    return {
      paused: this.element.paused,
      readyState: this.element.readyState,
      muted: this.element.muted,
      volume: this.element.volume,
    };
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
