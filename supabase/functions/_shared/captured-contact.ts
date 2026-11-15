// Durable captured-contact facts (Publish #68, 2026-11-15).
//
// THE DEFECT (Ron's live Frank test, 2026-11-15): conversation memory
// survives a drop — the #63/#64 recap carries what was SAID — but
// captured CONTACT FACTS did not. Frank took the visitor's mobile in
// session 4 (read it back grouped, perfectly), the call dropped, and
// two sessions later he announced "I do not have a mobile number on
// file for you": the number lived only in a transcript window the
// successor's recap had elided, and nothing anywhere treated it as a
// captured fact. The email was worse — held from the start, disclosed
// only after the visitor challenged him twice, spelled out a session
// late.
//
// THE FIX: capture is a FACT, not a transcript line. Whenever the
// presenter captures contact details — the verbal capture behind a
// confirmation card, the card's own confirm, the record_captured_
// contact ritual tool, a book_call texting answer — the proxy merges
// them into one CapturedContact and stamps it on the session row's
// config (the teamIntroSeen pattern). gemini-session's synthesis
// lookup (the #63 block, with the #64 IP-free visitorKeyHash
// fallback — NEVER the raw visitor_hash, which mixes in the caller's
// rotating forwarded address) reads the newest stamp from the prior
// rows and stamps it into the successor's config; persona segments
// inherit it from the parent row's config spread. The proxy seeds
// its session state from the stamp and renders it into the prompt
// as ALREADY CAPTURED (capturedContactBlock below), so a reconnected
// presenter treats the facts as held: never claims they're missing,
// never re-asks for what's captured.
//
// CONSENT SEMANTICS: smsConsent is tri-state — true (a spoken yes on
// the voice path or a ticked card box), false (an explicit no), or
// ABSENT (never asked). A merge never invents an answer and never
// lets a later silence erase an explicit one: only an explicit new
// boolean replaces the stored one. `confirmed` records the on-screen
// confirmation (the only save the house rules allow): once true it
// stays true for the visit — the details were browser-confirmed,
// even if that was an earlier session of the same visit.

export interface CapturedContact {
  name: string;
  email: string;
  phone: string;
  /** Texting consent as last explicitly answered; absent = never asked. */
  smsConsent?: boolean;
  /** True only after the visitor confirmed these details on screen. */
  confirmed: boolean;
  /** ISO timestamp of the last merge. */
  updatedAt: string;
}

/** A partial capture arriving from one capture moment. */
export interface CapturedContactPatch {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  smsConsent?: unknown;
  confirmed?: unknown;
}

const cleanField = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

/**
 * Validate an untrusted value (a stored session config is data, not
 * truth) into a CapturedContact, or null when it carries no usable
 * fact. A stamp with every field empty is no stamp at all.
 */
export function capturedContactFromUnknown(value: unknown): CapturedContact | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const name = cleanField(v.name, 100);
  const email = cleanField(v.email, 255).toLowerCase();
  const phone = cleanField(v.phone, 30);
  if (!name && !email && !phone) return null;
  return {
    name,
    email,
    phone,
    ...(typeof v.smsConsent === 'boolean' ? { smsConsent: v.smsConsent } : {}),
    confirmed: v.confirmed === true,
    updatedAt: typeof v.updatedAt === 'string' ? v.updatedAt : '',
  };
}

/** Read the stamp out of a stored session config (gemini-session). */
export function capturedContactFromConfig(config: unknown): CapturedContact | null {
  if (!config || typeof config !== 'object') return null;
  return capturedContactFromUnknown((config as Record<string, unknown>).capturedContact);
}

/**
 * Merge one capture moment into the stored facts. Non-empty fields
 * win; an empty field NEVER erases a captured one (a card that omits
 * the phone must not delete the number the visitor gave verbally).
 * smsConsent moves only on an explicit boolean. `confirmed` is
 * sticky: once the visitor has confirmed on screen, later verbal
 * captures refresh the details without un-confirming them.
 */
export function mergeCapturedContact(
  prev: CapturedContact | null,
  patch: CapturedContactPatch,
  now: Date = new Date(),
): CapturedContact {
  const name = cleanField(patch.name, 100);
  const email = cleanField(patch.email, 255).toLowerCase();
  const phone = cleanField(patch.phone, 30);
  return {
    name: name || prev?.name || '',
    email: email || prev?.email || '',
    phone: phone || prev?.phone || '',
    ...(typeof patch.smsConsent === 'boolean'
      ? { smsConsent: patch.smsConsent }
      : prev && typeof prev.smsConsent === 'boolean'
        ? { smsConsent: prev.smsConsent }
        : {}),
    confirmed: prev?.confirmed === true || patch.confirmed === true,
    updatedAt: now.toISOString(),
  };
}

/**
 * The prompt block a session carrying captured facts is stamped
 * with. This is the regression surface for the Frank defect: the
 * facts are stated as HELD, with the standing order that they are
 * never missing and never re-asked. Returns '' when there is
 * nothing captured, so unstamped sessions stay byte-identical.
 */
export function capturedContactBlock(contact: CapturedContact | null): string {
  if (!contact) return '';
  const facts: string[] = [];
  if (contact.name) facts.push(`Name: ${contact.name}.`);
  if (contact.email) facts.push(`Email: ${contact.email}.`);
  if (contact.phone) facts.push(`Mobile: ${contact.phone}.`);
  if (!facts.length) return '';
  const consent = contact.smsConsent === true
    ? 'Texting consent: GIVEN (the visitor said yes — never ask again).'
    : contact.smsConsent === false
      ? 'Texting consent: DECLINED (final for this visit — never ask again).'
      : 'Texting consent: not yet asked — ask it at the capture moment, per the capture ritual.';
  const confirmation = contact.confirmed
    ? 'These details were confirmed by the visitor on screen earlier in this visit.'
    : 'These details were captured in conversation but are NOT yet confirmed on screen: before any platform save or booking, show the confirmation card pre-filled with them (request_platform_followup) — one tap finishes it, and the details themselves are never re-asked.';
  return `\nALREADY CAPTURED FOR THIS VISITOR (recorded earlier in this visit and carried across reconnects — treat as held, because it is): ${facts.join(' ')} ${consent} ${confirmation} Never say or imply that you do not have any detail listed here, and never ask the visitor to repeat one. A detail NOT listed here has not been captured yet. If the visitor corrects a detail, take the correction, read it back, and record it the same way as a fresh capture.`;
}
