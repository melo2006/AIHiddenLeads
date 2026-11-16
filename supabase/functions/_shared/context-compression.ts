// Gemini Live context-window compression — pure helpers for the Live
// proxy (gemini-live-proxy), Publish #85a.
//
// WHY: Google charges for a Live session PER TURN for every token in
// the session context window — the system instruction plus the whole
// conversation history so far (Live API best practices:
// https://ai.google.dev/gemini-api/docs/live-api/best-practices —
// "The API charges you per turn for all tokens present in the session
// context window"). In Nov 1–15 that re-billing made text input
// 42.9M tokens / $32.15 — 64% of the Live gross. Context caching
// cannot help: the gemini-3.8-live model page lists Caching as NOT
// supported (https://ai.google.dev/gemini-api/docs/models/gemini-3.8-live),
// and BidiGenerateContentSetup has no cachedContent field. Compression
// is the session-config lever that exists: a server-side sliding
// window that prunes the OLDEST conversation turns once the context
// grows past a trigger, so per-turn billing plateaus instead of
// climbing to the 128K window cap (session management guide:
// https://ai.google.dev/gemini-api/docs/live-api/session-management).
// It also lifts the ~15-minute uncompressed audio-session limit.
//
// WHAT COMPRESSION NEVER TOUCHES: the system instruction is part of
// the setup, not a conversation turn — pruning removes old TURNS
// only, so the persona layers and the business knowledge base stay
// in force for the whole session. Facts that must survive pruning
// (visitor name, criteria, captured contact, consent) already live
// OUTSIDE the provider session in our own systems — the visitMemory
// recap (first 6 + last 30 turns), the discovery criteria ledger and
// the gate state — and are re-injected on resume/swap, so an old
// turn falling out of the provider window loses wording, not facts.
//
// SIZING: the trigger/target are derived from THIS session's own
// instruction size, estimated at setup from the composed prompt, so
// the prune target always sits ABOVE the instruction floor (a fixed
// target could sit below a big-KB session's floor and strip its
// whole history every turn). The estimator divides chars by 3.25 —
// deliberately conservative against the ~4 chars/token of English
// prose — so the estimate overstates the true instruction size and
// the target errs on the safe side. On top of the estimate:
// - HISTORY_ALLOWANCE_TOKENS of conversation growth is allowed
//   before the first prune (~16+ minutes of dense two-way audio at
//   25 tokens/second/direction, plus injected directives and tool
//   results — far beyond a normal demo's growth);
// - KEPT_HISTORY_TOKENS of the most recent history survive a prune
//   (~7 minutes of dense talk) — older ground is covered by the
//   recap/ledger systems above.
// Google's documented ranges: triggerTokens 5,000–128,000,
// targetTokens 0–128,000. The trigger is additionally capped at
// 104,000 in the normal path so pruning engages with margin below
// the 128K hard window; only a session whose instruction estimate
// alone approaches the window pushes it higher (to at most 124,000),
// and the prune span never goes below MIN_PRUNE_SPAN_TOKENS.

/** Kill switch: set LIVE_CONTEXT_COMPRESSION=off in the function
 *  environment to remove the field from the setup entirely (the
 *  setup is then byte-identical to the pre-#85a shape). Default ON —
 *  a deliberate deviation from the default-off feature-flag pattern:
 *  this is a cost control, and the field is inert for any session
 *  that never reaches its trigger. */
export function contextCompressionEnabled(env: (name: string) => string | undefined): boolean {
  return env('LIVE_CONTEXT_COMPRESSION') !== 'off';
}

/** Conservative chars-per-token divisor for the instruction estimate. */
export const COMPRESSION_CHARS_PER_TOKEN = 3.25;
/** Conversation growth (tokens) allowed before the first prune. */
export const COMPRESSION_HISTORY_ALLOWANCE_TOKENS = 24_000;
/** Most-recent history (tokens) kept above the instruction floor
 *  after a prune. */
export const COMPRESSION_KEPT_HISTORY_TOKENS = 10_000;
/** Smallest prune span (trigger − target) the config will emit. */
export const COMPRESSION_MIN_PRUNE_SPAN_TOKENS = 8_000;
/** Trigger bounds for the normal path (Google allows 5,000–128,000). */
export const COMPRESSION_MIN_TRIGGER_TOKENS = 40_000;
export const COMPRESSION_MAX_TRIGGER_TOKENS = 104_000;
/** Absolute trigger ceiling for huge-instruction sessions: still
 *  below the 128K context window, so a prune can engage before the
 *  provider's hard cap does. */
export const COMPRESSION_ABSOLUTE_MAX_TRIGGER_TOKENS = 124_000;
/** Token allowance for the tool declarations in the setup (not part
 *  of the system-instruction text the proxy measures): the largest
 *  observed set — the homepage-sales declarations — serializes to
 *  ~5.9K chars ≈ ~1.7K tokens at the estimator's divisor. */
export const COMPRESSION_TOOLS_ALLOWANCE_TOKENS = 2_000;
/** Char allowance for the setup text appended after the composed
 *  prompt (language lock, visitor details, captured-contact block,
 *  booking/transfer/overage blocks): small next to any real prompt,
 *  counted so small sessions are not underestimated. */
export const COMPRESSION_SETUP_SUFFIX_CHARS = 3_000;

/** Estimate a text's token count at the conservative divisor. */
export function estimateTokensFromChars(chars: number): number {
  if (!Number.isFinite(chars) || chars <= 0) return 0;
  return Math.ceil(chars / COMPRESSION_CHARS_PER_TOKEN);
}

export interface ContextWindowCompressionConfig {
  triggerTokens: number;
  slidingWindow: { targetTokens: number };
}

/** The setup-message contextWindowCompression value for a session
 *  whose instruction (system instruction + tool declarations) is
 *  estimated at `instructionTokens`. Invariants for every input:
 *  5,000 ≤ triggerTokens ≤ 124,000 < 128,000 (Google's window),
 *  0 ≤ targetTokens < triggerTokens, span ≥ MIN_PRUNE_SPAN_TOKENS,
 *  and targetTokens ≥ instructionTokens whenever the instruction
 *  leaves room for that under the window cap. */
export function contextWindowCompressionConfig(instructionTokens: number): ContextWindowCompressionConfig {
  const est = Number.isFinite(instructionTokens) && instructionTokens > 0 ? Math.floor(instructionTokens) : 0;
  const targetWanted = est + COMPRESSION_KEPT_HISTORY_TOKENS;
  let triggerTokens = Math.min(
    COMPRESSION_MAX_TRIGGER_TOKENS,
    Math.max(COMPRESSION_MIN_TRIGGER_TOKENS, est + COMPRESSION_HISTORY_ALLOWANCE_TOKENS),
  );
  if (targetWanted > triggerTokens - COMPRESSION_MIN_PRUNE_SPAN_TOKENS) {
    // Huge-instruction session: raise the trigger toward (never to)
    // the window cap so the prune target can stay above the floor.
    triggerTokens = Math.min(COMPRESSION_ABSOLUTE_MAX_TRIGGER_TOKENS, targetWanted + COMPRESSION_MIN_PRUNE_SPAN_TOKENS);
  }
  // Last resort (instruction estimate alone nearly fills the window):
  // keep the config valid — target below trigger. The estimator is
  // conservative, so the true floor sits below the estimate.
  const targetTokens = Math.min(targetWanted, triggerTokens - COMPRESSION_MIN_PRUNE_SPAN_TOKENS);
  return { triggerTokens, slidingWindow: { targetTokens } };
}
