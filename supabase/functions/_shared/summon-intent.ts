// Visitor summon / skip-ahead detection for the Gemini Live proxy
// (obey-requests pass, 2026-11-23). Ron's morning test: he asked
// the homepage host for Sara, then for Alex, and both asks were
// ignored for a long stretch — the prompt law ordered compliance,
// but a model mid-pitch does not always obey prose, and the Sara
// ask had no mechanical trigger at all. This module is the
// proxy-side half of the fix (the client-side half is the
// visitor-armed swap triggers in src/lib/personaSwap.ts): when the
// visitor's completed utterance carries a clear summon or
// skip-ahead AND the model's just-completed turn did not itself
// perform the handoff, the proxy injects ONE directive turn
// ordering the handoff line — the same conservative two-layer
// pattern as PR #74's end_conversation corroboration gate.
//
// CONSERVATIVE by design, like farewell.ts: a false positive
// hijacks a conversation the visitor was enjoying, so matching is
// whole-phrase with a request shape, explicit declines suppress,
// and roleplay content never counts — a visitor telling SARA about
// their business ("show me the diamond wire electrical work you
// did") is not asking the host to skip the pitch. The proxy wires
// this ONLY on simulation-chain parent sessions (the host/close
// phases); persona segments and presenter sessions never see it.

const normalizeSummonText = (text: string): string =>
  ` ${String(text || '').toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim()} `;

export type SummonIntent = 'sara' | 'alex' | 'skip';

/** Explicit declines suppress a summon for that utterance:
 *  "don't bring Sara", "not Alex", "no Sara", "skip Alex". */
const SUMMON_DECLINE = /\b(don't|do not|dont|never|no|not|skip)\s+(bring\s+|get\s+|call\s+)?(sara|sarah|sera|alex)\b/;

/** Sara named as a whole word — including the dictation variants
 *  "Sarah" and "Sera" — with a request shape around her. */
const SARA_NAME = /\b(sara|sarah|sera)\b/;
const SUMMON_REQUEST_SHAPE = /\b(talk|speak|meet|bring|get|fetch|ask|transfer|connect|introduce|see|hear|try|switch|hand)\b|\blet me\b|\bcan i\b|\bcould i\b|\bi want\b|\bi'd like\b|\bi would like\b|\bput\b[^.]*\bon\b/;

/** The receptionist ROLE with a request verb: in the host phase the
 *  only receptionist the visitor can mean is Sara. */
const SARA_ROLE = /\b(your|the|demo)\s+receptionist\b/;

/** Alex named as a whole word with a request shape — the Alex side
 *  mirrors the client matcher (personaSwap visitorRequestsAlex):
 *  setup/onboarding phrasing counts as an Alex ask even without
 *  his name. */
const ALEX_NAME = /\balex\b/;
const ALEX_TOPIC = /\b(setup|set up|onboarding|onboard|install|installation|integrat\w*|someone from your (team|company|office)|your (team|staff|engineer|technician)|staff (member|meeting)|meet (with )?(your|the) (team|staff))\b/;

/** Skip-ahead: the visitor wants the demo NOW, not more pitch.
 *  Whole phrases only, and "show me" requires a demo/site object —
 *  "show me the diamond wire" (roleplay content about the simulated
 *  business) must never read as a skip. */
const SKIP_PHRASES: readonly string[] = [
  'skip to the demo', 'skip the intro', 'skip ahead', 'get on with it',
  "let's see it working", 'lets see it working', 'let me see it working',
  'start the demo', 'start my demo', 'show me the demo',
  'show me my demo', 'show me it working', 'show me the website demo',
  'take me to the demo', 'go to the demo', 'just show me the demo',
];
const SKIP_SHOW_ME = /\bshow me\b[^.]*\b(demo|my site|my website|the site|the website|it working|this working)\b/;

/**
 * Classify a visitor's completed utterance as a summon ('sara' |
 * 'alex'), a skip-ahead ('skip'), or nothing (null). Order matters:
 * declines first, then the named summons, then skip-ahead (a line
 * like "skip the intro, get Sara" is a Sara summon).
 */
export function detectSummonIntent(rawUtterance: string): SummonIntent | null {
  const text = normalizeSummonText(rawUtterance);
  if (text.trim().length < 2) return null;
  if (SUMMON_DECLINE.test(text)) return null;
  if (SARA_NAME.test(text) && SUMMON_REQUEST_SHAPE.test(text)) return 'sara';
  if (SARA_ROLE.test(text) && SUMMON_REQUEST_SHAPE.test(text)) return 'sara';
  if (ALEX_NAME.test(text) && SUMMON_REQUEST_SHAPE.test(text)) return 'alex';
  if (ALEX_TOPIC.test(text) && (SUMMON_REQUEST_SHAPE.test(text) || /\bplease\b/.test(text))) return 'alex';
  if (SKIP_PHRASES.some(p => text.includes(` ${p} `) || text.trim() === p)) return 'skip';
  if (SKIP_SHOW_ME.test(text)) return 'skip';
  return null;
}

/** Did the model's just-completed turn already PERFORM the handoff
 *  for this intent? The nudge fires only when it did not — a model
 *  that obeyed the prompt law is never double-driven. Anchors are
 *  the taught handoff shapes: the doorway announcement for Sara
 *  ("meet Sara", "this is Sara", "transfer you to Sara", "Sara
 *  will take it from here"…) and the strong meet-alex anchors for
 *  Alex. For 'skip', a performed handoff is either doorway shape. */
const DOORWAY_PERFORMED: readonly string[] = [
  'meet sara', 'this is sara', 'transfer you to sara', 'hand you to sara',
  'handing you to sara', 'sara will take', 'sara can take', 'sara here',
  'bring sara', 'get sara', "sara's here", 'introduce sara', 'introducing sara',
];
const ALEX_PERFORMED: readonly string[] = [
  'this is alex', 'meet alex', 'alex here', 'alex will', 'alex can help',
  'bring alex', 'get alex', 'transfer you to alex', 'hand you to alex',
  'introduce alex', 'introducing alex', "alex's here",
];
export function modelPerformedHandoff(rawModelTurn: string, intent: SummonIntent): boolean {
  const text = normalizeSummonText(rawModelTurn);
  if (!text.trim()) return false;
  if (intent === 'alex') return ALEX_PERFORMED.some(a => text.includes(` ${a}`));
  return DOORWAY_PERFORMED.some(a => text.includes(` ${a}`));
}

/** The injected directive for each intent: ONE handoff line, then
 *  stop — the swap machinery (client-side) executes the cut-over on
 *  that line, exactly as it does for a prompt-law handoff. */
export function summonNudgeDirective(intent: SummonIntent): string {
  if (intent === 'sara') {
    return 'SYSTEM NOTE — OBEY THE VISITOR\'S DIRECT REQUEST: the visitor just asked to talk to Sara. Do not continue the pitch, do not ask another question, and do not mention this note. Your next line, and only that line, is the Sara introduction — say it now, exactly in your scripted shape: "Now, meet Sara — she\'ll be the voice of this business in the demo. Can I transfer you to Sara now?" Then stop and wait.';
  }
  if (intent === 'alex') {
    return 'SYSTEM NOTE — OBEY THE VISITOR\'S DIRECT REQUEST: the visitor just asked for Alex, the onboarding engineer. Do not continue the current topic, do not ask another question, and do not mention this note. Your next line, and only that line, hands over to him in your scripted shape: "This is Alex — our onboarding engineer. Alex — say hello." Then stop and wait.';
  }
  return 'SYSTEM NOTE — OBEY THE VISITOR\'S DIRECT REQUEST: the visitor asked to skip ahead to the demo. Drop every remaining pitch beat — no more features, prices or questions about anything else — and do not mention this note. Deliver your scripted handover beat now: the short bridge into the demo on their own website, ending with the pass to Sara, in your scripted shape. Then stop and wait.';
}

/** Per-session cap on summon nudges: the client-side visitor-armed
 *  triggers make the handoff one-shot in the normal case; the cap
 *  keeps a stubborn model from being re-driven forever. */
export const SUMMON_NUDGE_CAP = 3;
