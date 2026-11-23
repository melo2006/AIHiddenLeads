// New-flow choreography tests (2026-11-23 — Ron's approved flow from
// his morning phone test, follow-on to PR #76):
//   Aspen opens + a couple of questions → offers "see a demo on YOUR
//   website, live, in two minutes?" → introduces Sara WHILE still
//   talking (Sara pre-staged) → Sara greets BY NAME, collects name +
//   website URL only (email OPTIONAL, "so I can send you the
//   recording"), phone-only simulation when no website → Sara runs
//   the demo start → Alex close states setup at 20–30 minutes and
//   asks for their tech/website person; Aspen stays gone after Alex
//   (PR #76's rule, untouched here).
//
// Coverage:
//  - the demoOfferEnabled flag (master flag + own env, like team intro)
//  - the offer teaching (timing, one offer, the scripted introduction
//    as the turn's last line, supersession of DEMO BRIDGE step 1)
//  - Sara's intake pack (greet by name, two hard needs, address
//    read-back, optional-email framing + never re-ask + NO phone ask,
//    the real demo start via the tool, the phone-only simulation,
//    performed hand-back only, no dead stops)
//  - personaSegmentPrompt offer builds (Sara standalone, Aspen rides
//    the parent prompt, wrong-persona refusal)
//  - demoStartApplies: Sara's intake session earns the tool via
//    demoIntake WITHOUT homepageSales; simulation/preview never do
//  - client matcher: noteOfferIntent / visitorAcceptsOffer positives,
//    declines, phase scoping, one-shot; boundaryForAssistantLine in
//    the offer phases (visitor-armed + scripted-anchor arming,
//    performed hand-back vs mention); phase tables; reconnect/stash
//    targets; chainIsMidSegment
//  - swap openings for both offer boundaries
//  - Alex reconciliation: 20 to 30 everywhere in the voice/demo
//    system, no '10 to 15' remnant in alex-guide / team-intro /
//    session-opening, the tech-person ask in the guest prompt
//  - wiring pins (gemini-session stamp + refusal + schema + echo,
//    proxy demoIntake pass-through, client arming + pre-stage folds)
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  DEMO_OFFER_HAND_BACK_LINE,
  DEMO_OFFER_HOST_SEGMENT,
  DEMO_OFFER_SARA_INTRO_LINE,
  DEMO_OFFER_TEACHING,
  SARA_INTAKE_PROMPT,
  isDemoOfferBoundary,
} from '../../supabase/functions/_shared/demo-offer';
import {
  avatarSwapEnabled,
  demoOfferEnabled,
  personaSegmentPrompt,
} from '../../supabase/functions/_shared/personas';
import { demoStartApplies } from '../../supabase/functions/_shared/demo-start';
import {
  ALEX_DEMO_GREETING,
  ALEX_DEMO_GUEST_PROMPT,
  ALEX_GREETING,
} from '../../supabase/functions/_shared/alex-guide';
import {
  TEAM_INTRO_BEAT_ALEX,
  TEAM_INTRO_FALLBACK_ALEX,
} from '../../supabase/functions/_shared/team-intro';
import { BOUNDARY_ANCHORS, swapOpeningInstruction } from '../../supabase/functions/_shared/session-opening';
import {
  BOUNDARY_TARGET,
  INITIAL_SWAP_STATE,
  PHASE_AFTER_BOUNDARY,
  PHASE_ENTRY,
  boundaryForAssistantLine,
  chainIsMidSegment,
  chainStashTarget,
  noteOfferIntent,
  reconnectTarget,
  visitorAcceptsOffer,
  type SwapState,
} from '@/lib/personaSwap';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
const envOf = (vars: Record<string, string>) => (name: string) => vars[name];
const offerState = (patch: Partial<SwapState> = {}): SwapState => ({ ...INITIAL_SWAP_STATE, phase: 'offer', ...patch });

describe('demo offer flag', () => {
  test('needs the master swap flag AND its own env', () => {
    expect(demoOfferEnabled(envOf({ AVATAR_SWAP_ENABLED: 'true', DEMO_OFFER_ENABLED: 'true' }))).toBe(true);
    expect(demoOfferEnabled(envOf({ AVATAR_SWAP_ENABLED: 'true' }))).toBe(false);
    expect(demoOfferEnabled(envOf({ DEMO_OFFER_ENABLED: 'true' }))).toBe(false);
    expect(demoOfferEnabled(envOf({}))).toBe(false);
    expect(avatarSwapEnabled(envOf({ AVATAR_SWAP_ENABLED: 'true' }))).toBe(true);
  });
  test('boundary classifier admits exactly the two offer boundaries', () => {
    expect(isDemoOfferBoundary('offer-sara')).toBe(true);
    expect(isDemoOfferBoundary('offer-return')).toBe(true);
    expect(isDemoOfferBoundary('doorway')).toBe(false);
    expect(isDemoOfferBoundary('intro-sara')).toBe(false);
    expect(isDemoOfferBoundary('nonsense')).toBe(false);
    expect(isDemoOfferBoundary(undefined)).toBe(false);
  });
});

describe('step 1 — the homepage offer beat (Aspen)', () => {
  test('teaching: Sara runs the start; Aspen never collects the URL or fires the tool', () => {
    expect(DEMO_OFFER_TEACHING).toContain('supersedes DEMO BRIDGE step 1');
    expect(DEMO_OFFER_TEACHING).toContain('You never collect the visitor\'s website address yourself');
    expect(DEMO_OFFER_TEACHING).toContain('you never call the request_demo_start tool yourself');
  });
  test('teaching: offer timing — after the opening + a couple of questions, or instantly on a direct ask', () => {
    expect(DEMO_OFFER_TEACHING).toContain('a couple of qualifying questions');
    expect(DEMO_OFFER_TEACHING).toContain('a direct ask skips the remaining qualifying questions');
    expect(DEMO_OFFER_TEACHING).toContain('Make the offer ONCE');
  });
  test('teaching: the offer turn offers the ~2-minute live demo, states the mock-up honesty, and ENDS on the Sara introduction', () => {
    expect(DEMO_OFFER_TEACHING).toContain('I can put a live demo on YOUR website, right now');
    expect(DEMO_OFFER_TEACHING).toContain('it takes about two minutes to build');
    expect(DEMO_OFFER_TEACHING).toContain('a mock-up layered over a copy of your site');
    expect(DEMO_OFFER_TEACHING).toContain(DEMO_OFFER_SARA_INTRO_LINE);
    expect(DEMO_OFFER_TEACHING).toContain('That introduction is the LAST thing you say in the turn');
    expect(DEMO_OFFER_TEACHING).toContain('her face has been warming while you talked');
  });
  test('the scripted introduction names Sara, her role, and the hand-over phrase the client anchors on', () => {
    expect(DEMO_OFFER_SARA_INTRO_LINE).toContain('meet Sara');
    expect(DEMO_OFFER_SARA_INTRO_LINE).toContain('demo receptionist');
    expect(DEMO_OFFER_SARA_INTRO_LINE).toContain('Sara will take it from here');
    expect(BOUNDARY_ANCHORS['offer-sara']).toContain('sara will take it from here');
  });
  test('teaching: after hand-back Aspen continues the bridge and runs the ONE end-ask — never re-offers', () => {
    expect(DEMO_OFFER_TEACHING).toContain('the step-back with its ONE end-ask');
    expect(DEMO_OFFER_TEACHING).toContain('Never re-run the offer, never re-introduce Sara');
  });
  test('teaching: a words-only fallback exists if Sara never takes over — no problem is ever mentioned', () => {
    expect(DEMO_OFFER_TEACHING).toContain('do not mention any problem, error or connection');
    expect(DEMO_OFFER_TEACHING).toContain('pick the demo start up yourself, the classic way');
  });
});

describe('step 2 — Sara\'s pre-staged intake', () => {
  test('greets BY NAME when the recap holds it; first turn ends on the start question', () => {
    expect(SARA_INTAKE_PROMPT).toContain('greet the visitor BY NAME');
    expect(SARA_INTAKE_PROMPT).toContain('"Shall we build your demo?"');
    expect(SARA_INTAKE_PROMPT).toContain('you arrive announced, never cold');
  });
  test('name + website address are the ONLY hard needs; the address is read back once for confirmation', () => {
    expect(SARA_INTAKE_PROMPT).toContain('NAME AND WEBSITE ADDRESS ARE THE ONLY HARD NEEDS');
    expect(SARA_INTAKE_PROMPT).toContain('Read the address back to them once');
    expect(SARA_INTAKE_PROMPT).toContain('"Did I get that right?"');
    expect(SARA_INTAKE_PROMPT).toContain('do NOT ask for it again: confirm it instead');
  });
  test('email is ONE optional ask framed as sending the recording — never a condition, never re-asked, no spell-out ritual', () => {
    expect(SARA_INTAKE_PROMPT).toContain('EMAIL — OPTIONAL, ONE ASK, EXACTLY THIS FRAME');
    expect(SARA_INTAKE_PROMPT).toContain('send you the recording of this demo afterwards — totally optional');
    expect(SARA_INTAKE_PROMPT).toContain('never a condition of the demo');
    expect(SARA_INTAKE_PROMPT).toContain('never ask again');
    expect(SARA_INTAKE_PROMPT).toContain('do not run a long spell-out ritual');
  });
  test('NO phone number is ever asked in the intake', () => {
    expect(SARA_INTAKE_PROMPT).toContain('NEVER ask for a phone number in this intake');
  });
  test('the demo starts through the real tool + on-screen confirmation; she narrates only the result', () => {
    expect(SARA_INTAKE_PROMPT).toContain('call the request_demo_start tool');
    expect(SARA_INTAKE_PROMPT).toContain('they check it and tap once');
    expect(SARA_INTAKE_PROMPT).toContain('Narrate ONLY what the tool result says');
  });
  test('no website → the phone-only simulation: announced step-in, in-role greeting, no invented facts', () => {
    expect(SARA_INTAKE_PROMPT).toContain('NO WEBSITE — THE PHONE-ONLY SIMULATION');
    expect(SARA_INTAKE_PROMPT).toContain('run it as a phone call instead');
    expect(SARA_INTAKE_PROMPT).toContain('stepping in as');
    expect(SARA_INTAKE_PROMPT).toContain('NEVER invent prices, stock, opening hours or policies');
  });
  test('hand-back is the performed short line on its own — a mention is not a hand-back; no dead stops', () => {
    expect(DEMO_OFFER_HAND_BACK_LINE).toBe('Back to Aspen now.');
    expect(SARA_INTAKE_PROMPT).toContain('always its own short closing line');
    expect(SARA_INTAKE_PROMPT).toContain('a mention of Aspen is not a hand-back');
    expect(SARA_INTAKE_PROMPT).toContain('DEAD STOPS ARE FAILURES');
    expect(SARA_INTAKE_PROMPT).toContain('every turn of yours ends on a question or an action');
  });
});

describe('segment builds (personaSegmentPrompt offer branch)', () => {
  test('offer-sara builds Sara\'s standalone intake pack, no greeting', () => {
    const built = personaSegmentPrompt('sara', 'offer-sara', '', 'PARENT PROMPT', undefined, false, undefined, undefined, { parentPrompt: 'PARENT PROMPT' });
    expect(built.systemPrompt).toBe(SARA_INTAKE_PROMPT);
    expect(built.greeting).toBe('');
  });
  test('offer-return builds Aspen riding the parent prompt + the landing block', () => {
    const built = personaSegmentPrompt('aspen', 'offer-return', '', 'PARENT PROMPT', undefined, false, undefined, undefined, { parentPrompt: 'PARENT PROMPT' });
    expect(built.systemPrompt).toBe(`PARENT PROMPT\n${DEMO_OFFER_HOST_SEGMENT}`);
    expect(built.greeting).toBe('');
  });
  test('wrong persona for an offer boundary is refused', () => {
    expect(() => personaSegmentPrompt('alex', 'offer-sara', '', 'P', undefined, false, undefined, undefined, { parentPrompt: 'P' })).toThrow();
    expect(() => personaSegmentPrompt('sara', 'offer-return', '', 'P', undefined, false, undefined, undefined, { parentPrompt: 'P' })).toThrow();
  });
  test('the host landing block keeps the end-ask as the ONLY capture ask', () => {
    expect(DEMO_OFFER_HOST_SEGMENT).toContain('the ONE end-ask send offer');
    expect(DEMO_OFFER_HOST_SEGMENT).toContain('Sara\'s optional email was for the demo recording');
  });
});

describe('demoStartApplies — Sara\'s intake session earns the tool', () => {
  test('demoIntake applies without homepageSales', () => {
    expect(demoStartApplies({ demoIntake: true })).toBe(true);
    expect(demoStartApplies({ demoIntake: true, homepageSales: false })).toBe(true);
  });
  test('existing callers unchanged: homepage sales applies; plain sessions do not', () => {
    expect(demoStartApplies({ homepageSales: true })).toBe(true);
    expect(demoStartApplies({})).toBe(false);
    expect(demoStartApplies({ demoIntake: false })).toBe(false);
  });
  test('simulation and preview never apply, on either path', () => {
    expect(demoStartApplies({ demoIntake: true, simulation: true })).toBe(false);
    expect(demoStartApplies({ demoIntake: true, preview: true })).toBe(false);
    expect(demoStartApplies({ homepageSales: true, simulation: true })).toBe(false);
  });
});

describe('client matcher — the visitor-armed offer trigger', () => {
  test('acceptance phrases arm pendingOffer in the offer phase', () => {
    for (const line of [
      'Yes, show me the demo',
      "let's see the demo",
      'Can I see it on my website?',
      'show me it working',
      'I want to try the demo',
    ]) {
      expect(visitorAcceptsOffer(line)).toBe(true);
      expect(noteOfferIntent(offerState(), line).pendingOffer).toBe(true);
    }
  });
  test('asking for Sara by name or role also arms it (she is the offer\'s destination)', () => {
    expect(noteOfferIntent(offerState(), 'Can I talk to Sara?').pendingOffer).toBe(true);
    expect(noteOfferIntent(offerState(), 'Can I speak to the receptionist?').pendingOffer).toBe(true);
  });
  test('declines never arm — for that line only', () => {
    for (const line of ['No demo, thanks', "I don't want a demo", 'no thanks', 'not now', "don't bring Sara"]) {
      expect(visitorAcceptsOffer(line)).toBe(false);
      const s = offerState();
      expect(noteOfferIntent(s, line)).toBe(s);
    }
    // A later genuine ask still arms normally.
    expect(noteOfferIntent(offerState(), 'Actually, show me the demo').pendingOffer).toBe(true);
  });
  test('ordinary sales chatter does not arm it', () => {
    expect(visitorAcceptsOffer('show me the pricing')).toBe(false);
    expect(visitorAcceptsOffer("let's see the plans")).toBe(false);
    expect(visitorAcceptsOffer('my partner Sara handles our phones')).toBe(false);
  });
  test('phase-scoped and one-shot: inert outside the offer phase and after offer-sara is done', () => {
    const host = { ...INITIAL_SWAP_STATE };
    expect(noteOfferIntent(host, 'show me the demo')).toBe(host);
    const doneState = offerState({ done: ['offer-sara'] });
    expect(noteOfferIntent(doneState, 'show me the demo')).toBe(doneState);
    const presenter = offerState({ presenter: 'latina' });
    expect(noteOfferIntent(presenter, 'show me the demo')).toBe(presenter);
  });
});

describe('client matcher — boundaryForAssistantLine in the offer phases', () => {
  test('visitor-armed: Aspen\'s next line yields offer-sara whatever it says', () => {
    expect(boundaryForAssistantLine('So, about your call volume on a busy day…', offerState({ pendingOffer: true }))).toBe('offer-sara');
  });
  test('scripted anchor: the introduction line arms offer-sara with no visitor flag', () => {
    expect(boundaryForAssistantLine(DEMO_OFFER_SARA_INTRO_LINE, offerState())).toBe('offer-sara');
    expect(boundaryForAssistantLine('Perfect — let me introduce you to Sara, she handles this part.', offerState())).toBe('offer-sara');
  });
  test('a passing team mention does NOT arm it (the offer phase lasts the whole pitch)', () => {
    expect(boundaryForAssistantLine('Our team is small — you met Sara on our site earlier, and Alex does onboarding.', offerState())).toBeNull();
    expect(boundaryForAssistantLine('Let me tell you about our plans first.', offerState())).toBeNull();
  });
  test('offer-sara is one-shot', () => {
    expect(boundaryForAssistantLine(DEMO_OFFER_SARA_INTRO_LINE, offerState({ done: ['offer-sara'] }))).toBeNull();
  });
  test('Sara\'s performed hand-back yields offer-return; a long mention does not', () => {
    const sara = offerState({ phase: 'offer-sara' });
    expect(boundaryForAssistantLine("That's one for Aspen — Back to Aspen now.", sara)).toBe('offer-return');
    expect(boundaryForAssistantLine('Back to Aspen now.', sara)).toBe('offer-return');
    const longMention = 'Great question — Aspen can walk you through all of the plan details, the pricing tiers and the booking options when she is back with you in a moment, but first let me finish confirming your website address so the demo is right.';
    expect(boundaryForAssistantLine(longMention, sara)).toBeNull();
  });
  test('phase tables route the offer chain', () => {
    expect(PHASE_ENTRY['offer-sara']).toEqual({ boundary: 'offer-sara', persona: 'sara' });
    expect(PHASE_ENTRY['offer-host']).toEqual({ boundary: 'offer-return', persona: 'aspen' });
    expect(PHASE_AFTER_BOUNDARY['offer-sara']).toBe('offer-sara');
    expect(PHASE_AFTER_BOUNDARY['offer-return']).toBe('offer-host');
    expect(BOUNDARY_TARGET['offer-sara']).toBe('sara');
    expect(BOUNDARY_TARGET['offer-return']).toBe('aspen');
    expect(INITIAL_SWAP_STATE.pendingOffer).toBe(false);
  });
  test('reconnect / stash targets follow the offer phases', () => {
    expect(reconnectTarget(offerState(), 'parent-1')).toEqual({ persona: 'aspen' });
    expect(reconnectTarget(offerState({ phase: 'offer-sara' }), 'parent-1')).toEqual({
      persona: 'sara',
      personaSegment: { persona: 'sara', boundary: 'offer-sara', parentSessionId: 'parent-1' },
    });
    expect(reconnectTarget(offerState({ phase: 'offer-host' }), 'parent-1')).toEqual({
      persona: 'aspen',
      personaSegment: { persona: 'aspen', boundary: 'offer-return', parentSessionId: 'parent-1' },
    });
    expect(chainIsMidSegment(offerState())).toBe(false);
    expect(chainIsMidSegment(offerState({ phase: 'offer-sara' }))).toBe(true);
    expect(chainStashTarget({ state: offerState(), parentSessionId: 'p', visitorKey: 'v', businessName: '' })).toBeNull();
    expect(chainStashTarget({ state: offerState({ phase: 'offer-sara' }), parentSessionId: 'p', visitorKey: 'v', businessName: '' })).toEqual({
      persona: 'sara',
      personaSegment: { persona: 'sara', boundary: 'offer-sara', parentSessionId: 'p' },
    });
  });
});

describe('swap openings for the offer boundaries', () => {
  test('offer-sara opening sends Sara straight into the intake, by name when known', () => {
    const text = swapOpeningInstruction({ to: 'sara', boundary: 'offer-sara' }, 'The visitor is Dana.');
    expect(text).toContain('Begin your intake NOW');
    expect(text).toContain('greet the visitor by name if the recap holds it');
    expect(text).toContain('shall we build your demo');
  });
  test('offer-return opening lands Aspen per the demo state — no re-offer, no re-introduction', () => {
    const text = swapOpeningInstruction({ to: 'aspen', boundary: 'offer-return' }, 'Facts established: the demo started.');
    expect(text).toContain('never re-run the offer or re-introduce Sara');
  });
  test('the meet-alex swap beat now states 20 to 30 minutes', () => {
    const text = swapOpeningInstruction({ to: 'alex', boundary: 'meet-alex' }, 'RECAP');
    expect(text).toContain('20 to 30 minutes');
    expect(text).not.toContain('10 to 15 minutes');
  });
});

describe('step 3 — Alex close reconciliation (20–30 minutes)', () => {
  test('every Alex setup figure in the voice/demo system says 20 to 30', () => {
    expect(ALEX_GREETING).toContain('20 to 30 minutes');
    expect(ALEX_DEMO_GREETING).toContain('20 to 30 minutes');
    expect(ALEX_DEMO_GUEST_PROMPT).toContain('20 to 30 minutes');
    expect(TEAM_INTRO_BEAT_ALEX).toContain('20 to 30 minutes');
    expect(TEAM_INTRO_FALLBACK_ALEX).toContain('20 to 30 minutes');
  });
  test('no 10-to-15 remnant in the reconciled modules', () => {
    for (const rel of [
      'supabase/functions/_shared/alex-guide.ts',
      'supabase/functions/_shared/team-intro.ts',
      'supabase/functions/_shared/session-opening.ts',
    ]) {
      expect(read(rel)).not.toContain('10 to 15');
    }
  });
  test('the guest prompt carries the tech-person ask', () => {
    expect(ALEX_DEMO_GUEST_PROMPT).toContain('ASK FOR THEIR TECH PERSON');
    expect(ALEX_DEMO_GUEST_PROMPT).toContain('who looks after their website or their tech');
    expect(ALEX_DEMO_GUEST_PROMPT).toContain('never collect that person\'s contact details');
  });
});

describe('wiring pins', () => {
  test('gemini-session: stamp, refusal class, schema, segment demoIntake, response echo', () => {
    const src = read('supabase/functions/gemini-session/index.ts');
    expect(src).toContain('const demoOfferOn=demoOfferEnabled(');
    expect(src).toContain('config.demoOfferEnabled=true');
    expect(src).toContain('DEMO_OFFER_TEACHING');
    expect(src).toContain('offerParentOk');
    expect(src).toContain('parent.demoOfferEnabled===true');
    expect(src).toContain("'offer-sara','offer-return'");
    expect(src).toContain("b.personaSegment.boundary==='offer-sara'?{demoIntake:true}");
    expect(src).toContain('demoOfferEnabled:config.demoOfferEnabled===true');
    // Mutual exclusion with the team-intro stamp.
    expect(src).toContain('config.teamIntroEnabled!==true');
  });
  test('proxy: the demo-start gate receives the intake flag', () => {
    const src = read('supabase/functions/gemini-live-proxy/index.ts');
    expect(src).toContain('demoIntake: config.demoIntake');
  });
  test('client: offer arming block, pre-stage, transcript folds (x2) and late arms (x2)', () => {
    const src = read('src/components/GeminiConversation.tsx');
    expect(src).toContain("authorized.demoOfferEnabled === true");
    expect(src).toContain("swapChainClassRef.current = 'offer'");
    expect(src).toContain("phase: 'offer'");
    expect(src).toContain('const prestageOfferFace');
    expect(src).toContain("boundary: 'offer-sara'");
    expect(src.split('noteOfferIntent(swapStateRef.current, userLineRef.current)').length - 1).toBe(2);
    expect(src.split('prestageOfferFace()').length - 1).toBeGreaterThanOrEqual(2);
    expect(src.split("armSwapRef.current('offer-sara')").length - 1).toBe(2);
    expect(src).toContain("pendingOffer: boundary === 'offer-sara' ? false : swapStateRef.current.pendingOffer");
  });
});
