// Real transfer briefing summary (fix batch 2026-11-24).
//
// THE DEFECT (Ron's live session, 2026-11-24): there was no transfer
// summary at all. On every completed model turn the Live proxy
// rewrote browser_voice_handoffs.summary as ALL caller transcript
// turns concatenated, last 1,200 chars, RAW ASR — e.g. literally
// "run is run customers are company locars intro company cars from
// dealerships to auctions myself s Okay. ¿Qué? hat 5 Can you
// transfer me to your manager?" — and managerBriefingText embedded
// that string verbatim into the spoken manager briefing.
//
// THE FIX: a summary is COMPOSED, never transcribed. This module
// builds one factual sentence from structured facts only — the
// caller's captured/known name, the business whose website the
// visitor is on, and closed-enum topic labels the server already
// computed (call-review interest labels) — at the moment a transfer
// is requested (Live proxy) or armed (browser-voice-handoff token
// issuance). Any fact that is not present is OMITTED; nothing is
// inferred from raw transcript text, and no transcript text ever
// reaches the summary.
//
// THE INTERIM GUARD: managerBriefingText only embeds a stored
// summary when isComposedHandoffSummary() recognizes the exact
// composed template below. Legacy rows still carrying the ASR
// stitch (or any other free text) fall back to the clean templated
// briefing line, so the stitch can never be spoken again even
// before the proxy that wrote it is replaced.

export interface HandoffSummaryFacts {
  /** Caller's name from a structured source (captured contact,
   *  the session's stamped visitor contact, the discovery gate's
   *  banked name) — never parsed out of a transcript. */
  callerName?: unknown;
  /** The business whose website the visitor is waiting on
   *  (the session config's businessName). */
  businessName?: unknown;
  /** Closed-enum topic labels (e.g. call-review interest labels),
   *  one string or a list. Never transcript text. */
  topics?: unknown;
}

/** Reduce an untrusted fact to speakable plain words: letters,
 *  numbers and a few name-safe marks only. Sentence punctuation is
 *  stripped, so a fact can never smuggle extra sentences (or a
 *  whole ASR fragment) into the composed summary. */
export function cleanHandoffFact(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[^\p{L}\p{N}\s&'’\-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim();
}

function cleanTopics(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  const seen = new Set<string>();
  const topics: string[] = [];
  for (const item of raw) {
    const topic = cleanHandoffFact(item, 40);
    if (!topic || seen.has(topic.toLowerCase())) continue;
    seen.add(topic.toLowerCase());
    topics.push(topic);
    if (topics.length >= 3) break;
  }
  return topics;
}

function joinTopics(topics: string[]): string {
  if (topics.length <= 1) return topics[0] ?? '';
  if (topics.length === 2) return `${topics[0]} and ${topics[1]}`;
  return `${topics[0]}, ${topics[1]} and ${topics[2]}`;
}

/**
 * Compose the 1-sentence briefing summary from the facts that are
 * actually present. Returns null when NO fact is present — the
 * caller then leaves the summary unset and the spoken briefing
 * uses its clean templated fallback line.
 */
export function composeHandoffSummary(facts: HandoffSummaryFacts): string | null {
  const name = cleanHandoffFact(facts.callerName, 60);
  const business = cleanHandoffFact(facts.businessName, 80);
  const topics = cleanTopics(facts.topics);
  if (!name && !business && topics.length === 0) return null;
  const subject = name ? `The caller, ${name},` : 'A visitor';
  const site = business ? `the ${business} website` : 'the website';
  const action = topics.length > 0
    ? `asked about ${joinTopics(topics)} and is waiting`
    : 'is waiting';
  return `${subject} ${action} on ${site} to speak with your team.`;
}

/** The composed template, and ONLY the composed template. Slots
 *  carry no sentence punctuation (cleanHandoffFact strips it), so
 *  a multi-sentence raw-ASR stitch — question marks, fragments,
 *  filler and all — can never match. */
const COMPOSED_SUMMARY_PATTERN =
  /^(?:The caller, [^.!?\n]{1,80},|A visitor) (?:asked about [^.!?\n]{1,140} and is waiting|is waiting) on the (?:[^.!?\n]{1,100} )?website to speak with your team\.$/;

export function isComposedHandoffSummary(value: unknown): boolean {
  return typeof value === 'string' && COMPOSED_SUMMARY_PATTERN.test(value.trim());
}
