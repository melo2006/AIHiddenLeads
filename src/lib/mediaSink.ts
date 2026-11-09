// Media-routed playback for Gemini's locally rendered voice.
//
// Why: on Android Chrome, while a getUserMedia capture / WebRTC session
// is active, the device runs in a voice-communication audio mode and
// WebAudio output sent straight to ctx.destination is classified with
// the call channel — the hardware volume buttons then drive a different
// stream's UI and appear to do nothing for her voice (a documented
// Chrome/Android stream mismatch). Playing the same graph through an
// HTMLAudioElement (fed by a MediaStreamDestination) is MEDIA playback,
// the channel the hardware media volume governs. No app-side gain is
// applied on this path beyond the speaker-mute toggle (0 / unity).
//
// Safety: the sink reports `ready` only after the element's play() has
// actually resolved. Until then callers keep using ctx.destination —
// today's behaviour — so a blocked element can never silence a call;
// once ready, later chunks route through the element.

export interface MediaSink {
  /** The MediaStreamDestination node the graph should connect to. */
  node: AudioNode;
  element: HTMLAudioElement;
  /** True once the element is actually playing. */
  readonly ready: boolean;
  /** Attempt to start the element; resolves quietly when blocked. */
  play: () => Promise<void>;
  dispose: () => void;
}

export function createMediaSink(ctx: AudioContext): MediaSink | null {
  if (typeof ctx.createMediaStreamDestination !== "function") return null;
  if (typeof document === "undefined") return null;
  let destination: MediaStreamAudioDestinationNode;
  try {
    destination = ctx.createMediaStreamDestination();
  } catch {
    return null;
  }
  const element = document.createElement("audio");
  element.autoplay = true;
  element.srcObject = destination.stream;
  let ready = false;
  return {
    node: destination,
    element,
    get ready() {
      return ready;
    },
    play: async () => {
      try {
        await element.play();
        ready = true;
      } catch {
        /* Blocked (autoplay policy): stays not-ready, caller keeps the
           destination fallback and retries on the next chunk. */
      }
    },
    dispose: () => {
      try {
        element.pause();
      } catch {
        /* ignore */
      }
      element.srcObject = null;
    },
  };
}

/** The node audible output should connect to: the media sink once it is
 *  playing, otherwise the context destination (pre-fix behaviour). */
export function mediaPlaybackNode(ctx: AudioContext, sink: MediaSink | null): AudioNode {
  return sink && sink.ready ? sink.node : ctx.destination;
}
