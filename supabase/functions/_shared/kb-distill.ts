/**
 * KB DISTILLATION (Publish #85b, 2026-11-15) — the cost fix for
 * per-turn context re-billing.
 *
 * Gemini Live charges for EVERY token in the session context on
 * EVERY turn (Google's own Live best-practices doc), and the demo
 * knowledge base is the biggest thing in that context: a stored
 * `leads.website_content` blob is raw Firecrawl page markdown,
 * truncated at 160,000 chars (~40k tokens). Measured 2026-11-15 on
 * the live rows: 2 of the 14 pinned realtor examples sit AT the
 * 160k cap while the other 12 are 1.4k–7.3k chars — and in the big
 * blobs ~49% of all characters are raw URLs (markdown link targets
 * and CDN image URLs a voice agent can never use), ~91% is raw page
 * dumps, and the generated structured summary is only ~9%.
 *
 * This module turns a stored KB into a compact structured BRIEF at
 * session-composition time (pure string work — no LLM, no storage,
 * no migration; the full text stays in the DB untouched):
 *
 *   - structured sections (the scan's own generated summary:
 *     services, pricing, trust, FAQs, call goals, tone, reviews,
 *     research) ride VERBATIM;
 *   - raw page markdown is cleaned (images dropped, links reduced
 *     to their text, bare URLs stripped), line-deduped (nav menus
 *     and footers repeat on every page), and carried as KEY PAGE
 *     CONTENT inside a hard char budget;
 *   - contact facts, on-site Q&A pairs, about/team segments and a
 *     page index are extracted deterministically.
 *
 * Tiered access: when a brief replaced the full text, the session
 * config also carries the full text OUTSIDE the prompt
 * (config.kbFullText) and the Live proxy declares a
 * `lookup_business_detail` tool over it (searchKnowledgeBase), so a
 * question beyond the brief is answered from the real passage, not
 * invented and not a flat "I don't know".
 *
 * Everything is behind KB_SLIM_BRIEF_ENABLED (default OFF): with
 * the flag off, composeSessionKnowledge returns the input untouched
 * and adds no config keys, so session composition stays
 * byte-identical to the pre-#85b behavior. Small KBs (at or under
 * KB_PASSTHROUGH_MAX_CHARS) always pass through whole — for them
 * the brief could save nothing worth the risk.
 */

export const KB_SLIM_FLAG_ENV = 'KB_SLIM_BRIEF_ENABLED';

/** KBs at or under this size ride whole, flag or not. */
export const KB_PASSTHROUGH_MAX_CHARS = 12_000;
/** The brief never exceeds this, however large the source KB. */
export const KB_BRIEF_MAX_CHARS = 60_000;
/** …and never goes below this budget when a big KB is distilled. */
export const KB_BRIEF_MIN_CHARS = 12_000;
/** Target: the brief is at most this fraction of the original. */
export const KB_BRIEF_FRACTION = 0.4;
/** If distillation cannot beat this fraction, keep the full text. */
export const KB_MIN_WORTHWHILE_FRACTION = 0.85;

const MAX_CONTACT_ITEMS = 8;
const MAX_FAQ_PAIRS = 10;
const MAX_PAGE_INDEX = 40;
const MAX_ABOUT_CHARS = 2_800;
const MAX_RESEARCH_CHARS = 6_000;
const LOOKUP_MAX_PASSAGES = 3;
const LOOKUP_MAX_TOTAL_CHARS = 3_600;
const LOOKUP_PASSAGE_CHARS = 1_200;

/** Rough token estimate (English markdown ≈ 4 chars/token). Used
 *  for reporting and tests; billing follows Google's tokenizer. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function kbSlimEnabled(
  getEnv: (name: string) => string | undefined | null,
): boolean {
  const v = String(getEnv(KB_SLIM_FLAG_ENV) ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'on' || v === 'yes';
}

export interface DistilledKnowledge {
  brief: string;
  fullText: string;
  /** True when the brief actually replaced the full text. */
  distilled: boolean;
  originalChars: number;
  briefChars: number;
}

export interface SessionKnowledge {
  /** What goes into the session config as the KB (brief or full). */
  sessionKnowledge: string;
  /** Present only when distilled: the full text, for the lookup. */
  kbFullText?: string;
  /** Present only when distilled: arms the proxy's lookup tool. */
  kbLookup?: boolean;
}

/**
 * The one call gemini-session makes. Flag off or nothing worth
 * distilling → the input, untouched, with NO extra keys (the
 * composed config stays byte-identical to pre-#85b). Distilled →
 * the brief for the prompt plus the full text riding outside it.
 */
export function composeSessionKnowledge(
  fullText: string,
  getEnv: (name: string) => string | undefined | null,
): SessionKnowledge {
  if (!kbSlimEnabled(getEnv)) return { sessionKnowledge: fullText };
  const d = distillKnowledgeBase(fullText);
  if (!d.distilled) return { sessionKnowledge: fullText };
  return { sessionKnowledge: d.brief, kbFullText: d.fullText, kbLookup: true };
}

// ---------------------------------------------------------------------------
// Section splitting
// ---------------------------------------------------------------------------

interface KbSection {
  header: string; // '' for the preamble before the first header
  body: string;
}

const SECTION_HEADER = /^=== (.+?) ===\s*$/;
const UPLOAD_HEADER = /^--- (Uploaded (?:file|PDF): .+?) ---\s*$/;

function splitKbSections(text: string): KbSection[] {
  const sections: KbSection[] = [];
  let current: KbSection = { header: '', body: '' };
  for (const line of text.split('\n')) {
    const m = line.match(SECTION_HEADER) || line.match(UPLOAD_HEADER);
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

/** Raw page-dump sections: the Firecrawl markdown of the business's
 *  own pages. Everything else (the scan's generated structured
 *  summary, uploaded documents, research) is treated as structured. */
const RAW_PAGE_HEADERS: ReadonlySet<string> = new Set([
  'HOMEPAGE CONTENT',
  'ADDITIONAL WEBSITE CONTENT',
  'SECONDARY WEBSITE',
]);

// ---------------------------------------------------------------------------
// Markdown cleaning
// ---------------------------------------------------------------------------

/**
 * Reduce Firecrawl markdown to the words a voice agent can use:
 * images dropped whole (their CDN URLs were ~half the big KBs),
 * links reduced to their visible text, bare URLs stripped, HTML
 * and markdown escapes removed. Deterministic; keeps every fact
 * carried in visible text.
 */
export function cleanMarkdown(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // image markdown, URL and all
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // link → its text
    .replace(/https?:\/\/[^\s)\]"']+/g, ' ') // bare URLs
    .replace(/<[^>]+>/g, ' ') // residual HTML
    .replace(/\\+\s/g, ' ') // markdown hard-break escapes ("\\ ")
    .replace(/\\([\\`*_{}[\]()#+\-.!>])/g, '$1') // escaped punctuation
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Firecrawl page dumps often arrive as a few giant lines with the
 *  heading markers inline. Give headings their own lines first so
 *  the dedupe passes below can see the repeated blocks. */
function explodeHeadings(text: string): string {
  return text.replace(/\s+(#{1,6}\s)/g, '\n$1');
}

/** Segment-level dedupe: nav menus, footers and form boilerplate
 *  repeat on every crawled page. Split on heading boundaries and
 *  blank lines; the first occurrence of each normalized segment
 *  (≥ 40 chars) wins. */
function dedupeSegments(text: string): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const seg of text.split(/\n(?=#{1,6}\s)|\n\s*\n/)) {
    const key = seg.trim().toLowerCase().replace(/\s+/g, ' ');
    if (key.length >= 40) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    if (seg.trim()) out.push(seg.trim());
  }
  return out.join('\n\n');
}

/** Line-level dedupe, the second pass: repeated single lines
 *  (≥ 12 chars normalized) keep only their first occurrence. */
function dedupeLines(text: string): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of text.split('\n')) {
    const key = line.trim().toLowerCase().replace(/\s+/g, ' ');
    if (key.length >= 12) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    out.push(line);
  }
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// Page blocks (inside the raw sections)
// ---------------------------------------------------------------------------

interface PageBlock {
  url: string;
  text: string;
}

function splitPageBlocks(body: string): PageBlock[] {
  const blocks: PageBlock[] = [];
  let current: PageBlock = { url: '', text: '' };
  for (const line of body.split('\n')) {
    const src = line.match(/^SOURCE URL:\s*(\S+)\s*$/);
    const head = line.match(/^###\s+(https?:\/\/\S+)\s*$/);
    if (src || head) {
      blocks.push(current);
      current = { url: (src?.[1] || head?.[1] || ''), text: '' };
    } else {
      current.text += (current.text ? '\n' : '') + line;
    }
  }
  blocks.push(current);
  return blocks.filter((b) => b.url || b.text.trim());
}

/** A page's display path for the index: full URL minus the query
 *  string (the giant search URLs were pure noise). */
function pageLabel(url: string): string {
  return url.split('?')[0].slice(0, 120);
}

// ---------------------------------------------------------------------------
// Fact extraction (deterministic, from the CLEANED raw text)
// ---------------------------------------------------------------------------

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_RE = /(?:\+?1[\s.\-]?)?\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}/g;

function extractContacts(text: string): { emails: string[]; phones: string[] } {
  const emails = [...new Set([...text.matchAll(EMAIL_RE)].map((m) => m[0].toLowerCase()))]
    .filter((e) => !/example\.|@sentry|@wix|@squarespace/.test(e))
    .slice(0, MAX_CONTACT_ITEMS);
  const phones = [...new Set([...text.matchAll(PHONE_RE)].map((m) => m[0].trim()))]
    .slice(0, MAX_CONTACT_ITEMS);
  return { emails, phones };
}

interface FaqPair {
  q: string;
  a: string;
}

/** Q&A pairs stated on the site itself: a line ending in '?' with
 *  real answer text after it. (The structured summary's FAQ section
 *  carries questions only — these carry the site's own answers.) */
function extractFaqPairs(text: string): FaqPair[] {
  const lines = text.split('\n').map((l) => l.trim());
  const pairs: FaqPair[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < lines.length && pairs.length < MAX_FAQ_PAIRS; i++) {
    const q = lines[i].replace(/^#{1,6}\s+/, '').replace(/^\*\*(.+)\*\*$/, '$1').trim();
    if (!q.endsWith('?') || q.length < 15 || q.length > 180) continue;
    const key = q.toLowerCase();
    if (seen.has(key)) continue;
    const answerLines: string[] = [];
    for (let j = i + 1; j < lines.length && answerLines.join(' ').length < 400; j++) {
      const l = lines[j];
      if (!l) { if (answerLines.length) break; continue; }
      if (/^#{1,6}\s/.test(l) || l.endsWith('?')) break;
      answerLines.push(l);
    }
    const a = answerLines.join(' ').trim();
    if (a.length < 25) continue;
    seen.add(key);
    pairs.push({ q, a: a.slice(0, 400) });
  }
  return pairs;
}

/** About/team material: heading-led segments whose heading names
 *  the team or the business story. Capped — the brief needs the
 *  people and the story, not every page's full prose. Nav lines
 *  riding inside a segment (a page's menu sits between its title
 *  heading and its first content heading) are dropped first. */
function extractAboutSegments(pages: PageBlock[]): string {
  const chunks: string[] = [];
  let total = 0;
  for (const page of pages) {
    const segments = page.text.split(/\n(?=#{1,4}\s)/);
    for (const seg of segments) {
      const heading = seg.match(/^#{1,4}\s+(.+)$/m)?.[1]?.trim() || '';
      if (!/meet|team|about|our story|who we are/i.test(heading)) continue;
      const body = seg
        .split('\n')
        .filter((line) => {
          const joins = (line.match(/ - /g) || []).length;
          return !(joins >= 4 && !line.includes('. ')); // a menu line, not prose
        })
        .join('\n')
        .trim();
      if (body.length < 60) continue;
      const take = body.slice(0, MAX_ABOUT_CHARS - total);
      chunks.push(take);
      total += take.length;
      if (total >= MAX_ABOUT_CHARS) return chunks.join('\n\n');
    }
  }
  return chunks.join('\n\n');
}

// ---------------------------------------------------------------------------
// The distiller
// ---------------------------------------------------------------------------

const BRIEF_PREAMBLE =
  'KNOWLEDGE BRIEF — distilled from this business\'s full website text. The complete text is on file: when a visitor asks about a specific detail this brief does not cover (a particular service, policy, person, price or fact), use the lookup_business_detail tool to search the full text BEFORE saying you do not know. Never invent a detail the brief and the lookup do not support.';

export function distillKnowledgeBase(fullText: string): DistilledKnowledge {
  const originalChars = fullText.length;
  const passthrough: DistilledKnowledge = {
    brief: fullText, fullText, distilled: false, originalChars, briefChars: originalChars,
  };
  if (originalChars <= KB_PASSTHROUGH_MAX_CHARS) return passthrough;

  const budget = Math.min(
    KB_BRIEF_MAX_CHARS,
    Math.max(KB_BRIEF_MIN_CHARS, Math.floor(originalChars * KB_BRIEF_FRACTION)),
  );

  const sections = splitKbSections(fullText);
  const structuredParts: string[] = [];
  const pages: PageBlock[] = [];
  let researchPart = '';

  for (const section of sections) {
    if (RAW_PAGE_HEADERS.has(section.header)) {
      pages.push(...splitPageBlocks(section.body));
    } else if (section.header === 'INDUSTRY & COMPETITOR RESEARCH') {
      researchPart = cleanMarkdown(section.body).slice(0, MAX_RESEARCH_CHARS);
    } else if (section.header) {
      const cleaned = cleanMarkdown(section.body);
      if (cleaned) structuredParts.push(`=== ${section.header} ===\n${cleaned}`);
    } else if (section.body.trim()) {
      // Preamble (e.g. the LEARNING COVERAGE line): one or two
      // factual lines about the scan itself — keep verbatim.
      structuredParts.push(section.body.trim().slice(0, 400));
    }
  }

  // Clean + dedupe the raw pages once; extractions read this text.
  const cleanedPages = pages.map((p) => ({
    url: p.url,
    text: explodeHeadings(cleanMarkdown(p.text)),
  }));
  const joinedRaw = dedupeLines(dedupeSegments(cleanedPages.map((p) => p.text).join('\n\n')));

  const { emails, phones } = extractContacts(joinedRaw);
  const faqPairs = extractFaqPairs(joinedRaw);
  const about = extractAboutSegments(cleanedPages);

  const pageIndex = cleanedPages
    .filter((p) => p.url)
    .slice(0, MAX_PAGE_INDEX)
    .map((p) => {
      const title = (p.text.match(/^#{1,3}\s+(.+)$/m)?.[1] || p.text.split('\n').find((l) => l.trim().length > 8) || '')
        .trim().slice(0, 90);
      return `- ${pageLabel(p.url)}${title ? ` — ${title}` : ''}`;
    });

  const fixedParts: string[] = [BRIEF_PREAMBLE, ...structuredParts];
  if (emails.length || phones.length) {
    fixedParts.push(
      `=== CONTACT DETAILS FROM THE SITE ===\n${[...emails, ...phones].map((c) => `- ${c}`).join('\n')}`,
    );
  }
  if (pageIndex.length) fixedParts.push(`=== SITE PAGES ===\n${pageIndex.join('\n')}`);
  if (faqPairs.length) {
    fixedParts.push(
      `=== QUESTIONS ANSWERED ON THE SITE ===\n${faqPairs.map((p) => `Q: ${p.q}\nA: ${p.a}`).join('\n')}`,
    );
  }
  if (about) fixedParts.push(`=== ABOUT & TEAM ===\n${about}`);
  if (researchPart) {
    fixedParts.push(`=== INDUSTRY & COMPETITOR RESEARCH ===\n${researchPart}`);
  }

  const fixedChars = fixedParts.join('\n\n').length;
  const contentBudget = Math.max(0, budget - fixedChars - 40);

  // KEY PAGE CONTENT: the cleaned, deduped page text in original
  // order, cut at a line boundary inside its budget. This is the
  // elastic section — structured facts are never trimmed for it.
  let keyContent = '';
  if (contentBudget > 0 && joinedRaw) {
    if (joinedRaw.length <= contentBudget) {
      keyContent = joinedRaw;
    } else {
      const cut = joinedRaw.slice(0, contentBudget);
      const lastBreak = cut.lastIndexOf('\n');
      keyContent = (lastBreak > contentBudget * 0.7 ? cut.slice(0, lastBreak) : cut).trimEnd();
    }
  }

  const parts = keyContent
    ? [...fixedParts, `=== KEY PAGE CONTENT ===\n${keyContent}`]
    : fixedParts;
  const brief = parts.join('\n\n');

  // Safety valve: a KB that is nearly all structured summary has
  // nothing worth distilling — keep the full text in the prompt.
  if (brief.length >= originalChars * KB_MIN_WORTHWHILE_FRACTION) return passthrough;

  return { brief, fullText, distilled: true, originalChars, briefChars: brief.length };
}

// ---------------------------------------------------------------------------
// The lookup tier: deterministic search over the full text
// ---------------------------------------------------------------------------

export interface LookupPassage {
  source: string;
  text: string;
}

const STOPWORDS: ReadonlySet<string> = new Set([
  'the', 'and', 'for', 'with', 'what', 'when', 'where', 'which', 'does', 'did',
  'have', 'has', 'had', 'are', 'was', 'were', 'will', 'would', 'can', 'could',
  'you', 'your', 'yours', 'they', 'them', 'their', 'this', 'that', 'there',
  'about', 'from', 'into', 'over', 'under', 'much', 'many', 'long', 'take',
  'takes', 'cost', 'price', // price words stay searchable via other terms
]);

function queryTerms(query: string): string[] {
  const raw = query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return [...new Set(raw.filter((t) => t.length >= 3 && !STOPWORDS.has(t)))].slice(0, 8);
}

interface RawPassage extends LookupPassage {
  order: number;
}

/** Split the full text into searchable passages, each labelled by
 *  the section or page it came from. */
function splitPassages(fullText: string): RawPassage[] {
  const passages: RawPassage[] = [];
  let order = 0;
  const push = (source: string, text: string) => {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (clean.length < 40) return;
    for (let i = 0; i < clean.length; i += LOOKUP_PASSAGE_CHARS) {
      passages.push({ source, text: clean.slice(i, i + LOOKUP_PASSAGE_CHARS), order: order++ });
    }
  };
  for (const section of splitKbSections(fullText)) {
    if (RAW_PAGE_HEADERS.has(section.header)) {
      for (const page of splitPageBlocks(section.body)) {
        const label = page.url ? pageLabel(page.url) : section.header;
        for (const para of page.text.split(/\n\s*\n/)) push(label, cleanMarkdown(para));
      }
    } else {
      for (const para of section.body.split(/\n\s*\n/)) {
        push(section.header || 'Overview', cleanMarkdown(para));
      }
    }
  }
  return passages;
}

/**
 * Search the business's full KB text for a detail beyond the brief.
 * Deterministic term-frequency ranking (heading/source bonus),
 * original order breaks ties. Returns at most LOOKUP_MAX_PASSAGES
 * passages inside a total char cap — a lookup result joins the
 * session context, so it stays small on purpose.
 */
export function searchKnowledgeBase(
  fullText: string,
  query: string,
): { passages: LookupPassage[] } {
  const terms = queryTerms(query);
  if (!terms.length || !fullText) return { passages: [] };
  const scored: Array<{ passage: RawPassage; score: number }> = [];
  for (const passage of splitPassages(fullText)) {
    const hay = passage.text.toLowerCase();
    const src = passage.source.toLowerCase();
    let score = 0;
    for (const term of terms) {
      let idx = 0;
      while ((idx = hay.indexOf(term, idx)) !== -1) { score += 1; idx += term.length; }
      if (src.includes(term)) score += 3;
    }
    if (score > 0) scored.push({ passage, score });
  }
  scored.sort((a, b) => b.score - a.score || a.passage.order - b.passage.order);
  const out: LookupPassage[] = [];
  let total = 0;
  for (const { passage } of scored) {
    if (out.length >= LOOKUP_MAX_PASSAGES || total + passage.text.length > LOOKUP_MAX_TOTAL_CHARS) break;
    out.push({ source: passage.source, text: passage.text });
    total += passage.text.length;
  }
  return { passages: out };
}
