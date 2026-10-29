import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
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
import { Mic, MicOff, Volume2, FlaskConical, PhoneOff, Loader2, Play, Pause, Save, RotateCcw, RefreshCw, Settings2, ChevronsUpDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { microphonePcm, shouldSendMicrophone, microphoneGate, microphoneAutoGain, type NoiseFilter, type CaptureMode } from "@/lib/voiceLabAudio";

import VoiceActionConfirmation, { type VoiceAction } from "./VoiceActionConfirmation";
import BrowserVoiceHandoff from "@/components/BrowserVoiceHandoff";
import { voiceIdleAction, homepageWalkthroughDue, type VoiceIdleStage } from '@/lib/voiceIdle';
import { voiceDisconnectMessage } from '@/lib/voiceDisconnect';
import {campaignVisit, trackCampaignEvent} from '@/lib/campaignTracking';
import { salesPlans, type SalesPlan } from '@/lib/salesActions';
import SimliAvatar, { type SimliAvatarHandle } from '@/components/SimliAvatar';
import type { VideoAvatar } from '../../supabase/functions/_shared/video-avatar';
import { PersonPortrait } from '@/components/FloatingPersonFrame';
import { avatarAudioReady } from '@/lib/avatarAudioTransition';

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

export interface GeminiConversationProps { agentId?: string; leadId?: string; prospectId?: string; draft?: boolean; compact?: boolean; name?: string; visitorName?: string; previewVoice?: string; autoStart?: boolean; previewOnly?: boolean; previewAudioContext?: AudioContext; testModel?: string; shareToken?: string; onRecommendedPlan?: (plan: SalesPlan) => void; videoAvatar?: VideoAvatar; avatarInline?: boolean; faceFirst?: boolean; avatarUrl?: string; }
const GeminiConversation = ({ agentId, leadId, prospectId, draft = false, compact = false, name = "Aspen", visitorName = "", previewVoice, autoStart = false, previewOnly = false, previewAudioContext, testModel, shareToken, onRecommendedPlan, videoAvatar, avatarInline = false, faceFirst = false, avatarUrl }: GeminiConversationProps) => {
  const avatarRef = useRef<SimliAvatarHandle>(null);
  const [faceLive, setFaceLive] = useState(false);
  const [captions, setCaptions] = useState(() => window.innerWidth > 1024);
  const avatarLiveRef = useRef(false);
  const muteNodeRef = useRef<GainNode | null>(null);
  const avatarPendingRef = useRef(false);
  const [pendingAction, setPendingAction] = useState<VoiceAction | null>(null);
  const [actionNotice, setActionNotice] = useState('');
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const deadlineRef = useRef(0);
  const [consentReady,setConsentReady]=useState(false);
  const consentReadyRef=useRef(false);
  useEffect(() => { const timer = window.setInterval(() => { if (liveRef.current && deadlineRef.current) setRemainingSeconds(Math.max(0, Math.ceil((deadlineRef.current-Date.now())/1000))); }, 1000); return () => window.clearInterval(timer); }, []);
  const [handoffToken, setHandoffToken] = useState<string | null>(null);
  const [handoffActive, setHandoffActive] = useState(false);
  const handoffRef = useRef(false);
  const consent = consentReadyRef.current;
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
    const track = micStreamRef.current?.getAudioTracks()[0];
    if (track) void track.applyConstraints({autoGainControl: microphoneAutoGain(captureMode, noiseFilter)}).catch(() => { /* Browser may not support gain adjustment. */ });
  }, [noiseFilter, captureMode]);
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
  const startingRef = useRef(false);
  const previewDoneRef = useRef(false);
  const isPreviewRef = useRef(false);
  const aspenLineRef = useRef("");
  const userLineRef = useRef("");
  const captureRef = useRef({ mode: "handsfree" as CaptureMode, held: false, muted: false, replaying: false, paused: false });
  const currentAudioRef = useRef<string[]>([]);
  const lastAudioRef = useRef<string[]>([]);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const walkthroughRef = useRef({ text: '', continued: false });
  const homepageWalkthroughRef = useRef(false);
  const idleRef = useRef({ enabled: false, stage: 'waiting' as VoiceIdleStage, quietSince: 0, generating: false, requestedAt: 0 });
  useEffect(() => {
    const timer = window.setInterval(() => {
      const idle = idleRef.current;
      const capture = captureRef.current;
      if (!liveRef.current || !idle.enabled) return;
      if (handoffRef.current || capture.paused || capture.muted || capture.replaying || capture.held || pendingAction || sourcesRef.current.size > 0) { idle.quietSince = Date.now(); return; }
      if (idle.generating) return;
      if (homepageWalkthroughRef.current && idle.stage === 'waiting' && homepageWalkthroughDue(walkthroughRef.current.text, walkthroughRef.current.continued, idle.quietSince, Date.now()) && wsRef.current?.readyState === WebSocket.OPEN) {
        walkthroughRef.current.continued = true;
        idle.generating = true;
        wsRef.current.send(JSON.stringify({type:'idle_prompt',stage:'continue'}));
        return;
      }
      if (idle.stage === 'goodbye') { wsRef.current?.send(JSON.stringify({type:'end_session',reason:'silence_timeout'})); stopEverything(); setStatus(voiceDisconnectMessage(1000,'silence_timeout')); return; }
      const action = voiceIdleAction(idle.stage, idle.quietSince, Date.now());
      if ((action === 'checkin' || action === 'goodbye') && wsRef.current?.readyState === WebSocket.OPEN) {
        idle.stage = action;
        idle.generating = true;
        idle.requestedAt = Date.now();
        wsRef.current.send(JSON.stringify({ type: 'idle_prompt', stage: action }));
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [pendingAction]);

  const refreshMicrophones = useCallback(async (_requestPermission = false) => {
    try {
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
    walkthroughRef.current = {text:'', continued:false};
    idleRef.current = { enabled: false, stage: 'waiting', quietSince: 0, generating: false, requestedAt: 0 };
    setPendingAction(null);
    deadlineRef.current = 0;
    setRemainingSeconds(null);
    setHandoffToken(null);
    handoffRef.current = false;
    setHandoffActive(false);
    if(liveRef.current&&!isPreviewRef.current) {wsRef.current?.send(JSON.stringify({type:'end_session',reason:'user_ended'}));void trackCampaignEvent('voice_ended');}
    generationRef.current += 1;
    startingRef.current = false;
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
    avatarRef.current?.stop();
    avatarLiveRef.current = false;
    try { wsRef.current?.close() } catch { /* ignore */ }
    wsRef.current = null;
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    micCtxRef.current?.close().catch(() => {});
    micCtxRef.current = null;
    playCtxRef.current?.close().catch(() => {});
    playCtxRef.current = null;
    muteNodeRef.current = null;
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
    // With a live video face, Simli plays the lip-synced audio; keep local timing silent so speaking state still works.
    // Switch to the face only between sentences so a reply never jumps mid-word.
    if (avatarPendingRef.current && sourcesRef.current.size === 0) { avatarPendingRef.current = false; avatarLiveRef.current = true; }
    if (avatarLiveRef.current && !captureRef.current.replaying) {
      if (!muteNodeRef.current || muteNodeRef.current.context !== ctx) { const mute = ctx.createGain(); mute.gain.value = 0; mute.connect(ctx.destination); muteNodeRef.current = mute; }
      const sent = avatarRef.current?.sendPcm24k(base64);
      if (sent) source.connect(muteNodeRef.current);
      else { avatarLiveRef.current = false; avatarPendingRef.current = false; source.connect(ctx.destination); }
    } else source.connect(ctx.destination);

    const now = ctx.currentTime;
    const startAt = Math.max(now, playTimeRef.current);
    sourcesRef.current.add(source);
    source.start(startAt);
    playTimeRef.current = startAt + buffer.duration;
    setAspenSpeaking(true);
    source.onended = () => {
      sourcesRef.current.delete(source);
      if (avatarAudioReady(avatarPendingRef.current, sourcesRef.current.size)) { avatarPendingRef.current = false; avatarLiveRef.current = true; }
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
    avatarRef.current?.clear();
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
    if (startingRef.current || liveRef.current) return;
    if (!preview && !consentReadyRef.current) { setConsentReady(false); return; }
    startingRef.current = true;
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
    setStatus(preview ? "Preparing your saved greeting…" : "Connecting to Gemini Live…");
    avatarLiveRef.current = false; avatarPendingRef.current = false;
    // Consent renders the avatar on this same click; wait for its ref to mount.
    if (!preview && videoAvatar?.enabled) void new Promise<void>(resolve => requestAnimationFrame(() => resolve())).then(() => avatarRef.current?.start()).then(ok => {
      if (generation !== generationRef.current) { if (ok) avatarRef.current?.stop(); return; }
      if (ok) { if (sourcesRef.current.size === 0) avatarLiveRef.current = true; else avatarPendingRef.current = true; }
    });
    const startupTimeout = window.setTimeout(() => {
      if (generation === generationRef.current && !liveRef.current) {
        stopEverything();
        setError("Starting the voice assistant took too long. Check microphone permission and try again.");
      }
    }, 30000);

    try {
      // Unlock audio while still inside the user's click, before permissions/network awaits.
      const playCtx = preview && previewAudioContext?.state !== 'closed' && previewAudioContext ? previewAudioContext : new AudioContext();
      playCtxRef.current = playCtx;
      playTimeRef.current = 0;
      const playResume = playCtx.resume();
      const micCtx = preview ? null : new AudioContext({ sampleRate: 16000 });
      micCtxRef.current = micCtx;
      const micResume = micCtx?.resume();
      let visitorKey = localStorage.getItem("gemini-visitor-key");
      if (!visitorKey) { visitorKey = crypto.randomUUID(); localStorage.setItem("gemini-visitor-key", visitorKey); }
      // Prepare the server's business snapshot alongside permission/audio setup, only after a tap.
      const microphoneReady = preview ? Promise.resolve(null) : navigator.mediaDevices.getUserMedia({
        audio: { deviceId: microphone === "default" ? undefined : { exact: microphone }, echoCancellation: true, noiseSuppression: true, autoGainControl: microphoneAutoGain(captureMode, noiseFilterRef.current) },
      }).then(stream => {
        if (generation !== generationRef.current) { stream.getTracks().forEach(t => t.stop()); return null; }
        micStreamRef.current = stream;
        return stream;
      });
      const [session, stream] = await Promise.all([
        supabase.functions.invoke("gemini-session", { body: { visitorKey, agentId, leadId, prospectId, draft, preview, voice: previewVoice || voice, model: testModel, campaign:campaignVisit(), hour: new Date().getHours(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, visitorName, consent, share: shareToken } }),
        microphoneReady,
        playResume,
        micResume,
      ]);
      if (generation !== generationRef.current) { stream?.getTracks().forEach(t => t.stop()); return; }
      if (stream) void refreshMicrophones();
      if (playCtx.state !== "running" || (micCtx && micCtx.state !== "running")) throw new Error("Your browser paused audio. Press Start again to enable the microphone and speaker.");
      const { data: authorized, error: authError } = session;
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
      deadlineRef.current = Date.now() + Number(authorized.maxSeconds || 300) * 1000;
      homepageWalkthroughRef.current = authorized.homepageSales === true;
      idleRef.current = { enabled: (authorized.idleChecks === true || authorized.homepageSales === true) && !preview, stage: 'waiting', quietSince: Date.now(), generating: true, requestedAt: 0 };
      setHandoffToken(authorized.handoffToken || null);
      const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(authorized.token)}&capture=${captureMode}`);
      wsRef.current = ws;

      ws.onopen = () => setStatus(preview ? "Voice connected · generating your greeting…" : "Connected — waiting for Gemini…");

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
            if(!preview)void trackCampaignEvent('voice_started');
            setPhase(preview ? "preview" : "live");
            setStatus(preview ? "Preparing greeting audio…" : captureMode === "hold" ? "Live — hold to talk" : "Live — hands-free");
            if (!micCtx || !stream) break;
            void micCtx.resume();
            const source = micCtx.createMediaStreamSource(stream);
            const node = micCtx.createScriptProcessor(2048, 1, 1);
            micNodeRef.current = node;
            let frame = 0;
            let gateOpenUntil = 0;
            node.onaudioprocess = (e) => {
              if (!liveRef.current || handoffRef.current || ws.readyState !== WebSocket.OPEN) return;
              const input = e.inputBuffer.getChannelData(0);
              const rms = Math.sqrt(input.reduce((sum, x) => sum + x * x, 0) / input.length);
              if (++frame % 4 === 0) {
                setMicLevel(Math.min(100, Math.round(rms * 500)));
              }
              const capture = captureRef.current;
              if (capture.paused) return;
              if (!shouldSendMicrophone(capture.mode, capture.held, capture.muted, capture.replaying)) return;
              const gate = microphoneGate(rms, noiseFilterRef.current, performance.now(), gateOpenUntil);
              if (gate.open && sourcesRef.current.size === 0 && !idleRef.current.generating) {
                idleRef.current.stage = 'waiting';
                idleRef.current.quietSince = Date.now();
              }
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
          case "recommended_plan": {
            const plan = salesPlans.find(value => value === msg.plan);
            if (plan) onRecommendedPlan?.(plan);
            break;
          }
          case "confirm_action":
            setPendingAction(msg as unknown as VoiceAction);
            break;
          case "cancel_action":
            setPendingAction(null);
            break;
          case "action_result":
            setActionNotice(msg.error ? String(msg.error) : msg.calendarConfirmed ? "Appointment confirmed on the AI Hidden Leads sales calendar." : msg.saved ? "Your confirmed follow-up details are saved." : "No action taken.");
            break;
          case "audio":
            idleRef.current.generating = true;
            if (handoffRef.current) break;
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
            walkthroughRef.current.continued = false;
            idleRef.current.stage = 'waiting';
            idleRef.current.quietSince = Date.now();
            userLineRef.current += msg.text as string;
            setPartialUser(userLineRef.current);
            break;
          case "turn_complete":
            walkthroughRef.current.text = aspenLineRef.current;
            idleRef.current.generating = false;
            idleRef.current.quietSince = Date.now();
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
      ws.onclose = (event) => {
        clearTimeout(readyTimeout);
        if (generation !== generationRef.current) return;
        if (liveRef.current) {
          stopEverything();
          setError(voiceDisconnectMessage(event.code, event.reason));
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
    } finally {
      if (generation === generationRef.current) startingRef.current = false;
      window.clearTimeout(startupTimeout);
    }
  }, [voice, microphone, captureMode, refreshMicrophones, playPcmChunk, clearPlayback, flushLine, stopEverything, agentId, leadId, prospectId, draft, previewVoice, previewAudioContext, visitorName, consent, testModel, shareToken, onRecommendedPlan, videoAvatar]);

  useEffect(() => stopEverything, [stopEverything]);

  // Auto-connect once when the widget opens (the open tap is the user gesture
  // that unlocks microphone and audio).
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (!compact || !autoStart || autoStartedRef.current) return;
    autoStartedRef.current = true;
    if (previewOnly) void startConversation(true);
    else if(consentReadyRef.current)void startConversation();
  }, [compact, autoStart, previewOnly, startConversation]);

  const onHandoffActive = (active: boolean) => {
    handoffRef.current = active;
    setHandoffActive(active);
    if (active) {
      pauseCapture(); clearPlayback();
      captureRef.current.paused = true; setPaused(true);
      void playCtxRef.current?.suspend();
    } else {
      captureRef.current.paused = false; setPaused(false);
      void playCtxRef.current?.resume();
      if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify({type:'text',text:'The human handoff has ended or was unavailable. Briefly welcome the caller back and continue helping in your business role. Do not claim a manager answered.'}));
    }
  };
  const confirmation = pendingAction ? <VoiceActionConfirmation key={pendingAction.id} action={pendingAction} onAnswer={(approved, contact) => { wsRef.current?.send(JSON.stringify({type:'confirm_action',id:pendingAction.id,approved,contact})); setPendingAction(null); }}/> : null;
  const transferControl = phase === 'live' && handoffToken ? <BrowserVoiceHandoff token={handoffToken} onActive={onHandoffActive} microphone={microphone}/> : null;

  if (!previewOnly && !consentReady) return <div className="space-y-3 p-3 text-foreground">
    {faceFirst && <PersonPortrait name={name} avatarUrl={avatarUrl} />}
    <div className="space-y-3 rounded-md bg-card p-3">
    <p className="text-sm font-semibold">Try a live demo with {name}</p>
    <p className="text-xs text-muted-foreground">This call is recorded. Audio, transcript and AI summary are saved privately for our team to review. A copy is emailed only if you ask. Starting means you agree.</p>
    <Button className="w-full" onClick={()=>{consentReadyRef.current=true;setConsentReady(true);void startConversation();}}><Mic className="mr-2 h-4 w-4"/>Start & agree</Button>
    </div>
  </div>;

  if (previewOnly) return <div className="space-y-2">
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" disabled={phase !== "idle" || replaying} onClick={() => void startConversation(true)} aria-label="Play selected voice">{phase === 'connecting' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4"/>}Play voice</Button>
      <Button size="sm" variant="outline" disabled={phase === "idle" && !replaying} onClick={stopEverything} aria-label="Stop voice preview"><PhoneOff className="mr-2 h-4 w-4"/>Stop</Button>
      {hasReplay && <Button size="sm" variant="outline" disabled={phase !== 'idle' || replaying} onClick={() => void replayLastMessage()} title="Replay saved greeting without another paid request"><RotateCcw className="mr-2 h-4 w-4" />Replay</Button>}
      <span role="status" className="text-xs text-muted-foreground">{replaying ? 'Replaying saved greeting' : phase === "connecting" || phase === 'preview' && !aspenSpeaking ? status : phase === "preview" ? `Playing ${previewVoice || voice}` : `${previewVoice || voice} selected`}</span>
    </div>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </div>;

  // Compact mode: minimal floating-widget layout for phones — status line,
  // two-line scrolling transcript, and a single row of icon buttons.
  const avatarView = videoAvatar?.enabled && !previewOnly ? <SimliAvatar ref={avatarRef} inline={avatarInline || faceFirst} unboxed={faceFirst} avatar={videoAvatar} agentId={agentId} shareToken={shareToken} draft={draft} onLiveChange={live => { setFaceLive(live); if (!live) { avatarLiveRef.current = false; avatarPendingRef.current = false; } }} /> : null;
  if (compact) {
    return (
      <div className="space-y-2 p-2 text-foreground">
        {faceFirst ? <><div className="aspen-person-portrait relative mx-auto"><div className={faceLive ? 'invisible' : ''}><PersonPortrait name={name} avatarUrl={avatarUrl} /></div>{avatarView}</div><p className="mx-auto w-fit rounded-md bg-card px-2 py-1 text-center text-xs font-semibold">Talk to {name}</p></> : avatarView}
        <div className={faceFirst ? 'space-y-2 rounded-md bg-card p-2' : 'space-y-2'}>
        <div className="flex items-center gap-1.5">
          {phase === "connecting" && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />}
          {phase === "live" && !aspenSpeaking && <Mic className="h-3.5 w-3.5 shrink-0 animate-pulse text-primary" />}
          {phase === "live" && aspenSpeaking && <Volume2 className="h-3.5 w-3.5 shrink-0 animate-pulse text-primary" />}
          {phase === "idle" && <MicOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          <p className="min-w-0 break-words text-xs leading-snug text-foreground" role="status">
            {phase === "live" && (
              <span className="font-semibold text-foreground">
                {handoffActive ? "Manager handoff" : paused ? "Paused" : replaying ? "Replaying saved audio" : muted ? "Microphone muted" : aspenSpeaking ? `${name} speaking` : captureMode === "hold" && !held ? "Hold to talk" : "Listening"}
              </span>
            )}
            {phase !== "live" && (phase === "idle" ? "Ready to talk" : status)}
          </p>
        </div>

        {faceFirst && <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={captions ? 'Hide captions' : 'Show captions'} title={captions ? 'Hide captions' : 'Show captions'} aria-expanded={captions} onClick={() => setCaptions(v => !v)}><ChevronsUpDown className="h-4 w-4" /></Button>}
        <div aria-label="Conversation transcript" tabIndex={0} className={`${faceFirst && !captions ? 'hidden' : ''} ${faceFirst ? 'h-12' : 'max-h-[4.5rem]'} space-y-1 overflow-y-auto overscroll-contain rounded-md border border-border bg-background/95 p-1.5`}>
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

        {confirmation}
        {actionNotice && <p role="status" className="text-xs text-primary">{actionNotice}</p>}
        {remainingSeconds !== null && (!faceFirst || captions) && <p className="text-[11px] text-muted-foreground">Demo time remaining: {Math.floor(remainingSeconds/60)}:{String(remainingSeconds%60).padStart(2,'0')}</p>}
        {transferControl}
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
              disabled={handoffActive}
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
              disabled={handoffActive} onClick={togglePause}
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
              disabled={muted || paused || replaying || handoffActive}
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

        {phase === "live" && (!faceFirst || captions) && (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>Mic</span>
            <meter min="0" max="100" value={micLevel} aria-label="Microphone level" className="h-2 w-16" />
            <span>{micLevel > 3 ? "Sound" : "Quiet"}</span>
          </div>
        )}
        {error && <p className="text-[11px] font-semibold text-destructive">{error}</p>}

        {showSettings && (
          <Dialog open={showSettings} onOpenChange={setShowSettings}><DialogContent className="max-h-[85dvh] w-[calc(100vw-24px)] max-w-sm overflow-y-auto"><DialogTitle>Voice settings</DialogTitle><DialogDescription>Microphone and background noise</DialogDescription><div className="space-y-3">
            {phase !== "idle" && <div className="space-y-2 rounded-md border border-border p-3">
              <p role="status" className="text-xs text-foreground">Noise filtering can change now. Microphone and conversation mode are set before each call.</p>
              <Button variant="outline" size="sm" onClick={stopEverything}><PhoneOff className="mr-1.5 h-3.5 w-3.5" />End call to edit settings</Button>
            </div>}
            <label className="block space-y-1 text-xs">Background noise filtering
              <Select value={noiseFilter} onValueChange={value => setNoiseFilter(value as NoiseFilter)}>
                <SelectTrigger aria-label="Microphone sensitivity" className="h-auto min-h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="light">Minimum filtering — quiet room</SelectItem><SelectItem value="balanced">Balanced filtering — everyday</SelectItem><SelectItem value="strong">Strong filtering — noisy room</SelectItem></SelectContent>
              </Select>
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
            {phase === "idle" && <Button className="w-full" onClick={() => { setShowSettings(false); void startConversation(); }}><Mic className="mr-1.5 h-4 w-4" />Start call with these settings</Button>}
          </div></DialogContent></Dialog>
        )}
        </div>
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
        {avatarView}
        <Card className="p-4 space-y-3">
          {confirmation}
        {actionNotice && <p role="status" className="text-xs text-primary">{actionNotice}</p>}
        {remainingSeconds !== null && <p className="text-[11px] text-muted-foreground">Demo time remaining: {Math.floor(remainingSeconds/60)}:{String(remainingSeconds%60).padStart(2,'0')}</p>}
        {transferControl}
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

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1 text-xs">Background noise filtering
              <Select value={noiseFilter} onValueChange={value => setNoiseFilter(value as NoiseFilter)}>
                <SelectTrigger aria-label="Microphone sensitivity"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="light">Minimum filtering — quiet room</SelectItem><SelectItem value="balanced">Balanced filtering — everyday</SelectItem><SelectItem value="strong">Strong filtering — noisy room</SelectItem></SelectContent>
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

          {phase !== "idle" && <div className="flex flex-wrap items-center gap-2">
            <p role="status" className="text-xs text-muted-foreground">Transcript permission, microphone and conversation mode can be changed after ending this call. Noise filtering stays adjustable.</p>
            <Button variant="outline" size="sm" onClick={stopEverything}><PhoneOff className="mr-1.5 h-4 w-4" />End call to edit settings</Button>
          </div>}
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
            {phase === "live" && <Button variant={muted ? "destructive" : "outline"} size="sm" disabled={handoffActive} aria-pressed={muted} onClick={() => {
              if (!muted) pauseCapture();
              captureRef.current.muted = !muted;
              setMuted(!muted);
            }}>{muted ? <MicOff className="mr-2 h-4 w-4" /> : <Mic className="mr-2 h-4 w-4" />}{muted ? "Unmute microphone" : "Mute microphone"}</Button>}
            {phase === "live" && <Button variant={paused ? "default" : "outline"} size="sm" aria-pressed={paused} disabled={handoffActive} onClick={togglePause}>{paused ? <Play className="mr-2 h-4 w-4" /> : <Pause className="mr-2 h-4 w-4" />}{paused ? "Resume" : "Pause"}</Button>}
            {phase === "live" && captureMode === "hold" && <Button
              className="touch-none select-none" variant={held ? "default" : "secondary"} disabled={muted || paused || replaying || handoffActive}
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
