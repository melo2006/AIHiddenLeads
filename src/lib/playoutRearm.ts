/**
 * Playout recovery guard policy (Publish #62).
 *
 * Root cause this guards against (Ron's live test, 2026-11-15,
 * Supabase sessions 71f6acf2 / ac082762, Frank presenter demo):
 * a session starts clean on the blob engine (playoutDiag
 * term=blob-element, prate=1.00, stalls=0), the blob engine's
 * in-place stall ladder cannot clear a wedged element inside its
 * ~6 s episode budget, and the engine dies with
 * fail("element-stalled"). GeminiConversation's fatal handler
 * then marked the engine slot 'failed' PERMANENTLY: no fresh
 * engine was ever constructed, so every later chunk routed to
 * the WebAudio media-stream sink (term=media-stream, crate=48000)
 * — the mis-rated path whose rate witness sagged rw=0.85..0.96
 * for the rest of the session. One stall silently demoted the
 * whole call to the wobbling fallback, and rec stayed 0 because
 * the only recovery counter lived on the dead engine.
 *
 * The guard's decision, taken once per engine fatal:
 *  - 'rearm': a BLOB engine died of a stall-class reason and the
 *    per-conversation budget has attempts left → retire it and
 *    arm a FRESH blob engine. The sink graph bridges only the
 *    stranded-speech drain and the new engine's start window;
 *    it is never the settled terminal again.
 *  - 'reconnect': a blob engine died of a stall-class reason and
 *    the budget is spent → surface the existing bounded session
 *    reconnect path instead of settling on the sink.
 *  - 'settle': everything else — the pre-#62 behaviour verbatim.
 *    Platform/config deaths (no WebCodecs encoder, unsupported
 *    config, mux/encode exceptions) are facts a fresh instance
 *    would hit identically, and the MSE engine behind the
 *    ?heardEngine=element opt-in keeps its documented sink
 *    fallback: the guard exists to protect the DEFAULT engine,
 *    not to rewrite the A/B escape hatches.
 *
 * The stall counters are conversation totals, not per-instance
 * state: when an engine is retired its counters carry forward
 * (combineEngineCounters), and each successful re-arm adds one
 * recovery — so the playoutDiag stamps (stalls=/rec=) make the
 * guard's work countable from the session record: stalls≥1 with
 * rec≥1 and term=blob-element means a stall happened and a
 * re-arm, not the sink, recovered the session.
 */
import type { HeardElementEngine } from "@/lib/mediaElementPlayout";

/** Fresh blob engines armed per conversation after the first
 *  one dies of a stall. Each wedged engine costs its ~6 s ladder
 *  budget before dying, so 2 re-arms bound the degraded window
 *  before the session reconnect path takes over. */
export const MAX_BLOB_ENGINE_REARMS = 2;

/** The fatal reasons a fresh blob engine can plausibly cure:
 *  the heard ELEMENT wedged (its stall ladder exhausted) or the
 *  element rejected two consecutive files. Both are states of
 *  the retired instance's element/decoder, not of the platform.
 *  Every other reason (unsupported, encoder-unsupported,
 *  no-encoder, encoder-error, encode/mux exceptions, exception)
 *  describes the platform or the encode pipeline, which a fresh
 *  instance would meet unchanged. */
export const BLOB_REARMABLE_REASONS: ReadonlySet<string> = new Set([
  "element-stalled",
  "element-error",
]);

export type EngineRearmDecision = "rearm" | "reconnect" | "settle";

export function engineRearmDecision(input: {
  /** The dying engine's kind; null when no engine exists. */
  kind: HeardElementEngine["kind"] | null;
  /** The engine's fail() reason. */
  reason: string;
  /** Re-arms already spent in this conversation. */
  rearmAttempts: number;
  maxRearms?: number;
}): EngineRearmDecision {
  if (input.kind !== "blob") return "settle";
  if (!BLOB_REARMABLE_REASONS.has(input.reason)) return "settle";
  return input.rearmAttempts < (input.maxRearms ?? MAX_BLOB_ENGINE_REARMS) ? "rearm" : "reconnect";
}

/**
 * The playout diag's stall counters as conversation totals: the
 * carry from every retired engine plus the live engine's own.
 * When no engine exists and nothing has carried yet, both come
 * back undefined — the diag renders '-' exactly as it did before
 * the guard existed, so pre-#62 stamp shapes are unchanged on
 * sessions the guard never touched.
 */
export function combineEngineCounters(
  carry: { stalls: number; recoveries: number },
  engine: { stallCount: number; recoveryCount: number } | null | undefined,
): { stalls: number | undefined; recoveries: number | undefined } {
  if (!engine && carry.stalls === 0 && carry.recoveries === 0) {
    return { stalls: undefined, recoveries: undefined };
  }
  return {
    stalls: carry.stalls + (engine?.stallCount ?? 0),
    recoveries: carry.recoveries + (engine?.recoveryCount ?? 0),
  };
}
