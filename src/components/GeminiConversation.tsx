import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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
import { Mic, MicOff, Volume2, VolumeX, FlaskConical, PhoneOff, Loader2, Play, Pause, Save, RotateCcw, RefreshCw, Settings2, ChevronsUpDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
// This component renders in standalone harnesses (Voice Lab, embeds, tests)
// that never run main.tsx — importing the i18n module here guarantees the
// locale resources exist wherever the panel mounts (same singleton in the app).
import "@/i18n";
import { explicitUiLocale } from "@/lib/uiLocale";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { microphonePcm, shouldSendMicrophone, microphoneGate, microphoneAutoGain, type NoiseFilter, type CaptureMode } from "@/lib/voiceLabAudio";

import VoiceActionConfirmation, { type VoiceAction } from "./VoiceActionConfirmation";
import BrowserVoiceHandoff from "@/components/BrowserVoiceHandoff";
import { voiceIdleAction, homepageWalkthroughDue, type VoiceIdleStage } from '@/lib/voiceIdle';
import { voiceDisconnectMessage } from '@/lib/voiceDisconnect';
import { classifyMicrophoneFailure, isEmbeddedContext } from "@/lib/embeddedContext";
import {campaignVisit, trackCampaignEvent} from '@/lib/campaignTracking';
import { salesPlans, type SalesPlan } from '@/lib/salesActions';
import SimliAvatar, { SOUND_BLOCKED, isVideoStartFailure, type SimliAvatarHandle } from '@/components/SimliAvatar';
import { boundaryForAssistantLine, buildSwapRecap, cutoverReady, dropApologyVariant, INITIAL_SWAP_STATE, PHASE_ENTRY, reconnectTarget, visitorSignalsStepOut, type PersonaBoundary, type PersonaId, type SwapPhase, type SwapState } from '@/lib/personaSwap';
import { PERSONAS, SARA_FACE_ID } from '../../supabase/functions/_shared/personas';
import { ALEX_FACE_ID } from '../../supabase/functions/_shared/alex-guide';
import type { VideoAvatar } from '../../supabase/functions/_shared/video-avatar';
import { PersonPortrait } from '@/components/FloatingPersonFrame';
import { assistantOutput, nextVoiceChunkStart, PAIRED_CAPTION_DELAY_SEC } from '@/lib/avatarAudioTransition';
import { PlaybackCaptions, type PlaybackCaption as Caption } from '@/lib/playbackCaptions';
import { displayNumbers } from '@/lib/displayNumbers';
import PlaybackCaption from '@/components/PlaybackCaption';
import { voiceSessionHeaders } from '@/lib/voiceSessionAuth';

const MICROPHONE_DENIED = "Microphone permission was denied — allow it in your browser and try again.";
/** On-screen only: replaces the mic-denied error when the widget runs inside an embedded preview frame, where the parent frame withholds the microphone and the browser can never show a permission prompt — there is nothing for the visitor to "allow" there. */
const AUDIO_TAP_NEEDED = 'Tap play to enable sound on this phone. Your sign-in and demo allowance are unchanged.';
/** Opening-gate failsafe only: the gate itself lifts on Aspen's first turn_complete (turn-based, not clock-based); this just stops a lost turn from muting the mic forever. */
const OPENING_GATE_FAILSAFE_MS = 60_000;
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
// Same-page-visit memory so pressing play again after Stop resumes instead of re-greeting.
const visitMemory = new Map<string, Turn[]>();
export function resumeRecap(turns: Turn[]) {
  if (!turns.some(t => t.role === "assistant")) return undefined;
  return turns.slice(-8).map(t => `${t.role === "user" ? "Visitor" : "Assistant"}: ${t.text}`).join("\n").slice(-1500);
}
type Phase = "idle" | "connecting" | "live" | "preview";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const WS_URL = SUPABASE_URL.replace(/^https/, "wss") + "/functions/v1/gemini-live-proxy";

/** Calm guidance shown instead of the mic-denied error when the widget is framed by an
 * embedded preview: the parent frame withholds the microphone, so no prompt can ever
 * appear. Opening this same page as its own top-level page is where the prompt works. */
const EmbeddedMicrophoneNotice = ({ compact = false }: { compact?: boolean }) => { const { t } = useTranslation(); return (
  <div role="status" className="space-y-1.5">
    <p className={compact ? "text-[11px] text-muted-foreground" : "text-xs text-muted-foreground"}>{t("voice.embeddedMicNotice")}</p>
    <Button type="button" size="sm" className={compact ? "h-7 text-[11px]" : "h-8 text-xs"} onClick={() => { window.open(window.location.href, "_blank", "noopener"); }}>
      {t("voice.openFullPage")}
    </Button>
  </div>
  ); };

/** Commands the floating shell (Stage 3 minimized bar) can send into a live conversation. */
export interface GeminiShellControls {
  /** TRUE suspend: close the socket and stop burning minutes; the conversation resumes via the reconnect path. */
  suspend: () => void;
  /** Resume a suspended conversation (fresh authorized session + visit-memory recap). */
  resume: () => void;
  /** End the conversation for good. */
  end: () => void;
  toggleMic: () => void;
  toggleSpeaker: () => void;
  replay: () => void;
}
/** Live session snapshot the floating shell renders its Stage 3 bar from. */
export interface GeminiShellState {
  live: boolean;
  connecting: boolean;
  suspended: boolean;
  muted: boolean;
  speakerMuted: boolean;
  hasReplay: boolean;
  replaying: boolean;
  speaking: boolean;
}
export interface GeminiConversationProps { agentId?: string; leadId?: string; prospectId?: string; draft?: boolean; compact?: boolean; name?: string; visitorName?: string; previewVoice?: string; autoStart?: boolean; previewOnly?: boolean; previewAudioContext?: AudioContext; testModel?: string; shareToken?: string; onRecommendedPlan?: (plan: SalesPlan) => void; videoAvatar?: VideoAvatar; avatarInline?: boolean; faceFirst?: boolean; avatarUrl?: string; /** The visitor tapped a launcher that already showed the recording notice; that tap is the agreement. */ consentOnOpen?: boolean; /** Open the paid live session silently before the tap so it starts instantly. */ prewarm?: boolean; onPrewarmed?: (ready: boolean) => void; /** Verified Demo Gate: 'pending' starts the session in the Act 1 host phase (verification before simulation); 'verified' or undefined keeps the standard session. */ verification?: "pending" | "verified"; /** Cold-email invite arrival: asks gemini-session for the invite host phase; honored server-side only when the lead's invite arrival was stamped by the demo-invite resolve. */ invite?: boolean; /** Platform guide: 'alex' starts the authenticated setup-guide session (Alex, support specialist) instead of a tenant agent; honored server-side only for signed-in users. */ guide?: "alex"; /** Fires with each finalized visitor transcript line (used by the demo gate to hear a spoken code). */ onUserTranscript?: (text: string) => void; /** Three-stage widget: the shell fills this ref with live-session commands for its Stage 3 bar. */ shellControlsRef?: { current: GeminiShellControls | null }; /** Three-stage widget: receives the live-session snapshot for the Stage 3 bar. */ onShellState?: (state: GeminiShellState) => void; /** Widget chrome rendered BELOW her face — between the portrait/livebox and the captions/chat panel (the Voice/Type toggle lives here, never above her). */ belowAvatar?: ReactNode; /** Avatar swap (Stage 1): fires when the ACTIVE persona changes at a boundary, so the shell identity (name + portrait) follows the speaker. Never fires when the server flag is off. */ onPersonaChange?: (persona: { id: PersonaId; displayName: string }) => void; }
const GeminiConversation = ({ agentId, leadId, prospectId, draft = false, compact = false, name = "Aspen", visitorName = "", previewVoice, autoStart = false, previewOnly = false, previewAudioContext, testModel, shareToken, onRecommendedPlan, videoAvatar, avatarInline = false, faceFirst = false, avatarUrl, consentOnOpen = false, prewarm = false, onPrewarmed, verification, invite, guide, onUserTranscript, shellControlsRef, onShellState, belowAvatar, onPersonaChange }: GeminiConversationProps) => {
  const { t } = useTranslation();
  const transcriptAriaLabel = (role: "user" | "assistant") => role === "user" ? t("voice.callerTranscript") : t("voice.aspenTranscript");
  // On the gate's pending → verified flip, the next session is the demo's
  // fresh start, not a resume: drop this page visit's stored turns so the
  // proxy delivers the simulation opening instead of the resume line.
  const prevVerificationRef = useRef(verification);
  useEffect(() => {
    if (prevVerificationRef.current === 'pending' && verification === 'verified') {
      visitMemory.delete(agentId || 'homepage');
    }
    prevVerificationRef.current = verification;
  }, [verification, agentId]);
  const onPrewarmedRef = useRef(onPrewarmed); onPrewarmedRef.current = onPrewarmed;
  const onUserTranscriptRef = useRef(onUserTranscript); onUserTranscriptRef.current = onUserTranscript;
  const onPersonaChangeRef = useRef(onPersonaChange); onPersonaChangeRef.current = onPersonaChange;
  // ------------------------------------------------------------------
  // AVATAR SWAP state machine (Stage 1). Everything below is inert
  // unless the server enables the flow: swapEnabledRef is set ONLY from
  // a gemini-session response carrying personaSwapEnabled (the parent
  // demo authorization), which the server stamps only when its
  // AVATAR_SWAP_ENABLED env flag is on. Flag off ⇒ no segment requests,
  // no second avatar instance, no persona callbacks — byte-identical
  // legacy behavior.
  // ------------------------------------------------------------------
  const swapEnabledRef = useRef(false);
  const swapStateRef = useRef<SwapState>({ ...INITIAL_SWAP_STATE });
  const parentSessionIdRef = useRef<string | null>(null);
  const visitorKeyRef = useRef('');
  const businessNameRef = useRef('');
  const preStageRef = useRef<{ boundary: PersonaBoundary; token: string; faceReady: boolean; persona: PersonaId } | null>(null);
  const [preStage, setPreStage] = useState<{ persona: PersonaId; boundary: PersonaBoundary } | null>(null);
  const stagedAvatarRef = useRef<SimliAvatarHandle>(null);
  const [activePersona, setActivePersona] = useState<PersonaId>('aspen');
  /** True while a boundary cut-over executes: the compact status line must
   * show NO connecting spinner or "Connecting…" label at a swap (Ron's
   * smoothness rule) — the outgoing persona's frozen frame + status text
   * stay exactly as they were until the new persona is live. */
  const [swapTransition, setSwapTransition] = useState(false);
  const swapBusyRef = useRef(false);
  const knownNameRef = useRef('');
  const sessionStartedAtRef = useRef(0);
  const warmRef = useRef<{ ready: Promise<boolean>; ok: boolean; activated: boolean; goLive?: () => void } | null>(null);
  const avatarRef = useRef<SimliAvatarHandle>(null);
  const [faceLive, setFaceLive] = useState(false);
  const [captions, setCaptions] = useState(true);
  const avatarLiveRef = useRef(false);
  const avatarRequestedRef = useRef(false);
  const [pendingAction, setPendingAction] = useState<VoiceAction | null>(null);
  const [actionNotice, setActionNotice] = useState('');
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const deadlineRef = useRef(0);
  const [consentReady,setConsentReady]=useState(consentOnOpen);
  const consentReadyRef=useRef(consentOnOpen);
  // True while the voice is held back so it starts together with the moving face.
  const [faceWaiting, setFaceWaiting] = useState(false);
  // True once this session degraded to voice-only because the moving face could not start.
  const [videoFallback, setVideoFallback] = useState(false);
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
  const [speakerMuted, setSpeakerMuted] = useState(false);
  const speakerMutedRef = useRef(false);
  const speakerGainRef = useRef<GainNode | null>(null);
  const [paused, setPaused] = useState(false);
  // Stage 3 true-suspend: the socket is closed (no minute burn) but the
  // conversation is resumable; distinct from the local-only Pause above.
  const [suspended, setSuspended] = useState(false);
  // Opening mic gate: while Aspen's opening turn plays, the client sends
  // silence frames so room noise cannot cut her greeting. Gated by TURN —
  // the gate lifts on her first turn_complete. The failsafe only prevents a
  // permanently muted mic if that turn never completes; it is not the gate.
  const openingGateRef = useRef(false);
  const openingGateSinceRef = useRef(0);
  const [replaying, setReplaying] = useState(false);
  const [hasReplay, setHasReplay] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [aspenSpeaking, setAspenSpeaking] = useState(false);
  const [status, setStatus] = useState(
    "Pick a voice and press Start — then just talk, like a real phone call. You can interrupt her."
  );
  const [error, setError] = useState<string | null>(null);
  const [audioNeedsTap, setAudioNeedsTap] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const signInAction = limitReached && error ? <a href={`/account?next=${encodeURIComponent(window.location.pathname + window.location.search)}`} className="inline-flex w-fit items-center rounded-md border border-primary px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10">Sign in as administrator to keep testing</a> : null;
  const [endedByVisitor, setEndedByVisitor] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micCtxRef = useRef<AudioContext | null>(null);
  const playCtxRef = useRef<AudioContext | null>(null);
  const playTimeRef = useRef(0);
  const captionClockRef = useRef(new PlaybackCaptions());
  const [playbackCaption, setPlaybackCaption] = useState<Caption | null>(null);
  const lastCaptionRef = useRef('');
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
  useEffect(() => {
    let frame = 0;
    const update = () => {
      const ctx = playCtxRef.current;
      const live = ctx ? captionClockRef.current.at(ctx.currentTime) : null;
      // Keep the last spoken line in the same large caption style (no highlight) after she stops talking.
      setPlaybackCaption(previous => {
        const next = live ?? (previous ? { ...previous, word: -1 } : null);
        return previous?.text === next?.text && previous?.word === next?.word ? previous : next;
      });
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, []);
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
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "activity_end" }));
      wsRef.current.send(JSON.stringify({ type: "audio_pause" }));
    }
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
      if (role === "user") onUserTranscriptRef.current?.(text);
      setTurns((prev) => { const next = [...prev, { role, text }]; if (!isPreviewRef.current) visitMemory.set(agentId || "homepage", next); return next; });
    }
    ref.current = "";
    if (role === "user") setPartialUser(""); else setPartialAspen("");
  }, []);

  // Persist visitorName for swap recaps (host learns it before the demo).
  useEffect(() => { if (visitorName) knownNameRef.current = visitorName; }, [visitorName]);

  /** Swap recap for the CURRENT point of the conversation (turns come
   * from visitMemory — flushLine keeps it current — plus this turn's
   * unflushed lines). */
  const currentSwapRecap = useCallback((incoming: PersonaId) => {
    const stored = visitMemory.get(agentId || "homepage") || [];
    const extra: Turn[] = [];
    if (userLineRef.current.trim()) extra.push({ role: "user", text: userLineRef.current.trim() });
    if (aspenLineRef.current.trim()) extra.push({ role: "assistant", text: aspenLineRef.current.trim() });
    return buildSwapRecap([...stored, ...extra], {
      visitorName: knownNameRef.current || visitorName || undefined,
      businessName: businessNameRef.current || undefined,
      facts: [],
    }, incoming);
  }, [agentId, visitorName]);

  /** Authorize one persona segment against the ORIGINAL parent session. */
  const requestSegment = useCallback(async (persona: PersonaId, boundary: PersonaBoundary, opts: { swap: boolean; dropRecovery?: boolean }) => {
    const parentSessionId = parentSessionIdRef.current;
    if (!parentSessionId || !visitorKeyRef.current) return null;
    const headers = await voiceSessionHeaders();
    const { data, error } = await supabase.functions.invoke("gemini-session", {
      headers,
      body: {
        visitorKey: visitorKeyRef.current,
        leadId, prospectId,
        consent: true,
        personaSegment: {
          persona, boundary, parentSessionId,
          swapRecap: currentSwapRecap(persona),
          drops: swapStateRef.current.drops,
          dropRecovery: opts.dropRecovery === true,
          swap: opts.swap,
        },
      },
    });
    if (error || !data?.token) return null;
    return data as { token: string; sessionId: string; persona?: { id: PersonaId; displayName: string; faceId: string | null } };
  }, [leadId, prospectId, currentSwapRecap]);

  // Cut-over machinery is defined after startConversation (it reuses the
  // socket builder); these refs let the message handlers reach it.
  const executeSwapRef = useRef<(boundary: PersonaBoundary) => Promise<void>>(async () => {});
  const dropRecoverRef = useRef<() => void>(() => {});

  /** Arm a boundary: authorize the incoming segment AND pre-connect its
   * face (concealed second instance) while the outgoing persona is still
   * speaking its handoff line. Any failure disarms quietly — the current
   * persona continues words-only (spec §6.5 fallback 1/2). */
  const armSwap = useCallback((boundary: PersonaBoundary) => {
    const state = swapStateRef.current;
    if (!swapEnabledRef.current || preStageRef.current || state.done.includes(boundary) || state.armed.includes(boundary)) return;
    const target = (Object.entries(PHASE_ENTRY).find(([, v]) => v.boundary === boundary)?.[1]) as { boundary: PersonaBoundary; persona: PersonaId } | undefined;
    const persona = boundary === 'return' ? 'aspen' as PersonaId : target?.persona;
    if (!persona) return;
    swapStateRef.current = { ...state, armed: [...state.armed, boundary] };
    void (async () => {
      const segment = await requestSegment(persona, boundary, { swap: true });
      if (!segment) return; // disarmed: words-only continuation
      if (swapStateRef.current.done.includes(boundary) || !liveRef.current) return;
      preStageRef.current = { boundary, token: segment.token, faceReady: !avatarRequestedRef.current, persona };
      if (avatarRequestedRef.current) {
        // Mount the concealed second instance; its start() pre-connects
        // during the outgoing line. Face failure leaves faceReady false
        // and the atomic gate will abort the swap at cut-over.
        setPreStage({ persona, boundary });
      }
    })();
  }, [requestSegment]);
  const armSwapRef = useRef(armSwap); armSwapRef.current = armSwap;

  // Shared local teardown. endSession=true also tells the server the visitor
  // ended the conversation; the Stage 3 suspend path passes false so the
  // server treats the close like a drop and the session stays resumable.
  const teardown = useCallback((endSession: boolean) => {
    // Avatar swap: a full teardown ends the whole persona chain.
    swapEnabledRef.current = false;
    swapStateRef.current = { ...INITIAL_SWAP_STATE };
    parentSessionIdRef.current = null;
    preStageRef.current = null;
    setPreStage(null);
    setActivePersona('aspen');
    setSwapTransition(false);
    swapBusyRef.current = false;
    walkthroughRef.current = {text:'', continued:false};
    idleRef.current = { enabled: false, stage: 'waiting', quietSince: 0, generating: false, requestedAt: 0 };
    setPendingAction(null);
    deadlineRef.current = 0;
    setRemainingSeconds(null);
    setHandoffToken(null);
    handoffRef.current = false;
    setHandoffActive(false);
    openingGateRef.current = false;
    setSuspended(false);
    if(endSession && liveRef.current&&!isPreviewRef.current) {wsRef.current?.send(JSON.stringify({type:'end_session',reason:'user_ended'}));void trackCampaignEvent('voice_ended');}
    generationRef.current += 1;
    warmRef.current = null;
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
    captionClockRef.current.clear(); setPlaybackCaption(p => p ? { ...p, word: -1 } : null);
    setMicLevel(0);
    avatarRef.current?.stop();
    avatarRequestedRef.current = false; setFaceWaiting(false);
    setVideoFallback(false);
    avatarLiveRef.current = false;
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

  /** PARTIAL teardown for a persona cut-over (spec §5.4): closes ONLY the
   * current voice socket (no end_session — the server treats it like the
   * suspend path's drop) and resets per-connection capture state, while
   * the mic stream, both AudioContexts, the caption clock and playback
   * state all survive for the incoming segment. */
  const partialTeardownForSwap = useCallback(() => {
    walkthroughRef.current = {text:'', continued:false};
    idleRef.current = { enabled: false, stage: 'waiting', quietSince: 0, generating: false, requestedAt: 0 };
    setPendingAction(null);
    deadlineRef.current = 0;
    setRemainingSeconds(null);
    setHandoffToken(null);
    handoffRef.current = false;
    setHandoffActive(false);
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
    try { wsRef.current?.close() } catch { /* ignore */ }
    wsRef.current = null;
    flushLine("user");
    flushLine("assistant");
    setAspenSpeaking(false);
  }, [flushLine]);

  const stopEverything = useCallback(() => teardown(true), [teardown]);

  const endByVisitor = useCallback(() => {
    stopEverything();
    setError(null);
    setAudioNeedsTap(false);
    setEndedByVisitor(true);
  }, [stopEverything]);

  // Play a 24 kHz PCM chunk (base64) with gapless scheduling
  const playPcmChunk = useCallback((base64: string, reserved?: ReturnType<PlaybackCaptions['reserve']>) => {
    const captionRun = reserved ?? captionClockRef.current.reserve();
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
    const output = assistantOutput(avatarRequestedRef.current, avatarLiveRef.current, captureRef.current.replaying);
    const pairedVideo = output !== 'local';
    if (pairedVideo) {
      if (!avatarLiveRef.current || !avatarRef.current?.sendPcm24k(base64)) {
        stopEverything(); setError('The moving face disconnected. Press play to reconnect.'); return;
      }
      // Use a silent local clock for captions/lifecycle, never a second audible voice.
      const clockGain = ctx.createGain(); clockGain.gain.value = 0;
      source.connect(clockGain); clockGain.connect(ctx.destination);
    } else {
      const spkGain = ctx.createGain();
      spkGain.gain.value = speakerMutedRef.current ? 0 : 1;
      speakerGainRef.current = spkGain;
      source.connect(spkGain);
      spkGain.connect(ctx.destination);
    }

    const now = ctx.currentTime;
    // Simli renders lips slightly behind the audio it receives; delay the start of each spoken run to match.
    const startAt = nextVoiceChunkStart(now, playTimeRef.current);
    sourcesRef.current.add(source);
    source.start(startAt);
    playTimeRef.current = startAt + buffer.duration;
    // On the paired path the visitor hears Simli's stream, not this local
    // schedule; shift the caption window by the paired-path delay so the word
    // highlight tracks the heard voice (see PAIRED_CAPTION_DELAY_SEC). Local
    // playback stays on the local clock, which is when it is really heard.
    const captionDelay = pairedVideo ? PAIRED_CAPTION_DELAY_SEC : 0;
    captionClockRef.current.audio(startAt + captionDelay, playTimeRef.current + captionDelay, captionRun);
    setAspenSpeaking(true);
    source.onended = () => {
      sourcesRef.current.delete(source);
      if (ctx.currentTime >= playTimeRef.current - 0.05) setAspenSpeaking(false);
      if (sourcesRef.current.size === 0 && captureRef.current.replaying) {
        captureRef.current.replaying = false;
        setReplaying(false);
        avatarRef.current?.setPlaybackMuted(speakerMutedRef.current || captureRef.current.paused);
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
    captionClockRef.current.clear(); setPlaybackCaption(p => p ? { ...p, word: -1 } : null);
    playTimeRef.current = playCtxRef.current?.currentTime ?? 0;
    setAspenSpeaking(false);
  }, []);

  const pauseCapture = useCallback(() => {
    endHold();
    if (captureRef.current.mode === "handsfree" && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "audio_pause" }));
    }
  }, [endHold]);

  // Mic mute toggle shared by the in-panel controls and the Stage 3 shell bar.
  const toggleMicMute = useCallback(() => {
    const next = !captureRef.current.muted;
    if (next) pauseCapture();
    captureRef.current.muted = next;
    setMuted(next);
  }, [pauseCapture]);

  // Pause: stop mic capture, clear active speech/lip-sync, and freeze speaker playback without ending the call.
  const togglePause = useCallback(() => {
    if (captureRef.current.paused) {
      captureRef.current.paused = false;
      setPaused(false);
      void playCtxRef.current?.resume().catch(() => {});
      avatarRef.current?.setPlaybackMuted(speakerMutedRef.current);
    } else {
      pauseCapture();
      clearPlayback();
      captureRef.current.paused = true;
      setPaused(true);
      void playCtxRef.current?.suspend().catch(() => {});
      avatarRef.current?.setPlaybackMuted(true);
    }
  }, [pauseCapture, clearPlayback]);

  // Silence speaker: mute all voice audio while keeping live captions and conversation running.
  const toggleSpeakerMute = useCallback(() => {
    const next = !speakerMutedRef.current;
    speakerMutedRef.current = next;
    setSpeakerMuted(next);
    if (speakerGainRef.current) speakerGainRef.current.gain.value = next ? 0 : 1;
    avatarRef.current?.setPlaybackMuted(next || captureRef.current.paused || captureRef.current.replaying);
    if (next) setCaptions(true);
  }, []);

  const replayLastMessage = useCallback(async () => {
    if (!lastAudioRef.current.length || captureRef.current.paused || captureRef.current.replaying) return;
    try {
      if (!playCtxRef.current || playCtxRef.current.state === "closed") playCtxRef.current = new AudioContext();
      await playCtxRef.current.resume();
      pauseCapture();
      clearPlayback();
      isPreviewRef.current = false;
      captureRef.current.replaying = true;
      avatarRef.current?.setPlaybackMuted(true);
      setReplaying(true);
      captionClockRef.current.text(lastCaptionRef.current);
      lastAudioRef.current.forEach(audio => playPcmChunk(audio));
      captionClockRef.current.complete();
    } catch { captureRef.current.replaying = false; setReplaying(false); setError("Could not replay audio. Check your speaker connection."); }
  }, [pauseCapture, clearPlayback, playPcmChunk]);

  // The moving face could not start (slow connection): keep the call as a voice-only
  // session — still photo stays, Gemini audio plays locally (the existing voice-only
  // mode) and the visitor sees a one-line notice. Her greeting proceeds unchanged.
  const engageVideoFallback = useCallback(() => {
    avatarRef.current?.stop();
    avatarRequestedRef.current = false;
    avatarLiveRef.current = false;
    setFaceLive(false);
    setFaceWaiting(false);
    setVideoFallback(true);
  }, []);

  // Authorize voice concurrently, but never generate/play speech ahead of the face.
  const startFace = useCallback(async (generation: number, silent = false) => {
    setFaceWaiting(true);
    // The avatar view mounts on the same render as the tap; wait one frame for its ref.
    const ok = await new Promise<void>(r => requestAnimationFrame(() => r())).then(() => avatarRef.current?.start({ silent }));
    if (generation !== generationRef.current) { if (ok) avatarRef.current?.stop(); return false; }
    setFaceWaiting(false);
    avatarLiveRef.current = ok === true;
    return ok === true;
  }, []);

  const reconnectRef = useRef({ pending: false, count: 0 });
  const startConversationRef = useRef<(preview?: boolean, warm?: boolean) => Promise<void>>(async () => {});
  const activateWarmRef = useRef<() => Promise<void>>(async () => {});
  const startConversation = useCallback(async (preview = false, warm = false) => {
    // A silently prepared session only needs the tap's audio/microphone unlock.
    if (!preview && !warm && warmRef.current) { await activateWarmRef.current(); return; }
    const reconnecting = reconnectRef.current.pending; reconnectRef.current.pending = false;
    if (!reconnecting) reconnectRef.current.count = 0;
    if (startingRef.current || liveRef.current) return;
    if (!preview && !warm && !consentReadyRef.current) { setConsentReady(false); return; }
    startingRef.current = true;
    let resolveWarm: (ok: boolean) => void = () => {};
    if (warm) warmRef.current = { ready: new Promise<boolean>(r => { resolveWarm = r; }), ok: false, activated: false };
    const warmState = warmRef.current;
    // Before the tap, failures stay invisible and the tap falls back to a normal start.
    const silentWarm = () => warm && !!warmState && !warmState.activated;
    const failWarm = () => { resolveWarm(false); stopEverything(); setError(null); setStatus("Press Start to talk."); onPrewarmedRef.current?.(false); };
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
    setAudioNeedsTap(false);
    setLimitReached(false);
    setEndedByVisitor(false);
    setVideoFallback(false);
    const resumeContext = preview ? undefined : resumeRecap(visitMemory.get(agentId || "homepage") || []);
    setTurns([]);
    setPartialUser("");
    setPartialAspen("");
    aspenLineRef.current = "";
    userLineRef.current = "";
    if (!warm) { setPhase("connecting"); setStatus(preview ? "Preparing your saved greeting…" : "Connecting…"); }
    avatarLiveRef.current = false;
    avatarRequestedRef.current = !preview && !!videoAvatar?.enabled;
    const startupTimeout = window.setTimeout(() => {
      if (warm) { if (generation === generationRef.current && silentWarm() && !warmState?.ok) failWarm(); return; }
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
      const playResume = warm ? Promise.resolve() : playCtx.resume();
      const micCtx = preview || warm ? null : new AudioContext({ sampleRate: 16000 });
      micCtxRef.current = micCtx;
      const micResume = micCtx?.resume();
      // An auto-start effect may run after mobile user activation expires. Check
      // audio before creating billable sessions; the existing play button retries
      // directly from a real tap, rather than misreporting an admin/quota failure.
      await Promise.all([playResume, micResume]);
      if (generation !== generationRef.current) return;
      if (!warm && (playCtx.state !== 'running' || (!isEmbeddedContext() && micCtx && micCtx.state !== 'running'))) throw new Error(AUDIO_TAP_NEEDED);
      // A video-start failure (startup timeout after the retries, or the provider
      // dropping the session mid-startup) degrades to a voice-only session instead of
      // aborting the call. Refusals, sound blocks and cancels still reject as before.
      const faceReady: Promise<{ started: boolean; fallback: boolean }> = avatarRequestedRef.current
        ? startFace(generation, warm).then(
            (ok) => ({ started: ok, fallback: false }),
            (err: unknown) => {
              if (isVideoStartFailure(err)) return { started: false, fallback: true };
              throw err;
            },
          )
        : Promise.resolve({ started: true, fallback: false });
      let visitorKey = crypto.randomUUID();
      try { localStorage.setItem("gemini-visitor-key", visitorKey); } catch { /* ignore */ }
      // Prepare the server's business snapshot alongside permission/audio setup, only after a tap.
      const microphoneReady = preview || warm ? Promise.resolve(null) : navigator.mediaDevices.getUserMedia({
        audio: { deviceId: microphone === "default" ? undefined : { exact: microphone }, echoCancellation: true, noiseSuppression: true, autoGainControl: microphoneAutoGain(captureMode, noiseFilterRef.current) },
      }).then(stream => {
        if (generation !== generationRef.current) { stream.getTracks().forEach(t => t.stop()); return null; }
        micStreamRef.current = stream;
        return stream;
      }, (micError: unknown) => {
        // Only a refusal from the microphone request itself is a microphone permission problem.
        if (micError instanceof Error && (micError.name === "NotAllowedError" || micError.name === "SecurityError")) {
          if (isEmbeddedContext()) { setError(MICROPHONE_DENIED); return null; }
          throw new Error(MICROPHONE_DENIED);
        }
        throw micError;
      });
      const requestSession = (key: string) =>
        voiceSessionHeaders().then(headers => {
          if (generation !== generationRef.current) throw new Error('Demo start cancelled.');
          return supabase.functions.invoke("gemini-session", { headers, body: { visitorKey: key, agentId, leadId, prospectId, draft, preview, voice: previewVoice || voice, model: testModel, campaign:campaignVisit(), hour: new Date().getHours(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, locale: explicitUiLocale(), visitorName, consent: !warm && consentReadyRef.current, prewarm: warm, share: shareToken, resumeContext, reconnect: reconnecting && !!resumeContext, verification, invite, guide } });
        });
      const [initialSession, stream, , , faceOutcome] = await Promise.all([
        requestSession(visitorKey),
        microphoneReady,
        playResume,
        micResume,
        faceReady,
      ]);
      if (!faceOutcome.started) {
        if (!faceOutcome.fallback) throw new Error('The moving face could not connect. Please press play to try again.');
        engageVideoFallback();
      }
      let session = initialSession;
      if (session.data?.allowed === false && session.data?.code === 'VISITOR_DAILY_LIMIT') {
        visitorKey = crypto.randomUUID();
        try { localStorage.setItem("gemini-visitor-key", visitorKey); } catch { /* ignore */ }
        session = await requestSession(visitorKey);
      }
      if (generation !== generationRef.current) { stream?.getTracks().forEach(t => t.stop()); return; }
      if (stream) void refreshMicrophones();
      if (!warm && (playCtx.state !== "running" || (stream && micCtx && micCtx.state !== "running"))) {
        await Promise.all([playCtx.resume(), micCtx?.resume()]);
        if (playCtx.state !== 'running' || (stream && micCtx && micCtx.state !== 'running')) throw new Error(AUDIO_TAP_NEEDED);
      }
      const { data: authorized, error: authError } = session;
      if (authError) {
        const detail = authError instanceof FunctionsHttpError ? await authError.context.json().catch(() => null) : null;
        throw new Error(detail?.error || authError.message);
      }
      if (authorized?.allowed === false) {
        if (silentWarm()) { failWarm(); return; }
        stopEverything();
        setStatus('Daily voice allowance reached');
        setError(authorized.error);
        setLimitReached(authorized.code === 'VISITOR_DAILY_LIMIT');
        return;
      }
      if (generation !== generationRef.current) { stream?.getTracks().forEach(t => t.stop()); return; }
      deadlineRef.current = Date.now() + Number(authorized.maxSeconds || 300) * 1000;
      // Avatar swap arming (Stage 1): only a parent business-demo
      // authorization can enable the flow, and only when the server says
      // so. Segment/drop starts never re-arm from here (the swap machine
      // manages its own chain), and flag-off responses change nothing.
      if (!preview && authorized.personaSwapEnabled === true && (leadId || prospectId)) {
        swapEnabledRef.current = true;
        parentSessionIdRef.current = String(authorized.sessionId || '');
        visitorKeyRef.current = visitorKey;
        businessNameRef.current = String(authorized.businessName || '');
        swapStateRef.current = { ...INITIAL_SWAP_STATE };
        setActivePersona('aspen');
      }
      homepageWalkthroughRef.current = authorized.homepageSales === true;
      idleRef.current = { enabled: (authorized.idleChecks === true || authorized.homepageSales === true) && !preview, stage: 'waiting', quietSince: Date.now(), generating: true, requestedAt: 0 };
      setHandoffToken(authorized.handoffToken || null);
      const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(authorized.token)}&capture=${captureMode}${warm ? '&hold=1' : ''}`);
      wsRef.current = ws;

      ws.onopen = () => !silentWarm() && setStatus(preview ? "Voice connected · generating your greeting…" : "Connecting…");

      // If the voice service never signals ready, don't hang on "connecting" forever
      const readyTimeout = setTimeout(() => {
        if (silentWarm()) { if (!warmState?.ok) failWarm(); return; }
        if (!liveRef.current) {
          setError("The voice service did not respond in time. Please try again.");
          stopEverything();
        }
      }, 15000);

      const goLive = () => {
        if (generation !== generationRef.current) return;
        liveRef.current = true;
        // Arm the opening mic gate: silence frames until her first turn completes.
        openingGateRef.current = true;
        openingGateSinceRef.current = performance.now();
        if(!preview)void trackCampaignEvent('voice_started');
        setPhase(preview ? "preview" : "live");
        setStatus(preview ? "Preparing greeting audio…" : captureMode === "hold" ? "Live — hold to talk" : "Live — hands-free");
        const micCtx = micCtxRef.current, stream = micStreamRef.current;
        if (!micCtx || !stream) return;
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
          // Live caller audio must reach provider VAD even during speech (including
          // silent paired-video clocks). Pause/mute/replay still block capture.
          if (capture.paused) return;
          if (!shouldSendMicrophone(capture.mode, capture.held, capture.muted, capture.replaying)) return;
          const gate = microphoneGate(rms, noiseFilterRef.current, performance.now(), gateOpenUntil);
          if (gate.open && sourcesRef.current.size === 0 && !idleRef.current.generating) {
            idleRef.current.stage = 'waiting';
            idleRef.current.quietSince = Date.now();
          }
          gateOpenUntil = gate.openUntil;
          // Opening gate: until Aspen's first turn completes, every frame is
          // silence — ambient noise and side remarks cannot interrupt the
          // greeting, and the server VAD hears a clean boundary.
          let openingGate = openingGateRef.current;
          if (openingGate && performance.now() - openingGateSinceRef.current >= OPENING_GATE_FAILSAFE_MS) {
            openingGateRef.current = false;
            openingGate = false;
          }
          const pcm = microphonePcm(capture.mode === "hold" || (gate.open && !openingGate) ? input : new Float32Array(input.length), e.inputBuffer.sampleRate);
          const bytes = new Uint8Array(pcm.buffer);
          let binary = "";
          for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
          ws.send(JSON.stringify({ type: "audio", data: btoa(binary) }));
        };
        source.connect(node);
        node.connect(micCtx.destination);
      };

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
            if (warm && warmState) {
              warmState.goLive = goLive; warmState.ok = true; resolveWarm(true);
              if (!warmState.activated) { setStatus("Ready to talk"); onPrewarmedRef.current?.(true); }
              break;
            }
            goLive();
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
            if (!captureRef.current.paused) playPcmChunk(msg.data as string);
            break;
          case "interrupted":
            clearPlayback();
            flushLine("assistant");
            if (currentAudioRef.current.length) { lastAudioRef.current = currentAudioRef.current; setHasReplay(true); }
            currentAudioRef.current = [];
            break;
          case "aspen_transcript":
            aspenLineRef.current += msg.text as string;
            captionClockRef.current.text(msg.text as string);
            setPartialAspen(aspenLineRef.current);
            // Avatar swap: watch the GROWING line for a boundary anchor —
            // arming mid-line is what gives the incoming persona its
            // pre-connect head start (the outgoing line is the cover).
            if (swapEnabledRef.current && liveRef.current) {
              const boundary = boundaryForAssistantLine(aspenLineRef.current, swapStateRef.current);
              if (boundary) armSwapRef.current(boundary);
            }
            break;
          case "user_transcript":
            walkthroughRef.current.continued = false;
            idleRef.current.stage = 'waiting';
            idleRef.current.quietSince = Date.now();
            userLineRef.current += msg.text as string;
            setPartialUser(userLineRef.current);
            // Soft B2 trigger: the visitor ending the try-out arms the
            // step-out late; Sara's reply still covers the swap.
            if (swapEnabledRef.current && liveRef.current && swapStateRef.current.phase === 'simulation' && visitorSignalsStepOut(userLineRef.current)) {
              swapStateRef.current = { ...swapStateRef.current, pendingStepout: true };
            }
            break;
          case "turn_complete": {
            // Her opening turn just finished: the mic gate lifts (turn-based).
            openingGateRef.current = false;
            lastCaptionRef.current = aspenLineRef.current;
            captionClockRef.current.complete();
            walkthroughRef.current.text = aspenLineRef.current;
            idleRef.current.generating = false;
            idleRef.current.quietSince = Date.now();
            if (currentAudioRef.current.length) { lastAudioRef.current = currentAudioRef.current; setHasReplay(true); }
            currentAudioRef.current = [];
            // Avatar swap: a boundary executes BETWEEN turns — the
            // completed line was the cover. Checked before the flush so
            // the recap builder still sees this line; executeSwap falls
            // back to finalizing the turn itself when it aborts.
            const completedLine = aspenLineRef.current;
            let swapHandled = false;
            if (swapEnabledRef.current && liveRef.current && !preview) {
              const state = swapStateRef.current;
              const boundary = boundaryForAssistantLine(completedLine, state)
                ?? (state.phase === 'simulation' && state.pendingStepout && state.armed.includes('stepout') ? 'stepout' as PersonaBoundary : null);
              if (boundary && state.armed.includes(boundary) && !state.done.includes(boundary)) {
                swapHandled = true;
                void executeSwapRef.current(boundary);
              } else if (state.pendingStepout && !state.armed.includes('stepout')) {
                // The visitor asked to stop, but Sara never spoke an
                // anchor and nothing is staged: arm now — her NEXT reply
                // becomes the cover and the swap follows it.
                swapStateRef.current = { ...state, pendingStepout: false };
                armSwapRef.current('stepout');
              }
            }
            if (!swapHandled) {
              flushLine("user");
              flushLine("assistant");
              if (preview) {
                previewDoneRef.current = true;
                if (sourcesRef.current.size === 0) stopEverything();
              }
            }
            break;
          }
          case "error":
            if (silentWarm()) { failWarm(); break; }
            resolveWarm(false);
            setError(String(msg.message || "Voice service error"));
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
        if (generation !== generationRef.current) return;
        if (silentWarm()) { failWarm(); return; }
        resolveWarm(false);
        setError("Could not connect to the voice service.");
        stopEverything();
      };
      ws.onclose = (event) => {
        clearTimeout(readyTimeout);
        if (generation !== generationRef.current) return;
        if (liveRef.current) {
          stopEverything();
          // Avatar swap: an UNPLANNED drop inside a persona segment
          // recovers the SAME persona (segment re-authorization with the
          // rotating drop apology) — never a restart, never a switch.
          if (swapEnabledRef.current && (event.code === 1006 || event.code === 1011)) { dropRecoverRef.current(); return; }
          // Hosting can drop long-lived sockets (1006/1011); quietly resume the same conversation a few times.
          if ((event.code === 1006 || event.code === 1011) && reconnectRef.current.count < 3) {
            reconnectRef.current = { pending: true, count: reconnectRef.current.count + 1 };
            setStatus("Reconnecting…");
            window.setTimeout(() => { void startConversationRef.current(); }, 400);
            return;
          }
          setError(voiceDisconnectMessage(event.code, event.reason));
        } else if (silentWarm()) {
          failWarm();
        } else {
          resolveWarm(false);
          setPhase("idle");
          setStatus("Conversation ended. Press Start to begin again.");
          setError((prev) => prev ?? "The connection closed before the session started. Try again.");
        }
      };
    } catch (e) {
      if (generation !== generationRef.current) return;
      if (silentWarm()) { failWarm(); return; }
      resolveWarm(false);
      stopEverything();
      if (e instanceof Error && (e.message === AUDIO_TAP_NEEDED || e.name === 'NotAllowedError' || e.message === SOUND_BLOCKED)) {
        setAudioNeedsTap(true);
        setStatus('Tap play to enable sound');
        setError(null);
        return;
      }
      setError(
        e instanceof Error && e.name === "NotAllowedError"
          ? SOUND_BLOCKED
          : e instanceof Error ? e.message : "Could not start. Check your microphone and try again."
      );
    } finally {
      if (generation === generationRef.current) startingRef.current = false;
      window.clearTimeout(startupTimeout);
    }
  }, [voice, microphone, captureMode, refreshMicrophones, playPcmChunk, clearPlayback, flushLine, stopEverything, agentId, leadId, prospectId, draft, previewVoice, previewAudioContext, visitorName, consent, testModel, shareToken, onRecommendedPlan, videoAvatar, startFace]);

  startConversationRef.current = startConversation;
  useEffect(() => stopEverything, [stopEverything]);

  // ------------------------------------------------------------------
  // AVATAR SWAP — socket builder + cut-over + drop recovery.
  // connectSegmentSocket mirrors the main start path's socket wiring
  // (ready → goLive-equivalent: mic node creation + opening gate; the
  // same message switch) but runs against a PRE-AUTHORIZED segment token
  // and the SURVIVING mic/playback contexts. It is used by both the
  // planned cut-over and the unplanned-drop recovery.
  // ------------------------------------------------------------------
  const connectSegmentSocket = useCallback((token: string) => {
    const generation = generationRef.current;
    clearPlayback();
    currentAudioRef.current = [];
    lastAudioRef.current = [];
    setHasReplay(false);
    aspenLineRef.current = "";
    userLineRef.current = "";
    setPartialUser("");
    setPartialAspen("");
    setTurns([...(visitMemory.get(agentId || "homepage") || [])]);
    sessionStartedAtRef.current = Date.now();
    const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}&capture=${captureMode}`);
    wsRef.current = ws;
    const goLiveSegment = () => {
      if (generation !== generationRef.current) return;
      liveRef.current = true;
      openingGateRef.current = true;
      openingGateSinceRef.current = performance.now();
      setPhase("live");
      setStatus(captureMode === "hold" ? "Live — hold to talk" : "Live — hands-free");
      const micCtx = micCtxRef.current, stream = micStreamRef.current;
      if (!micCtx || !stream) return;
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
        if (++frame % 4 === 0) setMicLevel(Math.min(100, Math.round(rms * 500)));
        const capture = captureRef.current;
        if (capture.paused) return;
        if (!shouldSendMicrophone(capture.mode, capture.held, capture.muted, capture.replaying)) return;
        const gate = microphoneGate(rms, noiseFilterRef.current, performance.now(), gateOpenUntil);
        if (gate.open && sourcesRef.current.size === 0 && !idleRef.current.generating) {
          idleRef.current.stage = 'waiting';
          idleRef.current.quietSince = Date.now();
        }
        gateOpenUntil = gate.openUntil;
        let openingGate = openingGateRef.current;
        if (openingGate && performance.now() - openingGateSinceRef.current >= OPENING_GATE_FAILSAFE_MS) {
          openingGateRef.current = false;
          openingGate = false;
        }
        const pcm = microphonePcm(capture.mode === "hold" || (gate.open && !openingGate) ? input : new Float32Array(input.length), e.inputBuffer.sampleRate);
        const bytes = new Uint8Array(pcm.buffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        ws.send(JSON.stringify({ type: "audio", data: btoa(binary) }));
      };
      source.connect(node);
      node.connect(micCtx.destination);
    };
    const readyTimeout = window.setTimeout(() => {
      if (generation === generationRef.current && !liveRef.current) {
        // The incoming segment never became ready: the call cannot
        // continue on a dead socket — end cleanly rather than hang.
        setError("The voice service did not respond in time. Please try again.");
        stopEverything();
      }
    }, 15000);
    ws.onmessage = (event) => {
      if (generation !== generationRef.current) return;
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(event.data as string); } catch { return; }
      switch (msg.type) {
        case "ready":
          window.clearTimeout(readyTimeout);
          goLiveSegment();
          break;
        case "recommended_plan": {
          const plan = salesPlans.find(value => value === msg.plan);
          if (plan) onRecommendedPlan?.(plan);
          break;
        }
        case "confirm_action": setPendingAction(msg as unknown as VoiceAction); break;
        case "cancel_action": setPendingAction(null); break;
        case "action_result":
          setActionNotice(msg.error ? String(msg.error) : msg.calendarConfirmed ? "Appointment confirmed on the AI Hidden Leads sales calendar." : msg.saved ? "Your confirmed follow-up details are saved." : "No action taken.");
          break;
        case "audio":
          idleRef.current.generating = true;
          if (handoffRef.current) break;
          if (currentAudioRef.current.length < 6000) currentAudioRef.current.push(msg.data as string);
          if (!captureRef.current.paused) playPcmChunk(msg.data as string);
          break;
        case "interrupted":
          clearPlayback();
          flushLine("assistant");
          if (currentAudioRef.current.length) { lastAudioRef.current = currentAudioRef.current; setHasReplay(true); }
          currentAudioRef.current = [];
          break;
        case "aspen_transcript": {
          aspenLineRef.current += msg.text as string;
          captionClockRef.current.text(msg.text as string);
          setPartialAspen(aspenLineRef.current);
          if (swapEnabledRef.current && liveRef.current) {
            const boundary = boundaryForAssistantLine(aspenLineRef.current, swapStateRef.current);
            if (boundary) armSwapRef.current(boundary);
          }
          break;
        }
        case "user_transcript":
          walkthroughRef.current.continued = false;
          idleRef.current.stage = 'waiting';
          idleRef.current.quietSince = Date.now();
          userLineRef.current += msg.text as string;
          setPartialUser(userLineRef.current);
          if (swapEnabledRef.current && liveRef.current && swapStateRef.current.phase === 'simulation' && visitorSignalsStepOut(userLineRef.current)) {
            swapStateRef.current = { ...swapStateRef.current, pendingStepout: true };
          }
          break;
        case "turn_complete": {
          openingGateRef.current = false;
          lastCaptionRef.current = aspenLineRef.current;
          captionClockRef.current.complete();
          walkthroughRef.current.text = aspenLineRef.current;
          idleRef.current.generating = false;
          idleRef.current.quietSince = Date.now();
          if (currentAudioRef.current.length) { lastAudioRef.current = currentAudioRef.current; setHasReplay(true); }
          currentAudioRef.current = [];
          const completedLine = aspenLineRef.current;
          let swapHandled = false;
          if (swapEnabledRef.current && liveRef.current) {
            const state = swapStateRef.current;
            const boundary = boundaryForAssistantLine(completedLine, state)
              ?? (state.phase === 'simulation' && state.pendingStepout && state.armed.includes('stepout') ? 'stepout' as PersonaBoundary : null);
            if (boundary && state.armed.includes(boundary) && !state.done.includes(boundary)) {
              swapHandled = true;
              void executeSwapRef.current(boundary);
            } else if (state.pendingStepout && !state.armed.includes('stepout')) {
              swapStateRef.current = { ...state, pendingStepout: false };
              armSwapRef.current('stepout');
            }
          }
          if (!swapHandled) { flushLine("user"); flushLine("assistant"); }
          break;
        }
        case "error":
          setError(String(msg.message || "Voice service error"));
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
      if (generation !== generationRef.current) return;
      setError("Could not connect to the voice service.");
      stopEverything();
    };
    ws.onclose = (event) => {
      window.clearTimeout(readyTimeout);
      if (generation !== generationRef.current) return;
      if (liveRef.current) {
        stopEverything();
        if (swapEnabledRef.current && (event.code === 1006 || event.code === 1011)) { dropRecoverRef.current(); return; }
        if ((event.code === 1006 || event.code === 1011) && reconnectRef.current.count < 3) {
          reconnectRef.current = { pending: true, count: reconnectRef.current.count + 1 };
          setStatus("Reconnecting…");
          window.setTimeout(() => { void startConversationRef.current(); }, 400);
          return;
        }
        setError(voiceDisconnectMessage(event.code, event.reason));
      } else {
        setPhase("idle");
        setStatus("Conversation ended. Press Start to begin again.");
      }
    };
  }, [agentId, captureMode, clearPlayback, flushLine, onRecommendedPlan, playPcmChunk, stopEverything]);

  /** ATOMIC CUT-OVER (spec §5.4/§6.2 corrected order): the gate decides
   * BEFORE anything visible changes; then the old face freezes (its last
   * keyed frame covers the reveal), audio routing re-points to the
   * incoming instance, the old socket closes last (partial teardown),
   * and the new socket opens on the pre-authorized token. No phase
   * change, no status change, no spinner: swapTransition only suppresses
   * the connecting UI while phase stays 'live'. */
  executeSwapRef.current = async (boundary: PersonaBoundary) => {
    const staged = preStageRef.current;
    const state = swapStateRef.current;
    const finalizeTurn = () => { flushLine("user"); flushLine("assistant"); };
    if (swapBusyRef.current) { finalizeTurn(); return; }
    if (!staged || staged.boundary !== boundary || !liveRef.current) { finalizeTurn(); return; }
    if (!cutoverReady({ authorized: true, videoRequested: avatarRequestedRef.current, faceReady: staged.faceReady })) {
      // Abort: the pre-stage didn't complete — current persona continues
      // words-only; nothing about the live call was touched.
      preStageRef.current = null;
      setPreStage(null);
      finalizeTurn();
      return;
    }
    swapBusyRef.current = true;
    setSwapTransition(true);
    const incoming = staged.persona;
    try {
      // 1) Re-point paired audio + reveal the incoming face; freeze the
      //    outgoing face as the cover (keeper election: the OUTGOING
      //    instance keeps its frame painted through the reveal).
      if (avatarRequestedRef.current) {
        const outgoing = avatarRef.current;
        outgoing?.setFrameKeeper?.(true);
        stagedAvatarRef.current?.setFrameKeeper?.(false);
        avatarRef.current = stagedAvatarRef.current;
        setPreStage(null);
        preStageRef.current = null;
        outgoing?.freeze?.();
      } else {
        preStageRef.current = null;
        setPreStage(null);
      }
      // 2) Partial teardown: old socket closes now (no end_session), mic
      //    and audio contexts survive; the completed turns flush here.
      partialTeardownForSwap();
      // 3) State + shell identity move to the incoming persona.
      const nextPhase: SwapPhase = boundary === 'doorway' ? 'simulation' : boundary === 'stepout' ? 'close' : boundary === 'meet-alex' ? 'alex-guest' : 'close';
      swapStateRef.current = {
        ...swapStateRef.current,
        phase: nextPhase,
        persona: incoming,
        segment: swapStateRef.current.segment + 1,
        done: [...swapStateRef.current.done, boundary],
        pendingStepout: false,
      };
      setActivePersona(incoming);
      onPersonaChangeRef.current?.({ id: incoming, displayName: PERSONAS[incoming].displayName });
      setFaceLive(avatarRequestedRef.current);
      // 4) Open the incoming segment's socket on the pre-authorized token.
      connectSegmentSocket(staged.token);
      // Boundary analytics through the proxy's log-only message.
      window.setTimeout(() => { try { wsRef.current?.send(JSON.stringify({ type: 'persona_handoff', boundary, to: incoming })); } catch { /* best effort */ } }, 600);
    } finally {
      swapBusyRef.current = false;
      setSwapTransition(false);
    }
  };

  /** UNPLANNED drop recovery: re-authorize the SAME persona as a segment
   *  of the original parent and reconnect — the proxy's personaDrop
   *  opening speaks ONE rotating blip apology and continues from the
   *  recap. The face instance is untouched (same persona, same face).
   *  Drop counting is shared across the whole conversation, so the
   *  rotation never repeats a wording back-to-back. */
  dropRecoverRef.current = () => {
    const state = swapStateRef.current;
    swapStateRef.current = { ...state, drops: state.drops + 1 };
    if (state.phase === 'host' || !parentSessionIdRef.current) {
      // Host-phase drops keep the legacy reconnect path untouched.
      if (reconnectRef.current.count < 3) {
        reconnectRef.current = { pending: true, count: reconnectRef.current.count + 1 };
        setStatus("Reconnecting…");
        window.setTimeout(() => { void startConversationRef.current(); }, 400);
      } else {
        setError(voiceDisconnectMessage(1006, ''));
      }
      return;
    }
    setSwapTransition(true);
    void (async () => {
      const target = reconnectTarget(swapStateRef.current, parentSessionIdRef.current);
      const segment = target.personaSegment
        ? await requestSegment(target.personaSegment.persona, target.personaSegment.boundary, { swap: false, dropRecovery: true })
        : null;
      if (!segment) {
        setSwapTransition(false);
        setError('The connection dropped and could not be restored. Press play to reconnect.');
        return;
      }
      // Same persona returns: arm the mic gate for her first turn, keep
      // the shell identity exactly as it was, reconnect the socket.
      generationRef.current += 1;
      liveRef.current = false;
      connectSegmentSocket(segment.token);
      setSwapTransition(false);
    })();
  };

  // Persona pre-stage effect: when armSwap mounts the concealed second
  // instance, start it (silent — its audio element stays muted; it has
  // nothing to play until cut-over) and record frame readiness on the
  // staged entry. Start failures leave faceReady false → the atomic gate
  // aborts the swap and the current persona continues words-only.
  useEffect(() => {
    if (!preStage) return;
    let cancelled = false;
    void (async () => {
      // The instance mounts on this render; wait one frame for its ref.
      await new Promise<void>(r => requestAnimationFrame(() => r()));
      if (cancelled) return;
      try {
        const ok = await stagedAvatarRef.current?.start({ silent: true });
        if (!cancelled && ok && preStageRef.current?.boundary === preStage.boundary) {
          preStageRef.current = { ...preStageRef.current, faceReady: true };
        }
      } catch { /* gate aborts the swap; words-only continuation */ }
    })();
    return () => { cancelled = true; };
  }, [preStage]);

  // TRUE SUSPEND (Stage 3 pause): close the socket and release mic/avatar/
  // audio locally WITHOUT an end_session send, so no minutes burn while the
  // visitor browses, and flag the next start as a reconnect — it re-authorizes
  // with the visit-memory recap and Aspen resumes instead of re-greeting.
  const suspendConversation = useCallback(() => {
    if (!liveRef.current || isPreviewRef.current) return;
    reconnectRef.current = { pending: true, count: 0 };
    teardown(false);
    setSuspended(true);
    setStatus("Paused — press play to pick up right where you left off.");
  }, [teardown]);

  const resumeConversation = useCallback(() => {
    setSuspended(false);
    void startConversationRef.current();
  }, []);

  // Publish the live-session snapshot + command surface for the floating
  // shell's Stage 3 bar (FloatingPersonFrame renders it; the widget wiring
  // passes these through).
  const onShellStateRef = useRef(onShellState); onShellStateRef.current = onShellState;
  useEffect(() => {
    onShellStateRef.current?.({
      live: phase === "live",
      connecting: phase === "connecting",
      suspended,
      muted,
      speakerMuted,
      hasReplay,
      replaying,
      speaking: aspenSpeaking,
    });
  }, [phase, suspended, muted, speakerMuted, hasReplay, replaying, aspenSpeaking]);
  useEffect(() => {
    if (!shellControlsRef) return;
    shellControlsRef.current = {
      suspend: suspendConversation,
      resume: resumeConversation,
      end: endByVisitor,
      toggleMic: toggleMicMute,
      toggleSpeaker: toggleSpeakerMute,
      replay: () => { void replayLastMessage(); },
    };
    return () => { shellControlsRef.current = null; };
  }, [shellControlsRef, suspendConversation, resumeConversation, endByVisitor, toggleMicMute, toggleSpeakerMute, replayLastMessage]);

  // The tap only unlocks sound/microphone, then the already-connected session greets.
  activateWarmRef.current = async () => {
    const w = warmRef.current;
    if (!w || w.activated) return;
    if (!consentReadyRef.current) { setConsentReady(false); return; }
    w.activated = true;
    const generation = generationRef.current;
    setPhase("connecting"); setStatus("Connecting…"); setError(null); setAudioNeedsTap(false); setLimitReached(false); setEndedByVisitor(false);
    // All unlocks start synchronously inside the tap.
    const playCtx = playCtxRef.current && playCtxRef.current.state !== 'closed' ? playCtxRef.current : new AudioContext();
    playCtxRef.current = playCtx;
    const playResume = playCtx.resume();
    const micCtx = new AudioContext({ sampleRate: 16000 });
    micCtxRef.current = micCtx;
    const micResume = micCtx.resume();
    const faceSound = avatarRequestedRef.current ? avatarRef.current?.activate() : undefined;
    void faceSound?.catch(() => {});
    const micRequest = navigator.mediaDevices.getUserMedia({
      audio: { deviceId: microphone === "default" ? undefined : { exact: microphone }, echoCancellation: true, noiseSuppression: true, autoGainControl: microphoneAutoGain(captureMode, noiseFilterRef.current) },
    }).catch((micError: unknown) => {
      if (micError instanceof Error && (micError.name === "NotAllowedError" || micError.name === "SecurityError")) {
        if (isEmbeddedContext()) { setError(MICROPHONE_DENIED); return null; }
        throw new Error(MICROPHONE_DENIED);
      }
      throw micError;
    });
    try {
      const timeout = new Promise<boolean>(r => window.setTimeout(() => r(false), 15000));
      const [stream, ready] = await Promise.all([micRequest, Promise.race([w.ready, timeout]), playResume, micResume]);
      if (generation !== generationRef.current) { stream?.getTracks().forEach(t => t.stop()); return; }
      micStreamRef.current = stream;
      if (stream) void refreshMicrophones();
      if (!ready) throw new Error("The voice service did not respond in time. Please try again.");
      await faceSound;
      if (avatarRequestedRef.current && !avatarLiveRef.current) throw new Error('The moving face could not connect. Please press play to try again.');
      if (playCtx.state !== 'running' || (stream && micCtx.state !== 'running')) throw new Error(AUDIO_TAP_NEEDED);
      if (wsRef.current?.readyState !== WebSocket.OPEN) throw new Error("The connection closed before the session started. Try again.");
      wsRef.current.send(JSON.stringify({ type: 'begin', consent: true }));
      w.goLive?.();
    } catch (e) {
      if (generation !== generationRef.current) return;
      stopEverything();
      if (e instanceof Error && (e.message === AUDIO_TAP_NEEDED || e.name === 'NotAllowedError' || e.message === SOUND_BLOCKED)) {
        setAudioNeedsTap(true); setStatus('Tap play to enable sound'); setError(null); return;
      }
      setError(e instanceof Error ? e.message : "Could not start. Check your microphone and try again.");
    }
  };

  // Prepare once on mount; never repeats, so a visitor who never taps costs one session.
  const prewarmedRef = useRef(false);
  useEffect(() => {
    if (!prewarm || previewOnly || prewarmedRef.current) return;
    prewarmedRef.current = true;
    void startConversation(false, true);
  }, [prewarm, previewOnly, startConversation]);

  // A later launcher tap (after the recording notice was shown) also counts as agreement.
  useEffect(() => { if (consentOnOpen && !consentReadyRef.current) { consentReadyRef.current = true; setConsentReady(true); } }, [consentOnOpen]);
  // Only consume auto-start when a call actually begins, so a widget mounted before the
  // launcher tap still starts on that single tap (no second "Tap to talk" needed).
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (!compact || !autoStart || autoStartedRef.current) return;
    if (previewOnly) { autoStartedRef.current = true; void startConversation(true); }
    else if (consentReadyRef.current || consentReady) { autoStartedRef.current = true; void startConversation(); }
  }, [compact, autoStart, previewOnly, startConversation, consentReady]);

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

  if (!previewOnly && !consentReady && !prewarm) return <div className="space-y-3 p-3 text-foreground">
    {faceFirst && <PersonPortrait name={name} avatarUrl={avatarUrl} />}
    {belowAvatar}
    <div className="space-y-3 rounded-md bg-card p-3">
    <p className="text-sm font-semibold">{t("voice.consentTitle", { name })}</p>
    <p className="text-xs text-muted-foreground">{t("voice.consentBody")}</p>
    <Button className="w-full" onClick={()=>{consentReadyRef.current=true;setConsentReady(true);void startConversation();}}><Play className="mr-2 h-4 w-4"/>{t("voice.consentStart")}</Button>
    </div>
  </div>;

  // A mic denial inside an embedded preview frame gets guidance, not the red
  // error: the frame never offered a prompt, so there is nothing to "allow".
  const micFailureKind = classifyMicrophoneFailure(error, MICROPHONE_DENIED, isEmbeddedContext());

  if (previewOnly) return <div className="space-y-2">
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" disabled={phase !== "idle" || replaying} onClick={() => void startConversation(true)} aria-label={t("voice.playSelectedVoice")}>{phase === 'connecting' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4"/>}{t("voice.playVoice")}</Button>
      <Button size="sm" variant="outline" disabled={phase === "idle" && !replaying} onClick={stopEverything} aria-label={t("voice.stopVoicePreview")}><PhoneOff className="mr-2 h-4 w-4"/>{t("voice.stop")}</Button>
      {hasReplay && <Button size="sm" variant="outline" disabled={phase !== 'idle' || replaying} onClick={() => void replayLastMessage()} title={t("voice.replaySavedTitle")}><RotateCcw className="mr-2 h-4 w-4" />{t("voice.replay")}</Button>}
      <span role="status" className="text-xs text-muted-foreground">{replaying ? t("voice.replayingSavedGreeting") : phase === "connecting" || phase === 'preview' && !aspenSpeaking ? status : phase === "preview" ? t("voice.playingVoice", { voice: previewVoice || voice }) : t("voice.voiceSelected", { voice: previewVoice || voice })}</span>
    </div>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    {signInAction}
  </div>;

  // Compact mode: minimal floating-widget layout for phones — status line,
  // two-line scrolling transcript, and a single row of icon buttons.
  const shownPhase: Phase = swapTransition ? phase : faceWaiting && phase === 'live' ? 'connecting' : phase;
  const activeVideoAvatar: VideoAvatar | undefined = activePersona === 'sara' && videoAvatar
    ? { ...videoAvatar, faceId: SARA_FACE_ID }
    : activePersona === 'alex' && videoAvatar
      ? { ...videoAvatar, faceId: ALEX_FACE_ID }
      : videoAvatar;
  const avatarView = videoAvatar?.enabled && !previewOnly ? <SimliAvatar ref={avatarRef} inline={avatarInline || faceFirst} unboxed={faceFirst} avatar={activeVideoAvatar ?? videoAvatar} agentId={agentId} shareToken={shareToken} draft={draft} guide={guide} onLiveChange={live => { setFaceLive(live); if (!live) avatarLiveRef.current = false; }} /> : null;
  // Avatar swap pre-stage: the incoming persona's concealed second
  // instance — mounted only while a boundary is armed, live but hidden
  // and muted, revealed by the cut-over re-pointing avatarRef at it.
  const stagedAvatarView = preStage && videoAvatar?.enabled && !previewOnly ? (
    <div key={`staged-${preStage.boundary}`} className={faceFirst ? "aspen-person-livebox relative z-0 mx-auto overflow-hidden" : undefined} style={faceFirst ? { position: 'absolute', inset: 0, opacity: 0, pointerEvents: 'none' } : undefined}>
      <SimliAvatar ref={stagedAvatarRef} inline={avatarInline || faceFirst} unboxed={faceFirst} avatar={{ ...videoAvatar, faceId: preStage.persona === 'sara' ? SARA_FACE_ID : preStage.persona === 'alex' ? ALEX_FACE_ID : videoAvatar.faceId }} persona={preStage.persona} personaParentSessionId={parentSessionIdRef.current || undefined} personaVisitorKey={visitorKeyRef.current || undefined} concealed />
    </div>
  ) : null;
  // While Aspen is speaking, the karaoke caption owns the caption space. The
  // visitor's in-progress line stays in state until turn_complete, so gating
  // the caption on it (the old rule) hid the karaoke for every reply after
  // the visitor first spoke and showed the plain transcript instead — the
  // surface flipped depending on who had talked last. The transcript (with
  // the visitor's live line and the history) shows whenever she is silent.
  const liveCaption = aspenSpeaking || partialAspen !== "" || (playbackCaption !== null && playbackCaption.word >= 0);
  const showPlaybackCaption = !!playbackCaption && (!partialUser || liveCaption) && (!faceFirst || captions);
  if (compact) {
    return (
      <div className={faceFirst ? "space-y-0 px-2 pb-2 pt-0 text-foreground" : "space-y-2 p-2 text-foreground"}>
        {faceFirst ? <div className="aspen-person-livebox relative z-0 mx-auto overflow-hidden"><div className={`h-full w-full ${faceLive ? 'invisible' : ''}`}><PersonPortrait name={name} avatarUrl={avatarUrl} animated={false} /></div>{avatarView}{stagedAvatarView}</div> : <>{avatarView}{stagedAvatarView}</>}
        {belowAvatar && <div className="py-1">{belowAvatar}</div>}
        <div className={faceFirst ? 'aspen-voice-panel relative z-10 space-y-2 rounded-lg border border-primary/40 bg-card p-2 shadow-lg ring-1 ring-foreground/10' : 'space-y-2'}>
        <div className="flex items-center gap-1.5">
          {shownPhase === "connecting" && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />}
          {shownPhase === "live" && !aspenSpeaking && <Mic className="h-3.5 w-3.5 shrink-0 animate-pulse text-primary" />}
          {shownPhase === "live" && aspenSpeaking && <Volume2 className="h-3.5 w-3.5 shrink-0 animate-pulse text-primary" />}
          {shownPhase === "idle" && <Play className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          <p className="min-w-0 break-words text-xs leading-snug text-foreground" role="status">
            {shownPhase === "live" && (
              <span className="font-semibold text-foreground">
                {handoffActive ? t("voice.managerHandoff") : paused ? t("voice.paused") : replaying ? t("voice.replayingSavedAudio") : muted ? t("voice.micMuted") : aspenSpeaking ? t("voice.speaking", { name }) : captureMode === "hold" && !held ? t("voice.holdToTalk") : t("voice.listening")}
              </span>
            )}
            {shownPhase !== "live" && (shownPhase === "idle" ? t("voice.readyToTalk") : faceWaiting ? t("voice.connecting") : status)}
          </p>
        </div>
        {phase === 'idle' && endedByVisitor && <p className="text-xs text-muted-foreground">{t("voice.pressPlayReconnect", { name })}</p>}

        {faceFirst && <Button size="icon" variant="outline" className="h-8 w-8 border-primary/60 bg-transparent text-primary hover:bg-primary/10 hover:text-primary" aria-label={captions ? t('voice.hideCaptions') : t('voice.showCaptions')} title={captions ? t('voice.hideCaptions') : t('voice.showCaptions')} aria-expanded={captions} onClick={() => setCaptions(v => !v)}><ChevronsUpDown className="h-4 w-4" /></Button>}
        <div className={faceFirst ? (captions ? 'aspen-caption-space' : 'hidden') : ''}>
        {showPlaybackCaption && playbackCaption && <div className="rounded-md border border-border bg-background/95 p-1.5"><PlaybackCaption caption={playbackCaption} /></div>}
        <div aria-label={t("voice.transcriptLabel")} tabIndex={0} className={`${showPlaybackCaption || (faceFirst && !captions) ? 'hidden' : ''} ${faceFirst ? 'h-[72px]' : 'max-h-[4.5rem]'} space-y-1 overflow-y-auto overscroll-contain rounded-md border border-border bg-background/95 p-1.5`}>
          {turns.length === 0 && (!partialAspen || faceFirst) && !partialUser && (
            <p className="py-1 text-center text-[11px] text-muted-foreground">{t("voice.noConversation")}</p>
          )}
          {turns.map((t, i) => (
            <Message key={i} from={t.role} className="max-w-full">
              <MessageContent aria-label={transcriptAriaLabel(t.role)} className={t.role === "user" ? "bg-primary text-primary-foreground text-xs px-2 py-1" : faceFirst ? "text-sm font-bold leading-6 text-foreground" : "text-xs text-foreground"}>
                <MessageResponse>{t.role === "user" ? t.text : displayNumbers(t.text)}</MessageResponse>
              </MessageContent>
            </Message>
          ))}
          {partialUser && <Message from="user"><MessageContent className="bg-primary text-primary-foreground text-sm font-bold"><span className="text-[10px] font-semibold">{t("voice.you")}</span><MessageResponse>{partialUser}</MessageResponse></MessageContent></Message>}
          {!faceFirst && partialAspen && <Message from="assistant"><MessageContent className="text-sm font-bold"><MessageResponse>{displayNumbers(partialAspen)}</MessageResponse></MessageContent></Message>}
          <div ref={transcriptEndRef} />
        </div>
        </div>

        {confirmation}
        {actionNotice && <p role="status" className="text-xs text-primary">{actionNotice}</p>}
        {videoFallback && <p role="status" className="text-[11px] text-muted-foreground">{t("voice.videoFallback")}</p>}
        {remainingSeconds !== null && (!faceFirst || captions) && <p className="text-[11px] text-muted-foreground">{t("voice.demoTimeRemaining")}: {Math.floor(remainingSeconds/60)}:{String(remainingSeconds%60).padStart(2,'0')}</p>}
        {transferControl}
        <div className="voice-controls flex flex-wrap items-center justify-center gap-1 [&_button]:h-auto [&_button]:min-h-11 [&_button]:w-auto [&_button]:min-w-11 [&_button]:flex-col [&_button]:gap-1 [&_button]:px-1.5 [&_button]:py-1.5 [&_span]:text-[10px] [&_span]:leading-tight">
          {phase === "idle" ? (
            <Button size="icon" onClick={() => void startConversation()} title={t("voice.playToConnect", { name })} aria-label={t("voice.startConversation")}>
              <Play className="h-4 w-4" />
              <span>{t("voice.play")}</span>
            </Button>
          ) : (
            <Button size="icon" variant="destructive" onClick={endByVisitor} title={t("voice.endConversation")} aria-label={t("voice.endConversation")}>
              <PhoneOff className="h-4 w-4" />
              <span>{t("voice.end")}</span>
            </Button>
          )}
          {phase === "live" && captureMode !== "hold" && (
            <Button
              size="icon"
              disabled={handoffActive}
              variant={muted ? "destructive" : "outline"}
              aria-pressed={muted}
              title={muted ? t("voice.unmuteMic") : t("voice.muteMic")}
              aria-label={muted ? t("voice.unmuteMic") : t("voice.muteMic")}
              onClick={toggleMicMute}
            >
              {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              <span>{muted ? t("voice.unmute") : t("voice.mute")}</span>
            </Button>
          )}
          {phase === "live" && (
            <Button
              size="icon"
              variant={paused ? "default" : "outline"}
              aria-pressed={paused}
              title={paused ? t("voice.resumeConversation") : t("voice.pauseConversation")}
              aria-label={paused ? t("voice.resumeConversation") : t("voice.pauseConversation")}
              disabled={handoffActive} onClick={togglePause}
            >
              {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              <span>{paused ? t("voice.resume") : t("voice.pause")}</span>
            </Button>
          )}
          {phase === "live" && (
            <Button
              size="icon"
              variant={speakerMuted ? "secondary" : "outline"}
              aria-pressed={speakerMuted}
              title={speakerMuted ? t("voice.speakerOn") : t("voice.speakerOff")}
              aria-label={speakerMuted ? t("voice.speakerOnShort") : t("voice.silenceSpeaker")}
              onClick={toggleSpeakerMute}
            >
              {speakerMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              <span>{speakerMuted ? t("voice.soundOn") : t("voice.silence")}</span>
            </Button>
          )}
          <Button
            size="icon"
            variant="outline"
            disabled={!hasReplay || paused || replaying || aspenSpeaking || phase === "connecting" || phase === "preview"}
            onClick={() => void replayLastMessage()}
            title={t("voice.replayLastTitle")}
            aria-label={t("voice.replayLastMessage")}
          >
            <RotateCcw className="h-4 w-4" />
            <span>{t("voice.replay")}</span>
          </Button>
          {replaying && (
            <Button size="icon" variant="outline" onClick={clearPlayback} title={t("voice.stopReplayTitle")} aria-label={t("voice.stopReplayTitle")}>
              <PhoneOff className="h-4 w-4" />
              <span>{t("voice.stopReplay")}</span>
            </Button>
          )}
          {phase === "live" && captureMode === "hold" && (
            <Button
              size="icon"
              className="touch-none select-none"
              variant={held ? "default" : "secondary"}
              disabled={muted || paused || replaying || handoffActive}
              aria-pressed={held}
              title={held ? t("voice.holdListening") : t("voice.holdToTalk")}
              aria-label={held ? t("voice.holdListening") : t("voice.holdToTalk")}
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
              <span>{t("voice.hold")}</span>
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setShowSettings((s) => !s)}
            title={t("voice.voiceSettings")}
            aria-label={t("voice.voiceSettings")}
            aria-expanded={showSettings}
          >
            <Settings2 className="h-4 w-4" />
            <span>{t("voice.settings")}</span>
          </Button>
        </div>

        {phase === "live" && (!faceFirst || captions) && (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>{t("voice.mic")}</span>
            <meter min="0" max="100" value={micLevel} aria-label={t("voice.micLevel")} className="h-2 w-16" />
            <span>{micLevel > 3 ? t("voice.sound") : t("voice.quiet")}</span>
          </div>
        )}
        {audioNeedsTap && <p role="status" className="text-[11px] text-muted-foreground">{t("voice.audioTapNeeded")}</p>}
        {error && (micFailureKind === "mic-denied-embedded" ? <EmbeddedMicrophoneNotice compact /> : <p className="text-[11px] font-semibold text-destructive">{error}</p>)}
        {signInAction}

        {showSettings && (
          <Dialog open={showSettings} onOpenChange={setShowSettings}><DialogContent className="max-h-[85dvh] w-[calc(100vw-24px)] max-w-sm overflow-y-auto"><DialogTitle>{t("voice.voiceSettings")}</DialogTitle><DialogDescription>{t("voice.voiceSettingsDesc")}</DialogDescription><div className="space-y-3">
            {phase !== "idle" && <div className="space-y-2 rounded-md border border-border p-3">
              <p role="status" className="text-xs text-foreground">{t("voice.settingsLiveNote")}</p>
              <Button variant="outline" size="sm" onClick={stopEverything}><PhoneOff className="mr-1.5 h-3.5 w-3.5" />{t("voice.endCallToEdit")}</Button>
            </div>}
            <label className="block space-y-1 text-xs">{t("voice.noiseFiltering")}
              <Select value={noiseFilter} onValueChange={value => setNoiseFilter(value as NoiseFilter)}>
                <SelectTrigger aria-label={t("voice.micSensitivity")} className="h-auto min-h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="light">{t("voice.noiseLight")}</SelectItem><SelectItem value="balanced">{t("voice.noiseBalanced")}</SelectItem><SelectItem value="strong">{t("voice.noiseStrong")}</SelectItem></SelectContent>
              </Select>
            </label>
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground">{t("voice.microphone")}</label>
              <div className="mt-1 flex gap-2">
                <Select value={microphone} onValueChange={setMicrophone} disabled={phase !== "idle"}>
                  <SelectTrigger aria-label={t("voice.microphone")} className="h-8 min-w-0 flex-1 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">{t("voice.systemDefaultMic")}</SelectItem>
                    {microphones.filter((device) => device.deviceId && device.deviceId !== "default").map((device, index) => (
                      <SelectItem key={device.deviceId} value={device.deviceId}>{device.label || t("voice.microphoneN", { n: index + 1 })}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="icon" variant="outline" className="h-8 w-8" disabled={phase !== "idle"} onClick={() => void refreshMicrophones(true)} aria-label={t("voice.refreshMics")} title={t("voice.refreshMicsTitle")}>
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground">{t("voice.conversationMode")}</label>
              <Select value={captureMode} onValueChange={(value) => { const next = value as CaptureMode; if (next === "hold") pauseCapture(); else endHold(); captureRef.current.mode = next; setCaptureMode(next); }}>
                <SelectTrigger aria-label={t("voice.conversationMode")} className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="handsfree">{t("voice.handsFree")}</SelectItem>
                  <SelectItem value="hold">{t("voice.holdMode")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {draft && (
              <Button variant="outline" size="sm" className="h-8 text-xs" disabled={phase !== "idle"} onClick={() => void startConversation(true)} aria-label={t("voice.previewVoice")} title={t("voice.previewVoice")}>
                <Play className="mr-1.5 h-3.5 w-3.5" /> {t("voice.previewVoice")}
              </Button>
            )}
            {phase === "idle" && <Button className="w-full" onClick={() => { setShowSettings(false); void startConversation(); }}><Mic className="mr-1.5 h-4 w-4" />{t("voice.startCallWithSettings")}</Button>}
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
            {t("voice.voiceLab")}{" "}
            <span className="text-muted-foreground font-normal">{t("voice.voiceLabNote")}</span>
          </h1>
        </div>
      </header>}

      <main className={compact ? "space-y-3" : "mx-auto max-w-3xl px-4 py-6 space-y-4"}>
        {avatarView}
        {stagedAvatarView}
        <Card className="p-4 space-y-3">
          {confirmation}
        {actionNotice && <p role="status" className="text-xs text-primary">{actionNotice}</p>}
        {videoFallback && <p role="status" className="text-xs text-muted-foreground">{t("voice.videoFallback")}</p>}
        {remainingSeconds !== null && <p className="text-[11px] text-muted-foreground">{t("voice.demoTimeRemaining")}: {Math.floor(remainingSeconds/60)}:{String(remainingSeconds%60).padStart(2,'0')}</p>}
        {transferControl}
          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            {!compact && <div className="flex-1">
              <label className="text-xs font-semibold text-muted-foreground">{t("voice.voiceLabel")}</label>
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
                <span className="ml-2">{t("voice.startLive")}</span>
              </Button>
            ) : (
              <Button onClick={stopEverything} variant="destructive">
                <PhoneOff className="h-4 w-4" />
                <span className="ml-2">{t("voice.endConversation")}</span>
              </Button>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1 text-xs">{t("voice.noiseFiltering")}
              <Select value={noiseFilter} onValueChange={value => setNoiseFilter(value as NoiseFilter)}>
                <SelectTrigger aria-label={t("voice.micSensitivity")}><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="light">{t("voice.noiseLight")}</SelectItem><SelectItem value="balanced">{t("voice.noiseBalanced")}</SelectItem><SelectItem value="strong">{t("voice.noiseStrong")}</SelectItem></SelectContent>
              </Select>
            </label>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">{t("voice.microphone")}</label>
              <div className="mt-1 flex gap-2">
                <Select value={microphone} onValueChange={setMicrophone} disabled={phase !== "idle"}>
                  <SelectTrigger aria-label={t("voice.microphone")} className="min-w-0 flex-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">{t("voice.systemDefaultMic")}</SelectItem>
                    {microphones.filter(device => device.deviceId && device.deviceId !== "default").map((device, index) => <SelectItem key={device.deviceId} value={device.deviceId}>{device.label || t("voice.microphoneN", { n: index + 1 })}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="icon" variant="outline" disabled={phase !== "idle"} onClick={() => void refreshMicrophones(true)} aria-label={t("voice.refreshMics")} title={t("voice.refreshMicsTitle")}><RefreshCw className="h-4 w-4" /></Button>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">{t("voice.conversationMode")}</label>
              <Select value={captureMode} onValueChange={value => setCaptureMode(value as CaptureMode)} disabled={phase !== "idle"}>
                <SelectTrigger aria-label={t("voice.conversationMode")} className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="handsfree">{t("voice.handsFree")}</SelectItem><SelectItem value="hold">{t("voice.holdMode")}</SelectItem></SelectContent>
              </Select>
            </div>
          </div>

          {phase !== "idle" && <div className="flex flex-wrap items-center gap-2">
            <p role="status" className="text-xs text-muted-foreground">{t("voice.transcriptNote")}</p>
            <Button variant="outline" size="sm" onClick={stopEverything}><PhoneOff className="mr-1.5 h-4 w-4" />{t("voice.endCallToEdit")}</Button>
          </div>}
          <div className="flex flex-wrap items-center gap-2">
            {(!compact || draft) && <Button variant="outline" size="sm" disabled={phase !== "idle"} onClick={() => void startConversation(true)} aria-label={t("voice.previewVoice")} title={t("voice.previewVoice")}>
              <Play className="h-4 w-4 mr-2" /> {t("voice.previewVoice")}
            </Button>}
            {!compact && <Button variant="outline" size="sm" disabled={phase !== "idle" || savedVoice === voice} onClick={() => {
              try { localStorage.setItem("gemini-aspen-voice", voice); setSavedVoice(voice); setStatus(`${voice} saved for Gemini calls in this browser.`); } catch { setError("Your browser could not save the voice preference."); }
            }}><Save className="h-4 w-4 mr-2" /> {t("voice.saveVoice")}</Button>}
            {phase === "preview" && <span className="text-xs text-muted-foreground">{t("voice.voicePreviewSuffix", { voice })}</span>}
            <Button variant="outline" size="sm" disabled={!hasReplay || paused || replaying || aspenSpeaking || phase === "connecting" || phase === "preview"} onClick={() => void replayLastMessage()} title={t("voice.replayAudioTitle")}><RotateCcw className="mr-2 h-4 w-4" />{t("voice.replayLastMessage")}</Button>
            {replaying && <Button variant="outline" size="sm" onClick={clearPlayback}><PhoneOff className="mr-2 h-4 w-4" />{t("voice.stopReplay")}</Button>}
            {phase === "live" && <Button variant={muted ? "destructive" : "outline"} size="sm" disabled={handoffActive} aria-pressed={muted} onClick={toggleMicMute}>{muted ? <MicOff className="mr-2 h-4 w-4" /> : <Mic className="mr-2 h-4 w-4" />}{muted ? t("voice.unmuteMic") : t("voice.muteMic")}</Button>}
            {phase === "live" && <Button variant={paused ? "default" : "outline"} size="sm" aria-pressed={paused} disabled={handoffActive} onClick={togglePause}>{paused ? <Play className="mr-2 h-4 w-4" /> : <Pause className="mr-2 h-4 w-4" />}{paused ? t("voice.resume") : t("voice.pause")}</Button>}
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
            ><Mic className="mr-2 h-4 w-4" />{held ? t("voice.holdListening") : t("voice.holdToTalk")}</Button>}
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
                  {paused ? t("voice.pausedResume") : replaying ? t("voice.replayingMicPaused") : muted ? t("voice.micMuted") : aspenSpeaking ? t("voice.isSpeaking", { name }) : captureMode === "hold" && !held ? t("voice.micPaused") : t("voice.listening")}
                  {" — "}
                </span>
              )}
              {status}
            </p>
          </div>
          {phase === "live" && <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{t("voice.microphone")}</span><meter min="0" max="100" value={micLevel} aria-label={t("voice.micLevel")} className="h-3 w-24" />
            <span>{micLevel > 3 ? t("voice.soundDetected") : t("voice.quiet")}</span>
          </div>}
          {audioNeedsTap && <p role="status" className="text-xs text-muted-foreground">{t("voice.audioTapNeeded")}</p>}
          {error && (micFailureKind === "mic-denied-embedded" ? <EmbeddedMicrophoneNotice /> : <p className="text-xs text-destructive font-semibold">{error}</p>)}
          {signInAction}
        </Card>

        <Card className="p-3 min-h-[100px] max-h-[25vh] overflow-y-auto space-y-3">
          {turns.length === 0 && !partialAspen && !partialUser && (
            <p className="text-sm text-muted-foreground text-center pt-16">{t("voice.noConversation")}</p>
          )}
          {turns.map((t, i) => (
            <Message key={i} from={t.role}>
              <MessageContent aria-label={transcriptAriaLabel(t.role)} className={t.role === "user" ? "bg-primary text-primary-foreground" : "text-foreground"}>
                <MessageResponse>{t.role === "user" ? t.text : displayNumbers(t.text)}</MessageResponse>
              </MessageContent>
            </Message>
          ))}
          {partialUser && <Message from="user"><MessageContent className="bg-primary text-primary-foreground"><MessageResponse>{partialUser}</MessageResponse></MessageContent></Message>}
          {partialAspen && <Message from="assistant"><MessageContent><MessageResponse>{displayNumbers(partialAspen)}</MessageResponse></MessageContent></Message>}
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
