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
  start: () => Promise<boolean>;
  stop: () => void;
  /** Gemini's 24 kHz PCM16 chunk, base64. */
  sendPcm24k: (base64: string) => boolean;
  clear: () => void;
}
export interface SimliAvatarProps { avatar: VideoAvatar; agentId?: string; shareToken?: string; draft?: boolean; faceOverride?: string; inline?: boolean; unboxed?: boolean; onLiveChange?: (live: boolean) => void; }

const POSITION: Record<VideoAvatar["position"], string> = {
  "bottom-right": "bottom-28 right-3", "bottom-left": "bottom-28 left-3", "top-right": "top-20 right-3", "top-left": "top-20 left-3",
  center: "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
};
const SHAPE: Record<VideoAvatar["shape"], string> = { circle: "rounded-full", rounded: "rounded-3xl", square: "rounded-md" };

async function sessionToken(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("simli-avatar", { body: { action: "session", ...body } });
  if (error) {
    const detail = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null;
    throw new Error(typeof detail?.error === "string" ? detail.error : "Video avatar unavailable");
  }
  return { token: String(data.sessionToken), chromaKey: data.chromaKey === true };
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
  const frozenFrameRef = useRef(false);
  const [state, setState] = useState<"idle" | "connecting" | "live" | "failed" | "stopped">("idle");
  const [reason, setReason] = useState("");
  const setLive = (live: boolean) => { liveRef.current = live; onLiveChange?.(live); };

  const stopKey = () => { keyStopRef.current?.(); keyStopRef.current = null; frozenFrameRef.current = false; setKeyed(false); };
  const stop = () => {
    lifecycleRef.current++;
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
    start: async () => {
      if (clientRef.current) return liveRef.current;
      const lifecycle = ++lifecycleRef.current;
      setState("connecting"); setReason("");
      try {
        // Wait one frame so the portal's video/audio elements exist.
        await new Promise((r) => requestAnimationFrame(r));
        if (!videoRef.current || !audioRef.current) throw new Error("Avatar view is not ready");
        // LiveKit resets `muted` when attaching its audio track. Volume must also
        // be zero before attachment: Gemini is the sole audible voice owner.
        audioRef.current.defaultMuted = true;
        audioRef.current.muted = true;
        audioRef.current.volume = 0;
        const { token, chromaKey } = await sessionToken({ agentId, shareToken, draft, faceId: faceOverride });
        if (lifecycle !== lifecycleRef.current) return false;
        const client = new SimliClient(token, videoRef.current, audioRef.current, null, LogLevel.ERROR, "livekit");
        clientRef.current = client;
        // The provider signals START then SILENT before the browser displays
        // its first frame. Audio may flow now; displayed-frame readiness is separate.
        client.on('silent', () => {
          if (clientRef.current !== client || audioReadyRef.current) return;
          audioReadyRef.current = true;
        });
        client.on("stop", () => { if (clientRef.current === client) { clientRef.current = null; setLive(false); setState("failed"); setReason('Video disconnected'); } });
        client.on("warning" as never, ((m: unknown) => console.warn("Simli:", m)) as never);
        client.on("error", () => { if (clientRef.current === client) { clientRef.current = null; audioReadyRef.current = false; setLive(false); setState('failed'); setReason('Video connection failed'); void client.stop().catch(() => {}); } });
        let deadline: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            client.start(),
            new Promise<never>((_, reject) => { deadline = setTimeout(() => reject(new Error("Video connection timed out. Voice remains available; try again on your device.")), 25000); }),
          ]);
        } finally { if (deadline) clearTimeout(deadline); }
        if (clientRef.current !== client) return false;
        if (audioRef.current) { audioRef.current.muted = true; audioRef.current.volume = 0; }
        // Cut the green backdrop out so she floats over the page like her static photo.
        if (chromaKey && canvasRef.current) { const stopFn = startChromaKey(videoRef.current, canvasRef.current); if (stopFn) { keyStopRef.current = stopFn; setKeyed(true); } }
        setLive(true); setState("live");
        return true;
      } catch (e) {
        if (lifecycle !== lifecycleRef.current) return false;
        stopKey();
        const client = clientRef.current; clientRef.current = null;
        if (client) void client.stop().catch(() => {});
        setLive(false); setState("failed");
        setReason(e instanceof Error ? e.message : String(e || "Video avatar could not start"));
        return false;
      }
    },
    stop,
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
      <video ref={videoRef} autoPlay playsInline muted className={`h-full w-full object-contain ${unboxed ? 'aspen-person-live-media' : ''} ${keyed ? 'absolute inset-0 opacity-0 pointer-events-none' : ''}`} />
      <canvas ref={canvasRef} aria-hidden className={`h-full w-full object-contain ${unboxed ? 'aspen-person-live-media' : ''} ${keyed ? 'relative' : 'hidden'}`} />
      <audio ref={audioRef} autoPlay muted />
      {state === "connecting" && <div className={`absolute ${unboxed ? 'bottom-1 right-1' : 'inset-0 bg-card/70'} flex items-center justify-center`}><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}
      {state === "failed" && <div role="status" className={`${unboxed ? 'absolute bottom-0 inset-x-0 rounded-md bg-background/95' : 'absolute inset-0 bg-card/90'} flex items-center justify-center p-2 text-center text-[11px] text-destructive`}>{reason || "Video avatar unavailable"} · voice continues</div>}
    </div>
  );
  const debugPanel = debug && visible ? createPortal(<div className="fixed left-2 top-16 z-[200] w-56 rounded-md border border-primary bg-card p-1 text-[10px] text-foreground"><canvas ref={debugCanvasRef} className="w-full bg-muted" /><p>{state} · {stats}</p></div>, document.body) : null;
  return <>{inline ? frame : createPortal(frame, document.body)}{debugPanel}</>;
});
SimliAvatar.displayName = "SimliAvatar";
export default SimliAvatar;
