/**
 * Recap windowing for cross-segment voice memory (Publish #63,
 * 2026-11-15).
 *
 * THE DEFECT (Ron's live retest, 2026-11-15 morning): after a drop
 * or a stop, the successor session's only memory was the client's
 * resumeRecap — the LAST 8 turns tail-sliced to the last 1,500
 * chars, under a 1,600-char schema cap in gemini-session. Everything
 * the visitor said FIRST structurally fell out of the window: the
 * name given at the start (Frank: "I don't have your name yet" two
 * segments after the visitor spelled it), the price bracket given
 * in the segment before ("I don't seem to have that price bracket
 * recorded"), the first two of three cities (only the last one was
 * ever offered back). Meanwhile the UI told the visitor "Nothing
 * you said is lost" and the opening offered to "pick up right where
 * we left off".
 *
 * THE RULE: a recap keeps the conversation's OPENING and its
 * freshest exchanges, and says so when the middle was dropped:
 *   - the first RECAP_FIRST_TURNS turns (the greeting, the name,
 *     the first criteria — the facts every later segment needs),
 *   - the last RECAP_LAST_TURNS turns (the current topic),
 *   - an explicit elision line between them when turns were
 *     dropped,
 *   - under a hard char cap (RECAP_MAX_CHARS): when the cap still
 *     binds, whole lines are dropped from the START of the recent
 *     block — the oldest of the recent turns — never by slicing the
 *     string mid-line; only as a last resort is a single oversized
 *     line shortened, at a sentence boundary, marked with an
 *     ellipsis (the buildSwapRecap discipline).
 *
 * Pure and dependency-free: the browser client (resumeRecap /
 * buildSwapRecap), the gemini-session server synthesis
 * (buildTranscriptRecap over a prior session's stored transcript
 * fragments) and the unit tests all share this one implementation,
 * so the windowing can never drift between the paths that produce
 * a recap.
 */

/** One conversation turn, normalized: the visitor is 'user'. */
export interface RecapTurn {
  role: "user" | "assistant";
  text: string;
}

/** Opening turns a recap always keeps (name + first criteria land here). */
export const RECAP_FIRST_TURNS = 6;

/** Most-recent turns a recap always keeps (the current topic). */
export const RECAP_LAST_TURNS = 30;

/** Hard character cap for a resume recap (gemini-session admits 16,000). */
export const RECAP_MAX_CHARS = 14_000;

/** The line that stands where the middle of a conversation was dropped. */
export const RECAP_ELISION_LINE = "[... middle of the conversation omitted ...]";

/** Format one turn the way every recap renders it. */
export function formatRecapLine(turn: RecapTurn): string {
  return `${turn.role === "user" ? "Visitor" : "Assistant"}: ${turn.text}`;
}

/** Persona names a spoken label prefix can carry (Publish #67). */
const SPOKEN_LABEL_NAMES = 'Aspen|Sara|Alex|Frank|Monica|Denise|Daniel|Andy|James|Diego';

/**
 * Strip a leaked persona-label prefix from one formatted recap line
 * (Publish #67, 2026-11-15 — Ron's Frank test: a spoken reply began
 * with the literal prefix "Aspen:"). Every recap line is formatted
 * "Visitor: …" / "Assistant: …" for the model's READING; when the
 * model generalizes that format and fills the label slot with a
 * persona name, its own line comes back as "Assistant: Aspen: …" —
 * and once stored, the label is re-fed in every later recap, so the
 * leak echoes. This sanitizer runs at the one chokepoint every recap
 * producer passes through (windowRecapLines), so a leaked label can
 * never survive into a successor session's memory: an inner persona
 * label after the role prefix is removed, and a raw line that opens
 * with a persona label of its own is re-homed under "Assistant:".
 * Genuine content is untouched — a name only strips when it sits in
 * the label slot, immediately followed by a colon.
 */
export function stripSpokenLabelPrefix(line: string): string {
  if (line === RECAP_ELISION_LINE) return line;
  const labeled = line.match(/^(Visitor|Assistant):\s+/);
  if (labeled) {
    const rest = line.slice(labeled[0].length).replace(new RegExp(`^(?:${SPOKEN_LABEL_NAMES}|Assistant|Visitor)\\s*:\\s+`, 'i'), '');
    return `${labeled[1]}: ${rest}`;
  }
  const raw = line.match(new RegExp(`^(?:${SPOKEN_LABEL_NAMES})\\s*:\\s+`, 'i'));
  if (raw) return `Assistant: ${line.slice(raw[0].length)}`;
  return line;
}

/**
 * Window already-formatted recap lines to the first+last contract
 * under `maxChars`. See the module header for the drop discipline.
 */
export function windowRecapLines(inputLines: string[], maxChars: number = RECAP_MAX_CHARS): string[] {
  if (!inputLines.length) return [];
  const lines = inputLines.map(stripSpokenLabelPrefix);
  let out: string[];
  // Index of the first line of the "recent" block inside `out`:
  // lines are dropped from there, so the opening survives longest.
  let recentStart: number;
  if (lines.length > RECAP_FIRST_TURNS + RECAP_LAST_TURNS) {
    out = [
      ...lines.slice(0, RECAP_FIRST_TURNS),
      RECAP_ELISION_LINE,
      ...lines.slice(-RECAP_LAST_TURNS),
    ];
    recentStart = RECAP_FIRST_TURNS + 1;
  } else {
    out = [...lines];
    recentStart = Math.min(RECAP_FIRST_TURNS, out.length);
  }
  const over = () => out.join("\n").length > maxChars;
  while (over() && out.length - recentStart > 2) {
    out.splice(recentStart, 1);
    if (out[RECAP_FIRST_TURNS] !== RECAP_ELISION_LINE) {
      // Lines were dropped for size from a conversation that fit
      // the turn window: mark the omission where it happened.
      out.splice(RECAP_FIRST_TURNS, 0, RECAP_ELISION_LINE);
      recentStart += 1;
    }
  }
  // Last resort: a handful of oversized lines remain and the cap
  // still binds — shorten the longest line at a sentence boundary,
  // marked, rather than slicing the joined string mid-thought.
  for (let guard = 0; over() && guard < 8; guard++) {
    let idx = -1;
    for (let i = 0; i < out.length; i++) {
      if (out[i] === RECAP_ELISION_LINE) continue;
      if (idx === -1 || out[i].length > out[idx].length) idx = i;
    }
    if (idx === -1) break;
    const overflow = out.join("\n").length - maxChars;
    const line = out[idx];
    const budget = Math.max(0, line.length - overflow - 1);
    if (budget >= line.length) break;
    const cut = line.slice(0, budget);
    const sentenceEnd = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
    out[idx] = `${sentenceEnd > 40 ? cut.slice(0, sentenceEnd + 1) : cut.trimEnd()}…`;
  }
  return out;
}

/** Window normalized turns into the recap text a successor session reads. */
export function windowRecapText(turns: RecapTurn[], maxChars: number = RECAP_MAX_CHARS): string {
  const lines = turns
    .filter((t) => t && typeof t.text === "string" && t.text.trim())
    .map(formatRecapLine);
  return windowRecapLines(lines, maxChars).join("\n");
}

/**
 * Build a recap from a STORED session transcript — the JSON
 * fragments the proxy persists on a gemini_voice_sessions row
 * ({ role: "caller" | "assistant", text }). Used by gemini-session
 * to synthesize the recap server-side when the client arrives with
 * none (a page reload wiped the in-page visit memory) or with only
 * a fragment of one. Returns undefined when the fragments hold no
 * usable conversation — the caller then keeps whatever the client
 * sent. Only ever called on a transcript the prior session actually
 * stored (recordTranscript/consent already decided that upstream).
 */
export function buildTranscriptRecap(fragments: unknown, maxChars: number = RECAP_MAX_CHARS): string | undefined {
  if (!Array.isArray(fragments)) return undefined;
  const turns: RecapTurn[] = [];
  for (const fragment of fragments) {
    if (!fragment || typeof fragment !== "object") continue;
    const role = (fragment as { role?: unknown }).role;
    const text = (fragment as { text?: unknown }).text;
    if (typeof text !== "string" || !text.trim()) continue;
    if (role === "caller" || role === "user") turns.push({ role: "user", text });
    else if (role === "assistant") turns.push({ role: "assistant", text });
  }
  if (!turns.some((t) => t.role === "assistant")) return undefined;
  const recap = windowRecapText(turns, maxChars);
  return recap || undefined;
}
