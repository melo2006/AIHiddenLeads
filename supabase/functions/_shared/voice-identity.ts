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

const SECTION_HEADING_RE = /^(our services|our products|about us|about|meet the team|meet|contact|services|products|properties|testimonials|reviews|gallery|blog|news|faq|frequently asked)\b/i;

/**
 * The business's own stated line, read from its HOMEPAGE copy only
 * (the caller scopes the input: sub-page titles and other pages'
 * headlines are never the business's greeting). Three evidence
 * tiers, in order:
 *   1. an explicit "Tagline:" / "Slogan:" label in its own copy;
 *   2. its own "Welcome to …" greeting sentence — the greeting it
 *      actually greets its visitors with;
 *   3. its homepage headline (H1 first, then H2 with section-y
 *      headings rejected). Firecrawl often GLUES the headline and
 *      the copy after it into one line, so a heading's value is
 *      its first segment (cut at the next inline heading marker)
 *      or a bold span inside it.
 * The bare business name alone is not a tagline, and neither is
 * site chrome.
 */
function headlineCandidate(homepageCopy: string, businessName: string): string {
  const qualifies = (v: string): boolean => {
    const words = v.split(/\s+/).filter(Boolean);
    if (v.length < 10 || v.length > MAX_TAGLINE_CHARS) return false;
    if (words.length < 2 || words.length > 14) return false;
    if (v.toLowerCase() === businessName.trim().toLowerCase()) return false;
    if (BOILERPLATE_RE.test(v)) return false;
    return true;
  };
  // 1) An explicit label wins.
  for (const line of homepageCopy.split('\n')) {
    const m = line.match(/^\s*(?:[#>*\-•\s]*(?:tagline|slogan)\s*[:\-–—]\s*)(.+)$/i);
    if (m) {
      const v = cleanMarkdown(m[1]).replace(/^["“]|["”]$/g, '').trim();
      if (v.length >= 8 && v.length <= MAX_TAGLINE_CHARS && !BOILERPLATE_RE.test(v)) return v;
    }
  }
  // 2) Its own "Welcome to …" greeting sentence. (A dot followed
  //    by a letter is a domain dot, not a sentence end.)
  const plain = cleanMarkdown(homepageCopy).replace(/\*/g, '');
  const welcome = plain.match(/welcome to\s(?:[^.!?\n]|\.(?=[a-z])){5,160}?(?:[.!?](?=\s|$)|$)/i);
  if (welcome) {
    const v = welcome[0].replace(/\s+/g, ' ').trim();
    if (v.length >= 12 && v.length <= MAX_TAGLINE_CHARS && !BOILERPLATE_RE.test(v)) return v;
  }
  // 3) Homepage headlines, H1 pass then H1–H2 pass.
  const headings: Array<{ level: number; values: string[] }> = [];
  for (const line of homepageCopy.split('\n')) {
    const m = line.match(/^(#{1,2})\s+(.+)$/);
    if (!m) continue;
    const segment = cleanMarkdown(m[2].split(/\s#{1,6}\s/)[0]).replace(/\*/g, '').trim();
    const values = [segment];
    for (const b of m[2].matchAll(/\*\*([^*]{10,160})\*\*/g)) {
      values.push(cleanMarkdown(b[1]).replace(/\*/g, '').trim());
    }
    headings.push({ level: m[1].length, values });
  }
  for (const h of headings) {
    if (h.level !== 1) continue;
    for (const v of h.values) if (qualifies(v)) return v;
  }
  for (const h of headings) {
    for (const v of h.values) {
      if (SECTION_HEADING_RE.test(v)) continue;
      if (qualifies(v)) return v;
    }
  }
  return '';
}

/** Drop review/testimonial blocks from the voice copy: a customer
 *  quoted on the site speaks in the first person too, but their
 *  words are not the business's own voice. Blocks run from a
 *  review-ish heading to the next heading. */
const REVIEW_HEADING_RE = /review|testimonial|what (our|clients|customers|people)|client stories|success stories/i;

function dropReviewBlocks(cleanedText: string): string {
  const out: string[] = [];
  let inReview = false;
  for (const line of cleanedText.split('\n')) {
    const t = line.trim();
    if (t.startsWith('#')) {
      inReview = REVIEW_HEADING_RE.test(t);
      if (!inReview) out.push(line);
      continue;
    }
    if (!inReview) out.push(line);
  }
  return out.join('\n');
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
    // A quote-led sentence is someone quoted ON the site (a review,
    // a testimonial), not the business speaking for itself.
    if (/^["“”'‘’]/.test(s)) continue;
    // Glued crawler artifacts (a heading or icon fused into the
    // line) are not sentences the business wrote as prose.
    if (s.includes('#') || s.includes('→')) continue;
    // Customer-voice shapes: "we" as the BUYER — we received
    // reports from <staff name>, we hired / chose / called them.
    // The business does not talk about itself that way.
    if (/\bwe (received|got)\b[^.]*\bfrom\b/i.test(s)) continue;
    if (/\bwe (hired|chose|selected|called|contacted|found)\b/i.test(s)) continue;
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
  // Site chrome that repeats on every page (nav labels, link
  // furniture) is not the business's voice either.
  'gallery', 'photo', 'photos', 'tab', 'tabs', 'click', 'opens',
  'blog', 'read', 'view', 'views', 'learn', 'discover', 'explore',
  // URL / file-path fragments the crawler leaves in the copy.
  'html', 'www', 'com', 'http', 'https', 'wp', 'php', 'index',
  'jpg', 'png',
]);

/** Short phrases the copy repeats verbatim (≥3 occurrences on ≥2
 *  distinct lines), with at least two real content words and no
 *  boilerplate or digits. Phrases are counted INSIDE sentences —
 *  a window sliding across a sentence boundary is a counting
 *  artifact, not a phrase the business repeats. The business's
 *  own name is not a signature phrase, and shifted windows of one
 *  repetition collapse to a single maximal phrase. */
function signaturePhrases(cleanedText: string, businessName: string, homepageText?: string): string[] {
  const counts = new Map<string, number>();
  const lines = new Map<string, Set<number>>();
  const nameKey = businessName.toLowerCase().replace(/[^a-z' ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const collect = (text: string, onLine: (key: string, lineIdx: number) => void) => {
    text.split('\n').forEach((rawLine, lineIdx) => {
      for (const sentence of rawLine.split(/[.!?]+/)) {
        const words = sentence.toLowerCase().replace(/[^a-z' ]+/g, ' ').split(/\s+/).filter(Boolean);
        for (let n = 4; n <= 6; n++) {
          for (let i = 0; i + n <= words.length; i++) {
            const gram = words.slice(i, i + n);
            if (gram.some((w) => PHRASE_BOILERPLATE.has(w))) continue;
            const content = gram.filter((w) => !STOPWORDS.has(w));
            if (content.length < 2) continue;
            onLine(gram.join(' '), lineIdx);
          }
        }
      }
    });
  };
  collect(cleanedText, (key, lineIdx) => {
    counts.set(key, (counts.get(key) || 0) + 1);
    let set = lines.get(key);
    if (!set) { set = new Set(); lines.set(key, set); }
    set.add(lineIdx);
  });
  // When the homepage copy is identifiable, a signature phrase
  // must appear on the front door at least once — repetition that
  // lives only in blog listings and sub-pages is content, not the
  // business's signature.
  let homepageGrams: Set<string> | null = null;
  if (homepageText && homepageText.trim()) {
    homepageGrams = new Set<string>();
    collect(homepageText, (key) => { homepageGrams!.add(key); });
  }
  const candidates = [...counts.entries()]
    .filter(([key, c]) => c >= 3 && (lines.get(key)?.size ?? 0) >= 2 && !(nameKey.length > 3 && key.includes(nameKey)) && (!homepageGrams || homepageGrams.has(key)))
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length);
  const kept: string[] = [];
  const keptWords: Array<Set<string>> = [];
  for (const [phrase] of candidates) {
    const words = new Set(phrase.split(' '));
    const nearDuplicate = keptWords.some((kw) => {
      let overlap = 0;
      for (const w of words) if (kw.has(w)) overlap++;
      return overlap >= 3 && overlap >= Math.min(words.size, kw.size) - 1;
    });
    if (nearDuplicate) continue;
    kept.push(phrase);
    keptWords.push(words);
    if (kept.length >= MAX_SIGNATURE_PHRASES) break;
  }
  return kept.map((p) => p.replace(/\b\w/g, (c) => c.toUpperCase()));
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
 *
 * `headlineCopy` is the business's homepage copy when the caller
 * has it separately — the stated line is read from the front door
 * only. Without it, the headline source is the copy up to the first
 * sub-page block (scan-website prefixes sub-pages with SOURCE URL
 * lines; everything before the first is the homepage).
 */
export function extractVoiceIdentityFromCopy(
  rawCopy: string,
  businessName: string,
  toneKeywords?: string[],
  headlineCopy?: string,
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
  const headlineSource = headlineCopy ?? withoutOwnSection.split(/^SOURCE URL:.*$/m)[0];
  const cleaned = cleanMarkdown(withoutOwnSection);
  // Review/testimonial blocks are dropped from the voice copy: a
  // customer quoted on the site is not the business's own voice.
  const voiceCopy = dropReviewBlocks(cleaned);
  return sanitizeVoiceIdentity({
    tagline: headlineCandidate(headlineSource, businessName) || null,
    selfDescriptions: selfDescriptions(voiceCopy, businessName),
    toneCues: toneKeywords ?? [],
    signaturePhrases: signaturePhrases(voiceCopy, businessName, headlineCopy ? dropReviewBlocks(cleanMarkdown(headlineCopy)) : undefined),
    customerTerms: customerTerms(voiceCopy),
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
    // The stated line comes from the HOMEPAGE section alone when
    // the blob carries one — other pages' titles are not the
    // business's greeting.
    const homepageBody = sections.find((s) => s.header === 'HOMEPAGE CONTENT')?.body;
    return extractVoiceIdentityFromCopy(rawParts.join('\n\n'), businessName, tone, homepageBody);
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
