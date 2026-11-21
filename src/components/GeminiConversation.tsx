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
import { Mic, MicOff, Volume2, VolumeX, FlaskConical, PhoneOff, Loader2, Play, Pause, Save, RotateCcw, RefreshCw, Settings2, Check, Speaker, Smartphone, Bluetooth, Timer, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
// This component renders in standalone harnesses (Voice Lab, embeds, tests)
// that never run main.tsx — importing the i18n module here guarantees the
// locale resources exist wherever the panel mounts (same singleton in the app).
import "@/i18n";
import { explicitUiLocale, prewarmLocaleMismatch, type UiLocale } from "@/lib/uiLocale";
import { warmSessionUnusable } from "@/lib/warmSession";
import { faceGateAction, lateFaceAction, FACE_REFUSAL_WINDOW_MS, type FaceStartOutcome, type FaceStartSettlement } from "@/lib/faceStartGate";
import { clearDemoResume } from "@/lib/demoVerification";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { microphonePcm, pcmToBase64, shouldSendMicrophone, microphoneAutoGain, initialCaptureMode, createAmbientGateState, pushAmbientRms, createSpeechGateState, pushSpeechGateFrame, autoNoiseFilter, appliedAmbientLevel, appliedNoiseFilter, deadAirRelaxedFilter, type AmbientGateState, type NoiseFilter, type CaptureMode } from "@/lib/voiceLabAudio";

import VoiceActionConfirmation, { type VoiceAction } from "./VoiceActionConfirmation";
import DemoStartConfirmation from "./DemoStartConfirmation";
import BrowserVoiceHandoff from "@/components/BrowserVoiceHandoff";
import { voiceIdleAction, homepageWalkthroughDue, type VoiceIdleStage } from '@/lib/voiceIdle';
import { voiceDisconnectMessage } from '@/lib/voiceDisconnect';
import { voiceProxyWsUrl } from '@/lib/voiceProxy';
import { classifyMicrophoneFailure, isEmbeddedContext } from "@/lib/embeddedContext";
import {campaignVisit, trackCampaignEvent} from '@/lib/campaignTracking';
import { salesPlans, type SalesPlan } from '@/lib/salesActions';
import SimliAvatar, { SOUND_BLOCKED, isVideoStartFailure, type SimliAvatarHandle } from '@/components/SimliAvatar';
import { BOUNDARY_TARGET, boundaryTargetFor, boundedSettle, boundaryForAssistantLine, buildSwapRecap, chainIsMidSegment, chainStashTarget, cutoverAudioSync, cutoverMode, cutoverReady, dequeueSwapExecution, dropApologyVariant, enqueueSwapExecution, faceLivenessOnLive, faceLivenessOnNotLive, faceLivenessOnStartSettled, gateWaitContinues, INITIAL_SWAP_STATE, introYieldOnVisitorLine, lineAnnouncesDoorway, micAudioPasses, noteAlexIntent, noteAspenIntent, noteDoorwayEngagement, noteSegmentFailure, otherFaceSlot, pendingExecutionBoundary, pendingRetryBoundary, PHASE_AFTER_BOUNDARY, PHASE_ENTRY, PRESTAGE_START_TIMEOUT_MS, prestageWatchDecision, reconnectTarget, recordSwapDiag, retryArmStamp, segmentAttemptsFor, segmentConnectRetryAllowed, segmentTokenStale, SEGMENT_TOKEN_TTL_MS, swapBridgeDue, swapDiagPersistPayload, swapFallbackLine, swapWatchdogAction, SWAP_CROSSFADE_MS, SWAP_GATE_POLL_MS, SWAP_GATE_WAIT_MS, swapRecapFacts, SWAP_DIAG_PERSIST_EVENTS, visitorSignalsStepOut, type ChainStash, type FaceSlot, type PersonaBoundary, type PersonaId, type StagedFaceLiveness, type SwapDiagEntry, type SwapPhase, type SwapState } from '@/lib/personaSwap';
import { PERSONAS, SARA_FACE_ID } from '../../supabase/functions/_shared/personas';
import { presenterForExampleLeadId } from '@/data/realtorExamplePinnedLeads';
import { ALEX_FACE_ID } from '../../supabase/functions/_shared/alex-guide';
import type { VideoAvatar } from '../../supabase/functions/_shared/video-avatar';
import { PersonPortrait, PersonaNameLabel } from '@/components/FloatingPersonFrame';
import { assistantOutput, pairedAudioShouldDegrade, pairedCaptionDelaySec, takeoverShouldResync, voiceChunkStartAt, PAIRED_CAPTION_DELAY_SEC } from '@/lib/avatarAudioTransition';
import { resolvePairedAudibleMode, resolveHeardEngine, PAIRED_AUDIBLE_STORAGE_KEY, HEARD_ENGINE_STORAGE_KEY, type PairedAudibleMode, type HeardEngine } from '@/lib/pairedAudible';
import { playoutDiagPayload, playoutDiagSignature, type PlayoutDiagSnapshot, type PlayoutTerminalDiag } from '@/lib/playoutDiag';
import { createRateWitness, noteRateUtterance, resetRateWitness, type RateWitnessState } from '@/lib/rateWitness';
import { MediaElementPlayout, MEDIA_ELEMENT_PIPELINE_SEC, PLAYOUT_CUSHION_SEC, type HeardElementEngine } from '@/lib/mediaElementPlayout';
import { BlobElementPlayout } from '@/lib/blobElementPlayout';
import { combineEngineCounters, engineRearmDecision } from '@/lib/playoutRearm';
import { PlaybackCaptions, type PlaybackCaption as Caption } from '@/lib/playbackCaptions';
import { displayNumbers } from '@/lib/displayNumbers';
import PlaybackCaption from '@/components/PlaybackCaption';
import { voiceSessionHeaders } from '@/lib/voiceSessionAuth';
import { clearAllVisitMemory, visitMemoryAppend, visitMemoryDelete, visitMemoryGet, visitMemorySet, type VisitTurn } from '@/lib/visitMemory';
import { shouldShowMicHint } from '@/lib/micAudibility';
import { createMicFlowState, MIC_MUTED_START_GRACE_MS, MIC_SILENT_MIN_LOUD_FRAMES, micDiagPayload, micDiagSignature, micDiagStamp, micInputSeconds, micTrackStartVerdict, noteMicFrame, noteMicSessionLive, noteMicWatchdogFired, shouldShowMicWatchdog, shouldShowSilentMicNotice, type MicDiagEvent, type MicTrackState } from '@/lib/micWatchdog';
import { createPlayoutStartupWatch, heardEngineWhy, STARTUP_BLOCKED_AFTER_MS, STARTUP_CHECK_AFTER_MS, startupDiagPayload, startupDiagSignature, type PlayoutProbe, type StartupDiagEvent, type StartupVerdict } from '@/lib/playoutStartup';
import { clearRetainedHandoffMic, fitHandoffRecap, handoffDiagPayload, handoffDiagSignature, handoffVisitFact, isHandoffAnnouncement, micRequestPromise, micStreamIsLive, retainHandoffMic, reusableMicStream, stripHandoffAnnouncement, takeRetainedHandoffMic, type HandoffDiagEvent, type HandoffDiagMic, type HandoffDiagOutcome } from '@/lib/handoffRecovery';
import { consumeEndConversationSignal, endSignalVisibleChunk, END_SIGNAL_DRAIN_POLL_MS, END_SIGNAL_MAX_WAIT_MS } from '@/lib/endConversation';
import { windowRecapLines } from '../../supabase/functions/_shared/recap-builder';
import { createMediaSink, mediaPlaybackNode, type MediaSink } from '@/lib/mediaSink';
import { clampPlaybackVolume, effectivePlaybackLevel, loadPlaybackVolume, savePlaybackVolume } from '@/lib/playbackVolume';
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

/** The visit-memory store lives in @/lib/visitMemory (2026-11-16):
 * the typed chat reads and appends the SAME store, so switching
 * Voice ⇄ Type continues ONE conversation thread instead of forking
 * a second one. Re-exported here for the existing importers. */
type Turn = VisitTurn;
export { visitMemoryAppend, visitMemoryGet, visitMemoryDelete };
/** Persona-chain stash across a manual stop / Stage-3 suspend, kept for
 * the length of the page visit (same lifetime as visitMemory). A full
 * teardown used to DELETE the swap chain, so a restart mid-Sara was
 * authorised as a brand-new Aspen parent and re-ran her host script.
 * With a stash, teardown saves the chain and the next start re-authorises
 * the ACTIVE segment (personaResume opening — welcome-back, no apology);
 * only a fresh parent authorization (a genuinely new demo) clears it. */
const visitChainStash = new Map<string, ChainStash>();
/** START OVER AS A NEW VISITOR (Ron, 2026-11-16): the panel's small
 * restart control. A returning browser is recognised — visitMemory
 * (and its sessionStorage mirror) makes the next start open with a
 * "continue where we left off" resume, the persona-chain stash
 * re-authorises the active segment, and the demo pages keep their
 * own resume record — which is right for a real returning visitor
 * and wrong for a demo: Ron showing the site to a friend needs the
 * next start to be a stranger's first visit. This wipes every
 * client-side thread of the old visit: the conversation memory, the
 * chain stash, the stored visitor key (the next start mints a fresh
 * one anyway) and the demo resume record. Device PREFERENCES are
 * not identity and survive on purpose: the captions choice, voice,
 * noise filter and the voice-proxy override all stay. */
export function resetVisitForNewVisitor(): void {
  clearAllVisitMemory();
  visitChainStash.clear();
  try { localStorage.removeItem("gemini-visitor-key"); } catch { /* storage is best-effort */ }
  clearDemoResume();
}
export function resumeRecap(turns: Turn[]) {
  if (!turns.some(t => t.role === "assistant")) return undefined;
  // Publish #63 windowing (_shared/recap-builder.ts): the FIRST 6
  // turns plus the LAST 30, an elision line where the middle was
  // dropped, hard-capped — never the old last-8-turns tail-slice
  // that forgot the visitor's name and first criteria by design.
  const lines = turns.filter(t => t.role !== "divider").map(t => `${t.role === "user" ? "Visitor" : "Assistant"}: ${t.text}`);
  return windowRecapLines(lines).join("\n");
}
type Phase = "idle" | "connecting" | "live" | "preview";

// The voice socket host is resolved AT EACH CONNECT by voiceProxyWsUrl()
// (@/lib/voiceProxy): per-device ?voiceProxy override > VITE_VOICE_PROXY_WS_URL
// build default > the historical Edge derivation (Part 2 server move).

/** Calm guidance shown instead of the mic-denied error when the widget is framed by an
 * embedded preview: the parent frame withholds the microphone, so no prompt can ever
 * appear. Opening this same page as its own top-level page is where the prompt works. */
const EmbeddedMicrophoneNotice = ({ compact = false, name = "Aspen" }: { compact?: boolean; name?: string }) => { const { t } = useTranslation(); return (
  <div role="status" className="space-y-1.5">
    <p className={compact ? "text-[11px] text-muted-foreground" : "text-xs text-muted-foreground"}>{t("voice.embeddedMicNotice", { name })}</p>
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
  /** Focus view (face-first panel with captions off): the shell widens
   *  so the presenter floats larger, frameless, over the page. */
  focus?: boolean;
}
export interface GeminiConversationProps { agentId?: string; leadId?: string; prospectId?: string; draft?: boolean; compact?: boolean; name?: string; visitorName?: string; previewVoice?: string; autoStart?: boolean; previewOnly?: boolean; previewAudioContext?: AudioContext; testModel?: string; shareToken?: string; onRecommendedPlan?: (plan: SalesPlan) => void; videoAvatar?: VideoAvatar; avatarInline?: boolean; faceFirst?: boolean; avatarUrl?: string; /** The visitor tapped a launcher that already showed the recording notice; that tap is the agreement. */ consentOnOpen?: boolean; /** Open the paid live session silently before the tap so it starts instantly. */ prewarm?: boolean; onPrewarmed?: (ready: boolean) => void; /** Verified Demo Gate: 'pending' starts the session in the Act 1 host phase (verification before simulation); 'verified' or undefined keeps the standard session. */ verification?: "pending" | "verified"; /** Cold-email invite arrival: asks gemini-session for the invite host phase; honored server-side only when the lead's invite arrival was stamped by the demo-invite resolve. */ invite?: boolean; /** One-click example sample (Batch 2): the /agents/realtors examples grid/dropdown marks the session sample=1; forwarded to gemini-session, which honors it only when the lead's stored site URL matches one of the 14 known example sites (that example's listings pack is then stamped into the simulation). */ sample?: boolean; /** Platform guide: 'alex' starts the authenticated setup-guide session (Alex, support specialist) instead of a tenant agent; honored server-side only for signed-in users. */ guide?: "alex"; /** Fires with each finalized visitor transcript line (used by the demo gate to hear a spoken code). */ onUserTranscript?: (text: string) => void; /** Three-stage widget: the shell fills this ref with live-session commands for its Stage 3 bar. */ shellControlsRef?: { current: GeminiShellControls | null }; /** Three-stage widget: receives the live-session snapshot for the Stage 3 bar. */ onShellState?: (state: GeminiShellState) => void; /** Widget chrome rendered INSIDE the panel, in the toggle row directly under the window-controls row (the Voice/Type toggle lives here, never over her). */ belowAvatar?: ReactNode; /** Window controls (drag/minimize/end) rendered as the FIRST row inside the panel, below its top border (2026-11-12 panel layout fix: no control overlaps the portrait; the shell hands its AspenWindowControls row here in voice mode). */ windowControls?: ReactNode; /** Avatar swap (Stage 1): fires when the ACTIVE persona changes at a boundary, so the shell identity (name + portrait) follows the speaker. Never fires when the server flag is off. */ onPersonaChange?: (persona: { id: PersonaId; displayName: string }) => void; }
const GeminiConversation = ({ agentId, leadId, prospectId, draft = false, compact = false, name = "Aspen", visitorName = "", previewVoice, autoStart = false, previewOnly = false, previewAudioContext, testModel, shareToken, onRecommendedPlan, videoAvatar, avatarInline = false, faceFirst = false, avatarUrl, consentOnOpen = false, prewarm = false, onPrewarmed, verification, invite, sample, guide, onUserTranscript, shellControlsRef, onShellState, belowAvatar, windowControls, onPersonaChange }: GeminiConversationProps) => {
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
      visitMemoryDelete(agentId || 'homepage');
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
        const existing = visitMemoryGet(key);
        if (!existing.some(t => t.text.includes('teamIntroSeen'))) {
          visitMemorySet(key, [...existing, { role: 'user', text: '[visit fact] teamIntroSeen: the visitor watched the meet-the-team introduction on the demo page.' }]);
        }
      } catch { /* memory is best-effort */ }
    }
  }, [leadId, agentId]);
  const onPrewarmedRef = useRef(onPrewarmed); onPrewarmedRef.current = onPrewarmed;
  const onUserTranscriptRef = useRef(onUserTranscript); onUserTranscriptRef.current = onUserTranscript;
  const onPersonaChangeRef = useRef(onPersonaChange); onPersonaChangeRef.current = onPersonaChange;
  // EXAMPLE PRESENTER (Frank batch, 2026-11-13): a one-click example
  // session (sample) on a PINNED example lead with a presenter in the
  // map is fronted SOLO by that persona — no Aspen host, no Sara
  // segment, no swap. Derived from props at mount so the presenter's
  // face/name render from the first frame; the session and the face
  // token are authorized server-side against the server's own copy
  // of the map (gemini-session stamps the parent config;
  // simli-avatar checks the leadId), so this derivation only steers
  // rendering — it earns nothing by itself. Null for every other
  // session, which keeps all existing paths byte-identical.
  const presenterPersona: PersonaId | null = sample ? presenterForExampleLeadId(leadId) : null;
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
  // Paired playout structure (volume-stream fix, 2026-11-14):
  // resolved ONCE per page — 'local' (default) plays the presenter's
  // voice through this component's local media-sink path and keeps
  // Simli's returned stream muted + unsubscribed; 'stream' is the
  // Publish #47 media tap, kept as the instant kill switch
  // (?pairedAudible=stream). See lib/pairedAudible.ts.
  const pairedAudibleModeRef = useRef<PairedAudibleMode | null>(null);
  const pairedAudibleMode = (): PairedAudibleMode => {
    if (!pairedAudibleModeRef.current) {
      let stored: string | null = null;
      try { stored = window.localStorage.getItem(PAIRED_AUDIBLE_STORAGE_KEY); } catch { /* private mode */ }
      pairedAudibleModeRef.current = resolvePairedAudibleMode(window.location.search, stored);
    }
    return pairedAudibleModeRef.current;
  };
  // Heard-engine structure (volume-speaker fix, 2026-11-14;
  // re-pointed by Publish #54): which engine carries the LOCAL
  // path's audible voice — 'blob' (the #54 default) is the
  // blob/file media-element engine (a plain media element playing
  // whole WebM files; no WebAudio and no MediaSource in the heard
  // chain), 'element' is the MediaSource media-element engine,
  // reachable only via the explicit ?heardEngine=element opt-in
  // after its stall ladder went 0-for-7 in the #53 retest, and
  // 'sink' is the Publish #48 media-sink graph, restored with
  // ?heardEngine=sink for A/B on the same phone. The engine is
  // feature-detected per session: where WebCodecs opus is
  // unavailable, chunks simply keep routing to the sink graph —
  // the exact #48 behaviour — so this preference can never
  // silence a call by itself. See lib/blobElementPlayout.ts and
  // lib/mediaElementPlayout.ts.
  const heardEngineRef = useRef<HeardEngine | null>(null);
  const heardEngine = (): HeardEngine => {
    if (!heardEngineRef.current) {
      let stored: string | null = null;
      try { stored = window.localStorage.getItem(HEARD_ENGINE_STORAGE_KEY); } catch { /* private mode */ }
      heardEngineRef.current = resolveHeardEngine(window.location.search, stored);
    }
    return heardEngineRef.current;
  };
  const mediaElementRef = useRef<HeardElementEngine | null>(null);
  const mediaElementStateRef = useRef<'idle' | 'starting' | 'ready' | 'failed'>('idle');
  // Round 4 (volume round 4, 2026-11-14): the engine's start
  // failure reason, mirrored from the engine instance so the
  // playout diag can stamp it (efail=) — on Publish #51 the
  // engine died (or never settled) on Ron's phone and the record
  // carried no reason at all.
  const mediaElementFailureRef = useRef<string | null>(null);
  // Publish #62 playout recovery guard (lib/playoutRearm.ts):
  // when the blob engine dies on a stall, the session no longer
  // settles on the media-stream sink for good — a FRESH blob
  // engine is armed instead, a bounded number of times per
  // conversation. engineCarryRef holds the stall counters of
  // every retired engine, so the playout diag stamps the
  // conversation's totals (a stall the guard recovered stays
  // countable after the engine that suffered it is gone, and
  // each successful re-arm adds one recovery). engineRearmRef is
  // the budget: attempts spent, plus the pending flag a fatal
  // sets so the fresh engine's settle can count its recovery.
  // Both reset with the engine state in stopEverything, so a new
  // conversation starts with a full budget and zeroed totals.
  const engineCarryRef = useRef({ stalls: 0, recoveries: 0 });
  const engineRearmRef = useRef({ attempts: 0, pending: false });
  // Round 4 engine-first hold: while the media-element engine is
  // still 'starting', local chunks are HELD (below) instead of
  // spilling onto the MediaStream sink — the sink is what Ron's
  // phone kept hearing. Held chunks replay through playPcmChunk
  // itself the moment the engine settles: to the engine when it
  // reports ready, to the sink graph when it reports failure, so
  // no chunk is ever lost to the wait. The release latch stops a
  // slow start from holding the whole greeting: after the
  // deadline (or the size cap) the held chunks drain to the sink
  // and later chunks follow today's routing until the engine is
  // ready.
  const engineHoldRef = useRef<Array<{ base64: string; reserved?: ReturnType<PlaybackCaptions['reserve']> }>>([]);
  const engineHoldSecRef = useRef(0);
  const engineHoldTimerRef = useRef<number | null>(null);
  const engineHoldReleasedRef = useRef(false);
  /** Latest playPcmChunk, for the hold drain (the callback's own
   *  identity changes with its deps; the drain always wants the
   *  current one). Assigned right after its definition. */
  const playPcmChunkRef = useRef<((base64: string, reserved?: ReturnType<PlaybackCaptions['reserve']>) => void) | null>(null);
  /** End-of-chunk timers for engine-routed chunks (they have no
   *  AudioBufferSourceNode, so onended bookkeeping runs here). */
  const engineTimersRef = useRef(new Set<ReturnType<typeof setTimeout>>());
  /** True once the live mic track has been re-requested WITHOUT
   *  echo cancellation for the media-element engine (and not yet
   *  restored). See applyCaptureProcessing below. */
  const captureRawRef = useRef(false);
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
  const chainDropSnapshotRef = useRef<{ state: SwapState; parentSessionId: string | null; chainClass: 'simulation' | 'intro' | 'presenter' | null; at: number } | null>(null);
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
   *  authorization), 'intro' for the /demo explainer parent,
   *  'presenter' for a whole-demo presenter parent (Alex handoff fix,
   *  2026-11-14: meet-alex + return only — the state carries the
   *  presenter, and the matcher runs the presenter rule set), null when
   *  no chain is armed. The structural doorway trigger
   *  (noteDoorwayEngagement) folds ONLY for the simulation class: the
   *  explainer chain starts in phase 'intro', never 'host', and a
   *  homepage session carries no chain at all — so neither can ever
   *  set pendingDoorway. Set at both arming sites, cleared at teardown. */
  const swapChainClassRef = useRef<'simulation' | 'intro' | 'presenter' | null>(null);
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
  /** NO-DEAD-AIR BRIDGE (Scalone batch Item 6a): the arm stamp a
   *  bridging line was already requested for (0 = none yet) — one
   *  bridge per arm, keyed by the stamp so a retry arm earns its own. */
  const swapBridgeSentRef = useRef(0);
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
  /** VOICE-FIRST PARENT START (2026-11-21): the parent session's own
   *  face start is still in flight while the conversation already
   *  runs on voice alone. While set, playPcmChunk routes this
   *  session's chunks locally (the same routing the segment pending
   *  record above produces); the start gate's late-settle handler —
   *  or the warm activation's re-kick — clears it when the face
   *  lands or degrades to the voice-only fallback. Reset in teardown
   *  alongside segmentFacePendingRef so a stale pending can never
   *  leak into a later session. */
  const parentFacePendingRef = useRef(false);
  /** TAKEOVER RE-SYNC LEDGER (2026-11-20): how many chunks the
   *  CURRENT voice-first segment has already scheduled locally
   *  (playPcmChunk counts them at its schedule commit, where the
   *  engine-hold early-return can no longer double-count or skip
   *  one). Reset where the pending record is created in
   *  executeSwap; consulted by the takeover (takeoverShouldResync)
   *  to decide whether the paired offset needs re-priming. */
  const voiceFirstLocalChunksRef = useRef(0);
  const faceTakeoverBusyRef = useRef(false);
  const [stageGeneration, setStageGeneration] = useState(0);
  const attemptSessionRef = useRef<Partial<Record<PersonaBoundary, { sessionId: string; attempt: number }>>>({});
  const knownNameRef = useRef('');
  const sessionStartedAtRef = useRef(0);
  const warmRef = useRef<{ ready: Promise<boolean>; ok: boolean; activated: boolean; goLive?: () => void; readyAt: number | null; socket: WebSocket | null } | null>(null);
  // The UI locale the held warm session was AUTHORIZED under (captured
  // at its gemini-session invoke, byte-identical to what was sent). A
  // language switch after the prewarm leaves the held session in the
  // old language; the tap compares this against the current pick and
  // re-authorizes instead of activating a stale-language session
  // (2026-11-18 — see prewarmLocaleMismatch in lib/uiLocale).
  const warmLocaleRef = useRef<UiLocale | undefined>(undefined);
  const avatarRef = useRef<SimliAvatarHandle>(null);
  const [faceLive, setFaceLive] = useState(false);
  // Captions on/off doubles as the FOCUS VIEW switch (2026-11-14):
  // captions off = focus view (the presenter floats frameless, panel
  // becomes the bottom dock). DEFAULT (owner-directed 2026-11-15,
  // strengthened 2026-11-16): captions are OFF at the start of EVERY
  // session — the animated avatar is the showpiece, and the one-time
  // tip card (below) points at the Captions button. A cross-visit
  // preference no longer auto-applies: a visitor who turned captions
  // on last week still starts OFF today and toggles them on in one
  // tap. Within a visit, the sessionStorage mirror keeps the live
  // choice, so reopening the widget mid-visit never silently
  // restores captions they turned off; a mute-forced captions-on is
  // session-only, exactly as before.
  const [captions, setCaptions] = useState(() => {
    try { return sessionStorage.getItem("aspen-widget-captions") === "on"; } catch { return false; }
  });
  useEffect(() => {
    try { sessionStorage.setItem("aspen-widget-captions", captions ? "on" : "off"); } catch { /* storage is best-effort */ }
  }, [captions]);
  const chooseCaptions = useCallback((next: boolean) => {
    setCaptions(next);
  }, []);
  // CAPTIONS TIP CARD (owner-directed 2026-11-15): with the new
  // captions-off default, a first-time visitor gets ONE semi-
  // transparent tip card for ~10 seconds when their first live
  // session starts, pointing at the Captions button. Once per
  // visitor (localStorage), and it disappears the moment captions
  // come on, the session ends, or they dismiss it.
  const [captionsTip, setCaptionsTip] = useState(false);
  // (The effect that drives this lives below, next to the phase
  // state it depends on.)
  const avatarLiveRef = useRef(false);
  const avatarRequestedRef = useRef(false);
  const [pendingAction, setPendingAction] = useState<VoiceAction | null>(null);
  // FORM RE-PRESENTATION (Publish #68): a confirmation card the
  // visitor dismissed unsubmitted — our X, Not now, an outside tap,
  // or a provider cancellation — leaves a persistent chip in the
  // panel ("Form waiting — tap to open"); one tap asks the proxy to
  // re-issue the SAME card, so a dismissed form is never one-shot
  // again. The ref mirrors the live card so the socket handlers can
  // move it into the waiting slot when a cancellation lands.
  const [waitingAction, setWaitingAction] = useState<VoiceAction | null>(null);
  const pendingActionRef = useRef<VoiceAction | null>(null);
  const trackPendingAction = (action: VoiceAction | null) => { pendingActionRef.current = action; setPendingAction(action); };
  const [actionNotice, setActionNotice] = useState('');
  // VOICE DEMO START (2026-11-21): once the proxy confirms the
  // visitor's demo really started, its entry card lives here — a
  // persistent "building / tap to enter" affordance that survives
  // the rest of the conversation until the visitor enters or
  // dismisses it. Data-driven only: the proxy sends demoPath solely
  // for a started homepage demo, so no other surface ever shows it.
  const [demoCard, setDemoCard] = useState<{ demoPath: string; websiteUrl: string } | null>(null);
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
  // Voice-asked transfer trigger (Batch 1, 2026-11-12): the voice proxy
  // sends {type:'start_handoff'} a few seconds after Aspen announces a
  // manager transfer; each message bumps this counter and
  // BrowserVoiceHandoff auto-starts its dial when the value changes.
  const [handoffStartSignal, setHandoffStartSignal] = useState(0);
  const [handoffActive, setHandoffActive] = useState(false);
  const handoffRef = useRef(false);
  // Come-back after handoff (Handoff improvement batch, 2026-11-12):
  // BrowserVoiceHandoff reports the terminal outcome (onEnded) just
  // before onActive(false); it is kept in a ref so onHandoffActive
  // can forward it to the proxy, which authors the return line.
  const handoffOutcomeRef = useRef<'completed' | 'unavailable' | null>(null);
  // Handoff-leg recovery (2026-11-14): the announcement Aspen spoke
  // for the transfer, captured when the dial is signalled — a return
  // session's recap is built WITHOUT it (the line is said once; its
  // replay as the return's opening was tonight's Round A defect).
  // handoffReturnRef marks that a handoff happened this visit and a
  // later start is a RETURN: it carries the leg outcome for the
  // recap's [visit fact] line and the handoffDiag return stamps,
  // and is cleared when the return lands (go-live) or fails (the
  // start's mic-denied catch). handoffMicReusedRef records that
  // the live start adopted the retained pre-handoff stream, so
  // the return stamp can say mic=reused. Visit-scoped on purpose:
  // a stop + play resume in the same visit IS a return.
  const handoffAnnouncementRef = useRef<string | null>(null);
  const handoffReturnRef = useRef<{ outcome: 'completed' | 'unavailable' | 'unknown' } | null>(null);
  const handoffMicReusedRef = useRef(false);
  const lastHandoffDiagRef = useRef('');
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
    // NOISY-ROOM DEFAULT (Ron's direction, 2026-11-16; hardened
    // 2026-11-17): sessions start on STRONG filtering — assume a
    // noisy place — and the ambient auto-pick may no longer relax
    // the filter mid-session at all (see feedAmbientSample): only a
    // deliberate manual pick ever selects balanced or light. A saved
    // value is respected only when it carries the manual marker
    // written by chooseNoiseFilter: the old build persisted EVERY
    // auto-pick too, so values storage holds without the marker
    // (including a dead mic's auto-"light") are not the visitor's
    // choice and fall back to strong. With the marker, the stored
    // value can only have been written by the manual chooser, so a
    // marked pick is honored as-is — balanced included.
    try { const saved = localStorage.getItem("voice-noise-filter"); const manual = localStorage.getItem("voice-noise-filter-manual") === "1"; return manual && (saved === "light" || saved === "balanced" || saved === "strong") ? saved : "strong"; } catch { return "strong"; }
  });
  const noiseFilterRef = useRef(noiseFilter);
  // Mic environment auto-pick (Batch 1, 2026-11-12): the capture loops feed
  // every frame's RMS into a rolling ambient tracker. The tracker still
  // measures (its floor feeds diagnostics and the manual-mode readout),
  // but since 2026-11-17 its pick no longer drives noiseFilter: auto
  // holds the applied filter at STRONG whatever the room measures, and
  // only a manual pick moves it (see autoNoiseFilter). The persisted
  // localStorage value is only the starting point — it does NOT count
  // as a manual pick. Any in-session pick (the in-panel Quiet/Normal/
  // Noisy control or either settings-dialog Select) marks manual and
  // stops auto-picking for the rest of the session; the pick itself persists to
  // localStorage from chooseNoiseFilter, together with the manual marker
  // the initializer above requires before honoring a saved value.
  const [noiseFilterManual, setNoiseFilterManual] = useState(false);
  const noiseFilterManualRef = useRef(false);
  // Dead-air exception (2026-11-18): the filter level the gate's
  // one mid-session relax dropped to, or null when no relax has
  // happened this session. Reset at every session start (with the
  // mic refs below); stamped into micDiag as relax= so the field
  // record shows whether — and to what — the path was opened.
  const gateRelaxedRef = useRef<NoiseFilter | null>(null);
  const ambientTrackerRef = useRef<AmbientGateState>(createAmbientGateState(noiseFilter));
  const ambientCheckedAtRef = useRef(0);
  const [ambientFloor, setAmbientFloor] = useState(0);
  const chooseNoiseFilter = (value: NoiseFilter) => {
    noiseFilterManualRef.current = true;
    setNoiseFilterManual(true);
    // Only a DELIBERATE pick persists (2026-11-16): the persist
    // effect used to write every noiseFilter change, so the ambient
    // auto-pick saved its own guesses as the visitor's "preference"
    // and later sessions started on them. The marker records that
    // this stored value was a person's choice (see the initializer).
    try { localStorage.setItem("voice-noise-filter", value); localStorage.setItem("voice-noise-filter-manual", "1"); } catch { /* Keep controls available without storage. */ }
    // Keep the tracker's hysteresis reference on the visitor's own pick.
    ambientTrackerRef.current = { ...ambientTrackerRef.current, filter: value };
    setNoiseFilter(value);
  };
  // Called by BOTH capture loops for every microphone frame. The window
  // updates per frame; the floor state + auto-pick re-evaluate at most
  // once every ~3s, so a passing speech burst never jerks the control.
  const feedAmbientSample = (rms: number) => {
    // Zero-input guard: this is the single choke point every raw mic
    // frame passes through (both capture loops, pre-gate), so the
    // flow tracker hooks here — the true signal, never a proxy.
    noteMicFrame(micFlowRef.current, rms, Date.now());
    const next = pushAmbientRms(ambientTrackerRef.current, rms);
    ambientTrackerRef.current = next;
    const now = performance.now();
    if (now - ambientCheckedAtRef.current < 3000) return;
    ambientCheckedAtRef.current = now;
    setAmbientFloor(next.floor);
    // AUTO-PICK FLOOR (Ron's order, 2026-11-17 — supersedes the
    // 2026-11-16 balanced↔strong clamp): auto NEVER relaxes the
    // applied filter below strong on its own. The clamp still let a
    // quiet room slide a strong-start session to "Balanced filtering
    // — everyday" within seconds — and at Balanced, in a silent
    // room, Aspen's own speaker echo cleared the gate and cut her
    // off three times while the visitor said nothing (Ron's
    // 2026-11-17 phone + rebooted-laptop sessions). The tracker
    // keeps measuring; its suggestion is passed to autoNoiseFilter,
    // which holds strong until a manual pick says otherwise.
    if (!noiseFilterManualRef.current) {
      if (gateRelaxedRef.current) {
        // The dead-air relax (below) IS this session's auto decision:
        // the strong-holding auto-pick must not undo it at the next
        // evaluation.
      } else {
        const autoFilter = autoNoiseFilter(next.filter);
        if (autoFilter !== noiseFilterRef.current) setNoiseFilter(autoFilter);
        // DEAD-AIR EXCEPTION (2026-11-18 fix plan #3): energy is
        // flowing (the mic is alive) yet the speech gate has NEVER
        // opened this session — the applied bar is simply above
        // this speaker's level, and every word is being sent as
        // literal silence. Relax ONE level, once, and stamp it;
        // without this, a quiet speaker has no path in at all.
        const flow = micFlowRef.current;
        const relaxed = deadAirRelaxedFilter({
          applied: noiseFilterRef.current,
          manual: false,
          alreadyRelaxed: false,
          gateEverOpened: micGateHeardRef.current > 0,
          energyFrames: flow.energyFrames,
          liveMs: flow.liveSince > 0 ? Date.now() - flow.liveSince : 0,
        });
        if (relaxed) {
          gateRelaxedRef.current = relaxed;
          setNoiseFilter(relaxed);
          stampMicDiagRef.current("recovered");
        }
      }
    }
  };
  // The environment the dialog presents as in force: in auto mode the
  // standing Noisy assumption (appliedAmbientLevel), not the measured
  // floor — the readout describes the filtering actually applied.
  const ambientLevel = appliedAmbientLevel(noiseFilterManual, ambientFloor);
  useEffect(() => {
    const track = micStreamRef.current?.getAudioTracks()[0];
    if (track) void track.applyConstraints({autoGainControl: microphoneAutoGain(captureMode, noiseFilter)}).catch(() => { /* Browser may not support gain adjustment. */ });
  }, [noiseFilter, captureMode]);
  useEffect(() => {
    noiseFilterRef.current = noiseFilter;
    // No persistence here (2026-11-16): this effect used to write
    // every noiseFilter value — including the ambient auto-pick's —
    // to localStorage as if it were the visitor's preference.
    // Persistence now lives in chooseNoiseFilter (manual picks
    // only, with the manual marker). Capture mode stays
    // session-scoped for the same reason it always was.
  }, [noiseFilter, captureMode]);
  const [held, setHeld] = useState(false);
  const [muted, setMuted] = useState(false);
  const [speakerMuted, setSpeakerMuted] = useState(false);
  const speakerMutedRef = useRef(false);
  const speakerGainRef = useRef<GainNode | null>(null);
  // In-panel speaker volume (2026-11-13): the visitor's level for BOTH
  // playback paths — the local speaker gain below and every Simli face
  // instance's element volume. Hardware volume keys cannot be trusted
  // to reach the paired stream on Android (see lib/playbackVolume.ts),
  // so this slider is the guaranteed control. Default unity = the
  // historical behaviour; the mute toggle still overrides it.
  const [playbackVolume, setPlaybackVolume] = useState<number>(() => loadPlaybackVolume());
  const playbackVolumeRef = useRef(playbackVolume);
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
  // CAPTIONS TIP CARD driver (see the captions block above): show
  // the one-time tip when a first live session runs with captions
  // off; hide it when captions come on or the session leaves live.
  useEffect(() => {
    if (phase !== "live" || captions || isPreviewRef.current) { setCaptionsTip(false); return; }
    let seen = true;
    try { seen = localStorage.getItem("aspen-captions-tip-seen") === "1"; } catch { /* storage unavailable: treat as seen */ }
    if (seen) return;
    try { localStorage.setItem("aspen-captions-tip-seen", "1"); } catch { /* best-effort */ }
    setCaptionsTip(true);
    const timer = window.setTimeout(() => setCaptionsTip(false), 10000);
    return () => window.clearTimeout(timer);
  }, [phase, captions]);
  const [aspenSpeaking, setAspenSpeaking] = useState(false);
  const [status, setStatus] = useState(() =>
    t("panel.initialStatus")
  );
  const [error, setError] = useState<string | null>(null);
  const [audioNeedsTap, setAudioNeedsTap] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const signInAction = limitReached && error ? <a href={`/account?next=${encodeURIComponent(window.location.pathname + window.location.search)}`} className="inline-flex w-fit items-center rounded-md border border-primary px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10">{t("panel.signInAdmin")}</a> : null;
  const [endedByVisitor, setEndedByVisitor] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  // Voice-settings Apply (owner ask, 2026-11-20): the settings dialog
  // used to apply every pick the instant it was made, with no confirm
  // and no feedback. Noise filtering and speaker volume genuinely apply
  // live and stay instant; the MICROPHONE and CONVERSATION MODE picks
  // in the dialog are now DRAFTS — they commit only when the visitor
  // taps "Apply settings", the button flashes "Applied ✓", and closing
  // the dialog without applying discards the drafts (they re-sync from
  // the live values on the next open). The Voice Lab page's inline rows
  // keep their direct wiring — the dialog is the customer surface.
  const [draftMicrophone, setDraftMicrophone] = useState("default");
  const [draftCaptureMode, setDraftCaptureMode] = useState<CaptureMode>("handsfree");
  const [settingsJustApplied, setSettingsJustApplied] = useState(false);
  const appliedTimerRef = useRef<number | null>(null);
  const startAfterApplyRef = useRef(false);
  const settingsPending = draftMicrophone !== microphone || draftCaptureMode !== captureMode;
  useEffect(() => {
    if (showSettings) {
      setDraftMicrophone(microphone);
      setDraftCaptureMode(captureMode);
      setSettingsJustApplied(false);
    }
    // Sync on open only — the live values are read at open time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSettings]);
  const applyVoiceSettings = () => {
    if (draftMicrophone !== microphone) setMicrophone(draftMicrophone);
    if (draftCaptureMode !== captureMode) {
      if (draftCaptureMode === "hold") pauseCapture(); else endHold();
      captureRef.current.mode = draftCaptureMode;
      setCaptureMode(draftCaptureMode);
    }
    setSettingsJustApplied(true);
    if (appliedTimerRef.current) window.clearTimeout(appliedTimerRef.current);
    appliedTimerRef.current = window.setTimeout(() => setSettingsJustApplied(false), 2500);
  };
  // "Start call with these settings" commits pending drafts first, then
  // starts once the committed values have rendered (startConversation
  // reads microphone/captureMode from state).
  useEffect(() => {
    if (!startAfterApplyRef.current) return;
    startAfterApplyRef.current = false;
    setShowSettings(false);
    void startConversation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [microphone, captureMode]);
  // LAYOUT REFINEMENT (Scalone batch Item 8b): a wide landscape panel
  // merges the Voice/Type toggle row and the transport row into ONE
  // row (see landscapeControlRow). JS-driven rather than a CSS
  // duplicate so exactly one instance of each control ever mounts;
  // portrait (and anything narrower) keeps the stacked arrangement.
  const [wideLandscape, setWideLandscape] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(orientation: landscape) and (min-width: 640px)');
    const update = () => setWideLandscape(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);
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
  // Mic zero-input guard (2026-11-14, lib/micWatchdog.ts): the flow
  // tracker is fed every mic frame from feedAmbientSample below; the
  // watchdog notice is the DEAD-path alarm (zero energy at all),
  // distinct from the turn-based audibility hint above — it fires
  // even mid-monologue, carries the one-tap recovery, and stamps
  // config.micDiag so the session record explains the mic path.
  const [showMicWatchdog, setShowMicWatchdog] = useState(false);
  const micWatchdogRef = useRef(false);
  const micWatchdogShownAtRef = useRef(0);
  const micFlowRef = useRef(createMicFlowState());
  // Silent-stream guard (chat-fix6, lib/micWatchdog.ts): the
  // watchdog's sibling for a LIVE-but-silent input — frames flow,
  // the track is live, the level never rises off zero (Ron's wired
  // headset, session 3b30cc34). Stage counts surfacings this
  // session (0 armed, 1 shown once, 2 re-check used, 3 resolved
  // by real sound); the fired flag rides every later micDiag
  // stamp as silent=1. Evaluated in the watchdog interval below.
  const [showSilentMic, setShowSilentMic] = useState(false);
  const silentMicRef = useRef(false);
  const silentStageRef = useRef(0);
  const silentMicFiredRef = useRef(false);
  const silentLiveSinceRef = useRef(0);
  const lastMicDiagRef = useRef("");
  // Playout startup guard (chat-fix3, 2026-11-16, lib/playoutStartup.ts):
  // the OUTPUT mirror of the mic guard above. The watch arms at the
  // session's first locally-routed chunk, stamps the startup window
  // to config.startupDiag, and raises the Tap-for-sound pill when
  // audio was delivered but the terminal never started moving in a
  // gesture-fixable state (element paused / context suspended) —
  // the auto-start-on-panel-open shape that left Ron's b21b5884
  // session silent for 32 s while the transcript proved she spoke.
  // Steady-state engine behaviour is untouched: the watch only
  // observes the terminal, and the pill only re-primes it.
  const [soundBlocked, setSoundBlocked] = useState(false);
  const startupWatchRef = useRef(createPlayoutStartupWatch());
  const startupTimersRef = useRef<number[]>([]);
  const lastStartupDiagRef = useRef("");
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

  // Round 5 stranded-speech drain: when the media-element engine
  // fails fatally, it hands back the PCM chunks it had accepted
  // but never played (drainPendingPcm). They are replayed here
  // through the sink graph — one shared gain, so the session's
  // mute/volume controls keep governing them — chained in order
  // on the shared schedule clock, so live chunks queue behind
  // the drained speech instead of overlapping it. (During a
  // stall the schedule clock stays near now — chunks chain at
  // their arrival time — so the drain starts essentially
  // immediately, not after a stall-sized silence.) The flip
  // delays this speech; it never drops it.
  const playDrainedSamples = (chunks: Int16Array[]): void => {
    if (chunks.length === 0) return;
    if (!playCtxRef.current) {
      playCtxRef.current = new AudioContext({ sampleRate: 24000 });
      playTimeRef.current = 0;
    }
    const ctx = playCtxRef.current;
    if (ctx.state === "suspended" && !captureRef.current.paused) void ctx.resume().catch(() => { /* the graph branch reports a stuck context on the next live chunk */ });
    const gain = ctx.createGain();
    gain.gain.value = effectivePlaybackLevel(speakerMutedRef.current, playbackVolumeRef.current);
    speakerGainRef.current = gain;
    gain.connect(mediaOutputNode(ctx));
    let at = Math.max(ctx.currentTime + 0.02, playTimeRef.current);
    for (const samples of chunks) {
      const floats = new Float32Array(samples.length);
      for (let i = 0; i < samples.length; i++) floats[i] = samples[i] / 32768;
      const buffer = ctx.createBuffer(1, floats.length, 24000);
      buffer.getChannelData(0).set(floats);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(gain);
      sourcesRef.current.add(source);
      source.onended = () => { sourcesRef.current.delete(source); };
      source.start(at);
      at += buffer.duration;
    }
    playTimeRef.current = at;
    setAspenSpeaking(true);
  };

  // Media-element engine lifecycle (volume-speaker fix): created
  // lazily at the first local chunk, started asynchronously. Until
  // it reports ready — and forever on platforms without the APIs —
  // chunks route to the media-sink graph above, exactly as in
  // Publish #48. When it becomes ready it inherits the session's
  // current level and speaker-output choice, and the mic track is
  // re-requested without echo cancellation (applyCaptureProcessing).
  const ensureMediaElement = (): HeardElementEngine | null => {
    if (heardEngine() === 'sink') return null;
    if (mediaElementStateRef.current === 'failed') return null;
    let engine = mediaElementRef.current;
    if (engine) return engine;
    mediaElementStateRef.current = 'starting';
    mediaElementFailureRef.current = null;
    engineHoldReleasedRef.current = false;
    // Publish #54: the blob/file engine is the default terminal;
    // the MediaSource engine is constructed only when the
    // ?heardEngine=element opt-in selected it. Both implement
    // HeardElementEngine, so the lifecycle below (fatal flip,
    // hold drain, level inheritance) is shared verbatim.
    const onEngineFatal = (reason: string) => {
      // The engine died. What happens next is the Publish #62
      // recovery guard's decision (lib/playoutRearm.ts):
      //  - 'rearm' (blob engine, stall-class death, budget left):
      //    the dead engine is retired — its stall counters carry
      //    into the conversation totals — and a FRESH blob engine
      //    is constructed and started below. The sink graph
      //    bridges only the stranded-speech drain and the new
      //    engine's start window; it is never the settled
      //    terminal again. This replaces the pre-#62 behaviour
      //    under which ONE stall flipped the session to the
      //    media-stream sink permanently (Ron's 2026-11-15 Frank
      //    sessions: term=media-stream with the rate witness
      //    sagging 0.85..0.96 for the rest of the call).
      //  - 'reconnect' (stall-class death, budget spent): the
      //    existing bounded session-reconnect path takes over
      //    instead of the sink settling.
      //  - 'settle' (everything else — platform/config deaths a
      //    fresh instance cannot cure, and the MSE opt-in's
      //    deaths): the pre-#62 behaviour verbatim, below.
      // In the rearm/settle branches the mic gets its echo
      // cancellation back (the raw-capture request only ever
      // rides with a live element engine; a re-arm's settle
      // re-requests it), and Round 4 stands: the reason is KEPT
      // (it is stamped as efail= — a silent death is what made
      // Publish #51's failure unreadable), and any chunks held
      // for the engine drain to the sink graph.
      const dying = mediaElementRef.current;
      const decision = engineRearmDecision({
        kind: dying?.kind ?? null,
        reason,
        rearmAttempts: engineRearmRef.current.attempts,
      });
      // A fatal from the re-arm engine itself consumes the
      // pending flag: only a start that settles READY earns the
      // recovery increment (in the settle handler below).
      engineRearmRef.current.pending = false;
      if (decision === 'reconnect' && liveRef.current) {
        // The re-arm budget is spent and the element path keeps
        // wedging: surface the existing reconnect path — the same
        // bounded machinery the drop recovery uses — rather than
        // settling on the sink. stopEverything resets the engine
        // state, so the reconnected session constructs a fresh
        // blob engine on its first chunk.
        stopEverything();
        if (reconnectRef.current.count < 3) {
          reconnectRef.current = { pending: true, count: reconnectRef.current.count + 1 };
          setStatus("Reconnecting…");
          window.setTimeout(() => { void startConversationRef.current(); }, 400);
        } else {
          setError('The connection dropped and could not be restored. Press play to reconnect.');
        }
        return;
      }
      mediaElementFailureRef.current = reason;
      let stranded: Int16Array[];
      if (decision === 'rearm' && dying) {
        // Retire the dead engine: carry its counters into the
        // conversation totals BEFORE disposing it, count the
        // attempt, and mark the coming start as a re-arm so its
        // settle can count the recovery. The drain is read before
        // dispose — fail() captured the stranded PCM for exactly
        // this hand-off.
        engineCarryRef.current = {
          stalls: engineCarryRef.current.stalls + dying.stallCount,
          recoveries: engineCarryRef.current.recoveries + dying.recoveryCount,
        };
        engineRearmRef.current.attempts += 1;
        engineRearmRef.current.pending = true;
        stranded = dying.drainPendingPcm();
        dying.dispose();
        mediaElementRef.current = null;
        mediaElementStateRef.current = 'idle';
      } else {
        mediaElementStateRef.current = 'failed';
        stranded = dying?.drainPendingPcm() ?? [];
      }
      applyCaptureProcessing(false);
      // The heard terminal changed materially — re-stamp the route.
      stampPlayoutDiag();
      // A re-arm starts its fresh engine BEFORE the drains replay,
      // so held chunks hold for IT (the engine-first hold) instead
      // of spilling to the sink; the stranded-speech drain — the
      // sink's one brief bridge — plays over the start.
      if (decision === 'rearm') ensureMediaElement();
      drainEngineHold();
      // Round 5: speech the engine accepted but never played is
      // replayed through the sink graph, in order — the flip
      // delays it, it does not drop it. (Start failures drain
      // empty: nothing was ever accepted.)
      playDrainedSamples(stranded);
    };
    engine = heardEngine() === 'blob'
      ? new BlobElementPlayout(undefined, onEngineFatal)
      : new MediaElementPlayout(undefined, onEngineFatal);
    mediaElementRef.current = engine;
    void engine.start().then((ok) => {
      if (mediaElementRef.current !== engine) return;
      if (!ok) {
        // start() failed (its reason already landed via onFatal):
        // release anything held for the engine to the sink graph.
        // A failed re-arm start earns no recovery increment (its
        // fatal already consumed the pending flag in onFatal; this
        // clear is the belt-and-braces for a start that resolved
        // false without one).
        engineRearmRef.current.pending = false;
        drainEngineHold();
        return;
      }
      // Publish #62: a re-arm whose fresh engine settles READY is
      // the recovery the session record counts — rec increments
      // exactly once per successful re-arm, into the carried
      // totals the diag stamps (see localTerminalDiag). The
      // re-stamp in this handler therefore shows the recovered
      // blob terminal with the incremented count.
      if (engineRearmRef.current.pending) {
        engineRearmRef.current.pending = false;
        engineCarryRef.current = {
          stalls: engineCarryRef.current.stalls,
          recoveries: engineCarryRef.current.recoveries + 1,
        };
      }
      mediaElementStateRef.current = 'ready';
      engine.setLevel({ muted: speakerMutedRef.current, volume: playbackVolumeRef.current });
      if (captureRef.current.paused) engine.setPaused(true);
      if (selectedOutputIdRef.current) void applySinkIdToElement(engine.element, selectedOutputIdRef.current);
      applyCaptureProcessing(true);
      // The heard terminal is now the media element — re-stamp.
      stampPlayoutDiag();
      // Chunks held during the start now play through the engine.
      drainEngineHold();
    });
    return engine;
  };

  // Capture processing switch for the media-element engine. The
  // demo's mic is requested WITH echoCancellation (Gemini start
  // paths below) — the constraint that selects Android Chrome's
  // voice-communication capture path, under which the platform
  // binds the hardware keys to the call stream instead of the
  // media stream the element plays on. While the element engine
  // carries the voice, the live track is re-requested WITHOUT
  // echo cancellation (best effort: applyConstraints can refuse,
  // and the track's getSettings() is what the playout diag stamps
  // either way). Restored when the engine dies or the call ends.
  const applyCaptureProcessing = (raw: boolean) => {
    if (captureRawRef.current === raw) return;
    captureRawRef.current = raw;
    const track = micStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    void track.applyConstraints({ echoCancellation: !raw }).catch(() => { /* Browser may not support re-requesting processing. */ });
  };

  // Round 4 engine-first hold (see the refs above): how long a
  // chunk may wait for the engine, and how much audio may pile
  // up, before the hold gives up and drains to the sink graph.
  const ENGINE_HOLD_MAX_MS = 1500;
  const ENGINE_HOLD_MAX_SEC = 4;
  /** Replay every held chunk through playPcmChunk, in order.
   *  Where they land is decided by the routing at replay time:
   *  the engine when it settled ready, the sink graph when it
   *  failed or the hold gave up — a held chunk is delayed, never
   *  dropped. */
  const drainEngineHold = useCallback(() => {
    if (engineHoldTimerRef.current !== null) {
      window.clearTimeout(engineHoldTimerRef.current);
      engineHoldTimerRef.current = null;
    }
    const held = engineHoldRef.current;
    engineHoldRef.current = [];
    engineHoldSecRef.current = 0;
    const play = playPcmChunkRef.current;
    if (!play) return;
    for (const chunk of held) play(chunk.base64, chunk.reserved);
  }, []);
  /** Hold one local chunk for the starting engine. The deadline
   *  timer arms on the first held chunk; the size cap drains
   *  immediately. Either release latches engineHoldReleasedRef
   *  so the rest of this start's chunks take today's routing
   *  instead of queueing behind a slow engine. */
  const holdChunkForEngine = useCallback((base64: string, reserved?: ReturnType<PlaybackCaptions['reserve']>) => {
    engineHoldRef.current.push({ base64, reserved });
    // base64 → PCM16 24 kHz seconds: chars × 3/4 = bytes, ÷2 =
    // samples, ÷24000 = seconds (padding ignored — an estimate
    // for a cap, not a clock).
    engineHoldSecRef.current += (base64.length * 3) / 4 / 2 / 24000;
    if (engineHoldSecRef.current >= ENGINE_HOLD_MAX_SEC) {
      engineHoldReleasedRef.current = true;
      drainEngineHold();
      return;
    }
    if (engineHoldTimerRef.current === null) {
      engineHoldTimerRef.current = window.setTimeout(() => {
        engineHoldTimerRef.current = null;
        engineHoldReleasedRef.current = true;
        drainEngineHold();
      }, ENGINE_HOLD_MAX_MS);
    }
  }, [drainEngineHold]);

  /** The live mic track's echo-cancellation setting as the
   *  platform reports it ('comm' = EC on, 'raw' = EC off,
   *  'na' = no track / not reported) — playout telemetry. */
  const captureModeStamp = (): string => {
    const track = micStreamRef.current?.getAudioTracks()[0];
    if (!track) return 'na';
    try {
      const settings = track.getSettings() as { echoCancellation?: boolean };
      if (typeof settings.echoCancellation !== 'boolean') return 'na';
      return settings.echoCancellation ? 'comm' : 'raw';
    } catch {
      return 'na';
    }
  };

  /** Rate witness aggregate → terminal diag fields (Publish
   *  #54): an absent witness (the MSE engine, which implements
   *  no per-utterance clock) still renders rw=- — the record
   *  shows the witness ran and completed nothing, rather than
   *  omitting the keys the reader looks for. */
  const rateStampOf = (w: RateWitnessState | undefined) => ({
    rateMin: w ? w.min : null,
    rateMax: w ? w.max : null,
    rateLast: w ? w.last : null,
  });
  const elementPlaybackRateOf = (element: HTMLAudioElement): number | null =>
    Number.isFinite(element.playbackRate) ? element.playbackRate : null;

  /** The local path's terminal sink right now (playout telemetry):
   *  the media element when the engine is carrying the voice, the
   *  media-sink element while the #48 graph is, the bare context
   *  destination before the sink unlocks. */
  const localTerminalDiag = (): PlayoutTerminalDiag => {
    const engine = mediaElementRef.current;
    // Round 4 proof fields ride on EVERY terminal shape: the
    // engine's state/failure/rate, plus the terminal element's
    // own muted/volume where an element exists. On the #51
    // record none of this existed, so "the engine never carried
    // the voice" could not be told apart from "it failed".
    const proof = {
      engineState: heardEngine() === 'sink' ? 'off' : mediaElementStateRef.current,
      engineFailure: mediaElementFailureRef.current ?? engine?.failureReason ?? null,
      encoderRate: engine?.encoderRate ?? null,
      // Round 5: the engine's stall counters ride every terminal
      // shape — after a flip, the sink terminal's stamp still
      // shows how many stalls preceded it and how many were
      // recovered in place before it. Publish #62: the stamped
      // counters are the conversation's TOTALS — the carry from
      // every engine the recovery guard retired, plus the live
      // engine's own — so a stall a re-arm recovered (and the
      // re-arm's recovery increment) stays countable after the
      // engine that suffered it has been replaced.
      ...combineEngineCounters(engineCarryRef.current, engine),
    };
    if (engine && mediaElementStateRef.current === 'ready' && !engine.failed) {
      const state = engine.diagState();
      // Publish #54: the terminal names the engine that is
      // actually carrying the voice — 'blob-element' for the
      // blob/file engine (the default), 'media-element' for the
      // MediaSource engine behind its opt-in — so the record
      // proves which one ran.
      return { sink: engine.kind === 'blob' ? 'blob-element' : 'media-element', paused: state.paused, readyState: state.readyState, ctxInChain: false, trailSec: engine.trailSec(), ...proof, elementMuted: state.muted, elementVolume: state.volume, elementPlaybackRate: elementPlaybackRateOf(engine.element), ctxRate: null, ...rateStampOf(engine.rateWitness?.()) };
    }
    const sink = mediaSinkRef.current?.sink;
    if (sink) {
      return { sink: 'media-stream', paused: sink.element.paused, readyState: sink.element.readyState, ctxInChain: true, trailSec: null, ...proof, elementMuted: sink.element.muted, elementVolume: sink.element.volume, elementPlaybackRate: elementPlaybackRateOf(sink.element), ctxRate: playCtxRef.current?.sampleRate ?? null, ...rateStampOf(graphWitnessRef.current) };
    }
    return { sink: 'context', paused: true, readyState: 0, ctxInChain: true, trailSec: null, ...proof, elementMuted: null, elementVolume: null, elementPlaybackRate: null, ctxRate: playCtxRef.current?.sampleRate ?? null, ...rateStampOf(graphWitnessRef.current) };
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
  // The MediaStreamSource feeding micNodeRef (zero-input guard): the
  // recovery action re-feeds the EXISTING processor node from a
  // freshly acquired stream by swapping this source, so the capture
  // handler (and the live session) never has to be rebuilt.
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const generationRef = useRef(0);
  const startingRef = useRef(false);
  const previewDoneRef = useRef(false);
  const isPreviewRef = useRef(false);
  const aspenLineRef = useRef("");
  const userLineRef = useRef("");
  // End-signal close (2026-11-21, homepage-test item 1, client
  // half): endSignalRef latches when the assistant's line carries
  // END_CONVERSATION_SIGNAL (src/lib/endConversation.ts); the timer
  // is the pending post-farewell close, cancelled by any new
  // visitor speech (they changed their mind) or by teardown.
  const endSignalRef = useRef(false);
  const endSignalTimerRef = useRef<number | null>(null);
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
        // highlightEnd is part of the identity: streamed text can widen the
        // caption highlight window while text and word stay the same.
        return previous?.text === next?.text && previous?.word === next?.word && previous?.highlightEnd === next?.highlightEnd ? previous : next;
      });
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, []);
  const walkthroughRef = useRef({ text: '', continued: false });
  const homepageWalkthroughRef = useRef(false);
  const idleRef = useRef({ enabled: false, stage: 'waiting' as VoiceIdleStage, quietSince: 0, generating: false, requestedAt: 0, sales: false });
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
      const action = voiceIdleAction(idle.stage, idle.quietSince, Date.now(), idle.sales);
      if ((action === 'checkin' || action === 'bridge' || action === 'goodbye') && wsRef.current?.readyState === WebSocket.OPEN) {
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
        // The zero-input watchdog (below) is the stronger dead-mic
        // notice with the recovery action; while it is up, this
        // passive hint stands down rather than stacking a second box.
        recoveryActive: sessionRecoveringRef.current || swapBusyRef.current || micWatchdogRef.current,
      })) return;
      micHintLastRef.current = Date.now();
      showMicHintRef.current = true;
      setShowMicHint(true);
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  // CAN'T-HEAR FREEZE signal (2026-11-18 fix plan #6): while either
  // can't-hear notice (the passive hint above, or the zero-input
  // watchdog) is on screen, the proxy's silence ladder must not run
  // — the visitor is being told to check his mic; "are you still
  // there?" and a silence goodbye in the same minute is the exact
  // incoherence the owner's 2026-11-18 test hit. Mirror the combined
  // state on every change; the proxy keeps it per-session and the
  // state dies with the socket, so no clear-on-close is owed here.
  const cantHearNoticeShown = showMicHint || showMicWatchdog;
  useEffect(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'mic_notice', active: cantHearNoticeShown }));
    }
  }, [cantHearNoticeShown]);

  // Zero-input guard evaluator: twice a second, ask the pure helper
  // whether the mic path is dead (startup window, or a mid-session
  // stall after having flowed). Gate passes and input transcriptions
  // fold in as flow proof alongside the tracker's energy frames.
  // The notice clears the moment audio flows; a deliberate mute /
  // pause / mode change hides it and re-arms the guard for when
  // capture resumes. Fires even while the presenter is speaking —
  // the ef9986df monologue is exactly when the visitor needs it.
  useEffect(() => {
    const timer = window.setInterval(() => {
      const flow = micFlowRef.current;
      const sinceLive = (at: number) => (at > flow.liveSince ? at : 0);
      const firstFlowAt = flow.firstFlowAt || sinceLive(micGateHeardRef.current) || sinceLive(micTranscriptRef.current);
      const lastFlowAt = Math.max(flow.lastFlowAt, sinceLive(micGateHeardRef.current), sinceLive(micTranscriptRef.current));
      if (micWatchdogRef.current) {
        if (lastFlowAt > micWatchdogShownAtRef.current) {
          micWatchdogRef.current = false;
          setShowMicWatchdog(false);
        } else if (!liveRef.current || captureRef.current.muted || captureRef.current.paused || captureRef.current.mode !== "handsfree") {
          micWatchdogRef.current = false;
          flow.firedForStretch = false;
          setShowMicWatchdog(false);
        }
        return;
      }
      // Direct track evidence (Publish #56): a track the browser
      // reports muted/ended is a dead path whatever the levels say.
      const micTrack = micStreamRef.current?.getAudioTracks()[0];
      const trackDead = !!micTrack && (micTrack.readyState === "ended" || micTrack.muted);
      const watchdogDue = shouldShowMicWatchdog({
        now: Date.now(),
        live: liveRef.current && !isPreviewRef.current,
        handsFree: captureRef.current.mode === "handsfree",
        muted: captureRef.current.muted,
        paused: captureRef.current.paused,
        handoff: handoffRef.current,
        recoveryActive: sessionRecoveringRef.current || swapBusyRef.current,
        liveSince: flow.liveSince,
        firstFlowAt,
        lastFlowAt,
        lastAliveAt: flow.lastAliveAt,
        trackDead,
        firedForStretch: flow.firedForStretch,
      });
      // Silent-stream guard (chat-fix6): frames flow and the track
      // is live, but the level never rises off zero — Ron's wired
      // headset (session 3b30cc34: 956 frames, amb 0.0000, and
      // Aspen never told him). The dead-path guard above is blind
      // to it — dither ticks keep its alive tier warm and one
      // connect transient counts as its flow — so this sibling
      // watches the loud tier instead: surface the notice ~5s
      // after go-live, once more at ~15s if dismissed and still
      // silent, and stand down for good the moment real level
      // arrives. watchdogDue stands it down (the two notices
      // never stack), and nothing here touches playout.
      if (flow.liveSince !== silentLiveSinceRef.current) {
        silentLiveSinceRef.current = flow.liveSince;
        silentStageRef.current = 0;
        silentMicFiredRef.current = false;
        if (silentMicRef.current) { silentMicRef.current = false; setShowSilentMic(false); }
      }
      if (silentMicRef.current) {
        const resolved = flow.loudFrames >= MIC_SILENT_MIN_LOUD_FRAMES;
        if (resolved || !liveRef.current || captureRef.current.muted || captureRef.current.paused || captureRef.current.mode !== "handsfree") {
          silentMicRef.current = false;
          if (resolved) silentStageRef.current = 3;
          setShowSilentMic(false);
        }
      } else if (shouldShowSilentMicNotice({
        now: Date.now(),
        live: liveRef.current && !isPreviewRef.current,
        handsFree: captureRef.current.mode === "handsfree",
        muted: captureRef.current.muted,
        paused: captureRef.current.paused,
        handoff: handoffRef.current,
        recoveryActive: sessionRecoveringRef.current || swapBusyRef.current,
        liveSince: flow.liveSince,
        frames: flow.frames,
        loudFrames: flow.loudFrames,
        trackDead,
        watchdogActive: watchdogDue,
        silentStage: silentStageRef.current,
      })) {
        silentMicRef.current = true;
        silentStageRef.current += 1;
        silentMicFiredRef.current = true;
        setShowSilentMic(true);
        stampMicDiagRef.current("watchdog");
      }
      if (!watchdogDue) return;
      noteMicWatchdogFired(flow);
      micWatchdogRef.current = true;
      micWatchdogShownAtRef.current = Date.now();
      setShowMicWatchdog(true);
      stampMicDiagRef.current("watchdog");
    }, 500);
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
      setTurns((prev) => { const turn: Turn = { role, text, ...(speaker ? { speaker } : {}) }; if (!isPreviewRef.current) visitMemoryAppend(agentId || "homepage", turn); return [...prev, turn]; });
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
    const stored = visitMemoryGet(agentId || "homepage");
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
    setSwapConnecting(boundaryTargetFor(swapStateRef.current, boundary));
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
  // Playout telemetry (volume-stream fix, 2026-11-14): SimliAvatar
  // snapshots its audio graph at settle points; the snapshot lands
  // on the PARENT session row at config.playoutDiag (the row every
  // face of this session belongs to — solo presenter demos have no
  // swap-attempt row, so the swap channel can't carry this). Local
  // path state (media sink readiness, playback context state) is
  // folded into the detail line here, where it lives. Deduped by
  // signature: a state posts when it CHANGES, not per second.
  // Fire-and-forget — diagnostics never break the call.
  // DIAG LANDING FIX (Publish #54): parentSessionIdRef and
  // visitorKeyRef were the diag channel's ONLY target, and they
  // are assigned solely by
  // the swap-arming and team-intro branches of the authorization
  // below — classes a plain HOMEPAGE sales session never arms.
  // Homepage sessions therefore ran with both refs empty and
  // every playoutDiag/micDiag write early-returned for the whole
  // session (session 19b82691, 2026-11-14: 8m11s, zero stamps —
  // the wandering-voice test that could not be read back). The
  // diag channel now keeps its OWN target, stamped at EVERY
  // parent authorization; the swap parent still wins when one
  // exists (segment stamps keep landing on the parent row,
  // exactly as before). Telemetry only — the swap machine's
  // refs keep their exact prior semantics.
  const diagTargetRef = useRef<{ sessionId: string; visitorKey: string } | null>(null);
  const diagStampTarget = (): { sessionId: string; visitorKey: string } | null => {
    if (parentSessionIdRef.current) {
      return visitorKeyRef.current
        ? { sessionId: parentSessionIdRef.current, visitorKey: visitorKeyRef.current }
        : null;
    }
    return diagTargetRef.current;
  };
  // Rate witness (Publish #54) for the SINK GRAPH terminal: the
  // aggregate over this session's drained graph runs, plus the
  // currently open run (fed seconds accumulated per chunk; the
  // clock read at open/close from the sink element, or from the
  // context when no sink element renders the stream). The blob
  // engine keeps its own witness internally.
  const graphWitnessRef = useRef<RateWitnessState>(createRateWitness());
  const graphSegmentRef = useRef<{ fedSec: number; clockStart: number; clock: 'element' | 'ctx' } | null>(null);
  const lastPlayoutDiagRef = useRef('');
  const persistPlayoutDiag = useCallback((snapshot: PlayoutDiagSnapshot) => {
    const target = diagStampTarget();
    if (!target) return;
    const { sessionId, visitorKey } = target;
    const sink = mediaSinkRef.current?.sink;
    // A/B self-description (2026-11-18): every stamp names the heard
    // engine and the proxy host it ran against, so an A/B session
    // (?heardEngine= × ?voiceProxy=) is identifiable from its own
    // record without cross-referencing the device.
    const proxyHost = voiceProxyWsUrl().includes('voice-proxy.') ? 'vps' : 'edge';
    const extra = `;sink=${sink ? (sink.ready ? 'ready' : 'pending') : 'none'};pctx=${playCtxRef.current?.state ?? 'none'};cap=${captureModeStamp()};eng=${heardEngine()};proxy=${proxyHost}`;
    // The local terminal (volume-speaker fix): which sink the
    // heard voice physically ends in — media element, media
    // stream, or the bare context — rides on the snapshot itself.
    const payload = playoutDiagPayload(sessionId, { ...snapshot, terminal: localTerminalDiag() }, Date.now(), extra);
    const signature = playoutDiagSignature(payload);
    if (signature === lastPlayoutDiagRef.current) return;
    lastPlayoutDiagRef.current = signature;
    void (async () => {
      try {
        const headers = await voiceSessionHeaders();
        await supabase.functions.invoke('gemini-session', { headers, body: { visitorKey, playoutDiag: payload } });
      } catch { /* diagnostics never break the call */ }
    })();
  }, []);
  const handlePlayoutDiag = useCallback((snapshot: PlayoutDiagSnapshot) => { persistPlayoutDiag(snapshot); }, [persistPlayoutDiag]);
  // Conversation-owned stamping (reconnect-stamp fix, 2026-11-14):
  // the SimliAvatar settle-point emits above are NOT sufficient —
  // Ron's failing 238 s Martinez session was a RECONNECT: the face
  // stayed live across the socket restart, no settle point crossed,
  // and the new session row carried NO playoutDiag at all, leaving
  // the exact failure unverifiable. The conversation therefore
  // stamps from its OWN lifecycle: at go-live of every parent start
  // (first connect AND every reconnect/resume — goLive is their
  // common point) and again at the session's first locally-routed
  // chunk, when the heard terminal has settled. The snapshot is
  // pulled from the avatar handle when one answers (on a reconnect
  // it carries the real, already-live graph state); otherwise a
  // local fallback snapshot describes the local path on its own —
  // persistPlayoutDiag folds in the terminal/sink/capture extras
  // either way. Dedupe is session-scoped (see playoutDiagSignature),
  // so a new session's first stamp always lands.
  const diagChunkStampRef = useRef(false);
  const stampPlayoutDiag = useCallback(() => {
    const fromAvatar = mainSlotRef.current?.playoutSnapshot?.() ?? avatarRef.current?.playoutSnapshot?.();
    if (fromAvatar) { persistPlayoutDiag(fromAvatar); return; }
    const mode = pairedAudibleMode();
    persistPlayoutDiag({
      path: 'local',
      mode,
      engaged: false,
      ctxState: 'none',
      engageError: null,
      srcPaused: true,
      srcMuted: true,
      srcVolume: 0,
      track: 'absent',
      starve: mode === 'local' ? 'pending' : 'n/a',
      playoutPaused: true,
      gain: null,
    });
  }, [persistPlayoutDiag]);
  // Teardown reaches the playout end stamp through this mirror
  // (same pattern as stampMicDiagRef below).
  const stampPlayoutDiagRef = useRef(stampPlayoutDiag); stampPlayoutDiagRef.current = stampPlayoutDiag;
  // A/B TRACE (2026-11-18): while a session is live, re-stamp the
  // playout diag every 15 s. Signature dedupe means an unchanged
  // snapshot posts nothing; any counter movement (stalls, joins,
  // recoveries, terminal flips) lands as a time series on the
  // session row instead of the single point-in-time snapshot the
  // choppiness investigation had to work from — the evidence base
  // for the heard-engine × proxy-host A/B (?heardEngine= ×
  // ?voiceProxy=, both stamped into every payload's extras).
  useEffect(() => {
    const timer = window.setInterval(() => { if (liveRef.current) stampPlayoutDiagRef.current(); }, 15000);
    return () => window.clearInterval(timer);
  }, []);
  // Mic zero-input guard (2026-11-14): the INPUT mirror of the
  // playout stamp above. micDiag lands on the PARENT session row at
  // config.micDiag through the same gemini-session diag channel
  // (visitorKey + fire-and-forget invoke, signature-deduped), at
  // session start, when the watchdog fires, on recovery, and at
  // end — so a dead-mic session (ef9986df: 4m53s, zero input, no
  // mic state on the record) can never be undiagnosable again.
  const micTrackStamp = (): MicTrackState => {
    const track = micStreamRef.current?.getAudioTracks()[0];
    if (!track) return "none";
    if (track.readyState === "ended") return "ended";
    if (track.muted) return "muted";
    return "live";
  };
  const stampMicDiag = useCallback((event: MicDiagEvent) => {
    // Same diag target as the playout stamp (see diagStampTarget):
    // the mic channel shared the homepage landing gap exactly.
    const target = diagStampTarget();
    if (!target) return;
    const { sessionId, visitorKey } = target;
    // Snapshot the mic facts NOW: the end-of-call stamp runs while
    // teardown is about to stop the tracks, and the permission read
    // below is async.
    const flow = { ...micFlowRef.current };
    const track = micTrackStamp();
    const inputSec = micInputSeconds(flow.frames, micNodeRef.current?.bufferSize ?? 2048, micCtxRef.current?.sampleRate ?? 16000);
    void (async () => {
      let permission = "unknown";
      try {
        const status = await navigator.permissions?.query({ name: "microphone" as PermissionName });
        if (status?.state) permission = status.state;
      } catch { /* Permissions API unavailable — 'unknown' stands. */ }
      const payload = micDiagPayload(sessionId, micDiagStamp({ event, flow, permission, track, inputSec, ambientFloor: ambientTrackerRef.current.floor, noiseFilter: gateRelaxedRef.current ?? appliedNoiseFilter(noiseFilterManualRef.current, noiseFilterRef.current), silentMic: silentMicFiredRef.current, gateRelaxed: gateRelaxedRef.current ?? undefined }), Date.now());
      const signature = micDiagSignature(payload);
      if (signature === lastMicDiagRef.current) return;
      lastMicDiagRef.current = signature;
      try {
        const headers = await voiceSessionHeaders();
        await supabase.functions.invoke('gemini-session', { headers, body: { visitorKey, micDiag: payload } });
      } catch { /* diagnostics never break the call */ }
    })();
  }, []);
  // The watchdog evaluator interval is declared earlier in the body
  // than stampMicDiag; it reaches the stamp through this mirror
  // (same pattern as persistSwapDiagRef).
  const stampMicDiagRef = useRef(stampMicDiag); stampMicDiagRef.current = stampMicDiag;
  // Playout startup guard (chat-fix3): micDiag's sibling through the
  // same gemini-session diag channel, landing on the session row at
  // config.startupDiag. It records the startup window — engine
  // selected + why, context state and terminal element state at
  // first audio, whether the terminal clock advanced within 2 s,
  // and the blocked/healed verdicts — so a silent session explains
  // itself from the record. Fire-and-forget, signature-deduped —
  // diagnostics never break the call.
  const startupProbe = useCallback((): PlayoutProbe => {
    // The terminal carrying the voice RIGHT NOW, in the same
    // precedence localTerminalDiag uses: the element engine while
    // it carries the voice, else the media sink's element, else
    // the bare context. Read-only — the watch never drives the
    // terminal; only the pill's tap re-primes it.
    const engine = mediaElementRef.current;
    if (engine && mediaElementStateRef.current === 'ready' && !engine.failed) {
      return { clockSec: engine.element.currentTime, paused: engine.element.paused, muted: engine.element.muted, ctxState: playCtxRef.current?.state ?? 'none' };
    }
    const sinkElement = mediaSinkRef.current?.sink?.element;
    if (sinkElement) {
      return { clockSec: sinkElement.currentTime, paused: sinkElement.paused, muted: sinkElement.muted, ctxState: playCtxRef.current?.state ?? 'none' };
    }
    const ctx = playCtxRef.current;
    return { clockSec: ctx?.currentTime ?? null, paused: ctx ? ctx.state !== 'running' : true, muted: null, ctxState: ctx?.state ?? 'none' };
  }, []);
  const stampStartupDiag = useCallback((event: StartupDiagEvent, verdict?: StartupVerdict, advanced?: boolean | null) => {
    const target = diagStampTarget();
    const baseline = startupWatchRef.current.baseline;
    if (!target || !baseline) return;
    const { sessionId, visitorKey } = target;
    const payload = startupDiagPayload(sessionId, {
      event,
      engine: baseline.engine,
      why: baseline.why,
      terminal: baseline.terminal,
      ctxState: baseline.probe.ctxState,
      paused: baseline.probe.paused,
      muted: baseline.probe.muted,
      advanced: advanced ?? null,
      ...(verdict ? { verdict } : {}),
    }, Date.now());
    const signature = startupDiagSignature(payload);
    if (signature === lastStartupDiagRef.current) return;
    lastStartupDiagRef.current = signature;
    void (async () => {
      try {
        const headers = await voiceSessionHeaders();
        await supabase.functions.invoke('gemini-session', { headers, body: { visitorKey, startupDiag: payload } });
      } catch { /* diagnostics never break the call */ }
    })();
  }, []);
  const clearStartupTimers = useCallback(() => {
    startupTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    startupTimersRef.current = [];
  }, []);
  /** Arm the startup watch at the session's first locally-routed
   *  chunk: baseline the terminal, stamp 'first', and schedule the
   *  two checks — the pill decision at 1.5 s (audio delivered but
   *  not advancing in a gesture-fixable state) and the record's
   *  advance verdict at 2 s. A visitor pause is not a block: while
   *  playback is paused on purpose the pill never shows. Preview
   *  auditions never arm (their unlock is click-gated already). */
  const noteStartupFirstAudio = useCallback(() => {
    const watch = startupWatchRef.current;
    if (watch.armed || isPreviewRef.current) return;
    let stored: string | null = null;
    try { stored = window.localStorage.getItem(HEARD_ENGINE_STORAGE_KEY); } catch { /* private mode */ }
    watch.noteFirstAudio({
      atMs: Date.now(),
      engine: heardEngine(),
      why: heardEngineWhy(window.location.search, stored),
      terminal: localTerminalDiag().sink,
      probe: startupProbe(),
    });
    stampStartupDiag('first');
    const blockedTimer = window.setTimeout(() => {
      if (captureRef.current.paused) return;
      const verdict = watch.evaluate(startupProbe(), Date.now());
      if (verdict === 'blocked') {
        setSoundBlocked(true);
        stampStartupDiag('blocked', verdict, false);
      }
    }, STARTUP_BLOCKED_AFTER_MS);
    const checkTimer = window.setTimeout(() => {
      const probe = startupProbe();
      const verdict = watch.evaluate(probe, Date.now());
      stampStartupDiag('check', verdict, watch.advanced(probe));
      if (verdict === 'blocked' && !captureRef.current.paused) setSoundBlocked(true);
    }, STARTUP_CHECK_AFTER_MS);
    startupTimersRef.current = [blockedTimer, checkTimer];
  }, [stampStartupDiag, startupProbe]);
  /** Tap-for-sound (chat-fix3): the pill's tap IS the gesture the
   *  platform wanted — resume the playback context and re-request
   *  play() on the terminal element from inside it. Mute and level
   *  are the visitor's and stay untouched (the speaker path is
   *  locked). The pill hides once the terminal clock actually
   *  advances, and the 'healed' stamp lands with it; if the clock
   *  never moves, no heal is claimed and the engines' own stall
   *  ladder owns the session from there. */
  const primeSound = useCallback(() => {
    const ctx = playCtxRef.current;
    if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => { /* the poll below reads the result */ });
    const engine = mediaElementRef.current;
    if (engine && mediaElementStateRef.current === 'ready' && !engine.failed && engine.element.paused) {
      void engine.element.play().catch(() => { /* refused again — the pill stays */ });
    }
    const sinkElement = mediaSinkRef.current?.sink?.element;
    if (sinkElement?.paused) void sinkElement.play().catch(() => { /* refused again — the pill stays */ });
    const watch = startupWatchRef.current;
    let polls = 0;
    const poll = window.setInterval(() => {
      polls += 1;
      if (watch.advanced(startupProbe())) {
        window.clearInterval(poll);
        setSoundBlocked(false);
        stampStartupDiag('healed', 'advancing', true);
      } else if (polls >= 10) {
        window.clearInterval(poll);
      }
    }, 250);
  }, [stampStartupDiag, startupProbe]);
  // Acquisition-time track check (Publish #56): permission granted
  // is not a working mic — Publish #53's records showed the track
  // STARTING muted in 3 of 4 sessions, and those sessions then ran
  // "normally" on a dead path until the watchdog's startup window
  // (or the visitor) noticed. Every acquisition now runs the
  // verdict on its track: 'ended' surfaces the guard's notice (the
  // persistent alert + Reconnect path) at once; 'muted' earns the
  // short grace for the `unmute` event some devices fire a beat
  // after start, then surfaces the same way. A verdict that lands
  // before go-live is held in micStartDeadPendingRef and surfaced
  // by goLive itself, so the notice never flashes pre-session.
  const micStartWatchRef = useRef<{ timer: number; track: MediaStreamTrack; onUnmute: () => void } | null>(null);
  const micStartDeadPendingRef = useRef(false);
  const clearMicStartWatch = useCallback(() => {
    const watch = micStartWatchRef.current;
    if (!watch) return;
    window.clearTimeout(watch.timer);
    watch.track.removeEventListener("unmute", watch.onUnmute);
    micStartWatchRef.current = null;
  }, []);
  const surfaceDeadMicStart = useCallback(() => {
    if (!liveRef.current) { micStartDeadPendingRef.current = true; return; }
    noteMicWatchdogFired(micFlowRef.current);
    micWatchdogRef.current = true;
    micWatchdogShownAtRef.current = Date.now();
    setShowMicWatchdog(true);
    stampMicDiagRef.current("watchdog");
  }, []);
  const watchAcquiredMicStream = useCallback((stream: MediaStream | null) => {
    clearMicStartWatch();
    const track = stream?.getAudioTracks()[0];
    if (!stream || !track) return;
    const verdict = micTrackStartVerdict(track);
    if (verdict === "ok" || verdict === "none") return;
    if (verdict === "ended") {
      if (micStreamRef.current === stream) surfaceDeadMicStart();
      return;
    }
    // 'muted': grace for the transient start-muted, then surface.
    const onUnmute = () => clearMicStartWatch();
    track.addEventListener("unmute", onUnmute);
    const timer = window.setTimeout(() => {
      clearMicStartWatch();
      if (micStreamRef.current !== stream) return; // superseded by a newer stream
      if (micTrackStartVerdict(track) === "ok") return; // unlocked on its own
      surfaceDeadMicStart();
    }, MIC_MUTED_START_GRACE_MS);
    micStartWatchRef.current = { timer, track, onUnmute };
  }, [clearMicStartWatch, surfaceDeadMicStart]);
  // goLive / goLiveSegment call this right after the flow window
  // opens: a dead-start verdict held from acquisition surfaces now
  // that the session is live (and stamps, like any watchdog fire).
  const surfacePendingDeadMicStart = useCallback(() => {
    if (!micStartDeadPendingRef.current) return;
    micStartDeadPendingRef.current = false;
    // Re-verify against the track that actually went live.
    if (micTrackStartVerdict(micStreamRef.current?.getAudioTracks()[0]) === "ok") return;
    noteMicWatchdogFired(micFlowRef.current);
    micWatchdogRef.current = true;
    micWatchdogShownAtRef.current = Date.now();
    setShowMicWatchdog(true);
    stampMicDiagRef.current("watchdog");
  }, []);
  // Handoff-leg recovery (2026-11-14): the handoffDiag stamp —
  // micDiag's sibling through the same gemini-session diag channel,
  // landing on the session row at config.handoffDiag. It records
  // the leg's lifecycle (announced → leg started → ended /
  // interrupted → return-ok / return-failed + the mic state), so
  // whether the manager's phone rang, connected, or the return
  // even started is readable from the record. Fired ONLY around
  // an actual handoff: sessions without one never stamp, keeping
  // their records byte-identical. Fire-and-forget, deduped by
  // signature — diagnostics never break the call.
  const stampHandoffDiag = useCallback((event: HandoffDiagEvent, outcome: HandoffDiagOutcome, mic: HandoffDiagMic) => {
    const target = diagStampTarget();
    if (!target) return;
    const { sessionId, visitorKey } = target;
    const payload = handoffDiagPayload(sessionId, { event, outcome, mic }, Date.now());
    const signature = handoffDiagSignature(payload);
    if (signature === lastHandoffDiagRef.current) return;
    lastHandoffDiagRef.current = signature;
    void (async () => {
      try {
        const headers = await voiceSessionHeaders();
        await supabase.functions.invoke('gemini-session', { headers, body: { visitorKey, handoffDiag: payload } });
      } catch { /* diagnostics never break the call */ }
    })();
  }, []);
  // Teardown reaches the interrupted stamp through this mirror
  // (same pattern as stampMicDiagRef above).
  const stampHandoffDiagRef = useRef(stampHandoffDiag); stampHandoffDiagRef.current = stampHandoffDiag;
  // The mic state for a handoff stamp, in the stamp's vocabulary:
  // the live track's own state, read at stamp time.
  const handoffMicState = (): HandoffDiagMic => {
    const track = micTrackStamp();
    return track === "live" ? "live" : track === "muted" ? "muted" : track === "ended" ? "ended" : "none";
  };
  // Capture the announcement Aspen just spoke, so a later return
  // session's recap can be built without it. The announcement is
  // the model's last assistant line when the dial is signalled
  // (the policy is say-it-once-then-stop); the in-flight line is
  // the fallback while the turn is still completing. Only a line
  // carrying the announcement's invariant opening is captured —
  // anything else leaves a previous capture untouched.
  const noteHandoffAnnouncement = useCallback(() => {
    const stored = visitMemoryGet(agentId || "homepage");
    for (let i = stored.length - 1; i >= 0; i--) {
      if (stored[i].role !== "assistant") continue;
      if (isHandoffAnnouncement(stored[i].text)) { handoffAnnouncementRef.current = stored[i].text; return; }
      break; // the last assistant line is an older, completed one — the announcement may still be in flight below
    }
    if (isHandoffAnnouncement(aspenLineRef.current)) handoffAnnouncementRef.current = aspenLineRef.current.trim();
  }, [agentId]);
  // One-tap microphone recovery (zero-input guard): re-request /
  // re-acquire the mic from inside the visitor's tap (so a revoked
  // permission can re-prompt), swap the stream under the EXISTING
  // capture node — the session, socket and conversation are
  // untouched — and restart the flow window so the watchdog
  // re-checks the new path and re-fires if it is dead too.
  const recoverMicrophone = useCallback(async () => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: microphone === "default" ? undefined : { exact: microphone }, echoCancellation: true, noiseSuppression: true, autoGainControl: microphoneAutoGain(captureMode, noiseFilterRef.current) },
      });
    } catch {
      // Denied again or no device: the notice stays up (its text
      // already tells the visitor to allow access); stamp the
      // attempt so the record shows recovery was tried.
      stampMicDiag("recovered");
      return;
    }
    // Stamp the path that failed BEFORE the swap replaces it.
    stampMicDiag("recovered");
    const previous = micStreamRef.current;
    micStreamRef.current = stream;
    // The replacement track gets the same start verdict as any
    // acquisition: a recovery that lands on another muted/ended
    // track surfaces again instead of going silent.
    watchAcquiredMicStream(stream);
    previous?.getTracks().forEach((t) => t.stop());
    const micCtx = micCtxRef.current;
    if (micCtx) {
      void micCtx.resume();
      if (micNodeRef.current) {
        try { micSourceRef.current?.disconnect(); } catch { /* already gone */ }
        const source = micCtx.createMediaStreamSource(stream);
        micSourceRef.current = source;
        source.connect(micNodeRef.current);
      }
    }
    // The media-element engine runs its track raw (no echo
    // cancellation); a fresh track starts from the browser default.
    if (captureRawRef.current) {
      void stream.getAudioTracks()[0]?.applyConstraints({ echoCancellation: false }).catch(() => { /* best effort */ });
    }
    void refreshMicrophones();
    noteMicSessionLive(micFlowRef.current, Date.now());
  }, [microphone, captureMode, refreshMicrophones, stampMicDiag, watchAcquiredMicStream]);
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
        PERSONAS[boundaryTargetFor(swapStateRef.current, boundary)].displayName,
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
    // entered from the intro-alex phase in place. summon-aspen is the
    // same shape: an Aspen segment entered from the simulation phase,
    // whose PHASE_ENTRY value is the step-out's.
    // Presenter chain (Alex handoff fix, 2026-11-14): Alex's 'return'
    // on a presenter chain lands back on the PRESENTER — boundaryTargetFor
    // carries that; every other chain keeps 'aspen' here.
    const persona = boundary === 'return' ? boundaryTargetFor(state, boundary) : boundary === 'intro-return-2' || boundary === 'summon-aspen' ? 'aspen' as PersonaId : target?.persona;
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
    if (swapChainClassRef.current === 'intro' || swapChainClassRef.current === 'presenter' || swapStateRef.current.done.includes('doorway')) return;
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
    // Zero-input guard: the micDiag END stamp runs first — it needs
    // the parent session id (nulled below), the still-live track
    // state, and the flow totals the session accumulated.
    if (micFlowRef.current.liveSince > 0) stampMicDiagRef.current("end");
    // Playout END stamp (Publish #54): the session's FINAL diag —
    // the settled terminal, the actual rates and the completed
    // rate-witness aggregate — lands before the diag target is
    // cleared below, so every session type's record ends with a
    // readable playout line, not just its last settle point. An
    // open graph witness run is discarded, never noted: its
    // audio was cut off, so its clock proves nothing.
    graphSegmentRef.current = null;
    if (parentSessionIdRef.current || diagTargetRef.current) stampPlayoutDiagRef.current();
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
    diagTargetRef.current = null;
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
    parentFacePendingRef.current = false;
    faceTakeoverBusyRef.current = false;
    attemptSessionRef.current = {};
    walkthroughRef.current = {text:'', continued:false};
    idleRef.current = { enabled: false, stage: 'waiting', quietSince: 0, generating: false, requestedAt: 0, sales: false };
    // A pending end-signal close dies with the session it belonged to.
    endSignalRef.current = false;
    if (endSignalTimerRef.current !== null) { window.clearTimeout(endSignalTimerRef.current); endSignalTimerRef.current = null; }
    trackPendingAction(null);
    setWaitingAction(null);
    deadlineRef.current = 0;
    setRemainingSeconds(null);
    // Handoff-leg recovery (2026-11-14): a teardown that lands
    // MID-LEG (a socket drop while the visitor is on — or waiting
    // for — the manager call) must not kill the return path. The
    // leg's outcome was never reported, so the record says
    // 'interrupted', and the pre-handoff mic stream is RETAINED
    // instead of stopped (its capture node is disconnected below
    // as usual; nothing sends from it) for the return start to
    // adopt — tonight's Round B return died re-asking the browser
    // for a microphone while a still-live stream existed. A
    // teardown after a completed leg (handoffRef already false)
    // retains nothing and stamps nothing.
    const micRetainedForReturn = handoffRef.current ? micStreamRef.current : null;
    if (handoffRef.current) {
      stampHandoffDiagRef.current("interrupted", "unknown", handoffMicState());
      if (micRetainedForReturn) retainHandoffMic(micRetainedForReturn);
    }
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
    micSourceRef.current = null;
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
    for (const timer of engineTimersRef.current) clearTimeout(timer);
    engineTimersRef.current.clear();
    mediaElementRef.current?.dispose();
    mediaElementRef.current = null;
    mediaElementStateRef.current = 'idle';
    // Round 4: held chunks belong to the dead session — clear
    // the queue, its deadline timer and the release latch so the
    // next start's hold begins empty.
    engineHoldRef.current = [];
    engineHoldSecRef.current = 0;
    engineHoldReleasedRef.current = false;
    if (engineHoldTimerRef.current !== null) { window.clearTimeout(engineHoldTimerRef.current); engineHoldTimerRef.current = null; }
    mediaElementFailureRef.current = null;
    // Publish #62: the recovery guard's budget and counter carry
    // belong to one conversation's engines — a fresh conversation
    // starts with a full re-arm budget and zeroed totals, exactly
    // as the engine state above resets to idle.
    engineCarryRef.current = { stalls: 0, recoveries: 0 };
    engineRearmRef.current = { attempts: 0, pending: false };
    captureRawRef.current = false;
    showMicHintRef.current = false;
    setShowMicHint(false);
    micWatchdogRef.current = false;
    setShowMicWatchdog(false);
    // Playout startup guard (chat-fix3): no startup timer or pill
    // may outlive the conversation that armed it.
    startupWatchRef.current.reset();
    clearStartupTimers();
    setSoundBlocked(false);
    clearMicStartWatch();
    micStartDeadPendingRef.current = false;
    micFlowRef.current = createMicFlowState();
    micAwaitRef.current = null;
    // Handoff-leg recovery: the stream retained above keeps its
    // tracks — the return start adopts it (see startConversation).
    if (micStreamRef.current && micStreamRef.current !== micRetainedForReturn) micStreamRef.current.getTracks().forEach((t) => t.stop());
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
  }, [flushLine, agentId, clearMicStartWatch]);

  /** PARTIAL teardown for a persona cut-over (spec §5.4): closes ONLY the
   * current voice socket (no end_session — the server treats it like the
   * suspend path's drop) and resets per-connection capture state, while
   * the mic stream, both AudioContexts, the caption clock and playback
   * state all survive for the incoming segment. */
  const partialTeardownForSwap = useCallback(() => {
    walkthroughRef.current = {text:'', continued:false};
    idleRef.current = { enabled: false, stage: 'waiting', quietSince: 0, generating: false, requestedAt: 0, sales: false };
    // Publish #68: the card (and its waiting chip) belonged to the
    // socket being torn down — the successor session re-issues from
    // the durable captured facts if the visitor asks, never from a
    // chip pointing at a dead session's form.
    trackPendingAction(null);
    setWaitingAction(null);
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
    micSourceRef.current = null;
    try { wsRef.current?.close() } catch { /* ignore */ }
    wsRef.current = null;
    flushLine("user");
    flushLine("assistant");
    setAspenSpeaking(false);
  }, [flushLine]);

  const stopEverything = useCallback(() => teardown(true), [teardown]);

  const endByVisitor = useCallback(() => {
    stopEverything();
    // Handoff-leg recovery: a DELIBERATE end drops any mic stream
    // the teardown retained for a return — the visitor ended the
    // conversation, so the microphone must not stay hot for a
    // return they never asked for.
    clearRetainedHandoffMic();
    setError(null);
    setAudioNeedsTap(false);
    setEndedByVisitor(true);
  }, [stopEverything]);

  /** End-signal close (2026-11-21, homepage-test item 1, client
   *  half — src/lib/endConversation.ts): the assistant's completed
   *  line carried END_CONVERSATION_SIGNAL, i.e. the visitor asked
   *  for the end and she has said her farewell. Close as soon as
   *  the farewell's audio drains, and never later than
   *  END_SIGNAL_MAX_WAIT_MS after the turn — a requested end must
   *  not fall back into the ~60 s silence ladder (her goodbye used
   *  to RESET the silence clock, so the ladder ran in full). The
   *  end itself is endByVisitor: a model-signalled end IS a
   *  visitor-requested end. */
  const closeOnEndSignal = useCallback(() => {
    if (endSignalTimerRef.current !== null) return;
    const deadline = Date.now() + END_SIGNAL_MAX_WAIT_MS;
    const tick = () => {
      endSignalTimerRef.current = null;
      if (!endSignalRef.current || !liveRef.current) return;
      const drained = sourcesRef.current.size === 0 && !idleRef.current.generating;
      if (drained || Date.now() >= deadline) { endSignalRef.current = false; endByVisitor(); return; }
      endSignalTimerRef.current = window.setTimeout(tick, END_SIGNAL_DRAIN_POLL_MS);
    };
    endSignalTimerRef.current = window.setTimeout(tick, END_SIGNAL_DRAIN_POLL_MS);
  }, [endByVisitor]);

  /** A visitor who speaks again after asking for the end changed
   *  their mind: drop the latched signal and any pending close. */
  const cancelEndSignalClose = useCallback(() => {
    endSignalRef.current = false;
    if (endSignalTimerRef.current !== null) { window.clearTimeout(endSignalTimerRef.current); endSignalTimerRef.current = null; }
  }, []);

  /** START OVER (Ron, 2026-11-16): end whatever is live, wipe the
   * visit's memory (see resetVisitForNewVisitor) and put the panel
   * back to its first-visit state, so the next Start is a stranger's
   * greeting — no resume offer, no recap, no carried-over persona. */
  const restartAsNewVisitor = useCallback(() => {
    stopEverything();
    clearRetainedHandoffMic();
    resetVisitForNewVisitor();
    handoffAnnouncementRef.current = null;
    handoffReturnRef.current = null;
    setTurns([]);
    setPartialUser("");
    setPartialAspen("");
    setError(null);
    setAudioNeedsTap(false);
    setLimitReached(false);
    setEndedByVisitor(false);
    setStatus(t("panel.initialStatus"));
  }, [stopEverything, t]);

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
    // key, business name) BEFORE authorising. A presenter chain resumes
    // as its own class (Alex handoff fix, 2026-11-14) so the doorway
    // trigger stays off for it after the resume too.
    swapEnabledRef.current = true;
    swapChainClassRef.current = stash.state.presenter ? 'presenter' : 'simulation';
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
        const sync = cutoverAudioSync({ speakerMuted: speakerMutedRef.current, paused: captureRef.current.paused, replaying: captureRef.current.replaying, selectedDeviceId: selectedOutputIdRef.current, speakerVolume: playbackVolumeRef.current });
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
    // ROUND-4 ENGINE-FIRST HOLD (volume round 4, 2026-11-14):
    // while the media-element engine is still starting, a LOCAL
    // chunk waits for it instead of playing through the
    // MediaStream sink — on Publish #51 the sink was the only
    // terminal Ron's phone ever stamped, because the engine's
    // start never settled and every chunk took the graph. The
    // hold covers the whole chunk (Simli feed included) so the
    // face and the voice shift together and the +0.4 s lip
    // relationship is untouched. Stream mode never holds (its
    // local branch is a silent clock), a paused session never
    // holds, and the hold self-releases on the engine settling,
    // on its deadline, or at its size cap (see holdChunkForEngine).
    if (!engineHoldReleasedRef.current && !captureRef.current.paused
      && pairedAudibleMode() !== 'stream' && heardEngine() !== 'sink'
      && mediaElementStateRef.current === 'starting') {
      holdChunkForEngine(base64, reserved);
      return;
    }
    const captionRun = reserved ?? captionClockRef.current.reserve();
    if (!playCtxRef.current) {
      playCtxRef.current = new AudioContext({ sampleRate: 24000 });
      playTimeRef.current = 0;
    }
    const ctx = playCtxRef.current;
    if (ctx.state === "suspended" && !captureRef.current.paused) void ctx.resume().catch(() => setError(t("panel.audioPaused")));
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const samples = new Int16Array(bytes.buffer);

    // AUDIO-PATH SLIM (2026-11-20): write samples straight into the audio
    // buffer's channel — the old code built an intermediate Float32Array
    // and copied it a second time, per chunk, on the main thread.
    const buffer = ctx.createBuffer(1, samples.length, 24000);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) channel[i] = samples[i] / 32768;
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
    const facePending = segmentFacePendingRef.current != null || parentFacePendingRef.current;
    const output = facePending ? 'local' as const : assistantOutput(avatarRequestedRef.current, avatarLiveRef.current, captureRef.current.replaying);
    let pairedVideo = output !== 'local';
    // LOCAL-FIRST PAIRED PLAYOUT (volume-stream fix, 2026-11-14):
    // in 'local' mode a paired chunk is ALSO played through the
    // local branch below — the media-sink graph the voice-only path
    // proved media-classified on Android — while Simli still
    // receives the chunk for lip-sync and its returned stream stays
    // muted + unsubscribed (SimliAvatar streamAudio='muted'). The
    // audible schedule is shifted by the paired delay so the voice
    // lands on the lips; captions ride the schedule unshifted.
    let pairedLocal = false;
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
      } else if (pairedAudibleMode() === 'local') {
        pairedLocal = true;
      } else {
        // Use a silent local clock for captions/lifecycle, never a second audible voice.
        const clockGain = ctx.createGain(); clockGain.gain.value = 0;
        source.connect(clockGain); clockGain.connect(ctx.destination);
      }
    }
    const now = ctx.currentTime;
    // Simli renders lips slightly behind the audio it receives; delay the start of each spoken run to match.
    // Local-first paired chunks carry that shift in their audible
    // schedule (voiceChunkStartAt applies it at a drained queue; a
    // running queue chains from the already-shifted playTimeRef).
    const startAt = voiceChunkStartAt(now, playTimeRef.current, pairedLocal ? PAIRED_CAPTION_DELAY_SEC : 0);
    // MEDIA-ELEMENT ENGINE (volume-speaker fix, 2026-11-14;
    // Publish #54 re-point): a local chunk is offered FIRST to the
    // heard-element engine — since #54 the blob/file engine by
    // default (a plain media element playing whole WebM files;
    // the MSE engine behind ?heardEngine=element) — the route
    // whose hardware-key behaviour is proven on Ron's phone. The
    // engine accepts only once ready; every chunk it refuses
    // (engine starting, unsupported platform, engine failed) plays
    // through the media-sink graph below, exactly as in Publish
    // #48, so no chunk is ever lost to the switch. For a paired
    // chunk the +0.4 s lip offset lives in the engine's trail
    // target instead of this schedule (the engine plays from
    // arrival, not from startAt); the schedule still advances
    // identically, so captions, lifecycle and a mid-session
    // fallback to the graph all stay on one clock.
    let engineRouted = false;
    if (!pairedVideo || pairedLocal) {
      // Playout startup guard (chat-fix3): the first chunk this
      // session routes locally arms the startup watch — baseline,
      // 'first' stamp, and the 1.5 s / 2 s checks (see
      // noteStartupFirstAudio). Later chunks no-op.
      noteStartupFirstAudio();
      const engine = ensureMediaElement();
      if (engine && mediaElementStateRef.current === 'ready' && !captureRef.current.paused) {
        const trailTarget = pairedLocal ? Math.max(0.05, PAIRED_CAPTION_DELAY_SEC - MEDIA_ELEMENT_PIPELINE_SEC) : 0.1;
        engineRouted = engine.enqueuePcm16(samples, trailTarget);
      }
      if (!engineRouted) {
        const spkGain = ctx.createGain();
        spkGain.gain.value = effectivePlaybackLevel(speakerMutedRef.current, playbackVolumeRef.current);
        speakerGainRef.current = spkGain;
        source.connect(spkGain);
        // Media-routed output (see lib/mediaSink.ts): through the audio
        // element once unlocked, so the device's hardware media volume
        // governs her voice; ctx.destination until the element plays.
        spkGain.connect(mediaOutputNode(ctx));
        // Rate witness (Publish #54): this chunk is HEARD through
        // the sink graph — open a witness run if none is open and
        // feed it the chunk's scheduled duration. The run's clock
        // is the sink element's playhead when the element renders
        // the stream, else the context's own clock; the run closes
        // when the graph drains (noteChunkEnded below).
        if (!graphSegmentRef.current) {
          const sinkElement = mediaSinkRef.current?.sink?.element;
          graphSegmentRef.current = sinkElement
            ? { fedSec: 0, clockStart: sinkElement.currentTime, clock: 'element' }
            : { fedSec: 0, clockStart: ctx.currentTime, clock: 'ctx' };
        }
        graphSegmentRef.current.fedSec += buffer.duration;
      }
      // Reconnect-stamp fix: the session's first locally-routed
      // chunk stamps the SETTLED heard terminal (engine vs sink vs
      // context) onto the session row.
      if (!diagChunkStampRef.current) {
        diagChunkStampRef.current = true;
        stampPlayoutDiag();
      }
    }
    // TAKEOVER RE-SYNC LEDGER (2026-11-20): a chunk committed to
    // the schedule while a face attach is pending is voice already
    // ahead of the (absent) face — the takeover consults this
    // count to decide its re-sync. Counted HERE, at the schedule
    // commit, so an engine-held chunk counts exactly once (when it
    // is released and actually scheduled), never on arrival.
    if (facePending) voiceFirstLocalChunksRef.current += 1;
    playTimeRef.current = startAt + buffer.duration;
    // On the stream path the visitor hears Simli's stream, not this
    // local schedule; shift the caption window by the paired-path
    // delay so the word highlight tracks the heard voice (see
    // PAIRED_CAPTION_DELAY_SEC). Local playback — including
    // local-first paired chunks, whose schedule already carries the
    // shift — stays on the schedule clock, which is when the voice
    // is really heard. Engine-routed chunks are heard later than
    // the schedule by the engine's trail + pipeline, so their
    // caption window shifts by that measured delay instead.
    // The engines' trail now includes the 2026-11-20 playout
    // cushion (PLAYOUT_CUSHION_SEC of sealed-ahead reserve).
    // The reserve does not move the heard timeline — playback is
    // anchored by the segment chain — so the caption window and
    // the chunk-end timers below stay on the pre-cushion delay:
    // subtract the cushion back out of the measured trail. (The
    // session diag keeps stamping the honest, cushioned trail.)
    const engineDelay = engineRouted ? Math.max(0, (mediaElementRef.current?.trailSec() ?? 0) - PLAYOUT_CUSHION_SEC) + (mediaElementRef.current?.pipelineSec ?? MEDIA_ELEMENT_PIPELINE_SEC) : 0;
    const captionDelay = pairedCaptionDelaySec(pairedVideo, pairedAudibleMode());
    captionClockRef.current.audio(startAt + captionDelay + engineDelay, playTimeRef.current + captionDelay + engineDelay, captionRun);
    setAspenSpeaking(true);
    // End-of-chunk bookkeeping, shared by the graph route (the
    // buffer source's onended) and the engine route (a timer at
    // the heard end — engine chunks have no buffer source). The
    // drain checks consider BOTH queues: a replay or a preview
    // ends only when nothing is left to hear on either route.
    const noteChunkEnded = () => {
      // Rate witness (Publish #54): the graph has drained — the
      // open run's utterance is complete. Note fed vs the run
      // clock's advance and stamp the fresh aggregate onto the
      // session row while the terminal state is settled.
      if (sourcesRef.current.size === 0 && graphSegmentRef.current) {
        const run = graphSegmentRef.current;
        graphSegmentRef.current = null;
        const clockEnd = run.clock === 'element'
          ? (mediaSinkRef.current?.sink?.element?.currentTime ?? Number.NaN)
          : ctx.currentTime;
        if (noteRateUtterance(graphWitnessRef.current, run.fedSec, clockEnd - run.clockStart) !== null) {
          stampPlayoutDiag();
        }
      }
      if (ctx.currentTime >= playTimeRef.current - 0.05) setAspenSpeaking(false);
      if (sourcesRef.current.size === 0 && engineTimersRef.current.size === 0 && captureRef.current.replaying) {
        captureRef.current.replaying = false;
        setReplaying(false);
        avatarRef.current?.setPlaybackMuted(speakerMutedRef.current || captureRef.current.paused);
      }
      if (isPreviewRef.current && previewDoneRef.current && sourcesRef.current.size === 0 && engineTimersRef.current.size === 0) stopEverything();
    };
    if (engineRouted) {
      const timer = setTimeout(() => {
        engineTimersRef.current.delete(timer);
        noteChunkEnded();
      }, Math.max(0, (playTimeRef.current + engineDelay - ctx.currentTime) * 1000));
      engineTimersRef.current.add(timer);
    } else {
      sourcesRef.current.add(source);
      source.start(startAt);
      source.onended = () => {
        sourcesRef.current.delete(source);
        noteChunkEnded();
      };
    }
  }, [stopEverything, engageVideoFallback, holdChunkForEngine, noteStartupFirstAudio]);
  playPcmChunkRef.current = playPcmChunk;

  // Interrupt: drop all queued playback instantly
  const clearPlayback = useCallback(() => {
    captureRef.current.replaying = false;
    setReplaying(false);
    // Rate witness: an interrupted graph run is discarded, never
    // noted — its audio was cut off, so its clock proves nothing.
    graphSegmentRef.current = null;
    for (const source of sourcesRef.current) { try { source.stop(); } catch { /* Already stopped. */ } }
    sourcesRef.current.clear();
    // Engine route: drop held/buffered audio and its end timers.
    for (const timer of engineTimersRef.current) clearTimeout(timer);
    engineTimersRef.current.clear();
    mediaElementRef.current?.flush();
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
      mediaElementRef.current?.setPaused(false);
      avatarRef.current?.setPlaybackMuted(speakerMutedRef.current);
    } else {
      pauseCapture();
      clearPlayback();
      captureRef.current.paused = true;
      setPaused(true);
      void playCtxRef.current?.suspend().catch(() => {});
      mediaElementRef.current?.setPaused(true);
      avatarRef.current?.setPlaybackMuted(true);
    }
  }, [pauseCapture, clearPlayback]);

  // In-panel speaker volume: apply the visitor's level to every audible
  // sink this session owns — the local speaker gain (voice-only/replay
  // path) and each Simli face instance's element (paired path), active,
  // pre-staged and main slot alike, so a persona who takes over mid-call
  // speaks at the chosen level too. The cut-over sync also carries the
  // level for instances that (re)start later.
  const applyPlaybackVolume = useCallback((volume: number) => {
    const level = clampPlaybackVolume(volume);
    playbackVolumeRef.current = level;
    setPlaybackVolume(level);
    savePlaybackVolume(level);
    if (speakerGainRef.current) speakerGainRef.current.gain.value = effectivePlaybackLevel(speakerMutedRef.current, level);
    // Media-element engine: the slider drives the element's own
    // volume property — the media-player control surface.
    mediaElementRef.current?.setLevel({ muted: speakerMutedRef.current, volume: level });
    avatarRef.current?.setPlaybackVolume?.(level);
    stagedAvatarRef.current?.setPlaybackVolume?.(level);
    mainSlotRef.current?.setPlaybackVolume?.(level);
  }, []);

  // Silence speaker: mute all voice audio while keeping live captions and conversation running.
  const toggleSpeakerMute = useCallback(() => {
    const next = !speakerMutedRef.current;
    speakerMutedRef.current = next;
    setSpeakerMuted(next);
    if (speakerGainRef.current) speakerGainRef.current.gain.value = effectivePlaybackLevel(next, playbackVolumeRef.current);
    // Media-element engine: the mute silences the element itself.
    mediaElementRef.current?.setLevel({ muted: next, volume: playbackVolumeRef.current });
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
    const engineElement = mediaElementRef.current?.element;
    if (engineElement && await applySinkIdToElement(engineElement, deviceId)) applied = true;
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
    if (!preview && !warm && warmRef.current) {
      // STALE-PREWARM GUARD (2026-11-21): a held, never-begun
      // connection dies silently within ~150 s (proven server-side
      // 2026-11-20) and the browser socket can sit half-open through
      // the death — no close event, readyState still OPEN — so the
      // tap must not trust the warm session on existence alone. If
      // its socket is gone or it became ready too long ago, tear the
      // warm attempt down and fall through to a normal cold start
      // below; the visitor's tap just works. A fresh, live warm
      // session activates exactly as before (see lib/warmSession).
      const warmStale = !warmRef.current.activated && warmSessionUnusable({
        activated: warmRef.current.activated,
        readyAt: warmRef.current.readyAt,
        socketReadyState: warmRef.current.socket ? warmRef.current.socket.readyState : null,
      }, Date.now());
      // LANGUAGE GUARD (2026-11-18, Ron's French live test): the held
      // session was authorized at prewarm time, in the language picked
      // at that moment. If the visitor has since changed the site
      // language, activating it would run the whole session — greeting,
      // narration, captions — in the OLD language while the page shows
      // the new one. Discard the stale-language prewarm and fall
      // through to a fresh authorization in the current language. A
      // session already activated is a live conversation, never
      // discarded here: mid-session switches stay with the explicit
      // spoken-request tool, as before.
      if (warmStale) {
        stopEverything();
      } else if (!warmRef.current.activated && prewarmLocaleMismatch(warmLocaleRef.current, explicitUiLocale())) {
        stopEverything();
      } else { await activateWarmRef.current(); return; }
    }
    const reconnecting = reconnectRef.current.pending; reconnectRef.current.pending = false;
    if (!reconnecting) reconnectRef.current.count = 0;
    if (startingRef.current || liveRef.current) return;
    if (!preview && !warm && !consentReadyRef.current) { setConsentReady(false); return; }
    startingRef.current = true;
    let resolveWarm: (ok: boolean) => void = () => {};
    if (warm) warmRef.current = { ready: new Promise<boolean>(r => { resolveWarm = r; }), ok: false, activated: false, readyAt: null, socket: null };
    const warmState = warmRef.current;
    // Before the tap, failures stay invisible and the tap falls back to a normal start.
    const silentWarm = () => warm && !!warmState && !warmState.activated;
    const failWarm = () => { resolveWarm(false); stopEverything(); setError(null); setStatus("Press Start to talk."); onPrewarmedRef.current?.(false); };
    clearPlayback();
    const generation = ++generationRef.current;
    captureRef.current = { mode: captureMode, held: false, muted: false, replaying: false, paused: false };
    micAwaitRef.current = null;
    gateRelaxedRef.current = null;
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
    // Handoff-leg recovery (2026-11-14): after a manager handoff,
    // the recap is built WITHOUT the transfer announcement (it was
    // said once, word for word; a return session that re-speaks it
    // as its opening was tonight's Round A defect) and carries a
    // [visit fact] line recording that the transfer already
    // happened and how the leg ended. Publish #63: the combined
    // context fits under gemini-session's 16,000-char resumeContext
    // cap (the recap itself caps at 14,000), and fitHandoffRecap
    // trims whole lines from the recap's MIDDLE if it ever does
    // not — the old 1,600 budget tail-sliced the recap, cutting
    // the conversation's opening (the visitor's name, the first
    // criteria) out of the return session's memory. Visits with no
    // handoff build the recap exactly as before.
    const memoryTurns = visitMemoryGet(agentId || "homepage");
    const recapTurns = handoffAnnouncementRef.current ? stripHandoffAnnouncement(memoryTurns, handoffAnnouncementRef.current) : memoryTurns;
    let resumeContext = preview ? undefined : resumeRecap(recapTurns);
    if (!preview && resumeContext && handoffReturnRef.current) {
      const fact = handoffVisitFact(handoffReturnRef.current.outcome);
      resumeContext = fitHandoffRecap(resumeContext, fact);
    }
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
        setError(t("panel.startTimeout"));
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
      // Prime the media-element engine in the same gesture, so its
      // element is unlocked and ready before the first chunk lands
      // (chunks route to the sink graph until it reports ready).
      ensureMediaElement();
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
      const faceReady: Promise<FaceStartOutcome> = avatarRequestedRef.current
        ? startFace(generation, warm).then(
            (ok) => ({ started: ok, fallback: false }),
            (err: unknown) => {
              if (isVideoStartFailure(err)) return { started: false, fallback: true };
              throw err;
            },
          )
        : Promise.resolve({ started: true, fallback: false });
      // VOICE-FIRST DECOUPLING (2026-11-21, lib/faceStartGate): the
      // face start above runs CONCURRENTLY but no longer gates the
      // voice socket. It used to sit inside the Promise.all below,
      // so the WebSocket was created only after Simli's first
      // displayed frame — and on the prewarm path the held session's
      // `ready` was downstream of the face too, so a slow face on a
      // phone ate the tap's 15 s activation race and produced "The
      // voice service did not respond in time" against a healthy
      // voice service. The settlement is tracked instead: the gate
      // below applies a settled face's outcome exactly as before,
      // and a still-starting face lets the conversation proceed on
      // voice alone (parentFacePendingRef routes chunks locally)
      // and attaches when it lands — a late settlement can degrade
      // to the voice-only fallback but can never fail the start.
      const faceSettlement: FaceStartSettlement = { settled: false, outcome: null, error: null };
      let faceGatePassed = false;
      let markFaceSettled: () => void = () => {};
      const faceSettled = new Promise<void>((resolve) => { markFaceSettled = resolve; });
      const applyLateFaceSettle = () => {
        if (generation !== generationRef.current) return;
        parentFacePendingRef.current = false;
        if (lateFaceAction(faceSettlement) === 'fallback') engageVideoFallback();
        // 'attach': startFace already latched avatarLiveRef and the
        // avatar's own live report drives the shell's faceLive
        // state; chunk routing flips paired from the next chunk.
      };
      void faceReady.then(
        (outcome) => { faceSettlement.settled = true; faceSettlement.outcome = outcome; markFaceSettled(); if (faceGatePassed) applyLateFaceSettle(); },
        (err: unknown) => { faceSettlement.settled = true; faceSettlement.error = err; markFaceSettled(); if (faceGatePassed) applyLateFaceSettle(); },
      );
      let visitorKey = crypto.randomUUID();
      try { localStorage.setItem("gemini-visitor-key", visitorKey); } catch { /* ignore */ }
      // Prepare the server's business snapshot alongside permission/audio setup, only after a tap.
      // Handoff-leg recovery (2026-11-14): a return start after a
      // handoff adopts the RETAINED pre-handoff stream when one is
      // still live (stashed by the mid-leg teardown) instead of a
      // fresh getUserMedia — the fresh ask runs outside any user
      // gesture, can collide with the Twilio device's own capture,
      // and its NotAllowedError is what killed tonight's Round B
      // return after its session row was already authorized. The
      // handlers below are shared: an adopted stream wires into
      // micStreamRef exactly like a fresh one. No live retained
      // stream (or none stashed) → the fresh ask, unchanged.
      const stashedMic = preview || warm || micStreamIsLive(micStreamRef.current) ? null : takeRetainedHandoffMic<MediaStream>();
      const retainedMic = preview || warm ? null : reusableMicStream(micStreamRef.current, stashedMic);
      // Item 11b (2026-11-21): the request is composed through
      // micRequestPromise so a retained stream is wrapped in
      // Promise.resolve — the old `retainedMic ?? getUserMedia(...)`
      // left micRequest holding the raw stream, and .then() on it
      // threw "dg.then is not a function" on the handoff return.
      const micRequest: Promise<MediaStream> = micRequestPromise(retainedMic, () => navigator.mediaDevices.getUserMedia({
        audio: { deviceId: microphone === "default" ? undefined : { exact: microphone }, echoCancellation: true, noiseSuppression: true, autoGainControl: microphoneAutoGain(captureMode, noiseFilterRef.current) },
      }));
      const microphoneReady = preview || warm ? Promise.resolve(null) : micRequest.then(stream => {
        if (generation !== generationRef.current) { stream.getTracks().forEach(t => t.stop()); return null; }
        micStreamRef.current = stream;
        // Acquisition track check (Publish #56): a fresh OR a
        // handoff-retained stream whose track starts muted/ended
        // surfaces the dead-mic path instead of running silently.
        watchAcquiredMicStream(stream);
        // Handoff-leg recovery: mark an adopted retained stream so
        // the return stamp can prove the mic was reused, not re-asked.
        if (retainedMic && stream === retainedMic) handoffMicReusedRef.current = true;
        // Round 4: the engine may have become ready while this
        // request was in flight (its ready path ran before a
        // track existed) — apply the raw-capture switch to the
        // track that just landed, so cap= can read 'raw' while
        // the element carries the voice.
        if (mediaElementStateRef.current === 'ready') applyCaptureProcessing(true);
        return stream;
      }, (micError: unknown) => {
        // Only a refusal from the microphone request itself is a microphone permission problem.
        if (micError instanceof Error && (micError.name === "NotAllowedError" || micError.name === "SecurityError")) {
          if (isEmbeddedContext()) { setError(MICROPHONE_DENIED); return null; }
          throw new Error(MICROPHONE_DENIED);
        }
        throw micError;
      });
      const requestSession = (key: string) => {
        // Read the pick ONCE so the locale sent and the locale recorded
        // for a warm authorization can never disagree.
        const locale = explicitUiLocale();
        if (warm) warmLocaleRef.current = locale;
        return voiceSessionHeaders().then(headers => {
          if (generation !== generationRef.current) throw new Error('Demo start cancelled.');
          return supabase.functions.invoke("gemini-session", { headers, body: { visitorKey: key, agentId, leadId, prospectId, draft, preview, voice: previewVoice || voice, model: testModel, campaign:campaignVisit(), hour: new Date().getHours(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, locale, visitorName, consent: !warm && consentReadyRef.current, prewarm: warm, share: shareToken, resumeContext, reconnect: reconnecting && !!resumeContext, verification, invite, sample, guide } });
        });
      };
      const [initialSession, stream, ,] = await Promise.all([
        requestSession(visitorKey),
        microphoneReady,
        playResume,
        micResume,
      ]);
      // REFUSAL WINDOW (lib/faceStartGate): a face that has not
      // settled yet gets a short bounded wait before the gate goes
      // voice-first — long enough for a definitive token refusal
      // (one fast HTTP round trip, marked final, never retried) to
      // land and stay the hard error it has always been, far too
      // short for a healthy face start (token + LiveKit connect +
      // first frame) to be mistaken for one.
      if (!faceSettlement.settled) {
        await Promise.race([faceSettled, new Promise<void>((resolve) => { window.setTimeout(resolve, FACE_REFUSAL_WINDOW_MS); })]);
        if (generation !== generationRef.current) { stream?.getTracks().forEach(t => t.stop()); return; }
      }
      faceGatePassed = true;
      const faceGate = faceGateAction(faceSettlement);
      if (faceGate === 'fail') {
        if (faceSettlement.error != null) throw faceSettlement.error;
        throw new Error('The moving face could not connect. Please press play to try again.');
      }
      if (faceGate === 'fallback') engageVideoFallback();
      if (faceGate === 'voice-first' && avatarRequestedRef.current) parentFacePendingRef.current = true;
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
      // DIAG LANDING FIX (Publish #54): EVERY parent authorization
      // — homepage sales included — gives the diag channel its
      // target row, so playoutDiag/micDiag stamps land on every
      // session type instead of only swap/intro-armed ones. The
      // graph rate witness restarts with the new session: its
      // aggregate is per-session evidence.
      if (!preview && authorized.sessionId) {
        diagTargetRef.current = { sessionId: String(authorized.sessionId), visitorKey };
        resetRateWitness(graphWitnessRef.current);
        graphSegmentRef.current = null;
      }
      // Avatar swap arming (Stage 1): only a parent business-demo
      // authorization can enable the flow, and only when the server says
      // so. Segment/drop starts never re-arm from here (the swap machine
      // manages its own chain), and flag-off responses change nothing.
      if (!preview && authorized.personaSwapEnabled === true && (leadId || prospectId)) {
        swapEnabledRef.current = true;
        parentSessionIdRef.current = String(authorized.sessionId || '');
        visitorKeyRef.current = visitorKey;
        businessNameRef.current = String(authorized.businessName || '');
        if (presenterPersona) {
          // PRESENTER CHAIN (Alex handoff fix, 2026-11-14): a whole-demo
          // presenter parent earns the swap stamp on the lead path, and
          // the client runs the presenter chain for it — the state
          // carries the presenter, the matcher runs the presenter rule
          // set (meet-alex + return only; her solo script's doorway /
          // step-out anchors can never arm a Sara swap), and Alex's
          // return lands back on her. Before this branch existed the
          // server withheld the stamp from presenter parents, so this
          // block never ran for them and the close's MEET ALEX beat
          // narrated a handoff nothing executed.
          swapChainClassRef.current = 'presenter';
          chainDropSnapshotRef.current = null;
          swapStateRef.current = { ...INITIAL_SWAP_STATE, persona: presenterPersona, presenter: presenterPersona };
          setActivePersona(presenterPersona);
          visitChainStash.delete(agentId || "homepage");
          // fall through to the shared tail below (nothing else in the
          // simulation branch applies: no doorway snapshot to restore)
        } else {
        swapChainClassRef.current = 'simulation';
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
      // Example presenter (Frank batch): this parent is a
      // solo-presenter demo — the server withheld the swap stamp, so
      // no cut-over will ever report the presenter to the shell.
      // Report him once, at authorization, so the shell's name +
      // portrait follow the presenter from the first frame.
      // Reconnects re-authorize and re-fire: idempotent by design.
      if (!preview && presenterPersona && leadId) {
        onPersonaChangeRef.current?.({ id: presenterPersona, displayName: PERSONAS[presenterPersona].displayName });
      }
      homepageWalkthroughRef.current = authorized.homepageSales === true;
      idleRef.current = { enabled: (authorized.idleChecks === true || authorized.homepageSales === true) && !preview, stage: 'waiting', quietSince: Date.now(), generating: true, requestedAt: 0, sales: authorized.homepageSales === true };
      setHandoffToken(authorized.handoffToken || null);
      const ws = new WebSocket(`${voiceProxyWsUrl()}?token=${encodeURIComponent(authorized.token)}&capture=${captureMode}${warm ? '&hold=1' : ''}`);
      wsRef.current = ws;
      // Stale-prewarm guard: keep the warm session's own socket
      // handle so the tap-time freshness check (lib/warmSession)
      // reads THIS socket's state, not whatever wsRef points at later.
      if (warm && warmState) warmState.socket = ws;

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
        // Reconnect-stamp fix (2026-11-14): EVERY parent session —
        // first connect and every reconnect/resume alike — stamps
        // its playout route at go-live, and the first-chunk stamp
        // re-arms for the new session.
        diagChunkStampRef.current = false;
        // Playout startup guard (chat-fix3): every parent session —
        // first connect and every reconnect/resume alike — re-arms
        // its startup watch at go-live, so the new session's first
        // chunk baselines fresh (an auto-starting RESUME is exactly
        // the shape that went silent in Ron's b21b5884 test).
        startupWatchRef.current.reset();
        clearStartupTimers();
        setSoundBlocked(false);
        if (!preview && !warm) stampPlayoutDiag();
        // Zero-input guard: every parent go-live (first connect AND
        // every reconnect/resume) opens a fresh mic flow window and
        // stamps the mic path's starting state on the session row.
        noteMicSessionLive(micFlowRef.current, Date.now());
        if (!preview) stampMicDiag("start");
        // Acquisition track check (Publish #56): a dead-start
        // verdict held from acquisition surfaces now we are live.
        if (!preview) surfacePendingDeadMicStart();
        // Handoff-leg recovery (2026-11-14): a start that follows a
        // handoff has now LANDED — stamp the return on this new
        // session's row (the diag target was re-pointed by this
        // start's authorization) and close the return window, so
        // the next ordinary reconnect is not mistaken for a return.
        if (!preview && handoffReturnRef.current) {
          stampHandoffDiag("return-ok", handoffReturnRef.current.outcome, handoffMicReusedRef.current ? "reused" : handoffMicState());
          handoffReturnRef.current = null;
          handoffMicReusedRef.current = false;
        }
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
        micSourceRef.current = source;
        // AUDIO-PATH SLIM (clean-room proof, 2026-11-20): 4096-sample frames
        // halve the main-thread callback rate vs 2048 (~4/s vs ~8/s at
        // 16 kHz) — the clean-room app ran 4096 end-to-end with perfect
        // smoothness on the same phone/model/face. The gate math below is
        // time-based (performance.now), so the wider window changes
        // nothing it decides; frames simply arrive in bigger, rarer chunks.
        const node = micCtx.createScriptProcessor(4096, 1, 1);
        micNodeRef.current = node;
        let frame = 0;
        let speechGate = createSpeechGateState();
        node.onaudioprocess = (e) => {
          if (!liveRef.current || handoffRef.current || ws.readyState !== WebSocket.OPEN) return;
          const input = e.inputBuffer.getChannelData(0);
          let sumSq = 0;
          for (let i = 0; i < input.length; i++) sumSq += input[i] * input[i];
          const rms = Math.sqrt(sumSq / input.length);
          feedAmbientSample(rms);
          if (++frame % 2 === 0) {
            setMicLevel(Math.min(100, Math.round(rms * 500)));
          }
          const capture = captureRef.current;
          // Live caller audio must reach provider VAD even during speech (including
          // silent paired-video clocks). Pause/mute/replay still block capture.
          if (capture.paused) return;
          if (!shouldSendMicrophone(capture.mode, capture.held, capture.muted, capture.replaying)) return;
          // Barge-in hardening (2026-11-17): the send gate opens only
          // on SUSTAINED speech-level input, and while Aspen is
          // generating or audibly playing the bar rises to the strong
          // floor ×2 with a longer sustain — her own speaker echo and
          // room transients must never reach the provider as a caller
          // turn (see pushSpeechGateFrame in lib/voiceLabAudio).
          const assistantSpeaking = idleRef.current.generating || sourcesRef.current.size > 0 || engineTimersRef.current.size > 0;
          const gate = pushSpeechGateFrame(speechGate, rms, noiseFilterRef.current, performance.now(), assistantSpeaking);
          speechGate = gate;
          if (gate.open) micGateHeardRef.current = Date.now();
          if (gate.open && sourcesRef.current.size === 0 && !idleRef.current.generating) {
            idleRef.current.stage = 'waiting';
            idleRef.current.quietSince = Date.now();
          }
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
          ws.send(JSON.stringify({ type: "audio", data: pcmToBase64(pcm) }));
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
              warmState.goLive = goLive; warmState.ok = true; warmState.readyAt = Date.now(); resolveWarm(true);
              if (!warmState.activated) { setStatus("Ready to talk"); onPrewarmedRef.current?.(true); }
              break;
            }
            goLive();
            break;
          }
          case "start_handoff":
            // Server contract (Batch 1): {type:'start_handoff'} sent a
            // few seconds after Aspen announces the manager transfer.
            // Bump the counter BrowserVoiceHandoff watches to auto-dial.
            // Handoff-leg recovery (2026-11-14): capture the
            // announcement line (a return session's recap is built
            // without it), open the return window, and stamp the
            // announcement on the session record.
            noteHandoffAnnouncement();
            handoffReturnRef.current = { outcome: 'unknown' };
            stampHandoffDiag("announced", "-", handoffMicState());
            setHandoffStartSignal(value => value + 1);
            break;
          case "recommended_plan": {
            const plan = salesPlans.find(value => value === msg.plan);
            if (plan) onRecommendedPlan?.(plan);
            break;
          }
          case "confirm_action":
            trackPendingAction(msg as unknown as VoiceAction);
            setWaitingAction(null);
            break;
          case "cancel_action":
            if (pendingActionRef.current) setWaitingAction(pendingActionRef.current);
            trackPendingAction(null);
            break;
          case "action_result":
            if (msg.started && typeof msg.demoPath === "string") setDemoCard({ demoPath: msg.demoPath, websiteUrl: typeof msg.websiteUrl === "string" ? msg.websiteUrl : "" });
            setActionNotice(msg.error ? String(msg.error) : msg.started ? "Your demo is building — tap the card below to step into it." : msg.calendarConfirmed ? "Appointment confirmed on the AI Hidden Leads sales calendar." : msg.saved ? "Your confirmed follow-up details are saved." : "No action taken.");
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
            // A barge-in during the farewell = changed mind.
            if (endSignalRef.current) cancelEndSignalClose();
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
            // End-signal (2026-11-21, item 1): consume the prompt
            // layer's END_CONVERSATION_SIGNAL from the accumulated
            // line BEFORE it can reach the caption clock, the live
            // partial or the stored transcript; the close itself
            // fires at turn_complete (closeOnEndSignal).
            {
              const consumed = consumeEndConversationSignal(aspenLineRef.current);
              if (consumed.signalled) endSignalRef.current = true;
              aspenLineRef.current = consumed.visible;
            }
            captionClockRef.current.text(endSignalVisibleChunk(msg.text as string));
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
            // Speaking again after asking for the end = changed mind.
            if (endSignalRef.current) cancelEndSignalClose();
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
            // Visitor-armed summon-aspen (Scalone batch Item 2): the
            // visitor naming Aspen or asking an AI Hidden Leads
            // pricing/platform question while Sara is live sets
            // pendingAspen — her next line hands back, anchor or not.
            if (swapEnabledRef.current && liveRef.current) {
              swapStateRef.current = noteAspenIntent(swapStateRef.current, userLineRef.current);
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
              } else if (state.pendingAspen && state.phase === 'simulation' && !state.armed.includes('summon-aspen') && !state.done.includes('summon-aspen')) {
                // Visitor-armed summon-aspen late arm (Scalone batch
                // Item 2) — same pattern as meet-alex above: the
                // visitor asked for Aspen / a platform question, but
                // Sara's line completed without anything staged. Arm
                // now; the flag STAYS set, so her NEXT line still
                // yields 'summon-aspen' via boundaryForAssistantLine
                // and the swap follows that line.
                armSwapRef.current('summon-aspen');
              } else if (state.pendingDoorway && state.phase === 'host' && !state.armed.includes('doorway') && !state.done.includes('doorway') && lineAnnouncesDoorway(completedLine)) {
                // Structural doorway late arm — same pattern as
                // meet-alex above: the visitor engaged after the
                // greeting, but this line completed without anything
                // staged. ANNOUNCEMENT GATE (2026-11-20): the arm now
                // requires the completed line to have ANNOUNCED the
                // pass (lineAnnouncesDoorway) — engagement alone must
                // never arm, because the readiness executor executes
                // an armed doorway on stage readiness, and an
                // engagement-armed doorway is how Sara arrived
                // unannounced in the owner's live example run. The
                // flag STAYS set, so when her announcement line does
                // complete, it arms (here or at the streaming site)
                // and yields 'doorway' via boundaryForAssistantLine.
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
            // End-signal close (2026-11-21, item 1): the completed
            // line carried END_CONVERSATION_SIGNAL — the farewell
            // has been flushed; close promptly after it plays
            // instead of entering the silence ladder.
            if (endSignalRef.current && liveRef.current) closeOnEndSignal();
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
        // Stale-prewarm guard: the warm socket dying before
        // activation clears the warm state outright, so a later tap
        // cold-starts instead of reusing the corpse.
        if (warm && warmState && warmRef.current === warmState && !warmState.activated) { failWarm(); return; }
        if (silentWarm()) { failWarm(); return; }
        resolveWarm(false);
        setError("Could not connect to the voice service.");
        stopEverything();
      };
      ws.onclose = (event) => {
        clearTimeout(readyTimeout);
        if (generation !== generationRef.current) return;
        // Stale-prewarm guard: same clearing on close, ahead of the
        // live-session branches — an un-activated warm session is
        // never a live drop to recover.
        if (warm && warmState && warmRef.current === warmState && !warmState.activated) { failWarm(); return; }
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
      // Handoff-leg recovery (2026-11-14): a return start that
      // dies on the mic-denied error stamps return-failed on the
      // PREVIOUS session's row — the diag target still points
      // there because this start's authorization block (which
      // re-points it) never ran — and it is stamped BEFORE
      // stopEverything clears the target. Tonight's Round B
      // shape, made readable: announced → interrupted →
      // return-failed;mic=denied.
      if (handoffReturnRef.current && e instanceof Error && e.message === MICROPHONE_DENIED) {
        stampHandoffDiag("return-failed", handoffReturnRef.current.outcome, "denied");
        handoffReturnRef.current = null;
        handoffMicReusedRef.current = false;
      }
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
  }, [voice, microphone, captureMode, refreshMicrophones, playPcmChunk, clearPlayback, flushLine, stopEverything, closeOnEndSignal, cancelEndSignalClose, agentId, leadId, prospectId, draft, previewVoice, previewAudioContext, visitorName, consent, testModel, shareToken, sample, onRecommendedPlan, videoAvatar, startFace, recoverFromProviderClosed]);

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
    setTurns([...visitMemoryGet(agentId || "homepage")]);
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
      // Zero-input guard: a segment go-live re-opens the mic flow
      // window and stamps the parent row, same as a parent go-live.
      noteMicSessionLive(micFlowRef.current, Date.now());
      stampMicDiag("start");
      const micCtx = micCtxRef.current, stream = micStreamRef.current;
      if (!micCtx || !stream) return;
      void micCtx.resume();
      const source = micCtx.createMediaStreamSource(stream);
      micSourceRef.current = source;
      // AUDIO-PATH SLIM (clean-room proof, 2026-11-20): 4096-sample frames,
      // same change as the parent capture loop — see the note there.
      const node = micCtx.createScriptProcessor(4096, 1, 1);
      micNodeRef.current = node;
      let frame = 0;
      let speechGate = createSpeechGateState();
      node.onaudioprocess = (e) => {
        if (!liveRef.current || handoffRef.current || ws.readyState !== WebSocket.OPEN) return;
        const input = e.inputBuffer.getChannelData(0);
        let sumSq = 0;
        for (let i = 0; i < input.length; i++) sumSq += input[i] * input[i];
        const rms = Math.sqrt(sumSq / input.length);
        feedAmbientSample(rms);
        if (++frame % 2 === 0) setMicLevel(Math.min(100, Math.round(rms * 500)));
        const capture = captureRef.current;
        if (capture.paused) return;
        if (!shouldSendMicrophone(capture.mode, capture.held, capture.muted, capture.replaying)) return;
        // Barge-in hardening (2026-11-17): same sustained-speech gate
        // as the parent socket — see the note in the main capture loop.
        const assistantSpeaking = idleRef.current.generating || sourcesRef.current.size > 0 || engineTimersRef.current.size > 0;
        const gate = pushSpeechGateFrame(speechGate, rms, noiseFilterRef.current, performance.now(), assistantSpeaking);
        speechGate = gate;
        if (gate.open) micGateHeardRef.current = Date.now();
        if (gate.open && sourcesRef.current.size === 0 && !idleRef.current.generating) {
          idleRef.current.stage = 'waiting';
          idleRef.current.quietSince = Date.now();
        }
        let openingGate = openingGateRef.current;
        if (openingGate && performance.now() - openingGateSinceRef.current >= OPENING_GATE_FAILSAFE_MS) {
          openingGateRef.current = false;
          openingGate = false;
        }
        // Swap hold (handover fix): same silence rule on the segment
        // socket — a boundary armed from inside a segment (step-out,
        // meet-alex) holds this persona's mic until it resolves.
        const pcm = microphonePcm(micAudioPasses({ swapHold: swapHoldRef.current !== null, openingGate, noiseGateOpen: gate.open, holdToTalk: capture.mode === "hold" }) ? input : new Float32Array(input.length), e.inputBuffer.sampleRate);
        ws.send(JSON.stringify({ type: "audio", data: pcmToBase64(pcm) }));
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
          // Segment transcript persistence (2026-11-13 forensics — the
          // Sara logging gap): segment sessions inherited the parent's
          // STORED recordTranscript flag (false for prewarm-consumed
          // parents) and never sent 'begin', so the proxy's consent flip
          // never ran and every segment transcript finalized as []. A
          // segment is the same conversation the visitor consented to
          // record at the parent tap — assert that same consent here;
          // the proxy honors it for already-begun segment sockets.
          try { ws.send(JSON.stringify({ type: 'begin', consent: consentReadyRef.current })); } catch { /* socket racing closed — nothing records, as before */ }
          goLiveSegment();
          break;
        case "start_handoff":
          // Same server contract as the main socket (Batch 1): bump the
          // counter BrowserVoiceHandoff watches to auto-dial.
          // Handoff-leg recovery (2026-11-14): same announcement
          // capture, return window and stamp as the main socket.
          noteHandoffAnnouncement();
          handoffReturnRef.current = { outcome: 'unknown' };
          stampHandoffDiag("announced", "-", handoffMicState());
          setHandoffStartSignal(value => value + 1);
          break;
        case "recommended_plan": {
          const plan = salesPlans.find(value => value === msg.plan);
          if (plan) onRecommendedPlan?.(plan);
          break;
        }
        case "confirm_action": trackPendingAction(msg as unknown as VoiceAction); setWaitingAction(null); break;
        case "cancel_action": if (pendingActionRef.current) setWaitingAction(pendingActionRef.current); trackPendingAction(null); break;
        case "action_result":
          if (msg.started && typeof msg.demoPath === "string") setDemoCard({ demoPath: msg.demoPath, websiteUrl: typeof msg.websiteUrl === "string" ? msg.websiteUrl : "" });
          setActionNotice(msg.error ? String(msg.error) : msg.started ? "Your demo is building — tap the card below to step into it." : msg.calendarConfirmed ? "Appointment confirmed on the AI Hidden Leads sales calendar." : msg.saved ? "Your confirmed follow-up details are saved." : "No action taken.");
          break;
        case "audio":
          idleRef.current.generating = true;
          micAwaitRef.current = null;
          if (handoffRef.current) break;
          if (currentAudioRef.current.length < 6000) currentAudioRef.current.push(msg.data as string);
          if (!captureRef.current.paused) playPcmChunk(msg.data as string);
          break;
        case "interrupted":
          // A barge-in during the farewell = changed mind.
          if (endSignalRef.current) cancelEndSignalClose();
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
          // End-signal — same rule as the main socket: consume the
          // signal from the accumulated line before display/storage.
          const consumed = consumeEndConversationSignal(aspenLineRef.current);
          if (consumed.signalled) endSignalRef.current = true;
          aspenLineRef.current = consumed.visible;
          captionClockRef.current.text(endSignalVisibleChunk(msg.text as string));
          setPartialAspen(aspenLineRef.current);
          if (swapEnabledRef.current && liveRef.current) {
            const boundary = boundaryForAssistantLine(aspenLineRef.current, swapStateRef.current);
            if (boundary) armSwapRef.current(boundary);
          }
          break;
        }
        case "user_transcript":
          // Speaking again after asking for the end = changed mind.
          if (endSignalRef.current) cancelEndSignalClose();
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
          // Visitor-armed summon-aspen — same rule as the main socket.
          if (swapEnabledRef.current && liveRef.current) {
            swapStateRef.current = noteAspenIntent(swapStateRef.current, userLineRef.current);
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
            } else if (state.pendingAspen && state.phase === 'simulation' && !state.armed.includes('summon-aspen') && !state.done.includes('summon-aspen')) {
              // Visitor-armed summon-aspen late arm — same rule as the
              // main socket: arm now, flag stays set for her next line.
              armSwapRef.current('summon-aspen');
            } else if (state.pendingDoorway && state.phase === 'host' && !state.armed.includes('doorway') && !state.done.includes('doorway') && lineAnnouncesDoorway(completedLine)) {
              // Structural doorway late arm — same rule as the main
              // socket, announcement gate included (2026-11-20).
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
          // End-signal close — same rule as the main socket.
          if (endSignalRef.current && liveRef.current) closeOnEndSignal();
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
  }, [agentId, captureMode, clearPlayback, flushLine, onRecommendedPlan, playPcmChunk, stopEverything, closeOnEndSignal, cancelEndSignalClose, recoverFromProviderClosed]);
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
      const sync = cutoverAudioSync({ speakerMuted: speakerMutedRef.current, paused: captureRef.current.paused, replaying: captureRef.current.replaying, selectedDeviceId: selectedOutputIdRef.current, speakerVolume: playbackVolumeRef.current });
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
      if (!faceLive) {
        // Publish #62: the attach refusal is a swap RESOLUTION —
        // trace it in the ring buffer AND on the segment's own
        // session row (persistSwapDiag), so a face that never
        // attaches explains itself in the record instead of
        // vanishing. The 2026-11-15 presenter test stranded Alex
        // voice-over-portrait for two whole segments through this
        // exact silent return. The pending stays in place (a later
        // live report may retry the attach), as before.
        recordSwapDiag({ event: 'face-attach-failed', boundary: pending.boundary, persona: pending.persona, detail: 'sync-not-live' });
        persistSwapDiagRef.current({ event: 'face-attach-failed', boundary: pending.boundary, persona: pending.persona, reason: 'sync-not-live', faceState: 'not-live' });
        return;
      }
      // Re-validate after the await: the segment may have ended or
      // handed over while the sync ran.
      if (segmentFacePendingRef.current !== pending) return;
      if (swapStateRef.current.persona !== pending.persona) return;
      // TAKEOVER RE-SYNC (2026-11-20 — the voice-first lip lag):
      // if the segment's voice already played locally while its
      // face was pending, the paired +0.4 s offset was never
      // established — the schedule chained unshifted through
      // playTimeRef and the face received nothing, so at this flip
      // the queue is running (not drained) and the face's lips
      // would trail the voice for the rest of the turn. Re-prime
      // the offset with the same two operations clearPlayback
      // performs: flush the heard engine (dropping its
      // voice-only-paced reserve) and reset the schedule anchor,
      // so the NEXT chunk starts a fresh run on a drained queue —
      // voiceChunkStartAt applies the paired shift to it, the
      // engine rebuilds under the paired trail target, and Simli
      // receives that same chunk at the same instant (the pending
      // clears just below, so it routes paired). The cost is one
      // short beat in the voice at the attach moment instead of a
      // turn-long lip lag. This is a re-prime, NOT an interrupt:
      // captions are not cleared and sounding graph sources are
      // left to finish on their own schedule.
      if (takeoverShouldResync(segmentFacePendingRef.current != null, voiceFirstLocalChunksRef.current)) {
        mediaElementRef.current?.flush();
        playTimeRef.current = playCtxRef.current?.currentTime ?? 0;
        recordSwapDiag({ event: 'face-takeover-resync', boundary: pending.boundary, persona: pending.persona, detail: `localChunks=${voiceFirstLocalChunksRef.current}` });
      }
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
          const sync = cutoverAudioSync({ speakerMuted: speakerMutedRef.current, paused: captureRef.current.paused, replaying: captureRef.current.replaying, selectedDeviceId: selectedOutputIdRef.current, speakerVolume: playbackVolumeRef.current });
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
          voiceFirstLocalChunksRef.current = 0;
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
        // Visitor-armed Aspen intent is consumed by summon-aspen
        // itself, so it can never re-fire; every other cut-over
        // leaves it untouched (it is only ever set in simulation).
        pendingAspen: boundary === 'summon-aspen' ? false : swapStateRef.current.pendingAspen,
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
      setTurns(prev => { const divider: Turn = { role: "divider", text: "", speaker: incoming }; if (!isPreviewRef.current) visitMemoryAppend(agentId || "homepage", divider); return [...prev, divider]; });
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
      // NO-DEAD-AIR BRIDGE (Scalone batch Item 6a — forensics F1):
      // while a swap hold outlasts SWAP_BRIDGE_AFTER_MS with no turn
      // in flight, ask the STILL-LIVE outgoing session to speak ONE
      // bridging line (the proxy's idle_prompt 'bridge' stage) — the
      // visitor hears a person, not silence, until the incoming
      // segment lands or the watchdog's visible fallback engages.
      // One line per arm, stamp-keyed (swapBridgeDue); the send goes
      // to the outgoing persona's socket, which stays open until the
      // cut-over's partial teardown.
      const hold = swapHoldRef.current;
      if (hold && wsRef.current?.readyState === WebSocket.OPEN) {
        const armedAt = swapArmAtRef.current[hold.boundary] ?? 0;
        if (swapBridgeDue({ holdBoundary: hold.boundary, armedAt, now: Date.now(), bridgeSentFor: swapBridgeSentRef.current, turnInFlight: idleRef.current.generating })) {
          swapBridgeSentRef.current = armedAt;
          idleRef.current.generating = true;
          recordSwapDiag({ event: 'bridge', boundary: hold.boundary, persona: BOUNDARY_TARGET[hold.boundary], attempt: segmentAttemptsFor(swapStateRef.current, hold.boundary) + 1 });
          wsRef.current.send(JSON.stringify({ type: 'idle_prompt', stage: 'bridge' }));
        }
      }
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
      focus: faceFirst && !captions,
    });
  }, [phase, suspended, muted, speakerMuted, hasReplay, replaying, aspenSpeaking, faceFirst, captions]);
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
      // Acquisition track check (Publish #56), warm-activation path.
      watchAcquiredMicStream(stream);
      // Round 4: same raw-capture re-apply as the main start —
      // a track acquired after the engine settled still gets the
      // switch (see the microphoneReady handler above).
      if (stream && mediaElementStateRef.current === 'ready') applyCaptureProcessing(true);
      if (stream) void refreshMicrophones();
      if (!ready) throw new Error("The voice service did not respond in time. Please try again.");
      await faceSound;
      // VOICE-FIRST DECOUPLING (2026-11-21): a face that is not live
      // at activation no longer fails the start (this throw was the
      // 'The moving face could not connect' dead end). A face still
      // starting from the prewarm (parentFacePendingRef set by its
      // start gate) attaches when it lands. A face that was live at
      // prewarm and dropped during the idle wait is re-kicked ONCE
      // here — start() tears the stale client down itself — and
      // attaches the same way; if the re-kick settles without a live
      // face, the session continues voice-only on the portrait via
      // the fallback instead of erroring.
      if (avatarRequestedRef.current && !avatarLiveRef.current && !parentFacePendingRef.current) {
        parentFacePendingRef.current = true;
        const settleRekick = () => {
          if (generation !== generationRef.current) return;
          parentFacePendingRef.current = false;
          if (!avatarLiveRef.current) engageVideoFallback();
        };
        void startFace(generation, false).then(settleRekick, settleRekick);
      }
      if (playCtx.state !== 'running' || (stream && micCtx.state !== 'running')) throw new Error(AUDIO_TAP_NEEDED);
      if (wsRef.current?.readyState !== WebSocket.OPEN) throw new Error("The connection closed before the session started. Try again.");
      wsRef.current.send(JSON.stringify({ type: 'begin', consent: true }));
      w.goLive?.();
      // Sound verification (first-load silence fix, 2026-11-14): an
      // activation that landed before the face went live resolved
      // false above and used to be swallowed — the session then
      // "spoke" (captions advancing) with the avatar element parked
      // at its silent-prewarm level until a page reload. The avatar
      // now completes the recorded sound request itself when it goes
      // live; verify that here, and if the sound is STILL not armed
      // after a few seconds, surface the tap-to-enable-sound
      // affordance instead of leaving the visitor in silence. A
      // visitor who muted the speaker themselves is never flagged.
      if (avatarRequestedRef.current) {
        let checks = 0;
        const verifySound = () => {
          if (generation !== generationRef.current || !liveRef.current) return;
          const handle = avatarRef.current;
          if (!handle?.soundArmed || handle.soundArmed()) { setAudioNeedsTap(false); return; }
          checks += 1;
          if (checks >= 5) { if (!speakerMutedRef.current) setAudioNeedsTap(true); return; }
          window.setTimeout(verifySound, 2000);
        };
        window.setTimeout(verifySound, 2500);
      }
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

  const onHandoffEnded = (outcome: 'completed' | 'unavailable') => { handoffOutcomeRef.current = outcome; };
  const onHandoffActive = (active: boolean) => {
    handoffRef.current = active;
    setHandoffActive(active);
    if (active) {
      // Handoff-leg recovery (2026-11-14): the announcement has
      // landed by the time the leg starts — capture it now (the
      // start_handoff capture can race the turn completing), keep
      // the return window open, and stamp the leg's start.
      noteHandoffAnnouncement();
      if (!handoffReturnRef.current) handoffReturnRef.current = { outcome: 'unknown' };
      stampHandoffDiag("leg-started", "-", handoffMicState());
      pauseCapture(); clearPlayback();
      captureRef.current.paused = true; setPaused(true);
      void playCtxRef.current?.suspend();
    } else {
      captureRef.current.paused = false; setPaused(false);
      void playCtxRef.current?.resume();
      // Handoff-leg recovery (2026-11-14): record the leg's end
      // and its outcome BEFORE the come-back send below reads it.
      // Whether the return is still owed after this handler
      // depends on the socket: a delivered handoff_ended completes
      // the come-back in-session (window closed under the send);
      // a dead socket leaves the window open so the next start is
      // stamped — and recapped — as the return.
      const socketOpen = wsRef.current?.readyState === WebSocket.OPEN;
      const endedOutcome = handoffOutcomeRef.current ?? 'unavailable';
      handoffReturnRef.current = { outcome: endedOutcome };
      stampHandoffDiag("ended", endedOutcome, handoffMicState());
      // Come-back after handoff (Handoff improvement batch,
      // 2026-11-12): report ONLY the terminal outcome; the proxy
      // authors the return instruction server-side (welcome-back,
      // what-did-you-arrange, and on sales sessions the demo /
      // workflow beats + wizard close). This replaces the old
      // outcome-blind client-authored text line, which claimed
      // nothing and asked nothing the same way after every ending.
      if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify({type:'handoff_ended',outcome:handoffOutcomeRef.current ?? 'unavailable'}));
      handoffOutcomeRef.current = null;
      // Handoff-leg recovery: a delivered outcome report completes
      // the come-back in-session — no new-session return is owed.
      if (socketOpen) handoffReturnRef.current = null;
    }
  };
  const confirmation = pendingAction ? (pendingAction.action === 'request_demo_start'
    ? <DemoStartConfirmation key={pendingAction.id} action={pendingAction} onAnswer={(approved, demo) => { wsRef.current?.send(JSON.stringify({type:'confirm_action',id:pendingAction.id,approved,demo})); if (approved) setWaitingAction(null); else setWaitingAction(pendingAction); trackPendingAction(null); }}/>
    : <VoiceActionConfirmation key={pendingAction.id} action={pendingAction} onAnswer={(approved, contact) => { wsRef.current?.send(JSON.stringify({type:'confirm_action',id:pendingAction.id,approved,contact})); if (approved) setWaitingAction(null); else setWaitingAction(pendingAction); trackPendingAction(null); }}/>) : null;
  // VOICE DEMO START entry card (2026-11-21): shown once the proxy
  // confirms the demo started. A plain anchor the VISITOR taps —
  // sales actions never navigate a live conversation automatically —
  // opening the /demo-site experience in a new tab while this
  // conversation stays live here.
  const demoEntryCard = demoCard ? (
    <div className="flex items-center gap-2 self-start rounded-xl border border-primary/40 bg-primary/10 px-3 py-2">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-primary">{t("panel.demoBuilding")}</p>
        {demoCard.websiteUrl && <p className="max-w-[220px] truncate text-[11px] text-muted-foreground">{demoCard.websiteUrl}</p>}
      </div>
      <a href={demoCard.demoPath} target="_blank" rel="noreferrer" className="shrink-0 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90">{t("panel.demoEnter")}</a>
      <button type="button" aria-label={t("panel.demoDismiss")} onClick={() => setDemoCard(null)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"><X className="h-4 w-4" /></button>
    </div>
  ) : null;
  // Publish #68: the dismissed form's way back. One tap sends
  // reopen_action; the proxy re-issues the same card (a fresh
  // confirm_action lands and the card renders above). Rendered only
  // while no card is up — a fresh card, a completed confirm and
  // session teardown all retire it.
  const formWaitingChip = !pendingAction && waitingAction ? (
    <button type="button" onClick={() => { wsRef.current?.send(JSON.stringify({ type: 'reopen_action' })); setWaitingAction(null); }} className="inline-flex items-center gap-1.5 self-start rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20">
      {t("panel.formWaiting")}
    </button>
  ) : null;
  const transferControl = phase === 'live' && handoffToken ? <BrowserVoiceHandoff token={handoffToken} onActive={onHandoffActive} onEnded={onHandoffEnded} microphone={microphone} startSignal={handoffStartSignal}/> : null;
  // Compact panel (2026-11-11 rearrangement; Batch 1 move, 2026-11-12):
  // the same handoff, same live + token gate, rendered as the compact
  // Manager pill in its own right-aligned row under the merged control
  // row (chat-fix4; it rode in the Voice/Type toggle row before that)
  // instead of the voice-controls row, where it wrapped onto its own
  // row on phones.
  const transferPill = phase === 'live' && handoffToken ? <BrowserVoiceHandoff pill token={handoffToken} onActive={onHandoffActive} onEnded={onHandoffEnded} microphone={microphone} startSignal={handoffStartSignal}/> : null;

  if (!previewOnly && !consentReady && !prewarm) return <div className="space-y-3 p-3 text-foreground">
    {faceFirst && <PersonPortrait name={name} avatarUrl={avatarUrl} nameLabel flat />}
    {windowControls}
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
  // Persona name badge (Ron, 2026-11-13): the lower-third label over
  // the livebox reads the SAME config that selects the face + voice —
  // the persona registry while a persona segment is live (activePersona
  // flips at the swap cut-over, the moment the incoming persona takes
  // the conversation, so the badge follows the visible speaker), the
  // Alex registry entry for the guide session, and the session's agent
  // identity name otherwise (a tenant agent's own name on their own
  // widget; "Aspen" on platform surfaces).
  const personaLabelName = guide === 'alex' ? PERSONAS.alex.displayName : activePersona !== 'aspen' ? PERSONAS[activePersona].displayName : presenterPersona ? PERSONAS[presenterPersona].displayName : name;
  // Status-line speaker name: identical to today's registry read
  // except on a presenter session, whose only speaker is the
  // presenter even though the swap machine's persona stays 'aspen'.
  const speakerName = presenterPersona && activePersona === 'aspen' ? PERSONAS[presenterPersona].displayName : PERSONAS[activePersona].displayName;
  // FOCUS VIEW (2026-11-14, Ron-approved mockup v2): captions off on a
  // face-first panel = the presenter floats frameless and larger.
  // Reported to the shell via onShellState so the frame widens with
  // her. (Chat-fix4, 2026-11-16: the focus bottom dock is gone — the
  // merged control row serves every state, the name rides the seam
  // pill, and focus now only gates the transport's placement and
  // the Manager row's visibility.)
  const focusView = faceFirst && !captions;
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
    ? <SimliAvatar ref={mainSlotRef} inline={avatarInline || faceFirst} unboxed={faceFirst} avatar={{ ...videoAvatar, faceId: mainFace.persona === 'sara' ? SARA_FACE_ID : mainFace.persona === 'alex' ? ALEX_FACE_ID : videoAvatar.faceId }} persona={mainFace.persona} personaParentSessionId={parentSessionIdRef.current || undefined} personaVisitorKey={visitorKeyRef.current || undefined} concealed={!mainFace.revealed} layer={mainFaceLayer} streamAudio={pairedAudibleMode() === 'local' ? 'muted' : 'audible'} onPlayoutDiag={handlePlayoutDiag} onLiveChange={live => handleFaceLiveChange('main', live, mainFace)} />
    : <SimliAvatar ref={mainSlotRef} inline={avatarInline || faceFirst} unboxed={faceFirst} avatar={presenterPersona ? { ...videoAvatar, faceId: PERSONAS[presenterPersona].faceId ?? videoAvatar.faceId } : (activeVideoAvatar ?? videoAvatar)} agentId={agentId} shareToken={shareToken} draft={draft} guide={guide} persona={presenterPersona ?? undefined} personaLeadId={presenterPersona ? leadId : undefined} streamAudio={pairedAudibleMode() === 'local' ? 'muted' : 'audible'} onPlayoutDiag={handlePlayoutDiag} onLiveChange={live => handleFaceLiveChange('main', live, null)} />) : null;
  // SECOND face slot: the incoming persona's instance — mounted
  // concealed while a boundary is armed (live but hidden and muted),
  // revealed by the cut-over's crossfade, and kept mounted as the
  // active face until it retires at a later boundary. Its wrapper no
  // longer hides it: SimliAvatar's own opacity (concealed / fade-out)
  // drives the dissolve, layered above the retiring main slot.
  const stagedAvatarView = secondFace && videoAvatar?.enabled && !previewOnly ? (
    <div key={`staged-${secondFace.boundary}`} className={faceFirst ? "aspen-person-livebox relative z-0 mx-auto overflow-hidden" : undefined} style={faceFirst ? { position: 'absolute', inset: 0, pointerEvents: 'none' } : undefined}>
      <SimliAvatar ref={stagedAvatarRef} inline={avatarInline || faceFirst} unboxed={faceFirst} avatar={{ ...videoAvatar, faceId: secondFace.persona === 'sara' ? SARA_FACE_ID : secondFace.persona === 'alex' ? ALEX_FACE_ID : videoAvatar.faceId }} persona={secondFace.persona} personaParentSessionId={parentSessionIdRef.current || undefined} personaVisitorKey={visitorKeyRef.current || undefined} concealed={!secondFace.revealed} layer={secondFace.revealed ? (fadingSlot === 'second' ? 1 : 2) : 0} streamAudio={pairedAudibleMode() === 'local' ? 'muted' : 'audible'} onPlayoutDiag={handlePlayoutDiag} onLiveChange={live => handleFaceLiveChange('second', live, secondFace)} />
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
  // Panel layout fix (2026-11-12): the toggle/manager row moved INSIDE the
  // voice panel, directly under the window-controls row — it used to sit
  // between the livebox and the panel, crowding the portrait's bottom
  // edge. One row element, two placements: inside the panel card in
  // face-first mode; in the legacy non-face-first compact flow it keeps
  // its spot under the avatar (there is no panel card there).
  const toggleManagerRow = (belowAvatar || transferPill) ? (
    <div data-testid="toggle-manager-row" className="flex shrink-0 items-start gap-1 py-0.5">
      <div aria-hidden className="flex-1" />
      {/* FOCUS VIEW: this row is hidden (never unmounted) in focus, so
          the toggle itself renders in the focus-only row below
          instead — exactly one mounted instance either way. */}
      <div className="flex shrink-0 justify-center">{focusView ? null : belowAvatar}</div>
      <div className="flex min-w-0 flex-1 flex-col items-end">{transferPill}</div>
    </div>
  ) : null;
  // ONE CONTROL ROW + CC + NAME PILL (chat-fix4, 2026-11-16, Ron's
  // redesign): the face-first panel used to stack TWO control rows —
  // the focus dock / window-controls row, then the Voice/Type +
  // Manager row — and carried a word "Captions" pill in the status
  // row. Ron circled both rows on his phone screenshots. Face-first
  // panels now render ONE merged row — [CC] [Voice|Type] … [DRAG − X]
  // — in every state (focus or not, narrow or wide): the Captions
  // word becomes the literal "CC" (the localized tooltip/aria-label,
  // the on/off behaviour and the tip card are unchanged), the
  // presenter name leaves the row entirely (it floats as the seam
  // pill at the panel's top-left — "on her shoulder" — rendered in
  // the panel below), and the Manager pill keeps its own
  // right-aligned row directly underneath: at ~44px tall it cannot
  // share the 36px control row, and the row stays MOUNTED (hidden
  // only) in focus view so a live handoff leg is never torn down.
  // The legacy toggleManagerRow above still serves the non-face-first
  // compact flow unchanged.
  const captionsToggleButton = (
    <Button variant="outline" data-testid="aspen-captions-toggle" className={captions ? "h-9 shrink-0 rounded-full border-primary bg-primary px-2.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground" : "aspen-panel-btn h-9 shrink-0 rounded-full border-primary/60 bg-transparent px-2.5 text-xs font-bold text-primary hover:bg-muted hover:text-primary"} aria-label={captions ? t('voice.hideCaptions') : t('voice.showCaptions')} title={captions ? t('voice.hideCaptions') : t('voice.showCaptions')} aria-expanded={captions} onClick={() => chooseCaptions(!captions)}>CC</Button>
  );
  const controlRow = (
    <div data-testid="aspen-control-row" className="flex shrink-0 flex-nowrap items-center gap-1">
      {captionsToggleButton}
      {belowAvatar && <div className="flex shrink-0 justify-center">{belowAvatar}</div>}
      <div aria-hidden className="flex-1" />
      {windowControls}
    </div>
  );
  const managerRow = transferPill ? (
    <div data-testid="manager-pill-row" className={focusView ? 'hidden' : 'flex shrink-0 flex-col items-end'}>{transferPill}</div>
  ) : null;
  const transportControls = (
  // w-full + min-w-0 (2026-11-14): as a flex item (the landscape row's
  // centre slot) this row used to size to its max-content and spill
  // symmetrically out of its slot — the End button landed on the
  // toggle's Type segment (leaving a stray clipped letter) and Replay
  // hung off the panel's right edge. Constrained to its slot, the
  // buttons shrink inside it instead (they carry shrink + min-w-0).
  <div className="voice-controls flex w-full min-w-0 flex-nowrap items-center justify-center gap-1 [&_button]:h-auto [&_button]:min-h-11 [&_button]:w-auto [&_button]:min-w-0 [&_button]:shrink [&_button]:flex-col [&_button]:gap-1 [&_button]:px-1.5 [&_button]:py-1.5 [&_span]:text-[10px] [&_span]:leading-tight [&_span]:truncate">
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
    {/* Button state colours (2026-11-14, Ron-approved canonical spec):
        green fill = ON/engaged, AMBER fill = muted/silenced (mic AND
        speaker — muted mic used to wear the same solid red as End),
        solid red = End only, near-black = idle. Neutral buttons take a
        dark-grey hover wash + .aspen-panel-btn so the violet --accent
        hover can never stick after a touch tap and invent a state. */}
    {phase === "live" && captureMode !== "hold" && (
      <Button
        size="icon"
        disabled={handoffActive}
        variant={muted ? "warning" : "outline"}
        className={muted ? undefined : "aspen-panel-btn hover:bg-muted hover:text-foreground"}
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
        className={paused ? undefined : "aspen-panel-btn hover:bg-muted hover:text-foreground"}
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
          variant={speakerMuted ? "warning" : "outline"}
          className={speakerMuted ? undefined : "aspen-panel-btn hover:bg-muted hover:text-foreground"}
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
          <>
          {/* Dismiss layer (2026-11-14): while the speaker menu is open,
              the visitor's natural "tap anywhere to dismiss" must ONLY
              dismiss. Without this layer that tap fell through to
              whatever sat under it — in Ron's phone test the panel's
              Voice/Type toggle row — and a dismiss gesture silently
              flipped the mode and killed the live voice session. The
              layer swallows exactly one tap and closes the menu; the
              menu itself stays above it (z-50). */}
          <div data-testid="speaker-menu-backdrop" aria-hidden="true" className="fixed inset-0 z-40 cursor-default" onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); setSpeakerMenuOpen(false); }} />
          <div role="menu" aria-label={t("voice.speakerOutput")} className="absolute bottom-full left-1/2 z-50 mb-1 w-56 max-w-[80vw] -translate-x-1/2 rounded-md border border-border bg-card p-1 text-left shadow-lg">
            {buildSpeakerMenuOptions({ devices: speakerOutputs, canSelect: speakerCanSelect, selectedDeviceId: selectedOutputId, muted: speakerMuted }).map((option: SpeakerMenuOption) => {
              if (option.kind === "mute") {
                return (
                  <div key={option.id}>
                    <div className="my-1 border-t border-border" aria-hidden />
                    <button type="button" role="menuitemradio" aria-checked={option.selected} aria-label={t("voice.speakerMute")} className={`flex w-full items-center gap-2 rounded-sm px-2 py-2 text-xs font-medium hover:bg-muted ${option.selected ? "bg-primary/15" : ""}`} onClick={chooseSpeakerMute}>
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center">{option.selected && <Check className="h-3.5 w-3.5 text-primary" />}</span>
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
                <button key={option.id} type="button" role="menuitemradio" aria-checked={option.selected} aria-label={label} className={`flex w-full items-center gap-2 rounded-sm px-2 py-2 text-xs font-medium hover:bg-muted ${option.selected ? "bg-primary/15" : ""}`} onClick={() => { if (device) void chooseSpeakerDevice(device); else choosePlatformOutput(); }}>
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center">{option.selected && <Check className="h-3.5 w-3.5 text-primary" />}</span>
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
            {!speakerCanSelect && <p className="px-2 pb-1 pt-1.5 text-[10px] leading-snug text-muted-foreground">{t("voice.speakerNoSelectNote")}</p>}
            {speakerOutputNotice && <p role="status" className="px-2 pb-1 pt-1.5 text-[10px] leading-snug text-muted-foreground">{speakerOutputNotice}</p>}
          </div>
          </>
        )}
      </div>
    )}
    <Button
      size="icon"
      variant="outline"
      className="aspen-panel-btn hover:bg-muted hover:text-foreground"
      disabled={!hasReplay || paused || replaying || aspenSpeaking || phase === "connecting" || phase === "preview"}
      onClick={() => void replayLastMessage()}
      title={t("voice.replayLastTitle")}
      aria-label={t("voice.replayLastMessage")}
    >
      <RotateCcw className="h-4 w-4" />
      <span>{t("voice.replay")}</span>
    </Button>
    {replaying && (
      <Button size="icon" variant="outline" className="aspen-panel-btn hover:bg-muted hover:text-foreground" onClick={clearPlayback} title={t("voice.stopReplayTitle")} aria-label={t("voice.stopReplayTitle")}>
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
      className="aspen-panel-btn hover:bg-muted hover:text-foreground"
      onClick={() => setShowSettings((s) => !s)}
      title={t("voice.voiceSettings")}
      aria-label={t("voice.voiceSettings")}
      aria-expanded={showSettings}
    >
      <Settings2 className="h-4 w-4" />
      <span>{t("voice.settings")}</span>
    </Button>
  </div>
  );
  // LAYOUT REFINEMENT (Scalone batch Item 8b): in a wide landscape
  // panel the transport buttons get a row of their own under the
  // control row, filling the middle. (Chat-fix4, 2026-11-16: the
  // Voice/Type toggle and the Manager pill that shared this row in
  // Item 8b moved up — the toggle into the merged control row, the
  // pill into its own row — so this row is transport-only now.)
  // Rendered INSTEAD of the bottom transport slot, never alongside
  // it, so exactly one instance of every control mounts.
  const landscapeControlRow = (
    // The centre slot carries a 12.5rem floor (2026-11-14): five icon
    // buttons at their 36px minimums + gaps need ~200px. Below that
    // the row's flex-wrap moves the transport to its own full-width
    // line instead of the transport crushing and spilling over its
    // neighbours. Chat-fix4 (2026-11-16): the row is TRANSPORT-ONLY —
    // the Voice/Type toggle moved up into the merged control row and
    // the Manager pill into its own row, so neither renders here.
    <div data-testid="toggle-transport-row" className="flex shrink-0 flex-wrap items-center gap-1 py-0.5">
      {/* FOCUS VIEW (2026-11-14): this whole row steps aside (hidden)
          in focus — but the transport must NOT step aside with it:
          Ron's #47 retest dock had no voice controls at all. While
          focusView the centre slot stays empty and the transport
          renders in the focus dock's own row (aspen-focus-transport,
          below), so exactly one instance mounts either way. */}
      {!focusView && <div className="flex min-w-[12.5rem] flex-1 justify-center">{transportControls}</div>}
    </div>
  );
  if (compact) {
    return (
      <div className={faceFirst ? "flex h-full min-h-0 flex-1 flex-col px-2 pb-2 pt-0 text-foreground" : "space-y-2 p-2 text-foreground"}>
        {faceFirst ? <div className="aspen-person-livebox relative z-0 mx-auto shrink-0 overflow-hidden"><div className={`h-full w-full ${faceLive ? 'invisible' : ''}`}><PersonPortrait name={name} avatarUrl={avatarUrl} animated={false} flat={focusView} /></div>{avatarView}{stagedAvatarView}</div> : <>{avatarView}{stagedAvatarView}</>}
        {!faceFirst && windowControls}
        {!faceFirst && toggleManagerRow}
        <div className={(faceFirst ? 'aspen-voice-panel relative z-10 flex min-h-0 flex-1 flex-col space-y-1.5 rounded-lg border border-primary/40 bg-card p-2 shadow-lg ring-1 ring-foreground/10' : 'space-y-2') + (faceFirst && focusView ? ' aspen-voice-panel-focus' : '')}>
        {/* NAME PILL ON HER SHOULDER (chat-fix4, 2026-11-16, Ron's
            redesign): the presenter's name no longer sits in the
            control row — it floats as a highlighted pill at the
            lower-LEFT of the portrait, straddling the seam where
            the portrait meets the panel's top edge (the panel is
            positioned relative; the pill anchors to its top-left,
            half above the border). It renders in BOTH focus and
            captions-on states, replacing the livebox overlay and
            the focus dock's in-flow badge. The standing rule
            otherwise holds: the portrait ends at the panel's top
            border and every control sits inside the frame below
            it — the pill is the one deliberate overlap. */}
        {faceFirst && <PersonaNameLabel name={personaLabelName} variant="seam" />}
        {faceFirst && controlRow}
        {faceFirst && managerRow}
        {captionsTip && faceFirst && (
          <div data-testid="aspen-captions-tip" role="status" className="absolute inset-x-2 bottom-2 z-20 flex items-start gap-2 rounded-lg border border-primary/40 bg-card/85 p-2.5 text-xs text-foreground shadow-lg backdrop-blur-sm">
            <p className="min-w-0 flex-1">{t('voice.captionsTip')}</p>
            <button type="button" aria-label={t('voice.captionsTipDismiss')} className="shrink-0 rounded-full px-1 leading-none text-muted-foreground hover:text-foreground" onClick={() => setCaptionsTip(false)}>✕</button>
          </div>
        )}
        {/* Wide landscape only: the transport row under the merged
            control row. 'hidden' (not unmount) in focus view, where
            the transport renders in aspen-focus-transport instead —
            exactly one mounted instance either way. Narrow panels
            keep their transport at the bottom slot below. (Before
            chat-fix4 this wrapper also carried the toggle/Manager
            row; both moved into the merged control row above.) */}
        {faceFirst && wideLandscape && <div className={focusView ? 'hidden' : 'contents'}>{landscapeControlRow}</div>}
        <div className="flex items-center gap-1.5">
          {shownPhase === "connecting" && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />}
          {shownPhase === "live" && !aspenSpeaking && <Mic className="h-3.5 w-3.5 shrink-0 animate-pulse text-primary" />}
          {shownPhase === "live" && aspenSpeaking && <Volume2 className="h-3.5 w-3.5 shrink-0 animate-pulse text-primary" />}
          {shownPhase === "idle" && <Play className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          <p className="min-w-0 flex-1 break-words text-xs leading-snug text-foreground" role="status">
            {shownPhase === "live" && (
              <span className="font-semibold text-foreground">
                {swapConnecting ? `Connecting ${PERSONAS[swapConnecting].displayName}…` : handoffActive ? t("voice.managerHandoff") : paused ? t("voice.paused") : replaying ? t("voice.replayingSavedAudio") : muted ? t("voice.micMuted") : aspenSpeaking ? t("voice.speaking", { name: speakerName }) : captureMode === "hold" && !held ? t("voice.holdToTalk") : t("voice.listening")}
              </span>
            )}
            {shownPhase !== "live" && (shownPhase === "idle" ? t("voice.readyToTalk") : faceWaiting ? t("voice.connecting") : status)}
          </p>
          {/* START OVER (Ron, 2026-11-16): a deliberately small, quiet
              control at the end of the status row — two chasing arrows —
              that ends the visit and wipes its memory so the next Start
              treats this browser as a brand-new visitor. Built for
              demoing (show a friend a fresh first visit on a browser
              that remembers you); a real visitor who taps it simply
              starts over. */}
          <button type="button" data-testid="aspen-start-over" onClick={restartAsNewVisitor} title={t("voice.startOver")} aria-label={t("voice.startOver")} className="shrink-0 rounded-full p-1 text-muted-foreground/50 transition-colors hover:text-foreground">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          {remainingSeconds !== null && <span data-testid="demo-timer-pill" title={`${t("voice.demoTimeRemaining")}: ${Math.floor(remainingSeconds/60)}:${String(remainingSeconds%60).padStart(2,'0')}`} aria-label={`${t("voice.demoTimeRemaining")}: ${Math.floor(remainingSeconds/60)}:${String(remainingSeconds%60).padStart(2,'0')}`} className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-background/95 px-2 py-0.5 text-[11px] leading-tight text-muted-foreground"><Timer className="h-3 w-3" />{Math.floor(remainingSeconds/60)}:{String(remainingSeconds%60).padStart(2,'0')}</span>}
          {/* The captions toggle used to live at this row's end as a
              word pill labelled "Captions" (2026-11-14). Chat-fix4
              (2026-11-16) moved it into the merged control row as
              the literal "CC" button — see captionsToggleButton. */}
        </div>
        {phase === 'idle' && endedByVisitor && <p className="text-xs text-muted-foreground">{t("voice.pressPlayReconnect", { name })}</p>}
        {/* FOCUS VIEW transport, wide landscape only (2026-11-14): the
            dock's voice bar, under the status line. Landscape is the
            case that lost its controls — they rode inside the hidden
            landscape row; its centre slot now skips the transport
            while focusView (above), so this is the single mounted
            instance. Narrow panels keep theirs at the bottom slot
            below (unchanged), which is likewise the single instance
            there: the landscape row never renders in narrow. */}
        {faceFirst && focusView && wideLandscape && <div data-testid="aspen-focus-transport" className="flex shrink-0 justify-center">{transportControls}</div>}

        <div className={faceFirst ? (captions ? 'aspen-caption-space aspen-caption-region' : 'hidden') : ''}>
        {showPlaybackCaption && playbackCaption && <div className="flex min-h-0 flex-1 flex-col rounded-md border border-border bg-background/95 p-1.5"><PlaybackCaption caption={playbackCaption} /></div>}
        <div aria-label={t("voice.transcriptLabel")} tabIndex={0} className={`${showPlaybackCaption || (faceFirst && !captions) ? 'hidden' : ''} ${faceFirst ? 'min-h-0 flex-1' : 'max-h-[4.5rem]'} space-y-1 overflow-y-auto overscroll-contain rounded-md border border-border bg-background/95 p-1.5`}>
          {turns.length === 0 && (!partialAspen || faceFirst) && !partialUser && (
            <p className="py-1 text-center text-[11px] text-muted-foreground">{t("voice.noConversation")}</p>
          )}
          {/* TWO-SIDE COLOURS (Ron, 2026-11-16): the visitor's lines
              wear the emerald primary bubble; Aspen's lines wear a
              violet accent-tinted bubble — the same two treatments as
              the typed chat thread, so a conversation reads the same
              in voice captions and in Type mode. */}
          {turns.map((turn, i) => turn.role === "divider" ? (
            <div key={i} role="separator" className="py-0.5 text-center text-[10px] font-medium text-muted-foreground">{t("voice.handoffTo", { name: PERSONAS[turn.speaker ?? "aspen"].displayName })}</div>
          ) : (
            <Message key={i} from={turn.role} className="max-w-full">
              <MessageContent aria-label={transcriptAriaLabel(turn.role)} className={turn.role === "user" ? "bg-primary text-primary-foreground text-xs px-2 py-1" : faceFirst ? "rounded-md bg-accent/15 px-2 py-1 text-sm font-bold leading-6 text-foreground" : "rounded-md bg-accent/15 px-2 py-1 text-xs text-foreground"}>
                {turn.speaker && <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide opacity-70">{PERSONAS[turn.speaker].displayName}</span>}
                <MessageResponse>{turn.role === "user" ? turn.text : displayNumbers(turn.text)}</MessageResponse>
              </MessageContent>
            </Message>
          ))}
          {partialUser && <Message from="user"><MessageContent className="bg-primary text-primary-foreground text-sm font-bold"><span className="text-[10px] font-semibold">{t("voice.you")}</span><MessageResponse>{partialUser}</MessageResponse></MessageContent></Message>}
          {!faceFirst && partialAspen && <Message from="assistant"><MessageContent className="rounded-md bg-accent/15 px-2 py-1 text-sm font-bold"><MessageResponse>{displayNumbers(partialAspen)}</MessageResponse></MessageContent></Message>}
          <div ref={transcriptEndRef} />
        </div>
        </div>

        {confirmation}
        {formWaitingChip}
        {demoEntryCard}
        {actionNotice && <p role="status" className="text-xs text-primary">{actionNotice}</p>}
        {swapNotice && <p role="status" className="text-xs text-primary">{swapNotice}</p>}
        {videoFallback && <p role="status" className="text-[11px] text-muted-foreground">{t("voice.videoFallback", { name: speakerName })}</p>}
        {!wideLandscape && transportControls}
        {phase === "live" && speakerOutputNotice && (
          <p role="status" className="text-[11px] text-muted-foreground">{speakerOutputNotice}</p>
        )}
        {/* LAYOUT REFINEMENT (Scalone batch Item 8a): the microphone-
            environment controls (ambient readout + Quiet / Normal /
            Noisy pills + Auto) no longer occupy a permanent panel
            row — they live in the settings dialog below, next to the
            noise-filtering select and the Mic level meter. The panel
            keeps its freed height for captions (2–3 lines). */}
        {showMicHint && phase === "live" && (
          <div role="status" className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/60 p-2 text-[11px] text-foreground">
            <span>{t("panel.micMuted", { defaultValue: "I can’t hear you — your microphone may be muted or set to the wrong one." })}</span>
            <Button size="sm" variant="outline" className="aspen-panel-btn h-7 text-[11px] hover:bg-muted hover:text-foreground" onClick={() => setShowSettings(true)}>{t("panel.checkMicrophone")}</Button>
          </div>
        )}
        {/* Zero-input guard: persistent until audio actually flows
            (or the visitor mutes/pauses on purpose). The recovery
            button re-acquires the microphone in one tap. */}
        {showMicWatchdog && phase === "live" && (
          <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-2 text-[11px] text-foreground">
            <span>{t("panel.micNoSound")}</span>
            <Button size="sm" variant="outline" className="aspen-panel-btn h-7 text-[11px] hover:bg-muted hover:text-foreground" onClick={() => void recoverMicrophone()}>{t("panel.reconnectMicrophone")}</Button>
          </div>
        )}
        {/* Silent-stream guard (chat-fix6): the path is alive but
            the level never rises — warning toned, not destructive.
            The button opens voice settings (the mic picker); the X
            dismisses, and the evaluator re-checks once at ~15s. */}
        {showSilentMic && phase === "live" && (
          <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md border border-warning/60 bg-warning/10 p-2 text-[11px] text-foreground">
            <span>{t("panel.micSilent")}</span>
            <Button size="sm" variant="outline" className="aspen-panel-btn h-7 text-[11px] hover:bg-muted hover:text-foreground" onClick={() => setShowSettings(true)}>{t("panel.checkMicrophone")}</Button>
            <button type="button" aria-label={t("demo.dismiss", { defaultValue: "Dismiss" })} onClick={() => { silentMicRef.current = false; setShowSilentMic(false); }} className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted"><X className="h-3.5 w-3.5" /></button>
          </div>
        )}
        {phase === "live" && captureMode === "hold" && (
          <p role="status" className="w-fit rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-foreground">{t("panel.holdToTalk", { defaultValue: "Hold to talk is ON — hold the button while you speak" })}</p>
        )}
        {audioNeedsTap && <p role="status" className="text-[11px] text-muted-foreground">{t("voice.audioTapNeeded")}</p>}
        {/* Playout startup guard (chat-fix3): her voice was delivered
            but the terminal never started moving (a session that
            auto-started without a fresh tap gesture) — the pill's
            tap re-primes playout inside the gesture. It hides the
            moment the terminal clock advances (see primeSound). */}
        {soundBlocked && phase === "live" && (
          <button type="button" onClick={primeSound} className="flex w-fit items-center gap-1.5 rounded-full border border-warning/60 bg-warning/15 px-3 py-1.5 text-[11px] font-semibold text-foreground shadow-sm transition-colors hover:bg-warning/25">
            <Volume2 className="h-3.5 w-3.5" />{t("panel.tapForSound")}
          </button>
        )}
        {error && (micFailureKind === "mic-denied-embedded" ? <EmbeddedMicrophoneNotice compact name={personaLabelName} /> : <p className="text-[11px] font-semibold text-destructive">{error}</p>)}
        {signInAction}

        {showSettings && (
          <Dialog open={showSettings} onOpenChange={setShowSettings}><DialogContent className="max-h-[85dvh] w-[calc(100vw-24px)] max-w-sm overflow-y-auto"><DialogTitle>{t("voice.voiceSettings")}</DialogTitle><DialogDescription>{t("voice.voiceSettingsDesc")}</DialogDescription><div className="space-y-3">
            {phase !== "idle" && <div className="space-y-2 rounded-md border border-border p-3">
              <p role="status" className="text-xs text-foreground">{t("voice.settingsLiveNote")}</p>
              <Button variant="destructive" size="sm" onClick={stopEverything}><PhoneOff className="mr-1.5 h-3.5 w-3.5" />{t("voice.endCallToEdit")}</Button>
            </div>}
            <label className="block space-y-1 text-xs">{t("voice.noiseFiltering")}
              <Select value={noiseFilter} onValueChange={value => chooseNoiseFilter(value as NoiseFilter)}>
                <SelectTrigger aria-label={t("voice.micSensitivity")} className="h-auto min-h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="light">{t("voice.noiseLight")}</SelectItem><SelectItem value="balanced">{t("voice.noiseBalanced")}</SelectItem><SelectItem value="strong">{t("voice.noiseStrong")}</SelectItem></SelectContent>
              </Select>
            </label>
            {/* Mic environment (Scalone batch Item 8a — moved off the
                panel's permanent rows into this settings dialog): the
                live ambient readout and the same Quiet / Normal /
                Noisy segmented control the panel row carried, wired
                to the same chooseNoiseFilter state, Auto chip and all.
                The Mic level meter sits further down in this dialog. */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-muted-foreground">{t("voice.micEnvironment")}</span>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <span data-testid="ambient-level-label">{ambientLevel === "quiet" ? t("voice.envQuiet") : ambientLevel === "noisy" ? t("voice.envNoisy") : t("voice.envNormal")}</span>
                <div className="ml-auto flex items-center gap-0.5" role="group" aria-label={t("voice.micEnvironment")}>
                  {([["light", "envQuiet"], ["balanced", "envNormal"], ["strong", "envNoisy"]] as const).map(([value, labelKey]) => (
                    <button key={value} type="button" aria-pressed={noiseFilter === value} data-noise-filter={value} onClick={() => chooseNoiseFilter(value)} className={`flex min-h-8 items-center rounded-full px-2 text-[11px] font-semibold transition-colors ${noiseFilter === value ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-muted/70"}`}>{t(`voice.${labelKey}`)}</button>
                  ))}
                  {!noiseFilterManual && <span data-testid="noise-auto-indicator" className="ml-1 rounded-full border border-primary/40 px-1.5 py-0.5 text-[10px] font-semibold text-primary">{t("voice.envAuto")}</span>}
                </div>
              </div>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground">{t("voice.microphone")}</label>
              <div className="mt-1 flex gap-2">
                <Select value={draftMicrophone} onValueChange={setDraftMicrophone} disabled={phase !== "idle"}>
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
              <Select value={draftCaptureMode} onValueChange={(value) => setDraftCaptureMode(value as CaptureMode)}>
                <SelectTrigger aria-label={t("voice.conversationMode")} className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="handsfree">{t("voice.handsFree")}</SelectItem>
                  <SelectItem value="hold">{t("voice.holdMode")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span>{t("panel.micLevelShort")}</span>
              <meter min="0" max="100" value={micLevel} aria-label={t("panel.micLevel")} className="h-2 w-24" />
              <span>{micLevel > 3 ? t("panel.micSound") : t("panel.micQuiet")}</span>
            </div>
            {/* Speaker volume (2026-11-13): the guaranteed in-panel level
                for BOTH playback paths — on Android the hardware keys
                can miss the paired stream entirely (see
                lib/playbackVolume.ts). Lives with the other voice
                settings inside this dialog, per the panel layout rules
                (no new control over the portrait). */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="aspen-speaker-volume" className="text-[11px] font-semibold text-muted-foreground">{t("voice.speakerVolume")}</label>
                <span className="text-[11px] text-muted-foreground">{Math.round(playbackVolume * 100)}%</span>
              </div>
              <input id="aspen-speaker-volume" type="range" min={0} max={100} step={1} value={Math.round(playbackVolume * 100)} onChange={(e) => applyPlaybackVolume(Number(e.target.value) / 100)} aria-label={t("voice.speakerVolume")} className="w-full accent-primary" />
            </div>
            <div className="space-y-2 border-t border-border pt-3">
              <p className="text-[11px] text-muted-foreground">{t("voice.settingsApplyHint")}</p>
              {settingsPending && <p role="status" className="text-[11px] font-semibold text-foreground">{t("voice.settingsPendingHint")}</p>}
              <Button className="w-full" onClick={applyVoiceSettings} disabled={!settingsPending && !settingsJustApplied} aria-label={t("voice.applySettings")}>
                {settingsJustApplied ? t("voice.settingsApplied") : t("voice.applySettings")}
              </Button>
              {settingsJustApplied && <p role="status" className="text-[11px] text-muted-foreground">{t("voice.settingsAppliedDetail")}</p>}
            </div>
            {draft && (
              <Button variant="outline" size="sm" className="h-8 text-xs" disabled={phase !== "idle"} onClick={() => void startConversation(true)} aria-label={t("voice.previewVoice")} title={t("voice.previewVoice")}>
                <Play className="mr-1.5 h-3.5 w-3.5" /> {t("voice.previewVoice")}
              </Button>
            )}
            {phase === "idle" && <Button className="w-full" onClick={() => { if (settingsPending) { applyVoiceSettings(); startAfterApplyRef.current = true; } else { setShowSettings(false); void startConversation(); } }}><Mic className="mr-1.5 h-4 w-4" />{t("voice.startCallWithSettings")}</Button>}
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
          {formWaitingChip}
          {demoEntryCard}
        {actionNotice && <p role="status" className="text-xs text-primary">{actionNotice}</p>}
        {swapNotice && <p role="status" className="text-xs text-primary">{swapNotice}</p>}
        {videoFallback && <p role="status" className="text-xs text-muted-foreground">{t("voice.videoFallback", { name: speakerName })}</p>}
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
              <Select value={noiseFilter} onValueChange={value => chooseNoiseFilter(value as NoiseFilter)}>
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
            <Button variant="destructive" size="sm" onClick={stopEverything}><PhoneOff className="mr-1.5 h-4 w-4" />{t("voice.endCallToEdit")}</Button>
          </div>}
          <div className="flex flex-wrap items-center gap-2">
            {(!compact || draft) && <Button variant="outline" size="sm" disabled={phase !== "idle"} onClick={() => void startConversation(true)} aria-label={t("voice.previewVoice")} title={t("voice.previewVoice")}>
              <Play className="h-4 w-4 mr-2" /> {t("voice.previewVoice")}
            </Button>}
            {!compact && <Button variant="outline" size="sm" disabled={phase !== "idle" || savedVoice === voice} onClick={() => {
              try { localStorage.setItem("gemini-aspen-voice", voice); setSavedVoice(voice); setStatus(`${voice} saved for Gemini calls in this browser.`); } catch { setError("Your browser could not save the voice preference."); }
            }}><Save className="h-4 w-4 mr-2" /> {t("voice.saveVoice")}</Button>}
            {phase === "preview" && <span className="text-xs text-muted-foreground">{t("voice.voicePreviewSuffix", { voice })}</span>}
            <Button variant="outline" size="sm" className="aspen-panel-btn hover:bg-muted hover:text-foreground" disabled={!hasReplay || paused || replaying || aspenSpeaking || phase === "connecting" || phase === "preview"} onClick={() => void replayLastMessage()} title={t("voice.replayAudioTitle")}><RotateCcw className="mr-2 h-4 w-4" />{t("voice.replayLastMessage")}</Button>
            {replaying && <Button variant="outline" size="sm" className="aspen-panel-btn hover:bg-muted hover:text-foreground" onClick={clearPlayback}><PhoneOff className="mr-2 h-4 w-4" />{t("voice.stopReplay")}</Button>}
            {phase === "live" && <Button variant={muted ? "warning" : "outline"} className={muted ? undefined : "aspen-panel-btn hover:bg-muted hover:text-foreground"} size="sm" disabled={handoffActive} aria-pressed={muted} onClick={toggleMicMute}>{muted ? <MicOff className="mr-2 h-4 w-4" /> : <Mic className="mr-2 h-4 w-4" />}{muted ? t("voice.unmuteMic") : t("voice.muteMic")}</Button>}
            {phase === "live" && <Button variant={paused ? "default" : "outline"} className={paused ? undefined : "aspen-panel-btn hover:bg-muted hover:text-foreground"} size="sm" aria-pressed={paused} disabled={handoffActive} onClick={togglePause}>{paused ? <Play className="mr-2 h-4 w-4" /> : <Pause className="mr-2 h-4 w-4" />}{paused ? t("voice.resume") : t("voice.pause")}</Button>}
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
                  {swapConnecting ? `Connecting ${PERSONAS[swapConnecting].displayName}…` : paused ? t("voice.pausedResume") : replaying ? t("voice.replayingMicPaused") : muted ? t("voice.micMuted") : aspenSpeaking ? t("voice.isSpeaking", { name: speakerName }) : captureMode === "hold" && !held ? t("voice.micPaused") : t("voice.listening")}
                  {" — "}
                </span>
              )}
              {status}
            </p>
          </div>
          {showMicHint && phase === "live" && (
            <div role="status" className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/60 p-2 text-xs text-foreground">
              <span>{t("panel.micMutedLong")}</span>
            </div>
          )}
          {showMicWatchdog && phase === "live" && (
            <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-2 text-xs text-foreground">
              <span>{t("panel.micNoSound")}</span>
              <Button size="sm" variant="outline" className="aspen-panel-btn h-7 text-[11px] hover:bg-muted hover:text-foreground" onClick={() => void recoverMicrophone()}>{t("panel.reconnectMicrophone")}</Button>
            </div>
          )}
          {/* Silent-stream guard (chat-fix6): see the face-first
              panel's notice — same guard, same actions. */}
          {showSilentMic && phase === "live" && (
            <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md border border-warning/60 bg-warning/10 p-2 text-xs text-foreground">
              <span>{t("panel.micSilent")}</span>
              <Button size="sm" variant="outline" className="aspen-panel-btn h-7 text-[11px] hover:bg-muted hover:text-foreground" onClick={() => setShowSettings(true)}>{t("panel.checkMicrophone")}</Button>
              <button type="button" aria-label={t("demo.dismiss", { defaultValue: "Dismiss" })} onClick={() => { silentMicRef.current = false; setShowSilentMic(false); }} className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted"><X className="h-3.5 w-3.5" /></button>
            </div>
          )}
          {phase === "live" && <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{t("voice.microphone")}</span><meter min="0" max="100" value={micLevel} aria-label={t("voice.micLevel")} className="h-3 w-24" />
            <span>{micLevel > 3 ? t("voice.soundDetected") : t("voice.quiet")}</span>
          </div>}
          {phase === "live" && captureMode === "hold" && (
            <p role="status" className="w-fit rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-foreground">{t("panel.holdToTalk", { defaultValue: "Hold to talk is ON — hold the button while you speak" })}</p>
          )}
          {audioNeedsTap && <p role="status" className="text-xs text-muted-foreground">{t("voice.audioTapNeeded")}</p>}
          {/* Playout startup guard (chat-fix3): see the face-first
              panel's pill — same watch, same tap-to-prime heal. */}
          {soundBlocked && phase === "live" && (
            <button type="button" onClick={primeSound} className="flex w-fit items-center gap-1.5 rounded-full border border-warning/60 bg-warning/15 px-3 py-1.5 text-xs font-semibold text-foreground shadow-sm transition-colors hover:bg-warning/25">
              <Volume2 className="h-3.5 w-3.5" />{t("panel.tapForSound")}
            </button>
          )}
          {error && (micFailureKind === "mic-denied-embedded" ? <EmbeddedMicrophoneNotice name={personaLabelName} /> : <p className="text-xs text-destructive font-semibold">{error}</p>)}
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
              <MessageContent aria-label={transcriptAriaLabel(turn.role)} className={turn.role === "user" ? "bg-primary text-primary-foreground" : "rounded-md bg-accent/15 px-2 py-1 text-foreground"}>
                {turn.speaker && <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide opacity-70">{PERSONAS[turn.speaker].displayName}</span>}
                <MessageResponse>{turn.role === "user" ? turn.text : displayNumbers(turn.text)}</MessageResponse>
              </MessageContent>
            </Message>
          ))}
          {partialUser && <Message from="user"><MessageContent className="bg-primary text-primary-foreground"><MessageResponse>{partialUser}</MessageResponse></MessageContent></Message>}
          {partialAspen && <Message from="assistant"><MessageContent className="rounded-md bg-accent/15 px-2 py-1"><MessageResponse>{displayNumbers(partialAspen)}</MessageResponse></MessageContent></Message>}
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
