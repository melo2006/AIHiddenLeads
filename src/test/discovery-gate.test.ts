// @vitest-environment node
// Publish #78 — the DISCOVERY GATE for presenter realtor sessions
// (2026-11-15).
//
// THE DEFECTS (live-verified in the Publish #72 verification
// rerun, publish72-verification-2026-11-15.md — the first run in
// which #72's behavior was observable at all):
//  - Check B FAIL: the visitor banked purpose, pushed to skip
//    ("That's everything — just send me the list."), and Frank
//    answered with a CONTACT ask instead of the short gate —
//    recap, "Did I capture that all correctly?", the yes, and
//    only then the promise and the capture.
//  - Check D FAIL: the visitor volunteered purpose and a clearly
//    stated $300–400k budget up front; Frank looped on the name
//    for four consecutive turns ("May I have your name, so I can
//    greet you properly?") and never confirmed or recapped the
//    budget — the receptionist segment's name beats starved the
//    discovery arc behind an optional courtesy.
//  - Check A PARTIAL: the purpose question fired (#72 works),
//    but across the host→receptionist beat boundary inside the
//    composed presenter prompt, beat 5/6 delivered a
//    greeting-shaped opener and re-asked a name the host beat
//    had already collected ("I'm Tony", thanked by name).
//
// THE FIX, pinned here: _shared/discovery-gate.ts — the proxy
// keeps its own ledger of the arc's settled state (banked name,
// banked purpose/budget, greetings delivered, the owed gate),
// folded from the visitor's own words and observed from the
// model's own turns, and the turn-boundary decision injects the
// order at the boundary where the obligation was dropped. The
// scenario tests below replay the verification's own transcripts
// (p72-output-recovery-2026-11-15.log) through the decision,
// exactly as the proxy will run it.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DISCOVERY_GATE_MAX_FIRES,
  amountMentionedInTurn,
  armDiscoveryGate,
  bareReplyName,
  budgetAmounts,
  budgetBracketDirective,
  budgetFullyMentionedInTurn,
  budgetMentionedInTurn,
  budgetRangeCollapsedInTurn,
  budgetRangeDirective,
  budgetRecapDirective,
  detectPurposeStated,
  detectPushToSkip,
  detectRecapAsk,
  detectStatedBudget,
  detectStatedName,
  detectStatedView,
  discoveryGateTurnDecision,
  freshDiscoveryGateState,
  greetingOnceDirective,
  nameKnownDirective,
  nameReleaseDirective,
  recapCompletenessDirective,
  seedNameFromFacts,
  shortGateDirective,
  shortGatePurposeDirective,
  turnAsksForNameStandalone,
  turnAsksPurposeQuestion,
  turnAssertsSpecificView,
  turnIsInRoleGreeting,
  turnMentionsPurpose,
  type DiscoveryGateState,
} from '../../supabase/functions/_shared/discovery-gate';
import { buildRealtorDiscoveryLayer } from '../../supabase/functions/_shared/realtor-discovery';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
const proxySource = read('supabase/functions/gemini-live-proxy/index.ts');

// Mirrors the proxy's exact call pattern: at each turnComplete the
// completed visitor utterance and the completed model turn are
// judged together; the returned state threads into the next call.
const boundary = (
  state: DiscoveryGateState,
  visitorUtterance: string,
  modelTurnText: string,
  blocked = false,
) => discoveryGateTurnDecision({ state, visitorUtterance, modelTurnText, blocked });

// The verification's own turns (p72-output-recovery-2026-11-15.log).
const OPENING_NAME_ASK = 'Before we start — who do I have the pleasure of speaking with?';
const ANNOUNCEMENT_AND_GREETING = "Thank you, Tony. Okay — now we are stepping into simulation mode. Please act like a visitor to your own website, or like a caller phoning your own number. I will treat you as a brand-new caller who knows nothing about this demo. One thing to keep in mind: I learned this business from a quick scan of its public website — about 2 minutes of learning. The real me keeps perfecting and expanding my knowledge base: I learn from you as we talk, and from any FAQs, documents, price lists and vendor manuals you give me. So if a deep technical question catches me out here, that is this demo's limit, not the real setup's. Good afternoon, Michael Martinez Group — I'm Frank, thanks for calling. How can I help you?";
const BEAT6_REASK_TURN = 'Good afternoon, and thank you for calling Michael Martinez Group, this is your virtual assistant. We specialize in South Florida\'s luxury property market, helping clients buy and sell homes in exclusive areas like Coral Gables, Pinecrest, and Coconut Grove. May I have your name, so I can greet you properly? Is there anything specific you would like to find out about us?';
const CAPTURE_ASK_TURN = 'To send you the right list of homes, may I please have your name, your email, and the best phone number to reach you on?';
// Check B's own announcement turn: unlike check A's, it ended at
// the expectations beat — the in-role greeting arrived one turn
// later, on the [neutral-ok] turn.
const ANNOUNCEMENT_ONLY = "Thank you, Tony. Okay — now we are stepping into simulation mode. Please act like a visitor to your own website, or like a caller phoning your own number. I will treat you as a brand-new caller who knows nothing about this demo. One thing to keep in mind: I learned this business from a quick scan of its public website — about 2 minutes of learning. The real me keeps perfecting and expanding my knowledge base: I learn from you as we talk, and from any FAQs, documents, price lists, and vendor manuals you give me. So if a deep technical question catches me out here, that is this demo's limit, not the real setup's.";
const NAME_ASK_TURN = 'May I have your name, so I can greet you properly?';

describe('Publish #78 — name detection banks a stated name and nothing else', () => {
  it('banks explicit introductions', () => {
    expect(detectStatedName("I'm Tony.")).toBe('Tony');
    expect(detectStatedName('My name is Tony Miller.')).toBe('Tony Miller');
    expect(detectStatedName('This is Tony.')).toBe('Tony');
    expect(detectStatedName('Tony here, looking for a home.')).toBe('Tony');
  });

  it('banks nothing from conversational shapes that merely follow "I\'m"', () => {
    expect(detectStatedName("I'm looking for a home.")).toBe('');
    expect(detectStatedName("Hi, I'm looking for a home to live in.")).toBe('');
    expect(detectStatedName('This is a great site.')).toBe('');
    expect(detectStatedName("I'm interested in selling.")).toBe('');
  });

  it('a bare reply banks only in the name-ask position (the state machine judges)', () => {
    expect(bareReplyName('Tony.')).toBe('Tony');
    expect(bareReplyName('Tony Miller')).toBe('Tony Miller');
    expect(bareReplyName('Okay, go ahead.')).toBe('');
    expect(bareReplyName('Yes')).toBe('');
    // Without an outstanding ask the decision never consults it:
    let s = freshDiscoveryGateState();
    s = boundary(s, '', 'How can I help you?').state;
    const r = boundary(s, 'Tony.', 'Great, let me show you around.');
    expect(r.state.visitorName).toBe('');
    // With the ask outstanding (the beat-0 position), it banks:
    let s2 = freshDiscoveryGateState();
    s2 = boundary(s2, '', OPENING_NAME_ASK).state;
    const r2 = boundary(s2, 'Tony.', 'Thank you, Tony.');
    expect(r2.state.visitorName).toBe('Tony');
  });
});

describe('Publish #78 — budget detection banks a stated budget on first statement', () => {
  it('banks word-form ranges, word forms and digit forms, in the visitor\'s own words', () => {
    expect(detectStatedBudget('My budget is three hundred to four hundred thousand dollars.'))
      .toBe('three hundred to four hundred thousand');
    expect(detectStatedBudget('My budget is around four hundred thousand dollars.'))
      .toBe('four hundred thousand');
    expect(detectStatedBudget('Around $400k.')).toBe('$400k');
    expect(detectStatedBudget('We are at $300,000 to $400,000.')).toContain('$300,000');
  });

  it('banks nothing from beds, baths, garages or unanchored hundreds', () => {
    expect(detectStatedBudget('A single-family house, three bedrooms and two bathrooms.')).toBe('');
    expect(detectStatedBudget('And a two-car garage.')).toBe('');
    expect(detectStatedBudget('I am one hundred percent sure.')).toBe('');
    expect(detectStatedBudget('We saw 300 homes last year.')).toBe('');
  });

  it('a restatement never replaces the first banked budget', () => {
    let s = freshDiscoveryGateState();
    s = boundary(s, 'My budget is three hundred to four hundred thousand dollars.', 'Got it.').state;
    expect(s.budgetBanked).toBe('three hundred to four hundred thousand');
    s = boundary(s, 'Actually, make it five hundred thousand.', 'Updated.').state;
    expect(s.budgetBanked).toBe('three hundred to four hundred thousand');
  });

  it('budgetMentionedInTurn recognizes the figure in word or digit form, and its absence', () => {
    const budget = 'three hundred to four hundred thousand';
    expect(budgetMentionedInTurn('So: a home, up to three hundred to four hundred thousand dollars. Did I capture that all correctly?', budget)).toBe(true);
    expect(budgetMentionedInTurn('So: a home, up to about 400 thousand. Did I capture that all correctly?', budget)).toBe(true);
    expect(budgetMentionedInTurn('So: a home in Pompano Beach with a two-car garage. Did I capture that all correctly?', budget)).toBe(false);
  });
});

describe('Publish #78 — check B replay: a push to skip with banked criteria earns the short gate, not a capture ask', () => {
  it('runs the verification transcript and fires the short-gate order at the push boundary', () => {
    let s = freshDiscoveryGateState();
    let r = boundary(s, '', OPENING_NAME_ASK);
    expect(r.inject).toBeNull();
    s = r.state;

    r = boundary(s, "I'm Tony.", ANNOUNCEMENT_ONLY);
    expect(r.inject).toBeNull();
    expect(r.state.visitorName).toBe('Tony');
    expect(r.state.inRoleGreetings).toBe(0);
    s = r.state;

    r = boundary(s, 'Okay, go ahead.', "Good afternoon, Michael Martinez Group — I'm Frank, thanks for calling. How can I help you?");
    expect(r.inject).toBeNull();
    expect(r.state.inRoleGreetings).toBe(1);
    s = r.state;

    r = boundary(s, "Hi, I'm looking for a home to live in.", 'That sounds exciting. Are you interested in houses or condos, and which areas are you drawn to? Listings change block by block, so the areas steer everything else.');
    expect(r.inject).toBeNull();
    expect(r.state.purposeBanked).toBe(true);
    s = r.state;

    // The defect turn: the push answered with the capture ask.
    r = boundary(s, "That's everything — just send me the list.", CAPTURE_ASK_TURN);
    expect(r.inject).toBe('short-gate');
    const directive = shortGateDirective(r.state);
    expect(directive).toContain('their purpose');
    expect(directive).toContain('Did I capture that all correctly?');
    expect(directive).toContain('No promise and no contact ask may come before the gate');
    s = r.state;

    // The corrective turn the injection elicits runs the gate; the
    // caller's yes then attaches to a recap he actually heard.
    r = boundary(s, '', 'So: a home to live in, and I\'ll pull the areas and type you mentioned as we go. Did I capture that all correctly?');
    expect(r.inject).toBeNull();
    expect(r.state.gateAsked).toBe(true);
    expect(r.state.gateOwed).toBe(false);
    s = r.state;

    r = boundary(s, "Yes, that's right.", 'Wonderful — we\'ll put that list together and send it to your email.');
    expect(r.inject).toBeNull();
  });

  it('a push with NOTHING banked orders the one keystone — purpose — and bars the contact ask', () => {
    let s = freshDiscoveryGateState();
    const r = boundary(s, 'Just send me the list.', 'Sure — may I have your email address?');
    expect(r.inject).toBe('short-gate-purpose');
    const directive = shortGatePurposeDirective();
    expect(directive).toContain('what the home is FOR');
    expect(directive).toContain('Do NOT ask for contact details');
    expect(directive).toContain('Did I capture that all correctly?');
    s = r.state;
    expect(s.gateOwed).toBe(true);
  });

  it('Publish #80: the order PERSISTS until the gate runs — one sterner repeat per push, then silence; a second push re-arms it', () => {
    // #78 pinned "fires once per push" here. The #78 live
    // verification (check B) proved that one-shot shape is
    // exactly what strands the debt: the order fired, the model
    // answered with something else, and nothing ever landed.
    // The order now re-fires once — sterner — at the next
    // boundary where the gate still has not run, then goes
    // silent (cap 2 per push, the name-release discipline).
    let s = freshDiscoveryGateState();
    s = boundary(s, "Hi, I'm looking for a home to live in.", 'Are you interested in houses or condos?').state;
    let r = boundary(s, "That's everything — just send me the list.", CAPTURE_ASK_TURN);
    expect(r.inject).toBe('short-gate');
    expect(r.state.gateOrderFires).toBe(1);
    expect(r.state.shortGateRepeat).toBe(false);
    s = r.state;
    // The model carries on without the gate and without a new
    // push: the order re-fires, marked as the repeat.
    r = boundary(s, 'Hello?', 'So, about those areas…');
    expect(r.inject).toBe('short-gate');
    expect(r.state.gateOrderFires).toBe(2);
    expect(r.state.shortGateRepeat).toBe(true);
    expect(shortGateDirective(r.state, true)).toContain('already been given once');
    expect(shortGateDirective(r.state, true)).toContain('not a refusal of anything');
    s = r.state;
    // The cap is the discipline — a third non-gate turn is silent:
    r = boundary(s, 'Hello?', 'So, about those areas…');
    expect(r.inject).toBeNull();
    s = r.state;
    // A fresh push re-arms the order:
    r = boundary(s, 'I said just send me the list.', CAPTURE_ASK_TURN);
    expect(r.inject).toBe('short-gate');
    expect(r.state.gateOrderFires).toBe(1);
    expect(r.state.shortGateRepeat).toBe(false);
  });

  it('a gate that runs on the answering turn needs no order', () => {
    let s = freshDiscoveryGateState();
    s = boundary(s, "Hi, I'm looking for a home to live in.", 'Got it, a home to live in.').state;
    const r = boundary(s, "That's everything — just send me the list.", 'So: a home to live in. Did I capture that all correctly?');
    expect(r.inject).toBeNull();
    expect(r.state.gateAsked).toBe(true);
  });

  it('the skip detectors match the harness lines and nothing softer', () => {
    expect(detectPushToSkip("That's everything — just send me the list.")).toBe(true);
    expect(detectRecapAsk("That's everything for now — can you read back the areas and criteria you have for me?")).toBe(true);
    expect(detectRecapAsk("That's everything I have for now — can you read back the criteria you've got for me so far?")).toBe(true);
    expect(detectPushToSkip('Pompano Beach and Deerfield Beach.')).toBe(false);
    expect(detectPurposeStated('To live in.')).toBe(true);
    expect(detectPurposeStated('Pompano Beach and Deerfield Beach.')).toBe(false);
  });
});

describe('Publish #78 — check D replay: the name loop is released and the stated budget is guarded', () => {
  it('runs the verification transcript: budget banked at once, release at the second ask, sterner at the third, capped after', () => {
    let s = freshDiscoveryGateState();
    let r = boundary(s, '', OPENING_NAME_ASK);
    expect(r.inject).toBeNull();
    expect(r.state.standaloneNameAsks).toBe(1);
    s = r.state;

    // The volunteer turn: purpose + budget stated, no name given —
    // Frank's capture take is the SECOND standalone name ask.
    r = boundary(s,
      "Hi, I'm looking for a home to live in. My budget is three hundred to four hundred thousand dollars.",
      'Thank you for reaching out to Michael Martinez Group. Before we go any further, who do I have the pleasure of speaking with?');
    expect(r.state.purposeBanked).toBe(true);
    expect(r.state.budgetBanked).toBe('three hundred to four hundred thousand');
    expect(r.state.visitorName).toBe('');
    expect(r.inject).toBe('name-release');
    expect(nameReleaseDirective(false)).toContain('CLOSED for this session');
    expect(nameReleaseDirective(false)).toContain('run the discovery arc');
    s = r.state;

    // The loop's next turn earns the one sterner repeat:
    r = boundary(s, 'Pompano Beach and Deerfield Beach.', 'Pompano Beach and Deerfield Beach — got it. May I have your name, so I can greet you properly?');
    expect(r.inject).toBe('name-release');
    expect(nameReleaseDirective(true)).toContain('stays closed');
    s = r.state;

    // And then the gate goes quiet — the cap is the discipline:
    r = boundary(s, 'A single-family house, three bedrooms and two bathrooms, with a two-car garage.', 'Understood. May I have your name, so I can greet you properly?');
    expect(r.inject).toBeNull();
    expect(r.state.standaloneNameAsks).toBe(4);
    expect(r.state.nameReleaseFires).toBe(2);
    s = r.state;
  });

  it('a gate recap that drops the stated budget earns the re-run order; a complete recap does not', () => {
    let s = freshDiscoveryGateState();
    s = boundary(s, "Hi, I'm looking for a home to live in. My budget is three hundred to four hundred thousand dollars.", 'Got it — a home to live in.').state;
    // The visitor wraps up and asks for the read-back; Frank runs a
    // gate whose recap omits the budget entirely:
    let r = boundary(s,
      "That's everything I have for now — can you read back the criteria you've got for me so far?",
      'So: a home to live in in Pompano Beach and Deerfield Beach, a single-family house, three bedrooms and two bathrooms, with a two-car garage. Did I capture that all correctly?');
    expect(r.inject).toBe('budget-recap');
    expect(budgetRecapDirective(r.state.budgetBanked)).toContain('three hundred to four hundred thousand');
    s = r.state;
    // The corrected recap carries the budget — no further order:
    r = boundary(s, '',
      'So: a home to live in in Pompano Beach and Deerfield Beach, a single-family house with a two-car garage, up to three hundred to four hundred thousand dollars. Did I capture that all correctly?');
    expect(r.inject).toBeNull();
  });

  it('the bracket offer after a stated budget earns the one-time correction — and is legitimate before one', () => {
    // No budget banked (the check C shape): the bracket question
    // is the designed Q7 and earns nothing.
    let s = freshDiscoveryGateState();
    let r = boundary(s, 'Lauderhill.', 'To keep us on track, are we thinking up to about five hundred thousand, or closer to a million?');
    expect(r.inject).toBeNull();
    // Budget banked: the same offer is the #69 failure, corrected once.
    s = freshDiscoveryGateState();
    s = boundary(s, 'My budget is around four hundred thousand dollars.', 'Got it.').state;
    r = boundary(s, 'Pompano Beach.', 'Pompano Beach — got it. Are we thinking up to about five hundred thousand, or closer to a million?');
    expect(r.inject).toBe('budget-bracket');
    expect(budgetBracketDirective(r.state.budgetBanked)).toContain('four hundred thousand');
    s = r.state;
    r = boundary(s, 'Deerfield Beach too.', 'Or closer to a million?');
    expect(r.inject).toBeNull();
  });

  it('the close\'s bundled capture ask is never counted as a standalone name ask', () => {
    let s = freshDiscoveryGateState();
    const closeAsk = 'So we can send the summary and follow up properly — may I have your name, your email, and the best phone number for you?';
    expect(turnAsksForNameStandalone(closeAsk)).toBe(false);
    expect(turnAsksForNameStandalone(NAME_ASK_TURN)).toBe(true);
    const r = boundary(s, 'No problem, that is all.', closeAsk);
    expect(r.state.standaloneNameAsks).toBe(0);
    expect(r.inject).toBeNull();
  });
});

describe('Publish #78 — check A replay: a banked name is never re-asked across the beat boundary; the greeting happens once', () => {
  it('runs the verification transcript: the beat-6 re-ask earns the name-known correction', () => {
    let s = freshDiscoveryGateState();
    let r = boundary(s, '', OPENING_NAME_ASK);
    expect(r.inject).toBeNull();
    s = r.state;

    r = boundary(s, "I'm Tony.", ANNOUNCEMENT_AND_GREETING);
    expect(r.inject).toBeNull();
    expect(r.state.visitorName).toBe('Tony');
    expect(r.state.inRoleGreetings).toBe(1);
    s = r.state;

    // The defect turn: a greeting-shaped overview opener AND the
    // beat-6 name re-ask, with the name already banked. The
    // name-known correction outranks the greeting correction.
    r = boundary(s, 'Okay, go ahead.', BEAT6_REASK_TURN);
    expect(r.inject).toBe('name-known');
    expect(nameKnownDirective('Tony')).toContain('their name is Tony');
    expect(nameKnownDirective('Tony')).toContain('never re-asked');
    s = r.state;
    expect(s.inRoleGreetings).toBe(2);
  });

  it('exactly one in-role greeting per session: the second earns the one-time correction, the host greeting never counts', () => {
    let s = freshDiscoveryGateState();
    const hostGreeting = 'Good afternoon, welcome. I am Frank from AI Hidden Leads — welcome. Before we start: this is a mock-up layered over a copy of your site. Now, let us begin. Before we start — who do I have the pleasure of speaking with?';
    expect(turnIsInRoleGreeting(hostGreeting)).toBe(false);
    let r = boundary(s, '', hostGreeting);
    expect(r.state.inRoleGreetings).toBe(0);
    s = r.state;

    r = boundary(s, "Hi, I'm looking for a home.", 'Good afternoon, Michael Martinez Group — this is Frank. Thank you so much for calling us — how are you doing today?');
    expect(r.inject).toBeNull();
    expect(r.state.inRoleGreetings).toBe(1);
    s = r.state;

    r = boundary(s, 'To live in.', 'Good afternoon, and thank you for calling Michael Martinez Group — how can I help you?');
    expect(r.inject).toBe('greeting-once');
    expect(greetingOnceDirective()).toContain('happens ONCE');
    s = r.state;

    r = boundary(s, 'Pompano Beach.', 'Good afternoon, thank you for calling Michael Martinez Group.');
    expect(r.inject).toBeNull();
  });

  it('a successor session inherits the banked name from its recap and seed facts — the re-ask is corrected at its first boundary', () => {
    const recap = [
      'Assistant: Before we start — who do I have the pleasure of speaking with?',
      "Visitor: I'm Tony.",
      'Assistant: Thank you, Tony. Okay — now we are stepping into simulation mode.',
      "Visitor: Hi, I'm looking for a home to live in. My budget is three hundred to four hundred thousand dollars.",
    ].join('\n');
    const armed = armDiscoveryGate(freshDiscoveryGateState(), { recapText: recap, seedName: '' });
    expect(armed.visitorName).toBe('Tony');
    expect(armed.purposeBanked).toBe(true);
    expect(armed.budgetBanked).toBe('three hundred to four hundred thousand');
    const r = boundary(armed, 'Okay, go ahead.', NAME_ASK_TURN);
    expect(r.inject).toBe('name-known');

    // The store's name wins as the seed; a placeholder is no name:
    expect(seedNameFromFacts({ capturedName: 'Tony Miller' })).toBe('Tony Miller');
    expect(seedNameFromFacts({ capturedName: '', visitorContactName: 'Tony' })).toBe('Tony');
    expect(seedNameFromFacts({ visitorContactName: 'CRM Prospect' })).toBe('');
    const seeded = armDiscoveryGate(freshDiscoveryGateState(), { recapText: '', seedName: 'Tony' });
    expect(seeded.visitorName).toBe('Tony');
  });
});

describe('Publish #78 — decision discipline: blocked boundaries, stand-downs and caps', () => {
  it('a blocked boundary still folds and observes — the debt is judged fresh at the first unblocked boundary', () => {
    let s = freshDiscoveryGateState();
    s = boundary(s, "Hi, I'm looking for a home to live in.", 'Got it, a home to live in.').state;
    let r = boundary(s, "That's everything — just send me the list.", CAPTURE_ASK_TURN, true);
    expect(r.inject).toBeNull();
    expect(r.state.gateOwed).toBe(true);
    s = r.state;
    r = boundary(s, 'Hello?', 'So, about the areas…');
    expect(r.inject).toBe('short-gate');
  });

  it('the global fires cap silences the gate — the conversation proceeds ungated, never fabricated', () => {
    let s = { ...freshDiscoveryGateState(), fires: DISCOVERY_GATE_MAX_FIRES };
    s = boundary(s, "Hi, I'm looking for a home to live in.", 'Got it.').state;
    const r = boundary(s, "That's everything — just send me the list.", CAPTURE_ASK_TURN);
    expect(r.inject).toBeNull();
  });

  it('clean discovery turns earn nothing', () => {
    let s = freshDiscoveryGateState();
    s = boundary(s, '', OPENING_NAME_ASK).state;
    s = boundary(s, "I'm Tony.", ANNOUNCEMENT_AND_GREETING).state;
    let r = boundary(s, "Hi, I'm looking for a home.", 'Are you interested in selling, or are you looking to buy a home or a condo?');
    expect(r.inject).toBeNull();
    s = r.state;
    r = boundary(s, 'To live in.', 'Got it, a home to live in. As we talk, I\'ll gather a few details so we can put together a list of properties that match what you are looking for. Would you prefer to receive the list via email or text message?');
    expect(r.inject).toBeNull();
    s = r.state;
    r = boundary(s, 'Pompano Beach and Deerfield Beach.', 'Pompano Beach and Deerfield Beach — got it! Listings change block by block, so these areas steer everything else. What are you picturing regarding property type — a single-family home, a townhouse, or a condo? And how many bedrooms and baths make it work?');
    expect(r.inject).toBeNull();
  });
});

describe('Publish #78 — wiring: the proxy arms the gate on presenter sessions only, after the capture gate', () => {
  it('imports the gate and scopes it to presenter-stamped, non-segment sessions', () => {
    expect(proxySource).toContain("from '../_shared/discovery-gate.ts'");
    expect(proxySource).toContain('const presenterDiscoverySession = presenterFarewellSession && config.personaSegment == null');
    expect(proxySource).toContain('if (presenterDiscoverySession) {');
    expect(proxySource).toContain('armDiscoveryGate(freshDiscoveryGateState()');
    expect(proxySource).toContain('seedNameFromFacts({');
  });

  it('the decision runs after the capture gate and the consent ask, and stands down when either injected', () => {
    const captureAt = proxySource.indexOf('captureGateTurnDecision({');
    const consentAt = proxySource.indexOf('consentAskTurnDecision({');
    const discoveryAt = proxySource.indexOf('discoveryGateTurnDecision({');
    expect(captureAt).toBeGreaterThan(-1);
    expect(consentAt).toBeGreaterThan(captureAt);
    expect(discoveryAt).toBeGreaterThan(consentAt);
    const discoveryBlock = proxySource.slice(discoveryAt, discoveryAt + 600);
    expect(discoveryBlock).toContain('gateInjected || consentInjected');
    // The capture gate's own call is untouched by the chain: its
    // blocked terms are exactly the pre-#78 set.
    const captureBlock = proxySource.slice(captureAt, captureAt + 400);
    expect(captureBlock).toContain('blocked: preview || farewellHandled || farewellTimer !== undefined || managerTransferRequested || pendingActions.size > 0,');
    expect(captureBlock).not.toContain('consentInjected');
  });

  it('the directives live in the gate module — the discovery layer prompt carries none of them', () => {
    const layer = buildRealtorDiscoveryLayer({ agentName: 'Michael Martinez' });
    expect(layer).not.toContain('Run the SHORT GATE now');
    expect(layer).not.toContain('the question is now CLOSED for this session');
    expect(layer).not.toContain('A name you hold is never re-asked');
    // …while the layer's own rules the gate enforces stand as written:
    expect(layer).toContain('THE SHORT GATE');
    expect(layer).toContain('A STATED BUDGET IS NEVER RE-ASKED');
    expect(layer).toContain('THE GREETING HAPPENS ONCE');
  });
});

// ---------------------------------------------------------------------------
// Publish #80 — the #78 live verification's failing shapes, replayed
// with the verification's own turns (~/workspace/p60-test/p78-B.log,
// p78-D.log, p78-B2.log). Each replay fails on the pre-#80 code for
// the same reason the live check failed; the pins name the boundary.
// ---------------------------------------------------------------------------

const B_IN_ROLE_GREETING = "Good afternoon, Michael Martinez Group — I'm Frank, thanks for calling. How can I help you?";
const B_PURPOSE_REASK = "It's a great time to find the perfect place! Are you interested in selling, or are you looking to buy a home or a condo?";
const B_BUNDLED_CAPTURE_ASK = 'Before we proceed, may I have your name, your email, and the best phone number for you?';
const B_DECLINE_TURN = "No problem at all — I understand you'd prefer not to share those details. Without your contact information, I won't be able to send the list of properties to you.";

const D_HOST_GREETING = "Good afternoon, welcome. I am Frank from AI Hidden Leads — welcome. Before we start: this is a mock-up layered over a copy of your site — we haven't touched your website or your server. Now, let us begin. Before we start — who do I have the pleasure of speaking with?";
const D_COLLAPSED_ACK = 'Good afternoon, Michael Martinez — this is Frank, thanks for calling in. I really appreciate you speaking with me. So, finding a home to live in is exciting, and that four hundred thousand dollar ballpark gives us a clear focus. Tell me, which areas are you drawn to? Listings change block by block, so the areas steer everything else.';
const D_AREAS_ACK = 'Pompano Beach and Deerfield Beach — got it. Now, are you picturing a single-family home, a townhouse, or a condo, and how many bedrooms and baths make it work? Three-plus bedrooms gives you the strongest pool — of buyers when you sell, of tenants when you rent.';
const D_TYPE_ACK = 'A single-family house with three bedrooms and two bathrooms and a must-have two-car garage — got it. Now, are you looking for something that is move-in ready, a light refresh, or would you be open to a fixer-upper? Renovation appetite changes the budget as much as the search — a cosmetic refresh and a gut rehab are different hunts.';
const D_VOID_RECAP = 'So, a single-family house in Pompano Beach and Deerfield Beach with three bedrooms, two bathrooms, and a two-car garage, with the condition still open. Did I capture that all correctly?';
const D_CAPTURE_ASK = 'To proceed with sending you the list, may I have your name, your email address, and the best phone number to reach you on?';
const D_COMPLETE_RECAP = 'So: a home to live in, in Pompano Beach and Deerfield Beach, a single-family house, three bedrooms and two bathrooms, a two-car garage — and your budget, three hundred to four hundred thousand dollars. Did I capture that all correctly?';

const B2_TRANSITION_TURN = "Of course. Okay, now we're stepping into simulation mode. One thing to keep in mind: I learned this business from a quick scan of its public website. [PAUSE] Good afternoon, Michael Martinez Group — I am Frank, thanks for calling. How can I help you?";
const B2_GATE_TURN = 'So: looking for a home to live in, with areas still open. Did I capture that all correctly?';
const B2_PROMISE_TURN = "We'll put that list together and send it to you — and if you give me an email or a mobile number, we'll send that list straight to you — where's best?";

describe('Publish #80 — defect 1: check B exact live replay — the order persists past the misread "yes"', () => {
  it('purpose banks over the model\'s re-ask; the push fires the order; the decline boundary fires the sterner repeat', () => {
    let s = freshDiscoveryGateState();
    let r = boundary(s, '', OPENING_NAME_ASK);
    expect(r.inject).toBeNull();
    s = r.state;

    r = boundary(s, "I'm Tony.", ANNOUNCEMENT_ONLY);
    expect(r.inject).toBeNull();
    s = r.state;

    r = boundary(s, 'Okay, go ahead.', B_IN_ROLE_GREETING);
    expect(r.inject).toBeNull();
    s = r.state;

    // The volunteered purpose statement, answered by Frank RE-ASKING
    // the purpose question. Banking is a fold over the visitor's
    // words: the re-ask cannot un-bank it. (Pre-#80 this also
    // banked — the live failure was downstream, at the order.)
    r = boundary(s, "Hi, I'm looking for a home to live in.", B_PURPOSE_REASK);
    expect(r.inject).toBeNull();
    expect(r.state.purposeBanked).toBe(true);
    s = r.state;

    // The push: Frank answers with the bundled capture ask; the
    // order fires at the boundary.
    r = boundary(s, "That's everything — just send me the list.", B_BUNDLED_CAPTURE_ASK);
    expect(r.inject).toBe('short-gate');
    expect(r.state.gateOrderFires).toBe(1);
    expect(r.state.shortGateRepeat).toBe(false);
    s = r.state;

    // THE LIVE FAILURE BOUNDARY: the visitor's "Yes, that's right"
    // is read as a DECLINE of the capture ask. Pre-#80 the spent
    // order injected nothing here and the gate debt was stranded
    // forever (gateOwed stayed true, unreachable). Post-#80 the
    // sterner repeat fires — a yes to a capture ask is neither a
    // recap confirmation nor a refusal.
    r = boundary(s, "Yes, that's right.", B_DECLINE_TURN);
    expect(r.inject).toBe('short-gate');
    expect(r.state.shortGateRepeat).toBe(true);
    expect(r.state.gateOrderFires).toBe(2);
    expect(r.state.gateOwed).toBe(true);
    expect(r.state.gateAsked).toBe(false);
    s = r.state;

    // The repeat elicits the gate; the complete recap discharges it.
    r = boundary(s, '', 'So: looking for a home to live in, with the areas and property type still open. Did I capture that all correctly?');
    expect(r.inject).toBeNull();
    expect(r.state.gateAsked).toBe(true);
    expect(r.state.gateOwed).toBe(false);
    s = r.state;

    // And only now does a yes attach to a recap actually heard.
    r = boundary(s, "Yes, that's right.", "Wonderful — we'll put that list together and send it to you.");
    expect(r.inject).toBeNull();
  });
});

describe('Publish #80 — defect 2: check D exact live replay — range collapse, void recap, persistent correction', () => {
  it('the collapsed acknowledgment earns the range correction; the budget-less recap is VOID and its confirm cannot discharge the gate', () => {
    let s = freshDiscoveryGateState();
    let r = boundary(s, '', D_HOST_GREETING);
    expect(r.inject).toBeNull();
    s = r.state;

    // The volunteer turn banks purpose + the range; Frank's
    // acknowledgment collapses the range to its top end.
    // Pre-#80: null — nothing anywhere guarded the range.
    r = boundary(s, "Hi, I'm looking for a home to live in. My budget is three hundred to four hundred thousand dollars.", D_COLLAPSED_ACK);
    expect(r.state.budgetBanked).toBe('three hundred to four hundred thousand');
    expect(r.inject).toBe('budget-range');
    expect(budgetRangeDirective(r.state.budgetBanked)).toContain('stated their budget as a range');
    expect(budgetRangeDirective(r.state.budgetBanked)).toContain('three hundred to four hundred thousand');
    s = r.state;

    r = boundary(s, 'Pompano Beach and Deerfield Beach.', D_AREAS_ACK);
    expect(r.inject).toBeNull();
    s = r.state;

    r = boundary(s, 'A single-family house, three bedrooms and two bathrooms, with a two-car garage.', D_TYPE_ACK);
    expect(r.inject).toBeNull();
    s = r.state;

    // The recap-ask: Frank's recap drops the budget (and the
    // purpose). Pre-#80 the correction fired here too — but the
    // observe step had already marked the gate SATISFIED, so the
    // debt was gone. Post-#80 the recap is VOID: the debt stands.
    r = boundary(s, "That's everything I have for now — can you read back the criteria you've got for me so far?", D_VOID_RECAP);
    expect(r.inject).toBe('budget-recap');
    expect(r.state.recapVoided).toBe(true);
    expect(r.state.recapMissing).toEqual(['budget', 'purpose']);
    expect(r.state.gateOwed).toBe(true);
    expect(r.state.gateAsked).toBe(false);
    s = r.state;

    // THE LIVE FAILURE BOUNDARY: the visitor confirms the void
    // recap and Frank goes straight to the capture ask. Pre-#80:
    // null — the one-shot correction was spent and the yes was
    // accepted. Post-#80 the completeness correction re-fires.
    r = boundary(s, "Yes, that's right.", D_CAPTURE_ASK);
    expect(r.inject).toBe('budget-recap');
    expect(r.state.recapCorrectionFires).toBe(2);
    expect(r.state.gateAsked).toBe(false);
    s = r.state;

    // The corrected, complete recap finally discharges the gate.
    r = boundary(s, '', D_COMPLETE_RECAP);
    expect(r.inject).toBeNull();
    expect(r.state.gateAsked).toBe(true);
    expect(r.state.gateOwed).toBe(false);
    expect(r.state.recapVoided).toBe(false);
    s = r.state;

    r = boundary(s, "Yes, that's right.", D_CAPTURE_ASK);
    expect(r.inject).toBeNull();
  });

  it('range arithmetic: amounts, full mention, and the collapse test itself', () => {
    const budget = 'three hundred to four hundred thousand';
    expect(budgetAmounts(budget)).toEqual(['three hundred', 'four hundred thousand']);
    expect(amountMentionedInTurn(D_COLLAPSED_ACK, 'four hundred thousand')).toBe(true);
    expect(amountMentionedInTurn(D_COLLAPSED_ACK, 'three hundred')).toBe(false);
    expect(budgetRangeCollapsedInTurn(D_COLLAPSED_ACK, budget)).toBe(true);
    // The full range repeated is not a collapse, and neither is silence:
    expect(budgetRangeCollapsedInTurn('Your budget — three hundred to four hundred thousand — noted.', budget)).toBe(false);
    expect(budgetRangeCollapsedInTurn('Which areas are you drawn to?', budget)).toBe(false);
    // Digit forms collapse the same way:
    expect(budgetRangeCollapsedInTurn('That $400,000 ballpark gives us a clear focus.', '$300,000 to $400,000')).toBe(true);
    expect(budgetRangeCollapsedInTurn('The $300,000 to $400,000 range, noted.', '$300,000 to $400,000')).toBe(false);
    // A single-figure budget can never be "collapsed":
    expect(budgetRangeCollapsedInTurn('That four hundred thousand ballpark.', 'four hundred thousand')).toBe(false);
    // Full mention requires EVERY amount — either end alone fails:
    expect(budgetFullyMentionedInTurn(D_COMPLETE_RECAP, budget)).toBe(true);
    expect(budgetFullyMentionedInTurn(D_COLLAPSED_ACK, budget)).toBe(false);
    expect(budgetFullyMentionedInTurn('So: three hundred thousand and up. Did I capture that all correctly?', budget)).toBe(false);
    expect(budgetFullyMentionedInTurn(D_VOID_RECAP, budget)).toBe(false);
  });

  it('a recap that drops only the purpose earns the recap-completeness kind, naming the purpose', () => {
    let s = freshDiscoveryGateState();
    s = boundary(s, "Hi, I'm looking for a home to live in. My budget is three hundred to four hundred thousand dollars.", 'Got it — noted.').state;
    const r = boundary(s, "That's everything — just send me the list.",
      'So: a single-family house in Pompano Beach, three hundred to four hundred thousand dollars. Did I capture that all correctly?');
    expect(r.inject).toBe('recap-completeness');
    expect(r.state.recapMissing).toEqual(['purpose']);
    expect(r.state.gateAsked).toBe(false);
    const directive = recapCompletenessDirective(r.state);
    expect(directive).toContain('does NOT count');
    expect(directive).toContain('what the home is for');
  });

  it('a recap that asserts a view the visitor never stated is VOID — and the same recap is complete when the visitor DID state it', () => {
    // Check C's softness, caught where it counts: on a gate turn.
    let s = freshDiscoveryGateState();
    s = boundary(s, "Hi, I'm looking for a home to live in.", 'Got it, a home to live in.').state;
    const insertedRecap = 'So: a home to live in, with a water view and a two-car garage. Did I capture that all correctly?';
    let r = boundary(s, "That's everything — just send me the list.", insertedRecap);
    expect(r.inject).toBe('recap-completeness');
    expect(r.state.recapVoided).toBe(true);
    expect(r.state.recapInsertedView).toBe(true);
    expect(r.state.recapMissing).toEqual([]);
    expect(r.state.gateAsked).toBe(false);
    expect(recapCompletenessDirective(r.state)).toContain('they never chose one');

    // The control: the visitor stated the view themselves.
    s = freshDiscoveryGateState();
    s = boundary(s, "Hi, I'm looking for a home to live in — a water view would be perfect.", 'Got it.').state;
    expect(s.viewBanked).toBe(true);
    r = boundary(s, "That's everything — just send me the list.", insertedRecap);
    expect(r.inject).toBeNull();
    expect(r.state.gateAsked).toBe(true);
  });

  it('view and purpose-mention detectors hold their false-positive discipline', () => {
    expect(detectStatedView('I want a water view.')).toBe(true);
    expect(detectStatedView('The setting is flexible.')).toBe(false);
    expect(turnAssertsSpecificView('So: a home in Lauderhill with a water view and a two-car garage.')).toBe(true);
    expect(turnAssertsSpecificView('So: a home in Lauderhill, with the water view still open.')).toBe(false);
    expect(turnAssertsSpecificView('So: a home in Lauderhill, no water view.')).toBe(false);
    expect(turnAssertsSpecificView('So: a home in Lauderhill with three bedrooms.')).toBe(false);
    expect(turnMentionsPurpose('So: living in a single-family home in Pompano Beach.')).toBe(true);
    expect(turnMentionsPurpose(D_VOID_RECAP)).toBe(false);
    expect(detectPurposeStated("We'll live there.")).toBe(true);
    expect(detectPurposeStated("We're moving in next spring.")).toBe(true);
  });
});

describe('Publish #80 — defect 3: check B2 exact live replay — the keystone order survives the simulation entry', () => {
  it('push-1 fires into the transition and is CARRIED; the first post-transition boundary re-fires it as the short gate', () => {
    let s = freshDiscoveryGateState();
    let r = boundary(s, '', D_HOST_GREETING);
    expect(r.inject).toBeNull();
    s = r.state;

    // Push-1 lands during the host beats; the answering turn is
    // the transition + in-role greeting. The bar held live (no
    // contact ask) but the keystone was eaten: pre-#80 the order
    // fired here and was SPENT (gateOrderFired), so the next
    // boundary injected nothing. Post-#80 the fire is carried —
    // it does not count against the push.
    r = boundary(s, "That's everything — just send me the list.", B2_TRANSITION_TURN);
    expect(r.inject).toBe('short-gate-purpose');
    expect(r.state.gateOrderCarried).toBe(true);
    expect(r.state.gateOrderFires).toBe(0);
    expect(r.state.simulationEntered).toBe(true);
    s = r.state;

    // The visitor volunteers the purpose; Frank asks areas. The
    // carried order lands HERE — the first post-transition
    // boundary — now as the short gate (purpose is banked), in
    // its sterner repeat form.
    r = boundary(s, 'To live in.', 'To live in — got it. Which areas are you drawn to?');
    expect(r.inject).toBe('short-gate');
    expect(r.state.shortGateRepeat).toBe(true);
    expect(r.state.gateOrderFires).toBe(1);
    expect(r.state.gateOrderCarried).toBe(false);
    s = r.state;

    // Push-2: the model runs the gate itself (as it did live) —
    // the complete recap discharges the debt with no injection.
    r = boundary(s, "That's everything — just send me the list.", B2_GATE_TURN);
    expect(r.inject).toBeNull();
    expect(r.state.gateAsked).toBe(true);
    expect(r.state.gateOwed).toBe(false);
    s = r.state;

    r = boundary(s, "Yes, that's right.", B2_PROMISE_TURN);
    expect(r.inject).toBeNull();
  });

  it('when the model asks the purpose question itself, the keystone counts as delivered — no injection, the order marked counted', () => {
    expect(turnAsksPurposeQuestion(B_PURPOSE_REASK)).toBe(true);
    expect(turnAsksPurposeQuestion('To live in — got it. Which areas are you drawn to?')).toBe(false);
    let s = freshDiscoveryGateState();
    const r = boundary(s, 'Just send me the list.', B_PURPOSE_REASK);
    expect(r.inject).toBeNull();
    expect(r.state.gateOwed).toBe(true);
    expect(r.state.gateOrderFires).toBe(1);
    expect(r.state.gateOrderCarried).toBe(false);
    s = r.state;
    // The answer banks purpose; the still-owed gate recap earns
    // the short-gate order at that boundary.
    const r2 = boundary(s, 'To live in.', 'To live in — got it. Which areas are you drawn to?');
    expect(r2.inject).toBe('short-gate');
  });

  it('the sterner purpose variant exists and the default is unchanged', () => {
    expect(shortGatePurposeDirective()).toContain('what the home is FOR');
    expect(shortGatePurposeDirective()).not.toContain('already been given once');
    expect(shortGatePurposeDirective(true)).toContain('already been given once');
    expect(shortGatePurposeDirective(true)).toContain('Ask it now, before anything else');
  });
});

describe('Publish #80 — wiring: the proxy renders the new directive kinds', () => {
  it('the switch covers budget-range and recap-completeness, and passes the repeat flag to both short-gate variants', () => {
    expect(proxySource).toContain('budgetRangeDirective(discoveryGate.budgetBanked)');
    expect(proxySource).toContain('recapCompletenessDirective(discoveryGate)');
    expect(proxySource).toContain('shortGateDirective(discoveryGate, discoveryGate.shortGateRepeat)');
    expect(proxySource).toContain('shortGatePurposeDirective(discoveryGate.shortGateRepeat)');
  });
});
