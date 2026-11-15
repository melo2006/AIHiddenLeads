/**
 * Handoff-leg recovery (2026-11-14): the three client-side defects
 * behind tonight's failed manager-handoff returns, and the pure
 * helpers that fix them. Forensics (homepage Aspen sessions,
 * 2026-11-14 ~21:00 EST, Edge route):
 *
 *  1. MIC DEATH ON RETURN. The handoff machinery pauses Gemini
 *     capture during the Twilio browser leg and retains the voice
 *     session for return — but a socket drop mid-leg (1006/1011)
 *     runs the FULL teardown, which stops the mic tracks, and the
 *     silent reconnect then re-acquires the microphone with a
 *     fresh getUserMedia — outside any user gesture, while the
 *     Twilio device is still releasing its own capture. That call
 *     rejected NotAllowedError: the return session's authorization
 *     row was created and the session NEVER STARTED, and the panel
 *     showed "Microphone permission was denied". The fix below
 *     retains the pre-handoff stream across a handoff-adjacent
 *     teardown (visit-scoped stash, the same pattern as the
 *     persona-chain stash) and lets the return start adopt the
 *     still-live stream instead of asking the browser again.
 *
 *  2. ANNOUNCEMENT REPLAY. A return that lands as a NEW session
 *     is built from the visit-memory recap, whose last assistant
 *     line is the transfer announcement itself ("I'll transfer you
 *     to Ron … now. I'll stay right here until you're through…").
 *     The drop-reconnect opening tells the model to continue from
 *     the recap, so the return session opened by RE-SPEAKING the
 *     announcement, concatenated with the welcome-back. The
 *     announcement is a say-it-once line: it is stripped from the
 *     recap, and a [visit fact] line (the teamIntroSeen pattern)
 *     tells the return session the transfer was already announced
 *     and how the leg ended.
 *
 *  3. NO HANDOFF OUTCOME ON THE RECORD. Whether the manager's
 *     phone rang, connected, or the return even started was
 *     unknowable from the session row. The handoffDiag stamp
 *     below (playoutDiag/micDiag's sibling — same `k=v;` line,
 *     same gemini-session diag channel, landing at
 *     config.handoffDiag) records: announced, leg started, leg
 *     outcome, return started / return failed, and the mic state
 *     on return. Sessions with no handoff never stamp, so their
 *     records stay byte-identical.
 */

/* ------------------------------------------------------------------ */
/* 1 — retained microphone stream (page-visit scope).                  */
/* ------------------------------------------------------------------ */

/** Structural minimum of a MediaStream for the retention logic —
 *  the real MediaStream satisfies it, and tests can fake it. */
export interface MicStreamLike {
  getAudioTracks(): { readyState: string; stop(): void }[];
}

/** True when the stream carries at least one audio track that has
 *  not ended. A retained stream whose track ended while stashed
 *  (permission revoked, device unplugged) is NOT reusable — the
 *  return start must fall back to a fresh getUserMedia. */
export function micStreamIsLive(stream: MicStreamLike | null | undefined): boolean {
  if (!stream) return false;
  try {
    return stream.getAudioTracks().some((t) => t.readyState === "live");
  } catch {
    return false;
  }
}

/** The stream a (re)start should capture from: the stream already
 *  wired in wins, then the retained handoff stream; null when
 *  neither is live and the caller must ask the browser again. */
export function reusableMicStream<T extends MicStreamLike>(
  current: T | null | undefined,
  retained: T | null | undefined,
): T | null {
  if (micStreamIsLive(current)) return current as T;
  if (micStreamIsLive(retained)) return retained as T;
  return null;
}

let retainedHandoffMic: MicStreamLike | null = null;

/** Stash the live pre-handoff stream instead of stopping its
 *  tracks at teardown. A non-live stream is never stashed. A
 *  previously stashed stream it replaces is stopped (it was
 *  superseded without being consumed). */
export function retainHandoffMic(stream: MicStreamLike | null | undefined): void {
  if (retainedHandoffMic && retainedHandoffMic !== stream) clearRetainedHandoffMic();
  retainedHandoffMic = micStreamIsLive(stream) ? (stream as MicStreamLike) : null;
}

/** Consume the stash for a return start: returns the stream when
 *  its track is still live; an ended stash is stopped and dropped
 *  (returns null → the caller re-acquires). One-shot: a second
 *  take returns null. */
export function takeRetainedHandoffMic<T extends MicStreamLike>(): T | null {
  const stream = retainedHandoffMic;
  retainedHandoffMic = null;
  if (!stream) return null;
  if (!micStreamIsLive(stream)) {
    try { stream.getAudioTracks().forEach((t) => t.stop()); } catch { /* already gone */ }
    return null;
  }
  return stream as T;
}

/** Stop and drop any stashed stream (a deliberate end of the
 *  conversation: the mic must not stay hot on the visitor's say-so
 *  ending). */
export function clearRetainedHandoffMic(): void {
  const stream = retainedHandoffMic;
  retainedHandoffMic = null;
  if (stream) {
    try { stream.getAudioTracks().forEach((t) => t.stop()); } catch { /* already gone */ }
  }
}

/** Test hook: is a stream currently stashed? */
export function hasRetainedHandoffMic(): boolean {
  return retainedHandoffMic !== null;
}

/* ------------------------------------------------------------------ */
/* 2 — recap hygiene: the announcement is said ONCE.                   */
/* ------------------------------------------------------------------ */

/** Structural minimum of a transcript turn for recap building —
 *  GeminiConversation's Turn satisfies it. */
export interface RecapTurnLike {
  role: string;
  text: string;
}

/** Every server-built transfer announcement opens with this
 *  invariant prefix (see managerTransferAnnouncement in
 *  supabase/functions/_shared/manager-transfer.ts — role, realtor,
 *  named-manager and generic variants all share it). The client
 *  only ever treats a line carrying it as the announcement. */
export const HANDOFF_ANNOUNCEMENT_PREFIX = "I'll transfer you to ";

/** True when a line of text is the transfer announcement (the
 *  model's spoken line may carry surrounding whitespace). */
export function isHandoffAnnouncement(text: string): boolean {
  return typeof text === "string" && text.trimStart().startsWith(HANDOFF_ANNOUNCEMENT_PREFIX);
}

/**
 * Remove the announcement turn(s) from the turns a return
 * session's recap is built from. Only ASSISTANT turns whose text
 * matches the captured announcement exactly (trimmed) are cut —
 * a visitor quoting the line, or any other assistant line, is
 * untouched. Returns the input array unchanged when nothing
 * matches, so non-handoff recaps stay byte-identical.
 */
export function stripHandoffAnnouncement<T extends RecapTurnLike>(turns: T[], announcement: string | null | undefined): T[] {
  const target = typeof announcement === "string" ? announcement.trim() : "";
  if (!target) return turns;
  const kept = turns.filter((t) => !(t.role === "assistant" && t.text.trim() === target));
  return kept.length === turns.length ? turns : kept;
}

export type HandoffOutcomeFact = "completed" | "unavailable" | "unknown";

/** The [visit fact] line appended to a return session's recap
 *  (the teamIntroSeen pattern in GeminiConversation): data for
 *  the opening instruction, telling the return session the
 *  transfer was ALREADY announced and how the leg ended — so it
 *  never re-announces a transfer the visitor already heard
 *  about, and the welcome-back comes from the handoff_ended
 *  injection, not from re-running the transfer beat. */
export function handoffVisitFact(outcome: HandoffOutcomeFact): string {
  const outcomeText = outcome === "completed"
    ? "the visitor spoke with the manager and the call ended"
    : outcome === "unavailable"
      ? "no manager answered, or the connection was unavailable"
      : "the leg was interrupted before its outcome was known";
  return `[visit fact] managerHandoff: a manager transfer was already announced to the visitor word for word and the browser handoff leg has ended (${outcomeText}). Do not announce a transfer again.`;
}

/* ------------------------------------------------------------------ */
/* 3 — handoffDiag stamp (config.handoffDiag record).                  */
/* ------------------------------------------------------------------ */

export type HandoffDiagEvent = "announced" | "leg-started" | "ended" | "interrupted" | "return-ok" | "return-failed";
/** The leg outcome as the stamping side knows it: the terminal
 *  outcome the handoff component reported, or 'unknown' when the
 *  leg was cut before any outcome existed. '-' before the leg. */
export type HandoffDiagOutcome = "completed" | "unavailable" | "unknown" | "-";
/** Mic state at stamp time: 'live' = a capture track is live;
 *  'reused' = the return start adopted the retained pre-handoff
 *  stream; 'denied' = the return start's fresh getUserMedia was
 *  refused; otherwise the micDiag track vocabulary. */
export type HandoffDiagMic = "live" | "reused" | "denied" | "muted" | "ended" | "none" | "unknown";

export interface HandoffDiagStamp {
  event: HandoffDiagEvent;
  outcome: HandoffDiagOutcome;
  mic: HandoffDiagMic;
}

/** The compact one-line form stored in the session record, in
 *  the same `k=v;` style as playoutDiagDetail / micDiagDetail so
 *  a SQL eyeball reads all three the same way. */
export function handoffDiagDetail(s: HandoffDiagStamp): string {
  return [`ev=${s.event}`, `out=${s.outcome}`, `mic=${s.mic}`].join(";");
}

export interface HandoffDiagPayload {
  sessionId: string;
  detail: string;
  at: number;
}

export function handoffDiagPayload(sessionId: string, stamp: HandoffDiagStamp, at: number): HandoffDiagPayload {
  return { sessionId, detail: handoffDiagDetail(stamp).slice(0, 400), at };
}

/** Dedupe key (session-scoped, like micDiagSignature): a new
 *  session's first stamp always lands; identical repeats within
 *  a session post once. */
export function handoffDiagSignature(payload: HandoffDiagPayload): string {
  return `${payload.sessionId}|${payload.detail}`;
}
