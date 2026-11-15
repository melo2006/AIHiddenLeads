/**
 * Blob/file media-element playout — Publish #54's default heard
 * engine, replacing the MediaSource engine (mediaElementPlayout.ts)
 * as the local path's audible terminal.
 *
 * Why: the MSE engine ENGAGED on Ron's phone in Publish #52
 * (hardware keys worked in stretches) but its stall-recovery ladder
 * went 0-for-7 in the #53 retest — 7 stalls across 4 sessions, 0
 * recoveries, every stalled session ending efail=element-stalled
 * and flipping to the MediaStream sink, which is exactly the flip
 * that killed the hardware volume keys again. The failure shape is
 * structural to MSE live-append: timeline holes the playhead parks
 * at, and a live edge that drip-feeds. The #53 build's own report
 * named the trigger — stalls ≫ recoveries means abandon
 * MediaSource on this path for the blob/file fallback. This is it.
 *
 * The shape is the one Ron's phone has always governed correctly:
 * a plain media element playing a media FILE (his Muse-app voice
 * notes). The encode front-end is unchanged — Gemini PCM (24 kHz)
 * → WebCodecs Opus (the same 24 kHz → 48 kHz ladder) → the same
 * WebM mux — but instead of appending clusters to a MediaSource,
 * the muxed bytes accumulate into a SEGMENT; when the segment
 * seals, it becomes one Blob ('audio/webm') behind one object URL,
 * and the element plays whole files back to back:
 *
 *   PCM → Opus encode → WebM bytes → [segment] → Blob → <audio>
 *
 * No MediaSource, no SourceBuffer, no live timeline to hole —
 * a file either decodes or it doesn't, and element.volume (the
 * property the session's level controls drive) governs loudness
 * exactly as on a voice-note player. The MSE engine remains
 * reachable behind ?heardEngine=element for A/B; the WebAudio
 * media-sink graph remains the chunk-by-chunk fallback for
 * anything this engine refuses or fails.
 *
 * Segments (the chunking model): a segment seals when
 *  - it holds SEGMENT_TARGET_SEC of audio (steady state), or
 *  - it is the FIRST segment since start/flush and holds
 *    FIRST_SEGMENT_SEC — the greeting (and every post-barge-in
 *    reply) starts fast, so the heard delay for a paired chunk
 *    stays near the established ~+0.4 s (accumulation + pipeline)
 *    instead of a full segment late, or
 *  - arrivals have gone idle (IDLE_SEAL_TICKS without a newly
 *    encoded cluster) with at least MIN_SEGMENT_SEC on hand —
 *    utterance tails seal promptly instead of waiting out the
 *    target while the visitor hears silence, or
 *  - stall recovery force-seals it (below).
 * Encoding stays trail-gated exactly as in the MSE engine (the
 * head chunk's target, raised to the rebuffer cushion inside a
 * stall episode), so fed audio can only run a bounded distance
 * ahead of the heard position and segment count stays small.
 *
 * Object-URL lifecycle / memory: a URL is created at seal time
 * and revoked the moment its segment ends, is skipped, is
 * flushed, or the engine disposes — at most the playing segment
 * plus the queued ones are alive, and the trail gate bounds the
 * queue to a few seconds of 40 kbps Opus (tens of KB). The
 * unsealed segment's source PCM is retained until it seals (for
 * drainPendingPcm), never longer: retention is one segment
 * (≤ SEGMENT_TARGET_SEC + one chunk) plus the held queue.
 *
 * Stalls in blob mode are PLAYBACK WAITING / UNDERRUN events:
 * the heard position (fully played segments + the element's
 * position in the current file) frozen while unplayed audio is
 * on hand — a segment loaded but its playhead parked, a sealed
 * segment never started, arrivals stopped with the element dry
 * and an unsealed tail on hand, or the element signalling
 * 'waiting' mid-file. The monitor mirrors round 5's accounting
 * (episode after ~320 ms frozen, actions every ~600 ms, failure
 * after ~6 s with the same "element-stalled" reason, stalls=/rec=
 * diag counters) with a blob-shaped ladder:
 *  1. force the encode pump, force-seal + start a segment when
 *     the element is dry;
 *  2. re-request play() when the element dropped its state;
 *  3. reload-resume a wedged file: re-set the SAME object URL
 *     and seek back to the frozen offset (a wedged decoder is
 *     the blob analog of the MSE timeline hole), at most
 *     MAX_SEGMENT_RELOADS times per segment;
 *  4. skip the segment — its speech is lost, the call is not.
 * An element 'error' on the current file skips it immediately
 * (counted as an episode); two consecutive erroring files with
 * no playback progress between them fail the engine
 * ("element-error"). fail() hands the caller the unsealed
 * segment's PCM plus every held chunk, in order — the same
 * drain contract as the MSE engine (sealed/playing audio is
 * not recoverable, exactly like appended-but-unplayed ranges).
 */
import { clampPlaybackVolume } from "@/lib/playbackVolume";
import { createRateWitness, noteRateUtterance, type RateWitnessState } from "@/lib/rateWitness";
import { opusHead, webmOpusCluster, webmOpusInitSegment } from "@/lib/webmOpusMux";
import {
  MEDIA_ELEMENT_INPUT_RATE,
  OPUS_ENCODER_RATES,
  opusEncoderConfig,
  upsample2x,
  type AudioEncoderLike,
  type EncodedChunkLike,
  type EncoderOutputMeta,
  type HeardElementEngine,
  type HeardLevel,
  type OpusEncoderConfigLike,
} from "@/lib/mediaElementPlayout";

/** Nominal encode + file-delivery + decode latency of this
 *  engine, seconds. The encoder is the MSE engine's, and a local
 *  file's decode startup is no slower than an MSE append's, so
 *  the nominal matches MEDIA_ELEMENT_PIPELINE_SEC — heard-delay
 *  bookkeeping (trail targets, caption shift) stays comparable
 *  across engines, and trailSec() still reports the measured
 *  backlog on top of it. */
export const BLOB_ELEMENT_PIPELINE_SEC = 0.15;

/* Segment sealing (media seconds of accumulated audio). */
const FIRST_SEGMENT_SEC = 0.3;
const SEGMENT_TARGET_SEC = 1.5;
const MIN_SEGMENT_SEC = 0.2;
/** Force-seal floor (stall recovery): below this much audio a
 *  forced file is more gap than speech. */
const FORCE_SEAL_MIN_SEC = 0.15;
/** Pump ticks (40 ms) without a newly encoded cluster before an
 *  utterance tail counts as idle and seals early: ~160 ms. */
const IDLE_SEAL_TICKS = 4;

/* Stall accounting — the same tick budget as the MSE engine's
 * round 5, so session records stay comparable across engines. */
const STALL_OPEN_TICKS = 8; // ~320 ms
const STALL_ACTION_TICKS = 15; // ~600 ms
const STALL_FAIL_TICKS = 150; // ~6 s
/** Inside an episode the trail gate rises to this cushion (the
 *  round-5 rebuffer target) so recovery has material to seal. */
const EPISODE_GATE_SEC = 0.35;
/** Reload-resume attempts per segment before it is skipped. */
const MAX_SEGMENT_RELOADS = 2;

export interface BlobElementPlayoutDeps {
  createElement: () => HTMLAudioElement;
  createObjectUrl: (blob: Blob) => string;
  revokeObjectUrl: (url: string) => void;
  /** Synchronous half of the support probe: the WebCodecs
   *  AudioEncoder API exists at all (the async config half runs
   *  inside start(), exactly like the MSE engine's ladder). */
  hasAudioEncoder: () => boolean;
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

/** Production deps: the real platform globals, feature-detected
 *  (the encoder pieces mirror the MSE engine's defaults). */
export const defaultBlobElementDeps: BlobElementPlayoutDeps = {
  createElement: () => document.createElement("audio"),
  createObjectUrl: (blob) => URL.createObjectURL(blob),
  revokeObjectUrl: (url) => URL.revokeObjectURL(url),
  hasAudioEncoder: () =>
    typeof (globalThis as { AudioEncoder?: unknown }).AudioEncoder === "function",
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
 *  the encoder ladder — runs inside start()). */
export function blobElementPlayoutMaybeSupported(deps: BlobElementPlayoutDeps = defaultBlobElementDeps): boolean {
  try {
    return deps.hasAudioEncoder();
  } catch {
    return false;
  }
}

interface HeldChunk {
  samples: Int16Array;
  trailTargetSec: number;
}

/** The segment being accumulated: muxed WebM parts (init segment
 *  first, then one cluster per encoded chunk, timecodes rebased
 *  to the segment's own zero), the media seconds assembled, and
 *  the source PCM — retained until the seal for drainPendingPcm. */
interface OpenSegment {
  parts: Uint8Array[];
  assembledSec: number;
  baseMs: number | null;
  pcm: Int16Array[];
}

const freshSegment = (): OpenSegment => ({ parts: [], assembledSec: 0, baseMs: null, pcm: [] });

interface SealedSegment {
  url: string;
  durationSec: number;
}

interface PlayingSegment extends SealedSegment {
  reloads: number;
}

export class BlobElementPlayout implements HeardElementEngine {
  readonly element: HTMLAudioElement;
  readonly kind = "blob" as const;
  readonly pipelineSec = BLOB_ELEMENT_PIPELINE_SEC;
  ready = false;
  failed = false;
  encoderRate: number | null = null;
  failureReason: string | null = null;
  stallCount = 0;
  recoveryCount = 0;

  private readonly deps: BlobElementPlayoutDeps;
  private readonly onFatal: (reason: string) => void;
  private encoder: AudioEncoderLike | null = null;
  private encoderConfig: OpusEncoderConfigLike | null = null;
  private encoderSession = 0;
  private started = false;
  private disposed = false;
  private wantPlaying = true;
  /** Media-timeline seconds of audio handed to the encoder. */
  private fedEndSec = 0;
  private holdQueue: HeldChunk[] = [];
  /** Media duration of each chunk handed to the encoder, in
   *  encode order — onEncoded shifts one per output cluster, so
   *  segment durations never depend on the encoder reporting
   *  chunk durations. Cleared whenever the encoder is replaced
   *  (a replaced encoder's outputs are discarded by the session
   *  guard, so its entries must not misalign the next one's). */
  private pendingDurations: number[] = [];
  private segment: OpenSegment = freshSegment();
  /** The next seal uses the short first-segment target (start of
   *  the engine, and re-armed by every flush so a post-barge-in
   *  reply starts as fast as the greeting did). */
  private firstSegmentPending = true;
  private playQueue: SealedSegment[] = [];
  private current: PlayingSegment | null = null;
  /** Media seconds of segments fully played (or skipped past):
   *  the heard position is this plus the element's position in
   *  the current file. */
  private playedBaseSec = 0;
  /** Rate witness (Publish #54): one utterance per COMPLETED
   *  file — fed = the file's PCM duration (durationSec), clock =
   *  the element's raw final currentTime in it. heardSec() above
   *  is denominated in fed seconds and can never convict a
   *  mis-rating platform; the raw playhead can. Skipped files
   *  never reach onSegmentEnded, so they never enter the
   *  aggregate. */
  private witness: RateWitnessState = createRateWitness();
  /** Consecutive files that errored with no playback progress
   *  between them — two in a row is an engine failure, not a
   *  bad segment. */
  private segmentErrorStreak = 0;
  /** The element signalled 'waiting'/'stalled' for the current
   *  file and has not signalled 'playing' since. */
  private elementWaiting = false;
  private pendingDrain: Int16Array[] = [];
  private pumpTimer: ReturnType<typeof setInterval> | null = null;
  private tickCount = 0;
  private lastEncodedTick = 0;
  private lastHeardSec = 0;
  /** Heard position immediately after the engine itself last
   *  moved it (a segment skip advancing the base past unplayed
   *  audio): recovery is only proven by the playhead moving
   *  PAST this — the skip itself is not the playhead recovering
   *  (the MSE engine's gap-jump guard, same reasoning). */
  private engineJumpHeardSec = -1;
  private frozenTicks = 0;
  private episode: { startTick: number; frozenHeard: number; actions: number; lastActionTick: number } | null = null;

  constructor(deps: BlobElementPlayoutDeps = defaultBlobElementDeps, onFatal: (reason: string) => void = () => {}) {
    this.deps = deps;
    this.onFatal = onFatal;
    this.element = deps.createElement();
    this.element.preload = "auto";
    this.element.setAttribute("data-heard-engine", "blob-element");
    this.element.setAttribute("aria-hidden", "true");
    this.element.style.display = "none";
    this.element.addEventListener("ended", this.onSegmentEnded);
    this.element.addEventListener("error", this.onElementError);
    this.element.addEventListener("waiting", this.onElementWaiting);
    this.element.addEventListener("stalled", this.onElementWaiting);
    this.element.addEventListener("playing", this.onElementPlaying);
  }

  /** Settle the engine: probe the encoder ladder and create the
   *  encoder. Resolves true when chunks may be routed here;
   *  false leaves the caller on its fallback path. No play() is
   *  requested here — nothing is loaded until the first segment
   *  seals (the MSE engine's round-4 lesson stands: never await
   *  play(), and never let start() wait on the element). */
  async start(): Promise<boolean> {
    if (this.started) return this.ready;
    this.started = true;
    try {
      if (!blobElementPlayoutMaybeSupported(this.deps)) return this.fail("unsupported");
      const config = await this.probeEncoderConfig();
      if (!config) return this.fail("encoder-unsupported");
      this.encoderConfig = config;
      this.encoderRate = config.sampleRate;
      // A real element in the document, like a voice-note player —
      // not a detached renderer of a WebAudio stream.
      try {
        document.body?.appendChild(this.element);
      } catch {
        /* attachment is best-effort; playback does not depend on it */
      }
      if (!this.startEncoder()) return this.fail("no-encoder");
      if (this.disposed) return this.fail("exception");
      this.ready = true;
      this.ensurePump();
      return true;
    } catch {
      return this.fail("exception");
    }
  }

  /** The encoder ladder (shared with the MSE engine): the first
   *  configuration the platform's WebCodecs Opus encoder accepts
   *  wins; a throwing rung counts as unsupported, not fatal. */
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
      // The drain contract (shared with the MSE engine): every
      // accepted-but-unplayed PCM chunk the engine can still
      // account for — the unsealed segment's source PCM, then
      // the held queue, in acceptance order — is handed back
      // BEFORE the fatal callback, so the caller's flip replays
      // that speech on the fallback. Sealed and playing files
      // cannot be turned back into PCM here.
      this.pendingDrain = [...this.segment.pcm, ...this.holdQueue.map((held) => held.samples)];
      this.segment = freshSegment();
      this.holdQueue = [];
      this.closeEpisode(false);
      try {
        this.onFatal(reason);
      } catch {
        /* the caller's fallback must never throw through here */
      }
    }
    return false;
  }

  /** The PCM chunks fail() captured. Drains once; empty when
   *  nothing was stranded (including start failures). */
  drainPendingPcm(): Int16Array[] {
    const out = this.pendingDrain;
    this.pendingDrain = [];
    return out;
  }

  private async tryPlay(): Promise<void> {
    if (!this.wantPlaying || this.disposed || !this.current) return;
    try {
      await this.element.play();
    } catch {
      /* Autoplay refusal: enqueue retries play() while a file is
         loaded and paused, setPaused(false) retries on resume,
         and the stall monitor fails the engine honestly if the
         playhead never advances under load. */
    }
  }

  /**
   * Offer one PCM16 chunk (24 kHz mono). Same acceptance
   * contract as the MSE engine: false means NOT accepted (not
   * ready / failed / disposed) and the caller must play the
   * chunk on its fallback; an accepted chunk is never dropped
   * silently. Accepted chunks are held until the trail gate
   * releases them to the encoder.
   */
  enqueuePcm16(samples: Int16Array, trailTargetSec: number): boolean {
    if (!this.ready || this.failed || this.disposed || !this.encoder) return false;
    // Copy: the caller's buffer is reused/decoded per chunk upstream.
    this.holdQueue.push({ samples: new Int16Array(samples), trailTargetSec });
    this.ensurePump();
    this.pumpHold();
    if (this.current && this.element.paused && this.wantPlaying) void this.tryPlay();
    return true;
  }

  private ensurePump(): void {
    if (this.pumpTimer !== null) return;
    this.pumpTimer = setInterval(() => {
      if (this.disposed || this.failed) return;
      this.tickCount += 1;
      this.pumpHold();
      this.maybeSealSegment();
      this.stallMonitor();
    }, 40);
  }

  private pumpHold(): void {
    if (!this.encoder || this.failed || this.disposed) return;
    while (this.holdQueue.length > 0) {
      const next = this.holdQueue[0];
      // Trail gate, as in the MSE engine: release while the
      // heard backlog is at or under the head chunk's target;
      // the very first chunk always releases. Inside a stall
      // episode the gate rises to the cushion so recovery has
      // material to seal and play.
      const gateTarget = this.episode ? Math.max(next.trailTargetSec, EPISODE_GATE_SEC) : next.trailTargetSec;
      if (this.fedEndSec > 0 && this.trailSec() > gateTarget) break;
      this.holdQueue.shift();
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
      this.pendingDurations.push(next.samples.length / MEDIA_ELEMENT_INPUT_RATE);
      this.segment.pcm.push(next.samples);
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
        const durationSec = this.pendingDurations.shift() ?? (chunk.duration ? chunk.duration / 1_000_000 : 0);
        const seg = this.segment;
        if (seg.parts.length === 0) {
          // A file opens with the same init segment the MSE
          // engine appends — OpusHead declaring the ENCODER's
          // rate (the ladder's 48 kHz rung encodes real 48 kHz
          // frames, and the header must say so).
          seg.parts.push(webmOpusInitSegment(opusHead(this.encoderRate ?? MEDIA_ELEMENT_INPUT_RATE, 1, 0)));
          seg.baseMs = Math.max(0, Math.round(chunk.timestamp / 1000));
        }
        const timecodeMs = Math.max(0, Math.round(chunk.timestamp / 1000) - (seg.baseMs ?? 0));
        seg.parts.push(webmOpusCluster(timecodeMs, new Uint8Array(bytes)));
        seg.assembledSec += durationSec;
        this.lastEncodedTick = this.tickCount;
        this.maybeSealSegment();
      } catch {
        this.fail("mux-exception");
      }
    })();
  }

  /** Seal the open segment when its rule fires (see the module
   *  header). `force` is stall recovery's variant: any segment
   *  past the force floor seals NOW, because the element is dry
   *  and waiting for the regular target is the stall. */
  private maybeSealSegment(force = false): void {
    const seg = this.segment;
    if (seg.parts.length === 0 || this.disposed || this.failed) return;
    const target = this.firstSegmentPending ? FIRST_SEGMENT_SEC : SEGMENT_TARGET_SEC;
    const due = force
      ? seg.assembledSec >= FORCE_SEAL_MIN_SEC
      : seg.assembledSec >= target ||
        (seg.assembledSec >= MIN_SEGMENT_SEC && this.tickCount - this.lastEncodedTick >= IDLE_SEAL_TICKS);
    if (!due) return;
    const blob = new Blob(seg.parts as BlobPart[], { type: "audio/webm" });
    const url = this.deps.createObjectUrl(blob);
    this.playQueue.push({ url, durationSec: seg.assembledSec });
    this.segment = freshSegment();
    this.firstSegmentPending = false;
    this.startNextSegment();
  }

  /** Load the head sealed segment into the element and play it.
   *  The heard position continues across files through
   *  playedBaseSec, so a chain of files reads as one timeline. */
  private startNextSegment(): void {
    if (this.current || !this.wantPlaying || this.disposed || this.failed) return;
    const next = this.playQueue.shift();
    if (!next) return;
    this.current = { ...next, reloads: 0 };
    this.elementWaiting = false;
    try {
      this.element.src = next.url;
    } catch {
      /* a refused src leaves the segment current; the stall
         monitor's reload/skip ladder handles it from there */
    }
    void this.tryPlay();
  }

  private onSegmentEnded = (): void => {
    if (!this.current || this.disposed) return;
    // Rate witness: the file played to completion — note the
    // fed duration against the element's RAW final position
    // before the bookkeeping below denominates it in fed
    // seconds. A platform that derived the file's duration
    // from the wrong rate leaves its factor here.
    noteRateUtterance(this.witness, this.current.durationSec, this.element.currentTime);
    this.revoke(this.current.url);
    this.playedBaseSec += this.current.durationSec;
    this.current = null;
    this.segmentErrorStreak = 0;
    this.startNextSegment();
  };

  private onElementError = (): void => {
    // Errors with no file loaded (src removed at dispose/flush,
    // a play() with nothing queued) are platform noise.
    if (!this.current || !this.ready || this.disposed || this.failed) return;
    this.skipCurrentSegment();
    this.segmentErrorStreak += 1;
    if (this.segmentErrorStreak >= 2) {
      this.fail("element-error");
      return;
    }
    // A skipped file is a stall episode: it closes recovered
    // when the heard position advances again under its own
    // power, and fails the engine at the usual limit if the
    // next file wedges too.
    if (!this.episode) {
      this.episode = {
        startTick: this.tickCount,
        frozenHeard: this.heardSec(),
        actions: 1,
        lastActionTick: this.tickCount,
      };
      this.stallCount += 1;
    }
    this.startNextSegment();
  };

  private onElementWaiting = (): void => {
    this.elementWaiting = true;
  };

  private onElementPlaying = (): void => {
    this.elementWaiting = false;
  };

  /** Drop the current file unplayed (its speech is lost, the
   *  call is not): revoke its URL and advance the heard base
   *  past it, so the trail bookkeeping never waits on audio
   *  that will never be heard. */
  private skipCurrentSegment(): void {
    if (!this.current) return;
    this.revoke(this.current.url);
    this.playedBaseSec += this.current.durationSec;
    this.current = null;
    this.elementWaiting = false;
    this.engineJumpHeardSec = this.heardSec();
  }

  private revoke(url: string): void {
    try {
      this.deps.revokeObjectUrl(url);
    } catch {
      /* revocation is best-effort hygiene */
    }
  }

  /** Heard position on the media timeline: fully played (or
   *  skipped) segments plus the element's position in the
   *  current file. */
  private heardSec(): number {
    if (!this.current) return this.playedBaseSec;
    const at = Number.isFinite(this.element.currentTime) ? this.element.currentTime : 0;
    return this.playedBaseSec + Math.min(Math.max(0, at), this.current.durationSec);
  }

  /** Buffered-ahead equivalent: fed media the visitor has not
   *  heard yet — the heard delay this engine is imposing
   *  (before pipeline), same meaning as the MSE engine's. */
  trailSec(): number {
    if (!this.ready) return 0;
    const ahead = this.fedEndSec - this.heardSec();
    return Math.min(4, Math.max(0, ahead));
  }

  /** Is there speech the visitor has not heard yet? With a file
   *  loaded: its unplayed remainder, or the element saying it is
   *  waiting on it. With the element DRY: a sealed file waiting
   *  to start (starting it was the engine's job), held PCM whose
   *  encoding has stalled, or an unsealed tail whose arrivals
   *  have STOPPED (it should have idle-sealed by now). A tail
   *  still accumulating is a normal seam, not a stall — its seal
   *  rules fire on their own schedule. Silence between
   *  utterances (everything fed has been heard) is never a
   *  stall. */
  private hasUnplayedAudio(): boolean {
    if (this.current) {
      if (this.current.durationSec - this.element.currentTime > 0.05) return true;
      if (this.elementWaiting) return true;
      return false;
    }
    if (this.playQueue.length > 0) return true;
    const accumulating =
      this.segment.parts.length > 0 && this.tickCount - this.lastEncodedTick < IDLE_SEAL_TICKS;
    if (accumulating) return false;
    if (this.holdQueue.length > 0) return true;
    if (this.segment.parts.length > 0) return true;
    return false;
  }

  private closeEpisode(recovered: boolean): void {
    if (!this.episode) return;
    if (recovered && this.episode.actions > 0) this.recoveryCount += 1;
    this.episode = null;
    this.engineJumpHeardSec = -1;
  }

  /**
   * Stall monitor (blob mode): the heard position frozen while
   * unplayed audio is on hand for ~320 ms opens an EPISODE, and
   * the episode works the recovery ladder until the position
   * moves under its own power again. Only an episode surviving
   * ~6 s of recovery fails the engine — with the MSE engine's
   * reason string, so session records stay comparable — and
   * fail() drains the stranded PCM to the caller first.
   */
  private stallMonitor(): void {
    const heard = this.heardSec();
    const advanced = heard - this.lastHeardSec;
    this.lastHeardSec = heard;
    if (!this.ready || !this.wantPlaying || this.disposed || this.failed) {
      // Not running, or the user paused: no episode may be open.
      this.frozenTicks = 0;
      this.closeEpisode(false);
      return;
    }
    if (this.episode) {
      // Recovery is proven by the heard position moving on its
      // OWN: past where the freeze began, and past any position
      // the engine itself jumped it to (a skip is not recovery).
      const movedOnItsOwn =
        heard > this.episode.frozenHeard + 0.05 && heard > this.engineJumpHeardSec + 0.02;
      if (movedOnItsOwn && advanced > 0.0005) {
        this.closeEpisode(true);
        this.frozenTicks = 0;
        return;
      }
      if (this.tickCount - this.episode.startTick > STALL_FAIL_TICKS) {
        this.fail("element-stalled");
        return;
      }
      if (this.tickCount - this.episode.lastActionTick >= STALL_ACTION_TICKS) {
        this.episode.lastActionTick = this.tickCount;
        this.episode.actions += 1;
        this.recoverFromStall();
      }
      return;
    }
    if (advanced > 0.001) {
      this.frozenTicks = 0;
      return;
    }
    if (!this.hasUnplayedAudio()) {
      this.frozenTicks = 0;
      return;
    }
    this.frozenTicks += 1;
    if (this.frozenTicks >= STALL_OPEN_TICKS) {
      this.episode = {
        startTick: this.tickCount,
        frozenHeard: heard,
        actions: 1,
        lastActionTick: this.tickCount,
      };
      this.stallCount += 1;
      this.recoverFromStall();
    }
  }

  /** One recovery pass for the open episode, cheapest first;
   *  each pass re-derives the stall's shape, because the
   *  previous pass may have changed it. */
  private recoverFromStall(): void {
    // 1. Feed + materialize: force the encode pump; when the
    //    element is dry, force-seal the accumulated tail and
    //    start it — waiting for the regular seal target while
    //    nothing plays IS the underrun this engine must not
    //    drip through.
    this.pumpHold();
    if (!this.current) {
      this.maybeSealSegment(true);
      this.startNextSegment();
    }
    if (!this.current) return; // nothing playable yet; the next pass retries
    // 2. Dropped playing state: re-request play.
    if (this.element.paused) {
      void this.tryPlay();
      return;
    }
    // 3. Wedged mid-file: reload the same file at the frozen
    //    offset — a fresh decode of a local file is the blob
    //    analog of the MSE gap jump.
    const cur = this.current;
    if (cur.reloads < MAX_SEGMENT_RELOADS) {
      cur.reloads += 1;
      const at = this.element.currentTime;
      try {
        this.element.src = cur.url;
      } catch {
        /* ignore */
      }
      try {
        this.element.currentTime = at;
      } catch {
        /* ignore */
      }
      void this.tryPlay();
      return;
    }
    // 4. Reloads exhausted: skip the file.
    this.skipCurrentSegment();
    this.startNextSegment();
  }

  /** The session level, applied to the ELEMENT (mute + slider) —
   *  the control the hardware keys complement, not fight. */
  setLevel(level: HeardLevel): void {
    this.element.muted = level.muted;
    this.element.volume = clampPlaybackVolume(level.volume);
  }

  setPaused(paused: boolean): void {
    this.wantPlaying = !paused;
    if (paused) {
      // A user pause ends any stall episode WITHOUT counting a
      // recovery: the playhead is frozen on purpose now.
      this.closeEpisode(false);
      this.frozenTicks = 0;
      try {
        this.element.pause();
      } catch {
        /* ignore */
      }
    } else if (this.current) {
      void this.tryPlay();
    } else {
      this.startNextSegment();
    }
  }

  /** Barge-in: drop everything not yet heard. Held PCM and the
   *  unsealed segment are discarded, queued files are revoked,
   *  the playing file stops (a file cannot be trimmed from
   *  inside — stopping it IS the blob flush), and the encoder
   *  is REPLACED so nothing pre-flush can surface late; if it
   *  cannot be replaced the engine fails and the caller falls
   *  back — a flush that cannot flush must not pretend. The
   *  timeline re-anchors at the fed end (everything fed so far
   *  is in the past) and the first-segment fast seal re-arms. */
  flush(): void {
    if (this.disposed || this.failed) return;
    this.closeEpisode(false);
    this.frozenTicks = 0;
    this.holdQueue = [];
    this.pendingDurations = [];
    this.segment = freshSegment();
    for (const sealed of this.playQueue) this.revoke(sealed.url);
    this.playQueue = [];
    if (this.current) {
      this.revoke(this.current.url);
      this.current = null;
    }
    this.elementWaiting = false;
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
    this.playedBaseSec = this.fedEndSec;
    this.lastHeardSec = this.playedBaseSec;
    this.firstSegmentPending = true;
    try {
      this.encoder?.close();
    } catch {
      /* ignore */
    }
    this.encoder = null;
    if (!this.startEncoder()) this.fail("encoder-restart");
  }

  /** Playout-diag state: same shape as the MSE engine's — the
   *  terminal element's own state plus the stall counters. The
   *  terminal's identity (term=blob-element) comes from kind. */
  diagState(): { paused: boolean; readyState: number; muted: boolean; volume: number; stalls: number; recoveries: number } {
    return {
      paused: this.element.paused,
      readyState: this.element.readyState,
      muted: this.element.muted,
      volume: this.element.volume,
      stalls: this.stallCount,
      recoveries: this.recoveryCount,
    };
  }

  /** Rate witness aggregate (Publish #54): fed-vs-playhead
   *  ratios over this engine's completed files — see the
   *  witness field. Read by the caller's terminal diag. */
  rateWitness(): RateWitnessState {
    return this.witness;
  }

  dispose(): void {
    this.disposed = true;
    this.ready = false;
    if (this.pumpTimer !== null) {
      clearInterval(this.pumpTimer);
      this.pumpTimer = null;
    }
    this.holdQueue = [];
    this.pendingDurations = [];
    this.segment = freshSegment();
    this.pendingDrain = [];
    this.closeEpisode(false);
    for (const sealed of this.playQueue) this.revoke(sealed.url);
    this.playQueue = [];
    if (this.current) {
      this.revoke(this.current.url);
      this.current = null;
    }
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
  }
}
