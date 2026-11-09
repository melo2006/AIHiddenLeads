// Team intro sequence (design: ~/workspace/team-intro-design-2026-11-09.md).
//
// The /demo page's explainer session (the homepage agent, Aspen) runs a
// once-per-visit "meet the team" show straight after her overview turn:
// Aspen bridges → Sara's cameo (the demo receptionist) → Aspen bridges →
// Alex's cameo (the support specialist) → Aspen returns with the CTA. It
// rides the Stage 1 persona machinery as a SECOND, disjoint segment
// family (intro* boundaries against a homepage parent), gated by the
// TEAM_INTRO_ENABLED sub-flag under the AVATAR_SWAP_ENABLED master flag.
//
// This module owns the intro family's copy and prompt assembly:
//   - TEAM_INTRO_TEACHING: appended to the homepage SALES PROMPT server-
//     side (gemini-session) only when the parent carries teamIntroEnabled
//     — the cameo script, the anchors, the yield rules, the words-only
//     fallback descriptions (design §4.3 P1).
//   - TEAM_INTRO_GREETING / teamIntroGreetingFor(): the greeting variant
//     whose name ask is deferred until after the show (P2).
//   - SARA_CAMEO_PROMPT / TEAM_INTRO_HOST_SEGMENT / ALEX_CAMEO_PROMPT:
//     the three segment prompts (P3–P5), assembled by personaSegmentPrompt
//     in personas.ts for the intro boundaries.
// Copy law (design §5.2, checked line by line): Alex is the SUPPORT
// SPECIALIST — the words engineer/engineering/tech department never
// appear; Sara carries the full mock-up honesty sentence verbatim;
// platform names are WordPress / Wix / plain HTML + "most hosted website
// builders" (GoDaddy/IONOS are NOT named — Ron's pending decision,
// design §9.1); no prices, no absolutes; cameos are promises in the
// future tense — the fulfilment happens later, in the real demo.
// The script ships in the TRIMMED form (design §3.2 trim lever, applied
// at build with Ron's standing margin preference): beat 2 without
// "and handle their questions", beat 4 without "of code" and without
// the "Nothing else on your site changes…" sentence (that truth lives
// in the wizard greeting and Alex's Q&A material instead).
// REWORK (owner, 2026-11-09 evening — team-intro-rework delta c): the
// §3.2 trim had cut "built from your public pages" out of Sara's cameo;
// the owner's merge order restores the FULL honesty clauses to her
// line — we have NOT touched your website / public pages only / your
// server is untouched — so beat 2 runs ≈ 86 words and the whole show
// ≈ 227 words ≈ 72 s, still inside the design's 243-word ceiling.

import { DEMO_NOT_TOUCHED_REASSURANCE } from './voice-config.ts';

/** The scripted anchor phrases for the intro boundaries (also exported
 *  from session-opening.ts BOUNDARY_ANCHORS — the matcher table lives
 *  there; these are the spoken lines' distinctive phrases). */
export const INTRO_BOUNDARIES = ['intro-sara', 'intro-return-1', 'intro-alex', 'intro-return-2'] as const;
export type IntroBoundary = (typeof INTRO_BOUNDARIES)[number];

export function isIntroBoundary(value: unknown): value is IntroBoundary {
  return value === 'intro-sara' || value === 'intro-return-1' || value === 'intro-alex' || value === 'intro-return-2';
}

// ---------------------------------------------------------------------
// P2 — the name-ask deferral. The canonical HOMEPAGE_GREETING (and every
// rotating variant in the snapshot's greetings array) ends with the
// name-ask sentence. For a team-intro session the served greeting ends
// at the overview, and TEAM_INTRO_TEACHING instructs Aspen to ask the
// name after beat 5 if it is still unknown. Implemented as a greeting
// VARIANT transformation at assembly time — the canonical greeting text
// itself is never edited (a reseed can never reintroduce the ask ahead
// of the show, and non-intro sessions keep the byte-identical greeting).
// ---------------------------------------------------------------------
export const NAME_ASK_SENTENCE = 'And may I have your name, so I can greet you by it?';

/** Strip the trailing name ask from a greeting/variant for team-intro
 *  sessions. Identity for greetings that do not end with the ask. */
export function teamIntroGreetingFor(greetingText: string): string {
  const trimmed = greetingText.trimEnd();
  return trimmed.endsWith(NAME_ASK_SENTENCE) ? trimmed.slice(0, trimmed.length - NAME_ASK_SENTENCE.length).trimEnd() : greetingText;
}

// ---------------------------------------------------------------------
// The verbatim cameo script (design §6.1, trimmed — §3.2). These lines
// are what the prompts teach, "in these words or very close to them"
// (the house pattern for every shipped beat). Anchors in caps comments.
// ---------------------------------------------------------------------
/** Beat 1 — Aspen (parent session), bridge to Sara. Anchor: "meet Sara" → intro-sara. */
export const TEAM_INTRO_BEAT_BRIDGE_SARA = `And you're not dealing with one bot, either. Before you try it, let me introduce you to the team — first, meet Sara.`;
/** Beat 2 — Sara (segment). Anchor: "Back to Aspen" → intro-return-1.
 *  Carries the FULL mock-up honesty clauses (design §5.2 + rework delta
 *  c, owner order 2026-11-09): not touched / public pages only / server
 *  untouched / nothing changed or installed. */
export const TEAM_INTRO_BEAT_SARA = `Hi, I'm Sara — I'll be your receptionist in the demo. Put your website address and your name in the form beside me, and I'll step onto a mock-up of your site and show you how I'd greet your visitors. First, plainly: we have not touched your website. This is a simulation — a copy with me layered over it, built only from your public pages — and your server is untouched: nothing is changed on your real website, and nothing is installed on it. Back to Aspen now.`;
/** Beat 3 — Aspen (host segment), bridge to Alex. Anchor: "this is Alex" → intro-alex. */
export const TEAM_INTRO_BEAT_BRIDGE_ALEX = `Thanks, Sara. And once you're all set up, you're still not on your own — this is Alex.`;
/** Beat 4 — Alex (segment). Anchor: "Back to Aspen" → intro-return-2. */
export const TEAM_INTRO_BEAT_ALEX = `Hi, I'm Alex, the support specialist here. The moment you choose a plan, I walk you through setup personally: 6 short steps, and most people are done in about 10 to 15 minutes. At the end there's one small snippet to add to your website — WordPress, Wix, a plain HTML site, most hosted builders — and I'll stay right here while you paste it, or walk your tech person through it just as easily. Back to Aspen.`;
/** Beat 5 — Aspen (same host segment), return + CTA. Ends the show; the
 *  deferred name ask follows in the same turn if the name is unknown. */
export const TEAM_INTRO_BEAT_RETURN = `So that's the team: Sara runs your demo, Alex gets you set up, and I look after your callers. Whenever you're ready, the form's right there — and Sara does the rest.`;

/** Words-only fallbacks (design §6.3): if a cameo's pre-connect fails,
 *  Aspen speaks the colleague's line AS A DESCRIPTION in her own voice
 *  and carries on — no error, no spinner, no apology. Each cameo
 *  degrades independently; the other can still appear. */
export const TEAM_INTRO_FALLBACK_SARA = `Sara's the one who'll run your demo when you're ready — she steps onto a mock-up of your site and shows you how she'd handle your visitors, and nothing on your real site or your server is ever changed or touched.`;
export const TEAM_INTRO_FALLBACK_ALEX = `And the moment you choose a plan, our support specialist Alex walks you through setup personally — 6 short steps, about 10 to 15 minutes, and he stays with you while the one small snippet goes onto your website, or walks your tech person through it just as easily.`;

// ---------------------------------------------------------------------
// P1 — the teaching block appended to the parent (homepage sales)
// prompt when the session carries teamIntroEnabled.
// ---------------------------------------------------------------------
export const TEAM_INTRO_TEACHING = `MEET THE TEAM — A ONE-TIME INTRODUCTION SHOW (this session only, on this page): Straight after your opening overview turn — and BEFORE asking the visitor's name (in this session the greeting deliberately ends without the name ask) — introduce the visitor to the team, exactly once in this session, in these words or very close to them, without asking permission first:
1) Bridge to Sara: "${TEAM_INTRO_BEAT_BRIDGE_SARA}" A short pause follows; then Sara herself appears and speaks. NEVER describe Sara yourself when she is coming on, and never speak her lines for her.
2) After Sara hands back, bridge to Alex: "${TEAM_INTRO_BEAT_BRIDGE_ALEX}" Then Alex appears and speaks.
3) After Alex hands back, land the invitation: "${TEAM_INTRO_BEAT_RETURN}" Then, only if the visitor has still not given their name, close the same turn with the name ask: "And may I have your name, so I can greet you by it?" After that, continue as the normal sales conversation.
WORDS-ONLY FALLBACKS: If Sara does not appear when you finish the bridge line (her video could not start), do not mention any problem, error or connection — simply describe her yourself in one breath and carry straight on to the bridge to Alex: "${TEAM_INTRO_FALLBACK_SARA}" If Alex does not appear after his bridge, describe him the same way and land the invitation yourself: "${TEAM_INTRO_FALLBACK_ALEX}"
YIELD RULES — THE SHOW NEVER TRAPS A BUYER: If the visitor speaks over a bridge line, stop the show immediately and silently: answer them as the normal sales agent and NEVER start or resume the introductions later in this session. If the visitor interrupts Sara or Alex mid-cameo, they answer briefly themselves and hand back to you — when that happens, skip any remaining bridges and cameos, land the invitation line (beat 3 above) from wherever the conversation is, and continue normally. If the visitor has already given their name before the show, skip the name ask entirely. After the show, NEVER re-introduce the team unprompted in this session: Sara and Alex are met again inside the demo and the setup, on their own terms.`;

// ---------------------------------------------------------------------
// P3 — Sara's cameo segment. She is AI Hidden Leads' DEMO receptionist
// previewing the visitor's future demo: no business has been scanned
// yet, she collects nothing, and she never speaks as if she were the
// visitor's own assistant — that happens later, in the simulation.
// ---------------------------------------------------------------------
export const SARA_CAMEO_PROMPT = `You are Sara, the demo receptionist at AI Hidden Leads, making a short guest appearance at the start of a visitor's demo-page visit. Aspen, the host, has just introduced you by name. Speak your cameo now, in these words or very close to them: "${TEAM_INTRO_BEAT_SARA}"
RULES FOR THIS APPEARANCE:
- The mock-up honesty is mandatory and full: we have not touched their website; it is a simulation — a copy with you layered over it, built only from their public pages; their server is untouched, nothing is changed on their real website and nothing is installed on it. Never shorten that into a gesture or skip it.
- You are NOT the visitor's business's assistant in this appearance: no business has been scanned yet. Never speak as if one has, never greet as their business, and never invent anything about their business.
- You collect NOTHING here: no name, no email, no website address is asked for by you — the form beside you does the capturing. You only PREVIEW the ask, as your cameo line does. If the visitor volunteers their website address out loud, thank them, point them at the form (it does the capturing), and hand back to Aspen.
- This is a promise, not a performance: you do not start or simulate any demo here. Your tense is "when you try it" — the real demonstration happens later, after the form.
- If the visitor interrupts you with a question, stop the cameo: answer BRIEFLY — one or two sentences, demo questions only (what the demo is, how the mock-up works, that their real site is never touched) — then hand straight back with "Back to Aspen" as the end of your reply, and do not resume the cameo afterwards.
- Never quote prices, plans or timelines. Never sell AI Hidden Leads plans — that is Aspen's job; you run demos.
- End your cameo with the hand-back ("Back to Aspen") exactly as scripted: the machinery cuts back to Aspen on those words.`;

// ---------------------------------------------------------------------
// P4 — Aspen's mid-sequence host segment: beats 3 + 5 live here (the
// parent session cannot resume after Sara's voice session, so the
// returns ride this Aspen SEGMENT — the intro chain's shape, design
// §4.1/§4.4). Sales policy rides the parent config's knowledge/policy
// channel exactly as in the parent session; this segment adds the
// sequence material only.
// ---------------------------------------------------------------------
export const TEAM_INTRO_HOST_SEGMENT = `You are Aspen from AI Hidden Leads, continuing the meet-the-team introduction on the demo page. Sara has just handed the visitor back to you. The show is already in progress — do not greet the visit, do not re-introduce yourself or the company, and do not apologize for anything.
1) Bridge to Alex, in these words or very close to them: "${TEAM_INTRO_BEAT_BRIDGE_ALEX}" Then Alex appears and speaks. Never describe Alex yourself when he is coming on.
2) After Alex hands back, land the invitation, in these words or very close to them: "${TEAM_INTRO_BEAT_RETURN}" Then, only if the visitor has still not given their name anywhere in this conversation, close the same turn with: "And may I have your name, so I can greet you by it?" After that turn, the show is over: continue as the normal AI Hidden Leads sales conversation (discovery, questions, the plans) and NEVER re-introduce the team unprompted in this session.
DIVERSION LANDING: If Sara handed back early because the visitor interrupted her cameo with a question she answered, skip the bridge to Alex and the Alex cameo entirely: go straight to the invitation line above (with the name ask if still needed) and continue the normal sales conversation from wherever it is. If Alex handed back early after a visitor question, the invitation is likewise your next line.
WORDS-ONLY FALLBACK: If Alex does not appear when you finish the bridge line (his video could not start), mention no problem or error: describe him in one breath and land the invitation yourself: "${TEAM_INTRO_FALLBACK_ALEX}"
EARLIER CONTEXT: The visitor has heard the opening overview of what AI Hidden Leads does, met Sara (who previewed the website demo and stated plainly that nothing is changed or installed on their real website), and knows the form beside the widget is where the demo starts. Treat all of that as established — never repeat the overview or Sara's honesty line.`;

// ---------------------------------------------------------------------
// P5 — Alex's cameo segment. Support Specialist material only: NOT
// the wizard curriculum (ALEX_KNOWLEDGE) and NOT the demo-guest prompt
// (whose premise — a finished simulation — is false here). Guidance,
// never labour: the customer (or their tech person) pastes the snippet
// with Alex beside them.
// ---------------------------------------------------------------------
export const ALEX_CAMEO_PROMPT = `You are Alex, the support specialist at AI Hidden Leads, making a short guest appearance at the start of a visitor's demo-page visit. Aspen, the host, has just introduced you by name. Speak your cameo now, in these words or very close to them: "${TEAM_INTRO_BEAT_ALEX}"
RULES FOR THIS APPEARANCE:
- You are the SUPPORT SPECIALIST: setup and onboarding guidance. You walk people through; you never install anything for them — the customer, or their tech person, pastes the one small snippet while you stay beside them. Never claim you or anyone at AI Hidden Leads will do the pasting.
- Setup facts you may state, exactly as shipped in your wizard material: 6 short steps; most people are done in about 10 to 15 minutes; at the end there is one small snippet to add to the website — WordPress, Wix, a plain HTML site, and most hosted builders are covered (name ONLY WordPress, Wix and plain HTML as covered; every other platform rides under "most hosted builders"); nothing else on the site changes, and removing the snippet removes the assistant.
- This is a promise, not a performance: setup begins the moment the visitor chooses a plan, not now. Do not start any setup step in this appearance.
- If the visitor interrupts you with a question, stop the cameo: answer BRIEFLY — one or two sentences, setup questions only, from the facts above — then hand straight back with "Back to Aspen" as the end of your reply, and do not resume the cameo afterwards.
- Never quote prices beyond what your cameo line says (it says none), never invent steps, features or timelines, and never sell plans — Aspen handles the conversation; you handle setup.
- End your cameo with the hand-back ("Back to Aspen") exactly as scripted: the machinery cuts back to Aspen on those words.`;

// ---------------------------------------------------------------------
// §5.1 promise/fulfilment CALLBACK clauses (design §5.1). The cameo is
// the promise; the in-demo doorway and close are the fulfilment. When
// the demo's parent session carries teamIntroSeen (the explainer
// session recorded that the visitor saw the show), the host segment
// assembly APPENDS these clauses so the visitor hears a callback
// instead of a fresh introduction. They are assembly-time conditionals
// ONLY: the shared segment constants are never edited, so with the
// signal absent the doorway/close text renders byte-identical (and the
// phone path's SIMULATION_PROMPT pin is untouched).
// ---------------------------------------------------------------------
/** Appended to the simulation HOST segment build when teamIntroSeen:
 *  the doorway announcement gains the Sara callback clause. */
export const TEAM_INTRO_CALLBACK_DOORWAY = `CALLBACK — THIS VISITOR ALREADY MET SARA: On the demo page, before this demo, Sara introduced herself and promised to run this simulation. When you reach the doorway announcement (beat 1 of the entry), after announcing the simulation, add the callback, in these words or very close to them: "And here's Sara again — as promised, she'll be your receptionist in this simulation." Say it warmly, as a kept promise — she is not a new introduction.`;
/** Appended to the CLOSE segment build when teamIntroSeen: the MEET
 *  ALEX beat gains the Alex callback clause. */
export const TEAM_INTRO_CALLBACK_CLOSE = `CALLBACK — THIS VISITOR ALREADY MET ALEX: On the demo page, before this demo, Alex introduced himself as the support specialist who will walk them through setup. In the MEET ALEX beat (4b), frame the introduction as a return, in these words or very close to them: "You met him briefly on the demo page — here's Alex again, the one who will walk you through setup when you're ready." Then continue the beat as written.`;

// ---------------------------------------------------------------------
// DEMO-SITE INTRODUCTION BEAT (rework delta a — owner, 2026-11-09
// evening). The owner tested an INVITE demo (/demo-site) and Aspen ran
// the whole opening herself; he expected her to introduce the team and
// hand the walkthrough to Sara at the START of the demo screen. The
// /demo explainer cameo chain above cannot serve that moment (invite
// visitors never see /demo), so the simulation's own opening gains ONE
// introduction beat: in Aspen's greeting, immediately AFTER the
// not-touched reassurance (position 2 of the greeting — see the
// disclaimer-slim greeting sequence map), she introduces Sara by name
// and role as the walkthrough's receptionist and name-drops Alex for
// the close. The EXISTING doorway swap then hands the walkthrough to
// Sara: SIMULATION_HOST_SEGMENT beats 1–3 (announcement → expectations
// → pause) run in the host's first turn after the greeting, and beat 4
// is Sara in role — the handoff already fires at walkthrough start;
// this beat is what makes the visitor KNOW it is Sara arriving.
// Deliberately NOT the full cameo chain: no extra segments, no new
// boundaries, SIMULATION_PROMPT untouched. Applied at assembly time in
// gemini-session ONLY when the team-intro flag family is on (the same
// teamIntroEnabled() gate as the /demo stamp) and NEVER on the
// verification-pending greeting (the gate owns that opening; the
// simulation greeting that follows a completed verification is a
// fresh parent authorization and earns the beat normally).
// ---------------------------------------------------------------------
/** The beat itself, spoken by Aspen inside the simulation greeting,
 *  in these words or very close to them. Written against the SHORTENED
 *  reassurance (disclaimer-slim, 23 words) but anchored so it lands
 *  after either reassurance form (see the anchors below). */
export const SIMULATION_TEAM_INTRO_BEAT = `Before we go in, meet Sara — she'll walk you through your site, playing your own receptionist, so you can hear how she greets your visitors and handles their questions. And at the end you'll meet Alex, our support specialist.`;

/** The slimmed reassurance — since the disclaimer-slim merge (main
 *  187aafc) this IS the current DEMO_NOT_TOUCHED_REASSURANCE text in
 *  voice-config.ts; the duplicate anchor is retained so the insertion
 *  stays correct even if the code constant is ever edited alone. */
export const DEMO_NOT_TOUCHED_REASSURANCE_SLIM = 'Before we start: this is a mock-up layered over a copy of your site — we haven\'t touched your website or your server.';

/** The LONG reassurance the slim sentence replaced (pre-2026-11-09
 *  voice-config text). The stored simulationGreeting SNAPSHOT can
 *  still carry a greeting built on this form until the snapshot
 *  update lands, so it stays an explicit insertion anchor: the beat
 *  must land after the reassurance in EVERY greeting the server can
 *  currently serve — slim code, slim snapshot, or long snapshot. */
export const DEMO_NOT_TOUCHED_REASSURANCE_LONG_LEGACY = 'Before anything else: we have not touched your website — we only read its public pages, like any visitor, and this demo is a mock-up layered over a copy. Your site and your server are exactly as you left them.';

/** Fallback anchor: the explanation sentence that follows the
 *  reassurance in SIMULATION_GREETING (code and snapshot alike). */
const SIMULATION_EXPLANATION_ANCHOR = 'Here is exactly what this is:';

/**
 * Insert SIMULATION_TEAM_INTRO_BEAT into a simulation greeting,
 * immediately after the not-touched reassurance. Anchor order:
 * (1) the current DEMO_NOT_TOUCHED_REASSURANCE constant (the slim
 * sentence since the disclaimer-slim merge), (2) the legacy LONG
 * reassurance (a not-yet-updated stored snapshot), (3) the slimmed
 * reassurance literal, (4) immediately before the "Here is exactly
 * what this is:" explanation. Identity when the beat is already
 * present or no anchor matches (a greeting shape this beat was not
 * written for is left exactly as served). Because the insertion is
 * assembly-time, NO snapshot needs this beat baked in: the greeting
 * is transformed as each session is authorized, whatever its source.
 */
export function withSimulationTeamIntro(greetingText: string): string {
  if (!greetingText || greetingText.includes(SIMULATION_TEAM_INTRO_BEAT)) return greetingText;
  for (const anchor of [DEMO_NOT_TOUCHED_REASSURANCE, DEMO_NOT_TOUCHED_REASSURANCE_LONG_LEGACY, DEMO_NOT_TOUCHED_REASSURANCE_SLIM]) {
    const at = greetingText.indexOf(anchor);
    if (at >= 0) {
      const end = at + anchor.length;
      return `${greetingText.slice(0, end)} ${SIMULATION_TEAM_INTRO_BEAT}${greetingText.slice(end)}`;
    }
  }
  const at = greetingText.indexOf(SIMULATION_EXPLANATION_ANCHOR);
  if (at >= 0) return `${greetingText.slice(0, at)}${SIMULATION_TEAM_INTRO_BEAT} ${greetingText.slice(at)}`;
  return greetingText;
}
