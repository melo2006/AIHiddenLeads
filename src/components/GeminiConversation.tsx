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
import { Mic, MicOff, Volume2, VolumeX, FlaskConical, PhoneOff, Loader2, Play, Pause, Save, RotateCcw, RefreshCw, Settings2, ChevronsUpDown, Check, Speaker, Smartphone, Bluetooth, Timer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
// This component renders in standalone harnesses (Voice Lab, embeds, tests)
// that never run main.tsx — importing the i18n module here guarantees the
// locale resources exist wherever the panel mounts (same singleton in the app).
import "@/i18n";
import { explicitUiLocale } from "@/lib/uiLocale";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { microphonePcm, shouldSendMicrophone, microphoneGate, microphoneAutoGain, initialCaptureMode, type NoiseFilter, type CaptureMode } from "@/lib/voiceLabAudio";

import VoiceActionConfirmation, { type VoiceAction } from "./VoiceActionConfirmation";
import BrowserVoiceHandoff from "@/components/BrowserVoiceHandoff";
import { voiceIdleAction, homepageWalkthroughDue, type VoiceIdleStage } from '@/lib/voiceIdle';
import { voiceDisconnectMessage } from '@/lib/voiceDisconnect';
import { voiceProxyWsUrl } from '@/lib/voiceProxy';
import { classifyMicrophoneFailure, isEmbeddedContext } from "@/lib/embeddedContext";
import {campaignVisit, trackCampaignEvent} from '@/lib/campaignTracking';
import { salesPlans, type SalesPlan } from '@/lib/salesActions';
import SimliAvatar, { SOUND_BLOCKED, isVideoStartFailure, type SimliAvatarHandle } from '@/components/SimliAvatar';
import { BOUNDARY_TARGET, boundedSettle, boundaryForAssistantLine, buildSwapRecap, chainIsMidSegment, chainStashTarget, cutoverAudioSync, cutoverMode, cutoverReady, dequeueSwapExecution, dropApologyVariant, enqueueSwapExecution, faceLivenessOnLive, faceLivenessOnNotLive, faceLivenessOnStartSettled, gateWaitContinues, INITIAL_SWAP_STATE, introYieldOnVisitorLine, micAudioPasses, noteAlexIntent, noteDoorwayEngagement, noteSegmentFailure, otherFaceSlot, pendingExecutionBoundary, pendingRetryBoundary, PHASE_AFTER_BOUNDARY, PHASE_ENTRY, PRESTAGE_START_TIMEOUT_MS, prestageWatchDecision, reconnectTarget, recordSwapDiag, retryArmStamp, segmentAttemptsFor, segmentConnectRetryAllowed, segmentTokenStale, SEGMENT_TOKEN_TTL_MS, swapDiagPersistPayload, swapFallbackLine, swapWatchdogAction, SWAP_CROSSFADE_MS, SWAP_GATE_POLL_MS, SWAP_GATE_WAIT_MS, swapRecapFacts, SWAP_DIAG_PERSIST_EVENTS, visitorSignalsStepOut, type ChainStash, type FaceSlot, type PersonaBoundary, type PersonaId, type StagedFaceLiveness, type SwapDiagEntry, type SwapPhase, type SwapState } from '@/lib/personaSwap';
import { PERSONAS, SARA_FACE_ID } from '../../supabase/functions/_shared/personas';
import { ALEX_FACE_ID } from '../../supabase/functions/_shared/alex-guide';
import type { VideoAvatar } from '../../supabase/functions/_shared/video-avatar';
import { PersonPortrait } from '@/components/FloatingPersonFrame';
import { assistantOutput, nextVoiceChunkStart, pairedAudioShouldDegrade, PAIRED_CAPTION_DELAY_SEC } from '@/lib/avatarAudioTransition';
import { PlaybackCaptions, type PlaybackCaption as Caption } from '@/lib/playbackCaptions';
import { displayNumbers } from '@/lib/displayNumbers';
import PlaybackCaption from '@/components/PlaybackCaption';
import { voiceSessionHeaders } from '@/lib/voiceSessionAuth';
import { shouldShowMicHint } from '@/lib/micAudibility';
import { createMediaSink, mediaPlaybackNode, type MediaSink } from '@/lib/mediaSink';
import { applySinkIdToElement, audioContextSetSinkIdSupported, buildSpeakerMenuOptions, listSpeakerOutputs, pickDefaultSpeakerOutput, type SpeakerMenuOption, type SpeakerOutputDevice } from '@/lib/speakerOutput';

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

/** One transcript row. The transcript is NEVER cleared at a persona
 * handoff (owner transition spec): assistant rows carry the persona who
 * spoke them (`speaker`, swap sessions only) so the name label follows
 * the speaker, and each completed handoff appends a `divider` row so a
 * visitor scrolling up can follow who said what. Divider rows are
 * chrome — recap builders filter them out. */
type Turn = { role: "user" | "assistant" | "divider"; text: string; speaker?: PersonaId };
// Same-page-visit memory so pressing play again after Stop resumes instead of re-greeting.
const visitMemory = new Map<string, Turn[]>();
/** Persona-chain stash across a manual stop / Stage-3 suspend, kept for
 * the length of the page visit (same lifetime as visitMemory). A full
 * teardown used to DELETE the swap chain, so a restart mid-Sara was
 * authorised as a brand-new Aspen parent and re-ran her host script.
 * With a stash, teardown saves the chain and the next start re-authorises
 * the ACTIVE segment (personaResume opening — welcome-back, no apology);
 * only a fresh parent authorization (a genuinely new demo) clears it. */
const visitChainStash = new Map<string, ChainStash>();
export function resumeRecap(turns: Turn[]) {
  if (!turns.some(t => t.role === "assistant")) return undefined;
  return turns.filter(t => t.role !== "divider").slice(-8).map(t => `${t.role === "user" ? "Visitor" : "Assistant"}: ${t.text}`).join("\n").slice(-1500);
}
type Phase = "idle" | "connecting" | "live" | "preview";

// The voice socket host is resolved AT EACH CONNECT by voiceProxyWsUrl()
// (@/lib/voiceProxy): per-device ?voiceProxy override > VITE_VOICE_PROXY_WS_URL
// build default > the historical Edge derivation (Part 2 server move).

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
  // proxy delivers the simulation opening instead of the resume line — and
  // drop any stashed swap chain too, so the fresh start can never be
  // hijacked into resuming a segment from before the flip.
  const prevVerificationRef = useRef(verification);
  useEffect(() => {
    if (prevVerificationRef.current === 'pending' && verification === 'verified') {
      visitMemory.delete(agentId || 'homepage');
      visitChainStash.delete(agentId || 'homepage');
    }
    prevVerificationRef.current = verification;
  }, [verification, agentId]);
  // Team intro: the page journey's teamIntroSeen fact rides the visit
  // memory into the /demo-site demo parent's resume recap (facts channel,
  // design §5.1) — gemini-session verifies it server-side against the
  // stamped explainer session before honoring it. One synthetic record;
  // the proxy's resume instruction treats facts as data, never prompts.
  const teamIntroSeenMemoryRef = useRef(false);
  useEffect(() => {
    if (teamIntroSeenMemoryRef.current || !leadId) return;
    if (swapStateRef.current.teamIntroSeen) {
      teamIntroSeenMemoryRef.current = true;
      try {
        const key = agentId || 'homepage';
        const existing = visitMemory.get(key) || [];
        if (!existing.some(t => t.text.includes('teamIntroSeen'))) {
          visitMemory.set(key, [...existing, { role: 'user', text: '[visit fact] teamIntroSeen: the visitor watched the meet-the-team introduction on the demo page.' }]);
        }
      } catch { /* memory is best-effort */ }
    }
  }, [leadId, agentId]);
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
  const preStageRef = useRef<{ boundary: PersonaBoundary; token: string; faceReady: boolean; faceFailed?: boolean; persona: PersonaId; slot: FaceSlot; authorizedAt: number; faceEverLive?: boolean; faceStartFailed?: boolean } | null>(null);
  /** F3 PRE-STAGE (fluidity batch, 2026-11-10): the doorway Sara face
   *  is mounted CONCEALED and started the moment a simulation chain
   *  goes live (host phase) — minutes before the doorway can execute —
   *  so the gate usually finds her already warm. This is a FACE-ONLY
   *  warm-up: no segment is authorized early (the authorization keeps
   *  happening at the handoff line, so Sara's recap still carries the
   *  full host conversation). The readiness record lives here because
   *  the face can finish starting before armSwap creates the stage
   *  entry that would normally record it; armSwap folds `ready` into
   *  the stage's faceReady (and `failed` into faceFailed) when the
   *  stage is created. Cleared whenever the warmed slot state clears. */
  const warmedFaceRef = useRef<{ boundary: PersonaBoundary; slot: FaceSlot; ready: boolean; failed: boolean; everLive?: boolean; startFailed?: boolean } | null>(null);
  /** F4 DROP SNAPSHOT (fluidity batch, 2026-11-10): the swap-chain
   *  state captured BEFORE any teardown in a close path (teardown
   *  clears swapEnabledRef + swapStateRef, which is exactly what made
   *  the same-persona drop-recovery branch unreachable). A MID-SEGMENT
   *  snapshot drives the in-place personaDrop recovery; a HOST-phase
   *  snapshot whose doorway was armed-but-undone is stashed here and
   *  consumed by the reconnected parent's arming block in
   *  startConversation, which re-arms the doorway immediately instead
   *  of waiting for a whole extra Aspen turn. */
  const chainDropSnapshotRef = useRef<{ state: SwapState; parentSessionId: string | null; chainClass: 'simulation' | 'intro' | null; at: number } | null>(null);
  /** Capture the live swap chain (null when no chain is armed). Reads
   *  refs only, so any render's closure is equivalent. */
  const snapshotChainState = () => swapEnabledRef.current
    ? { state: { ...swapStateRef.current }, parentSessionId: parentSessionIdRef.current, chainClass: swapChainClassRef.current, at: Date.now() }
    : null;
  /** Team intro: a true barge-in landed during a bridge beat; the latch
   *  is applied when the interrupted turn completes (design §3.3). */
  const introYieldWasBargeInRef = useRef(false);
  /** Swap chain class (hardening, 2026-11-09): how the LIVE chain was
   *  armed — 'simulation' for a business-demo parent (leadId/prospectId
   *  authorization), 'intro' for the /demo explainer parent, null when
   *  no chain is armed. The structural doorway trigger
   *  (noteDoorwayEngagement) folds ONLY for the simulation class: the
   *  explainer chain starts in phase 'intro', never 'host', and a
   *  homepage session carries no chain at all — so neither can ever
   *  set pendingDoorway. Set at both arming sites, cleared at teardown. */
  const swapChainClassRef = useRef<'simulation' | 'intro' | null>(null);
  /** Completed assistant turns on the live socket (any persona). The
   *  structural doorway's "greeting turn has completed" input: the
   *  first turn_complete of a simulation chain IS the host's greeting /
   *  opening. Incremented by both sockets' turn_complete handlers,
   *  reset whenever a socket (re)connects. */
  const assistantTurnsRef = useRef(0);
  // Face slots (owner transition spec): two SimliAvatar instances share
  // the widget's live box. The MAIN slot starts as the standard face;
  // a pre-staged incoming persona mounts CONCEALED in the OTHER slot
  // (mainFace/secondFace state), the cut-over reveals it there with a
  // ~300ms crossfade, and the retired slot's state clears once the
  // fade lands — freeing that slot for the next boundary. A slot state
  // with revealed=false is a concealed pre-stage; revealed=true is the
  // live face. avatarRef below stays a MANUAL pointer at the ACTIVE
  // slot's handle (synced by an effect + at cut-over); it is no longer
  // a JSX ref, because a slot's element changes identity across swaps.
  const [mainFace, setMainFace] = useState<{ persona: PersonaId; boundary: PersonaBoundary; revealed: boolean } | null>(null);
  const [secondFace, setSecondFace] = useState<{ persona: PersonaId; boundary: PersonaBoundary; revealed: boolean } | null>(null);
  const mainSlotRef = useRef<SimliAvatarHandle>(null);
  const faceSlotOwnerRef = useRef<FaceSlot>('main');
  /** The slot whose frozen frame is dissolving out right now (set at
   *  cut-over, cleared when its retirement lands): it layers BELOW the
   *  revealing slot for the duration of the crossfade. */
  const [fadingSlot, setFadingSlot] = useState<FaceSlot | null>(null);
  const retireTimersRef = useRef<number[]>([]);
  const stagedAvatarRef = useRef<SimliAvatarHandle>(null);
  const [activePersona, setActivePersona] = useState<PersonaId>('aspen');
  /** True while a boundary cut-over executes: the compact status line must
   * show NO connecting spinner or "Connecting…" label at a swap (Ron's
   * smoothness rule) — the outgoing persona's frozen frame + status text
   * stay exactly as they were until the new persona is live. */
  const [swapTransition, setSwapTransition] = useState(false);
  const swapBusyRef = useRef(false);
  /** HANDOVER FIX (2026-11-10): the arm/execution bookkeeping the
   *  stall investigation found missing. swapHoldRef is the mic hold:
   *  set at arm time, the mic pipelines send silence frames while it
   *  is set, so the host generates no further scripted beats into the
   *  handover; swapConnecting drives the shell's "Connecting Sara…"
   *  status for the hold's duration. swapArmAtRef stamps each
   *  boundary's arm instant (the hard deadline + watchdog measure
   *  from it); swapExecQueueRef is the single-flight queue behind
   *  executeSwap's busy guard; swapExecForceRef carries the watchdog's
   *  immediate-gate demand for the queued/in-flight boundary. */
  const swapHoldRef = useRef<{ boundary: PersonaBoundary } | null>(null);
  const [swapConnecting, setSwapConnecting] = useState<PersonaId | null>(null);
  /** The one visible fallback line when a swap is spent (rotating —
   *  see swapFallbackLine). Display only; cleared on the next start. */
  const [swapNotice, setSwapNotice] = useState('');
  const swapFallbackCountRef = useRef(0);
  const swapArmAtRef = useRef<Partial<Record<PersonaBoundary, number>>>({});
  const swapExecQueueRef = useRef<PersonaBoundary[]>([]);
  const swapExecForceRef = useRef<Partial<Record<PersonaBoundary, boolean>>>({});
  /** VOICE-FIRST BATCH (2026-11-10): the doorway's new bookkeeping.
   *  segmentFacePendingRef — a segment is RUNNING voice-first (its
   *  socket connected without waiting for the face) and its face may
   *  still attach: the takeover watcher (handleFaceLiveChange) runs
   *  the deferred audio sync + reveal when the face reports live.
   *  While set, playPcmChunk routes chunks LOCAL and the degrade path
   *  must NOT engage the session-wide video fallback (which stops
   *  avatarRef — by then the incoming, still-warming handle).
   *  stageGeneration — bumped every time a stage entry is (re)built
   *  for a mounted face; the pre-stage watch effect keys on it, so a
   *  retry actually re-enters the watch and re-kicks start() instead
   *  of folding the previous attempt's never-settled record (the
   *  attempt-2 swallow). attemptSessionRef — the gemini_voice_sessions
   *  row id of each boundary's current attempt, so a resolution can be
   *  persisted onto the ATTEMPT'S OWN row (server-visible diag). */
  const segmentFacePendingRef = useRef<{ boundary: PersonaBoundary; persona: PersonaId; slot: FaceSlot } | null>(null);
  const faceTakeoverBusyRef = useRef(false);
  const [stageGeneration, setStageGeneration] = useState(0);
  const attemptSessionRef = useRef<Partial<Record<PersonaBoundary, { sessionId: string; attempt: number }>>>({});
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
  // Always start hands-free (see initialCaptureMode): a persisted hold
  // preference must never silently gate the next session's microphone.
  const [captureMode, setCaptureMode] = useState<CaptureMode>(() => initialCaptureMode());
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
    // Only the noise filter persists. Capture mode is session-scoped: writing
    // it made a one-time hold choice silently govern every later session.
    try { localStorage.setItem("voice-noise-filter", noiseFilter); } catch { /* Keep controls available without storage. */ }
  }, [noiseFilter, captureMode]);
  const [held, setHeld] = useState(false);
  const [muted, setMuted] = useState(false);
  const [speakerMuted, setSpeakerMuted] = useState(false);
  const speakerMutedRef = useRef(false);
  const speakerGainRef = useRef<GainNode | null>(null);
  // Speaker-output selection (2026-11-09, owner's earpiece complaint):
  // where her audible voice plays — a real device via setSinkId when the
  // platform exposes one, otherwise the platform route. SESSION-SCOPED
  // ONLY: never written to localStorage (a persisted audio setting is
  // what caused today's hold-to-talk trap; see lib/speakerOutput.ts).
  const [speakerMenuOpen, setSpeakerMenuOpen] = useState(false);
  const [speakerOutputs, setSpeakerOutputs] = useState<SpeakerOutputDevice[]>([]);
  const [speakerCanSelect, setSpeakerCanSelect] = useState(false);
  const [selectedOutputId, setSelectedOutputId] = useState<string | null>(null);
  const selectedOutputIdRef = useRef<string | null>(null);
  const [speakerOutputNotice, setSpeakerOutputNotice] = useState<string | null>(null);
  const defaultOutputAppliedRef = useRef(false);
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
  // "We can't hear you" hint (mic-path hardening, 2026-11-09 forensics:
  // sessions with ZERO user turns while the visitor believed he was
  // speaking). Driven by the pure helper in lib/micAudibility.ts.
  const [showMicHint, setShowMicHint] = useState(false);
  const showMicHintRef = useRef(false);
  const micAwaitRef = useRef<number | null>(null);
  const micGateHeardRef = useRef(0);
  const micTranscriptRef = useRef(0);
  const micHintLastRef = useRef(0);
  const sessionRecoveringRef = useRef(false);
  // Media-routed playback sink (see lib/mediaSink.ts): the audible
  // local voice plays through an HTMLAudioElement once it is unlocked,
  // so the phone's hardware media volume governs it on Android Chrome.
  const mediaSinkRef = useRef<{ ctx: AudioContext; sink: MediaSink | null } | null>(null);
  const mediaOutputNode = (ctx: AudioContext): AudioNode => {
    let entry = mediaSinkRef.current;
    if (!entry || entry.ctx !== ctx) {
      entry?.sink?.dispose();
      entry = { ctx, sink: createMediaSink(ctx) };
      mediaSinkRef.current = entry;
      // A speaker-output choice already made this session governs the
      // local media element too (voice-only path's audible element).
      if (entry.sink && selectedOutputIdRef.current) void applySinkIdToElement(entry.sink.element, selectedOutputIdRef.current);
    }
    if (entry.sink && !entry.sink.ready) void entry.sink.play();
    return mediaPlaybackNode(ctx, entry.sink);
  };

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
      // Handover fix: a pending swap suspends silence check-ins too —
      // the mic is held (silence frames) while it resolves, so a
      // check-in prompt would talk over the handover.
      if (swapHoldRef.current) { idle.quietSince = Date.now(); return; }
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

  // "We can't hear you" evaluator: once a second, ask the pure helper
  // whether the visitor has been silently unheard since Aspen's last
  // completed turn; show the calm hint at most once per cooldown.
  useEffect(() => {
    const timer = window.setInterval(() => {
      const heardSinceAwait = micAwaitRef.current !== null
        && (micGateHeardRef.current > micAwaitRef.current || micTranscriptRef.current > micAwaitRef.current);
      if (heardSinceAwait && showMicHintRef.current) {
        showMicHintRef.current = false;
        setShowMicHint(false);
      }
      if (!shouldShowMicHint({
        now: Date.now(),
        live: liveRef.current && !isPreviewRef.current,
        handsFree: captureRef.current.mode === "handsfree",
        muted: captureRef.current.muted,
        paused: captureRef.current.paused,
        replaying: captureRef.current.replaying,
        assistantSpeaking: idleRef.current.generating || sourcesRef.current.size > 0,
        awaitingSince: micAwaitRef.current,
        lastGateOpenAt: micGateHeardRef.current,
        lastUserTranscriptAt: micTranscriptRef.current,
        lastHintAt: micHintLastRef.current,
        recoveryActive: sessionRecoveringRef.current || swapBusyRef.current,
      })) return;
      micHintLastRef.current = Date.now();
      showMicHintRef.current = true;
      setShowMicHint(true);
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

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
      // Swap sessions: stamp the speaking persona on the finalized line
      // so the transcript's name label follows the speaker across
      // handoffs. Read at flush time — a swap's partial teardown flushes
      // the outgoing line BEFORE the state moves, so it is stamped with
      // the persona who actually spoke it.
      const speaker = role === "assistant" && swapEnabledRef.current ? swapStateRef.current.persona : undefined;
      setTurns((prev) => { const next = [...prev, { role, text, ...(speaker ? { speaker } : {}) }]; if (!isPreviewRef.current) visitMemory.set(agentId || "homepage", next); return next; });
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
      facts: swapRecapFacts(swapStateRef.current),
    }, incoming);
  }, [agentId, visitorName]);

  /** Authorize one persona segment against the ORIGINAL parent session. */
  const requestSegment = useCallback(async (persona: PersonaId, boundary: PersonaBoundary, opts: { swap: boolean; dropRecovery?: boolean; manualResume?: boolean }) => {
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
          manualResume: opts.manualResume === true,
          swap: opts.swap,
        },
      },
    });
    if (error || !data?.token) return null;
    return data as { token: string; sessionId: string; persona?: { id: PersonaId; displayName: string; faceId: string | null } };
  }, [leadId, prospectId, currentSwapRecap]);

  /** SEGMENT FAILURE handling (reliability, 2026-11-09): every failure
   * of an armed boundary's segment — authorization discarded, stage
   * missing at execution, face gate abort, stale token — funnels here
   * instead of dying silently. The pure ledger (noteSegmentFailure)
   * decides retry vs words-only fallback and records the failure as a
   * recap fact; a retry re-arms through armSwap for a FRESH token
   * (staged tokens live 120 s server-side — never re-present one) and
   * executes at the next turn_complete via pendingSegmentRetry. */
  const rearmSwapRef = useRef<(boundary: PersonaBoundary) => void>(() => {});
  /** F2 RETRY-ON-READINESS (fluidity batch, 2026-11-10): execute a
   *  pending retry the moment its stage is authorized AND warm —
   *  assigned in the render body next to executeSwapRef; gated on the
   *  #14 ledger trigger (pendingRetryBoundary), so normal arms and
   *  stages never auto-execute. The turn_complete
   *  pendingRetryBoundary check remains as the backstop. */
  const maybeExecutePendingRef = useRef<(boundary: PersonaBoundary) => void>(() => {});
  /** MIC HOLD (handover fix item 3): engage at arm time — while set,
   *  both mic pipelines send silence frames and the shell shows
   *  "Connecting <persona>…". Released at cut-over (the segment owns
   *  the mic path from there) and at fallback (the host resumes). A
   *  retry keeps the hold: the handover is still pending. Defined
   *  before handleSegmentFailure/armSwap, which both drive it; refs +
   *  state setters only, so the empty-deps callbacks stay sound. */
  const startSwapHold = useCallback((boundary: PersonaBoundary) => {
    if (swapHoldRef.current?.boundary === boundary) return;
    swapHoldRef.current = { boundary };
    setSwapConnecting(BOUNDARY_TARGET[boundary]);
  }, []);
  const releaseSwapHold = useCallback(() => {
    if (!swapHoldRef.current) return;
    swapHoldRef.current = null;
    setSwapConnecting(null);
  }, []);
  /** SERVER-VISIBLE DIAG (voice-first batch, 2026-11-10): post an
   *  attempt resolution to gemini-session's swapDiag action, which
   *  appends it to the attempt's OWN gemini_voice_sessions row
   *  (config.personaSwapDiag) and stamps last_error on failure-class
   *  resolutions of never-consumed rows. Retest #4's outcomes existed
   *  only in this page's ring buffer; after this batch a single SQL
   *  SELECT shows every attempt's resolution. Fire-and-forget —
   *  diagnostics never break the call — and a boundary whose
   *  authorization never landed has no row to write to, so the write
   *  is skipped (that failure rides the successor's recap fact, as
   *  before). */
  const persistSwapDiag = useCallback((entry: { event: SwapDiagEntry['event']; boundary: PersonaBoundary; persona?: PersonaId; attempt?: number; reason?: string; faceState?: string }) => {
    if (!SWAP_DIAG_PERSIST_EVENTS.includes(entry.event)) return;
    const attemptRow = attemptSessionRef.current[entry.boundary];
    const visitorKey = visitorKeyRef.current;
    if (!attemptRow?.sessionId || !visitorKey) return;
    const payload = swapDiagPersistPayload(
      { at: Date.now(), event: entry.event, boundary: entry.boundary, persona: entry.persona, attempt: entry.attempt ?? attemptRow.attempt, detail: entry.reason },
      attemptRow.sessionId,
      { faceState: entry.faceState },
    );
    void (async () => {
      try {
        const headers = await voiceSessionHeaders();
        await supabase.functions.invoke('gemini-session', { headers, body: { visitorKey, swapDiag: payload } });
      } catch { /* diagnostics never break the call */ }
    })();
  }, []);
  const persistSwapDiagRef = useRef(persistSwapDiag); persistSwapDiagRef.current = persistSwapDiag;
  const handleSegmentFailure = useCallback((boundary: PersonaBoundary, reason: string) => {
    const { state, outcome, attempt } = noteSegmentFailure(swapStateRef.current, boundary, reason);
    swapStateRef.current = state;
    recordSwapDiag({ event: outcome === 'retry' ? 'retry-scheduled' : 'fallback', boundary, persona: BOUNDARY_TARGET[boundary], attempt, detail: reason });
    persistSwapDiag({ event: outcome === 'retry' ? 'retry-scheduled' : 'fallback', boundary, persona: BOUNDARY_TARGET[boundary], attempt, reason });
    if (outcome === 'fallback') {
      // Handover fix item 4: the spent swap is VISIBLE, never silent —
      // the mic hold releases (the host resumes) and the shell shows
      // ONE rotating line saying who continues. A retry keeps the
      // hold and the "Connecting…" status: still pending.
      releaseSwapHold();
      setSwapNotice(swapFallbackLine(
        PERSONAS[BOUNDARY_TARGET[boundary]].displayName,
        PERSONAS[swapStateRef.current.persona].displayName,
        swapFallbackCountRef.current++,
      ));
    }
    if (outcome !== 'retry' || !liveRef.current) return;
    const staged = preStageRef.current;
    if (staged?.boundary === boundary) {
      // A FRESH stage already exists (the original authorization landed
      // late): keep it — pendingSegmentRetry executes it at the next
      // turn_complete. A STALE stage is discarded with its face: its
      // token would be refused by the proxy anyway.
      if (!segmentTokenStale(staged.authorizedAt, Date.now())) {
        // F2: a kept stage that is ALREADY gate-ready executes NOW,
        // not at some later turn_complete; a still-warming one is
        // executed by the pre-stage effect the moment it settles.
        if (!avatarRequestedRef.current || staged.faceReady) maybeExecutePendingRef.current(boundary);
        return;
      }
      if (avatarRequestedRef.current && staged.slot === 'main') mainSlotRef.current?.stop();
      if (avatarRequestedRef.current) { if (staged.slot === 'second') setSecondFace(null); else setMainFace(null); }
      preStageRef.current = null;
      if (warmedFaceRef.current?.boundary === boundary) warmedFaceRef.current = null;
    }
    rearmSwapRef.current(boundary);
  }, [releaseSwapHold, persistSwapDiag]);
  const handleSegmentFailureRef = useRef(handleSegmentFailure); handleSegmentFailureRef.current = handleSegmentFailure;

  // Cut-over machinery is defined after startConversation (it reuses the
  // socket builder); these refs let the message handlers reach it.
  const executeSwapRef = useRef<(boundary: PersonaBoundary, opts?: { immediate?: boolean }) => Promise<void>>(async () => {});
  /** VOICE-FIRST TAKEOVER: attach a pending segment face mid-segment
   *  (deferred audio sync + reveal + routing flip). Assigned in the
   *  render body next to executeSwap; triggered from
   *  handleFaceLiveChange (the face's live report) and from
   *  executeSwap's post-connect re-sample. */
  const runFaceTakeoverRef = useRef<(slot: FaceSlot) => Promise<void>>(async () => {});
  const kickFaceRevivalRef = useRef<(slot: FaceSlot) => void>(() => {});
  const dropRecoverRef = useRef<() => void>(() => {});
  /** Segment-socket builder, defined with the swap machinery below; the
   * manual-stop resume path (defined earlier, inside startConversation's
   * neighbourhood) reaches it through this ref. */
  const connectSegmentSocketRef = useRef<(token: string) => void>(() => {});

  /** Arm a boundary: authorize the incoming segment AND pre-connect its
   * face (concealed, in the face slot the active persona is NOT using)
   * while the outgoing persona is still speaking its handoff line. Any
   * failure disarms quietly — the current persona continues words-only
   * (spec §6.5 fallback 1/2). */
  const armSwap = useCallback((boundary: PersonaBoundary, opts?: { retry?: boolean }) => {
    const state = swapStateRef.current;
    if (!swapEnabledRef.current || state.done.includes(boundary)) return;
    const target = (Object.entries(PHASE_ENTRY).find(([, v]) => v.boundary === boundary)?.[1]) as { boundary: PersonaBoundary; persona: PersonaId } | undefined;
    // intro-return-2 lands on the same host phase as intro-return-1
    // (an Aspen segment) but is not itself a PHASE_ENTRY value — it is
    // entered from the intro-alex phase in place.
    const persona = boundary === 'return' || boundary === 'intro-return-2' ? 'aspen' as PersonaId : target?.persona;
    if (!persona) return;
    // A stage for THIS boundary is already in hand (a kept fresh stage
    // or an in-flight arm): never authorize over it. The ONE exception
    // is token freshness (fluidity batch, F3): a stage whose token
    // crossed the freshness bound while its face stayed warm gets a
    // TOKEN-ONLY refresh — face, slot and ledger untouched — so the
    // swap still executes inside this cover window instead of
    // discarding the warm face and spending the retry.
    const existing = preStageRef.current;
    if (existing && existing.boundary === boundary) {
      if (!segmentTokenStale(existing.authorizedAt, Date.now())) return;
      void (async () => {
        const segment = await requestSegment(persona, boundary, { swap: true });
        if (!segment || !liveRef.current || swapStateRef.current.done.includes(boundary)) return;
        if (preStageRef.current?.boundary === boundary) {
          preStageRef.current = { ...preStageRef.current, token: segment.token, authorizedAt: Date.now() };
          // The refreshed token is a NEW session row: it becomes the
          // attempt row server-visible diag writes to.
          attemptSessionRef.current = { ...attemptSessionRef.current, [boundary]: { sessionId: segment.sessionId, attempt: segmentAttemptsFor(swapStateRef.current, boundary) + 1 } };
          recordSwapDiag({ event: 'token-refresh', boundary, persona });
        }
      })();
      return;
    }
    // One-shot for the normal path; a RETRY arm (from
    // handleSegmentFailure) may re-enter for the same boundary, but
    // never while another boundary's stage occupies the pre-stage.
    if (!opts?.retry && (preStageRef.current || state.armed.includes(boundary))) return;
    if (opts?.retry && preStageRef.current) return;
    recordSwapDiag({ event: 'arm', boundary, persona, attempt: segmentAttemptsFor(state, boundary) + 1, detail: opts?.retry ? 'retry' : undefined });
    swapStateRef.current = { ...state, armed: state.armed.includes(boundary) ? state.armed : [...state.armed, boundary], ...(boundary === 'intro-sara' || boundary === 'intro-return-1' || boundary === 'intro-alex' || boundary === 'intro-return-2' ? { teamIntroSeen: true } : {}) };
    // Handover fix: stamp the arm instant (the watchdog + hard
    // deadline measure from it) and engage the mic hold — from here
    // until cut-over or fallback the host's mic sends silence frames,
    // so she cannot generate the next scripted beat into the stall.
    // Voice-first batch: a RETRY arm is back-dated (retryArmStamp) so
    // its force deadline lands SWAP_RETRY_DEADLINE_MS out, not a full
    // fresh 10 s — the parent is already ~100 s old by then and the
    // hosting fuse is ~140–150 s (investigation Q5-7).
    swapArmAtRef.current = { ...swapArmAtRef.current, [boundary]: opts?.retry ? retryArmStamp(Date.now()) : Date.now() };
    startSwapHold(boundary);
    void (async () => {
      const segment = await requestSegment(persona, boundary, { swap: true });
      if (!segment) {
        // Authorization failed (invoke error / parent refused / quota):
        // previously a silent disarm. Now traced, and retried ONCE via
        // the ledger before the words-only fallback.
        recordSwapDiag({ event: 'authorize-failed', boundary, persona, attempt: segmentAttemptsFor(swapStateRef.current, boundary) + 1 });
        handleSegmentFailureRef.current(boundary, 'authorize-failed');
        return;
      }
      recordSwapDiag({ event: 'authorized', boundary, persona, attempt: segmentAttemptsFor(swapStateRef.current, boundary) + 1 });
      if (swapStateRef.current.done.includes(boundary) || !liveRef.current) {
        recordSwapDiag({ event: 'stage-discarded', boundary, persona, detail: swapStateRef.current.done.includes(boundary) ? 'already-done' : 'not-live' });
        // Handover fix: a discarded stage must never strand the mic
        // hold — the boundary already completed (its cut-over released
        // the hold) or the call is ending (teardown clears it); say so
        // here too so no path leaves the host muted.
        if (swapStateRef.current.done.includes(boundary)) releaseSwapHold();
        return;
      }
      const slot = otherFaceSlot(faceSlotOwnerRef.current);
      const warmed = warmedFaceRef.current;
      // Voice-first batch: this authorization IS the attempt's server
      // row — remember it for server-visible diag — and bump the
      // stage generation so the pre-stage watch effect RE-ENTERS for
      // this stage even when the mounted face's slot state is
      // unchanged (the attempt-2 swallow: identical [boundary, slot,
      // persona] deps meant start() was never re-kicked).
      attemptSessionRef.current = { ...attemptSessionRef.current, [boundary]: { sessionId: segment.sessionId, attempt: segmentAttemptsFor(swapStateRef.current, boundary) + 1 } };
      setStageGeneration(g => g + 1);
      preStageRef.current = {
        boundary, token: segment.token, persona, slot, authorizedAt: Date.now(),
        // F3: the doorway face pre-warmed at chain start can ALREADY
        // be ready (or settled-failed) before this stage existed —
        // fold its recorded state in instead of assuming it is still
        // warming (its pre-stage effect will not re-run for an
        // unchanged slot state, so nobody else would ever record it).
        faceReady: !avatarRequestedRef.current || !!(warmed && warmed.boundary === boundary && warmed.slot === slot && warmed.ready),
        faceFailed: warmed && warmed.boundary === boundary && warmed.slot === slot && warmed.failed ? true : undefined,
        // Handover fix: the liveness facts ride along, so a not-live
        // report against THIS stage is judged by the machine (a
        // warm-up transient is not a death) rather than by the latch
        // alone. warmed.failed is only ever set by the machine's true
        // failure paths now, so the fold above stays sound.
        faceEverLive: warmed && warmed.boundary === boundary && warmed.slot === slot ? warmed.everLive : undefined,
        faceStartFailed: warmed && warmed.boundary === boundary && warmed.slot === slot ? warmed.startFailed : undefined,
      };
      if (avatarRequestedRef.current) {
        // Mount the concealed instance in the free slot; its start()
        // pre-connects during the outgoing line. Face failure leaves
        // faceReady false and the atomic gate will abort the swap at
        // cut-over — the abort now retries once (handleSegmentFailure)
        // instead of discarding the swap for the whole session.
        if (slot === 'second') setSecondFace({ persona, boundary, revealed: false });
        else setMainFace({ persona, boundary, revealed: false });
      }
      // READINESS EXECUTION (F2 generalized by the handover fix):
      // the stage landing is an execution trigger for ANY armed
      // boundary, retry or normal — maybeExecutePending decides via
      // swapWatchdogAction (execute on readiness once no turn is in
      // flight; the arm deadline forces the rest), so a normal arm no
      // longer depends on a later turn_complete to cut over.
      maybeExecutePendingRef.current(boundary);
    })();
  }, [requestSegment, startSwapHold, releaseSwapHold]);
  const armSwapRef = useRef(armSwap); armSwapRef.current = armSwap;
  rearmSwapRef.current = (boundary: PersonaBoundary) => armSwap(boundary, { retry: true });

  /** F3 PRE-STAGE (fluidity batch, 2026-11-10): mount Sara's face
   *  CONCEALED in the free slot and let the pre-stage effect start it
   *  silently, so the doorway gate usually finds her warm instead of
   *  sampling a cold face at the handoff instant and aborting.
   *  Face-only: NO segment is authorized here (see warmedFaceRef).
   *  Respects the 2-concurrent-session reality: Aspen's live face +
   *  this ONE pre-stage, and only while no stage occupies the free
   *  slot. The intro chain never pre-stages (its first boundary is a
   *  cameo, not the doorway) — class is tested as NOT 'intro' because
   *  the phase check already confines this to simulation host phases.
   *  VOICE-FIRST BATCH (2026-11-10 — investigation Q4): the trigger
   *  MOVED from parent go-live to the doorway-ENGAGEMENT point (the
   *  visitor's first post-greeting line, where noteDoorwayEngagement
   *  folds). At go-live the face waited ~87–109 s concealed before
   *  the gate — its readiness record stale or orphaned by then, and
   *  a zero-audio concealed Simli session is exactly what provider
   *  idle reapers target. From engagement, her age at gate time is
   *  ~10–30 s; if the visitor never engages, armSwap mounts the face
   *  at arm time as before. Under voice-first the pre-stage only
   *  accelerates the face attach — it never gates the voice. */
  const prestageDoorwayFace = useCallback(() => {
    if (!avatarRequestedRef.current || warmedFaceRef.current || preStageRef.current) return;
    if (!swapEnabledRef.current || swapStateRef.current.phase !== 'host') return;
    if (swapChainClassRef.current === 'intro' || swapStateRef.current.done.includes('doorway')) return;
    const slot = otherFaceSlot(faceSlotOwnerRef.current);
    warmedFaceRef.current = { boundary: 'doorway', slot, ready: false, failed: false };
    setStageGeneration(g => g + 1);
    recordSwapDiag({ event: 'prestage', boundary: 'doorway', persona: 'sara' });
    if (slot === 'second') setSecondFace({ persona: 'sara', boundary: 'doorway', revealed: false });
    else setMainFace({ persona: 'sara', boundary: 'doorway', revealed: false });
  }, []);

  // Shared local teardown. endSession=true also tells the server the visitor
  // ended the conversation; the Stage 3 suspend path passes false so the
  // server treats the close like a drop and the session stays resumable.
  const teardown = useCallback((endSession: boolean) => {
    // Avatar swap: a full teardown ends the live chain — but a MID-SEGMENT
    // chain is STASHED for the rest of the page visit first, so pressing
    // play again resumes the ACTIVE segment instead of re-authorising a
    // fresh Aspen parent (the restart defect: she re-ran her host script
    // and Sara never came back). Host/intro chains stash nothing: their
    // restart stays the legacy parent resume, byte-identical. The stash
    // is cleared only when a fresh parent authorization lands (a new
    // demo journey) in startConversation.
    if (swapEnabledRef.current && parentSessionIdRef.current && chainIsMidSegment(swapStateRef.current)) {
      visitChainStash.set(agentId || "homepage", {
        state: { ...swapStateRef.current },
        parentSessionId: parentSessionIdRef.current,
        visitorKey: visitorKeyRef.current,
        businessName: businessNameRef.current,
      });
    }
    swapEnabledRef.current = false;
    swapStateRef.current = { ...INITIAL_SWAP_STATE };
    swapChainClassRef.current = null;
    assistantTurnsRef.current = 0;
    introYieldWasBargeInRef.current = false;
    parentSessionIdRef.current = null;
    preStageRef.current = null;
    warmedFaceRef.current = null;
    // Face slots reset with the chain: both slot states clear, pending
    // crossfade retirements are cancelled, ownership returns to main.
    for (const timer of retireTimersRef.current) window.clearTimeout(timer);
    retireTimersRef.current = [];
    faceSlotOwnerRef.current = 'main';
    setFadingSlot(null);
    setMainFace(null);
    setSecondFace(null);
    setActivePersona('aspen');
    setSwapTransition(false);
    swapBusyRef.current = false;
    // Handover fix: the chain's arm/execution bookkeeping dies with it.
    swapHoldRef.current = null;
    setSwapConnecting(null);
    swapArmAtRef.current = {};
    swapExecQueueRef.current = [];
    swapExecForceRef.current = {};
    // Voice-first batch: the pending face attach and the attempt-row
    // map die with the chain too — a stale pending must never let a
    // later session's face attach into a dead segment.
    segmentFacePendingRef.current = null;
    faceTakeoverBusyRef.current = false;
    attemptSessionRef.current = {};
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
    mediaSinkRef.current?.sink?.dispose();
    mediaSinkRef.current = null;
    showMicHintRef.current = false;
    setShowMicHint(false);
    micAwaitRef.current = null;
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
  }, [flushLine, agentId]);

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

  /** MANUAL-STOP SEGMENT RESUME: startConversation calls this when a
   * chain stash exists for this page visit. It runs AFTER the fresh
   * start's tap-side setup (audio contexts unlocked, mic live, face
   * machinery armed) but INSTEAD of minting a fresh parent session:
   * the ACTIVE segment is re-authorised against the ORIGINAL parent
   * with the personaResume opening (welcome-back flavour — no drop
   * apology, no host greeting) and connected on the surviving setup.
   * The persona's face is re-staged into its owning slot (concealed,
   * silently started, then revealed + audio-synced exactly like a
   * cut-over). Returns false when the segment cannot be authorised —
   * the caller then falls through to the plain fresh-parent start, so
   * a resume can never dead-end the visitor. */
  const resumeSegmentChainRef = useRef<(stash: ChainStash) => Promise<boolean>>(async () => false);
  resumeSegmentChainRef.current = async (stash) => {
    const target = chainStashTarget(stash);
    if (!target?.personaSegment) return false;
    // Restore the chain context requestSegment reads (parent, visitor
    // key, business name) BEFORE authorising.
    swapEnabledRef.current = true;
    swapChainClassRef.current = 'simulation';
    parentSessionIdRef.current = stash.parentSessionId;
    visitorKeyRef.current = stash.visitorKey;
    businessNameRef.current = stash.businessName;
    swapStateRef.current = { ...stash.state };
    setActivePersona(stash.state.persona);
    const segment = await requestSegment(target.personaSegment.persona, target.personaSegment.boundary, { swap: false, manualResume: true });
    if (!segment) return false;
    onPersonaChangeRef.current?.({ id: stash.state.persona, displayName: PERSONAS[stash.state.persona].displayName });
    if (avatarRequestedRef.current) {
      // Re-stage her face concealed in its owning slot, start it silent,
      // then reveal + audio-sync like a cut-over (mute-sync, routing,
      // activate — in that order).
      const slot = faceSlotOwnerRef.current;
      if (slot === 'second') setSecondFace({ persona: stash.state.persona, boundary: target.personaSegment.boundary, revealed: false });
      else setMainFace({ persona: stash.state.persona, boundary: target.personaSegment.boundary, revealed: false });
      await new Promise<void>(r => requestAnimationFrame(() => r()));
      const handle = slot === 'second' ? stagedAvatarRef.current : mainSlotRef.current;
      const started = await handle?.start({ silent: true }).catch(() => false);
      if (started && handle) {
        avatarRef.current = handle;
        avatarLiveRef.current = true;
        if (slot === 'second') setSecondFace(face => (face && face.boundary === target.personaSegment?.boundary ? { ...face, revealed: true } : face));
        else setMainFace(face => (face && face.boundary === target.personaSegment?.boundary ? { ...face, revealed: true } : face));
        setFaceLive(true);
        const sync = cutoverAudioSync({ speakerMuted: speakerMutedRef.current, paused: captureRef.current.paused, replaying: captureRef.current.replaying, selectedDeviceId: selectedOutputIdRef.current });
        try { await handle.cutoverAudioSync?.(sync); }
        catch (e) { if (e instanceof Error && e.message === SOUND_BLOCKED) setAudioNeedsTap(true); }
      } else {
        // Her face could not re-stage: continue voice-only on the
        // segment rather than failing the resume. Paired-audio guard
        // (2026-11-10): avatarRequested MUST clear here — leaving it
        // true with avatarLive false made assistantOutput return
        // 'wait', which the player treated as paired, so the resumed
        // segment's first chunk hit the fatal paired-send guard.
        // Clearing it routes this session's output LOCAL from the
        // first chunk (the voice-only continuation intended above).
        avatarRequestedRef.current = false;
        avatarLiveRef.current = false;
        setFaceLive(false);
        if (slot === 'second') setSecondFace(null); else setMainFace(null);
      }
    }
    connectSegmentSocketRef.current(segment.token);
    return true;
  };

  // The moving face could not start (slow connection): keep the call as a voice-only
  // session — still photo stays, Gemini audio plays locally (the existing voice-only
  // mode) and the visitor sees a one-line notice. Her greeting proceeds unchanged.
  // Defined before playPcmChunk, which now engages this same fallback
  // mid-session when a paired send fails (paired-audio guard, 2026-11-10).
  const engageVideoFallback = useCallback(() => {
    avatarRef.current?.stop();
    avatarRequestedRef.current = false;
    avatarLiveRef.current = false;
    // Voice-first batch: the session-wide fallback is TERMINAL for
    // any pending face attach — the segment-level pending variant
    // (playPcmChunk) deliberately does NOT come through here.
    segmentFacePendingRef.current = null;
    setFaceLive(false);
    setFaceWaiting(false);
    setVideoFallback(true);
  }, []);

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
    // VOICE-FIRST ROUTING (voice-first batch, 2026-11-10): while a
    // segment runs voice-first (segmentFacePendingRef set — its
    // socket connected before its face was ready), EVERY chunk routes
    // LOCAL: the visitor hears the segment through the speaker while
    // the face warms, and caption windows stay on the local clock.
    // The takeover flips avatarLiveRef only AFTER the deferred audio
    // sync resolves, so the first paired chunk is always post-sync —
    // the flip is safe chunk-by-chunk.
    const facePending = segmentFacePendingRef.current != null;
    const output = facePending ? 'local' as const : assistantOutput(avatarRequestedRef.current, avatarLiveRef.current, captureRef.current.replaying);
    let pairedVideo = output !== 'local';
    if (pairedVideo) {
      const wasLive = avatarLiveRef.current;
      const sendSucceeded = wasLive ? (avatarRef.current?.sendPcm24k(base64) ?? false) : false;
      if (pairedAudioShouldDegrade(output, wasLive, sendSucceeded)) {
        // PAIRED-AUDIO GUARD (2026-11-10 — segment-death fix): a paired
        // send failure used to trigger a full teardown here, killing the whole
        // call ~2 s into a segment whose face had died on a stale
        // readiness latch (the visitor heard nothing and saw the red
        // "moving face disconnected" banner). A dead face is NOT a dead
        // call: degrade to voice-only for the REST of the session (the
        // engageVideoFallback pattern from session start — face UI
        // honestly falls back to the portrait, avatarRequested clears
        // so every later chunk routes local) and play THIS chunk
        // through the local branch below, so no speech is lost
        // mid-word. The diag event names this failure class in the
        // [persona-swap] trace (it previously left no trace at all).
        // Captions choice: pairedVideo flips to false BEFORE the
        // caption window is computed below, so the degrading chunk's
        // captions ride the LOCAL clock (delay 0) — it is heard
        // locally, at the local schedule, not via Simli's delayed
        // stream, so the paired 0.4 s shift would misalign it.
        // Replay is untouched: replaying forces output 'local' in
        // assistantOutput, so this branch never runs for replay, and
        // preview sessions never request the face (also 'local').
        recordSwapDiag({ event: 'audio-degraded', persona: swapStateRef.current.persona, detail: `output=${output} avatarLive=${wasLive} send=${sendSucceeded} slot=${faceSlotOwnerRef.current}` });
        // VOICE-FIRST DEGRADE VARIANT (voice-first batch): while a
        // face attach is PENDING, the degrade must NOT run
        // engageVideoFallback — it stops avatarRef, which by then
        // points at the INCOMING still-warming face, and clears
        // avatarRequested session-wide, permanently preventing the
        // mid-segment takeover. Degrade THIS chunk (and, via the
        // routing above, every chunk until the takeover) to local
        // playback and leave the face warming. Once the takeover has
        // landed (pending cleared), a later face death degrades via
        // the session-wide fallback exactly as publish #16 built it —
        // degrade stays one-way per segment.
        if (!segmentFacePendingRef.current) engageVideoFallback();
        pairedVideo = false;
      } else {
        // Use a silent local clock for captions/lifecycle, never a second audible voice.
        const clockGain = ctx.createGain(); clockGain.gain.value = 0;
        source.connect(clockGain); clockGain.connect(ctx.destination);
      }
    }
    if (!pairedVideo) {
      const spkGain = ctx.createGain();
      spkGain.gain.value = speakerMutedRef.current ? 0 : 1;
      speakerGainRef.current = spkGain;
      source.connect(spkGain);
      // Media-routed output (see lib/mediaSink.ts): through the audio
      // element once unlocked, so the device's hardware media volume
      // governs her voice; ctx.destination until the element plays.
      spkGain.connect(mediaOutputNode(ctx));
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
  }, [stopEverything, engageVideoFallback]);

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

  // Apply a speaker-output device ("" = platform default) to every audible
  // element this session owns: the Simli paired element (video path, via
  // its handle — it remembers and re-applies at start/activate), a
  // pre-staged swap avatar, the local media-sink element (voice-only
  // path), and — where supported — the playback AudioContext, which
  // governs the ctx.destination fallback while the sink is not ready.
  // True only when at least one target actually applied it.
  const applySpeakerOutput = useCallback(async (deviceId: string): Promise<boolean> => {
    let applied = false;
    for (const handle of [avatarRef.current, stagedAvatarRef.current]) {
      if (handle?.setOutputDevice) {
        try { if (await handle.setOutputDevice(deviceId)) applied = true; } catch { /* keep trying other targets */ }
      }
    }
    const sinkElement = mediaSinkRef.current?.sink?.element;
    if (sinkElement && await applySinkIdToElement(sinkElement, deviceId)) applied = true;
    const ctx = playCtxRef.current;
    if (audioContextSetSinkIdSupported(ctx)) {
      try { await (ctx as unknown as { setSinkId: (id: string) => Promise<void> }).setSinkId(deviceId); applied = true; } catch { /* best effort */ }
    }
    return applied;
  }, []);

  const refreshSpeakerOutputs = useCallback(async () => {
    const result = await listSpeakerOutputs();
    setSpeakerOutputs(result.devices);
    setSpeakerCanSelect(result.canSelect);
    return result;
  }, []);

  // Session-start default (owner's rule): Bluetooth when connected,
  // otherwise the loudspeaker — applied ONCE per live session, and only
  // when the platform exposes a selectable device to apply. When it does
  // not, the session keeps the platform route and the menu says so.
  useEffect(() => {
    if (phase === "idle") { defaultOutputAppliedRef.current = false; setSpeakerMenuOpen(false); return; }
    if (phase !== "live" || defaultOutputAppliedRef.current) return;
    defaultOutputAppliedRef.current = true;
    void (async () => {
      const { devices, canSelect } = await refreshSpeakerOutputs();
      if (!canSelect || selectedOutputIdRef.current) return;
      const pick = pickDefaultSpeakerOutput(devices);
      if (!pick) return;
      selectedOutputIdRef.current = pick.deviceId;
      setSelectedOutputId(pick.deviceId);
      await applySpeakerOutput(pick.deviceId);
    })();
  }, [phase, refreshSpeakerOutputs, applySpeakerOutput]);

  // Keep the menu's device list honest as devices come and go.
  useEffect(() => {
    const update = () => { void refreshSpeakerOutputs(); };
    navigator.mediaDevices?.addEventListener?.("devicechange", update);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", update);
  }, [refreshSpeakerOutputs]);

  const chooseSpeakerDevice = useCallback(async (device: SpeakerOutputDevice) => {
    setSpeakerMenuOpen(false);
    setSpeakerOutputNotice(null);
    if (speakerMutedRef.current) toggleSpeakerMute();
    const previous = selectedOutputIdRef.current;
    selectedOutputIdRef.current = device.deviceId;
    setSelectedOutputId(device.deviceId);
    const applied = await applySpeakerOutput(device.deviceId);
    if (!applied) {
      // Nothing accepted the route (e.g. the device vanished): do not
      // checkmark a route that is not real — revert and say so.
      selectedOutputIdRef.current = previous;
      setSelectedOutputId(previous);
      if (previous) void applySpeakerOutput(previous);
      setSpeakerOutputNotice(t("voice.speakerSwitchFailed"));
    }
  }, [applySpeakerOutput, toggleSpeakerMute, t]);

  const choosePlatformOutput = useCallback(() => {
    setSpeakerMenuOpen(false);
    setSpeakerOutputNotice(null);
    if (speakerMutedRef.current) toggleSpeakerMute();
    selectedOutputIdRef.current = null;
    setSelectedOutputId(null);
    void applySpeakerOutput("");
  }, [applySpeakerOutput, toggleSpeakerMute]);

  const chooseSpeakerMute = useCallback(() => {
    setSpeakerMenuOpen(false);
    if (!speakerMutedRef.current) toggleSpeakerMute();
  }, [toggleSpeakerMute]);

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

  /** Provider `closed` MESSAGE recovery: when the Gemini provider dies,
   *  the proxy first tries its own session resumption; only when that is
   *  impossible does it send {type:'closed', code} and close our socket.
   *  That message used to end the call with a red "Session ended" error.
   *  Treat it exactly like the abnormal socket close (1006/1011) path
   *  below — silent reconnect through the existing machinery (legacy
   *  resume reconnect, or Stage 1 same-persona drop recovery) — with
   *  manual Talk as the fallback once the bounded attempts are spent.
   *  The real socket close that follows is neutralized by the
   *  generation bump inside teardown. Deliberate server endings
   *  (quiet period, time limit) carry NO provider code and still end
   *  the call cleanly in the message switch. */
  const recoverFromProviderClosed = useCallback((code: number) => {
    sessionRecoveringRef.current = true;
    // F4 CHAIN SNAPSHOT BEFORE TEARDOWN (fluidity batch, 2026-11-10):
    // the full teardown clears swapEnabledRef + the whole swap state,
    // which is why the personaDrop branch below could NEVER fire — a
    // mid-segment provider death always fell through to the legacy
    // parent reconnect (Aspen resumed AS the receptionist, chain reset
    // to host). Snapshot first: a MID-SEGMENT drop takes the PARTIAL
    // teardown only (socket closes; mic, both audio contexts and the
    // persona's face all survive), the chain state stays live, and the
    // branch below genuinely re-authorizes the SAME persona. All
    // other drops keep the full teardown; their snapshot is stashed
    // for the reconnected parent's arming block (host doorway re-arm).
    const chainSnap = snapshotChainState();
    if (chainSnap && chainIsMidSegment(chainSnap.state)) {
      partialTeardownForSwap();
    } else {
      if (chainSnap) chainDropSnapshotRef.current = chainSnap;
      stopEverything();
    }
    if (swapEnabledRef.current) { dropRecoverRef.current(); return; }
    if (reconnectRef.current.count < 3) {
      reconnectRef.current = { pending: true, count: reconnectRef.current.count + 1 };
      setStatus("Reconnecting…");
      window.setTimeout(() => { void startConversationRef.current(); }, 400);
      return;
    }
    sessionRecoveringRef.current = false;
    setError(voiceDisconnectMessage(code, ''));
  }, [stopEverything, partialTeardownForSwap]);
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
    micAwaitRef.current = null;
    micGateHeardRef.current = 0;
    micTranscriptRef.current = 0;
    micHintLastRef.current = 0;
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
      // Prime the media-routed playback sink while the tap's user
      // activation is fresh, so her voice can play through the audio
      // element (hardware media volume) from the first chunk.
      mediaOutputNode(playCtx);
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
      // MANUAL-STOP SEGMENT RESUME: a mid-segment chain stashed by the
      // last teardown (this page visit) resumes HERE — after the tap's
      // audio unlock, before any fresh session is minted — by
      // re-authorising the ACTIVE segment against its original parent.
      // No stash (or a host-phase stop) ⇒ this branch never runs and the
      // fresh-parent start below is byte-identical to before. A failed
      // resume falls through to that same fresh start.
      if (!preview && !warm && !reconnecting) {
        const stash = visitChainStash.get(agentId || "homepage");
        if (stash && await resumeSegmentChainRef.current(stash)) {
          visitChainStash.delete(agentId || "homepage");
          window.clearTimeout(startupTimeout);
          startingRef.current = false;
          return;
        }
      }
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
        swapChainClassRef.current = 'simulation';
        parentSessionIdRef.current = String(authorized.sessionId || '');
        visitorKeyRef.current = visitorKey;
        businessNameRef.current = String(authorized.businessName || '');
        swapStateRef.current = { ...INITIAL_SWAP_STATE };
        // F4 HOST-DOORWAY RE-ARM (fluidity batch, 2026-11-10): this
        // start is the legacy reconnect after a HOST-phase drop whose
        // doorway was armed-but-undone — carry the intent across: the
        // reconnected parent's state starts with pendingDoorway set
        // (and the drop count preserved), and goLive's F3 pre-stage
        // re-warms Sara's face immediately, so the doorway executes
        // on her FIRST completed line of the new parent instead of
        // waiting for a fresh visitor engagement plus a full extra
        // Aspen turn. The snapshot is consumed either way; a stale
        // one (over 2 minutes old) is simply dropped.
        const dropSnap = chainDropSnapshotRef.current;
        chainDropSnapshotRef.current = null;
        if (reconnecting && dropSnap && Date.now() - dropSnap.at < SEGMENT_TOKEN_TTL_MS
          && dropSnap.chainClass === 'simulation' && dropSnap.state.phase === 'host'
          && dropSnap.state.armed.includes('doorway') && !dropSnap.state.done.includes('doorway')) {
          swapStateRef.current = { ...INITIAL_SWAP_STATE, pendingDoorway: true, drops: dropSnap.state.drops };
        }
        setActivePersona('aspen');
        // A fresh parent authorization is a genuinely new demo journey:
        // any chain stashed by the previous one is spent.
        visitChainStash.delete(agentId || "homepage");
      }
      // Team intro arming (design §7): a DIFFERENT arming class — the
      // demo-page explainer parent (server echo teamIntroEnabled, no
      // business id on this session) starts the swap machine in phase
      // 'intro' with the same parent session id, authorized against
      // gemini-session's intro parent class. Invariant: businessNameRef
      // is NOT set, so every swap recap this machine builds carries
      // persona-only flavor. Flag-off ⇒ no echo ⇒ nothing changes.
      if (!preview && authorized.teamIntroEnabled === true && !leadId && !prospectId) {
        swapEnabledRef.current = true;
        swapChainClassRef.current = 'intro';
        parentSessionIdRef.current = String(authorized.sessionId || '');
        visitorKeyRef.current = visitorKey;
        swapStateRef.current = { ...INITIAL_SWAP_STATE, phase: 'intro' };
        setActivePersona('aspen');
        visitChainStash.delete(agentId || "homepage");
      }
      homepageWalkthroughRef.current = authorized.homepageSales === true;
      idleRef.current = { enabled: (authorized.idleChecks === true || authorized.homepageSales === true) && !preview, stage: 'waiting', quietSince: Date.now(), generating: true, requestedAt: 0 };
      setHandoffToken(authorized.handoffToken || null);
      const ws = new WebSocket(`${voiceProxyWsUrl()}?token=${encodeURIComponent(authorized.token)}&capture=${captureMode}${warm ? '&hold=1' : ''}`);
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
        sessionRecoveringRef.current = false;
        // Arm the opening mic gate: silence frames until her first turn completes.
        openingGateRef.current = true;
        openingGateSinceRef.current = performance.now();
        if(!preview)void trackCampaignEvent('voice_started');
        setPhase(preview ? "preview" : "live");
        setStatus(preview ? "Preparing greeting audio…" : captureMode === "hold" ? "Live — hold to talk" : "Live — hands-free");
        // F3 PRE-STAGE — MOVED (voice-first batch, 2026-11-10):
        // warming Sara's face at go-live left it ~87–109 s old at
        // the doorway gate (Aspen's opening runs that long), its
        // readiness record stale/orphaned by then. The pre-stage now
        // triggers at the doorway-ENGAGEMENT point (the visitor's
        // first post-greeting line) in the transcript handlers below;
        // see prestageDoorwayFace.
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
          if (gate.open) micGateHeardRef.current = Date.now();
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
          // Swap hold (handover fix): while a persona swap is armed and
          // unresolved, every frame is silence too — the host hears no
          // new visitor turn, so she cannot generate her next scripted
          // beat into the handover (retest #3's A2/A3 stall).
          const pcm = microphonePcm(micAudioPasses({ swapHold: swapHoldRef.current !== null, openingGate, noiseGateOpen: gate.open, holdToTalk: capture.mode === "hold" }) ? input : new Float32Array(input.length), e.inputBuffer.sampleRate);
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
            // A fresh socket speaks a fresh greeting: completed-turn
            // counting for the structural doorway starts over.
            assistantTurnsRef.current = 0;
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
            micAwaitRef.current = null;
            if (handoffRef.current) break;
            // Keep the last response locally, never request a new model generation to replay.
            if (currentAudioRef.current.length < 6000) currentAudioRef.current.push(msg.data as string);
            if (!captureRef.current.paused) playPcmChunk(msg.data as string);
            break;
          case "interrupted":
            clearPlayback();
            flushLine("assistant");
            // Team intro bridge yield (design §3.3 rule 2): a TRUE
            // barge-in (playback cut) on a bridge beat flags the
            // abandonment; the latch applies at turn completion.
            if (swapEnabledRef.current && liveRef.current && introYieldOnVisitorLine(swapStateRef.current)) {
              introYieldWasBargeInRef.current = true;
            }
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
            micTranscriptRef.current = Date.now();
            micAwaitRef.current = null;
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
            // Visitor-armed meet-alex (2026-11-09): the visitor asking
            // for Alex / setup help / a staff meeting arms the handover
            // from THEIR line — noteAlexIntent sets pendingAlex (in
            // simulation it also sets pendingStepout, so Sara steps out
            // first and Alex fires on Aspen's first close line).
            if (swapEnabledRef.current && liveRef.current) {
              swapStateRef.current = noteAlexIntent(swapStateRef.current, userLineRef.current);
            }
            // Structural doorway (2026-11-09 hardening): on a
            // business-demo chain, a visitor line arriving AFTER the
            // host's greeting turn completed means the simulation is
            // beginning — noteDoorwayEngagement sets pendingDoorway
            // and Aspen's next line enters the simulation whatever
            // words it uses (the anchor is only the earlier net).
            // Simulation chains only: the explainer chain is class
            // 'intro' and a homepage session has no chain at all.
            if (swapEnabledRef.current && liveRef.current && swapChainClassRef.current === 'simulation') {
              swapStateRef.current = noteDoorwayEngagement(swapStateRef.current, assistantTurnsRef.current > 0);
              // DELAYED F3 PRE-STAGE (voice-first batch): the SAME
              // engagement point starts Sara's face warming — tens of
              // seconds before the doorway can arm, not ~90 s early
              // at go-live. Self-gated (host phase, no stage/warmed
              // face yet), so repeat visitor lines are no-ops.
              prestageDoorwayFace();
            }
            // Team intro bridge yield: a visitor line DURING a bridge
            // beat flags the abandonment; the turn_complete handler
            // applies the latch (design §3.3 rule 2).
            if (swapEnabledRef.current && liveRef.current && introYieldOnVisitorLine(swapStateRef.current)) {
              introYieldWasBargeInRef.current = true;
            }
            break;
          case "turn_complete": {
            // Her opening turn just finished: the mic gate lifts (turn-based).
            openingGateRef.current = false;
            assistantTurnsRef.current += 1;
            micAwaitRef.current = Date.now();
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
                ?? pendingExecutionBoundary(state)
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
              } else if (state.pendingAlex && (state.phase === 'host' || state.phase === 'close') && !state.armed.includes('meet-alex') && !state.done.includes('meet-alex')) {
                // The visitor asked for Alex, but Aspen's line completed
                // without anything staged: arm now — and the flag STAYS
                // set (unlike pendingStepout above), so her NEXT line
                // still yields meet-alex via boundaryForAssistantLine
                // and the swap follows that line.
                armSwapRef.current('meet-alex');
              } else if (state.pendingDoorway && state.phase === 'host' && !state.armed.includes('doorway') && !state.done.includes('doorway')) {
                // Structural doorway late arm — same pattern as
                // meet-alex above: the visitor engaged after the
                // greeting, but this line completed without anything
                // staged (e.g. a one-turn host phase). Arm now; the
                // flag STAYS set, so her NEXT line still yields
                // 'doorway' via boundaryForAssistantLine.
                armSwapRef.current('doorway');
              }
              // Team intro yield (design §3.3 rules 2–3): if the visitor
              // interrupted a BRIDGE beat during this turn, the show is
              // abandoned silently — latch set; the staged-but-unused
              // boundary (if the bridge line had already armed it) is
              // disarmed so it can never cut over later.
              const after = swapStateRef.current;
              if ((after.phase === 'intro' || after.phase === 'intro-host') && introYieldWasBargeInRef.current && !after.teamIntroDone) {
                swapStateRef.current = { ...after, teamIntroDone: true, armed: after.armed.filter(b => !(b === 'intro-sara' || b === 'intro-alex' || b === 'intro-return-1' || b === 'intro-return-2')) };
                introYieldWasBargeInRef.current = false;
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
          case "closed": {
            if (liveRef.current) {
              // A provider code means the provider died (and the
              // proxy's own resumption already failed): recover like a
              // 1006/1011 socket drop. No code = a deliberate server
              // ending (quiet period / time limit), ending cleanly.
              if (typeof msg.code === "number") { recoverFromProviderClosed(msg.code); break; }
              stopEverything();
              setError(`Session ended: ${msg.reason || "unknown"}`);
            }
            break;
          }
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
          // F4 CHAIN SNAPSHOT BEFORE TEARDOWN (fluidity batch,
          // 2026-11-10): snapshot the swap chain BEFORE stopEverything
          // clears it (the old order made the drop-recovery test below
          // unreachable — swapEnabledRef was always false by then).
          // A mid-segment drop (this socket is normally the parent's,
          // but the rule is uniform) recovers the SAME persona in
          // place via the partial teardown; any other drop stashes
          // its snapshot for the reconnected parent's arming block.
          const chainSnap = snapshotChainState();
          if (chainSnap && chainIsMidSegment(chainSnap.state) && (event.code === 1006 || event.code === 1011)) {
            partialTeardownForSwap();
            dropRecoverRef.current();
            return;
          }
          if (chainSnap) chainDropSnapshotRef.current = chainSnap;
          stopEverything();
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
  }, [voice, microphone, captureMode, refreshMicrophones, playPcmChunk, clearPlayback, flushLine, stopEverything, agentId, leadId, prospectId, draft, previewVoice, previewAudioContext, visitorName, consent, testModel, shareToken, onRecommendedPlan, videoAvatar, startFace, recoverFromProviderClosed]);

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
  const connectSegmentSocket = useCallback((token: string, ctx?: { boundary: PersonaBoundary; persona: PersonaId; attempt: number; onFailure?: (info: { stage: 'timeout' | 'error' | 'close'; code?: number; reason?: string }) => void }) => {
    const generation = generationRef.current;
    // Segment-connect traceability + single failure funnel (reliability,
    // 2026-11-09): when the caller supplies a ctx (the planned cut-over
    // does), a pre-ready death of this socket is reported ONCE to
    // ctx.onFailure — which retries with a fresh authorization — instead
    // of scattering across the timeout/error/close handlers below.
    // Callers without a ctx (drop recovery, manual resume) keep the
    // legacy handling byte-for-byte.
    let connectFailureReported = false;
    const reportConnectFailure = (info: { stage: 'timeout' | 'error' | 'close'; code?: number; reason?: string }) => {
      if (connectFailureReported || !ctx?.onFailure) return;
      connectFailureReported = true;
      recordSwapDiag({ event: 'connect-failed', boundary: ctx.boundary, persona: ctx.persona, attempt: ctx.attempt, detail: `${info.stage}${info.code ? `:${info.code}` : ''}${info.reason ? ` ${info.reason}` : ''}` });
      ctx.onFailure(info);
    };
    if (ctx) recordSwapDiag({ event: 'connect-attempt', boundary: ctx.boundary, persona: ctx.persona, attempt: ctx.attempt });
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
    const ws = new WebSocket(`${voiceProxyWsUrl()}?token=${encodeURIComponent(token)}&capture=${captureMode}`);
    wsRef.current = ws;
    const goLiveSegment = () => {
      if (generation !== generationRef.current) return;
      liveRef.current = true;
      sessionRecoveringRef.current = false;
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
        if (gate.open) micGateHeardRef.current = Date.now();
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
        // Swap hold (handover fix): same silence rule on the segment
        // socket — a boundary armed from inside a segment (step-out,
        // meet-alex) holds this persona's mic until it resolves.
        const pcm = microphonePcm(micAudioPasses({ swapHold: swapHoldRef.current !== null, openingGate, noiseGateOpen: gate.open, holdToTalk: capture.mode === "hold" }) ? input : new Float32Array(input.length), e.inputBuffer.sampleRate);
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
        // The incoming segment never became ready. With a connect ctx
        // the failure funnels to the retry handler; without one, the
        // call cannot continue on a dead socket — end cleanly rather
        // than hang.
        if (ctx?.onFailure) { reportConnectFailure({ stage: 'timeout' }); return; }
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
          if (ctx) recordSwapDiag({ event: 'connect-ready', boundary: ctx.boundary, persona: ctx.persona, attempt: ctx.attempt });
          assistantTurnsRef.current = 0;
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
          micAwaitRef.current = null;
          if (handoffRef.current) break;
          if (currentAudioRef.current.length < 6000) currentAudioRef.current.push(msg.data as string);
          if (!captureRef.current.paused) playPcmChunk(msg.data as string);
          break;
        case "interrupted":
          clearPlayback();
          flushLine("assistant");
          // Team intro bridge yield — same rule as the main socket.
          if (swapEnabledRef.current && liveRef.current && introYieldOnVisitorLine(swapStateRef.current)) {
            introYieldWasBargeInRef.current = true;
          }
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
          micTranscriptRef.current = Date.now();
          micAwaitRef.current = null;
          walkthroughRef.current.continued = false;
          idleRef.current.stage = 'waiting';
          idleRef.current.quietSince = Date.now();
          userLineRef.current += msg.text as string;
          setPartialUser(userLineRef.current);
          if (swapEnabledRef.current && liveRef.current && swapStateRef.current.phase === 'simulation' && visitorSignalsStepOut(userLineRef.current)) {
            swapStateRef.current = { ...swapStateRef.current, pendingStepout: true };
          }
          // Visitor-armed meet-alex — same rule as the main socket.
          if (swapEnabledRef.current && liveRef.current) {
            swapStateRef.current = noteAlexIntent(swapStateRef.current, userLineRef.current);
          }
          // Structural doorway — same rule as the main socket.
          if (swapEnabledRef.current && liveRef.current && swapChainClassRef.current === 'simulation') {
            swapStateRef.current = noteDoorwayEngagement(swapStateRef.current, assistantTurnsRef.current > 0);
            // Delayed F3 pre-stage — same engagement trigger as the
            // main socket (self-gated; a segment socket is past the
            // host phase, so this is a no-op there by construction).
            prestageDoorwayFace();
          }
          // Team intro bridge yield — same rule as the main socket.
          if (swapEnabledRef.current && liveRef.current && introYieldOnVisitorLine(swapStateRef.current)) {
            introYieldWasBargeInRef.current = true;
          }
          break;
        case "turn_complete": {
          openingGateRef.current = false;
          assistantTurnsRef.current += 1;
          micAwaitRef.current = Date.now();
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
              ?? pendingExecutionBoundary(state)
              ?? (state.phase === 'simulation' && state.pendingStepout && state.armed.includes('stepout') ? 'stepout' as PersonaBoundary : null);
            if (boundary && state.armed.includes(boundary) && !state.done.includes(boundary)) {
              swapHandled = true;
              void executeSwapRef.current(boundary);
            } else if (state.pendingStepout && !state.armed.includes('stepout')) {
              swapStateRef.current = { ...state, pendingStepout: false };
              armSwapRef.current('stepout');
            } else if (state.pendingAlex && (state.phase === 'host' || state.phase === 'close') && !state.armed.includes('meet-alex') && !state.done.includes('meet-alex')) {
              // Visitor-armed meet-alex late arm — same rule as the main
              // socket: arm now, flag stays set for her next line.
              armSwapRef.current('meet-alex');
            } else if (state.pendingDoorway && state.phase === 'host' && !state.armed.includes('doorway') && !state.done.includes('doorway')) {
              // Structural doorway late arm — same rule as the main socket.
              armSwapRef.current('doorway');
            }
            // Team intro yield — same rule as the main socket (design §3.3).
            const after = swapStateRef.current;
            if ((after.phase === 'intro' || after.phase === 'intro-host') && introYieldWasBargeInRef.current && !after.teamIntroDone) {
              swapStateRef.current = { ...after, teamIntroDone: true, armed: after.armed.filter(b => !(b === 'intro-sara' || b === 'intro-alex' || b === 'intro-return-1' || b === 'intro-return-2')) };
              introYieldWasBargeInRef.current = false;
            }
          }
          if (!swapHandled) { flushLine("user"); flushLine("assistant"); }
          break;
        }
        case "error":
          setError(String(msg.message || "Voice service error"));
          stopEverything();
          break;
        case "closed": {
          if (liveRef.current) {
            if (typeof msg.code === "number") { recoverFromProviderClosed(msg.code); break; }
            stopEverything();
            setError(`Session ended: ${msg.reason || "unknown"}`);
          }
          break;
        }
      }
    };
    ws.onerror = () => {
      if (generation !== generationRef.current) return;
      // A pre-ready error on a ctx socket (e.g. the proxy's 401 for an
      // expired/consumed token surfaces here as a failed handshake)
      // funnels to the retry handler; the close that follows it is
      // swallowed by the connectFailureReported guard in onclose.
      if (ctx?.onFailure && !liveRef.current) { reportConnectFailure({ stage: 'error' }); return; }
      setError("Could not connect to the voice service.");
      stopEverything();
    };
    ws.onclose = (event) => {
      window.clearTimeout(readyTimeout);
      if (generation !== generationRef.current) return;
      if (connectFailureReported) return;
      if (liveRef.current) {
        // F4 CHAIN SNAPSHOT BEFORE TEARDOWN (fluidity batch,
        // 2026-11-10): this is the socket a mid-segment drop actually
        // arrives on. Snapshot BEFORE any teardown: a mid-segment
        // 1006/1011 takes the PARTIAL teardown (mic, contexts and the
        // persona's face survive) and re-authorizes the SAME persona
        // through dropRecover — the personaDrop opening server-side.
        // The old order (full teardown, then test swapEnabledRef)
        // made that branch unreachable, so every segment drop fell
        // back to a fresh Aspen parent with the chain reset to host.
        const chainSnap = snapshotChainState();
        if (chainSnap && chainIsMidSegment(chainSnap.state) && (event.code === 1006 || event.code === 1011)) {
          partialTeardownForSwap();
          dropRecoverRef.current();
          return;
        }
        if (chainSnap) chainDropSnapshotRef.current = chainSnap;
        stopEverything();
        if ((event.code === 1006 || event.code === 1011) && reconnectRef.current.count < 3) {
          reconnectRef.current = { pending: true, count: reconnectRef.current.count + 1 };
          setStatus("Reconnecting…");
          window.setTimeout(() => { void startConversationRef.current(); }, 400);
          return;
        }
        setError(voiceDisconnectMessage(event.code, event.reason));
      } else if (ctx?.onFailure) {
        reportConnectFailure({ stage: 'close', code: event.code, reason: event.reason });
      } else {
        setPhase("idle");
        setStatus("Conversation ended. Press Start to begin again.");
      }
    };
  }, [agentId, captureMode, clearPlayback, flushLine, onRecommendedPlan, playPcmChunk, stopEverything, recoverFromProviderClosed]);
  connectSegmentSocketRef.current = connectSegmentSocket;

  /** VOICE-FIRST FACE TAKEOVER (voice-first batch, 2026-11-10 —
   *  investigation Q3-D3): a segment running voice-first has its face
   *  attach the moment the face reports live. The takeover runs the
   *  DEFERRED cut-over audio sync (mute-sync → speaker routing →
   *  activate, the same order as the face-first path) and only AFTER
   *  it resolves flips avatarLiveRef — so the first paired PCM chunk
   *  is always post-sync, and chunks arriving during the sync still
   *  route local (the pending record is cleared only on success).
   *  The reveal lands mid-segment over the portrait (a short
   *  crossfade — strictly better than the old all-or-nothing gate).
   *  A sync that reports the face dead after all leaves the pending
   *  in place: the segment keeps running voice-over-portrait and a
   *  later live report may retry the attach. Guards: the pending
   *  must name THIS slot, the slot must own the face, and the active
   *  persona must still be the pending persona (a later boundary's
   *  cut-over invalidates a stale takeover). */
  /* REVIVAL KICK (voice-first batch): when a voice-first cut-over
   * pends the attach on an instance that is neither live nor
   * starting, kick ONE bounded revival start on the SAME instance
   * (never a second Simli session — the 2-session cap holds). It
   * lives OUTSIDE executeSwap on purpose: the cut-over body carries
   * a pinned invariant — no start() re-call inside it (the
   * 2026-11-09 defect-1 trap restarted a live face mid-sync) — and
   * this kick is a revival of a dead/idle instance, gated on exactly
   * that liveness read, so it can never restart a live stream. */
  kickFaceRevivalRef.current = (slot: FaceSlot) => {
    const handle = slot === 'second' ? stagedAvatarRef.current : mainSlotRef.current;
    if (!handle?.start || !handle.liveness) return;
    const snap = handle.liveness();
    if (snap.live || snap.starting) return;
    void handle.start({ silent: true, maxAttempts: 1 }).catch(() => false);
  };
  runFaceTakeoverRef.current = async (slot: FaceSlot) => {
    const pending = segmentFacePendingRef.current;
    if (!pending || pending.slot !== slot || faceTakeoverBusyRef.current) return;
    if (faceSlotOwnerRef.current !== slot) return;
    if (swapStateRef.current.persona !== pending.persona) return;
    const handle = slot === 'second' ? stagedAvatarRef.current : mainSlotRef.current;
    if (!handle) return;
    faceTakeoverBusyRef.current = true;
    try {
      const sync = cutoverAudioSync({ speakerMuted: speakerMutedRef.current, paused: captureRef.current.paused, replaying: captureRef.current.replaying, selectedDeviceId: selectedOutputIdRef.current });
      let faceLive = true;
      if (handle.cutoverAudioSync) {
        try { faceLive = (await handle.cutoverAudioSync(sync)) !== false; }
        catch (e) { if (e instanceof Error && e.message === SOUND_BLOCKED) setAudioNeedsTap(true); }
      } else {
        handle.setPlaybackMuted(sync.muted);
        if (sync.deviceId) void handle.setOutputDevice?.(sync.deviceId);
        try { faceLive = (await handle.activate()) !== false; }
        catch (e) { if (e instanceof Error && e.message === SOUND_BLOCKED) setAudioNeedsTap(true); }
      }
      if (!faceLive) return;
      // Re-validate after the await: the segment may have ended or
      // handed over while the sync ran.
      if (segmentFacePendingRef.current !== pending) return;
      if (swapStateRef.current.persona !== pending.persona) return;
      segmentFacePendingRef.current = null;
      avatarLiveRef.current = true;
      if (slot === 'second') setSecondFace(face => (face && face.boundary === pending.boundary ? { ...face, revealed: true } : face));
      else setMainFace(face => (face && face.boundary === pending.boundary ? { ...face, revealed: true } : face));
      setFaceLive(true);
      recordSwapDiag({ event: 'face-takeover', boundary: pending.boundary, persona: pending.persona });
      persistSwapDiagRef.current({ event: 'face-takeover', boundary: pending.boundary, persona: pending.persona, faceState: 'live' });
    } finally {
      faceTakeoverBusyRef.current = false;
    }
  };

  /** ATOMIC CUT-OVER (spec §5.4/§6.2 corrected order): the gate decides
   * BEFORE anything visible changes; then the old face freezes (its last
   * keyed frame covers the reveal), audio routing re-points to the
   * incoming instance, the old socket closes last (partial teardown),
   * and the new socket opens on the pre-authorized token. No phase
   * change, no status change, no spinner: swapTransition only suppresses
   * the connecting UI while phase stays 'live'.
   * FACE TRANSITION (owner transition spec, 2026-11-09): the reveal is
   * a ~300ms CROSSFADE inside the portrait area only — the incoming
   * face (already live in the free slot, first frame displayed: the
   * gate required it) dissolves in over the outgoing persona's frozen
   * frame while that frame dissolves out; when the fade lands, the
   * outgoing instance retires (its kept frame is cleared) and its slot
   * frees for the next boundary. The widget frame, controls, caption
   * region and layout never move. If the incoming face is NOT ready,
   * the gate above aborts the swap whole — the outgoing persona
   * continues live, so no black or empty frame can ever appear. */
  executeSwapRef.current = async (boundary: PersonaBoundary, opts?: { immediate?: boolean }) => {
    let staged = preStageRef.current;
    const state = swapStateRef.current;
    const finalizeTurn = () => { flushLine("user"); flushLine("assistant"); };
    recordSwapDiag({ event: 'execute', boundary, persona: BOUNDARY_TARGET[boundary], attempt: segmentAttemptsFor(state, boundary) + 1 });
    // Handover fix: single-flight QUEUE — a trigger that lands while a
    // cut-over is busy is remembered (with any immediate-gate demand
    // the watchdog attached to it), never discarded; the watchdog
    // interval drains the queue the moment the busy flag clears.
    if (swapBusyRef.current) {
      swapExecQueueRef.current = enqueueSwapExecution(swapExecQueueRef.current, boundary);
      if (opts?.immediate) swapExecForceRef.current = { ...swapExecForceRef.current, [boundary]: true };
      recordSwapDiag({ event: 'execute-queued', boundary, persona: BOUNDARY_TARGET[boundary], attempt: segmentAttemptsFor(state, boundary) + 1, detail: opts?.immediate ? 'immediate' : undefined });
      finalizeTurn();
      return;
    }
    // F1 GATE-WAIT (fluidity batch, 2026-11-10 — root-cause F1): the
    // gate used to sample the stage EXACTLY ONCE, at this instant,
    // while the incoming face needs seconds to pre-stage (Simli token,
    // LiveKit connect, first displayed frame) and the authorization
    // itself is a network round-trip — first attempts failed
    // STRUCTURALLY and the still-warming face was discarded. Hold the
    // busy flag and WAIT — bounded by SWAP_GATE_WAIT_MS, polling the
    // stage entry — for the stage to exist and its face to become
    // ready. The attempt fails only when the wait expires, the face
    // settles failed, or the staged token crosses the freshness bound
    // (the stale path below re-authorizes). Every exit below releases
    // the busy flag held here; the success path re-asserts it.
    swapBusyRef.current = true;
    const waitStartedAt = Date.now();
    // Handover fix: a watchdog-forced execution runs an IMMEDIATE gate
    // (no wait) — the arm deadline / stage watchdog already spent the
    // waiting budget, so the decision (cut over, or the ledger's retry
    // vs visible fallback) happens now, not 8 s later.
    const immediate = opts?.immediate === true || swapExecForceRef.current[boundary] === true;
    if (swapExecForceRef.current[boundary]) { const rest = { ...swapExecForceRef.current }; delete rest[boundary]; swapExecForceRef.current = rest; }
    const waitDeadline = immediate ? waitStartedAt : waitStartedAt + SWAP_GATE_WAIT_MS;
    let waited = false;
    while (liveRef.current && Date.now() < waitDeadline) {
      staged = preStageRef.current;
      if (!gateWaitContinues({
        stagePresent: !!staged,
        boundaryMatches: staged?.boundary === boundary,
        faceReady: staged?.faceReady === true,
        faceFailed: staged?.faceFailed === true,
        tokenStale: staged ? segmentTokenStale(staged.authorizedAt, Date.now()) : false,
      }, avatarRequestedRef.current)) break;
      waited = true;
      await new Promise<void>(resolve => window.setTimeout(resolve, SWAP_GATE_POLL_MS));
    }
    staged = preStageRef.current;
    if (waited) recordSwapDiag({ event: 'gate-wait', boundary, persona: BOUNDARY_TARGET[boundary], attempt: segmentAttemptsFor(state, boundary) + 1, detail: `waitedMs=${Date.now() - waitStartedAt} ready=${!!staged && staged.boundary === boundary && staged.faceReady}` });
    if (!staged || staged.boundary !== boundary || !liveRef.current) {
      // Stage missing at the execution instant — the arm/execute race
      // (authorization still in flight when the handoff line completed)
      // or a stage discarded upstream. Previously a silent return that
      // spent the boundary forever; now it funnels into the retry
      // ledger (one fresh authorization) before words-only fallback.
      // (With the gate-wait above, this is reached only when the wait
      // expired or the call stopped being live mid-wait.)
      if (liveRef.current && state.armed.includes(boundary) && !state.done.includes(boundary)) {
        handleSegmentFailureRef.current(boundary, !staged ? 'stage-missing' : 'stage-mismatch');
      }
      finalizeTurn();
      swapBusyRef.current = false;
      return;
    }
    // Clear one slot's staged/active persona state (the slot unmounts
    // or reverts to the standard face render once its state is gone).
    const clearFaceSlot = (slot: FaceSlot) => { if (slot === 'second') setSecondFace(null); else setMainFace(null); };
    if (segmentTokenStale(staged.authorizedAt, Date.now())) {
      // Token lifecycle guard: staged tokens die server-side 120 s
      // after authorization (consume_gemini_session refuses expired
      // tokens). Connecting a stale token would 401 the segment socket
      // AFTER the partial teardown — stranding the call. Re-authorize
      // through the retry ledger while the current persona is still
      // live and untouched instead.
      recordSwapDiag({ event: 'token-stale', boundary, persona: staged.persona, attempt: segmentAttemptsFor(state, boundary) + 1, detail: `ageMs=${Date.now() - staged.authorizedAt}` });
      // F3: a stage sitting on the pre-warmed second-slot face keeps
      // that face mounted across the abort when a retry will use it —
      // only the token is dead, never the face.
      const keepWarmedFace = staged.slot === 'second' && !staged.faceFailed
        && warmedFaceRef.current?.boundary === boundary && warmedFaceRef.current.slot === 'second';
      if (!keepWarmedFace) {
        if (avatarRequestedRef.current && staged.slot === 'main') mainSlotRef.current?.stop();
        if (avatarRequestedRef.current) clearFaceSlot(staged.slot);
        if (warmedFaceRef.current?.boundary === boundary) warmedFaceRef.current = null;
      }
      preStageRef.current = null;
      handleSegmentFailureRef.current(boundary, 'token-stale');
      if (keepWarmedFace && pendingRetryBoundary(swapStateRef.current) !== boundary) {
        // Words-only fallback: nothing may linger concealed in the slot.
        clearFaceSlot(staged.slot);
        if (warmedFaceRef.current?.boundary === boundary) warmedFaceRef.current = null;
      }
      finalizeTurn();
      swapBusyRef.current = false;
      return;
    }
    // VOICE-FIRST MODE SELECTION (voice-first batch, 2026-11-10 —
    // investigation Q3/Q5-1): the gate no longer ABORTS on a
    // not-ready face. With a fresh token in hand the cut-over ALWAYS
    // proceeds; face readiness only selects the MODE — face-first
    // (the classic crossfade + paired audio from the first chunk) or
    // voice-first (the segment socket connects NOW over the portrait
    // and the face attaches mid-segment via the takeover watcher).
    // The mode also samples the handle's LIVE state directly: a face
    // that came live after its readiness record was orphaned (the
    // retest #4 shape — the start() settle was lost and the live
    // report folded everLive only) is face-first after all. The old
    // 'face-not-ready' gate-abort and its retry-ledger round trip
    // are gone; the failure funnels that remain are stage-missing
    // and token-stale above (a stale token cannot connect at all).
    const incomingHandleEarly = avatarRequestedRef.current
      ? (staged.slot === 'second' ? stagedAvatarRef.current : mainSlotRef.current)
      : null;
    const earlySnap = incomingHandleEarly?.liveness?.();
    const faceReadyNow = staged.faceReady || !!(earlySnap?.live && earlySnap.displayedFrame);
    let mode = cutoverMode({ videoRequested: avatarRequestedRef.current, faceReady: faceReadyNow });
    swapBusyRef.current = true;
    setSwapTransition(true);
    const incoming = staged.persona;
    try {
      // 1) Re-point paired audio at the incoming slot's instance, then
      //    run the crossfade: reveal the incoming face over the frozen
      //    outgoing frame (keeper election unchanged: the OUTGOING
      //    instance keeps its frame painted through the reveal), fade
      //    the frozen frame out in step, and retire it once the fade
      //    lands so its slot frees for the next boundary.
      if (avatarRequestedRef.current) {
        const outgoing = avatarRef.current;
        const outgoingSlot = faceSlotOwnerRef.current;
        const incomingHandle = staged.slot === 'second' ? stagedAvatarRef.current : mainSlotRef.current;
        outgoing?.setFrameKeeper?.(true);
        incomingHandle?.setFrameKeeper?.(false);
        avatarRef.current = incomingHandle;
        faceSlotOwnerRef.current = staged.slot;
        // 1b) AUDIO SYNC (face-first mode only) — the defect that left
        // Sara silent: the incoming instance was pre-staged SILENT
        // (element muted, volume 0) and nothing on the swap path ever
        // unmuted it; PCM reached her Simli client (her lips moved)
        // while her paired stream stayed muted forever. Sync the
        // session's mute state into the incoming instance FIRST,
        // re-apply the selected speaker output (its desired sink
        // starts unset), then activate() — the designed unmute. NOT
        // start(): it early-returns on a live instance and never
        // reaches the unmute block. A SOUND_BLOCKED refusal does not
        // fail the swap — it surfaces the same tap-to-enable-sound
        // affordance the initial-face path uses.
        // In voice-first mode the sync is DEFERRED to the takeover
        // (runFaceTakeover) — it runs there, in this same order,
        // before the first paired chunk is routed.
        let voiceFirstReason = staged.faceFailed ? 'face-failed' : 'face-not-ready';
        if (mode === 'face-first') {
          const sync = cutoverAudioSync({ speakerMuted: speakerMutedRef.current, paused: captureRef.current.paused, replaying: captureRef.current.replaying, selectedDeviceId: selectedOutputIdRef.current });
          // Paired-audio guard (2026-11-10): the sync REPORTS liveness
          // (false = dead client / no audio stream). Handles that
          // predate the signal resolve undefined and keep the legacy
          // proceed behavior, and a SOUND_BLOCKED refusal still does
          // not fail the swap.
          let incomingFaceLive = true;
          if (incomingHandle?.cutoverAudioSync) {
            try { incomingFaceLive = (await incomingHandle.cutoverAudioSync(sync)) !== false; }
            catch (e) { if (e instanceof Error && e.message === SOUND_BLOCKED) setAudioNeedsTap(true); }
          } else if (incomingHandle) {
            incomingHandle.setPlaybackMuted(sync.muted);
            if (sync.deviceId) void incomingHandle.setOutputDevice?.(sync.deviceId);
            try { incomingFaceLive = (await incomingHandle.activate()) !== false; }
            catch (e) { if (e instanceof Error && e.message === SOUND_BLOCKED) setAudioNeedsTap(true); }
          } else {
            incomingFaceLive = false;
          }
          if (!incomingFaceLive) {
            // DEMOTED (voice-first batch, 2026-11-10): a face whose
            // readiness latched but whose sync finds it dead used to
            // ABORT the whole swap here ('cutover-face-dead', back
            // through the retry ledger while the outgoing socket was
            // still open). A dead face is not a dead doorway: the
            // cut-over proceeds VOICE-FIRST instead — the attach is
            // pended below, ONE revival start is kicked on the same
            // instance, and the takeover watcher completes the
            // attach if the face comes back; if it never does, the
            // segment runs voice-over-portrait (publish #16's worst
            // case) instead of the visitor losing Sara entirely.
            mode = 'voice-first';
            voiceFirstReason = 'cutover-face-dead';
          }
        }
        if (mode === 'face-first') {
          if (staged.slot === 'second') setSecondFace(face => (face && face.boundary === boundary ? { ...face, revealed: true } : face));
          else setMainFace(face => (face && face.boundary === boundary ? { ...face, revealed: true } : face));
        } else {
          // VOICE-FIRST CUT-OVER: pend the face attach BEFORE the
          // segment socket connects, so its first chunk already
          // routes local (playPcmChunk) and the portrait (faceLive
          // stays false below) covers the portrait area until the
          // takeover reveals the moving face. The pending record is
          // what the degrade path checks before it may touch the
          // session-wide video fallback. If the instance is neither
          // live nor starting, kick ONE bounded revival start on the
          // SAME instance (never a second Simli session).
          segmentFacePendingRef.current = { boundary, persona: incoming, slot: staged.slot };
          recordSwapDiag({ event: 'voice-first-cutover', boundary, persona: incoming, attempt: segmentAttemptsFor(swapStateRef.current, boundary) + 1, detail: voiceFirstReason });
          persistSwapDiagRef.current({ event: 'voice-first-cutover', boundary, persona: incoming, attempt: segmentAttemptsFor(swapStateRef.current, boundary) + 1, reason: voiceFirstReason, faceState: staged.faceFailed ? 'failed' : 'not-ready' });
          kickFaceRevivalRef.current(staged.slot);
        }
        preStageRef.current = null;
        if (warmedFaceRef.current?.boundary === boundary) warmedFaceRef.current = null;
        setFadingSlot(outgoingSlot);
        outgoing?.freeze?.();
        outgoing?.fadeOut?.();
        const retireTimer = window.setTimeout(() => {
          retireTimersRef.current = retireTimersRef.current.filter(timer => timer !== retireTimer);
          setFadingSlot(slot => (slot === outgoingSlot ? null : slot));
          if (outgoing) { if (outgoing.retire) outgoing.retire(); else outgoing.stop(); }
          // Free the retired slot — unless a newer stage already owns
          // it (its state would be a concealed, unrevealed entry).
          if (outgoingSlot === 'second') setSecondFace(face => (face && !face.revealed ? face : null));
          else setMainFace(face => (face && !face.revealed ? face : null));
        }, SWAP_CROSSFADE_MS + 80);
        retireTimersRef.current.push(retireTimer);
      } else {
        preStageRef.current = null;
        if (warmedFaceRef.current?.boundary === boundary) warmedFaceRef.current = null;
      }
      // 2) Partial teardown: old socket closes now (no end_session), mic
      //    and audio contexts survive; the completed turns flush here.
      partialTeardownForSwap();
      // Handover fix: the cut-over resolves the mic hold — the segment
      // owns the mic path from here (its socket arms the opening gate
      // for its first turn), and the "Connecting…" status clears.
      releaseSwapHold();
      // 3) State + shell identity move to the incoming persona.
      const nextPhase: SwapPhase = PHASE_AFTER_BOUNDARY[boundary];
      swapStateRef.current = {
        ...swapStateRef.current,
        phase: nextPhase,
        persona: incoming,
        segment: swapStateRef.current.segment + 1,
        done: [...swapStateRef.current.done, boundary],
        pendingStepout: false,
        // Structural doorway intent is consumed by the doorway itself;
        // every other cut-over leaves the flag untouched (it is only
        // ever set in phase 'host', which the chain has then left).
        pendingDoorway: boundary === 'doorway' ? false : swapStateRef.current.pendingDoorway,
        // Visitor-armed Alex intent survives every OTHER cut-over (in
        // particular the step-out out of simulation, after which it
        // fires on Aspen's first close line); meet-alex itself consumes
        // it, so it can never re-fire.
        pendingAlex: boundary === 'meet-alex' ? false : swapStateRef.current.pendingAlex,
        // Team intro latch: the show ran to completion — nothing in
        // this session re-arms any intro boundary (design §3.1).
        teamIntroDone: swapStateRef.current.teamIntroDone || boundary === 'intro-return-2',
        // The retry trigger is consumed by this cut-over.
        pendingSegmentRetry: swapStateRef.current.pendingSegmentRetry === boundary ? null : swapStateRef.current.pendingSegmentRetry,
      };
      setActivePersona(incoming);
      onPersonaChangeRef.current?.({ id: incoming, displayName: PERSONAS[incoming].displayName });
      // Voice-first: the PORTRAIT stays the visible face until the
      // takeover reveals the moving one (faceLive drives the shell's
      // portrait/live swap) — only a face-first cut-over marks the
      // face live here.
      setFaceLive(avatarRequestedRef.current && mode === 'face-first');
      // Transcript divider (owner transition spec): the transcript is
      // never cleared at a handoff; a centered divider row marks where
      // the incoming persona took over, under the last flushed line.
      setTurns(prev => { const next = [...prev, { role: "divider" as const, text: "", speaker: incoming }]; if (!isPreviewRef.current) visitMemory.set(agentId || "homepage", next); return next; });
      // 4) Open the incoming segment's socket on the pre-authorized token.
      //    The connect ctx gives a pre-ready death of this socket ONE
      //    retry with a fresh authorization (the drop-recovery class:
      //    the cut-over already happened, so the SAME persona is
      //    re-authorized and reconnected — never a restart). A second
      //    failure ends the call with the error surfaced, as before,
      //    but now the diagnostics say exactly where it died.
      recordSwapDiag({ event: 'cutover', boundary, persona: incoming, attempt: segmentAttemptsFor(swapStateRef.current, boundary) + 1 });
      // Server-visible: a face-first cut-over resolves the attempt on
      // its own row (a voice-first cut-over already persisted its own
      // event above; a later takeover persists separately).
      if (mode === 'face-first') {
        persistSwapDiagRef.current({ event: 'cutover', boundary, persona: incoming, attempt: segmentAttemptsFor(swapStateRef.current, boundary) + 1, faceState: 'ready' });
      }
      const onSegmentConnectFailure = (attempt: number) => (info: { stage: 'timeout' | 'error' | 'close'; code?: number; reason?: string }) => {
        if (!segmentConnectRetryAllowed(attempt)) {
          setError("The voice service did not respond in time. Please try again.");
          stopEverything();
          return;
        }
        recordSwapDiag({ event: 'retry-scheduled', boundary, persona: incoming, attempt: attempt + 1, detail: `connect-${info.stage}` });
        void (async () => {
          const fresh = await requestSegment(incoming, boundary, { swap: true });
          if (!fresh) {
            recordSwapDiag({ event: 'fallback', boundary, persona: incoming, attempt: attempt + 1, detail: 'reauthorize-failed' });
            setError('The connection dropped and could not be restored. Press play to reconnect.');
            stopEverything();
            return;
          }
          generationRef.current += 1;
          liveRef.current = false;
          attemptSessionRef.current = { ...attemptSessionRef.current, [boundary]: { sessionId: fresh.sessionId, attempt: attempt + 1 } };
          connectSegmentSocket(fresh.token, { boundary, persona: incoming, attempt: attempt + 1, onFailure: onSegmentConnectFailure(attempt + 1) });
        })();
      };
      connectSegmentSocket(staged.token, { boundary, persona: incoming, attempt: 1, onFailure: onSegmentConnectFailure(1) });
      if (mode === 'voice-first') {
        // The face may have come live DURING the cut-over — its live
        // report folded before the pending was set, so no new report
        // will fire. Re-sample the handle and run the takeover now
        // if it is already live with a displayed frame.
        const snapAfter = incomingHandleEarly?.liveness?.();
        if (snapAfter?.live && snapAfter.displayedFrame) void runFaceTakeoverRef.current(staged.slot);
      }
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
    if (state.phase === 'host' || state.phase === 'intro' || !parentSessionIdRef.current) {
      // Host-phase drops keep the legacy reconnect path untouched — and
      // a drop on the PARENT Aspen (team intro phase 'intro') is NOT a
      // show restart: the resume context carries the conversation and
      // the greeting variant cannot re-fire mid-visit; the show itself
      // simply does not restart because the intro anchors match only
      // her fresh bridge lines.
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
      // A full teardown during the authorization (the visitor stopped,
      // or an error path ended the call) spends the chain: resurrecting
      // a segment socket now would reopen a call nobody is on.
      if (!swapEnabledRef.current) { setSwapTransition(false); return; }
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

  // READINESS EXECUTOR (F2, generalized by the handover fix): the
  // readiness call sites (any arm's stage landing in armSwap, the
  // pre-stage effect settling, a kept-stage failure) and the watchdog
  // interval below reach executeSwap through this ONE decision —
  // swapWatchdogAction over the live facts. It fires for ANY boundary
  // pendingExecutionBoundary names (a normal arm included, not only a
  // ledger retry), only while live, and never over an in-flight
  // cut-over (executeSwap's queue remembers a busy trigger instead).
  // 'execute' runs the normal gate-wait; 'force' — the arm deadline
  // or the stage watchdog expired — runs an immediate gate and is
  // always traced as a watchdog event first, so an
  // authorized-but-unconsumed stage can never again sit in silence.
  maybeExecutePendingRef.current = (boundary: PersonaBoundary) => {
    if (!liveRef.current || swapBusyRef.current) return;
    const state = swapStateRef.current;
    if (pendingExecutionBoundary(state) !== boundary) return;
    const staged = preStageRef.current?.boundary === boundary ? preStageRef.current : null;
    const now = Date.now();
    const action = swapWatchdogAction({
      boundary,
      now,
      armedAt: swapArmAtRef.current[boundary] ?? 0,
      stagePresent: !!staged,
      stageAuthorizedAt: staged?.authorizedAt ?? 0,
      faceFailed: staged?.faceFailed === true,
      gateReady: !!staged && cutoverReady({ authorized: true, videoRequested: avatarRequestedRef.current, faceReady: staged.faceReady }) && !segmentTokenStale(staged.authorizedAt, now),
      turnInFlight: idleRef.current.generating,
    });
    if (action === 'none') return;
    if (action === 'force') {
      recordSwapDiag({ event: 'stage-watchdog', boundary, persona: BOUNDARY_TARGET[boundary], attempt: segmentAttemptsFor(state, boundary) + 1, detail: staged ? `stageAgeMs=${now - staged.authorizedAt}` : 'no-stage' });
      recordSwapDiag({ event: 'forced-execute', boundary, persona: BOUNDARY_TARGET[boundary], attempt: segmentAttemptsFor(state, boundary) + 1 });
      // Server-visible (voice-first batch): watchdog actions are
      // attempt resolutions too — they land in the same
      // config.personaSwapDiag, queryable after the fact.
      persistSwapDiagRef.current({ event: 'stage-watchdog', boundary, persona: BOUNDARY_TARGET[boundary], attempt: segmentAttemptsFor(state, boundary) + 1, reason: staged ? `stageAgeMs=${now - staged.authorizedAt}` : 'no-stage' });
      persistSwapDiagRef.current({ event: 'forced-execute', boundary, persona: BOUNDARY_TARGET[boundary], attempt: segmentAttemptsFor(state, boundary) + 1 });
    } else {
      recordSwapDiag({ event: pendingRetryBoundary(state) === boundary ? 'retry-execute-ready' : 'execute-ready', boundary, persona: BOUNDARY_TARGET[boundary], attempt: segmentAttemptsFor(state, boundary) });
    }
    void executeSwapRef.current(boundary, action === 'force' ? { immediate: true } : undefined);
  };

  // STAGE WATCHDOG (handover fix item 4): twice a second, drain the
  // single-flight execution queue (a trigger remembered while a
  // cut-over was busy runs the moment it clears) and ask the readiness
  // decision about the pending boundary. This interval is what makes
  // the hard arm deadline real: even if every event-driven trigger
  // was missed, an armed boundary is forced to a decision — cut over,
  // ledger retry, or the VISIBLE fallback — within the deadline.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!liveRef.current || !swapEnabledRef.current) return;
      if (!swapBusyRef.current && swapExecQueueRef.current.length) {
        const { next, rest } = dequeueSwapExecution(swapExecQueueRef.current);
        swapExecQueueRef.current = rest;
        if (next && swapStateRef.current.armed.includes(next) && !swapStateRef.current.done.includes(next)) {
          void executeSwapRef.current(next);
          return;
        }
      }
      const boundary = pendingExecutionBoundary(swapStateRef.current);
      if (boundary) maybeExecutePendingRef.current(boundary);
    }, 500);
    return () => window.clearInterval(timer);
  }, []);

  // Keep the manual active-face pointer aimed at the owning slot's
  // handle. Slot elements change identity across swaps (a slot's render
  // switches between the standard face and persona instances), so the
  // pointer is re-synced after every commit instead of being a JSX ref.
  useEffect(() => {
    const handle = faceSlotOwnerRef.current === 'main' ? mainSlotRef.current : stagedAvatarRef.current;
    if (handle) avatarRef.current = handle;
  });

  // The concealed pre-stage, whichever slot hosts it (an unrevealed
  // slot state IS the stage; the derivation is render-pure).
  const stagedFace = secondFace && !secondFace.revealed
    ? { persona: secondFace.persona, boundary: secondFace.boundary, slot: 'second' as FaceSlot }
    : mainFace && !mainFace.revealed
      ? { persona: mainFace.persona, boundary: mainFace.boundary, slot: 'main' as FaceSlot }
      : null;

  // Persona pre-stage effect: when armSwap (or the delayed F3
  // pre-stage) mounts the concealed instance in the free slot, WATCH
  // it (silent — its audio element stays muted; it has nothing to
  // play until cut-over) and record frame readiness on the staged
  // entry. Fluidity batch (2026-11-10): a settled failure also
  // records faceFailed, the F3 warmed-face record is written on every
  // settle (the face may settle before any stage exists), and a
  // settle is the readiness trigger for a pending execution.
  // Handover fix (2026-11-10): settles fold through the face-liveness
  // machine (a successful settle CLEARS an earlier transient failure
  // latch — verdicts are recoverable).
  // VOICE-FIRST BATCH (2026-11-10 — investigation Q5-2/4): the single
  // raced start() promise is GONE. The old shape raced ONE start()
  // against a 10 s bound; when the race lost, nobody awaited the real
  // start anymore, its eventual success folded everLive only, and
  // readiness stayed false forever — and because the effect keyed on
  // [boundary, slot, persona] alone, a retry staging an identical
  // slot state never re-ran it, so start() was never called again
  // (the attempt-2 swallow). The effect now POLLS the handle's
  // liveness() snapshot (prestageWatchDecision) until the ALIGNED
  // bound (PRESTAGE_START_TIMEOUT_MS = 45 s, matching a single-
  // attempt start's real budget — start() is kicked with
  // maxAttempts: 1): live+frame folds ready, a reported failure
  // folds failed, no-start-in-flight (re)kicks start, and an
  // in-flight start is simply observed — so a re-run of this effect
  // (the deps now include stageGeneration, bumped whenever a stage
  // is (re)built for this face) picks up the SAME start instead of
  // double-calling or folding a phantom failure. A face belonging to
  // an already-completed boundary is the live segment's own face —
  // the takeover watcher owns it, so the watch stands down.
  useEffect(() => {
    if (!stagedFace) return;
    if (swapStateRef.current.done.includes(stagedFace.boundary)) return;
    let cancelled = false;
    void (async () => {
      // The instance mounts on this render; wait one frame for its ref.
      await new Promise<void>(r => requestAnimationFrame(() => r()));
      if (cancelled) return;
      const handle = stagedFace.slot === 'second' ? stagedAvatarRef.current : mainSlotRef.current;
      if (!handle) return;
      const deadline = Date.now() + PRESTAGE_START_TIMEOUT_MS;
      let ok = false;
      for (;;) {
        if (cancelled) return;
        const decision = prestageWatchDecision(handle.liveness?.() ?? null);
        if (decision === 'ready') { ok = true; break; }
        if (decision === 'failed') { ok = false; break; }
        if (decision === 'kick-start') {
          // Await the kicked start's SETTLE (bounded by the remaining
          // watch budget) — but the settle is not the verdict: the
          // next poll re-reads liveness(), so a start that outlives
          // its race is observed to completion by later polls instead
          // of being orphaned (the pre-voice-first defect), and a
          // verdict-less settle simply re-polls rather than spinning
          // fresh kicks.
          await boundedSettle(
            handle.start({ silent: true, maxAttempts: 1 }).catch(() => false),
            Math.max(0, deadline - Date.now()),
            false,
          );
          continue;
        }
        if (Date.now() >= deadline) { ok = false; break; }
        await new Promise<void>(r => window.setTimeout(r, 250));
      }
      if (cancelled) return;
      const stageNow = preStageRef.current?.boundary === stagedFace.boundary ? preStageRef.current : null;
      const warmedNow = warmedFaceRef.current?.boundary === stagedFace.boundary && warmedFaceRef.current.slot === stagedFace.slot ? warmedFaceRef.current : null;
      const currentReady = (stageNow?.faceReady ?? warmedNow?.ready) === true;
      const settled = faceLivenessOnStartSettled({
        ready: stageNow?.faceReady ?? warmedNow?.ready ?? false,
        failed: (stageNow?.faceFailed ?? warmedNow?.failed) === true,
        everLive: (stageNow?.faceEverLive ?? warmedNow?.everLive) === true,
        startFailed: (stageNow?.faceStartFailed ?? warmedNow?.startFailed) === true,
        // A settle must never clobber a readiness the live-fold
        // already proved (frame-proof live report): ok is OR-ed with
        // the currently recorded readiness.
      }, ok || currentReady);
      if (stageNow) {
        preStageRef.current = { ...stageNow, faceReady: settled.ready, faceFailed: settled.failed ? true : undefined, faceEverLive: settled.everLive, faceStartFailed: settled.startFailed };
      }
      if (warmedNow) {
        warmedFaceRef.current = { ...warmedNow, ready: settled.ready, failed: settled.failed, everLive: settled.everLive, startFailed: settled.startFailed };
      }
      // READINESS: a pending execution staged on this face decides the
      // moment the face settles — ready executes face-first, failed
      // fails fast into a voice-first decision — no turn_complete
      // involved either way.
      maybeExecutePendingRef.current(stagedFace.boundary);
    })();
    return () => { cancelled = true; };
  }, [stagedFace?.boundary, stagedFace?.slot, stagedFace?.persona, stageGeneration]); // eslint-disable-line react-hooks/exhaustive-deps

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
    setPhase("connecting"); setStatus("Connecting…"); setError(null); setAudioNeedsTap(false); setLimitReached(false); setEndedByVisitor(false); setSwapNotice('');
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
  // Compact panel (2026-11-11 rearrangement): the same handoff, same live +
  // token gate, rendered as the compact Manager pill inside the control row
  // instead of a standalone full-width row above it.
  const transferPill = phase === 'live' && handoffToken ? <BrowserVoiceHandoff pill token={handoffToken} onActive={onHandoffActive} microphone={microphone}/> : null;

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
  // MAIN face slot. Normally the standard face; while a persona stage
  // or segment owns the slot (mainFace), the SAME element position
  // renders that persona instance instead — one mounted instance per
  // slot at all times, so a crossfade never mounts/unmounts mid-fade.
  // onLiveChange is owner-gated: once the second slot owns the face,
  // this slot's events (a staged start, the retirement stop) must not
  // drive the shell's faceLive state.
  // Paired-audio guard (2026-11-10): BOTH slots now report through this
  // one slot-aware handler — the second slot previously had NO
  // onLiveChange at all, so a staged Sara face that died after latching
  // "ready" was invisible until the first PCM chunk killed the call.
  //  - The OWNING slot (the active persona's face) mirrors the legacy
  //    main-slot behavior exactly: faceLive follows the report, and a
  //    not-live report clears avatarLiveRef.
  //  - A CONCEALED (staged, unrevealed) face in the non-owning slot
  //    reports into the FACE-LIVENESS MACHINE (handover fix): a LIVE
  //    report records that the face has lived — and, since the
  //    voice-first batch, folds READY when the handle's liveness
  //    query proves a displayed frame (readiness recoverable from
  //    liveness, not only from a start() settle that can be
  //    orphaned); a NOT-LIVE report invalidates the readiness latches
  //    ONLY when the machine calls it a death — the face was live
  //    before, or its start already settled failed. Publish #16's
  //    original wiring latched faceFailed on EVERY not-live report,
  //    including Simli's startup stop/error transients during initial
  //    warm-up — a face that had never been live was judged dead, the
  //    gate aborted on its first poll, and retest #3's doorway died
  //    before Sara ever connected. A warm-up transient now changes
  //    nothing.
  //  - A REVEALED non-owning face is a retiring/fading slot whose
  //    events must not clobber the new owner's state: ignored.
  const handleFaceLiveChange = (slot: FaceSlot, live: boolean, face: { boundary: PersonaBoundary; revealed: boolean; persona: PersonaId } | null) => {
    // VOICE-FIRST TAKEOVER TRIGGER (voice-first batch, 2026-11-10): a
    // live report for the face a voice-first segment is waiting on —
    // owning slot (after the cut-over re-pointed ownership) or staged
    // slot — runs the takeover: deferred audio sync, reveal, routing
    // flip. The takeover validates the pending record itself, so a
    // report for any other face is a no-op here.
    if (live && face && !face.revealed && segmentFacePendingRef.current?.slot === slot && segmentFacePendingRef.current.persona === face.persona) {
      void runFaceTakeoverRef.current(slot);
    }
    if (faceSlotOwnerRef.current === slot) {
      setFaceLive(live);
      if (!live) avatarLiveRef.current = false;
      return;
    }
    if (!face || face.revealed) return;
    const stage = preStageRef.current?.slot === slot && preStageRef.current.boundary === face.boundary ? preStageRef.current : null;
    const warmed = warmedFaceRef.current?.slot === slot && warmedFaceRef.current.boundary === face.boundary ? warmedFaceRef.current : null;
    if (!stage && !warmed) return;
    const current: StagedFaceLiveness = {
      ready: stage?.faceReady ?? warmed?.ready ?? false,
      failed: (stage?.faceFailed ?? warmed?.failed) === true,
      everLive: (stage?.faceEverLive ?? warmed?.everLive) === true,
      startFailed: (stage?.faceStartFailed ?? warmed?.startFailed) === true,
    };
    // VOICE-FIRST READINESS REPAIR: a live report WITH a displayed
    // frame on the instance (the handle's liveness query) folds
    // ready:true — readiness is never again less recoverable than
    // liveness (the disjoint-channel defect behind retest #4). A
    // live report without frame proof keeps the legacy everLive-only
    // fold.
    const snap = live ? (slot === 'second' ? stagedAvatarRef.current : mainSlotRef.current)?.liveness?.() : undefined;
    const next = live ? faceLivenessOnLive(current, !!(snap?.live && snap.displayedFrame)) : faceLivenessOnNotLive(current);
    if (next === current) return;
    if (stage) preStageRef.current = { ...stage, faceReady: next.ready, faceFailed: next.failed ? true : undefined, faceEverLive: next.everLive, faceStartFailed: next.startFailed };
    if (warmed) warmedFaceRef.current = { ...warmed, ready: next.ready, failed: next.failed, everLive: next.everLive, startFailed: next.startFailed };
  };
  const mainFaceLayer = mainFace ? (mainFace.revealed ? (fadingSlot === 'main' ? 1 : 2) : 0) : undefined;
  const avatarView = videoAvatar?.enabled && !previewOnly ? (mainFace
    ? <SimliAvatar ref={mainSlotRef} inline={avatarInline || faceFirst} unboxed={faceFirst} avatar={{ ...videoAvatar, faceId: mainFace.persona === 'sara' ? SARA_FACE_ID : mainFace.persona === 'alex' ? ALEX_FACE_ID : videoAvatar.faceId }} persona={mainFace.persona} personaParentSessionId={parentSessionIdRef.current || undefined} personaVisitorKey={visitorKeyRef.current || undefined} concealed={!mainFace.revealed} layer={mainFaceLayer} onLiveChange={live => handleFaceLiveChange('main', live, mainFace)} />
    : <SimliAvatar ref={mainSlotRef} inline={avatarInline || faceFirst} unboxed={faceFirst} avatar={activeVideoAvatar ?? videoAvatar} agentId={agentId} shareToken={shareToken} draft={draft} guide={guide} onLiveChange={live => handleFaceLiveChange('main', live, null)} />) : null;
  // SECOND face slot: the incoming persona's instance — mounted
  // concealed while a boundary is armed (live but hidden and muted),
  // revealed by the cut-over's crossfade, and kept mounted as the
  // active face until it retires at a later boundary. Its wrapper no
  // longer hides it: SimliAvatar's own opacity (concealed / fade-out)
  // drives the dissolve, layered above the retiring main slot.
  const stagedAvatarView = secondFace && videoAvatar?.enabled && !previewOnly ? (
    <div key={`staged-${secondFace.boundary}`} className={faceFirst ? "aspen-person-livebox relative z-0 mx-auto overflow-hidden" : undefined} style={faceFirst ? { position: 'absolute', inset: 0, pointerEvents: 'none' } : undefined}>
      <SimliAvatar ref={stagedAvatarRef} inline={avatarInline || faceFirst} unboxed={faceFirst} avatar={{ ...videoAvatar, faceId: secondFace.persona === 'sara' ? SARA_FACE_ID : secondFace.persona === 'alex' ? ALEX_FACE_ID : videoAvatar.faceId }} persona={secondFace.persona} personaParentSessionId={parentSessionIdRef.current || undefined} personaVisitorKey={visitorKeyRef.current || undefined} concealed={!secondFace.revealed} layer={secondFace.revealed ? (fadingSlot === 'second' ? 1 : 2) : 0} onLiveChange={live => handleFaceLiveChange('second', live, secondFace)} />
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
      <div className={faceFirst ? "flex h-full min-h-0 flex-1 flex-col px-2 pb-2 pt-0 text-foreground" : "space-y-2 p-2 text-foreground"}>
        {faceFirst ? <div className="aspen-person-livebox relative z-0 mx-auto shrink-0 overflow-hidden"><div className={`h-full w-full ${faceLive ? 'invisible' : ''}`}><PersonPortrait name={name} avatarUrl={avatarUrl} animated={false} /></div>{avatarView}{stagedAvatarView}</div> : <>{avatarView}{stagedAvatarView}</>}
        {belowAvatar && <div className="shrink-0 py-1">{belowAvatar}</div>}
        <div className={faceFirst ? 'aspen-voice-panel relative z-10 flex min-h-0 flex-1 flex-col space-y-2 rounded-lg border border-primary/40 bg-card p-2 shadow-lg ring-1 ring-foreground/10' : 'space-y-2'}>
        <div className="flex items-center gap-1.5">
          {shownPhase === "connecting" && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />}
          {shownPhase === "live" && !aspenSpeaking && <Mic className="h-3.5 w-3.5 shrink-0 animate-pulse text-primary" />}
          {shownPhase === "live" && aspenSpeaking && <Volume2 className="h-3.5 w-3.5 shrink-0 animate-pulse text-primary" />}
          {shownPhase === "idle" && <Play className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          <p className="min-w-0 flex-1 break-words text-xs leading-snug text-foreground" role="status">
            {shownPhase === "live" && (
              <span className="font-semibold text-foreground">
                {swapConnecting ? `Connecting ${PERSONAS[swapConnecting].displayName}…` : handoffActive ? t("voice.managerHandoff") : paused ? t("voice.paused") : replaying ? t("voice.replayingSavedAudio") : muted ? t("voice.micMuted") : aspenSpeaking ? t("voice.speaking", { name: PERSONAS[activePersona].displayName }) : captureMode === "hold" && !held ? t("voice.holdToTalk") : t("voice.listening")}
              </span>
            )}
            {shownPhase !== "live" && (shownPhase === "idle" ? t("voice.readyToTalk") : faceWaiting ? t("voice.connecting") : status)}
          </p>
          {remainingSeconds !== null && <span data-testid="demo-timer-pill" title={`${t("voice.demoTimeRemaining")}: ${Math.floor(remainingSeconds/60)}:${String(remainingSeconds%60).padStart(2,'0')}`} aria-label={`${t("voice.demoTimeRemaining")}: ${Math.floor(remainingSeconds/60)}:${String(remainingSeconds%60).padStart(2,'0')}`} className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-background/95 px-2 py-0.5 text-[11px] leading-tight text-muted-foreground"><Timer className="h-3 w-3" />{Math.floor(remainingSeconds/60)}:{String(remainingSeconds%60).padStart(2,'0')}</span>}
          {faceFirst && <Button size="icon" variant="outline" className="ml-auto h-10 w-10 shrink-0 border-primary/60 bg-transparent text-primary hover:bg-primary/10 hover:text-primary" aria-label={captions ? t('voice.hideCaptions') : t('voice.showCaptions')} title={captions ? t('voice.hideCaptions') : t('voice.showCaptions')} aria-expanded={captions} onClick={() => setCaptions(v => !v)}><ChevronsUpDown className="h-4 w-4" /></Button>}
        </div>
        {phase === 'idle' && endedByVisitor && <p className="text-xs text-muted-foreground">{t("voice.pressPlayReconnect", { name })}</p>}

        <div className={faceFirst ? (captions ? 'aspen-caption-space aspen-caption-region' : 'hidden') : ''}>
        {showPlaybackCaption && playbackCaption && <div className="flex min-h-0 flex-1 flex-col rounded-md border border-border bg-background/95 p-1.5"><PlaybackCaption caption={playbackCaption} /></div>}
        <div aria-label={t("voice.transcriptLabel")} tabIndex={0} className={`${showPlaybackCaption || (faceFirst && !captions) ? 'hidden' : ''} ${faceFirst ? 'min-h-0 flex-1' : 'max-h-[4.5rem]'} space-y-1 overflow-y-auto overscroll-contain rounded-md border border-border bg-background/95 p-1.5`}>
          {turns.length === 0 && (!partialAspen || faceFirst) && !partialUser && (
            <p className="py-1 text-center text-[11px] text-muted-foreground">{t("voice.noConversation")}</p>
          )}
          {turns.map((turn, i) => turn.role === "divider" ? (
            <div key={i} role="separator" className="py-0.5 text-center text-[10px] font-medium text-muted-foreground">{t("voice.handoffTo", { name: PERSONAS[turn.speaker ?? "aspen"].displayName })}</div>
          ) : (
            <Message key={i} from={turn.role} className="max-w-full">
              <MessageContent aria-label={transcriptAriaLabel(turn.role)} className={turn.role === "user" ? "bg-primary text-primary-foreground text-xs px-2 py-1" : faceFirst ? "text-sm font-bold leading-6 text-foreground" : "text-xs text-foreground"}>
                {turn.speaker && <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide opacity-70">{PERSONAS[turn.speaker].displayName}</span>}
                <MessageResponse>{turn.role === "user" ? turn.text : displayNumbers(turn.text)}</MessageResponse>
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
        {swapNotice && <p role="status" className="text-xs text-primary">{swapNotice}</p>}
        {videoFallback && <p role="status" className="text-[11px] text-muted-foreground">{t("voice.videoFallback")}</p>}
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
            <div className="relative">
              <Button
                size="icon"
                variant={speakerMuted ? "secondary" : "outline"}
                aria-haspopup="menu"
                aria-expanded={speakerMenuOpen}
                title={t("voice.speakerOutputChoose")}
                aria-label={t("voice.speakerOutput")}
                onClick={() => { const opening = !speakerMenuOpen; setSpeakerMenuOpen(opening); if (opening) void refreshSpeakerOutputs(); }}
              >
                {speakerMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                <span>{t("voice.sound")}</span>
              </Button>
              {speakerMenuOpen && (
                <div role="menu" aria-label={t("voice.speakerOutput")} className="absolute bottom-full left-1/2 z-50 mb-1 w-56 max-w-[80vw] -translate-x-1/2 rounded-md border border-border bg-card p-1 text-left shadow-lg">
                  {buildSpeakerMenuOptions({ devices: speakerOutputs, canSelect: speakerCanSelect, selectedDeviceId: selectedOutputId, muted: speakerMuted }).map((option: SpeakerMenuOption) => {
                    if (option.kind === "mute") {
                      return (
                        <div key={option.id}>
                          <div className="my-1 border-t border-border" aria-hidden />
                          <button type="button" role="menuitemradio" aria-checked={option.selected} aria-label={t("voice.speakerMute")} className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-xs font-medium hover:bg-muted" onClick={chooseSpeakerMute}>
                            <span className="flex h-4 w-4 shrink-0 items-center justify-center">{option.selected && <Check className="h-3.5 w-3.5" />}</span>
                            <VolumeX className="h-4 w-4 shrink-0" />
                            <span>{t("voice.speakerMute")}</span>
                          </button>
                        </div>
                      );
                    }
                    const label = option.synthetic === "loudspeaker" ? t("voice.speakerLoudspeaker")
                      : option.synthetic === "earpiece" ? t("voice.speakerEarpiece")
                      : option.synthetic === "platform" ? t("voice.speakerPhoneDefault")
                      : option.synthetic === "bluetoothFallback" ? t("voice.speakerBluetooth")
                      : option.rawLabel ?? t("voice.speakerOutput");
                    const Icon = option.kind === "speaker" ? Speaker : option.kind === "earpiece" || option.kind === "platform" ? Smartphone : option.kind === "bluetooth" || option.kind === "headset" ? Bluetooth : Volume2;
                    const device = option.deviceId ? speakerOutputs.find(d => d.deviceId === option.deviceId) : undefined;
                    return (
                      <button key={option.id} type="button" role="menuitemradio" aria-checked={option.selected} aria-label={label} className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-xs font-medium hover:bg-muted" onClick={() => { if (device) void chooseSpeakerDevice(device); else choosePlatformOutput(); }}>
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center">{option.selected && <Check className="h-3.5 w-3.5" />}</span>
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{label}</span>
                      </button>
                    );
                  })}
                  {!speakerCanSelect && <p className="px-2 pb-1 pt-1.5 text-[10px] leading-snug text-muted-foreground">{t("voice.speakerNoSelectNote")}</p>}
                  {speakerOutputNotice && <p role="status" className="px-2 pb-1 pt-1.5 text-[10px] leading-snug text-muted-foreground">{speakerOutputNotice}</p>}
                </div>
              )}
            </div>
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
          {transferPill}
        </div>

        {phase === "live" && speakerOutputNotice && (
          <p role="status" className="text-[11px] text-muted-foreground">{speakerOutputNotice}</p>
        )}
        {phase === "live" && (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>{t("voice.mic")}</span>
            <meter min="0" max="100" value={micLevel} aria-label={t("voice.micLevel")} className="h-2 w-16" />
            <span>{micLevel > 3 ? t("voice.sound") : t("voice.quiet")}</span>
          </div>
        )}
        {showMicHint && phase === "live" && (
          <div role="status" className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/60 p-2 text-[11px] text-foreground">
            <span>I can’t hear you — your microphone may be muted or set to the wrong one.</span>
            <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setShowSettings(true)}>Check microphone</Button>
          </div>
        )}
        {phase === "live" && captureMode === "hold" && (
          <p role="status" className="w-fit rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-foreground">Hold to talk is ON — hold the button while you speak</p>
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
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span>Mic level</span>
              <meter min="0" max="100" value={micLevel} aria-label="Microphone level" className="h-2 w-24" />
              <span>{micLevel > 3 ? "Sound — your voice is registering" : "Quiet — speak and watch this move"}</span>
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
        {swapNotice && <p role="status" className="text-xs text-primary">{swapNotice}</p>}
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
                  {swapConnecting ? `Connecting ${PERSONAS[swapConnecting].displayName}…` : paused ? t("voice.pausedResume") : replaying ? t("voice.replayingMicPaused") : muted ? t("voice.micMuted") : aspenSpeaking ? t("voice.isSpeaking", { name: PERSONAS[activePersona].displayName }) : captureMode === "hold" && !held ? t("voice.micPaused") : t("voice.listening")}
                  {" — "}
                </span>
              )}
              {status}
            </p>
          </div>
          {showMicHint && phase === "live" && (
            <div role="status" className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/60 p-2 text-xs text-foreground">
              <span>I can’t hear you — your microphone may be muted or set to the wrong one. Check the Microphone setting, and watch the level meter just below while you speak — it should move with your voice.</span>
            </div>
          )}
          {phase === "live" && <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{t("voice.microphone")}</span><meter min="0" max="100" value={micLevel} aria-label={t("voice.micLevel")} className="h-3 w-24" />
            <span>{micLevel > 3 ? t("voice.soundDetected") : t("voice.quiet")}</span>
          </div>}
          {phase === "live" && captureMode === "hold" && (
            <p role="status" className="w-fit rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-foreground">Hold to talk is ON — hold the button while you speak</p>
          )}
          {audioNeedsTap && <p role="status" className="text-xs text-muted-foreground">{t("voice.audioTapNeeded")}</p>}
          {error && (micFailureKind === "mic-denied-embedded" ? <EmbeddedMicrophoneNotice /> : <p className="text-xs text-destructive font-semibold">{error}</p>)}
          {signInAction}
        </Card>

        <Card className="p-3 min-h-[100px] max-h-[25vh] overflow-y-auto space-y-3">
          {turns.length === 0 && !partialAspen && !partialUser && (
            <p className="text-sm text-muted-foreground text-center pt-16">{t("voice.noConversation")}</p>
          )}
          {turns.map((turn, i) => turn.role === "divider" ? (
            <div key={i} role="separator" className="py-0.5 text-center text-[10px] font-medium text-muted-foreground">{t("voice.handoffTo", { name: PERSONAS[turn.speaker ?? "aspen"].displayName })}</div>
          ) : (
            <Message key={i} from={turn.role}>
              <MessageContent aria-label={transcriptAriaLabel(turn.role)} className={turn.role === "user" ? "bg-primary text-primary-foreground" : "text-foreground"}>
                {turn.speaker && <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide opacity-70">{PERSONAS[turn.speaker].displayName}</span>}
                <MessageResponse>{turn.role === "user" ? turn.text : displayNumbers(turn.text)}</MessageResponse>
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
