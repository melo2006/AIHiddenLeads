// Startup auto-retry policy for the parent voice start
// (GeminiConversation.startConversation).
//
// Ron's homepage test, 2026-11-23 ~08:33 EST: a single slow start
// on a loaded phone (about 95 tabs open) surfaced the red
// "Starting the voice assistant took too long. Check microphone
// permission and try again." error — a dead end whose only
// recovery was noticing it and pressing Start again by hand. The
// 30 s startup budget covers the WHOLE setup phase (audio unlock,
// microphone acquisition, the gemini-session authorization mint and
// the proxy socket), and the mint itself is a single
// supabase.functions.invoke with no timeout and no retry of its
// own, so any cumulative slowness — a cold edge function, a
// throttled timer, a busy main thread — spent the budget and the
// timer converted it into that error, blaming the microphone even
// when the mic had already been granted.
//
// The fix keeps the budgets but changes what exhausting one means:
// the first transient failure retries the whole start ONCE,
// silently (fresh generation, fresh visitor key, fresh mint), with
// the status line switching to a calm "still connecting" message
// instead of an error. Only a second failure shows the hard error.
//
// NEVER retried, by kind:
// - 'permission' — the visitor (or the browser) refused the
//   microphone. Retrying cannot change that answer and would loop
//   the permission machinery; the accurate denial copy must show.
// - 'tap' / 'sound-blocked' — the browser is withholding audio
//   until a real tap; only the tap-for-sound path resolves it.
// - 'face-refusal' — a definitive video-token refusal. House rule
//   (src/AGENTS.md): a definitive refusal inside the refusal window
//   hard-fails the start; the face pipeline already retries
//   internally before surfacing one.
// - warm (prewarm) starts — a failed prewarm already falls back
//   invisibly to the tap start (failWarm); it must stay invisible.
// - preview starts — the voice lab surfaces failures to the person
//   testing on purpose.

/** Overall budget for one start attempt's setup phase. */
export const STARTUP_TIMEOUT_MS = 30_000;
/** Budget for the proxy's ready signal once the socket exists. */
export const STARTUP_READY_TIMEOUT_MS = 15_000;
/** Automatic retries granted to one visitor start before the hard error shows. */
export const MAX_STARTUP_AUTO_RETRIES = 1;
/** Breathing room between the failed attempt's teardown and the retry. */
export const STARTUP_RETRY_DELAY_MS = 600;

export type StartupFailureKind =
  | 'timeout' // the overall setup budget ran out
  | 'no-response' // socket opened but the proxy never signalled ready
  | 'transient' // a network / device hiccup during setup (mint, mic device)
  | 'permission' // microphone permission denied — never retried
  | 'tap' // audio withheld until a real tap — never retried
  | 'face-refusal' // definitive video-token refusal — never retried
  | 'other'; // unclassified — never retried (conservative)

const RETRYABLE_KINDS: ReadonlySet<StartupFailureKind> = new Set([
  'timeout',
  'no-response',
  'transient',
]);

export interface StartupRetryInput {
  kind: StartupFailureKind;
  /** Automatic retries already spent on this visitor start. */
  retriesUsed: number;
  warm: boolean;
  preview: boolean;
}

/** True when a failed start attempt may retry silently instead of erroring. */
export function startupRetryAllowed(input: StartupRetryInput): boolean {
  if (input.warm || input.preview) return false;
  if (input.retriesUsed >= MAX_STARTUP_AUTO_RETRIES) return false;
  return RETRYABLE_KINDS.has(input.kind);
}

const KIND_TAG = 'startupFailureKind';

/** Attach a failure kind to an error so the start's catch block can
 *  classify it without string-matching its message. Returns the
 *  error unchanged when it cannot carry a property. */
export function tagStartupError<T>(err: T, kind: StartupFailureKind): T {
  if (err !== null && (typeof err === 'object' || typeof err === 'function')) {
    try {
      (err as Record<string, unknown>)[KIND_TAG] = kind;
    } catch { /* frozen error objects keep their original handling */ }
  }
  return err;
}

export interface StartupErrorSentinels {
  /** The component's MICROPHONE_DENIED message. */
  microphoneDenied: string;
  /** The component's AUDIO_TAP_NEEDED message. */
  audioTapNeeded: string;
  /** The component's SOUND_BLOCKED message. */
  soundBlocked: string;
}

/** Classify an error thrown by the start's setup phase. Order
 *  matters: an explicit tag wins, then the component's sentinel
 *  messages, then well-known transient error names. Anything
 *  unrecognized is 'other' and never retries. */
export function classifyStartupError(err: unknown, sentinels: StartupErrorSentinels): StartupFailureKind {
  if (err !== null && (typeof err === 'object' || typeof err === 'function')) {
    const tagged = (err as Record<string, unknown>)[KIND_TAG];
    if (typeof tagged === 'string' && (RETRYABLE_KINDS.has(tagged as StartupFailureKind)
      || tagged === 'permission' || tagged === 'tap' || tagged === 'face-refusal' || tagged === 'other')) {
      return tagged as StartupFailureKind;
    }
  }
  if (err instanceof Error) {
    if (err.message === sentinels.microphoneDenied) return 'permission';
    if (err.message === sentinels.audioTapNeeded || err.message === sentinels.soundBlocked) return 'tap';
    // Sound withheld by the browser surfaces as a NotAllowedError
    // from the audio side (the microphone's own NotAllowedError is
    // converted to the MICROPHONE_DENIED sentinel before it can
    // reach the catch, so a bare NotAllowedError here is audio).
    if (err.name === 'NotAllowedError') return 'tap';
    // The session mint's transport failed before any answer came
    // back (supabase-js FunctionsFetchError), or the mic device was
    // busy / the acquisition aborted — both can clear on a retry.
    if (err.name === 'FunctionsFetchError' || err.name === 'NotReadableError' || err.name === 'AbortError') {
      return 'transient';
    }
    if (err.name === 'TypeError' && /fetch|network/i.test(err.message)) return 'transient';
  }
  return 'other';
}
