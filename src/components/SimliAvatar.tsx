import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import { SimliClient, LogLevel } from "simli-client";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { pcm24kTo16k, type VideoAvatar } from "../../supabase/functions/_shared/video-avatar";

export interface SimliAvatarHandle {
  /** Resolves true once the face is on screen; false (with a visible reason) when Simli refuses or fails. */
  start: () => Promise<boolean>;
  stop: () => void;
  /** Gemini's 24 kHz PCM16 chunk, base64. */
  sendPcm24k: (base64: string) => void;
  clear: () => void;
}
export interface SimliAvatarProps { avatar: VideoAvatar; agentId?: string; shareToken?: string; draft?: boolean; faceOverride?: string; inline?: boolean; onLiveChange?: (live: boolean) => void; }

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
  return String(data.sessionToken);
}

/** Owns one Simli session: the face lip-syncs Gemini's audio; Gemini remains the only conversation brain. */
const SimliAvatar = forwardRef<SimliAvatarHandle, SimliAvatarProps>(({ avatar, agentId, shareToken, draft, faceOverride, inline = false, onLiveChange }, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const clientRef = useRef<SimliClient | null>(null);
  const liveRef = useRef(false);
  const [state, setState] = useState<"idle" | "connecting" | "live" | "failed">("idle");
  const [reason, setReason] = useState("");
  const setLive = (live: boolean) => { liveRef.current = live; onLiveChange?.(live); };

  const stop = () => {
    setLive(false);
    const client = clientRef.current; clientRef.current = null;
    if (client) void client.stop().catch(() => {});
    setState("idle");
  };
  useEffect(() => () => stop(), []); // eslint-disable-line react-hooks/exhaustive-deps

  useImperativeHandle(ref, () => ({
    start: async () => {
      if (clientRef.current) return liveRef.current;
      setState("connecting"); setReason("");
      try {
        // Wait one frame so the portal's video/audio elements exist.
        await new Promise((r) => requestAnimationFrame(r));
        if (!videoRef.current || !audioRef.current) throw new Error("Avatar view is not ready");
        const token = await sessionToken({ agentId, shareToken, draft, faceId: faceOverride });
        const client = new SimliClient(token, videoRef.current, audioRef.current, null, LogLevel.ERROR, "livekit");
        clientRef.current = client;
        client.on("stop", () => { if (clientRef.current === client) { setLive(false); setState("idle"); } });
        client.on("error", (detail) => { setReason(String(detail || "Avatar disconnected")); });
        let deadline: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            client.start(),
            new Promise<never>((_, reject) => { deadline = setTimeout(() => reject(new Error("Video connection timed out. Voice remains available; try again on your device.")), 25000); }),
          ]);
        } finally { if (deadline) clearTimeout(deadline); }
        if (clientRef.current !== client) return false;
        setLive(true); setState("live");
        return true;
      } catch (e) {
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
      if (!client || !liveRef.current) return;
      const bin = atob(base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const pcm = pcm24kTo16k(new Int16Array(bytes.buffer, 0, Math.floor(bytes.length / 2)));
      client.sendAudioData(new Uint8Array(pcm.buffer));
    },
    clear: () => { try { clientRef.current?.ClearBuffer(); } catch { /* Session already closed. */ } },
  }), [agentId, shareToken, draft, faceOverride]); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = state !== "idle";
  const frame = (
    <div aria-label="Video avatar" role="img" className={`${inline ? "relative mx-auto" : `fixed z-[120] ${POSITION[avatar.position]}`} ${visible ? "" : "hidden"} overflow-hidden border-2 border-primary/50 bg-card shadow-2xl ${SHAPE[avatar.shape]}`} style={{ width: avatar.size, height: avatar.size, maxWidth: "70vw", maxHeight: "70vw" }}>
      <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
      <audio ref={audioRef} autoPlay />
      {state === "connecting" && <div className="absolute inset-0 flex items-center justify-center bg-card/70"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}
      {state === "failed" && <div className="absolute inset-0 flex items-center justify-center bg-card/90 p-3 text-center text-[11px] text-destructive">{reason || "Video avatar unavailable"} · voice continues</div>}
    </div>
  );
  return inline ? frame : createPortal(frame, document.body);
});
SimliAvatar.displayName = "SimliAvatar";
export default SimliAvatar;
