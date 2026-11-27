/**
 * PER-BUSINESS VOICE IDENTITY (2026-11-27, Ron's approved build) —
 * the layer that lets a demo speak in the BUSINESS'S OWN words, not
 * just about its facts.
 *
 * Before this module, a demo session's per-business composition was
 * scanned FACTS + per-type practice packs (pinned examples only) +
 * shared script/greeting shapes: a greeting or tagline the business
 * states on its own site was never lifted into the opening. This
 * module extracts a small VOICE IDENTITY record from the business's
 * own scanned website copy:
 *
 *   - tagline:           the business's own stated greeting/tagline
 *                        (an explicit "Tagline:" label, else the
 *                        homepage's own headline) — verbatim;
 *   - selfDescriptions:  first-person sentences in its own copy
 *                        ("We are a family-run team…") — verbatim;
 *   - toneCues:          the scan's TONE keywords, themselves drawn
 *                        from the site's copy;
 *   - signaturePhrases:  short phrases its copy repeats verbatim;
 *   - customerTerms:     what it calls the people it serves
 *                        ("our guests", "our patients"…).
 *
 * EVIDENCE ONLY — every value is a verbatim lift from the scanned
 * copy or the scan's own tone read of that copy. Nothing is
 * generated, paraphrased or borrowed from another business. When
 * the site states nothing usable the record is honestly EMPTY, and
 * every consumer falls back to the pre-existing composition
 * byte-for-byte.
 *
 * Two producers, one record:
 *   - scan-website stores the record as a `=== VOICE IDENTITY ===`
 *     section inside the structured knowledge (so it rides the KB
 *     distiller as a structured section, verbatim);
 *   - gemini-session extracts it at composition time from the
 *     stored knowledge (parsing the stored section when a newer
 *     scan wrote one, else extracting from the raw page sections),
 *     so leads scanned before this feature carry it too.
 *
 * Pure string work — no LLM, no storage, no migration.
 */

import { cleanMarkdown } from './kb-distill.ts';

export interface VoiceIdentity {
  /** The business's own stated greeting/tagline, verbatim. */
  tagline: string | null;
  /** Verbatim first-person self-description sentences from its copy. */
  selfDescriptions: string[];
  /** Tone words evidenced in its copy (the scan's TONE section). */
  toneCues: string[];
  /** Short phrases its copy repeats verbatim. */
  signaturePhrases: string[];
  /** What it calls the people it serves ('guests', 'patients', …). */
  customerTerms: string[];
}

export function emptyVoiceIdentity(): VoiceIdentity {
  return { tagline: null, selfDescriptions: [], toneCues: [], signaturePhrases: [], customerTerms: [] };
}

export function isEmptyVoiceIdentity(v: VoiceIdentity): boolean {
  return !v.tagline
    && v.selfDescriptions.length === 0
    && v.toneCues.length === 0
    && v.signaturePhrases.length === 0
    && v.customerTerms.length === 0;
}

const MAX_TAGLINE_CHARS = 160;
const MAX_SELF_DESCRIPTION_CHARS = 240;
const MAX_TONE_CUE_CHARS = 40;
const MAX_SIGNATURE_CHARS = 120;
const MAX_CUSTOMER_TERM_CHARS = 40;
const MAX_SELF_DESCRIPTIONS = 3;
const MAX_TONE_CUES = 5;
const MAX_SIGNATURE_PHRASES = 3;
const MAX_CUSTOMER_TERMS = 3;

const cleanValue = (value: unknown, maxChars: number): string => {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, maxChars);
};

const cleanList = (value: unknown, maxItems: number, maxChars: number): string[] => {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const v = cleanValue(item, maxChars);
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (out.length >= maxItems) break;
  }
  return out;
};

/**
 * Normalize an unknown value (a record arriving through the
 * businessDemoConfig identity plug-in, or a parent session's stored
 * stamp) into a VoiceIdentity. Anything unusable is dropped; the
 * result is either a clean evidence record or the empty record.
 */
export function sanitizeVoiceIdentity(raw: unknown): VoiceIdentity {
  if (!raw || typeof raw !== 'object') return emptyVoiceIdentity();
  const r = raw as Record<string, unknown>;
  const tagline = cleanValue(r.tagline, MAX_TAGLINE_CHARS);
  return {
    tagline: tagline || null,
    selfDescriptions: cleanList(r.selfDescriptions, MAX_SELF_DESCRIPTIONS, MAX_SELF_DESCRIPTION_CHARS),
    toneCues: cleanList(r.toneCues, MAX_TONE_CUES, MAX_TONE_CUE_CHARS),
    signaturePhrases: cleanList(r.signaturePhrases, MAX_SIGNATURE_PHRASES, MAX_SIGNATURE_CHARS),
    customerTerms: cleanList(r.customerTerms, MAX_CUSTOMER_TERMS, MAX_CUSTOMER_TERM_CHARS),
  };
}

// ---------------------------------------------------------------------------
// Knowledge-blob section splitting (same header shape as kb-distill)
// ---------------------------------------------------------------------------

const SECTION_HEADER = /^=== (.+?) ===\s*$/;

interface KbSection { header: string; body: string }

function splitSections(text: string): KbSection[] {
  const sections: KbSection[] = [];
  let current: KbSection = { header: '', body: '' };
  for (const line of text.split('\n')) {
    const m = line.match(SECTION_HEADER);
    if (m) {
      sections.push(current);
      current = { header: m[1].trim(), body: '' };
    } else {
      current.body += (current.body ? '\n' : '') + line;
    }
  }
  sections.push(current);
  return sections.filter((s) => s.header || s.body.trim());
}

const RAW_PAGE_HEADERS: ReadonlySet<string> = new Set([
  'HOMEPAGE CONTENT',
  'ADDITIONAL WEBSITE CONTENT',
  'SECONDARY WEBSITE',
]);

// ---------------------------------------------------------------------------
// Extraction — deterministic, verbatim lifts from the business's copy
// ---------------------------------------------------------------------------

/** Boilerplate that must never pass as the business's voice: site
 *  chrome, legal/footer lines, and commerce UI words. */
const BOILERPLATE_RE = /privacy|terms|copyright|cookie|rights reserved|sitemap|accessibility|newsletter|checkout|shopping cart|sign in|log in|menu|navigation/i;

function headlineCandidate(rawMarkdown: string, businessName: string): string {
  // 1) An explicit label wins: "Tagline: …" / "Slogan — …" stated
  //    in the business's own copy.
  for (const line of rawMarkdown.split('\n')) {
    const m = line.match(/^\s*(?:[#>*\-•\s]*(?:tagline|slogan)\s*[:\-–—]\s*)(.+)$/i);
    if (m) {
      const v = cleanMarkdown(m[1]).replace(/^["“]|["”]$/g, '').trim();
      if (v.length >= 8 && v.length <= MAX_TAGLINE_CHARS && !BOILERPLATE_RE.test(v)) return v;
    }
  }
  // 2) Else the homepage's own headline — the line the business
  //    itself puts at the top of its site. First pass: H1s only.
  //    Second pass (sites whose hero is an H2): H1–H2 in document
  //    order, with section-y headings ("Our Services", "About Us"…)
  //    rejected. The bare business name alone is not a tagline, and
  //    neither is site chrome; a "Welcome to …" headline IS the
  //    business's own greeting and qualifies.
  const headings: Array<{ level: number; text: string }> = [];
  for (const line of rawMarkdown.split('\n')) {
    const m = line.match(/^(#{1,2})\s+(.+)$/);
    if (m) headings.push({ level: m[1].length, text: cleanMarkdown(m[2]).trim() });
  }
  const qualifies = (v: string): boolean => {
    const words = v.split(/\s+/).filter(Boolean);
    if (v.length < 10 || v.length > MAX_TAGLINE_CHARS) return false;
    if (words.length < 2 || words.length > 14) return false;
    if (v.toLowerCase() === businessName.trim().toLowerCase()) return false;
    if (BOILERPLATE_RE.test(v)) return false;
    return true;
  };
  for (const h of headings) {
    if (h.level === 1 && qualifies(h.text)) return h.text;
  }
  const SECTION_HEADING_RE = /^(our services|our products|about us|about|meet the team|meet|contact|services|products|testimonials|reviews|gallery|blog|news|faq|frequently asked)\b/i;
  for (const h of headings) {
    if (SECTION_HEADING_RE.test(h.text)) continue;
    if (qualifies(h.text)) return h.text;
  }
  return '';
}

/** First-person sentences in the business's own voice: "We …",
 *  "Our team …", "Welcome to <Business> …". Verbatim, capped. */
function selfDescriptions(cleanedText: string, businessName: string): string[] {
  // Per line, headings skipped: flattening the whole page first
  // would glue a heading onto the sentence after it and lift the
  // merged junk as if the business had written it.
  const sentences: string[] = [];
  for (const line of cleanedText.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    for (const s of t.split(/(?<=[.!?])\s+/)) sentences.push(s);
  }
  const out: string[] = [];
  const seen = new Set<string>();
  const name = businessName.trim().toLowerCase();
  for (const raw of sentences) {
    const s = raw.trim();
    if (s.length < 40 || s.length > MAX_SELF_DESCRIPTION_CHARS) continue;
    if (/https?:|@|cookie|privacy/i.test(s)) continue;
    const lower = s.toLowerCase();
    const firstPerson = /^we\b/.test(lower) || /\bwe (are|have|offer|provide|believe|know|treat|serve|help|specialize|pride|love|strive)\b/.test(lower)
      || /\bour (team|family|mission|goal|promise|commitment)\b/.test(lower)
      || (name.length > 2 && lower.startsWith('welcome to') && lower.includes(name));
    if (!firstPerson) continue;
    const key = lower.slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= MAX_SELF_DESCRIPTIONS) break;
  }
  return out;
}

const STOPWORDS: ReadonlySet<string> = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'for', 'on', 'with',
  'your', 'you', 'our', 'we', 'is', 'are', 'at', 'by', 'from', 'that',
  'this', 'it', 'its', 'as', 'be', 'will', 'can', 'all', 'more', 'than',
  'into', 'over', 'under', 'per', 'when', 'while', 'their', 'they',
  'them', 'us', 'are', 'was', 'were', 'has', 'have', 'had', 'not', 'no',
  'yes', 'if', 'so', 'do', 'does', 'get', 'got', 'one', 'two', 'out',
]);

const PHRASE_BOILERPLATE: ReadonlySet<string> = new Set([
  'privacy', 'terms', 'copyright', 'cookie', 'cookies', 'rights',
  'reserved', 'sitemap', 'accessibility', 'menu', 'navigation',
  'subscribe', 'newsletter', 'checkout', 'cart', 'login', 'account',
  'search', 'results', 'page', 'website', 'site', 'designed',
  'powered', 'home', 'contact', 'about', 'services', 'service',
]);

/** Short phrases the copy repeats verbatim (≥3 occurrences), with
 *  at least two real content words and no boilerplate or digits. */
function signaturePhrases(cleanedText: string): string[] {
  const counts = new Map<string, number>();
  for (const line of cleanedText.split('\n')) {
    const words = line.toLowerCase().replace(/[^a-z' ]+/g, ' ').split(/\s+/).filter(Boolean);
    for (let n = 4; n <= 6; n++) {
      for (let i = 0; i + n <= words.length; i++) {
        const gram = words.slice(i, i + n);
        if (gram.some((w) => PHRASE_BOILERPLATE.has(w))) continue;
        const content = gram.filter((w) => !STOPWORDS.has(w));
        if (content.length < 2) continue;
        const key = gram.join(' ');
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
  }
  const candidates = [...counts.entries()]
    .filter(([, c]) => c >= 3)
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length);
  const out: string[] = [];
  for (const [phrase] of candidates) {
    if (out.some((p) => p.includes(phrase) || phrase.includes(p))) continue;
    out.push(phrase.replace(/\b\w/g, (c) => c.toUpperCase()));
    if (out.length >= MAX_SIGNATURE_PHRASES) break;
  }
  return out;
}

const CUSTOMER_NOUNS = [
  'customers', 'clients', 'patients', 'guests', 'members', 'homeowners',
  'students', 'residents', 'families', 'visitors', 'patrons', 'pet owners',
  'drivers', 'riders', 'shoppers', 'tenants', 'policyholders',
];

/** What the business calls the people it serves: the noun it uses
 *  after "our", stated at least twice in its own copy. */
function customerTerms(cleanedText: string): string[] {
  const counts = new Map<string, number>();
  const re = new RegExp(`\\bour\\s+(${CUSTOMER_NOUNS.join('|')})\\b`, 'gi');
  for (const m of cleanedText.matchAll(re)) {
    const term = m[1].toLowerCase();
    counts.set(term, (counts.get(term) || 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_CUSTOMER_TERMS)
    .map(([term]) => term);
}

/**
 * Extract the voice identity from raw website copy (the scan-time
 * producer: scan-website passes the scraped markdown + the profile's
 * tone keywords). Deterministic; every value is a verbatim lift.
 */
export function extractVoiceIdentityFromCopy(
  rawCopy: string,
  businessName: string,
  toneKeywords?: string[],
): VoiceIdentity {
  if (!rawCopy || !rawCopy.trim()) {
    return sanitizeVoiceIdentity({ toneCues: toneKeywords ?? [] });
  }
  // A re-scan's source can already carry a stored VOICE IDENTITY
  // section (the enrichment rebuild reads the initial content):
  // never re-lift the record's own lines as if they were site copy.
  const withoutOwnSection = rawCopy
    .replace(/=== VOICE IDENTITY ===[\s\S]*?(?=\n=== |\n--- |$)/, '')
    .replace(/^(Stated line|Self-description|Signature phrases|Calls its customers):.*$/gm, '');
  const cleaned = cleanMarkdown(withoutOwnSection);
  return sanitizeVoiceIdentity({
    tagline: headlineCandidate(withoutOwnSection, businessName) || null,
    selfDescriptions: selfDescriptions(cleaned, businessName),
    toneCues: toneKeywords ?? [],
    signaturePhrases: signaturePhrases(cleaned),
    customerTerms: customerTerms(cleaned),
  });
}

// ---------------------------------------------------------------------------
// The stored KB section: `=== VOICE IDENTITY ===`
// ---------------------------------------------------------------------------

/** Quote-safe single-line value for the stored section: internal
 *  double quotes become single quotes so the parse stays exact. */
const sectionValue = (v: string): string => v.replace(/"/g, "'").replace(/\s+/g, ' ').trim();

/** The section scan-website stores inside the structured knowledge.
 *  '' when the record is empty — an honest site stores nothing. */
export function formatVoiceIdentitySection(identity: VoiceIdentity): string {
  const v = sanitizeVoiceIdentity(identity);
  if (isEmptyVoiceIdentity(v)) return '';
  const lines = ['=== VOICE IDENTITY ==='];
  if (v.tagline) lines.push(`Stated line: "${sectionValue(v.tagline)}"`);
  for (const s of v.selfDescriptions) lines.push(`Self-description: "${sectionValue(s)}"`);
  if (v.toneCues.length) lines.push(`Tone: ${v.toneCues.map(sectionValue).join(', ')}`);
  if (v.signaturePhrases.length) lines.push(`Signature phrases: ${v.signaturePhrases.map((p) => `"${sectionValue(p)}"`).join('; ')}`);
  if (v.customerTerms.length) lines.push(`Calls its customers: ${v.customerTerms.map(sectionValue).join(', ')}`);
  return lines.join('\n');
}

/** Parse a stored `=== VOICE IDENTITY ===` section back into the
 *  record; null when the knowledge carries none. */
export function parseVoiceIdentitySection(knowledge: string): VoiceIdentity | null {
  const section = splitSections(knowledge).find((s) => s.header === 'VOICE IDENTITY');
  if (!section) return null;
  const record: Record<string, unknown> = { selfDescriptions: [] as string[] };
  for (const line of section.body.split('\n')) {
    const t = line.trim();
    let m: RegExpMatchArray | null;
    if ((m = t.match(/^Stated line:\s*"(.*)"$/))) record.tagline = m[1];
    else if ((m = t.match(/^Self-description:\s*"(.*)"$/))) (record.selfDescriptions as string[]).push(m[1]);
    else if ((m = t.match(/^Tone:\s*(.+)$/))) record.toneCues = m[1].split(',').map((x) => x.trim()).filter(Boolean);
    else if ((m = t.match(/^Signature phrases:\s*(.+)$/))) record.signaturePhrases = m[1].split(';').map((x) => x.trim().replace(/^"|"$/g, '')).filter(Boolean);
    else if ((m = t.match(/^Calls its customers:\s*(.+)$/))) record.customerTerms = m[1].split(',').map((x) => x.trim()).filter(Boolean);
  }
  const parsed = sanitizeVoiceIdentity(record);
  return isEmptyVoiceIdentity(parsed) ? null : parsed;
}

/** The scan's TONE section keywords (themselves drawn from the
 *  site's copy by the profile analysis). */
function toneSectionKeywords(knowledge: string): string[] {
  const section = splitSections(knowledge).find((s) => s.header === 'TONE');
  if (!section) return [];
  return section.body.split('\n')
    .map((l) => l.trim().replace(/^-\s*/, ''))
    .filter((l) => l && l.length <= MAX_TONE_CUE_CHARS && !l.startsWith('==='));
}

/**
 * Extract the voice identity from a stored knowledge blob (the
 * composition-time producer gemini-session uses): the stored
 * section when a newer scan wrote one, else a fresh extraction
 * from the blob's raw page sections + its TONE section. A blob
 * with no section structure at all (e.g. a prospect's JSON) is
 * read as copy directly — the evidence rules still apply, and a
 * blob that states nothing yields the empty record.
 */
export function extractVoiceIdentity(knowledge: string, businessName: string): VoiceIdentity {
  if (!knowledge || !knowledge.trim()) return emptyVoiceIdentity();
  const stored = parseVoiceIdentitySection(knowledge);
  if (stored) return stored;
  const sections = splitSections(knowledge);
  const rawParts = sections.filter((s) => RAW_PAGE_HEADERS.has(s.header)).map((s) => s.body);
  const tone = toneSectionKeywords(knowledge);
  if (rawParts.length) {
    return extractVoiceIdentityFromCopy(rawParts.join('\n\n'), businessName, tone);
  }
  if (sections.length <= 1) {
    return extractVoiceIdentityFromCopy(knowledge, businessName, tone);
  }
  return sanitizeVoiceIdentity({ toneCues: tone });
}

// ---------------------------------------------------------------------------
// Composition: the system-prompt identity section
// ---------------------------------------------------------------------------

/**
 * The identity section businessDemoConfig weaves into the composed
 * system prompt (and gemini-session rebuilds for Sara's segment,
 * the example-listings pattern). '' when the record is empty — the
 * caller's composition then stays byte-identical to before.
 */
export function voiceIdentitySection(identity: VoiceIdentity, businessName: string): string {
  const v = sanitizeVoiceIdentity(identity);
  if (isEmptyVoiceIdentity(v)) return '';
  const name = businessName.trim() || 'this business';
  const lines = [
    `THE BUSINESS'S OWN VOICE — HOW ${name} SPEAKS, IN ITS OWN WORDS (lifted from its own website during the scan — use ONLY what is listed here as the business's own voice; never invent a slogan, greeting or phrase for it, and never borrow another business's words):`,
  ];
  if (v.tagline) {
    lines.push(`- ITS OWN STATED LINE: "${v.tagline}" — this is the greeting/tagline ${name} itself puts on its website. When you step into role and introduce the business, use its own line, in its own words, as part of that introduction.`);
  }
  if (v.selfDescriptions.length) {
    lines.push(`- HOW IT DESCRIBES ITSELF: ${v.selfDescriptions.map((s) => `"${s}"`).join(' / ')} — prefer its own phrasing when you describe what it does.`);
  }
  if (v.toneCues.length) {
    lines.push(`- ITS TONE: ${v.toneCues.join(', ')} — match that tone while you speak for the business.`);
  }
  if (v.signaturePhrases.length) {
    lines.push(`- PHRASES IT USES: ${v.signaturePhrases.map((s) => `"${s}"`).join('; ')} — you may echo them naturally where they fit; never force them.`);
  }
  if (v.customerTerms.length) {
    lines.push(`- WHAT IT CALLS THE PEOPLE IT SERVES: its "${v.customerTerms[0]}" — use the same word for the caller while you speak for the business.`);
  }
  return lines.join('\n');
}
