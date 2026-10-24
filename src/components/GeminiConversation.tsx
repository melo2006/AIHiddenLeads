import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Mic, MicOff, Volume2, FlaskConical, PhoneOff, Loader2, Play, Pause, Save, RotateCcw, RefreshCw, Settings2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { microphonePcm, shouldSendMicrophone, microphoneGate, type NoiseFilter, type CaptureMode } from "@/lib/voiceLabAudio";

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

export interface GeminiConversationProps { agentId?: string; leadId?: string; prospectId?: string; draft?: boolean; compact?: boolean; name?: string; visitorName?: string; previewVoice?: string; autoStart?: boolean; previewOnly?: boolean; testModel?: string; }
const GeminiConversation = ({ agentId, leadId, prospectId, draft = false, compact = false, name = "Aspen", visitorName = "", previewVoice, autoStart = false, previewOnly = false, testModel }: GeminiConversationProps) => {
  const [consent, setConsent] = useState(false);
  const [voice, setVoice] = useState(() => {
    try { const saved = localStorage.getItem("gemini-aspen-voice"); return VOICES.some(v => v.id === saved) ? saved ?? "Kore" : "Kore"; } catch { return "Kore"; }
  });
  const [savedVoice, setSavedVoice] = useState(voice);
  const [partialUser, setPartialUser] = useState("");
  const [partialAspen, setPartialAspen] = useState("");
  const [micLevel, setMicLevel] = useState(0);
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [microphone, setMicrophone] = useState("default");
  const [captureMode, setCaptureMode] = useState<CaptureMode>(() => {
    try { return localStorage.getItem("voice-capture-mode") === "hold" ? "hold" : "handsfree"; } catch { return "handsfree"; }
  });
  const [noiseFilter, setNoiseFilter] = useState<NoiseFilter>(() => {
    try { const saved = localStorage.getItem("voice-noise-filter"); return saved === "light" || saved === "strong" ? saved : "balanced"; } catch { return "balanced"; }
  });
  const noiseFilterRef = useRef(noiseFilter);
  useEffect(() => {
    noiseFilterRef.current = noiseFilter;
    try { localStorage.setItem("voice-noise-filter", noiseFilter); localStorage.setItem("voice-capture-mode", captureMode); } catch { /* Keep controls available without storage. */ }
  }, [noiseFilter, captureMode]);
  const [held, setHeld] = useState(false);
  const [muted, setMuted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [replaying, setReplaying] = useState(false);
  const [hasReplay, setHasReplay] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [aspenSpeaking, setAspenSpeaking] = useState(false);
  const [status, setStatus] = useState(
    "Pick a voice and press Start — then just talk, like a real phone call. You can interrupt her."
  );
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

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
  const captureRef = useRef({ mode: "handsfree" as CaptureMode, held: false, muted: false, replaying: false, paused: false });
  const currentAudioRef = useRef<string[]>([]);
  const lastAudioRef = useRef<string[]>([]);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  const refreshMicrophones = useCallback(async (requestPermission = false) => {
    try {
      if (requestPermission) {
        const permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        permissionStream.getTracks().forEach(track => track.stop());
      }
      setMicrophones((await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === "audioinput"));
    } catch { setError("Could not list microphones. Allow microphone access in Chrome."); }
  }, []);

  useEffect(() => {
    void refreshMicrophones();
    const update = () => void refreshMicrophones();
    navigator.mediaDevices?.addEventListener("devicechange", update);
    return () => navigator.mediaDevices?.removeEventListener("devicechange", update);
  }, [refreshMicrophones]);

  const endHold = useCallback(() => {
    if (!captureRef.current.held) return;
    captureRef.current.held = false;
    setHeld(false);
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify({ type: "activity_end" }));
  }, []);

  useEffect(() => {
    const release = () => { if (document.hidden) endHold(); };
    window.addEventListener("blur", endHold);
    document.addEventListener("visibilitychange", release);
    return () => { window.removeEventListener("blur", endHold); document.removeEventListener("visibilitychange", release); };
  }, [endHold]);

  useEffect(() => {
    const end = transcriptEndRef.current;
    const panel = end?.parentElement;
    if (panel && panel.scrollHeight - panel.scrollTop - panel.clientHeight < 100) panel.scrollTop = panel.scrollHeight;
  }, [turns, partialAspen, partialUser]);

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
    captureRef.current.held = false;
    captureRef.current.replaying = false;
    captureRef.current.paused = false;
    setHeld(false);
    setReplaying(false);
    setPaused(false);
    if (micNodeRef.current) { micNodeRef.current.onaudioprocess = null; micNodeRef.current.disconnect(); }
    micNodeRef.current = null;
    for (const source of sourcesRef.current) { try { source.stop(); } catch { /* Already stopped. */ } }
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
    if (ctx.state === "suspended" && !captureRef.current.paused) void ctx.resume().catch(() => setError("Audio is paused. End the call and press Start again to enable sound."));
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
      if (sourcesRef.current.size === 0 && captureRef.current.replaying) {
        captureRef.current.replaying = false;
        setReplaying(false);
      }
      if (isPreviewRef.current && previewDoneRef.current && sourcesRef.current.size === 0) stopEverything();
    };
  }, [stopEverything]);

  // Interrupt: drop all queued playback instantly
  const clearPlayback = useCallback(() => {
    captureRef.current.replaying = false;
    setReplaying(false);
    for (const source of sourcesRef.current) { try { source.stop(); } catch { /* Already stopped. */ } }
    sourcesRef.current.clear();
    playTimeRef.current = playCtxRef.current?.currentTime ?? 0;
    setAspenSpeaking(false);
  }, []);

  const pauseCapture = useCallback(() => {
    endHold();
    if (captureRef.current.mode === "handsfree" && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "audio_pause" }));
    }
  }, [endHold]);

  // Pause: stop mic capture and freeze speaker playback without ending the call.
  const togglePause = useCallback(() => {
    if (captureRef.current.paused) {
      captureRef.current.paused = false;
      setPaused(false);
      void playCtxRef.current?.resume().catch(() => {});
    } else {
      pauseCapture();
      captureRef.current.paused = true;
      setPaused(true);
      void playCtxRef.current?.suspend().catch(() => {});
    }
  }, [pauseCapture]);

  const replayLastMessage = useCallback(async () => {
    if (!lastAudioRef.current.length || captureRef.current.paused || captureRef.current.replaying) return;
    try {
      if (!playCtxRef.current || playCtxRef.current.state === "closed") playCtxRef.current = new AudioContext();
      await playCtxRef.current.resume();
      pauseCapture();
      clearPlayback();
      isPreviewRef.current = false;
      captureRef.current.replaying = true;
      setReplaying(true);
      lastAudioRef.current.forEach(playPcmChunk);
    } catch { captureRef.current.replaying = false; setReplaying(false); setError("Could not replay audio. Check your speaker connection."); }
  }, [pauseCapture, clearPlayback, playPcmChunk]);

  const startConversation = useCallback(async (preview = false) => {
    clearPlayback();
    const generation = ++generationRef.current;
    captureRef.current = { mode: captureMode, held: false, muted: false, replaying: false, paused: false };
    setHeld(false);
    setMuted(false);
    setPaused(false);
    currentAudioRef.current = [];
    lastAudioRef.current = [];
    setHasReplay(false);
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
        audio: { deviceId: microphone === "default" ? undefined : { exact: microphone }, echoCancellation: true, noiseSuppression: true, autoGainControl: captureMode !== "hold" },
      });
      if (generation !== generationRef.current) { stream?.getTracks().forEach(t => t.stop()); return; }
      micStreamRef.current = stream;
      if (stream) void refreshMicrophones();
      if (playCtx.state !== "running" || (micCtx && micCtx.state !== "running")) throw new Error("Your browser paused audio. Press Start again to enable the microphone and speaker.");
      let visitorKey = localStorage.getItem("gemini-visitor-key");
      if (!visitorKey) { visitorKey = crypto.randomUUID(); localStorage.setItem("gemini-visitor-key", visitorKey); }
      const { data: authorized, error: authError } = await supabase.functions.invoke("gemini-session", { body: { visitorKey, agentId, leadId, prospectId, draft, preview, voice: previewVoice || voice, model: testModel, hour: new Date().getHours(), visitorName, consent } });
      if (authError) {
        const detail = authError instanceof FunctionsHttpError ? await authError.context.json().catch(() => null) : null;
        throw new Error(detail?.error || authError.message);
      }
      if (authorized?.allowed === false) {
        stopEverything();
        setStatus('Daily voice allowance reached');
        setError(authorized.error);
        return;
      }
      if (generation !== generationRef.current) { stream?.getTracks().forEach(t => t.stop()); return; }
      const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(authorized.token)}&capture=${captureMode}`);
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
            setStatus(preview ? "Playing voice preview…" : captureMode === "hold" ? "Live — hold to talk" : "Live — hands-free");
            if (!micCtx || !stream) break;
            void micCtx.resume();
            const source = micCtx.createMediaStreamSource(stream);
            const node = micCtx.createScriptProcessor(2048, 1, 1);
            micNodeRef.current = node;
            let frame = 0;
            let gateOpenUntil = 0;
            node.onaudioprocess = (e) => {
              if (!liveRef.current || ws.readyState !== WebSocket.OPEN) return;
              const input = e.inputBuffer.getChannelData(0);
              const rms = Math.sqrt(input.reduce((sum, x) => sum + x * x, 0) / input.length);
              if (++frame % 4 === 0) {
                setMicLevel(Math.min(100, Math.round(rms * 500)));
              }
              const capture = captureRef.current;
              if (capture.paused) return;
              if (!shouldSendMicrophone(capture.mode, capture.held, capture.muted, capture.replaying)) return;
              const gate = microphoneGate(rms, noiseFilterRef.current, performance.now(), gateOpenUntil);
              gateOpenUntil = gate.openUntil;
              const pcm = microphonePcm(capture.mode === "hold" || gate.open ? input : new Float32Array(input.length), e.inputBuffer.sampleRate);
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
            // Keep the last response locally, never request a new model generation to replay.
            if (currentAudioRef.current.length < 6000) currentAudioRef.current.push(msg.data as string);
            playPcmChunk(msg.data as string);
            break;
          case "interrupted":
            clearPlayback();
            flushLine("assistant");
            if (currentAudioRef.current.length) { lastAudioRef.current = currentAudioRef.current; setHasReplay(true); }
            currentAudioRef.current = [];
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
            if (currentAudioRef.current.length) { lastAudioRef.current = currentAudioRef.current; setHasReplay(true); }
            currentAudioRef.current = [];
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
  }, [voice, microphone, captureMode, refreshMicrophones, playPcmChunk, clearPlayback, flushLine, stopEverything, agentId, leadId, prospectId, draft, previewVoice, visitorName, consent, testModel]);

  useEffect(() => stopEverything, [stopEverything]);

  // Auto-connect once when the widget opens (the open tap is the user gesture
  // that unlocks microphone and audio).
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (!compact || !autoStart || autoStartedRef.current) return;
    autoStartedRef.current = true;
    void startConversation();
  }, [compact, autoStart, startConversation]);

  if (previewOnly) return <div className="space-y-2">
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" disabled={phase !== "idle"} onClick={() => void startConversation(true)} aria-label="Play selected voice"><Play className="mr-2 h-4 w-4"/>Play voice</Button>
      <Button size="sm" variant="outline" disabled={phase === "idle"} onClick={stopEverything} aria-label="Stop voice preview"><PhoneOff className="mr-2 h-4 w-4"/>Stop</Button>
      <span role="status" className="text-xs text-muted-foreground">{phase === "connecting" ? "Connecting…" : phase === "preview" ? `Playing ${previewVoice || voice}` : `${previewVoice || voice} selected`}</span>
    </div>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </div>;

  // Compact mode: minimal floating-widget layout for phones — status line,
  // two-line scrolling transcript, and a single row of icon buttons.
  if (compact) {
    return (
      <div className="space-y-2 p-2 text-foreground">
        <div className="flex items-center gap-1.5">
          {phase === "connecting" && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />}
          {phase === "live" && !aspenSpeaking && <Mic className="h-3.5 w-3.5 shrink-0 animate-pulse text-primary" />}
          {phase === "live" && aspenSpeaking && <Volume2 className="h-3.5 w-3.5 shrink-0 animate-pulse text-primary" />}
          {phase === "idle" && <MicOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          <p className="min-w-0 break-words text-xs leading-snug text-foreground" role="status">
            {phase === "live" && (
              <span className="font-semibold text-foreground">
                {paused ? "Paused" : replaying ? "Replaying saved audio" : muted ? "Microphone muted" : aspenSpeaking ? `${name} speaking` : captureMode === "hold" && !held ? "Hold to talk" : "Listening"}
              </span>
            )}
            {phase !== "live" && (phase === "idle" ? "Ready to talk" : status)}
          </p>
        </div>

        <div aria-label="Conversation transcript" tabIndex={0} className="max-h-[4.5rem] space-y-1 overflow-y-auto overscroll-contain rounded-md border border-border p-1.5">
          {turns.length === 0 && !partialAspen && !partialUser && (
            <p className="py-1 text-center text-[11px] text-muted-foreground">No conversation yet.</p>
          )}
          {turns.map((t, i) => (
            <Message key={i} from={t.role} className="max-w-full">
              <MessageContent aria-label={t.role === "user" ? "Caller transcript" : "Aspen transcript"} className={t.role === "user" ? "bg-primary text-primary-foreground text-xs px-2 py-1" : "text-xs text-foreground"}>
                <MessageResponse>{t.text}</MessageResponse>
              </MessageContent>
            </Message>
          ))}
          {partialUser && <Message from="user"><MessageContent className="bg-primary text-primary-foreground text-xs"><MessageResponse>{partialUser}</MessageResponse></MessageContent></Message>}
          {partialAspen && <Message from="assistant"><MessageContent className="text-xs"><MessageResponse>{partialAspen}</MessageResponse></MessageContent></Message>}
          <div ref={transcriptEndRef} />
        </div>

        <div className="voice-controls flex flex-wrap items-center justify-center gap-1 [&_button]:h-auto [&_button]:min-h-11 [&_button]:w-auto [&_button]:min-w-11 [&_button]:flex-col [&_button]:gap-1 [&_button]:px-1.5 [&_button]:py-1.5 [&_span]:text-[10px] [&_span]:leading-tight">
          {phase === "idle" ? (
            <Button size="icon" onClick={() => void startConversation()} title="Start conversation" aria-label="Start conversation">
              <Mic className="h-4 w-4" />
              <span>Talk</span>
            </Button>
          ) : (
            <Button size="icon" variant="destructive" onClick={stopEverything} title="End conversation" aria-label="End conversation">
              <PhoneOff className="h-4 w-4" />
              <span>End</span>
            </Button>
          )}
          {phase === "live" && (
            <Button
              size="icon"
              variant={muted ? "destructive" : "outline"}
              aria-pressed={muted}
              title={muted ? "Unmute microphone" : "Mute microphone"}
              aria-label={muted ? "Unmute microphone" : "Mute microphone"}
              onClick={() => {
                if (!muted) pauseCapture();
                captureRef.current.muted = !muted;
                setMuted(!muted);
              }}
            >
              {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              <span>{muted ? "Unmute" : "Mute"}</span>
            </Button>
          )}
          {phase === "live" && (
            <Button
              size="icon"
              variant={paused ? "default" : "outline"}
              aria-pressed={paused}
              title={paused ? "Resume conversation" : "Pause conversation"}
              aria-label={paused ? "Resume conversation" : "Pause conversation"}
              onClick={togglePause}
            >
              {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              <span>{paused ? "Resume" : "Pause"}</span>
            </Button>
          )}
          <Button
            size="icon"
            variant="outline"
            disabled={!hasReplay || paused || replaying || aspenSpeaking || phase === "connecting" || phase === "preview"}
            onClick={() => void replayLastMessage()}
            title="Replay last message"
            aria-label="Replay last message"
          >
            <RotateCcw className="h-4 w-4" />
            <span>Replay</span>
          </Button>
          {replaying && (
            <Button size="icon" variant="outline" onClick={clearPlayback} title="Stop replay" aria-label="Stop replay">
              <PhoneOff className="h-4 w-4" />
              <span>Stop replay</span>
            </Button>
          )}
          {phase === "live" && captureMode === "hold" && (
            <Button
              size="icon"
              className="touch-none select-none"
              variant={held ? "default" : "secondary"}
              disabled={muted || paused || replaying}
              aria-pressed={held}
              title={held ? "Listening — release to send" : "Hold to talk"}
              aria-label={held ? "Listening — release to send" : "Hold to talk"}
              onContextMenu={(event) => event.preventDefault()}
              onPointerDown={(event) => {
                if (event.button !== 0 || captureRef.current.held) return;
                event.currentTarget.setPointerCapture(event.pointerId);
                clearPlayback();
                captureRef.current.held = true;
                setHeld(true);
                wsRef.current?.send(JSON.stringify({ type: "activity_start" }));
              }}
              onPointerUp={endHold}
              onPointerCancel={endHold}
              onLostPointerCapture={endHold}
            >
              <Mic className="h-4 w-4" />
              <span>Hold</span>
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setShowSettings((s) => !s)}
            title="Voice settings"
            aria-label="Voice settings"
            aria-expanded={showSettings}
          >
            <Settings2 className="h-4 w-4" />
            <span>Settings</span>
          </Button>
        </div>

        {phase === "live" && (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>Mic</span>
            <meter min="0" max="100" value={micLevel} aria-label="Microphone level" className="h-2 w-16" />
            <span>{micLevel > 3 ? "Sound" : "Quiet"}</span>
          </div>
        )}
        {error && <p className="text-[11px] font-semibold text-destructive">{error}</p>}

        {showSettings && (
          <div className="space-y-2 border-t border-border pt-2">
            <label className="block space-y-1 text-xs">Microphone sensitivity
              <Select value={noiseFilter} onValueChange={value => setNoiseFilter(value as NoiseFilter)}>
                <SelectTrigger aria-label="Microphone sensitivity" className="h-auto min-h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="light">High — quiet room</SelectItem><SelectItem value="balanced">Medium — default</SelectItem><SelectItem value="strong">Low — filter quieter sounds</SelectItem></SelectContent>
              </Select>
            </label>
            <label className="flex items-start gap-2 text-[11px] text-muted-foreground">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} disabled={phase !== "idle"} />
              Allow saving this conversation transcript when enabled by the business
            </label>
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground">Microphone</label>
              <div className="mt-1 flex gap-2">
                <Select value={microphone} onValueChange={setMicrophone} disabled={phase !== "idle"}>
                  <SelectTrigger aria-label="Microphone" className="h-8 min-w-0 flex-1 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">System default microphone</SelectItem>
                    {microphones.filter((device) => device.deviceId && device.deviceId !== "default").map((device, index) => (
                      <SelectItem key={device.deviceId} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="icon" variant="outline" className="h-8 w-8" disabled={phase !== "idle"} onClick={() => void refreshMicrophones(true)} aria-label="Refresh microphones" title="Allow access and refresh microphones">
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground">Conversation mode</label>
              <Select value={captureMode} onValueChange={(value) => setCaptureMode(value as CaptureMode)} disabled={phase !== "idle"}>
                <SelectTrigger aria-label="Conversation mode" className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="handsfree">Hands-free</SelectItem>
                  <SelectItem value="hold">Noisy place — hold to talk</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {draft && (
              <Button variant="outline" size="sm" className="h-8 text-xs" disabled={phase !== "idle"} onClick={() => void startConversation(true)} aria-label="Play selected voice preview" title="Play selected voice preview">
                <Play className="mr-1.5 h-3.5 w-3.5" /> Preview voice
              </Button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={compact ? "bg-background text-foreground" : "min-h-screen bg-background text-foreground"}>
      {!compact && <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-4">
          <FlaskConical className="h-5 w-5 text-primary" />
          <h1 className="text-sm font-extrabold">
            Voice Lab — Gemini Live Aspen{" "}
            <span className="text-muted-foreground font-normal">(real-time, Retell untouched)</span>
          </h1>
        </div>
      </header>}

      <main className={compact ? "space-y-3" : "mx-auto max-w-3xl px-4 py-6 space-y-4"}>
        <Card className="p-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            {!compact && <div className="flex-1">
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
            </div>}
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

          <label className="flex items-start gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} disabled={phase !== "idle"} />Allow saving this conversation transcript when enabled by the business</label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1 text-xs">Microphone sensitivity
              <Select value={noiseFilter} onValueChange={value => setNoiseFilter(value as NoiseFilter)}>
                <SelectTrigger aria-label="Microphone sensitivity"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="light">High — quiet room</SelectItem><SelectItem value="balanced">Medium — default</SelectItem><SelectItem value="strong">Low — filter quieter sounds</SelectItem></SelectContent>
              </Select>
            </label>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Microphone</label>
              <div className="mt-1 flex gap-2">
                <Select value={microphone} onValueChange={setMicrophone} disabled={phase !== "idle"}>
                  <SelectTrigger aria-label="Microphone" className="min-w-0 flex-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">System default microphone</SelectItem>
                    {microphones.filter(device => device.deviceId && device.deviceId !== "default").map((device, index) => <SelectItem key={device.deviceId} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="icon" variant="outline" disabled={phase !== "idle"} onClick={() => void refreshMicrophones(true)} aria-label="Refresh microphones" title="Allow access and refresh microphones"><RefreshCw className="h-4 w-4" /></Button>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Conversation mode</label>
              <Select value={captureMode} onValueChange={value => setCaptureMode(value as CaptureMode)} disabled={phase !== "idle"}>
                <SelectTrigger aria-label="Conversation mode" className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="handsfree">Hands-free</SelectItem><SelectItem value="hold">Noisy place — hold to talk</SelectItem></SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(!compact || draft) && <Button variant="outline" size="sm" disabled={phase !== "idle"} onClick={() => void startConversation(true)} aria-label="Play selected voice preview" title="Play selected voice preview">
              <Play className="h-4 w-4 mr-2" /> Preview voice
            </Button>}
            {!compact && <Button variant="outline" size="sm" disabled={phase !== "idle" || savedVoice === voice} onClick={() => {
              try { localStorage.setItem("gemini-aspen-voice", voice); setSavedVoice(voice); setStatus(`${voice} saved for Gemini calls in this browser.`); } catch { setError("Your browser could not save the voice preference."); }
            }}><Save className="h-4 w-4 mr-2" /> Save Gemini voice</Button>}
            {phase === "preview" && <span className="text-xs text-muted-foreground">{voice} preview</span>}
            <Button variant="outline" size="sm" disabled={!hasReplay || paused || replaying || aspenSpeaking || phase === "connecting" || phase === "preview"} onClick={() => void replayLastMessage()} title="Replay saved audio without another AI request"><RotateCcw className="mr-2 h-4 w-4" />Replay last message</Button>
            {replaying && <Button variant="outline" size="sm" onClick={clearPlayback}><PhoneOff className="mr-2 h-4 w-4" />Stop replay</Button>}
            {phase === "live" && <Button variant={muted ? "destructive" : "outline"} size="sm" aria-pressed={muted} onClick={() => {
              if (!muted) pauseCapture();
              captureRef.current.muted = !muted;
              setMuted(!muted);
            }}>{muted ? <MicOff className="mr-2 h-4 w-4" /> : <Mic className="mr-2 h-4 w-4" />}{muted ? "Unmute microphone" : "Mute microphone"}</Button>}
            {phase === "live" && <Button variant={paused ? "default" : "outline"} size="sm" aria-pressed={paused} onClick={togglePause}>{paused ? <Play className="mr-2 h-4 w-4" /> : <Pause className="mr-2 h-4 w-4" />}{paused ? "Resume" : "Pause"}</Button>}
            {phase === "live" && captureMode === "hold" && <Button
              className="touch-none select-none" variant={held ? "default" : "secondary"} disabled={muted || paused || replaying}
              aria-pressed={held} onContextMenu={event => event.preventDefault()}
              onPointerDown={event => {
                if (event.button !== 0 || captureRef.current.held) return;
                event.currentTarget.setPointerCapture(event.pointerId);
                clearPlayback();
                captureRef.current.held = true; setHeld(true);
                wsRef.current?.send(JSON.stringify({ type: "activity_start" }));
              }} onPointerUp={endHold} onPointerCancel={endHold} onLostPointerCapture={endHold}
              onKeyDown={event => {
                if ((event.key === " " || event.key === "Enter") && !event.repeat && !captureRef.current.held) {
                  event.preventDefault(); clearPlayback(); captureRef.current.held = true; setHeld(true);
                  wsRef.current?.send(JSON.stringify({ type: "activity_start" }));
                }
              }} onKeyUp={event => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); endHold(); } }} onBlur={endHold}
            ><Mic className="mr-2 h-4 w-4" />{held ? "Listening — release to send" : "Hold to talk"}</Button>}
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
                  {paused ? "Paused — press Resume to continue" : replaying ? "Replaying — microphone paused" : muted ? "Microphone muted" : aspenSpeaking ? `${name} is speaking` : captureMode === "hold" && !held ? "Microphone paused" : "Listening"}
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

        <Card className="p-3 min-h-[100px] max-h-[25vh] overflow-y-auto space-y-3">
          {turns.length === 0 && !partialAspen && !partialUser && (
            <p className="text-sm text-muted-foreground text-center pt-16">
              No conversation yet.
            </p>
          )}
          {turns.map((t, i) => (
            <Message key={i} from={t.role}>
              <MessageContent aria-label={t.role === "user" ? "Caller transcript" : "Aspen transcript"} className={t.role === "user" ? "bg-primary text-primary-foreground" : "text-foreground"}>
                <MessageResponse>{t.text}</MessageResponse>
              </MessageContent>
            </Message>
          ))}
          {partialUser && <Message from="user"><MessageContent className="bg-primary text-primary-foreground"><MessageResponse>{partialUser}</MessageResponse></MessageContent></Message>}
          {partialAspen && <Message from="assistant"><MessageContent><MessageResponse>{partialAspen}</MessageResponse></MessageContent></Message>}
          <div ref={transcriptEndRef} />
        </Card>

        {!compact && <p className="text-[11px] text-muted-foreground text-center pb-8">
          Powered by Gemini 3.8 Live (native audio, real-time streaming) via your own Google AI
          Studio key. Usage bills to your Google account, not Lovable credits.
        </p>}
      </main>
    </div>
  );
};

export default GeminiConversation;
