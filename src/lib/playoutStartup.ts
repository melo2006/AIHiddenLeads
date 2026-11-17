/**
 * Playout startup guard (chat-fix3, 2026-11-16): the OUTPUT mirror
 * of the mic zero-input guard. Ron's second staging test produced
 * the session that named the hole — b21b5884: the server
 * transcript proved Aspen spoke (resume prompt + "Are you still
 * there?"), his mic was live and quiet, and he heard NOTHING for
 * 32 s before ending the session. The steady-state playout engines
 * are proven and LOCKED; what was missing is the STARTUP path: a
 * session that auto-starts on panel open has no fresh tap gesture
 * behind it, so the terminal element's first play() can be refused
 * by the platform's autoplay rules (or the playback context left
 * suspended) with the rejection swallowed — audio is DELIVERED,
 * scheduled, even lip-synced, and never becomes sound.
 *
 * This module is the mechanical watch over that window:
 *  - at the session's FIRST locally-routed audio it records a
 *    baseline (which engine was selected and why, the playback
 *    context's state, the terminal element's paused/muted state,
 *    and the terminal clock);
 *  - 1.5 s later it evaluates the abstracted probe: if audio was
 *    delivered but the clock has not advanced AND the terminal is
 *    in a gesture-fixable state (element paused / context
 *    suspended), the verdict is "blocked" — the component shows
 *    the Tap-for-sound pill, whose tap re-primes (context.resume()
 *    + element.play()) INSIDE the visitor's gesture;
 *  - at 2 s it reports whether the clock advanced, and every
 *    verdict is stamped to the session record (config.startupDiag,
 *    alongside micDiag) so the next silent session explains itself
 *    from the record instead of from guesses.
 *
 * The watch never touches the engines themselves: no steady-state
 * behaviour, no speaker/volume path, no engine choice changes —
 * it observes the terminal the session already selected and, on
 * "blocked", asks the visitor for the one thing the platform
 * wants: a tap.
 */

/** The terminal's observable playout state, abstracted so the
 *  detector is unit-testable without a DOM: the component builds
 *  one of these from whichever terminal is carrying the voice
 *  (engine element, media-sink element, or the bare context). */
export interface PlayoutProbe {
  /** The terminal clock in seconds — element.currentTime on the
   *  element terminals, the context's currentTime on the graph
   *  terminal. null when no clock exists yet. */
  clockSec: number | null;
  /** Terminal element paused; on the context terminal, true while
   *  the context is not running. */
  paused: boolean;
  /** Terminal element muted; null when the terminal has no
   *  element. Diagnostic only — the guard never changes it (the
   *  speaker path is the visitor's). */
  muted: boolean | null;
  /** Playback AudioContext state ('running' | 'suspended' |
   *  'none' when no context exists on this terminal). */
  ctxState: string;
}

/** What was true at the session's first delivered audio. */
export interface StartupBaseline {
  atMs: number;
  /** The heard-engine selection ('blob' | 'element' | 'sink'). */
  engine: string;
  /** Why that engine: 'query' (?heardEngine=), 'stored'
   *  (the saved preference), or 'default'. */
  why: string;
  /** The local terminal carrying the voice at first audio
   *  (localTerminalDiag's sink vocabulary). */
  terminal: string;
  probe: PlayoutProbe;
}

export type StartupVerdict = "pending" | "advancing" | "blocked" | "frozen";

/** The pill's decision point: audio delivered this long ago with
 *  no advance and a gesture-fixable terminal = blocked. */
export const STARTUP_BLOCKED_AFTER_MS = 1500;
/** The diagnostic's advance window (the "did currentTime advance
 *  within 2 s of first audio" fact the record carries). */
export const STARTUP_CHECK_AFTER_MS = 2000;
/** Clock movement that counts as advancing (seconds) — above
 *  clock granularity noise, far below one spoken word. */
export const STARTUP_ADVANCE_EPSILON_SEC = 0.05;

/** Why the heard engine was selected — mirrors resolveHeardEngine's
 *  precedence (query param, then stored preference, then default)
 *  without re-resolving the engine itself. */
export function heardEngineWhy(search: string | null | undefined, stored: string | null | undefined): "query" | "stored" | "default" {
  const valid = (value: string | null | undefined) => value === "blob" || value === "element" || value === "sink";
  if (search) {
    try {
      if (valid(new URLSearchParams(search).get("heardEngine"))) return "query";
    } catch { /* unparsable search — fall through */ }
  }
  return valid(stored) ? "stored" : "default";
}

export interface PlayoutStartupWatch {
  readonly armed: boolean;
  readonly baseline: StartupBaseline | null;
  /** Record the first-audio baseline. First call wins — later
   *  chunks of the same session never re-baseline. */
  noteFirstAudio(baseline: StartupBaseline): void;
  /** Forget the session (a new session re-arms at its go-live). */
  reset(): void;
  /** Has the terminal clock advanced past the baseline clock? */
  advanced(probe: PlayoutProbe): boolean;
  /**
   * The verdict for a probe taken now:
   *  - 'advancing': the clock moved — startup is healthy;
   *  - 'pending': inside the decision window, or nothing armed;
   *  - 'blocked': delivered but not advancing at ≥1.5 s AND the
   *    terminal is gesture-fixable (element paused or context
   *    suspended) — show the Tap-for-sound pill;
   *  - 'frozen': delivered but not advancing at ≥1.5 s with the
   *    terminal NOT gesture-fixable (element playing, context
   *    running, clock still) — a wedged decoder is the engines'
   *    own stall ladder's problem, not a tap's; stamped, no pill.
   */
  evaluate(probe: PlayoutProbe, atMs: number): StartupVerdict;
}

export function createPlayoutStartupWatch(): PlayoutStartupWatch {
  let baseline: StartupBaseline | null = null;
  const advanced = (probe: PlayoutProbe): boolean =>
    baseline !== null
    && probe.clockSec !== null
    && baseline.probe.clockSec !== null
    && probe.clockSec - baseline.probe.clockSec > STARTUP_ADVANCE_EPSILON_SEC;
  return {
    get armed() { return baseline !== null; },
    get baseline() { return baseline; },
    noteFirstAudio(next: StartupBaseline) { if (!baseline) baseline = next; },
    reset() { baseline = null; },
    advanced,
    evaluate(probe: PlayoutProbe, atMs: number): StartupVerdict {
      if (!baseline) return "pending";
      if (advanced(probe)) return "advancing";
      if (atMs - baseline.atMs < STARTUP_BLOCKED_AFTER_MS) return "pending";
      if (probe.paused || probe.ctxState === "suspended") return "blocked";
      return "frozen";
    },
  };
}

/* ------------------------------------------------------------------ */
/* Session-record stamp (config.startupDiag) — micDiag's sibling:     */
/* same channel, same shape, same `k=v;` one-line detail.             */
/* ------------------------------------------------------------------ */

export type StartupDiagEvent = "first" | "blocked" | "check" | "healed";

export interface StartupDiagStamp {
  event: StartupDiagEvent;
  /** Engine selected at first audio + why (baseline facts). */
  engine: string;
  why: string;
  /** Terminal carrying the voice at first audio. */
  terminal: string;
  /** Playback context state AT FIRST AUDIO. */
  ctxState: string;
  /** Terminal element paused / muted AT FIRST AUDIO (muted null
   *  when the terminal has no element). */
  paused: boolean;
  muted: boolean | null;
  /** Whether the terminal clock advanced within the check window
   *  — null on the 'first' stamp (not yet knowable). */
  advanced: boolean | null;
  /** The verdict at stamp time, on the post-first stamps. */
  verdict?: StartupVerdict;
}

/** The compact one-line form stored in the session record, in the
 *  same `k=v;` style as micDiagDetail so a SQL eyeball reads both
 *  the same way. */
export function startupDiagDetail(s: StartupDiagStamp): string {
  const parts = [
    `ev=${s.event}`,
    `eng=${s.engine}`,
    `why=${s.why}`,
    `term=${s.terminal}`,
    `ctx=${s.ctxState}`,
    `epaused=${s.paused ? 1 : 0}`,
    `emut=${s.muted === null ? "-" : s.muted ? 1 : 0}`,
    `adv=${s.advanced === null ? "-" : s.advanced ? 1 : 0}`,
  ];
  if (s.verdict) parts.push(`verdict=${s.verdict}`);
  return parts.join(";");
}

export interface StartupDiagPayload {
  sessionId: string;
  detail: string;
  at: number;
}

export function startupDiagPayload(sessionId: string, stamp: StartupDiagStamp, at: number): StartupDiagPayload {
  return { sessionId, detail: startupDiagDetail(stamp).slice(0, 400), at };
}

/** Dedupe key (session-scoped, like micDiagSignature): a new
 *  session's first stamp always lands; identical repeats within a
 *  session post once. */
export function startupDiagSignature(payload: StartupDiagPayload): string {
  return `${payload.sessionId}|${payload.detail}`;
}
