// Transcript turn merging (item 12, 2026-11-21). The Gemini Live proxy
// receives output/input transcriptions as a stream of small chunks
// ("Good morning, and thanks" / "for calling AI" / "Hidden Leads!").
// Persisting those chunks verbatim made every stored transcript read
// as dozens of 2–5-word fragments on the public copy page, in the
// emailed copy and in the admin views. The proxy now merges chunks
// into turns at every persistence site, so stored records
// (conversation_records.transcript, gemini_voice_sessions.transcript,
// call_history.transcript) hold one entry per spoken turn.
//
// Pure string builders with zero imports, so Deno edge functions and
// vitest can both consume this module (same pattern as email-shell.ts).
// KEEP IN SYNC with the client twin: mergeTranscriptTurns in
// src/lib/conversationDetail.ts implements the identical rule for
// render-time merging of legacy chunked records.

export interface TranscriptFragmentLike {
  role: string;
  text: string;
}

// Speaker groups mirror speakerOf() in src/lib/conversationDetail.ts:
// the caller aliases collapse to one group, the assistant aliases to
// another, and any other role is its own group (compared
// case-insensitively, matching the label rule there).
const CALLER_ROLES = new Set(['caller', 'user', 'visitor', 'customer', 'human']);
const ASSISTANT_ROLES = new Set(['assistant', 'agent', 'ai', 'aspen', 'bot']);

function speakerGroup(role: string): string {
  const key = (role || '').trim().toLowerCase();
  if (CALLER_ROLES.has(key)) return 'caller';
  if (ASSISTANT_ROLES.has(key)) return 'assistant';
  return `role:${key}`;
}

/** Merge consecutive same-speaker fragments into single turns.
 *  Fragments are joined with one space; empty fragments are dropped.
 *  The merged turn keeps the FIRST fragment's role, verbatim — stored
 *  text is never rewritten (number-to-digit conversion is a
 *  render-time-only concern on the client). */
export function mergeTranscriptTurns(
  fragments: readonly TranscriptFragmentLike[] | null | undefined,
): TranscriptFragmentLike[] {
  const turns: TranscriptFragmentLike[] = [];
  let lastGroup: string | null = null;
  for (const fragment of fragments ?? []) {
    const text = (fragment?.text ?? '').trim();
    if (!text) continue;
    const group = speakerGroup(fragment?.role ?? '');
    const last = turns[turns.length - 1];
    if (last && lastGroup === group) {
      last.text = `${last.text} ${text}`;
    } else {
      turns.push({ role: fragment?.role ?? '', text });
      lastGroup = group;
    }
  }
  return turns;
}

/** The call_history storage shape: one "role: text" line per turn. */
export function transcriptTurnsToText(
  turns: readonly TranscriptFragmentLike[] | null | undefined,
): string {
  return (turns ?? []).map((t) => `${t.role}: ${t.text}`).join('\n');
}
