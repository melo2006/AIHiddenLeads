import "@/lib/ensureWebSocketUrlString";
import { installWebSocketUrlStringShim } from "@/lib/ensureWebSocketUrlString";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import { SimliClient, LogLevel } from "simli-client";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { pcm24kTo16k, type VideoAvatar } from "../../supabase/functions/_shared/video-avatar";
import { startChromaKey, SARA_CHROMA_KEY_PROFILE } from "@/lib/chromaKey";
import { clampPlaybackVolume } from "@/lib/playbackVolume";
import { applySinkIdToElement } from "@/lib/speakerOutput";

export interface SimliAvatarHandle {
  /** Resolves true once the face is on screen; false (with a visible reason) when Simli refuses or fails.
   *  `maxAttempts` bounds the internal startup-timeout retries for THIS
   *  call (default MAX_VIDEO_ATTEMPTS): the persona pre-stage passes 1
   *  so its settle is the REAL settle of a single attempt — the old
   *  default let one start() run 30–60 s+ of invisible retries while
   *  the client's bounded watch raced it at 10 s and manufactured a
   *  false failure verdict (voice-first batch, 2026-11-10). */
  start: (options?: { silent?: boolean; maxAttempts?: number }) => Promise<boolean>;
  /** Live state query (voice-first batch, 2026-11-10): a synchronous
   *  snapshot of this instance — whether it reports live, whether a
   *  frame is actually displayed, whether a start() is in flight, and
   *  whether the last start failed. The pre-stage watch polls it
   *  (readiness becomes observable instead of a single raced promise)
   *  and the cut-over samples it so a face that came live after its
   *  readiness record was orphaned can still attach. Optional: handles
   *  predating the query simply don't answer. */
  liveness?: () => { live: boolean; displayedFrame: boolean; starting: boolean; failed: boolean };
  /** Call inside the visitor's tap: enables the paired voice of a silently prepared face.
   *  Resolves false when the face is NOT live (dead client / no audio
   *  stream) so callers can tell a silent no-op from a real activation
   *  (paired-audio guard, 2026-11-10); true once the live stream
   *  plays. (boolean | void: handles predating the signal resolve
   *  void, which callers treat as "no death reported", never as false.) */
  activate: () => Promise<boolean | void>;
  stop: () => void;
  /** Stops the session but keeps the last keyed frame on screen: the frozen
   * face covers the gap while a replacement instance mounts (avatar swap). */
  freeze?: () => void;
  /** Marks this instance as the one whose frozen frame stays visible; the
   * other instance clears its frame when IT freezes. */
  setFrameKeeper?: (keeper: boolean) => void;
  /** Planned-swap crossfade: dissolve this instance's painted frame out
   * over SWAP_CROSSFADE_MS (the incoming face dissolves in over it at
   * the same time). Purely visual — the session is already stopped by
   * freeze(); retire() afterwards clears what is left. */
  fadeOut?: () => void;
  /** Planned-swap retirement, called once the crossfade has landed:
   * stops the session AND clears any frame freeze() kept painted, so
   * the slot renders empty for its next use. */
  retire?: () => void;
  /** Persona cut-over audio sync: this instance was pre-staged SILENT
   *  (element muted, volume 0) and takes over as the audible face NOW.
   *  Applies, IN ORDER: the session's current mute state (so a visitor
   *  who muted the outgoing persona gets this one muted too), the
   *  session's selected speaker output (this instance's desired sink
   *  starts unset), then activate() — the designed unmute for a
   *  silently-started instance. Rejects with SOUND_BLOCKED when the
   *  platform refuses audible play() outside a user gesture. Resolves
   *  false when the face is NOT live (dead client / no audio stream) —
   *  the cut-over MUST abort on false while the outgoing persona's
   *  socket is still open (paired-audio guard, 2026-11-10); resolving
   *  true means a live stream was actually activated. */
  cutoverAudioSync?: (sync: { muted: boolean; deviceId: string | null; volume?: number }) => Promise<boolean>;
  /** Gemini's 24 kHz PCM16 chunk, base64. */
  sendPcm24k: (base64: string) => boolean;
  clear: () => void;
  setPlaybackMuted: (muted: boolean) => void;
  /** In-panel speaker volume (2026-11-13): the visitor's chosen level
   *  (0..1, default 1) for THIS instance's audio element. Applied at
   *  once and remembered, so every later unmute (start, activate,
   *  cut-over) restores the chosen level instead of unity — the paired
   *  Simli stream's element volume is the one lever the web platform
   *  guarantees for it (see lib/playbackVolume.ts). Mute still wins:
   *  while muted the element stays at 0 whatever the level is. */
  setPlaybackVolume?: (volume: number) => void;
  /** Speaker-output selection: retarget this element's audible stream via
   *  HTMLMediaElement.setSinkId ("" = platform default). Resolves true only
   *  when the platform actually applied it; the choice is remembered and
   *  re-applied at start()/activate() once the stream exists. */
  setOutputDevice?: (deviceId: string) => Promise<boolean>;
}
export interface SimliAvatarProps { avatar: VideoAvatar; agentId?: string; shareToken?: string; draft?: boolean; faceOverride?: string; inline?: boolean; unboxed?: boolean; onLiveChange?: (live: boolean) => void; /** Platform guide ('alex'): request the guide's fixed library face token instead of a tenant agent's face. */ guide?: "alex"; /** Persona pre-stage (avatar swap): start behind the live face — token request carries the persona selector + parent-session proof, and the element starts muted/hidden. */ persona?: "aspen" | "sara" | "alex" | "frank" | "latina" | "black-professional-lady"; personaParentSessionId?: string; personaVisitorKey?: string; /** Example presenter (Frank batch): the main face of a solo-presenter demo — token request carries the persona + the PINNED example leadId instead of a parent session (the face starts concurrently with the parent authorization); simli-avatar authorizes it against its server-known presenter map. */ personaLeadId?: string; /** Pre-stage mode: mounted and live but not shown (opacity 0, no pointer events) until the cut-over reveals it. */ concealed?: boolean; /** Stacking layer inside the shared live box during a swap: the revealing/active face sits above the retiring frozen frame. */ layer?: number; }

const POSITION: Record<VideoAvatar["position"], string> = {
  "bottom-right": "bottom-28 right-3", "bottom-left": "bottom-28 left-3", "top-right": "top-20 right-3", "top-left": "top-20 left-3",
  center: "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
};
const SHAPE: Record<VideoAvatar["shape"], string> = { circle: "rounded-full", rounded: "rounded-3xl", square: "rounded-md" };

export const SOUND_BLOCKED = "Your browser blocked Aspen’s sound. Tap play to try again.";

/** A tiny silent WAV so the audio element can play (and be unlocked) before the stream exists. */
function silentWav() {
  const samples = 800, bytes = new Uint8Array(44 + samples * 2), view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i); };
  text(0, 'RIFF'); view.setUint32(4, 36 + samples * 2, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 8000, true);
  view.setUint32(28, 16000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, samples * 2, true);
  let binary = ''; bytes.forEach(b => { binary += String.fromCharCode(b); });
  return `data:audio/wav;base64,${btoa(binary)}`;
}

/**
 * Must run synchronously within the visitor's tap. Playing each element once under
 * the gesture unlocks it, so the later provider stream may start after a slow connect.
 */
export function unlockMediaElements(video: HTMLVideoElement, audio: HTMLAudioElement) {
  const attempt = (element: HTMLMediaElement) => { try { const result = element.play?.(); if (result && typeof result.catch === 'function') result.catch(() => {}); } catch { /* Best effort. */ } };
  try {
    if (!audio.srcObject && !audio.getAttribute('src')) audio.src = silentWav();
    attempt(audio);
  } catch { /* Best effort. */ }
  try {
    let placeholder: MediaStream | null = null;
    if (!video.srcObject) {
      const canvas = document.createElement('canvas'); canvas.width = 2; canvas.height = 2;
      const capture = (canvas as HTMLCanvasElement & { captureStream?: (fps?: number) => MediaStream }).captureStream;
      if (typeof capture === 'function') { placeholder = capture.call(canvas, 1); video.srcObject = placeholder; }
    }
    attempt(video);
    // The unlock happens inside play(); drop the placeholder so readiness checks see only Simli's frames.
    if (placeholder && video.srcObject === placeholder) { video.srcObject = null; placeholder.getTracks().forEach(track => track.stop()); }
  } catch { /* Best effort. */ }
}

export const VIDEO_SLOW = "Aspen’s video is taking longer than usual to connect. Tap play to try again.";

/**
 * Bounded video-start attempts per start() call. Only a startup timeout (the provider
 * connect stalled, or no displayed frame arrived in time) is retried, always with a
 * fresh single-use token — a token is not a paid session until its stream connects.
 * Provider refusals/errors and browser sound blocks stay final, exactly as before.
 */
const MAX_VIDEO_ATTEMPTS = 3;
const videoTimeoutError = (message: string) => Object.assign(new Error(message), { videoTimeout: true });
const isVideoTimeout = (e: unknown) => (e as { videoTimeout?: boolean } | null)?.videoTimeout === true;

/**
 * Failures that mean the video itself could not start: a startup timeout (stalled
 * connect or no displayed frame) after the bounded retries, or the provider dropping
 * the session mid-startup. GeminiConversation degrades just these to a voice-only
 * call. Token refusals (4xx), SOUND_BLOCKED and cancels are NOT video-start
 * failures — they stay hard errors with no fallback.
 */
const VIDEO_START_FAILURE_MESSAGES: ReadonlySet<string> = new Set([
  'Video disconnected during startup',
  'Video connection failed',
  'Websocket Failed',
  'Connection Timed Out',
  'Too Many Retry Attempts Failed to connect',
]);
export const isVideoStartFailure = (e: unknown): boolean => {
  if (typeof e === 'string') return VIDEO_START_FAILURE_MESSAGES.has(e);
  if (!e || typeof e !== 'object') return false;
  const err = e as { videoTimeout?: unknown; message?: unknown };
  return err.videoTimeout === true || (typeof err.message === 'string' && VIDEO_START_FAILURE_MESSAGES.has(err.message));
};

/**
 * SimliClient creates both `websocketPromise` and `connectionPromise` in its constructor,
 * and rejects BOTH with the raw string `"Websocket Failed"` on `wsConnection.onerror` while
 * only awaiting `websocketPromise` first — leaving `connectionPromise` as an unhandled rejection
 * and retrying internally on an already-consumed single-use token.
 */
function disarmSimliClient(client: SimliClient | null | undefined) {
  if (!client || typeof client !== 'object') return;
  const internal = client as unknown as {
    MAX_RETRY_ATTEMPTS?: number;
    connectionPromise?: Promise<unknown>;
    connection?: { websocketPromise?: Promise<unknown> };
  };
  internal.MAX_RETRY_ATTEMPTS = 0;
  internal.connectionPromise?.catch(() => {});
  internal.connection?.websocketPromise?.catch(() => {});
}

function stopSimliClient(client: SimliClient | null | undefined) {
  if (!client) return;
  disarmSimliClient(client);
  const internal = client as unknown as { connectionTimeout?: ReturnType<typeof setTimeout> };
  if (internal.connectionTimeout) clearTimeout(internal.connectionTimeout);
  void client.stop().catch(() => {});
}

/**
 * Asks the server for a single-use video token. A token is not a paid session, so a slow
 * cold start or dropped phone request is retried once before the visitor sees an error.
 */
export async function sessionToken(body: Record<string, unknown>, cancel?: AbortSignal, attempts = 2, timeoutMs = 12000) {
  let lastError: Error = new Error(VIDEO_SLOW);
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (cancel?.aborted) throw new Error('Video startup cancelled');
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), timeoutMs);
    const onCancel = () => controller.abort();
    cancel?.addEventListener('abort', onCancel);
    try {
      const { data, error } = await supabase.functions.invoke("simli-avatar", { body: { action: "session", ...body }, signal: controller.signal });
      if (!error && data?.sessionToken) return { token: String(data.sessionToken), chromaKey: data.chromaKey === true };
      if (error instanceof FunctionsHttpError) {
        const status = error.context?.status ?? 0;
        const detail = await error.context.json().catch(() => null);
        const message = typeof detail?.error === "string" ? detail.error : VIDEO_SLOW;
        // A refusal (not enabled, access denied, bad request) will not change on retry.
        if (status > 0 && status < 500) throw Object.assign(new Error(message), { final: true });
        lastError = new Error(message);
      } else {
        lastError = new Error(VIDEO_SLOW);
      }
    } catch (e) {
      if ((e as { final?: boolean })?.final) throw e;
      lastError = new Error(VIDEO_SLOW);
    } finally {
      clearTimeout(deadline);
      cancel?.removeEventListener('abort', onCancel);
    }
    if (cancel?.aborted) throw new Error('Video startup cancelled');
  }
  throw lastError;
}

/** Owns one Simli session: the face lip-syncs Gemini's audio; Gemini remains the only conversation brain. */
const SimliAvatar = forwardRef<SimliAvatarHandle, SimliAvatarProps>(({ avatar, agentId, shareToken, draft, faceOverride, inline = false, unboxed = false, onLiveChange, guide, persona, personaParentSessionId, personaVisitorKey, personaLeadId, concealed = false, layer }, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keyStopRef = useRef<(() => void) | null>(null);
  const [keyed, setKeyed] = useState(false);
  const pendingRef = useRef<Uint8Array>(new Uint8Array(0));
  const flushRef = useRef<ReturnType<typeof setTimeout>>();
  const sentBytesRef = useRef(0);
  const flushAudio = (client: SimliClient) => { const data = pendingRef.current; pendingRef.current = new Uint8Array(0); if (data.length) { client.sendAudioData(data); sentBytesRef.current += data.length; } };
  // ?avatarDebug=1 shows Simli's raw frame and counters so device tests can report what actually arrives.
  const debug = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('avatarDebug');
  const [stats, setStats] = useState('');
  useEffect(() => {
    if (!debug) return;
    const id = window.setInterval(() => {
      const v = videoRef.current as (HTMLVideoElement & { getVideoPlaybackQuality?: () => { totalVideoFrames: number } }) | null;
      setStats(v ? `${v.videoWidth}x${v.videoHeight} · frames ${v.getVideoPlaybackQuality?.().totalVideoFrames ?? '?'} · t ${v.currentTime.toFixed(1)}s · sent ${(sentBytesRef.current / 32000).toFixed(1)}s audio` : 'no video');
    }, 500);
    return () => window.clearInterval(id);
  }, [debug]);
  const debugCanvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!debug) return;
    let raf = 0;
    const tick = () => { const v = videoRef.current, c = debugCanvasRef.current; if (v && c && v.videoWidth) { c.width = v.videoWidth; c.height = v.videoHeight; c.getContext('2d')?.drawImage(v, 0, 0); } raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [debug]);
  const clientRef = useRef<SimliClient | null>(null);
  const startingRef = useRef(false);
  /** Mirror of the last start()'s failure verdict for the liveness()
   *  query (React state would be stale inside the handle closure). */
  const startFailedRef = useRef(false);
  const liveRef = useRef(false);
  const audioReadyRef = useRef(false);
  const lifecycleRef = useRef(0);
  const startupRejectRef = useRef<((error: Error) => void) | null>(null);
  const tokenAbortRef = useRef<AbortController | null>(null);
  const frozenFrameRef = useRef(false);
  const frameKeeperRef = useRef(true);
  const activatedRef = useRef(false);
  const playbackMutedRef = useRef(false);
  // In-panel speaker volume for this instance (0..1, default unity);
  // owned by GeminiConversation, pushed via setPlaybackVolume and the
  // cut-over sync. Every unmute applies THIS level, never a hardcoded 1.
  const playbackVolumeRef = useRef(1);
  const applyPlaybackLevel = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = playbackMutedRef.current;
    audio.volume = playbackMutedRef.current ? 0 : playbackVolumeRef.current;
  };
  // Speaker-output selection (session-scoped, owned by GeminiConversation):
  // undefined = no preference stated; a string ("" = platform default) is
  // applied to the audio element now and again when the stream (re)starts.
  const desiredSinkIdRef = useRef<string | undefined>(undefined);
  const applyDesiredSink = async (): Promise<boolean> => {
    if (desiredSinkIdRef.current === undefined) return false;
    return applySinkIdToElement(audioRef.current, desiredSinkIdRef.current);
  };
  const [state, setState] = useState<"idle" | "connecting" | "live" | "failed" | "stopped">("idle");
  // Planned-swap crossfade: once fadeOut() lands, the painted (frozen)
  // frame dissolves away over the same 300ms the incoming face uses to
  // dissolve in. Reset by start() and retire().
  const [fadedOut, setFadedOut] = useState(false);
  const [reason, setReason] = useState("");
  const setLive = (live: boolean) => { liveRef.current = live; onLiveChange?.(live); };

  const stopKey = () => { keyStopRef.current?.(); keyStopRef.current = null; frozenFrameRef.current = false; setKeyed(false); };
  const stop = () => {
    lifecycleRef.current++;
    activatedRef.current = false;
    startupRejectRef.current?.(new Error('Video startup cancelled'));
    startupRejectRef.current = null;
    tokenAbortRef.current?.abort(); tokenAbortRef.current = null;
    if (audioRef.current) { audioRef.current.muted = true; audioRef.current.volume = 0; }
    const keepFrame = unboxed && frameKeeperRef.current && (frozenFrameRef.current || liveRef.current && keyStopRef.current !== null);
    frozenFrameRef.current = keepFrame;
    keyStopRef.current?.(); keyStopRef.current = null;
    if (!keepFrame) setKeyed(false);
    liveRef.current = false;
    audioReadyRef.current = false;
    onLiveChange?.(keepFrame);
    pendingRef.current = new Uint8Array(0);
    if (flushRef.current) clearTimeout(flushRef.current);
    flushRef.current = undefined;
    const client = clientRef.current; clientRef.current = null;
    stopSimliClient(client);
    setFadedOut(false);
    setReason(''); setState(keepFrame ? 'stopped' : 'idle');
  };
  useEffect(() => () => stop(), []); // eslint-disable-line react-hooks/exhaustive-deps

  useImperativeHandle(ref, () => ({
    liveness: () => ({
      live: liveRef.current,
      displayedFrame: !!(videoRef.current && videoRef.current.readyState >= 2 && videoRef.current.videoWidth > 0),
      starting: startingRef.current,
      failed: startFailedRef.current,
    }),
    start: async (options?: { silent?: boolean; maxAttempts?: number }) => {
      if (clientRef.current) {
        if (liveRef.current) return true;
        if (startingRef.current) return liveRef.current;
        // A provider 'stop'/'error' leaves its client behind with live=false; tear the
        // stale client down so this call can make a fresh attempt instead of giving up.
        const stale = clientRef.current; clientRef.current = null;
        stopSimliClient(stale);
      }
      startingRef.current = true;
      startFailedRef.current = false;
      const lifecycle = ++lifecycleRef.current;
      setState("connecting"); setReason("");
      try {
        // Wait one frame so the portal's video/audio elements exist.
        await new Promise((r) => requestAnimationFrame(r));
        if (!videoRef.current || !audioRef.current) throw new Error("Avatar view is not ready");
        // Stay silent until a displayed frame exists. Then this paired stream
        // is the ONLY audible output for video calls, using Gemini-generated PCM.
        audioRef.current.defaultMuted = true;
        audioRef.current.muted = true;
        audioRef.current.volume = 0;
        // Still inside the visitor's tap: unlock both elements now. Phones and in-app
        // browsers refuse play() once the tap is a few seconds old (video startup is slower).
        // The unlock happens once here; retries below reuse the already-unlocked elements
        // and never need a second tap.
        unlockMediaElements(videoRef.current, audioRef.current);
        // A speaker-output choice made before this attempt should already
        // govern the element; re-apply again once the stream exists below.
        void applyDesiredSink();

        // One video attempt: fresh single-use token, provider connect, displayed-frame
        // check, then the paired-audio unlock. Throws on failure; startup timeouts are
        // tagged (videoTimeout) so start() can retry just those with a fresh token.
        const runAttempt = async (attemptIndex: number): Promise<boolean> => {
        let rejectStartup: ((error: Error) => void) | undefined;
        const startupFailure = new Promise<never>((_, reject) => { rejectStartup = reject; });
        // A stop can happen while token acquisition is pending, before the race attaches.
        void startupFailure.catch(() => {});
        startupRejectRef.current = error => rejectStartup?.(error);
        const tokenAbort = new AbortController(); tokenAbortRef.current = tokenAbort;
        const tokenBody = persona
          ? personaLeadId
            ? { persona, leadId: personaLeadId }
            : { persona, parentSessionId: personaParentSessionId, visitorKey: personaVisitorKey }
          : { agentId, shareToken, draft, faceId: faceOverride, guide };
        const { token, chromaKey } = attemptIndex === 0
          ? await sessionToken(tokenBody, tokenAbort.signal)
          : await sessionToken(tokenBody, tokenAbort.signal, 1, 8000);
        if (tokenAbortRef.current === tokenAbort) tokenAbortRef.current = null;
        if (lifecycle !== lifecycleRef.current) return false;
        installWebSocketUrlStringShim();
        const client = new SimliClient(token, videoRef.current, audioRef.current, null, LogLevel.ERROR, "livekit");
        disarmSimliClient(client);
        clientRef.current = client;
        // The provider signals START then SILENT before the browser displays
        // its first frame. Audio may flow now; displayed-frame readiness is separate.
        client.on('silent', () => {
          if (clientRef.current !== client || audioReadyRef.current) return;
          audioReadyRef.current = true;
        });
        client.on("stop", () => { if (clientRef.current === client) { startupRejectRef.current?.(new Error('Video disconnected during startup')); stopKey(); setLive(false); startFailedRef.current = true; setState("failed"); setReason('Video disconnected'); } });
        client.on("warning" as never, ((m: unknown) => console.warn("Simli:", m)) as never);
        client.on("error", () => { if (clientRef.current === client) { startupRejectRef.current?.(new Error('Video connection failed')); audioReadyRef.current = false; stopKey(); setLive(false); startFailedRef.current = true; setState('failed'); setReason('Video connection failed'); stopSimliClient(client); } });
        let deadline: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            client.start().catch((err: unknown) => {
              const msg = err instanceof Error ? err.message : String(err || '');
              if (msg === 'Websocket Failed' || msg === 'Connection Timed Out' || msg === 'Too Many Retry Attempts Failed to connect') {
                throw videoTimeoutError('Video connection failed');
              }
              throw err instanceof Error ? err : new Error(msg || 'Video connection failed');
            }),
            startupFailure,
            // Cap each attempt before the SDK's own 15s retry cycle; a stall here is
            // tagged so start() can retry the whole attempt on a fresh token.
            new Promise<never>((_, reject) => { deadline = setTimeout(() => reject(videoTimeoutError("Aspen’s video did not arrive. No greeting was played. Please retry in Chrome and check your connection.")), attemptIndex === 0 ? 12000 : 8000); }),
          ]);
        } finally { if (deadline) clearTimeout(deadline); }
        if (clientRef.current !== client) return false;
        await Promise.race([startupFailure, new Promise<void>((resolve, reject) => {
          const started = performance.now();
          const frameTimeout = attemptIndex === 0 ? 8000 : 5000;
          const check = () => {
            if (lifecycle !== lifecycleRef.current) { reject(new Error('Video startup cancelled')); return; }
            const video = videoRef.current;
            const audio = audioRef.current;
            if (video && video.readyState >= 2 && video.videoWidth > 0 && audio?.srcObject) { resolve(); return; }
            if (performance.now() - started >= frameTimeout) { reject(videoTimeoutError('Video did not arrive. Please try again.')); return; }
            requestAnimationFrame(check);
          };
          check();
        })]);
        // Cut the green backdrop out so she floats over the page like her static photo.
        // Sara's stream keys with her own profile (pale halo/fringing on her
        // source frames — see SARA_CHROMA_KEY_PROFILE); everyone else defaults.
        if (chromaKey && canvasRef.current) { const stopFn = startChromaKey(videoRef.current, canvasRef.current, persona === 'sara' ? SARA_CHROMA_KEY_PROFILE : undefined); if (stopFn) { keyStopRef.current = stopFn; setKeyed(true); } }
        // Draw the first keyed frame before enabling the paired audio output.
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        if (lifecycle !== lifecycleRef.current) return false;
        // Prepared before any tap: keep the face live but silent until activate().
        if (options?.silent && !activatedRef.current) { startupRejectRef.current = null; setLive(true); setState("live"); return true; }
        if (audioRef.current) {
          applyPlaybackLevel();
          await applyDesiredSink();
          try { await audioRef.current.play(); }
          catch (playError) {
            // Not a microphone problem: the browser blocked the speaker for this tap.
            if (playError instanceof Error && playError.name === 'NotAllowedError') throw new Error(SOUND_BLOCKED);
            throw playError;
          }
        }
        startupRejectRef.current = null;
        setLive(true); setState("live");
        return true;
        };

        // Bounded retry: only a startup timeout (stalled connect, or the video track
        // never became a displayed frame) earns another attempt, on a fresh token.
        // Anything else — a provider refusal/error, a sound block, a cancel — is final
        // and lands in the same failure teardown a single attempt always produced.
        // The caller may cap the attempts (the persona pre-stage passes 1:
        // its watch loop owns any re-kick, visibly, instead of retries
        // burning single-use tokens invisibly inside one start() call).
        const maxAttempts = Math.max(1, Math.min(MAX_VIDEO_ATTEMPTS, options?.maxAttempts ?? MAX_VIDEO_ATTEMPTS));
        let lastError: Error = new Error('Video did not arrive. Please try again.');
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          if (attempt > 0) {
            // Brief pause before the fresh token; a stop during it cancels the retry.
            await new Promise(r => setTimeout(r, 600));
            if (lifecycle !== lifecycleRef.current) return false;
            setState("connecting"); setReason("");
          }
          try {
            return await runAttempt(attempt);
          } catch (e) {
            if (lifecycle !== lifecycleRef.current) return false;
            lastError = e instanceof Error ? e : new Error(String(e || 'Video connection failed'));
            // Tear this attempt's client down first; a retry needs a clean element pair.
            if (audioRef.current) { audioRef.current.muted = true; audioRef.current.volume = 0; }
            audioReadyRef.current = false;
            stopKey();
            const failedClient = clientRef.current; clientRef.current = null;
            stopSimliClient(failedClient);
            if (!isVideoTimeout(e)) throw lastError;
          }
        }
        throw lastError;
      } catch (e) {
        if (lifecycle !== lifecycleRef.current) return false;
        startupRejectRef.current = null;
        if (audioRef.current) { audioRef.current.muted = true; audioRef.current.volume = 0; }
        audioReadyRef.current = false;
        stopKey();
        const client = clientRef.current; clientRef.current = null;
        stopSimliClient(client);
        setLive(false); startFailedRef.current = true; setState("failed");
        setReason(e instanceof Error ? e.message : String(e || "Video avatar could not start"));
        throw e instanceof Error ? e : new Error(String(e || 'Video connection failed'));
      } finally {
        startingRef.current = false;
      }
    },
    activate: async () => {
      activatedRef.current = true;
      const audio = audioRef.current, video = videoRef.current;
      if (!audio || !video) return false;
      if (!liveRef.current || !audio.srcObject) { unlockMediaElements(video, audio); return false; }
      applyPlaybackLevel();
      await applyDesiredSink();
      try { await audio.play(); }
      catch (playError) { if (playError instanceof Error && playError.name === 'NotAllowedError') throw new Error(SOUND_BLOCKED); throw playError; }
      return true;
    },
    stop,
    freeze: () => {
      // Avatar-swap cover: end this persona's Simli session but leave the
      // last keyed frame painted (unboxed stop() semantics) so the visitor
      // keeps seeing a face while the incoming instance reveals itself.
      frozenFrameRef.current = true;
      stop();
    },
    setFrameKeeper: (keeper: boolean) => { frameKeeperRef.current = keeper; },
    fadeOut: () => { setFadedOut(true); },
    retire: () => {
      // Crossfade landed: clear the frozen frame freeze() kept painted
      // and leave the slot empty (stop() with keeper off clears keyed).
      frameKeeperRef.current = false;
      stop();
    },
    setPlaybackMuted: (muted) => { playbackMutedRef.current = muted; applyPlaybackLevel(); },
    setPlaybackVolume: (volume) => { playbackVolumeRef.current = clampPlaybackVolume(volume); applyPlaybackLevel(); },
    cutoverAudioSync: async ({ muted, deviceId, volume }) => {
      // Order is the contract: mute-sync first (activate() applies
      // playbackMutedRef to the element), speaker routing next (so the
      // stream lands on the visitor's chosen output), activate() last
      // (the only unmute door for a silently pre-staged instance — a
      // start() re-call would early-return on the live client).
      playbackMutedRef.current = muted;
      if (typeof volume === 'number') playbackVolumeRef.current = clampPlaybackVolume(volume);
      applyPlaybackLevel();
      if (deviceId) { desiredSinkIdRef.current = deviceId; await applyDesiredSink(); }
      activatedRef.current = true;
      const audio = audioRef.current, video = videoRef.current;
      if (!audio || !video) return false;
      // Paired-audio guard (2026-11-10): a dead face used to no-op
      // SILENTLY here, so the swap completed onto a face that could
      // never speak and the first PCM chunk killed the segment call.
      // Report not-live honestly — the caller aborts the cut-over
      // BEFORE the outgoing socket closes.
      if (!liveRef.current || !audio.srcObject) { unlockMediaElements(video, audio); return false; }
      applyPlaybackLevel();
      await applyDesiredSink();
      try { await audio.play(); }
      catch (playError) { if (playError instanceof Error && playError.name === 'NotAllowedError') throw new Error(SOUND_BLOCKED); throw playError; }
      return true;
    },
    setOutputDevice: async (deviceId) => { desiredSinkIdRef.current = deviceId; return applyDesiredSink(); },
    sendPcm24k: (base64) => {
      const client = clientRef.current;
      if (!client || !(audioReadyRef.current || liveRef.current)) return false;
      const bin = atob(base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const pcm = new Uint8Array(pcm24kTo16k(new Int16Array(bytes.buffer, 0, Math.floor(bytes.length / 2))).buffer);
      // Simli lip-syncs best with ~6000-byte PCM16 chunks; Gemini sends much smaller ones, so batch briefly.
      const pending = pendingRef.current;
      const merged = new Uint8Array(pending.length + pcm.length); merged.set(pending); merged.set(pcm, pending.length);
      pendingRef.current = merged;
      try {
        if (merged.length >= 6000) {
          if (flushRef.current) clearTimeout(flushRef.current);
          flushRef.current = undefined;
          flushAudio(client);
        } else if (!flushRef.current) flushRef.current = setTimeout(() => { flushRef.current = undefined; try { if (clientRef.current === client) flushAudio(client); } catch { /* Session closed. */ } }, 80);
        return true;
      } catch { stopKey(); setLive(false); setState('failed'); setReason('Video audio disconnected'); return false; }
    },
    clear: () => { pendingRef.current = new Uint8Array(0); if (flushRef.current) clearTimeout(flushRef.current); flushRef.current = undefined; try { clientRef.current?.ClearBuffer(); } catch { /* Session already closed. */ } },
  }), [agentId, shareToken, draft, faceOverride, persona, personaParentSessionId, personaVisitorKey, guide]); // eslint-disable-line react-hooks/exhaustive-deps
  // NOTE: persona props are handle deps on purpose — a face slot's
  // mounted instance is REUSED across personas (the main slot hosts the
  // standard face first, a persona segment after a swap), and start()
  // reads the persona selector from this closure; without the dep the
  // reused instance would request the wrong face's token.

  const visible = state !== "idle";
  // Planned-swap crossfade (owner transition spec): opacity is style-
  // driven so a concealed pre-stage dissolves IN and a frozen outgoing
  // frame dissolves OUT over the same 300ms (SWAP_CROSSFADE_MS in
  // src/lib/personaSwap.ts) — the widget frame, controls and captions
  // around the face never move; only the portrait area changes.
  const faceOpacity = concealed || fadedOut ? 0 : 1;
  const frame = (
    <div aria-label="Video avatar" role="img" className={`${unboxed ? 'absolute inset-0' : inline ? "relative mx-auto" : `fixed z-[120] ${POSITION[avatar.position]}`} ${visible ? "" : "hidden"} ${concealed ? 'pointer-events-none' : ''} ${unboxed ? '' : `overflow-hidden ${SHAPE[avatar.shape]} ${keyed ? '' : 'border-2 border-primary/50 bg-card shadow-2xl'}`}`} style={{ opacity: faceOpacity, transition: 'opacity 300ms ease-in-out', ...(layer !== undefined ? { zIndex: layer } : {}), ...(unboxed ? {} : { width: avatar.size, height: avatar.size, maxWidth: "70vw", maxHeight: "70vw" }) }}>
      <video ref={videoRef} autoPlay playsInline muted className={`h-full w-full ${unboxed ? 'object-cover object-top aspen-person-live-media' : 'object-contain'} ${keyed || unboxed && state !== 'live' ? 'absolute inset-0 opacity-0 pointer-events-none' : ''}`} />
      <canvas ref={canvasRef} aria-hidden className={`h-full w-full ${unboxed ? 'object-cover object-top aspen-person-live-media' : 'object-contain'} ${keyed ? 'relative' : 'hidden'}`} />
      <audio ref={audioRef} autoPlay muted />
      {state === "connecting" && !unboxed && !concealed && <div className="absolute inset-0 bg-card/70 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}
      {state === "failed" && <div role="status" className={unboxed || concealed ? 'sr-only' : 'absolute inset-0 bg-card/90 flex items-center justify-center p-2 text-center text-[11px] text-muted-foreground'}>{reason || "Video avatar unavailable"}</div>}
    </div>
  );
  const debugPanel = debug && visible ? createPortal(<div className="fixed left-2 top-16 z-[200] w-56 rounded-md border border-primary bg-card p-1 text-[10px] text-foreground"><canvas ref={debugCanvasRef} className="w-full bg-muted" /><p>{state} · {stats}</p></div>, document.body) : null;
  return <>{inline ? frame : createPortal(frame, document.body)}{debugPanel}</>;
});
SimliAvatar.displayName = "SimliAvatar";
export default SimliAvatar;
