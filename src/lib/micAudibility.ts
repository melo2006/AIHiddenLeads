// "We can't hear you" detection for live hands-free voice sessions.
//
// Forensics (2026-11-09, Durgin demo): two consecutive sessions logged
// ZERO user turns while the visitor believed he was speaking — his audio
// never crossed the browser noise gate (wrong mic, muted mic, or a level
// too low for the gate), and the only symptom was Aspen's idle check-in.
// This helper decides when the panel should calmly surface that: Aspen
// has finished a turn, a few seconds pass, capture is running, and not a
// single frame has passed the noise gate and no input transcription has
// arrived since her turn ended.

export interface MicAudibilitySnapshot {
  now: number;
  /** A voice session is live. */
  live: boolean;
  /** Hands-free only: in hold mode silence is expected until the press. */
  handsFree: boolean;
  muted: boolean;
  paused: boolean;
  replaying: boolean;
  /** She is currently speaking/generating (not waiting on the visitor). */
  assistantSpeaking: boolean;
  /** When her last turn completed and she started waiting (ms epoch),
   *  or null when she has not finished a turn / is not waiting. */
  awaitingSince: number | null;
  /** Last time a mic frame passed the noise gate (ms epoch, 0 = never). */
  lastGateOpenAt: number;
  /** Last time an input transcription arrived (ms epoch, 0 = never). */
  lastUserTranscriptAt: number;
  /** When the hint was last shown (ms epoch, 0 = never). */
  lastHintAt: number;
  /** A drop-recovery / resumption / reconnect flow is active — the hint
   *  must never compete with recovery. */
  recoveryActive: boolean;
}

/** Silence window after her turn before the hint may show. */
export const MIC_HINT_SILENCE_MS = 7000;
/** Minimum gap between two showings of the hint. */
export const MIC_HINT_COOLDOWN_MS = 20000;

export function shouldShowMicHint(s: MicAudibilitySnapshot): boolean {
  if (!s.live || !s.handsFree || s.muted || s.paused || s.replaying) return false;
  if (s.assistantSpeaking || s.recoveryActive) return false;
  if (s.awaitingSince === null) return false;
  if (s.now - s.awaitingSince < MIC_HINT_SILENCE_MS) return false;
  // Any gate-passing sound or any transcription since she stopped
  // talking means the mic path works — stay silent.
  if (s.lastGateOpenAt > s.awaitingSince) return false;
  if (s.lastUserTranscriptAt > s.awaitingSince) return false;
  if (s.now - s.lastHintAt < MIC_HINT_COOLDOWN_MS) return false;
  return true;
}
