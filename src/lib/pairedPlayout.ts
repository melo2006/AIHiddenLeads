/**
 * Paired-stream playout routing — the hardware-volume root fix for the
 * moving-avatar (Simli / LiveKit) path.
 *
 * The defect (Ron's Z Fold, Android Chrome; reported 2026-11-09,
 * 2026-11-13 and again 2026-11-14): while the persona speaks through
 * the PHONE SPEAKER, the hardware volume keys do nothing — she stays
 * full blast. The paired stream is a WebRTC remote stream that
 * LiveKit attaches straight to an <audio> element while getUserMedia
 * capture is live. In that state Android classifies WebRTC playout
 * with the voice-communication channel, so the volume keys drive a
 * stream the sound is not riding. (The in-panel slider added
 * 2026-11-13 could only scale that element's .volume — it never
 * changed the classification, so it could never restore the keys.
 * The media-sink test file records the same conclusion: "a WebRTC
 * element whose stream class page code cannot choose".)
 *
 * The local voice-only path had the identical disease and was cured
 * in 2026-11-09 by re-originating playout through WebAudio into a
 * plain media element (see mediaSink.ts): an HTMLAudioElement fed by
 * a MediaStreamDestination IS media playback, and the hardware media
 * volume governs it. This module gives the paired path the same
 * treatment: the remote stream is tapped with
 * createMediaStreamSource, levelled by a gain node (the in-panel
 * slider + speaker mute live there now), and re-emitted through a
 * MediaStreamDestination into OUR plain <audio> element.
 *
 * Safety rules (sound first, routing second):
 *  - Simli's own element keeps playing the WebRTC stream the whole
 *    time — lip-sync, the caption clock and LiveKit's track flow all
 *    depend on it, and a MediaStreamSource tap can starve in Chrome
 *    if the stream is not also rendering to an element.
 *  - The direct element is silenced ONLY after the tap is confirmed
 *    playing (context running + playout element unpaused + source
 *    element still rendering). On any failure the direct element
 *    path keeps carrying the sound exactly as before this module
 *    existed — the tap can never make a working session quieter.
 *  - While tapped, the source element is held at volume 0 with
 *    muted=false: volume 0 keeps the stream "rendering" for the tap
 *    (a muted element may stop rendering in some Chrome versions)
 *    while the audible output rides the media-classified element.
 *  - The gain is a TRIM under the device volume (default unity,
 *    never above 1): it scales what the hardware keys then govern.
 *    It cannot fight them — exactly the relationship the local
 *    path's per-chunk gain has with the media sink.
 */
import { clampPlaybackVolume } from "@/lib/playbackVolume";
import { applySinkIdToElement } from "@/lib/speakerOutput";

export interface PairedPlaybackLevel {
  muted: boolean;
  volume: number;
}

/** The gain a level maps to: mute wins, otherwise the clamped trim. */
export const pairedGainValue = (level: PairedPlaybackLevel): number =>
  level.muted ? 0 : clampPlaybackVolume(level.volume);

/**
 * Is sound actually armed — the level asks for sound AND the element
 * that carries it is playing? In tap mode BOTH elements must be
 * playing (the playout element produces the sound; the source element
 * must keep rendering or the tap starves). In direct mode the source
 * element alone decides. A user-chosen mute/zero level is "not armed"
 * by definition — callers that surface a "tap for sound" affordance
 * must separately respect the visitor's own mute.
 */
export const pairedSoundAudible = (input: {
  level: PairedPlaybackLevel;
  engaged: boolean;
  sourcePaused: boolean;
  playoutPaused: boolean;
}): boolean => {
  if (pairedGainValue(input.level) <= 0) return false;
  if (input.engaged) return !input.playoutPaused && !input.sourcePaused;
  return !input.sourcePaused;
};

export type PairedContextFactory = () => AudioContext | null;

export const defaultPairedContextFactory: PairedContextFactory = () => {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    return Ctor ? new Ctor() : null;
  } catch {
    return null;
  }
};

export class PairedPlayout {
  private ctx: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private destinationNode: MediaStreamAudioDestinationNode | null = null;
  private tappedStream: MediaStream | null = null;
  /** True while the audible output rides the media playout element. */
  engaged = false;

  constructor(private readonly createContext: PairedContextFactory = defaultPairedContextFactory) {}

  private ensureContext(): AudioContext | null {
    if (this.ctx && this.ctx.state !== "closed") return this.ctx;
    this.ctx = this.createContext();
    return this.ctx;
  }

  /** Resume the tap context (call from gesture-adjacent code). */
  async resume(): Promise<boolean> {
    const ctx = this.ensureContext();
    if (!ctx) return false;
    // Read through an accessor: resume() settles asynchronously, so a
    // state captured before the await is not the state after it.
    const stateNow = () => ctx.state;
    if (stateNow() === "running") return true;
    try {
      await ctx.resume();
    } catch {
      /* the state check below is the verdict */
    }
    return stateNow() === "running";
  }

  /**
   * Route the source element's WebRTC stream through WebAudio into
   * the playout element. Resolves true when the tap is engaged and
   * playing. On any failure the direct element path is left exactly
   * as it was — the caller keeps (or restores) direct playout.
   */
  async engage(
    source: HTMLAudioElement,
    playout: HTMLAudioElement,
    level: PairedPlaybackLevel,
  ): Promise<boolean> {
    try {
      const stream = (source.srcObject as MediaStream | null) ?? null;
      if (!stream || typeof stream.getAudioTracks !== "function" || stream.getAudioTracks().length === 0) {
        return this.engaged;
      }
      if (this.engaged && this.tappedStream === stream) {
        // Already tapped on this stream: just make sure both elements
        // are still rendering/playing (a browser pause starves or
        // silences the tap without any error surfacing).
        if (playout.paused) await playout.play();
        if (source.paused) await source.play();
        return !playout.paused && !source.paused;
      }
      const ctx = this.ensureContext();
      if (
        !ctx ||
        typeof ctx.createMediaStreamSource !== "function" ||
        typeof ctx.createMediaStreamDestination !== "function" ||
        typeof ctx.createGain !== "function"
      ) {
        return false;
      }
      const stateNow = () => ctx.state;
      if (stateNow() !== "running") {
        try {
          await ctx.resume();
        } catch {
          /* verdict below */
        }
      }
      // A suspended context renders silence — engaging now would take
      // a working direct path down. Stay direct; a later gesture
      // (activate, unmute, slider) retries the tap.
      if (stateNow() !== "running") return false;
      if (!this.gainNode || !this.destinationNode) {
        this.gainNode = ctx.createGain();
        this.destinationNode = ctx.createMediaStreamDestination();
        this.gainNode.connect(this.destinationNode);
      }
      if (this.sourceNode) {
        try {
          this.sourceNode.disconnect();
        } catch {
          /* already disconnected */
        }
        this.sourceNode = null;
      }
      this.sourceNode = ctx.createMediaStreamSource(stream);
      this.sourceNode.connect(this.gainNode);
      this.gainNode.gain.value = pairedGainValue(level);
      if (playout.srcObject !== this.destinationNode.stream) {
        playout.srcObject = this.destinationNode.stream;
      }
      await playout.play();
      if (playout.paused) return false;
      if (source.paused) {
        // The tap needs the source stream rendering; an element the
        // browser refuses to play starves it. Stay direct instead.
        try {
          await source.play();
        } catch {
          /* verdict below */
        }
      }
      if (source.paused) return false;
      // Playout confirmed on the media element: silence the direct
      // element WITHOUT muting it (see the module header).
      source.muted = false;
      source.volume = 0;
      this.tappedStream = stream;
      this.engaged = true;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Apply the session playback level to whichever path is audible:
   * the tap gain while engaged (the source element stays pinned at
   * volume 0), the source element's own props otherwise — the exact
   * pre-tap behavior.
   */
  applyLevel(source: HTMLAudioElement, level: PairedPlaybackLevel): void {
    if (this.engaged && this.gainNode) {
      this.gainNode.gain.value = pairedGainValue(level);
      source.muted = false;
      source.volume = 0;
      return;
    }
    source.muted = level.muted;
    source.volume = level.muted ? 0 : clampPlaybackVolume(level.volume);
  }

  /**
   * Route the selected speaker output to the tap: the playout element
   * is the audible one in tap mode, and the tap context accepts a
   * sink on Chromium desktops that expose AudioContext.setSinkId.
   * Android exposes neither — the OS media route (speaker/Bluetooth)
   * applies there, which is what the hardware keys govern.
   */
  async applySink(playout: HTMLAudioElement | null, sinkId: string): Promise<boolean> {
    let applied = false;
    if (playout) applied = (await applySinkIdToElement(playout, sinkId)) || applied;
    const ctx = this.ctx as (AudioContext & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (ctx && typeof ctx.setSinkId === "function") {
      try {
        await ctx.setSinkId(sinkId);
        applied = true;
      } catch {
        /* unsupported sink — the element result stands */
      }
    }
    return applied;
  }

  /** Tear the tap down (instance stop): the elements return to the
   *  direct path's ownership; the context is released. */
  release(playout: HTMLAudioElement | null): void {
    this.engaged = false;
    this.tappedStream = null;
    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {
        /* already disconnected */
      }
      this.sourceNode = null;
    }
    if (playout) {
      try {
        playout.pause();
      } catch {
        /* element already gone */
      }
      playout.srcObject = null;
    }
    if (this.ctx && this.ctx.state !== "closed") {
      void this.ctx.close().catch(() => {});
    }
    this.ctx = null;
    this.gainNode = null;
    this.destinationNode = null;
  }
}
