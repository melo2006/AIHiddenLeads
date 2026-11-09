// Gemini Live provider session resumption — pure helpers for the Live
// proxy (gemini-live-proxy). The provider caps one WebSocket connection
// at ~10 minutes and terminates sessions from its side (e.g. close code
// 1007); with resumption enabled in the setup message the server sends
// sessionResumptionUpdate messages carrying an opaque handle, and a new
// connection that presents that handle in its setup continues the SAME
// session with its context intact. Handles stay valid ~2 hours after
// the connection ends.
//
// Protocol (Google Live API session management):
// - setup.sessionResumption = {} starts a new resumable session;
//   { handle } resumes the session the handle belongs to.
// - server -> client: { sessionResumptionUpdate: { newHandle, resumable } }
//   (resumable can read false mid-generation; the latest handle is still
//   the one to present on reconnect).
// - server -> client: { goAway: { timeLeft } } ~60s before the provider
//   ends the connection; timeLeft is a protobuf Duration in JSON form
//   ("55s" string, or { seconds: "55" } / { seconds: 55 }).

/** Consecutive failed resumption attempts before the proxy gives up and
 *  surfaces the drop to the client (which then runs its own bounded
 *  reconnect). A successful resumption resets the count. */
export const MAX_PROVIDER_RESUMPTION_RECONNECTS = 3;

/** The setup-message sessionResumption value: empty object for a fresh
 *  session (enables handle updates), the stored handle to resume. */
export function sessionResumptionConfig(handle: string | null): Record<string, string> {
  return handle ? { handle } : {};
}

/** Fold one sessionResumptionUpdate message into the stored handle.
 *  Returns the handle to keep (the new one when present, else current). */
export function resumptionHandleFromUpdate(
  current: string | null,
  update: unknown,
): { handle: string | null; resumable: boolean | null } {
  if (!update || typeof update !== 'object') return { handle: current, resumable: null };
  const u = update as Record<string, unknown>;
  const next = typeof u.newHandle === 'string' && u.newHandle ? u.newHandle : current;
  const resumable = typeof u.resumable === 'boolean' ? u.resumable : null;
  return { handle: next, resumable };
}

/** Seconds left before the provider ends the connection, from a goAway
 *  message. Defaults to 60 (Google's documented warning window) when the
 *  payload is missing or unparseable, so the preemptive reconnect is
 *  scheduled promptly rather than never. */
export function goAwayTimeLeftSeconds(goAway: unknown): number {
  if (!goAway || typeof goAway !== 'object') return 60;
  const tl = (goAway as Record<string, unknown>).timeLeft;
  if (typeof tl === 'number' && Number.isFinite(tl)) return Math.max(0, tl);
  if (typeof tl === 'string') {
    const n = Number.parseFloat(tl);
    return Number.isFinite(n) ? Math.max(0, n) : 60;
  }
  if (tl && typeof tl === 'object') {
    const s = (tl as Record<string, unknown>).seconds;
    const n = typeof s === 'string' ? Number(s) : typeof s === 'number' ? s : NaN;
    return Number.isFinite(n) ? Math.max(0, n) : 60;
  }
  return 60;
}

/** Whether another transparent resumption attempt is allowed: a stored
 *  handle exists and the consecutive-failure budget is not spent. */
export function providerResumeAllowed(handle: string | null, consecutiveAttempts: number): boolean {
  return !!handle && consecutiveAttempts < MAX_PROVIDER_RESUMPTION_RECONNECTS;
}

/** Delay before the preemptive goAway reconnect: reconnect a few seconds
 *  ahead of the provider deadline, never negative, with a small floor so
 *  a last-second goAway still leaves time to complete the handshake. */
export function goAwayReconnectDelayMs(timeLeftSeconds: number): number {
  return Math.max(250, (timeLeftSeconds - 5) * 1000);
}
