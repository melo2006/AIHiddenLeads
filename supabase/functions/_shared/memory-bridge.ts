// Memory bridge — prior-session recovery decisions (fix batch
// 2026-11-24).
//
// THE DEFECT (Ron's live sessions, 2026-11-24): Aspen opened with
// "Hey, you're back!" and then asked his name and business again.
// The chain had three weak links, two of which live here:
//
//  1. THE SYNTHESIS GATE WAS RECAP-SHAPED, AND A STUB DISARMED IT.
//     gemini-session's server-side recap synthesis (Publish #63/#64)
//     ran only when the client recap was absent or under 200 chars.
//     The client visit-memory recap that actually arrived was a
//     264-char tail stub — only the last exchange — so it passed the
//     gate, the fuller prior transcript was never consulted, and the
//     facts from the start of the visit (name, business) were gone.
//     The gate below runs recovery whenever the supplied recap is
//     SHORT (< RECAP_RECOVERY_MIN_CHARS) OR carries NO IDENTIFIABLE
//     FACTS, however long it is. A full recap — long AND fact-bearing
//     — keeps the exact pre-fix behaviour: no lookup, client recap
//     stands.
//
//  2. THE SCRIPTED RESUME GREETING FIRED ON ANY RECAP AT ALL.
//     resumeInstruction's "Hey, you're back!" ran whenever a
//     resumeContext string existed — including a bare tail stub with
//     no name, no business, no facts — so Aspen welcomed Ron back
//     and immediately proved she remembered nothing.
//     resumeGreetingAllowed below is the gate session-opening now
//     applies: the scripted welcome-back fires only when the recap
//     (or the stamped conversational facts riding with the session)
//     holds at least a name / business or substantive prior content.
//
// Pure and dependency-free, like recap-builder.ts: gemini-session,
// voice-config/session-opening and the unit tests share this one
// implementation so the decisions can never drift between paths.

/** A client recap shorter than this is a stub, never a full record:
 *  recovery runs regardless of what facts it happens to carry. The
 *  2026-11-24 stub was 264 chars; the designed first-6 + last-30
 *  recap of any real conversation runs well past this line. */
export const RECAP_RECOVERY_MIN_CHARS = 600;

// Identifiable-fact shapes, matched against VISITOR lines of a
// formatted recap ("Visitor: …") — the assistant's own lines talk
// about websites and businesses generically, so name/business
// patterns only count in the visitor's own words. Contact shapes
// (email / phone) count anywhere: they are unambiguous in any line.
const VISITOR_FACT_PATTERNS: readonly RegExp[] = [
  /\bmy name is\s+[A-Za-z]/i,
  /\bname(?:'s| is)\s+[A-Z][a-z]+/,
  /\b(?:i'm|i am)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?/,
  /\bthis is\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?/,
  /\bthe visitor is\s+[A-Z]/i,
  /\bvisitor(?:'s)? name\b/i,
  /\b(?:my|our|the) (?:business|company|practice|shop|firm|agency|studio|salon|restaurant|website) (?:is|called|named)\b/i,
  /\bi (?:run|own|operate|work at|work for)\s+(?:a\s+|an\s+|the\s+)?[A-Za-z]/i,
  /\bwebsite (?:is|:)\s*\S+/i,
  /\bwww\.[^\s]+/i,
  /\b[A-Za-z0-9-]+\.(?:com|net|org|io|co)\b/,
];

const ANYWHERE_FACT_PATTERNS: readonly RegExp[] = [
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  /(?:\+?1[\s.\-]?)?\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}/,
];

/**
 * Does this recap carry at least one identifiable fact — a name, a
 * business, a website, an email, a phone — in the visitor's own
 * words (or a contact shape anywhere)? A recap with none of these
 * is a tail stub for memory purposes, whatever its length.
 */
export function recapHasIdentifiableFacts(recap: unknown): boolean {
  if (typeof recap !== 'string' || !recap.trim()) return false;
  for (const pattern of ANYWHERE_FACT_PATTERNS) {
    if (pattern.test(recap)) return true;
  }
  const lines = recap.split('\n');
  const visitorLines = lines.filter((line) => /^visitor:/i.test(line.trim()));
  const haystack = visitorLines.length ? visitorLines.join('\n') : recap;
  return VISITOR_FACT_PATTERNS.some((pattern) => pattern.test(haystack));
}

/**
 * Should gemini-session run prior-row recovery (recap synthesis +
 * captured/conversational fact recovery) for this authorization?
 * True when: a reconnect (always — pre-fix behaviour), no recap, a
 * short recap (< RECAP_RECOVERY_MIN_CHARS), or a recap with no
 * identifiable facts. False only for a full recap: long AND
 * fact-bearing — that path stays byte-identical to before.
 */
export function shouldRecoverPriorSession(input: {
  reconnect?: boolean;
  resumeContext?: string | null;
}): boolean {
  if (input.reconnect === true) return true;
  const recap = typeof input.resumeContext === 'string' ? input.resumeContext : '';
  if (!recap.trim()) return true;
  if (recap.trim().length < RECAP_RECOVERY_MIN_CHARS) return true;
  return !recapHasIdentifiableFacts(recap);
}

/** The ordered prior-row lookup keys gemini-session tries, in
 *  fall-back order. visitorHash first (Publish #63), then the
 *  IP-free visitorKeyHash stamped in the prior row's config
 *  (Publish #64), then — fix batch 2026-11-24 — the campaign
 *  visitId: every homepage start mints a FRESH visitorKey, so both
 *  hash keys rotate with it, while the campaign visitId is the one
 *  identifier that is stable across the rows of a single visit
 *  (it was already stored on session rows; it was simply never a
 *  lookup key). The visitId key is present only when the request
 *  actually carries a campaign visitId. */
export type PriorRowLookupKey = 'visitorHash' | 'visitorKeyHash' | 'campaignVisitId';

export function priorRowLookupKeys(input: { visitId?: unknown }): PriorRowLookupKey[] {
  const keys: PriorRowLookupKey[] = ['visitorHash', 'visitorKeyHash'];
  if (typeof input.visitId === 'string' && input.visitId.trim()) keys.push('campaignVisitId');
  return keys;
}

/**
 * May the scripted resume greeting ("Hey, you're back!") fire for
 * this resume? Only when there is something to welcome the visitor
 * back TO: stamped conversational facts (a name or a business), a
 * recap carrying identifiable facts, or a recap long enough to be
 * substantive prior content on its own. A bare tail stub — a recap
 * that exists but holds none of those — must NOT fire it: the
 * session then continues without the scripted welcome-back (see
 * session-opening's stub branch).
 */
export function resumeGreetingAllowed(
  recap: unknown,
  facts?: { name?: unknown; business?: unknown } | null,
): boolean {
  const name = typeof facts?.name === 'string' ? facts.name.trim() : '';
  const business = typeof facts?.business === 'string' ? facts.business.trim() : '';
  if (name || business) return true;
  if (typeof recap !== 'string' || !recap.trim()) return false;
  if (recapHasIdentifiableFacts(recap)) return true;
  return recap.trim().length >= RECAP_RECOVERY_MIN_CHARS;
}
