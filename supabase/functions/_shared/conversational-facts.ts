// Conversational facts — the visitor's NAME and BUSINESS as learned
// in conversation (fix batch 2026-11-24).
//
// THE GAP (Ron's live sessions, 2026-11-24): Publish #68's durable
// stamp (captured-contact.ts) carries CONTACT facts — name, email,
// mobile, texting consent — and a name only ever lands on it when
// the capture ritual runs (a card, a read-back, the
// record_captured_contact tool). On a homepage sales conversation
// Ron simply TOLD Aspen his name and his business while talking;
// no capture moment ever fired, nothing was stamped, and when the
// session resumed she welcomed him back and asked both again.
//
// THE FIX: conversational facts are their own stamp, riding the
// SAME mechanism as #68 — the proxy merges them into one
// ConversationalFacts and stamps it on the session row's config
// (config.conversationalFacts, the read-merge-write stamp pattern),
// gemini-session's prior-row recovery reads the newest stamp from
// the prior rows (alongside the #68 scan, over the same lookup keys
// including the campaign visitId) and stamps it into the successor's
// config, and the proxy seeds its state from the stamp and renders
// it into the prompt as KNOWN (conversationalFactsBlock below), so a
// returning visitor is greeted WITH their name/business and is never
// re-asked for either.
//
// WHAT THIS IS NOT: a name/business learned in conversation is NOT
// a captured CONTACT. It carries no email, no phone and no consent,
// it never satisfies a capture, and the capture rules (end-ask
// timing, read-back ritual, texting consent) are untouched — the
// block below says so in the prompt itself. captured-contact.ts is
// unchanged: a business alone still validates to NO captured contact.

import { detectStatedName } from './discovery-gate.ts';

export interface ConversationalFacts {
  /** The visitor's name, as stated in conversation. */
  name: string;
  /** The visitor's business — its name, or the business description
   *  they gave ("a pool cleaning company in Fort Lauderdale"). */
  business: string;
  /** ISO timestamp of the last merge. */
  updatedAt: string;
}

/** A partial fact arriving from one learning moment. */
export interface ConversationalFactsPatch {
  name?: unknown;
  business?: unknown;
}

const cleanField = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

/**
 * Validate an untrusted value (a stored session config is data, not
 * truth) into ConversationalFacts, or null when it carries no usable
 * fact. A stamp with both fields empty is no stamp at all.
 */
export function conversationalFactsFromUnknown(value: unknown): ConversationalFacts | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const name = cleanField(v.name, 100);
  const business = cleanField(v.business, 120);
  if (!name && !business) return null;
  return {
    name,
    business,
    updatedAt: typeof v.updatedAt === 'string' ? v.updatedAt : '',
  };
}

/** Read the stamp out of a stored session config (gemini-session). */
export function conversationalFactsFromConfig(config: unknown): ConversationalFacts | null {
  if (!config || typeof config !== 'object') return null;
  return conversationalFactsFromUnknown((config as Record<string, unknown>).conversationalFacts);
}

/**
 * Merge one learning moment into the stored facts. Non-empty fields
 * win; an empty field NEVER erases a learned one (a later utterance
 * that states only the business must not drop the name).
 */
export function mergeConversationalFacts(
  prev: ConversationalFacts | null,
  patch: ConversationalFactsPatch,
  now: Date = new Date(),
): ConversationalFacts | null {
  const name = cleanField(patch.name, 100) || prev?.name || '';
  const business = cleanField(patch.business, 120) || prev?.business || '';
  if (!name && !business) return null;
  return { name, business, updatedAt: now.toISOString() };
}

// Words an "I run / I own …" capture may not START with — shapes that
// are conversation, not a business ("I run into this problem…").
const BUSINESS_NON_STARTS: ReadonlySet<string> = new Set([
  'into', 'out', 'up', 'down', 'around', 'late', 'low', 'short',
  'a', 'an', 'the', 'my', 'our', 'your', 'his', 'her', 'their',
  'it', 'this', 'that', 'everything', 'things', 'errands',
]);

/** Clean one captured business phrase: cut at the first sentence
 *  break or comma, drop a trailing time/place tail is NOT attempted
 *  (a place is part of how visitors describe their business). */
function cleanBusinessPhrase(raw: string): string {
  const cut = (raw || '').split(/[.,;!?—]|\s-\s/)[0].trim().replace(/\s+/g, ' ');
  if (cut.length < 3 || cut.length > 120) return '';
  const first = cut.split(/\s+/)[0].toLowerCase().replace(/[^a-z']/g, '');
  if (BUSINESS_NON_STARTS.has(first)) return '';
  if (/\b(looking|interested|wondering|hoping|trying)\b/i.test(cut)) return '';
  return cut;
}

/**
 * The business the visitor states in this utterance, or ''. Only
 * explicit statement shapes count — "my business/company is (called)
 * X", "my business is X" handled by the same shape, "I run / own /
 * operate X", "we run / own X" — each cleaned, so ordinary
 * conversation banks nothing.
 */
export function detectStatedBusiness(text: string): string {
  if (!text) return '';
  const t = text.trim();
  let m = t.match(/\b(?:my|our|the) (?:business|company|practice|shop|firm|agency|studio|salon|restaurant) is (?:called |named )?(.+)$/i);
  if (m) return cleanBusinessPhrase(m[1]);
  m = t.match(/\b(?:i|we) (?:run|own|operate) (?:a |an |the )?(.+)$/i);
  if (m) return cleanBusinessPhrase(m[1]);
  m = t.match(/\bi work (?:at|for) (?:a |an |the )?(.+)$/i);
  if (m) return cleanBusinessPhrase(m[1]);
  return '';
}

/**
 * Fold ONE completed visitor utterance into the facts: returns the
 * merged stamp when the utterance taught something new, or `prev`
 * unchanged (same reference) when it taught nothing — the proxy
 * stamps only on an actual change.
 */
export function conversationalFactsFromUtterance(
  text: string,
  prev: ConversationalFacts | null,
  now: Date = new Date(),
): ConversationalFacts | null {
  const name = detectStatedName(text || '');
  const business = detectStatedBusiness(text || '');
  if (!name && !business) return prev;
  const merged = mergeConversationalFacts(prev, {
    ...(name ? { name } : {}),
    ...(business ? { business } : {}),
  }, now);
  if (merged && prev && merged.name === prev.name && merged.business === prev.business) return prev;
  return merged;
}

/**
 * Recover conversational facts from a recap's VISITOR lines — the
 * bridge for a prior session that never got its stamp written (or
 * whose stamp a successor's recovery missed): the recap the client
 * or the server synthesis hands forward still states the name and
 * business in the visitor's own words, so they can be stamped onto
 * the successor's config from the recap itself.
 */
export function extractConversationalFactsFromRecap(
  recap: unknown,
  now: Date = new Date(),
): ConversationalFacts | null {
  if (typeof recap !== 'string' || !recap.trim()) return null;
  let facts: ConversationalFacts | null = null;
  for (const line of recap.split('\n')) {
    const m = line.match(/^Visitor:\s*(.+)$/i);
    if (!m) continue;
    facts = conversationalFactsFromUtterance(m[1], facts, now);
  }
  return facts;
}

/**
 * The prompt block a session carrying conversational facts is
 * stamped with: the facts are stated as KNOWN — greet with them,
 * build on them, never re-ask them — and fenced off from the
 * contact-capture rules, which they do not touch. Returns '' when
 * there are no facts, so unstamped sessions stay byte-identical.
 */
export function conversationalFactsBlock(facts: ConversationalFacts | null): string {
  if (!facts) return '';
  const known: string[] = [];
  if (facts.name) known.push(`Name: ${facts.name}.`);
  if (facts.business) known.push(`Business: ${facts.business}.`);
  if (!known.length) return '';
  return `\nKNOWN VISITOR FACTS (learned in conversation earlier in this visit and carried across reconnects — treat as held, because they are): ${known.join(' ')} Greet the visitor by name when you welcome them back, build on what you know about their business, and never ask for their name or their business again — a fact may be asked for only when it appears nowhere in these facts or the recap, and then only once. These are conversational facts only: they are NOT a captured contact — no email, phone or texting consent is held by this block, and the contact-capture rules apply exactly as written elsewhere.`;
}
