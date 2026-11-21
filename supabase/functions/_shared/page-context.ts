// PAGE AWARENESS for homepage SALES sessions (homepage-test item 6,
// 2026-11-21). Before this module, the only page datum a homepage
// session ever carried was the campaign entry-path label, validated
// against the campaign milestone list (PUBLIC_PATHS in
// report-context.ts) — a list that does not include /plans — and even
// that label was used only for feature gating and call_history
// metadata: it never reached Aspen's prompt, and no mid-session
// route-update message existed in the client→proxy protocol, so she
// answered page-level questions ("what kind of B2B leads… how do you
// know my customer?", asked while the visitor stood on /plans)
// generically, from the plan table alone.
//
// This module is the single source for the page-context channel:
//   - PUBLIC_PAGE_PATHS / PUBLIC_PAGE_PREFIXES — the recognized set
//     for PAGE CONTEXT. Deliberately WIDER than the campaign
//     milestone sets (campaignTracking.PUBLIC_CAMPAIGN_PATHS and
//     report-context.PUBLIC_PATHS): those gate analytics conversions
//     and the campaign-events server validation, and they keep their
//     exact membership. Page context travels in its own mint field
//     (`page`) and its own socket message (`page_context`), validated
//     here, so widening what Aspen can see never widens what counts
//     as a campaign conversion.
//   - sanitizePageContext — the one validator every hop uses (client
//     payload builder, gemini-session stamp, proxy message handler).
//     Client-supplied values are never trusted raw: the path must be
//     a recognized public page, the section must be a known homepage
//     section, and the title is scrubbed and capped.
//   - PAGE_AWARENESS_INSTRUCTION / pageContextLine — the setup-time
//     prompt block the proxy appends on sales sessions only.
//   - pageContextUpdateNote — the stage-direction text the proxy
//     injects when the visitor's page changes mid-session.
//
// Scope: homepage SALES sessions only. Prospect simulations keep
// their own world — the proxy never injects page context into a
// simulation, and gemini-session stamps pageContext only on the
// homepage agent's config.

export interface PageContext {
  path: string;
  section?: string;
  title?: string;
}

/** Exact public paths a page context may name. */
export const PUBLIC_PAGE_PATHS = [
  '/',
  '/plans',
  '/demo',
  '/demo/br',
  '/demo-site',
  '/book',
  '/checkout',
  '/checkout/return',
  '/agents/realtors',
  '/setup',
  '/account',
  '/help',
  '/marketing',
  '/privacy',
  '/terms',
] as const;

/** Prefix-matched public paths (parameterised routes). */
export const PUBLIC_PAGE_PREFIXES = ['/services/'] as const;

/** Homepage in-page sections a page context may name (the campaign
 * section set — the screens a homepage visitor scrolls through). */
export const PAGE_SECTIONS = [
  'services',
  'pricing',
  'map-visibility',
  'demo-form',
  'how-it-works',
  'faq',
  'addons',
] as const;

export function isPublicPagePath(path: unknown): path is string {
  if (typeof path !== 'string' || path.length === 0 || path.length > 100) return false;
  if ((PUBLIC_PAGE_PATHS as readonly string[]).includes(path)) return true;
  return PUBLIC_PAGE_PREFIXES.some(prefix => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'));
}

const PAGE_LABELS: Record<string, string> = {
  '/': 'the AI Hidden Leads homepage',
  '/plans': 'the plans page — the page that lists the Premium, Professional and Platinum plans side by side',
  '/demo': 'the free demo page, where a visitor enters their website address to start the live demo',
  '/demo/br': 'the free demo page',
  '/demo-site': 'the live demo page',
  '/book': 'the booking page, where a visitor picks a time for the free setup call',
  '/checkout': 'the checkout page',
  '/checkout/return': 'the checkout confirmation page',
  '/agents/realtors': 'the realtors page — the page about what AI Hidden Leads does for real estate agents',
  '/setup': 'the setup wizard, where a customer configures their assistant with Alex',
  '/account': 'their account page',
  '/help': 'the help page',
  '/marketing': 'the marketing page',
  '/privacy': 'the privacy policy page',
  '/terms': 'the terms page',
};

const SECTION_LABELS: Record<string, string> = {
  'services': 'the services section',
  'pricing': 'the pricing section',
  'map-visibility': 'the Google Maps and AI search visibility section',
  'demo-form': 'the free demo form section',
  'how-it-works': 'the how-it-works section',
  'faq': 'the frequently asked questions section',
  'addons': 'the add-ons section',
};

/** Spoken-friendly name for a page context's page. */
export function pageLabel(ctx: PageContext): string {
  if (ctx.path.startsWith('/services/')) return 'one of our service pages';
  return PAGE_LABELS[ctx.path] || 'one of our website pages';
}

/** Spoken-friendly name for a page context's section, if any. */
export function sectionLabel(ctx: PageContext): string | null {
  return ctx.section ? (SECTION_LABELS[ctx.section] || null) : null;
}

function sanitizeTitle(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const clean = value.replace(/[\u0000-\u001f\u007f"\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  return clean || undefined;
}

/**
 * Validate and normalize a client-supplied page payload. Returns
 * null for anything unrecognized — an unrecognized page is simply
 * not reported, never guessed at. Accepts the shapes the client
 * sends (mint `page` field, `page_context` socket message) and the
 * config stamp gemini-session stored.
 */
export function sanitizePageContext(input: unknown): PageContext | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  let path = typeof raw.path === 'string' ? raw.path.trim() : '';
  // A client may hand us a path with a query/hash still attached —
  // the route is the pathname only.
  path = path.split(/[?#]/)[0];
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  if (!isPublicPagePath(path)) return null;
  const out: PageContext = { path };
  if (typeof raw.section === 'string' && (PAGE_SECTIONS as readonly string[]).includes(raw.section)) out.section = raw.section;
  const title = sanitizeTitle(raw.title);
  if (title) out.title = title;
  return out;
}

export function samePageContext(a: PageContext | null | undefined, b: PageContext | null | undefined): boolean {
  if (!a || !b) return a === b || (!a && !b);
  return a.path === b.path && (a.section || '') === (b.section || '') && (a.title || '') === (b.title || '');
}

/** The setup-time instruction block (sales sessions only). */
export const PAGE_AWARENESS_INSTRUCTION = `PAGE AWARENESS: you can see which page of our website the visitor is on. A line below names the page they are viewing right now, and during the conversation you may receive bracketed context updates about page changes — those updates are system notes, NOT something the visitor said: never quote them, never mention receiving them, and never let one interrupt an answer you are in the middle of. When an update arrives, the newest one is where the visitor is now. Use the page naturally: answer from what is on that page (the plans page's own lines are in your reference data, word for word), and when the visitor asks what they are looking at, or asks about something on their screen, answer for the page the latest update names. If an update says the visitor opened a page in a NEW browser tab from your panel, they are still here talking with you in this tab — acknowledge it briefly (the page is open in their new tab, and you are right here to walk through it with them) and keep helping here; never speak as if they left the conversation. Never claim to see anything about their screen beyond the page updates you are given — not their other tabs, not what they type, not where they click.`;

/** The setup-time line naming the page the session starts on. */
export function pageContextLine(ctx: PageContext): string {
  const section = sectionLabel(ctx);
  return `The visitor is currently viewing ${pageLabel(ctx)} (${ctx.path})${section ? ` — specifically ${section}` : ''}${ctx.title ? ` (the page's title is "${ctx.title}")` : ''}.`;
}

/** Proxy pacing for injected page notes: at most one per interval,
 * and a bounded number per session — the stored context still tracks
 * every change even when a note is not injected. */
export const PAGE_NOTE_MIN_INTERVAL_MS = 12000;
export const PAGE_NOTE_MAX_PER_SESSION = 12;

/**
 * The stage-direction text injected on a mid-session page change.
 * `via` is 'tab' when the visitor opened the page in a new tab from
 * the panel's sales actions (their session tab never moved), 'nav'
 * for a change of the page/section in the session's own tab.
 */
export function pageContextUpdateNote(next: PageContext, via: 'tab' | 'nav', previous: PageContext | null): string {
  const section = sectionLabel(next);
  if (via === 'tab') {
    return `(Context update — not something the visitor said: the visitor just opened ${pageLabel(next)} in a NEW browser tab from your panel. They are still here, talking with you in this tab. Acknowledge it in a few words — that page is open in their new tab now and you are right here to walk through it with them — then keep helping exactly as before. Do not treat this note as a question and do not change the subject away from what you were discussing.)`;
  }
  if (previous && previous.path === next.path && section) {
    return `(Context update — not something the visitor said: still on ${pageLabel(next)}, the visitor has scrolled to ${section}. You do not need to announce it or say anything about it — just know where they are looking, and use it when it helps an answer.)`;
  }
  return `(Context update — not something the visitor said: the visitor is now viewing ${pageLabel(next)} (${next.path})${section ? ` — specifically ${section}` : ''}. Let it inform your answers from here on; if it fits naturally, a brief acknowledgment is fine, but do not announce the change like a system message and do not abandon what you were discussing.)`;
}
