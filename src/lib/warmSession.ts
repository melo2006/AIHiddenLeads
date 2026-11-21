/**
 * Prewarm (held voice session) freshness — demo-prewarm stale fix,
 * 2026-11-21.
 *
 * The /demo-site page prewarms its first voice session silently: the
 * client mints a session and opens the WebSocket with hold=1, so a
 * later tap can start instantly. Server-side tests on 2026-11-20
 * proved a held, never-begun connection dies silently within ~150 s
 * ({"type":"ready"} arrived 0.7 s after connect; after a 150 s
 * silent wait the socket was already dead — sending
 * {"type":"begin"} hit an unexpected EOF). The browser socket can
 * sit half-open through that death: no close/error event fires and
 * readyState may still report OPEN, so the page shows no sign of it.
 *
 * Before this fix, a tap always routed to the warm activation
 * whenever a warm session object existed, so a visitor who read the
 * demo page for a couple of minutes before tapping activated a
 * corpse: stuck on "Connecting…" or, after the 15 s ready race,
 * "The voice service did not respond in time." Retries hit the same
 * dead warm state.
 *
 * The rule here is deliberately conservative: a warm session is only
 * trusted for activation while it is YOUNG and its socket is OPEN.
 * Anything else is torn down at tap time and the tap falls through
 * to a normal cold start (fresh mint + connect), which is the path
 * that always worked. A still-warming session (no ready yet, socket
 * not terminally dead) is NOT condemned here — the activation path
 * already waits on its ready promise, and its close/error handlers
 * clear the warm state if it dies first.
 */

/** A held session older than this is never activated; the tap cold-starts instead. */
export const WARM_SESSION_MAX_AGE_MS = 45_000;

// WebSocket readyState values (WHATWG): compared numerically so the
// decision stays deterministic in any test environment.
const WS_OPEN = 1;
const WS_CLOSING = 2;
const WS_CLOSED = 3;

export interface WarmSessionHealth {
  /** True once the visitor's tap has claimed the session; a live conversation is never discarded by this check. */
  activated: boolean;
  /** Date.now() stamp of when the session's {"type":"ready"} arrived, or null while it is still warming. */
  readyAt: number | null;
  /** The warm socket's readyState, or null when no socket exists yet (mint still in flight). */
  socketReadyState: number | null;
}

/**
 * True when the held warm session must NOT be activated: its socket
 * is gone, or it became ready too long ago (a held connection can
 * die silently well inside that window, so age alone condemns it
 * even when the socket still claims to be OPEN).
 */
export function warmSessionUnusable(health: WarmSessionHealth, now: number): boolean {
  if (health.activated) return false;
  if (health.readyAt !== null) {
    if (health.socketReadyState !== null && health.socketReadyState !== WS_OPEN) return true;
    return now - health.readyAt > WARM_SESSION_MAX_AGE_MS;
  }
  // Never became ready: only a terminally dead socket condemns it —
  // a CONNECTING socket or an in-flight mint may still deliver.
  return health.socketReadyState === WS_CLOSING || health.socketReadyState === WS_CLOSED;
}
