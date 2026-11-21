/**
 * Voice-first start gate for the moving face (parent session start,
 * 2026-11-21).
 *
 * Before this change, `startConversation` awaited the Simli face
 * start (first displayed frame, with its internal token/connect/
 * frame retries) inside the same Promise.all that produced the
 * voice session — the Gemini WebSocket was only created after the
 * face settled. On the demo page the prewarm runs that same start
 * at page load, so the held session's `ready` was also downstream
 * of the face: a slow face on a phone (heavy captured-site page,
 * LiveKit over a mobile network, rAF-driven frame checks starved
 * by a busy main thread) ate the tap's 15 s activation race, and
 * the visitor got "The voice service did not respond in time" even
 * though the voice service itself was healthy.
 *
 * The gate now decides from the face start's SETTLEMENT STATE at
 * the moment the voice side (mint + microphone + audio unlock) is
 * ready:
 *
 * - Face already settled → exactly the pre-change outcomes
 *   (proceed / voice-only fallback / fail the start).
 * - Face still starting → "voice-first": the conversation proceeds
 *   on the voice session alone; chunks route locally (the segment
 *   voice-first routing in playPcmChunk) and the face attaches when
 *   its start lands. A late settlement can never fail a start that
 *   already went through the gate — worst case it degrades to the
 *   voice-only fallback.
 */

/**
 * How long the start gate waits for a face start that has not
 * settled yet before proceeding voice-first. The window exists for
 * DEFINITIVE refusals — the Simli token endpoint's 4xx answers are
 * marked `final` by the token fetch (no retries), so a refusal is
 * one fast HTTP round trip, while a face that will actually start
 * needs a token + LiveKit connect + first displayed frame (seconds
 * at best). 1.5 s catches the refusal without meaningfully
 * delaying a slow-but-healthy face's voice-first start.
 */
export const FACE_REFUSAL_WINDOW_MS = 1500;

export interface FaceStartOutcome {
  /** The avatar start() resolved true: face live with a displayed frame. */
  started: boolean;
  /** The failure was a video-start failure (timeout / provider drop): degrade to voice-only. */
  fallback: boolean;
}

export interface FaceStartSettlement {
  /** True once the face start promise has resolved or rejected. */
  settled: boolean;
  /** The mapped outcome when the promise resolved; null while pending or when it rejected. */
  outcome: FaceStartOutcome | null;
  /** The rejection reason when the promise rejected with a non-video-start error; otherwise null. */
  error: unknown;
}

export type FaceGateAction =
  /** Face is live: proceed exactly as a face-first start always has. */
  | "proceed"
  /** Video-start failure: engage the voice-only fallback, then proceed. */
  | "fallback"
  /** Hard failure before the gate: abort the start with the original error (pre-change behavior). */
  | "fail"
  /** Face still starting: proceed on voice alone; the face attaches when it lands. */
  | "voice-first";

export function faceGateAction(s: FaceStartSettlement): FaceGateAction {
  if (!s.settled) return "voice-first";
  if (s.error != null) return "fail";
  if (s.outcome?.started) return "proceed";
  if (s.outcome?.fallback) return "fallback";
  // Settled without starting and not a video-start failure (e.g. the
  // avatar view never mounted): the pre-change start failed here
  // with "The moving face could not connect…".
  return "fail";
}

export type LateFaceAction =
  /** The face landed after the gate: attach it (routing flips paired from the next chunk). */
  | "attach"
  /** The face never landed: degrade to the voice-only fallback; the conversation continues. */
  | "fallback";

/**
 * Decision for a face start that settles AFTER the gate passed
 * voice-first. Never "fail": a conversation that is already
 * starting (or live) must not be aborted by its face.
 */
export function lateFaceAction(s: FaceStartSettlement): LateFaceAction {
  return s.error == null && s.outcome?.started ? "attach" : "fallback";
}
