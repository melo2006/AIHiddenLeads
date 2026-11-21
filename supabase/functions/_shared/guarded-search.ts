/**
 * GUARDED WEB SEARCH (owner-approved 2026-11-21) — Gemini Live Google
 * Search grounding for the public browser voice sessions, with the
 * guardrails carried in the system prompt so the avatar can answer a
 * small outside-world aside like a person (one or two sentences,
 * friendly) and then come back to the point, instead of hitting a
 * knowledge wall — and so an aside never turns into a research errand
 * or a long off-topic conversation that burns the visitor's minutes.
 *
 * SCOPE — exactly the two public session families the proxy already
 * distinguishes (the same stamps gemini-session writes and the sales
 * gate keys on):
 *  - SALES: config.homepageSales === true && config.simulation !== true
 *    (homepage Aspen + the /demo sales flow; the team-intro cameo
 *    segments carry homepageSales:false by construction and stay out,
 *    exactly as the sales gate treats them).
 *  - SIMULATION: config.simulation === true (business-demo parents —
 *    the pinned example demos and a prospect's own /demo-site
 *    simulation — their persona segments, and presenter demos).
 * Everything else (tenant live agents, the Alex guide, drafts,
 * previews, shares) composes byte-identically to before: no grounding
 * tool, no policy text. Phone/telephony sessions never pass through
 * the browser proxy and are untouched.
 *
 * The grounding tool itself is the shape the clean-room test proved
 * live on 2026-11-20 (Round 4): a bare { googleSearch: {} } entry in
 * the Live setup's tools array, beside the functionDeclarations entry.
 * It is a provider built-in — no function call comes back for the
 * proxy to dispatch.
 */

export type GuardedSearchMode = 'sales' | 'simulation';

/** The session family a stored config belongs to, for guarded search. */
export function guardedSearchModeFor(config: Record<string, unknown>): GuardedSearchMode | null {
  if (config.simulation === true) return 'simulation';
  if (config.homepageSales === true) return 'sales';
  return null;
}

/**
 * SALES guardrails: the offer's own knowledge wins, an aside gets a
 * brief warm answer and a bridge straight back to the demo/offer, and
 * search never becomes an errand.
 */
export const GUARDED_SEARCH_SALES_POLICY = `WEB SEARCH — GUARDED: You can check the live web for a few outside-world facts during this conversation. Your own knowledge — about AI Hidden Leads, the plans and prices, and this prospect's business — ALWAYS wins: never let a search result change, correct or override it. Search only to fill gaps about the outside world: today's hours of a place, the weather, a sports score or schedule, a local event, or a public fact (public facts about a competitor included). When the visitor goes off on an aside, answer it briefly and warmly — one or two sentences — then bridge straight back to the demo and the offer. Never run research errands: no browsing tasks, no reading pages for the visitor, no homework-style comparisons — decline in one friendly line and return to the demo. If you cannot verify something, say so briefly and move on; never invent an answer. Keep it to a few searches in the whole conversation, and never let an aside stretch into a long off-topic chat — keep the conversation on the demo.`;

/**
 * SIMULATION guardrails: same discipline, in character. The business's
 * fed knowledge wins absolutely, the bridge goes back to the CALLER's
 * need — never to selling AI Hidden Leads (the explicit step-out sales
 * policy elsewhere in this prompt governs only when the visitor
 * themselves asks about the service; an aside is never a pitch opening).
 */
export const GUARDED_SEARCH_SIMULATION_POLICY = `WEB SEARCH — GUARDED: You can check the live web for a few outside-world facts while you help the caller. The business's own information — the website and documents you were given — ALWAYS wins: never let a search result change, correct or override the business's hours, services, prices or policies; if a search result disagrees with what you were given, use what you were given and do not mention the difference. Search only for outside-world small talk and public facts: the weather, a sports score or schedule, a local event, a public fact. Answer an aside briefly and warmly — one or two sentences — then come back to the caller's need: their question about the business, their appointment, what they called for. You are this business's receptionist: never use an aside to talk about or sell AI Hidden Leads, and never step out of character for small talk. No research errands: no browsing tasks, no reading pages for the caller, no homework-style comparisons — decline in one friendly line and return to their need. If you cannot verify something, say so briefly and move on; never invent an answer. Keep it to a few searches in the whole conversation.`;

/** The guardrail block for this session's prompt, or '' when guarded search does not apply. */
export function guardedSearchPolicyFor(config: Record<string, unknown>): string {
  const mode = guardedSearchModeFor(config);
  if (mode === 'sales') return GUARDED_SEARCH_SALES_POLICY;
  if (mode === 'simulation') return GUARDED_SEARCH_SIMULATION_POLICY;
  return '';
}

/**
 * The extra Live setup tools entries for this session: the grounding
 * entry when a mode applies, else an empty array — so an ungrounded
 * session's setup tools stay exactly the single functionDeclarations
 * entry they have always been.
 */
export function guardedSearchToolEntriesFor(config: Record<string, unknown>): Array<{ googleSearch: Record<string, never> }> {
  return guardedSearchModeFor(config) ? [{ googleSearch: {} }] : [];
}
