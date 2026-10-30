import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import { SimliClient, LogLevel } from "simli-client";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { pcm24kTo16k, type VideoAvatar } from "../../supabase/functions/_shared/video-avatar";
import { startChromaKey } from "@/lib/chromaKey";

export interface SimliAvatarHandle {
  /** Resolves true once the face is on screen; false (with a visible reason) when Simli refuses or fails. */
  start: (options?: { silent?: boolean }) => Promise<boolean>;
  /** Call inside the visitor's tap: enables the paired voice of a silently prepared face. */
  activate: () => Promise<void>;
  stop: () => void;
  /** Gemini's 24 kHz PCM16 chunk, base64. */
  sendPcm24k: (base64: string) => boolean;
  clear: () => void;
  setPlaybackMuted: (muted: boolean) => void;
}
export interface SimliAvatarProps { avatar: VideoAvatar; agentId?: string; shareToken?: string; draft?: boolean; faceOverride?: string; inline?: boolean; unboxed?: boolean; onLiveChange?: (live: boolean) => void; }

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
const SimliAvatar = forwardRef<SimliAvatarHandle, SimliAvatarProps>(({ avatar, agentId, shareToken, draft, faceOverride, inline = false, unboxed = false, onLiveChange }, ref) => {
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
  const liveRef = useRef(false);
  const audioReadyRef = useRef(false);
  const lifecycleRef = useRef(0);
  const startupRejectRef = useRef<((error: Error) => void) | null>(null);
  const tokenAbortRef = useRef<AbortController | null>(null);
  const frozenFrameRef = useRef(false);
  const activatedRef = useRef(false);
  const [state, setState] = useState<"idle" | "connecting" | "live" | "failed" | "stopped">("idle");
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
    const keepFrame = unboxed && (frozenFrameRef.current || liveRef.current && keyStopRef.current !== null);
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
    if (client) void client.stop().catch(() => {});
    setReason(''); setState(keepFrame ? 'stopped' : 'idle');
  };
  useEffect(() => () => stop(), []); // eslint-disable-line react-hooks/exhaustive-deps

  useImperativeHandle(ref, () => ({
    start: async (options?: { silent?: boolean }) => {
      if (clientRef.current) return liveRef.current;
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
        unlockMediaElements(videoRef.current, audioRef.current);
        let rejectStartup: ((error: Error) => void) | undefined;
        const startupFailure = new Promise<never>((_, reject) => { rejectStartup = reject; });
        // A stop can happen while token acquisition is pending, before the race attaches.
        void startupFailure.catch(() => {});
        startupRejectRef.current = error => rejectStartup?.(error);
        const tokenAbort = new AbortController(); tokenAbortRef.current = tokenAbort;
        const { token, chromaKey } = await sessionToken({ agentId, shareToken, draft, faceId: faceOverride }, tokenAbort.signal);
        if (tokenAbortRef.current === tokenAbort) tokenAbortRef.current = null;
        if (lifecycle !== lifecycleRef.current) return false;
        const client = new SimliClient(token, videoRef.current, audioRef.current, null, LogLevel.ERROR, "livekit");
        clientRef.current = client;
        // The provider signals START then SILENT before the browser displays
        // its first frame. Audio may flow now; displayed-frame readiness is separate.
        client.on('silent', () => {
          if (clientRef.current !== client || audioReadyRef.current) return;
          audioReadyRef.current = true;
        });
        client.on("stop", () => { if (clientRef.current === client) { startupRejectRef.current?.(new Error('Video disconnected during startup')); setLive(false); setState("failed"); setReason('Video disconnected'); } });
        client.on("warning" as never, ((m: unknown) => console.warn("Simli:", m)) as never);
        client.on("error", () => { if (clientRef.current === client) { startupRejectRef.current?.(new Error('Video connection failed')); audioReadyRef.current = false; setLive(false); setState('failed'); setReason('Video connection failed'); void client.stop().catch(() => {}); } });
        let deadline: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            client.start(),
            startupFailure,
            // Stop before the SDK's first 15s retry; no hidden second paid attempt.
            new Promise<never>((_, reject) => { deadline = setTimeout(() => reject(new Error("Aspen’s video did not arrive. No greeting was played. Please retry in Chrome and check your connection.")), 12000); }),
          ]);
        } finally { if (deadline) clearTimeout(deadline); }
        if (clientRef.current !== client) return false;
        await Promise.race([startupFailure, new Promise<void>((resolve, reject) => {
          const started = performance.now();
          const check = () => {
            if (lifecycle !== lifecycleRef.current) { reject(new Error('Video startup cancelled')); return; }
            const video = videoRef.current;
            const audio = audioRef.current;
            if (video && video.readyState >= 2 && video.videoWidth > 0 && audio?.srcObject) { resolve(); return; }
            if (performance.now() - started >= 8000) { reject(new Error('Video did not arrive. Please try again.')); return; }
            requestAnimationFrame(check);
          };
          check();
        })]);
        // Cut the green backdrop out so she floats over the page like her static photo.
        if (chromaKey && canvasRef.current) { const stopFn = startChromaKey(videoRef.current, canvasRef.current); if (stopFn) { keyStopRef.current = stopFn; setKeyed(true); } }
        // Draw the first keyed frame before enabling the paired audio output.
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        if (lifecycle !== lifecycleRef.current) return false;
        // Prepared before any tap: keep the face live but silent until activate().
        if (options?.silent && !activatedRef.current) { startupRejectRef.current = null; setLive(true); setState("live"); return true; }
        if (audioRef.current) {
          audioRef.current.muted = false; audioRef.current.volume = 1;
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
      } catch (e) {
        if (lifecycle !== lifecycleRef.current) return false;
        startupRejectRef.current = null;
        if (audioRef.current) { audioRef.current.muted = true; audioRef.current.volume = 0; }
        audioReadyRef.current = false;
        stopKey();
        const client = clientRef.current; clientRef.current = null;
        if (client) void client.stop().catch(() => {});
        setLive(false); setState("failed");
        setReason(e instanceof Error ? e.message : String(e || "Video avatar could not start"));
        throw e instanceof Error ? e : new Error(String(e || 'Video connection failed'));
      }
    },
    activate: async () => {
      activatedRef.current = true;
      const audio = audioRef.current, video = videoRef.current;
      if (!audio || !video) return;
      if (!liveRef.current || !audio.srcObject) { unlockMediaElements(video, audio); return; }
      audio.muted = false; audio.volume = 1;
      try { await audio.play(); }
      catch (playError) { if (playError instanceof Error && playError.name === 'NotAllowedError') throw new Error(SOUND_BLOCKED); throw playError; }
    },
    stop,
    setPlaybackMuted: (muted) => { if (audioRef.current) { audioRef.current.muted = muted; audioRef.current.volume = muted ? 0 : 1; } },
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
      } catch { setLive(false); setState('failed'); setReason('Video audio disconnected'); return false; }
    },
    clear: () => { pendingRef.current = new Uint8Array(0); if (flushRef.current) clearTimeout(flushRef.current); flushRef.current = undefined; try { clientRef.current?.ClearBuffer(); } catch { /* Session already closed. */ } },
  }), [agentId, shareToken, draft, faceOverride]); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = state !== "idle";
  const frame = (
    <div aria-label="Video avatar" role="img" className={`${unboxed ? 'absolute inset-0' : inline ? "relative mx-auto" : `fixed z-[120] ${POSITION[avatar.position]}`} ${visible ? "" : "hidden"} ${unboxed ? '' : `overflow-hidden ${SHAPE[avatar.shape]} ${keyed ? '' : 'border-2 border-primary/50 bg-card shadow-2xl'}`}`} style={unboxed ? undefined : { width: avatar.size, height: avatar.size, maxWidth: "70vw", maxHeight: "70vw" }}>
      <video ref={videoRef} autoPlay playsInline muted className={`h-full w-full object-contain ${unboxed ? 'aspen-person-live-media' : ''} ${keyed || unboxed && state !== 'live' ? 'absolute inset-0 opacity-0 pointer-events-none' : ''}`} />
      <canvas ref={canvasRef} aria-hidden className={`h-full w-full object-contain ${unboxed ? 'aspen-person-live-media' : ''} ${keyed ? 'relative' : 'hidden'}`} />
      <audio ref={audioRef} autoPlay muted />
      {state === "connecting" && !unboxed && <div className="absolute inset-0 bg-card/70 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}
      {state === "failed" && <div role="status" className={`${unboxed ? 'absolute bottom-0 inset-x-0 rounded-md bg-background/95' : 'absolute inset-0 bg-card/90'} flex items-center justify-center p-2 text-center text-[11px] text-muted-foreground`}>{reason || "Video avatar unavailable"}</div>}
    </div>
  );
  const debugPanel = debug && visible ? createPortal(<div className="fixed left-2 top-16 z-[200] w-56 rounded-md border border-primary bg-card p-1 text-[10px] text-foreground"><canvas ref={debugCanvasRef} className="w-full bg-muted" /><p>{state} · {stats}</p></div>, document.body) : null;
  return <>{inline ? frame : createPortal(frame, document.body)}{debugPanel}</>;
});
SimliAvatar.displayName = "SimliAvatar";
export default SimliAvatar;
