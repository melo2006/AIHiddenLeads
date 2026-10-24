import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Mic, MicOff, Volume2, FlaskConical, PhoneOff, Loader2, Play, Save } from "lucide-react";

const VOICES = [
  { id: "Kore", label: "Kore — warm female (default)" },
  { id: "Aoede", label: "Aoede — bright female" },
  { id: "Leda", label: "Leda — soft female" },
  { id: "Callirrhoe", label: "Callirrhoe — calm female" },
  { id: "Despina", label: "Despina — lively female" },
  { id: "Zephyr", label: "Zephyr — upbeat female" },
  { id: "Puck", label: "Puck — friendly male" },
  { id: "Charon", label: "Charon — deep male" },
  { id: "Fenrir", label: "Fenrir — warm male" },
  { id: "Orus", label: "Orus — clear male" },
  { id: "Achernar", label: "Achernar — smooth male" },
  { id: "Algenib", label: "Algenib — gravelly male" },
];

type Turn = { role: "user" | "assistant"; text: string };
type Phase = "idle" | "connecting" | "live" | "preview";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const WS_URL = SUPABASE_URL.replace(/^https/, "wss") + "/functions/v1/gemini-live-proxy";

const VoiceLab = () => {
  const [voice, setVoice] = useState(() => {
    try { const saved = localStorage.getItem("gemini-aspen-voice"); return VOICES.some(v => v.id === saved) ? saved ?? "Kore" : "Kore"; } catch { return "Kore"; }
  });
  const [savedVoice, setSavedVoice] = useState(voice);
  const [partialUser, setPartialUser] = useState("");
  const [partialAspen, setPartialAspen] = useState("");
  const [micLevel, setMicLevel] = useState(0);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [aspenSpeaking, setAspenSpeaking] = useState(false);
  const [status, setStatus] = useState(
    "Pick a voice and press Start — then just talk, like a real phone call. You can interrupt her."
  );
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micCtxRef = useRef<AudioContext | null>(null);
  const playCtxRef = useRef<AudioContext | null>(null);
  const playTimeRef = useRef(0);
  const liveRef = useRef(false);
  const sourcesRef = useRef(new Set<AudioBufferSourceNode>());
  const micNodeRef = useRef<ScriptProcessorNode | null>(null);
  const generationRef = useRef(0);
  const previewDoneRef = useRef(false);
  const isPreviewRef = useRef(false);
  const aspenLineRef = useRef("");
  const userLineRef = useRef("");
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns]);

  const flushLine = useCallback((role: "user" | "assistant") => {
    const ref = role === "user" ? userLineRef : aspenLineRef;
    const text = ref.current.trim();
    if (text) {
      setTurns((prev) => [...prev, { role, text }]);
    }
    ref.current = "";
    if (role === "user") setPartialUser(""); else setPartialAspen("");
  }, []);

  const stopEverything = useCallback(() => {
    generationRef.current += 1;
    liveRef.current = false;
    if (micNodeRef.current) { micNodeRef.current.onaudioprocess = null; micNodeRef.current.disconnect(); }
    micNodeRef.current = null;
    for (const source of sourcesRef.current) { try { source.stop(); } catch {} }
    sourcesRef.current.clear();
    setMicLevel(0);
    try { wsRef.current?.close() } catch { /* ignore */ }
    wsRef.current = null;
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    micCtxRef.current?.close().catch(() => {});
    micCtxRef.current = null;
    playCtxRef.current?.close().catch(() => {});
    playCtxRef.current = null;
    flushLine("user");
    flushLine("assistant");
    setAspenSpeaking(false);
    setPhase("idle");
    setStatus("Conversation ended. Press Start to begin again.");
  }, [flushLine]);

  // Play a 24 kHz PCM chunk (base64) with gapless scheduling
  const playPcmChunk = useCallback((base64: string) => {
    if (!playCtxRef.current) {
      playCtxRef.current = new AudioContext({ sampleRate: 24000 });
      playTimeRef.current = 0;
    }
    const ctx = playCtxRef.current;
    if (ctx.state === "suspended") void ctx.resume().catch(() => setError("Audio is paused. End the call and press Start again to enable sound."));
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const samples = new Int16Array(bytes.buffer);
    const floats = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) floats[i] = samples[i] / 32768;

    const buffer = ctx.createBuffer(1, floats.length, 24000);
    buffer.getChannelData(0).set(floats);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const now = ctx.currentTime;
    const startAt = Math.max(now, playTimeRef.current);
    sourcesRef.current.add(source);
    source.start(startAt);
    playTimeRef.current = startAt + buffer.duration;
    setAspenSpeaking(true);
    source.onended = () => {
      sourcesRef.current.delete(source);
      if (ctx.currentTime >= playTimeRef.current - 0.05) setAspenSpeaking(false);
      if (isPreviewRef.current && previewDoneRef.current && sourcesRef.current.size === 0) stopEverything();
    };
  }, [stopEverything]);

  // Interrupt: drop all queued playback instantly
  const clearPlayback = useCallback(() => {
    for (const source of sourcesRef.current) { try { source.stop(); } catch {} }
    sourcesRef.current.clear();
    playTimeRef.current = playCtxRef.current?.currentTime ?? 0;
    setAspenSpeaking(false);
  }, []);

  const startConversation = useCallback(async (preview = false) => {
    const generation = ++generationRef.current;
    isPreviewRef.current = preview;
    previewDoneRef.current = false;
    setError(null);
    setTurns([]);
    setPartialUser("");
    setPartialAspen("");
    aspenLineRef.current = "";
    userLineRef.current = "";
    setPhase("connecting");
    setStatus("Connecting to Gemini Live…");

    try {
      // Unlock audio while still inside the user's click, before permissions/network awaits.
      const playCtx = new AudioContext();
      playCtxRef.current = playCtx;
      playTimeRef.current = 0;
      const playResume = playCtx.resume();
      const micCtx = preview ? null : new AudioContext({ sampleRate: 16000 });
      micCtxRef.current = micCtx;
      const micResume = micCtx?.resume();
      await Promise.all([playResume, micResume]);
      const stream = preview ? null : await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (generation !== generationRef.current) { stream?.getTracks().forEach(t => t.stop()); return; }
      micStreamRef.current = stream;
      if (playCtx.state !== "running" || (micCtx && micCtx.state !== "running")) throw new Error("Your browser paused audio. Press Start again to enable the microphone and speaker.");
      const ws = new WebSocket(`${WS_URL}?voice=${encodeURIComponent(voice)}${preview ? "&preview=1" : ""}`);
      wsRef.current = ws;

      ws.onopen = () => setStatus("Connected — waiting for Gemini…");

      // If Gemini never signals ready, don't hang on "connecting" forever
      const readyTimeout = setTimeout(() => {
        if (!liveRef.current) {
          setError("Gemini did not respond in time. Check that your Google API key is valid and has Live API access, then try again.");
          stopEverything();
        }
      }, 15000);

      ws.onmessage = (event) => {
        if (generation !== generationRef.current) return;
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(event.data as string);
        } catch {
          return;
        }

        switch (msg.type) {
          case "ready": {
            clearTimeout(readyTimeout);
            liveRef.current = true;
            setPhase(preview ? "preview" : "live");
            setStatus(preview ? "Playing voice preview…" : "Live — just talk. Interrupt her anytime.");
            if (!micCtx || !stream) break;
            void micCtx.resume();
            const source = micCtx.createMediaStreamSource(stream);
            const node = micCtx.createScriptProcessor(2048, 1, 1);
            micNodeRef.current = node;
            let frame = 0;
            node.onaudioprocess = (e) => {
              if (!liveRef.current || ws.readyState !== WebSocket.OPEN) return;
              const input = e.inputBuffer.getChannelData(0);
              if (++frame % 4 === 0) {
                const rms = Math.sqrt(input.reduce((sum, x) => sum + x * x, 0) / input.length);
                setMicLevel(Math.min(100, Math.round(rms * 500)));
              }
              const pcm = new Int16Array(input.length);
              for (let i = 0; i < input.length; i++) {
                const s = Math.max(-1, Math.min(1, input[i]));
                pcm[i] = s < 0 ? s * 32768 : s * 32767;
              }
              const bytes = new Uint8Array(pcm.buffer);
              let binary = "";
              for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
              ws.send(JSON.stringify({ type: "audio", data: btoa(binary) }));
            };
            source.connect(node);
            node.connect(micCtx.destination);
            break;
          }
          case "audio":
            playPcmChunk(msg.data as string);
            break;
          case "interrupted":
            clearPlayback();
            flushLine("assistant");
            break;
          case "aspen_transcript":
            aspenLineRef.current += msg.text as string;
            setPartialAspen(aspenLineRef.current);
            break;
          case "user_transcript":
            userLineRef.current += msg.text as string;
            setPartialUser(userLineRef.current);
            break;
          case "turn_complete":
            flushLine("user");
            flushLine("assistant");
            if (preview) {
              previewDoneRef.current = true;
              if (sourcesRef.current.size === 0) stopEverything();
            }
            break;
          case "error":
            setError(String(msg.message || "Gemini error"));
            stopEverything();
            break;
          case "closed":
            if (liveRef.current) {
              stopEverything();
              setError(`Session ended: ${msg.reason || "unknown"}`);
            }
            break;
        }
      };

      ws.onerror = () => {
        setError("Could not connect to the voice service.");
        stopEverything();
      };
      ws.onclose = () => {
        clearTimeout(readyTimeout);
        if (generation !== generationRef.current) return;
        if (liveRef.current) {
          stopEverything();
        } else {
          setPhase("idle");
          setStatus("Conversation ended. Press Start to begin again.");
          setError((prev) => prev ?? "The connection closed before the session started. Try again.");
        }
      };
    } catch (e) {
      stopEverything();
      setError(
        e instanceof Error && e.name === "NotAllowedError"
          ? "Microphone permission was denied — allow it in your browser and try again."
          : e instanceof Error ? e.message : "Could not start. Check your microphone and try again."
      );
    }
  }, [voice, playPcmChunk, clearPlayback, flushLine, stopEverything]);

  useEffect(() => stopEverything, [stopEverything]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-4">
          <FlaskConical className="h-5 w-5 text-primary" />
          <h1 className="text-sm font-extrabold tracking-tight">
            Voice Lab — Gemini Live Aspen{" "}
            <span className="text-muted-foreground font-normal">(real-time, Retell untouched)</span>
          </h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 space-y-4">
        <Card className="p-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="flex-1">
              <label className="text-xs font-semibold text-muted-foreground">Voice</label>
              <Select value={voice} onValueChange={setVoice} disabled={phase !== "idle"}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VOICES.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {phase === "idle" ? (
              <Button onClick={() => void startConversation()} variant="secondary">
                <Mic className="h-4 w-4" />
                <span className="ml-2">Start live conversation</span>
              </Button>
            ) : (
              <Button onClick={stopEverything} variant="destructive">
                <PhoneOff className="h-4 w-4" />
                <span className="ml-2">End conversation</span>
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" disabled={phase !== "idle"} onClick={() => void startConversation(true)} aria-label="Play selected voice preview" title="Play selected voice preview">
              <Play className="h-4 w-4 mr-2" /> Preview voice
            </Button>
            <Button variant="outline" size="sm" disabled={phase !== "idle" || savedVoice === voice} onClick={() => {
              try { localStorage.setItem("gemini-aspen-voice", voice); setSavedVoice(voice); setStatus(`${voice} saved for Gemini calls in this browser.`); } catch { setError("Your browser could not save the voice preference."); }
            }}><Save className="h-4 w-4 mr-2" /> Save Gemini voice</Button>
            {phase === "preview" && <span className="text-xs text-muted-foreground">{voice} preview</span>}
          </div>
          <div className="flex items-center gap-2">
            {phase === "connecting" && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
            {phase === "live" && !aspenSpeaking && (
              <Mic className="h-4 w-4 text-primary animate-pulse" />
            )}
            {phase === "live" && aspenSpeaking && (
              <Volume2 className="h-4 w-4 text-primary animate-pulse" />
            )}
            {phase === "idle" && <MicOff className="h-4 w-4 text-muted-foreground" />}
            <p className="text-xs text-muted-foreground">
              {phase === "live" && (
                <span className="font-semibold text-foreground">
                  {aspenSpeaking ? "Aspen is speaking — you can talk over her" : "Listening"}
                  {" — "}
                </span>
              )}
              {status}
            </p>
          </div>
          {phase === "live" && <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Microphone</span><meter min="0" max="100" value={micLevel} aria-label="Microphone level" className="h-3 w-24" />
            <span>{micLevel > 3 ? "Sound detected" : "Quiet"}</span>
          </div>}
          {error && <p className="text-xs text-destructive font-semibold">{error}</p>}
        </Card>

        <Card className="p-4 min-h-[300px] max-h-[50vh] overflow-y-auto space-y-3">
          {turns.length === 0 && !partialAspen && !partialUser && (
            <p className="text-sm text-muted-foreground text-center pt-16">
              No conversation yet. Press “Start live conversation” and just talk — she hears you
              continuously and you can interrupt her mid-sentence.
            </p>
          )}
          {turns.map((t, i) => (
            <div key={i} className={t.role === "user" ? "text-right" : "text-left"}>
              <span
                className={`inline-block rounded-lg px-3 py-2 text-sm max-w-[85%] ${
                  t.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground"
                }`}
              >
                {t.text}
              </span>
            </div>
          ))}
          {partialUser && <p className="text-right text-sm text-foreground break-words">{partialUser}</p>}
          {partialAspen && <p className="text-sm text-foreground break-words">{partialAspen}</p>}
          <div ref={transcriptEndRef} />
        </Card>

        <p className="text-[11px] text-muted-foreground text-center pb-8">
          Powered by Gemini 3.8 Live (native audio, real-time streaming) via your own Google AI
          Studio key. Usage bills to your Google account, not Lovable credits.
        </p>
      </main>
    </div>
  );
};

export default VoiceLab;
