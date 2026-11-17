/**
 * Read-aloud chunking (chat-fix6, 2026-11-16): the chat-read-aloud
 * function synthesizes ONE request into ONE WAV before the client
 * can play anything, so a long reply cost Ron ~30s of silence
 * before the first sound. The fix is client-side: split the reply
 * into sentence-sized chunks, request the first one, start
 * playback the moment it lands, and prefetch the rest while it
 * plays. The function's voice and model are untouched.
 *
 * Budgets: the function caps a request at 800 chars (and truncates
 * beyond it — a >800-char reply was silently cut off before this
 * split existed). Every chunk here stays at or under 600, and the
 * FIRST chunk is smaller (~240) so the first sound arrives after
 * synthesizing a sentence or two, not the whole reply. Splitting
 * is sentence-aware and order-preserving: concatenating the
 * chunks reproduces the (trimmed) input exactly, so nothing is
 * dropped, duplicated, or reordered; a single sentence longer
 * than a budget is hard-split at a word boundary.
 */

export const READ_ALOUD_FIRST_CHUNK_CHARS = 240;
export const READ_ALOUD_CHUNK_CHARS = 600;

/** Sentence-ish segments, each keeping its trailing punctuation
 *  and whitespace so concatenation reproduces the input. */
function splitSentences(text: string): string[] {
  const parts = text.match(/[^.!?…]+(?:[.!?…]+["'")\]]*)?\s*/g);
  if (!parts) return [text];
  return parts.filter((part) => part.length > 0);
}

/** Split one over-budget segment at word boundaries inside the
 *  budget (the space stays with the first piece); a segment with
 *  no usable space is cut at the budget exactly. Every piece is
 *  at most `budget` chars and the pieces concatenate back to the
 *  segment. */
function hardSplit(segment: string, budget: number): string[] {
  const out: string[] = [];
  let rest = segment;
  while (rest.length > budget) {
    let cut = rest.lastIndexOf(" ", budget);
    if (cut <= 0) cut = budget;
    else cut += 1;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest) out.push(rest);
  return out;
}

export function splitReadAloudChunks(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const queue = splitSentences(trimmed);
  const chunks: string[] = [];
  let budget = READ_ALOUD_FIRST_CHUNK_CHARS;
  while (queue.length > 0) {
    let current = "";
    while (queue.length > 0) {
      const next = queue[0];
      if (current.length + next.length <= budget) {
        current += next;
        queue.shift();
        continue;
      }
      if (current.length > 0) break;
      // One segment longer than this chunk's whole budget: split
      // it at a word boundary and requeue the remainder.
      const pieces = hardSplit(next, budget);
      current = pieces[0];
      const rest = pieces.slice(1).join("");
      if (rest) queue[0] = rest;
      else queue.shift();
      break;
    }
    if (current) chunks.push(current);
    budget = READ_ALOUD_CHUNK_CHARS;
  }
  return chunks;
}
