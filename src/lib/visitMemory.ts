import type { PersonaId } from "@/lib/personaSwap";

/** One transcript row of a page visit's conversation. The transcript
 * is NEVER cleared at a persona handoff (owner transition spec):
 * assistant rows carry the persona who spoke them (`speaker`, swap
 * sessions only) so the name label follows the speaker, and each
 * completed handoff appends a `divider` row so a visitor scrolling up
 * can follow who said what. Divider rows are chrome — recap builders
 * filter them out. */
export type VisitTurn = {
  role: "user" | "assistant" | "divider";
  text: string;
  speaker?: PersonaId;
  /** Canned-greeting marker (chat-fix3, 2026-11-16): the typed
   *  chat's seeded opening greeting carries kind "canned-greeting"
   *  plus the language it was composed in (greetingLang), so a
   *  thread holding ONLY that greeting is mechanically
   *  recognizable — when the site's language no longer matches,
   *  the greeting is re-seeded in the current language instead of
   *  greeting an English visitor in Portuguese (Ron's second phone
   *  test). Real conversation turns never carry the marker, and a
   *  thread with any real exchange is never rewritten. */
  kind?: "canned-greeting";
  greetingLang?: string;
};

// Same-page-visit memory so pressing play again after Stop resumes instead of re-greeting.
const visitMemory = new Map<string, VisitTurn[]>();
/** sessionStorage mirror of visitMemory (Publish #63, 2026-11-15):
 * the in-page Map alone dies with the page, so a visitor who
 * reloaded — or whose dropped call reopened the demo — arrived at a
 * successor session whose recap was EMPTY while the UI still
 * offered to "pick up right where we left off" (Ron's retest: the
 * return session knew neither his name nor his criteria). The Map
 * stays the runtime store, with identical keying and behavior; the
 * storage mirror is written through on every mutation and read back
 * lazily on the first access, so a reload inside the same tab keeps
 * the conversation. Best-effort by design: quota or privacy-mode
 * failures lose only the mirror, never the call. The persisted copy
 * keeps the most recent turns per key (the recap window needs the
 * opening + the last 30; the chat restore shows the rest). */
export const VISIT_MEMORY_STORAGE_KEY = "aspen-visit-memory-v1";
const VISIT_MEMORY_PERSISTED_TURNS = 120;
let visitMemoryHydrated = false;
function persistVisitMemory() {
  try {
    const stored: Record<string, VisitTurn[]> = {};
    visitMemory.forEach((turns, key) => { stored[key] = turns.slice(-VISIT_MEMORY_PERSISTED_TURNS); });
    sessionStorage.setItem(VISIT_MEMORY_STORAGE_KEY, JSON.stringify(stored));
  } catch { /* memory is best-effort */ }
}
function hydrateVisitMemory() {
  if (visitMemoryHydrated) return;
  visitMemoryHydrated = true;
  try {
    const raw = sessionStorage.getItem(VISIT_MEMORY_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const [key, value] of Object.entries(parsed)) {
      if (!Array.isArray(value) || visitMemory.has(key)) continue;
      const turns = value.filter((t): t is VisitTurn => !!t && typeof t === "object"
        && ((t as VisitTurn).role === "user" || (t as VisitTurn).role === "assistant" || (t as VisitTurn).role === "divider")
        && typeof (t as VisitTurn).text === "string");
      if (turns.length) visitMemory.set(key, turns);
    }
  } catch { /* memory is best-effort */ }
}
export function visitMemoryGet(key: string): VisitTurn[] {
  hydrateVisitMemory();
  return visitMemory.get(key) || [];
}
export function visitMemorySet(key: string, turns: VisitTurn[]) {
  visitMemory.set(key, turns);
  persistVisitMemory();
}
/** Append ONE newly completed turn to the visit's ACCUMULATED history.
 * flushLine and the swap divider used to REPLACE the store with the
 * current component's `turns` array — but every new session starts
 * from an empty `turns` state, so its first flushed line wiped all
 * earlier sessions' turns and the NEXT session's recap covered only
 * the immediately previous session (Ron's staging test, 2026-11-16:
 * after a thin handoff-leg session plus one more drop, Aspen
 * remembered only the leg — the visitor's name and business were
 * gone). Appending keeps the store the whole visit's history, which
 * is what resumeRecap's first-6 + last-30 window was designed for. */
export function visitMemoryAppend(key: string, turn: VisitTurn) {
  visitMemory.set(key, [...visitMemoryGet(key), turn]);
  persistVisitMemory();
}
export function visitMemoryDelete(key: string) {
  visitMemory.delete(key);
  persistVisitMemory();
}
/** MEMORY DIAG (fix batch 2026-11-24): the mint-time diagnostic the
 * conversation stamps through the gemini-session diag channel
 * (config.memoryDiag on the new session's own row). It records how
 * much visit memory the mint actually carried — the accumulated
 * turn count and the recap's char length — so a recap that shrank
 * to a tail stub (Ron's 2026-11-24 sessions: 264 chars where the
 * designed first-6 + last-30 recap belonged) is identifiable from
 * the record: turns high + recapChars low IS the shrink, readable
 * without replaying the visit. Pure formatting, no side effects. */
export interface MemoryDiagStats {
  /** Turns held in visit memory for this visit at mint time. */
  turns: number;
  /** Char length of the resume recap sent with the mint (0 = none). */
  recapChars: number;
}

export function memoryDiagDetail(stats: MemoryDiagStats): string {
  const turns = Number.isFinite(stats.turns) && stats.turns > 0 ? Math.floor(stats.turns) : 0;
  const recapChars = Number.isFinite(stats.recapChars) && stats.recapChars > 0 ? Math.floor(stats.recapChars) : 0;
  return `turns=${turns};recapChars=${recapChars}`;
}

export function memoryDiagPayload(sessionId: string, stats: MemoryDiagStats, at: number): { sessionId: string; detail: string; at: number } {
  return { sessionId, detail: memoryDiagDetail(stats).slice(0, 400), at };
}

/** Dedupe key (session-scoped, like the other diag channels): a new
 *  session's first stamp always lands; identical repeats within a
 *  session post once. */
export function memoryDiagSignature(payload: { sessionId: string; detail: string }): string {
  return `${payload.sessionId}|${payload.detail}`;
}

/** Wipe EVERY key of the visit store plus its storage mirror (the
 * start-over-as-a-new-visitor reset). Hydration is marked done so a
 * stale mirror can never resurrect the wiped visit. */
export function clearAllVisitMemory() {
  visitMemory.clear();
  visitMemoryHydrated = true;
  try { sessionStorage.removeItem(VISIT_MEMORY_STORAGE_KEY); } catch { /* storage is best-effort */ }
}
