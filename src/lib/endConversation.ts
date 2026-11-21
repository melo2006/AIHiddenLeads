/**
 * END-OF-CONVERSATION SIGNAL — client half (2026-11-21, homepage-test
 * item 1: Ron asked Aspen to hang up; she said goodbye and the session
 * still lingered ~60 s, because her goodbye RESET the silence clock
 * and the full ladder — check-in, second goodbye, server quiet-period
 * close — had to run before anything ended. There was no end-call
 * action anywhere in the Gemini path.)
 *
 * This module is the CLIENT half of the fix: when the assistant's
 * final line carries END_CONVERSATION_SIGNAL, GeminiConversation
 * strips the token before it can reach captions, the live partial or
 * the stored transcript, lets the farewell turn play out, and closes
 * the session promptly (see closeOnEndSignal there) instead of
 * falling into the silence ladder.
 *
 * ══════════════════════════════════════════════════════════════════
 * PROMPT HOOK — FOR THE PROMPT LAYER TO ADOPT (not yet wired):
 * the homepage sales layer and the simulation prompts (the proxy's
 * server-side session instructions) must teach the assistant:
 *
 *   "When the visitor asks you to end the call, hang up or stop, or
 *    clearly agrees the conversation is over, speak ONE short
 *    goodbye line and append the exact token [[END_CONVERSATION]]
 *    at the very end of that final reply. Use it only for a real
 *    end of the whole conversation — never mid-conversation, never
 *    for a pause, a transfer or a persona hand-off — and never say
 *    the token's words aloud."
 *
 * Until the prompt layer adopts the hook, nothing emits the token
 * and this client handling is inert. The server half (an
 * end_conversation tool declaration in gemini-live-proxy, a
 * deterministic end-intent backstop on caller transcriptions, the
 * visitor_requested end reason, and ladder alignment with the
 * approved silence protocol) is a separate follow-up.
 * ══════════════════════════════════════════════════════════════════
 */

/** The exact token the prompt layer instructs the assistant to
 *  append to its final goodbye line. Bracketed and shouty on
 *  purpose: it can never occur in natural speech, so stripping it
 *  from a transcript is always safe. */
export const END_CONVERSATION_SIGNAL = "[[END_CONVERSATION]]";

/** After the farewell turn completes, the close fires as soon as
 *  playback drains — and never later than this cap, so a requested
 *  end can never drift back into the ~60 s silence ladder. */
export const END_SIGNAL_MAX_WAIT_MS = 2000;

/** Drain poll cadence for the end-signal close. */
export const END_SIGNAL_DRAIN_POLL_MS = 250;

export interface EndSignalConsumption {
  /** The line with the signal (and any trailing partial build-up of
   *  it) removed — safe to display and store. */
  visible: string;
  /** True when the complete signal was present in the line. */
  signalled: boolean;
}

/** Remove a trailing partial build-up of the signal from `text`:
 *  while the token streams in chunk by chunk, the accumulated line
 *  can end with "[[END_CON…" — that prefix must never flash on
 *  screen. Returns the text with any such suffix withheld. A suffix
 *  that turns out NOT to be the token reappears whole on the next
 *  chunk, because consumption always runs on the full line. */
function withholdTrailingPartial(text: string): string {
  const max = Math.min(END_CONVERSATION_SIGNAL.length - 1, text.length);
  for (let n = max; n > 0; n--) {
    if (text.endsWith(END_CONVERSATION_SIGNAL.slice(0, n))) {
      return text.slice(0, text.length - n);
    }
  }
  return text;
}

/** Consume the end signal from an ACCUMULATED assistant line: every
 *  complete occurrence of the token is removed and reported; a
 *  trailing partial build-up is withheld from the visible text
 *  without being reported (it may still complete — or not). */
export function consumeEndConversationSignal(line: string): EndSignalConsumption {
  let signalled = false;
  let visible = line;
  if (visible.includes(END_CONVERSATION_SIGNAL)) {
    signalled = true;
    visible = visible.split(END_CONVERSATION_SIGNAL).join("");
  }
  return { visible: withholdTrailingPartial(visible), signalled };
}

/** The visible part of ONE streaming chunk (for feeds that consume
 *  text incrementally, like the caption clock): the chunk cut at the
 *  start of the signal or of a trailing partial build-up. Identity
 *  for ordinary speech text. */
export function endSignalVisibleChunk(chunk: string): string {
  const full = chunk.indexOf(END_CONVERSATION_SIGNAL);
  if (full >= 0) return chunk.slice(0, full);
  return withholdTrailingPartial(chunk);
}
