/**
 * Presentation helpers for framed (embedded) contexts.
 *
 * When the app runs inside a cross-origin preview frame (e.g. the Google AI
 * Studio editor preview), the parent frame's Permissions Policy decides
 * whether the microphone may be used at all. The browser then refuses
 * getUserMedia WITHOUT ever showing the visitor a permission prompt, so the
 * usual "permission was denied — allow it in your browser" error is nonsense
 * in that context: there is nothing to allow. These helpers let the UI tell
 * that situation apart from a genuine top-level denial and offer guidance
 * instead of a red error.
 */

/**
 * True when the current page is rendered inside a frame (window.self is not
 * the top window). Returns false when there is no window (SSR/tests) so
 * callers can use it unconditionally during render.
 */
export function isEmbeddedContext(
  win: Window | undefined = typeof window === "undefined" ? undefined : window,
): boolean {
  if (!win) return false;
  try {
    return win.self !== win.top;
  } catch {
    // Reaching the top window threw (cross-origin frame): we are embedded.
    return true;
  }
}

/**
 * True for the browser's microphone-refusal failures — the getUserMedia
 * rejections that mean "no microphone for you" (the visitor declined, or a
 * policy withheld it), as opposed to device/transport errors.
 */
export function isMicrophonePermissionError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "NotAllowedError" || error.name === "SecurityError")
  );
}

export type MicrophoneFailureKind = "mic-denied-embedded" | "mic-denied" | "other";

/**
 * Classify the error text currently shown by the conversation widget:
 * - "mic-denied-embedded": the microphone-denied message while framed — the
 *   browser never offered a prompt, so guidance replaces the error.
 * - "mic-denied": the same message at top level — a genuine denial; the
 *   existing error presentation stays.
 * - "other": anything else (including no error).
 */
export function classifyMicrophoneFailure(
  errorText: string | null | undefined,
  deniedMessage: string,
  embedded: boolean,
): MicrophoneFailureKind {
  if (!errorText || errorText !== deniedMessage) return "other";
  return embedded ? "mic-denied-embedded" : "mic-denied";
}
