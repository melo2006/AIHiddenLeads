// @vitest-environment node
// Publish #79 — the SALES CAPTURE GATE (2026-11-15).
//
// Ron's decision (2026-11-15 17:51 EST): in Aspen's SALES demo,
// email/phone must NOT be collected during qualification or
// mid-pitch. Capture happens at the END, once the visitor has seen
// the value and shown interest, framed as sending something useful
// — the demo link, a copy of the conversation, a follow-up — with
// the share angle explicit: something they can pass to their
// manager, colleague, or the owner. ONE ask; a decline ends it; no
// interest signal means no ask at all. Volunteered details still
// flow through the #68/#74 ritual untouched, and Frank's REALTOR
// DISCOVERY step-2 capture (Ron's 2026-11-14 design) is out of
// scope and byte-identical.
//
// The enforcement is split, and these tests pin both halves:
//  - MECHANICAL: _shared/sales-gate.ts — the proxy keeps the
//    ledger (interest, close, the ask spent/declined, contact
//    held or volunteered) on homepage-sales sessions only and
//    injects at most one directive per boundary: an early-ask
//    correction, the framed end-ask order, or a no-repeat order.
//  - PROMPT-LEVEL: the sales layer's CAPTURE TIMING rule, the
//    demo bridge's re-timed steps, the silence/leaving amendments,
//    and DEMO_SALES_POLICY's step-out timing rule.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  SALES_GATE_END_ASK_TOTAL_FIRES,
  SALES_GATE_MAX_FIRES,
  armSalesGateFromRecap,
  bundledOfferDirective,
  classifyModelAsk,
  detectAskDecline,
  detectCloseSignal,
  detectInterestSignal,
  detectOfferAcceptance,
  earlyAskDirective,
  endAskDirective,
  endAskPreArmDirective,
  freshSalesGateState,
  noRepeatDirective,
  salesGatePreAnswerDecision,
  salesGateTurnDecision,
  salesSilenceHoldText,
  shareAngleCompletionDirective,
  turnAsksForContact,
  turnBeginsClose,
  turnCollectsBookingContact,
  turnHasShareAngle,
  turnMakesSendOffer,
  type SalesGateState,
} from '../../supabase/functions/_shared/sales-gate';
import {
  HOMEPAGE_SALES_LAYER,
  HOMEPAGE_SALES_PROMPT,
  REALTOR_CONVERSATION_LAYER,
} from '../../supabase/functions/_shared/homepage-knowledge';
import {
  DEMO_INVITE_OPENING,
  DEMO_SALES_POLICY,
  DEMO_VERIFICATION_ACT1,
} from '../../supabase/functions/_shared/demo-sales';
import { buildRealtorDiscoveryLayer } from '../../supabase/functions/_shared/realtor-discovery';

const proxySource = fs.readFileSync(
  new URL('../../supabase/functions/gemini-live-proxy/index.ts', import.meta.url),
  'utf8',
);

/** One proxy turn boundary, exactly as the proxy runs it. */
const boundary = (
  state: SalesGateState,
  visitorUtterance: string,
  modelTurnText: string,
  opts: { blocked?: boolean; contact?: { email?: string | null; phone?: string | null } | null } = {},
) => salesGateTurnDecision({
  state,
  contact: opts.contact ?? null,
  modelTurnText,
  visitorUtterance,
  blocked: opts.blocked ?? false,
});

const QUALIFYING_VISITOR = 'We run a plumbing company — mostly residential, some light commercial.';
const QUALIFYING_MODEL = 'Got it. And when you are out on a job and a call comes in, what happens to that call — does it go to voicemail?';
const EARLY_ASK_MODEL = "While that loads, let me grab a couple of details — what's your email address, and what's the best mobile number for you?";
const INTEREST_VISITOR = 'Okay, that sounds good. How much does it cost?';
const PRICE_ANSWER_MODEL = 'Premium is $99 a month — 400 voice minutes included, and the video avatar is free for the first month.';
const END_ASK_MODEL = "Before you go — I can send you the link to this demo so you can replay it, plus a copy of our conversation, something you can pass to your manager or the owner. What's the best email for that?";
// Publish #84: the scripted step-6 offer STANDING ALONE — the
// send-offer with the share angle and NO destination ask in the
// turn. Under the offer → yes → collect sequence this, not
// END_ASK_MODEL, is the compliant delivery shape.
const PURE_OFFER_MODEL = "Before we talk calls and setup — let me send you something you can actually use: the link to this demo so you can replay it, a copy of this conversation, or a follow-up from the team — something you can pass to your manager, a colleague, or the owner.";
const ACCEPT_VISITOR = 'Email is best — go ahead.';
const DECLINE_VISITOR = 'No thanks — not right now.';
const VOLUNTEER_VISITOR = 'Actually, just take my email now — it is tony dot test at example dot com.';
const VOLUNTEER_MODEL = "Perfect, let me read that back: t, o, n, y, dot, t, e, s, t, at example dot com. Did I get that right?";
// Publish #81 fixtures — VERBATIM from the #79 live verification
// (publish79-verification-2026-11-15.md, check S2, both runs):
// the interest turn and the two model turns that displaced the
// end-ask — the meeting-booking offer, and the booking form's
// name-led collection the #79 detector could not see.
const S2_INTEREST_VISITOR = 'Okay — what does it cost per month, and how would I get started?';
const S2_BOOKING_OFFER_RUN1 = 'Premium is ninety nine dollars a month, and the setup fee is waived right now. Alex, our onboarding engineer, walks you through the setup step by step — the self-setup takes most people about fifteen to thirty minutes with him guiding you, though done-for-you setup is also available if you\'d rather hand it over. Would you have fifteen to twenty minutes for a quick introductory meeting with one of our sales specialists to go over your questions and the main features?';
const S2_BOOKING_OFFER_RERUN = 'Premium is $99 a month and includes 400 browser voice minutes and up to 50 B2B prospects per month. The live video avatar is free for your first month, and then $79 a month if you choose to keep it. Most businesses are live the same day — you can set it up yourself in 15 to 30 minutes with Alex, our onboarding engineer, or we do it with you on a call. Would you have 15 to 20 minutes for a quick introductory meeting to go over your questions, the main features, and getting you set up?';
const S2_SLOT_CHOICE_MODEL = 'What works best for you — later today, tomorrow morning, or would the next day be better?';
const S2_BOOKING_COLLECTION_MODEL = 'Perfect. To get that introductory meeting scheduled, could you please spell your first and last name and provide your email address?';
// The same-turn pair for the lead-order rule: the send-offer
// leading (the ask counts as made) vs the collection leading
// (it does not).
const SEND_THEN_BOOK_MODEL = "Let me send you the demo link and a copy of this conversation — something you can pass to your manager, a colleague, or the owner. What's the best email for that? And if you'd like to get that introductory meeting scheduled too, could you spell your first and last name and provide your email address?";
const BOOK_THEN_SEND_MODEL = 'Perfect — to get that introductory meeting scheduled, could you please spell your first and last name and provide your email address? I can also send you the demo link and a copy of this conversation afterward.';

describe('Publish #79 — detectors: what counts as a capture ask', () => {
  it('catches the ask shapes, including the old demo-bridge and claim-rule forms', () => {
    expect(turnAsksForContact(EARLY_ASK_MODEL)).toBe(true);
    expect(turnAsksForContact("What's your email address?")).toBe(true);
    expect(turnAsksForContact('May I have your mobile number?')).toBe(true);
    expect(turnAsksForContact("I can text you the booking link with the recap — what's the best mobile number for that?")).toBe(true);
    expect(turnAsksForContact('Can I get your phone number so we can follow up?')).toBe(true);
    expect(turnAsksForContact('Where should I send it?')).toBe(true);
  });

  it('never counts the ritual, the consent confirm, a name ask, or plain conversation', () => {
    expect(turnAsksForContact(VOLUNTEER_MODEL)).toBe(false); // spell-back + "did I get that right?"
    expect(turnAsksForContact('And may we text you on this number?')).toBe(false); // #70 consent — law, not an ask
    expect(turnAsksForContact('May I have your name?')).toBe(false); // names are conversation
    expect(turnAsksForContact(QUALIFYING_MODEL)).toBe(false);
    expect(turnAsksForContact(PRICE_ANSWER_MODEL)).toBe(false);
  });
});

describe('Publish #79 — detectors: interest, close, decline', () => {
  it('interest is Ron\'s signal set — price, next steps, start, positives, the demo, booking', () => {
    expect(detectInterestSignal('How much does it cost?')).toBe(true);
    expect(detectInterestSignal('What are the next steps?')).toBe(true);
    expect(detectInterestSignal('How do I get started?')).toBe(true);
    expect(detectInterestSignal('Sounds good to me.')).toBe(true);
    expect(detectInterestSignal("I'm interested — show me the demo.")).toBe(true);
    expect(detectInterestSignal('My website is acmeplumbing.com')).toBe(true);
    expect(detectInterestSignal("Let's book a call.")).toBe(true);
  });

  it('qualification answers are conversation, never interest', () => {
    expect(detectInterestSignal(QUALIFYING_VISITOR)).toBe(false);
    expect(detectInterestSignal('We get about forty calls a week, maybe half after hours.')).toBe(false);
    expect(detectInterestSignal("One new customer is worth about eight hundred dollars to us.")).toBe(false);
    expect(detectInterestSignal('Usually they just leave a voicemail.')).toBe(false);
  });

  it('close and decline shapes', () => {
    expect(detectCloseSignal("That's all I needed, thanks.")).toBe(true);
    expect(detectCloseSignal('I have to go — goodbye.')).toBe(true);
    expect(detectCloseSignal('Tell me more about the video part.')).toBe(false);
    expect(detectAskDecline(DECLINE_VISITOR)).toBe(true);
    expect(detectAskDecline("I'd rather not give that out.")).toBe(true);
    expect(detectAskDecline('Maybe later.')).toBe(true);
    expect(detectAskDecline('Sure, go ahead.')).toBe(false);
    expect(turnBeginsClose('Before you go, one last thing.')).toBe(true);
    expect(turnBeginsClose('So, about your call volume…')).toBe(false);
  });
});

describe('Publish #79 — (a) no capture ask in qualification turns', () => {
  it('an early ask during qualification earns the correction, and the ledger remembers', () => {
    let s = freshSalesGateState();
    let r = boundary(s, QUALIFYING_VISITOR, QUALIFYING_MODEL);
    expect(r.inject).toBeNull();
    s = r.state;
    r = boundary(s, 'Mostly they leave a voicemail, honestly.', EARLY_ASK_MODEL);
    expect(r.inject).toBe('early-ask');
    expect(r.state.earlyAskCorrections).toBe(1);
    expect(r.state.askFired).toBe(false); // an early ask never spends the end-ask
  });

  it('a second early ask earns the sterner correction; the cap then silences the gate', () => {
    let s = freshSalesGateState();
    s = boundary(s, QUALIFYING_VISITOR, EARLY_ASK_MODEL).state;
    const r = boundary(s, 'Forty calls a week, roughly.', EARLY_ASK_MODEL);
    expect(r.inject).toBe('early-ask');
    expect(r.state.earlyAskCorrections).toBe(2);
    expect(earlyAskDirective(true)).toContain('AGAIN');
    expect(earlyAskDirective(false)).not.toContain('AGAIN');
    const capped = boundary(
      { ...r.state, fires: SALES_GATE_MAX_FIRES },
      'Mostly voicemail.',
      EARLY_ASK_MODEL,
    );
    expect(capped.inject).toBeNull();
  });

  it('clean qualification turns earn nothing — the conversation proceeds ungated', () => {
    let s = freshSalesGateState();
    s = boundary(s, QUALIFYING_VISITOR, QUALIFYING_MODEL).state;
    const r = boundary(s, 'One new customer is worth about eight hundred dollars.', 'So even two missed jobs a month is real money walking to the next name on the list.');
    expect(r.inject).toBeNull();
    expect(r.state.interestSeen).toBe(false);
  });
});

describe('Publish #79 — (b) the end-ask fires on interest/close, framed as a send with the share angle', () => {
  it('interest lands, the answering turn makes no ask → the gate orders the framed end-ask, once', () => {
    let s = freshSalesGateState();
    s = boundary(s, QUALIFYING_VISITOR, QUALIFYING_MODEL).state;
    const r = boundary(s, INTEREST_VISITOR, PRICE_ANSWER_MODEL);
    expect(r.state.interestSeen).toBe(true);
    expect(r.inject).toBe('end-ask');
    expect(r.state.askFired).toBe(true);
    expect(r.state.endAskFires).toBe(1);
    expect(r.state.endAskRepeat).toBe(false); // the standard variant fires first
    // Publish #84 REWRITE (in place, justified): pre-#84 this pin
    // treated END_ASK_MODEL — an offer and its destination ask in
    // ONE turn — as the ordered delivery, discharged on the spot.
    // Fix 3a redefines that shape: collection bundled into the
    // offer turn, before any acceptance, is the bundled-offer
    // violation class, and Ron's scripted sequence (Publish #83
    // step 6) is offer → yes → collect. The ordered turn is now
    // recorded as an outstanding BUNDLED offer — nothing injects
    // at its own boundary (the correction waits for the visitor's
    // response) and the end-ask is NOT discharged…
    const bundled = boundary(r.state, 'Sure.', END_ASK_MODEL);
    expect(bundled.inject).toBeNull();
    expect(bundled.state.askDelivered).toBe(false);
    expect(bundled.state.offerOutstanding).toBe(true);
    expect(bundled.state.offerBundled).toBe(true);
    // …until the visitor accepts and the collection follows as
    // the ritual's first step: THAT is the delivery now.
    const delivered = boundary(bundled.state, 'Email is best — go ahead.', "Perfect — what's the best email address for that?");
    expect(delivered.inject).toBeNull();
    expect(delivered.state.askDelivered).toBe(true);
    expect(delivered.state.offerAccepted).toBe(false); // consumed by the delivery
  });

  // Publish #84 REWRITE (in place, justified): END_ASK_MODEL is an
  // offer with its destination ask in the same turn. Pre-#84 the
  // gate "spent it silently" as delivered; under fix 3a's
  // bundled-offer class it is recorded as an outstanding bundled
  // offer instead — unspent until the visitor accepts and the
  // sequence completes (see the Publish #84 suites below).
  it('when the model makes the end-ask itself on interest, the gate records the bundled offer silently', () => {
    const r = boundary(freshSalesGateState(), INTEREST_VISITOR, END_ASK_MODEL);
    expect(r.inject).toBeNull();
    expect(r.state.askFired).toBe(false);
    expect(r.state.askDelivered).toBe(false);
    expect(r.state.offerOutstanding).toBe(true);
    expect(r.state.offerBundled).toBe(true);
    expect(r.state.offerAngleMissing).toBe(false); // END_ASK_MODEL carries the share angle
  });

  // Publish #81 REWRITE (in place, justified): #79 allowed the
  // re-order only at a genuine close — and its live verification
  // showed exactly how that stranded the ask: the interest turn
  // was answered with a meeting-booking offer, no close ever
  // arrived, and the framed end-ask was never spoken in either
  // session. The order now PERSISTS (the #80 lesson): it
  // re-fires once, sterner, at the very next boundary; the
  // episode cap is 2 fires; a fresh interest signal after the
  // episode runs out re-arms a new one; the session total is
  // SALES_GATE_END_ASK_TOTAL_FIRES.
  it('an undelivered order re-fires once, sterner, at the NEXT boundary — then the episode is spent; a fresh interest signal re-arms', () => {
    let s = freshSalesGateState();
    s = boundary(s, INTEREST_VISITOR, PRICE_ANSWER_MODEL).state; // end-ask ordered (fire 1)
    let r = boundary(s, 'Okay.', 'And the setup itself takes about fifteen minutes with Alex.');
    expect(r.inject).toBe('end-ask'); // the sterner repeat — no close needed anymore
    expect(r.state.endAskFires).toBe(2);
    expect(r.state.endAskRepeat).toBe(true);
    expect(endAskDirective(true)).toContain('STILL owed');
    expect(endAskDirective(true)).toContain('BEFORE anything else is collected');
    expect(endAskDirective(false)).not.toContain('STILL owed');
    r = boundary(r.state, 'Okay.', 'Anything else I can do?');
    expect(r.inject).toBeNull(); // episode spent — no third fire
    // A fresh interest signal re-arms a new episode.
    r = boundary(r.state, 'Actually — how do I get started?', 'Let me walk you through it.');
    expect(r.inject).toBe('end-ask');
    expect(r.state.endAskFires).toBe(1);
    expect(r.state.endAskRepeat).toBe(false);
    expect(r.state.endAskTotalFires).toBe(3);
    r = boundary(r.state, 'Okay.', 'Anything else?');
    expect(r.inject).toBe('end-ask');
    expect(r.state.endAskTotalFires).toBe(SALES_GATE_END_ASK_TOTAL_FIRES);
    // The session total is the hard bound: no third episode.
    r = boundary(r.state, 'And what are the next steps?', 'Right this way.');
    expect(r.inject).toBeNull();
  });

  it('no interest signal → no ask is ever ordered, not even at the goodbye (rule 3)', () => {
    let s = freshSalesGateState();
    s = boundary(s, QUALIFYING_VISITOR, QUALIFYING_MODEL).state;
    const r = boundary(s, 'I have to go — goodbye.', 'Thanks for stopping by — the demo is on the site whenever you are ready.');
    expect(r.state.closeSeen).toBe(true);
    expect(r.state.interestSeen).toBe(false);
    expect(r.inject).toBeNull();
    expect(r.state.askFired).toBe(false);
  });

  it('the directive carries Ron\'s framing verbatim in substance: the send, the useful thing, the share angle', () => {
    const d = endAskDirective();
    expect(d).toContain('the link to this demo so they can replay it');
    expect(d).toContain('a copy of this conversation');
    expect(d).toContain('a follow-up from the team');
    expect(d).toContain('pass to their manager, a colleague, or the owner');
    expect(d).toContain('exactly once');
    expect(d).toContain('NEVER ask again in this session');
  });
});

describe('Publish #79 — (c) decline → no repeat', () => {
  it('after the ask is declined, a re-ask earns the no-repeat order and no end-ask ever fires again', () => {
    let s = freshSalesGateState();
    // Publish #84: END_ASK_MODEL is a bundled offer now — the ask
    // is not "fired" until the visitor's response settles it.
    s = boundary(s, INTEREST_VISITOR, END_ASK_MODEL).state; // model offered (bundled) on interest
    expect(s.offerBundled).toBe(true);
    expect(s.askFired).toBe(false);
    let r = boundary(s, DECLINE_VISITOR, 'No problem at all — happy to keep going without it.');
    expect(r.inject).toBeNull();
    // The decline of the offer spends the one ask (the offer IS
    // the ask in substance): askFired lands HERE, at the decline.
    expect(r.state.askFired).toBe(true);
    expect(r.state.askDeclined).toBe(true);
    s = r.state;
    r = boundary(s, 'What about the video avatar part?', "Sure — and quickly, what's your email so I can send that over?");
    expect(r.inject).toBe('no-repeat');
    expect(noRepeatDirective(false)).toContain('already been made');
    // Even a fresh interest signal cannot resurrect the ask.
    const again = boundary(r.state, 'Actually that sounds good, how do I get started?', 'Great — let me walk you through it.');
    expect(again.inject).toBeNull();
  });

  // Publish #84 REWRITE (in place, justified): the delivery in
  // the setup now runs the scripted sequence — the offer
  // standing alone, the visitor's acceptance, then the
  // collection — because END_ASK_MODEL (offer + ask in one
  // turn) is the bundled shape and no longer delivers. The
  // pin's ruling is unchanged: a further ask after a completed
  // ask is nagging and earns the no-repeat order.
  it('a repeat ask with no explicit decline is still nagging and earns the same order', () => {
    let s = freshSalesGateState();
    s = boundary(s, INTEREST_VISITOR, PRICE_ANSWER_MODEL).state; // gate ordered the end-ask
    s = boundary(s, 'Sure.', PURE_OFFER_MODEL).state; // the offer, standing alone
    s = boundary(s, ACCEPT_VISITOR, "Perfect — what's the best email address for that?").state; // accepted → collected: delivered
    expect(s.askDelivered).toBe(true);
    const r = boundary(s, 'Let me think about it.', "Of course — and what's the best mobile number, just so we can follow up?");
    expect(r.inject).toBe('no-repeat');
  });
});

describe('Publish #79 — (d) volunteered contact mid-session flows through #68/#74 untouched', () => {
  it('dictation stands the gate down permanently: no correction, no end-ask, ever', () => {
    let s = freshSalesGateState();
    s = boundary(s, QUALIFYING_VISITOR, QUALIFYING_MODEL).state;
    const r = boundary(s, VOLUNTEER_VISITOR, VOLUNTEER_MODEL);
    expect(r.state.volunteered).toBe(true);
    expect(r.inject).toBeNull(); // the spell-back turn is the ritual, not an ask
    s = r.state;
    // Even interest arriving later cannot arm an ask — the visitor
    // already gave the channel; #68/#74 own the rest.
    const later = boundary(s, INTEREST_VISITOR, PRICE_ANSWER_MODEL);
    expect(later.inject).toBeNull();
    const byPhone = boundary(freshSalesGateState(), 'My number is 954 770 6622 — text me there.', 'Got it, thank you.');
    expect(byPhone.state.volunteered).toBe(true);
  });

  it('contact already held in the durable store means no ask is ever owed', () => {
    const r = boundary(freshSalesGateState(), INTEREST_VISITOR, PRICE_ANSWER_MODEL, {
      contact: { email: 'tony@example.com', phone: '' },
    });
    expect(r.state.contactHeld).toBe(true);
    expect(r.inject).toBeNull();
  });

  it('a blocked boundary still folds — the debt is judged fresh at the first unblocked boundary', () => {
    let s = freshSalesGateState();
    const r = boundary(s, QUALIFYING_VISITOR, EARLY_ASK_MODEL, { blocked: true });
    expect(r.inject).toBeNull();
    s = r.state;
    const next = boundary(s, 'Mostly voicemail.', EARLY_ASK_MODEL);
    expect(next.inject).toBe('early-ask');
  });

  it('a successor session armed from the recap never re-opens what the parent settled', () => {
    const recap = [
      'Visitor: We run a plumbing company.',
      'Assistant: Who answers your calls today?',
      'Visitor: How much does it cost?',
      "Assistant: Premium is $99 a month. Before you go — what's your email so I can send the recap?",
      'Visitor: My email is tony@example.com',
    ].join('\n');
    const s = armSalesGateFromRecap(freshSalesGateState(), recap, null);
    expect(s.interestSeen).toBe(true);
    expect(s.askFired).toBe(true);
    expect(s.volunteered).toBe(true);
    const held = armSalesGateFromRecap(freshSalesGateState(), '', { email: 'a@b.com', phone: '' });
    expect(held.contactHeld).toBe(true);
  });
});

describe('Publish #79 — prompt-level half: the sales layer now times capture to the end', () => {
  it('the layer carries the CAPTURE TIMING rule with Ron\'s framing and the one-ask discipline', () => {
    expect(HOMEPAGE_SALES_LAYER).toContain('CAPTURE TIMING — THE END-ASK');
    expect(HOMEPAGE_SALES_LAYER).toContain('something they can pass to their manager, a colleague, or the owner');
    expect(HOMEPAGE_SALES_LAYER).toContain('ONE ask is the whole allowance');
    expect(HOMEPAGE_SALES_LAYER).toContain('value first, always');
    expect(HOMEPAGE_SALES_LAYER).toContain('may we text you on this number?');
    expect(HOMEPAGE_SALES_LAYER).toContain('which is law, not an ask');
  });

  it('the demo bridge no longer collects early — step 2 qualifies, step 6 carries the end-ask', () => {
    expect(HOMEPAGE_SALES_PROMPT).not.toContain('CONTACT DETAILS EARLY');
    expect(HOMEPAGE_SALES_PROMPT).not.toContain('Nothing else, no spam');
    expect(HOMEPAGE_SALES_PROMPT).toContain('WHILE IT LOADS, QUALIFY — NEVER CAPTURE');
    expect(HOMEPAGE_SALES_PROMPT).toContain('the END-ASK: offer to send them the demo link and a copy of this conversation');
    expect(HOMEPAGE_SALES_PROMPT).toContain('pass to their manager, a colleague, or the owner');
  });

  it('the contact-claim rule keeps its honesty core and its pinned example — re-timed to the end', () => {
    expect(HOMEPAGE_SALES_LAYER).toContain('CONTACT-CLAIM RULE');
    expect(HOMEPAGE_SALES_LAYER).toContain('never say you will text or email the visitor anything');
    expect(HOMEPAGE_SALES_LAYER).toContain("what's the best mobile number for that?");
    expect(HOMEPAGE_SALES_LAYER).toContain('the offer IS the end-ask');
    expect(HOMEPAGE_SALES_LAYER).not.toContain('ASK for it in the same breath, as the offer itself');
  });

  it('silence to the very end earns no ask; a cold goodbye gets the warm goodbye alone', () => {
    expect(HOMEPAGE_SALES_LAYER).not.toContain('offer the zero-pressure capture');
    expect(HOMEPAGE_SALES_LAYER).toContain('silence is not interest');
    expect(HOMEPAGE_SALES_LAYER).toContain('LEAVING RULE');
    expect(HOMEPAGE_SALES_LAYER).toContain('never make the visitor say goodbye twice');
    expect(HOMEPAGE_SALES_LAYER).toContain('a goodbye from a visitor who never showed interest gets the warm goodbye alone');
  });

  it('the approved sales content is untouched: silence ladder, $99 disarm, 85% line, price framing', () => {
    expect(HOMEPAGE_SALES_LAYER).toContain('Are you still there?');
    expect(HOMEPAGE_SALES_LAYER).toContain('never ask it a second time');
    expect(HOMEPAGE_SALES_LAYER).toContain("Surveys of businesses like yours tell us that 85% of callers who reach a business's voicemail don't call back");
    expect(HOMEPAGE_SALES_LAYER).toContain('$99 a month — 400 voice minutes');
    expect(HOMEPAGE_SALES_LAYER).toContain('never present the plan as "$99 plus $79"');
  });

  it('the realtor LANDING layer inherits the end-ask by reference — it is a sales session, not discovery', () => {
    expect(REALTOR_CONVERSATION_LAYER).toContain('CAPTURE TIMING rule');
    expect(REALTOR_CONVERSATION_LAYER).toContain('never during qualification');
  });

  it('the step-out timing is stated in DEMO_SALES_POLICY; the invite confirm and the verification gate are unchanged', () => {
    expect(DEMO_SALES_POLICY).toContain('CAPTURE TIMING IN THE STEP-OUT');
    expect(DEMO_SALES_POLICY).toContain("the close's ONE CAPTURE ASK is the only contact collection in the step-out");
    // The invite beat confirms an already-held address — it is not
    // a pre-value collection, and it stands exactly as written.
    expect(DEMO_INVITE_OPENING).toContain('We already hold the email address this invitation was sent to');
    expect(DEMO_INVITE_OPENING).toContain('none of this is a condition of seeing the demo, and never repeat the ask');
    // The verification act is an identity gate, not sales capture.
    expect(DEMO_VERIFICATION_ACT1).toContain('Host role: You are Aspen of AI Hidden Leads');
  });
});

describe('Publish #79 — (e) realtor discovery capture behavior is byte-identical', () => {
  it('the discovery layer keeps its step-2 list-reason ask, its close re-offer and its channel-completeness ask', () => {
    const layer = buildRealtorDiscoveryLayer({ agentName: 'Frank' });
    expect(layer).toContain('EARLY CAPTURE — WITH THE REASON, AND NEVER FORCED');
    expect(layer).toContain('so you can look through it at your leisure, and call us back any time');
    expect(layer).toContain('THE CAPTURE ASK IS NOT A PROMISE, AND THIS BAR DOES NOT TOUCH IT');
    expect(layer).toContain("what's the best mobile number for it?");
    // …and none of the sales gate's directives leak into it:
    expect(layer).not.toContain('CAPTURE TIMING — THE END-ASK');
    expect(layer).not.toContain('The visitor has shown interest, and the one capture ask');
  });

  it('the sales gate can never arm on a discovery session: its scope excludes simulations outright', () => {
    expect(proxySource).toContain("const salesGateSession = config.homepageSales === true && config.simulation !== true");
  });
});

describe('Publish #79 — wiring: the proxy arms the gate on homepage-sales sessions only, after the earlier gates', () => {
  it('imports the gate and declares its state from the recap and the durable store', () => {
    expect(proxySource).toContain("from '../_shared/sales-gate.ts'");
    expect(proxySource).toContain('if (salesGateSession) {');
    expect(proxySource).toContain('armSalesGateFromRecap(freshSalesGateState()');
  });

  it('the decision runs after the capture gate, the consent ask and the discovery gate, and stands down when they injected', () => {
    const captureAt = proxySource.indexOf('captureGateTurnDecision({');
    const consentAt = proxySource.indexOf('consentAskTurnDecision({');
    const discoveryAt = proxySource.indexOf('discoveryGateTurnDecision({');
    const salesAt = proxySource.indexOf('salesGateTurnDecision({');
    expect(captureAt).toBeGreaterThan(-1);
    expect(consentAt).toBeGreaterThan(captureAt);
    expect(discoveryAt).toBeGreaterThan(consentAt);
    expect(salesAt).toBeGreaterThan(discoveryAt);
    const salesBlock = proxySource.slice(salesAt, salesAt + 700);
    expect(salesBlock).toContain('gateInjected || consentInjected');
    // The capture gate's own call is untouched by the chain: its
    // blocked terms are exactly the pre-#79 set.
    const captureBlock = proxySource.slice(captureAt, captureAt + 400);
    expect(captureBlock).toContain('blocked: preview || farewellHandled || farewellTimer !== undefined || managerTransferRequested || pendingActions.size > 0,');
    expect(captureBlock).not.toContain('salesInjected');
  });

  it('Publish #81: the proxy picks the sterner end-ask variant from the ledger\'s repeat flag', () => {
    expect(proxySource).toContain('endAskDirective(salesGate.endAskRepeat)');
  });
});

describe('Publish #81 — detectors: the gate can now SEE the booking form, and judge the framing', () => {
  it('the booking form\'s name-led collection is a capture ask (verbatim from the #79 verification)', () => {
    expect(turnCollectsBookingContact(S2_BOOKING_COLLECTION_MODEL)).toBe(true);
    expect(turnAsksForContact(S2_BOOKING_COLLECTION_MODEL)).toBe(true);
    expect(turnAsksForContact('Could you spell your full name and give me your phone number to schedule?')).toBe(true);
    expect(turnAsksForContact('Please provide your email address so we can confirm.')).toBe(true);
  });

  it('the meeting-booking OFFER itself is not a capture ask — nothing is collected yet', () => {
    expect(turnAsksForContact(S2_BOOKING_OFFER_RUN1)).toBe(false);
    expect(turnAsksForContact(S2_BOOKING_OFFER_RERUN)).toBe(false);
    expect(classifyModelAsk(S2_BOOKING_OFFER_RUN1)).toBe('none');
    expect(classifyModelAsk(S2_BOOKING_OFFER_RERUN)).toBe('none');
  });

  it('classification: framed needs the send-offer, LEADING any collection in the same turn', () => {
    expect(turnMakesSendOffer(END_ASK_MODEL)).toBe(true);
    expect(turnMakesSendOffer(S2_BOOKING_OFFER_RERUN)).toBe(false);
    expect(classifyModelAsk(END_ASK_MODEL)).toBe('framed');
    expect(classifyModelAsk(S2_BOOKING_COLLECTION_MODEL)).toBe('booking');
    expect(classifyModelAsk("What's your email address?")).toBe('bare');
    expect(classifyModelAsk(SEND_THEN_BOOK_MODEL)).toBe('framed'); // the send-offer leads
    expect(classifyModelAsk(BOOK_THEN_SEND_MODEL)).toBe('booking'); // the collection leads — the offer did not
    expect(classifyModelAsk(QUALIFYING_MODEL)).toBe('none');
  });
});

describe('Publish #81 — the #79 verification failure (S2), replayed turn for turn', () => {
  it('run 1: the booking offer answers interest → the order fires; the slot-choice turn still draws the sterner repeat', () => {
    let s = freshSalesGateState();
    s = boundary(s, QUALIFYING_VISITOR, QUALIFYING_MODEL).state;
    let r = boundary(s, S2_INTEREST_VISITOR, S2_BOOKING_OFFER_RUN1);
    expect(r.state.interestSeen).toBe(true);
    expect(r.inject).toBe('end-ask');
    expect(r.state.endAskRepeat).toBe(false);
    expect(r.state.askDelivered).toBe(false);
    // Run 1's next model turn stayed in the booking path (slot
    // choice). Pre-#81 the order was stranded here — the only
    // re-order path required a close that never arrived.
    r = boundary(r.state, 'Email is best — go ahead.', S2_SLOT_CHOICE_MODEL);
    expect(r.inject).toBe('end-ask');
    expect(r.state.endAskRepeat).toBe(true);
    expect(r.state.endAskFires).toBe(2);
    expect(r.state.askDelivered).toBe(false);
  });

  it('rerun: the booking form collects while the end-ask stands owed → the sterner order fires on the spot; the ask is NOT spent', () => {
    let s = freshSalesGateState();
    s = boundary(s, S2_INTEREST_VISITOR, S2_BOOKING_OFFER_RERUN).state; // order fired at the interest boundary
    const r = boundary(s, 'Email is best — go ahead.', S2_BOOKING_COLLECTION_MODEL);
    expect(r.inject).toBe('end-ask');
    expect(r.state.endAskRepeat).toBe(true);
    expect(r.state.askDelivered).toBe(false);
    // Publish #84: compliance after the sterner order now runs
    // the scripted sequence — the offer standing alone, then
    // the visitor's yes, then the collection discharges it.
    const offered = boundary(r.state, 'Sure.', PURE_OFFER_MODEL);
    expect(offered.inject).toBeNull();
    expect(offered.state.offerOutstanding).toBe(true);
    const delivered = boundary(offered.state, ACCEPT_VISITOR, "Perfect — what's the best email address for that?");
    expect(delivered.inject).toBeNull();
    expect(delivered.state.askDelivered).toBe(true);
  });

  it('the collection in the SAME turn as interest lands draws the sterner order immediately', () => {
    const r = boundary(freshSalesGateState(), S2_INTEREST_VISITOR, S2_BOOKING_COLLECTION_MODEL);
    expect(r.inject).toBe('end-ask');
    expect(r.state.endAskRepeat).toBe(true);
    expect(r.state.askDelivered).toBe(false);
  });

  it('a bare ask on the interest turn does not spend the end-ask either — the framing is the ask', () => {
    const r = boundary(freshSalesGateState(), INTEREST_VISITOR, "Great — what's your email address?");
    expect(r.inject).toBe('end-ask');
    expect(r.state.endAskRepeat).toBe(true);
    expect(r.state.askDelivered).toBe(false);
  });

  // Publish #84 REWRITE (in place, justified): the setup's
  // END_ASK_MODEL is a bundled offer under fix 3a, so the
  // unimpeded booking collection now flows through the
  // visitor's ACCEPTANCE of that offer ("Yes — send it over")
  // rather than through a same-turn delivery. The pin's ruling
  // is unchanged and the outcome identical: once the offer
  // stands accepted, the booking form collects with no gate
  // interference at all.
  it('once the framed ask HAS been made and accepted, booking-form collection proceeds unimpeded', () => {
    let s = freshSalesGateState();
    s = boundary(s, INTEREST_VISITOR, END_ASK_MODEL).state; // the model's own (bundled) offer
    expect(s.offerBundled).toBe(true);
    expect(s.askDelivered).toBe(false);
    const r = boundary(s, "Yes — send it over, and let's book the meeting too.", S2_BOOKING_COLLECTION_MODEL);
    expect(r.inject).toBeNull();
    expect(r.state.askDelivered).toBe(true); // the accepted offer's collection discharges the end-ask
  });

  // Publish #84 REWRITE (in place, justified): pre-#84 an
  // offer-led same-turn pair "counted as made". Fix 3a's
  // bundled class is defined on the turn's CONTENTS — a
  // send-offer and a collection ask together, before any
  // acceptance — not on their order: leading with the offer
  // does not cure collecting in the same breath. The turn is
  // recorded as an outstanding bundled offer; acceptance plus
  // the ritual is what discharges the end-ask now.
  it('when the send-offer leads and the booking collection follows in the same turn, the turn is bundled — not made', () => {
    const r = boundary(freshSalesGateState(), INTEREST_VISITOR, SEND_THEN_BOOK_MODEL);
    expect(r.inject).toBeNull();
    expect(r.state.askDelivered).toBe(false);
    expect(r.state.offerOutstanding).toBe(true);
    expect(r.state.offerBundled).toBe(true);
    const delivered = boundary(r.state, ACCEPT_VISITOR, "Perfect — what's the best email address for that?");
    expect(delivered.inject).toBeNull();
    expect(delivered.state.askDelivered).toBe(true);
  });

  // Publish #84 REWRITE (in place, justified): the
  // collection-led pair drew the sterner end-ask order under
  // #81 because the trailing offer "did not count". The turn
  // DOES carry a send-offer, so under fix 3a it belongs to the
  // bundled class — its correction is the deferred clean
  // re-put, not the sterner order, which remains the answer
  // for collections with NO offer in the turn (the pins above).
  it('when the collection leads and the send-offer trails in the same turn, the bundled class answers — not the sterner order', () => {
    const r = boundary(freshSalesGateState(), INTEREST_VISITOR, BOOK_THEN_SEND_MODEL);
    expect(r.inject).toBeNull(); // no correction at the bundled turn's own boundary
    expect(r.state.askDelivered).toBe(false);
    expect(r.state.offerBundled).toBe(true);
    // The visitor ignores the bundled collection and answers
    // something else: the clean re-put is earned at that boundary.
    const reput = boundary(r.state, 'Tell me more about the dashboard first.', 'Sure — the dashboard shows every call, its summary and its transcript.');
    expect(reput.inject).toBe('bundled-offer');
    expect(reput.state.bundledCorrections).toBe(1);
  });
});

describe('Publish #81 — the full S3 sequence, exercised through the persisted-order machinery', () => {
  it('interest → gate order → framed ask made → decline → no repeat; a later booking collection earns the no-repeat order', () => {
    let s = freshSalesGateState();
    s = boundary(s, S2_INTEREST_VISITOR, S2_BOOKING_OFFER_RERUN).state; // the gate's order, fired over the booking offer
    expect(s.askFired).toBe(true);
    expect(s.askDelivered).toBe(false);
    // Publish #84: the ordered turn (END_ASK_MODEL) is a bundled
    // offer under fix 3a — the sequence's decline now lands on
    // the OFFER, and the offer-decline fold is what spends the
    // ask. The rest of the sequence is unchanged.
    s = boundary(s, 'Sure.', END_ASK_MODEL).state; // the offer, made at last — bundled
    expect(s.askDelivered).toBe(false);
    expect(s.offerBundled).toBe(true);
    let r = boundary(s, DECLINE_VISITOR, 'Of course — no problem at all.');
    expect(r.inject).toBeNull();
    expect(r.state.askDeclined).toBe(true);
    // After a decline, not even the booking form may collect.
    r = boundary(r.state, 'What about the video avatar part?', S2_BOOKING_COLLECTION_MODEL);
    expect(r.inject).toBe('no-repeat');
    // And no fresh interest signal resurrects an order.
    const again = boundary(r.state, 'Actually that sounds good, how do I get started?', 'Great — let me walk you through it.');
    expect(again.inject).toBeNull();
  });

  it('interest → the model\'s own framed ask → decline → the question stays closed', () => {
    let s = freshSalesGateState();
    s = boundary(s, INTEREST_VISITOR, END_ASK_MODEL).state;
    s = boundary(s, DECLINE_VISITOR, 'No problem at all — happy to keep going without it.').state;
    expect(s.askDeclined).toBe(true);
    const r = boundary(s, 'Tell me more about the dashboard.', "Sure — and what's your email so I can send that over?");
    expect(r.inject).toBe('no-repeat');
  });
});

// ---------------------------------------------------------------------------
// Publish #84 — the end-ask made reliable and complete. Fixtures
// are VERBATIM from publish83-verification-2026-11-15.md (the
// interest-path sessions, all on the exact S2 interest turn).
// ---------------------------------------------------------------------------

const S2_83_INTEREST_VISITOR = S2_INTEREST_VISITOR;
// The failing S2 run's interest answer: pricing + setup + a
// video note — NO send-offer, no share angle, no meeting offer.
const S2_83_NO_OFFER_ANSWER = 'Premium is ninety-nine dollars a month, covering four hundred browser voice minutes. Most businesses are live the same day, and you can set it up yourself in fifteen to thirty minutes with Alex, our onboarding engineer, or we can do it with you on a call. Plus, I answer with a natural voice, and on your website I can appear on live video as your spokesperson.';
// S3 run 1's interest answer: the send-offer FIRED, in the
// scripted step-6 framing — but pure (no destination ask) and
// WITHOUT the share angle.
const S3_83_OFFER_RUN1 = 'Most businesses are live the same day — you can set it up yourself in 15 to 30 minutes with Alex, our onboarding engineer, or we do it with you on a call. Premium is $99 a month, which includes 400 voice minutes and up to 50 B2B prospects. Before we talk calls and setup, let me send you something useful, like the link to this demo or a recap of our conversation.';
// S3 rerun's interest answer: the send-offer fired WITH its
// collection bundled into the same turn, again angle-less.
const S3_83_OFFER_RERUN = "Premium is $99 a month, which includes 400 browser voice minutes. The live video avatar is free for the first month, and setup fees are currently waived. Most businesses are live the same day — you can set it up together with Alex, our onboarding engineer. Before we continue, let me send you the link to this demo or a recap. What's the best mobile number for that?";
const S3_83_DECLINE = "No thanks, I don't want anything sent.";
const ANGLE_LINE_MODEL = "…and feel free to pass it along to your manager, a colleague, or the owner, if they'd want a look.";
const SHORT_OFFER_NO_ANGLE_MODEL = 'Let me send you the link to this demo or a recap of our conversation.';
const ANSWER_WITH_OFFER_MODEL = `Premium is ninety-nine dollars a month, covering four hundred browser voice minutes. Most businesses are live the same day, and you can set it up yourself in fifteen to thirty minutes with Alex, our onboarding engineer. ${PURE_OFFER_MODEL}`;

/** One pre-answer decision, exactly as the proxy runs it on the
 * text transport when a visitor utterance arrives. */
const preAnswer = (
  state: SalesGateState,
  visitorUtterance: string,
  opts: { blocked?: boolean; contact?: { email?: string | null; phone?: string | null } | null } = {},
) => salesGatePreAnswerDecision({
  state,
  contact: opts.contact ?? null,
  visitorUtterance,
  blocked: opts.blocked ?? false,
});

describe('Publish #84 — detectors: the share angle, acceptance, and the step-6 phrasing family', () => {
  it('the gate can now SEE the verbatim run-1 offer — and sees that it has no angle', () => {
    expect(turnMakesSendOffer(S3_83_OFFER_RUN1)).toBe(true);
    expect(turnHasShareAngle(S3_83_OFFER_RUN1)).toBe(false);
    expect(turnAsksForContact(S3_83_OFFER_RUN1)).toBe(false); // a pure offer collects nothing
  });

  it('the share angle is present exactly where the framing carries it', () => {
    expect(turnHasShareAngle(PURE_OFFER_MODEL)).toBe(true);
    expect(turnHasShareAngle(END_ASK_MODEL)).toBe(true);
    expect(turnHasShareAngle(S3_83_OFFER_RERUN)).toBe(false);
    expect(turnHasShareAngle(SHORT_OFFER_NO_ANGLE_MODEL)).toBe(false);
  });

  it('a plain send confirmation is not a send-offer (the new pattern does not over-match)', () => {
    expect(turnMakesSendOffer('We will send you a confirmation once it is booked.')).toBe(false);
    expect(turnMakesSendOffer('Your invoice will be emailed to you each month.')).toBe(false);
  });

  it('acceptance is the yes that follows an offer — never a decline, never a subject change', () => {
    expect(detectOfferAcceptance(ACCEPT_VISITOR)).toBe(true);
    expect(detectOfferAcceptance("Yes — send it over, and let's book the meeting too.")).toBe(true);
    expect(detectOfferAcceptance('Sure.')).toBe(true);
    expect(detectOfferAcceptance(DECLINE_VISITOR)).toBe(false);
    expect(detectOfferAcceptance(S3_83_DECLINE)).toBe(false);
    expect(detectOfferAcceptance('Let me think about it.')).toBe(false);
    expect(detectOfferAcceptance('What about the video avatar part?')).toBe(false);
  });
});

describe('Publish #84 — fix 1: the pre-arm rides the interest turn itself', () => {
  it('a fresh interest signal pre-arms the order onto its own exchange', () => {
    const r = preAnswer(freshSalesGateState(), S2_83_INTEREST_VISITOR);
    expect(r.inject).toBe('end-ask-prearm');
    expect(r.state.interestSeen).toBe(true);
    expect(r.state.askFired).toBe(true);
    expect(r.state.awaitingDelivery).toBe(true);
    expect(r.state.endAskFires).toBe(1);
    expect(r.state.endAskRepeat).toBe(false); // the standard fire, one exchange earlier
    // And the shaped answer — price in full, finishing with the
    // offer standing alone — lands the offer as outstanding,
    // with NO further order on top of it.
    const answered = boundary(r.state, S2_83_INTEREST_VISITOR, ANSWER_WITH_OFFER_MODEL);
    expect(answered.inject).toBeNull();
    expect(answered.state.offerOutstanding).toBe(true);
    expect(answered.state.askDelivered).toBe(false);
    // Acceptance, then the collection: the sequence completes.
    const delivered = boundary(answered.state, ACCEPT_VISITOR, "Perfect — what's the best email address for that?");
    expect(delivered.inject).toBeNull();
    expect(delivered.state.askDelivered).toBe(true);
  });

  it('when the shaped answer still carries no offer, the post-turn persistence is the second chance', () => {
    const armed = preAnswer(freshSalesGateState(), S2_83_INTEREST_VISITOR).state;
    const r = boundary(armed, S2_83_INTEREST_VISITOR, S2_83_NO_OFFER_ANSWER);
    expect(r.inject).toBe('end-ask');
    expect(r.state.endAskRepeat).toBe(true); // the sterner repeat — the pre-arm was fire 1
    expect(r.state.endAskFires).toBe(2);
    expect(r.state.askDelivered).toBe(false);
  });

  it('no pre-arm without a FRESH interest signal — qualification and continuations never arm it', () => {
    expect(preAnswer(freshSalesGateState(), QUALIFYING_VISITOR).inject).toBeNull();
    expect(preAnswer(freshSalesGateState(), 'Usually they just leave a voicemail.').inject).toBeNull();
    // A second interest utterance inside an episode already
    // being worked is not a fresh signal either.
    const armed = preAnswer(freshSalesGateState(), S2_83_INTEREST_VISITOR).state;
    const again = preAnswer(armed, 'And how do I get started?');
    expect(again.inject).toBeNull();
    expect(again.state.endAskFires).toBe(1); // unchanged — no second order stacked
  });

  it('no pre-arm when the end-ask is not owed: held contact, a declined ask, an offer already outstanding', () => {
    const held = preAnswer(freshSalesGateState(), S2_83_INTEREST_VISITOR, { contact: { email: 'tony@example.com', phone: '' } });
    expect(held.inject).toBeNull();
    expect(held.state.contactHeld).toBe(true);
    const declined = preAnswer({ ...freshSalesGateState(), askDeclined: true }, S2_83_INTEREST_VISITOR);
    expect(declined.inject).toBeNull();
    const outstanding = preAnswer({ ...freshSalesGateState(), offerOutstanding: true }, S2_83_INTEREST_VISITOR);
    expect(outstanding.inject).toBeNull();
    const dictated = preAnswer(freshSalesGateState(), 'How much does it cost? My email is tony dot test at example dot com.');
    expect(dictated.inject).toBeNull();
    expect(dictated.state.volunteered).toBe(true);
  });

  it('a blocked pre-arm still folds — the turn-boundary decision judges the debt fresh', () => {
    const r = preAnswer(freshSalesGateState(), S2_83_INTEREST_VISITOR, { blocked: true });
    expect(r.inject).toBeNull();
    expect(r.state.interestSeen).toBe(true);
    expect(r.state.endAskFires).toBe(0);
    const judged = boundary(r.state, S2_83_INTEREST_VISITOR, PRICE_ANSWER_MODEL);
    expect(judged.inject).toBe('end-ask');
    expect(judged.state.endAskFires).toBe(1);
  });

  it('the pre-arm spends from the same episode budget — and a fresh signal after the episode re-arms it', () => {
    let s = preAnswer(freshSalesGateState(), S2_83_INTEREST_VISITOR).state; // fire 1 (pre-arm)
    s = boundary(s, S2_83_INTEREST_VISITOR, S2_83_NO_OFFER_ANSWER).state; // fire 2 (sterner repeat)
    expect(s.endAskFires).toBe(2);
    const spent = boundary(s, 'Okay.', 'Anything else I can do?');
    expect(spent.inject).toBeNull(); // episode spent
    const rearmed = preAnswer(spent.state, 'Actually — what are the next steps?');
    expect(rearmed.inject).toBe('end-ask-prearm');
    expect(rearmed.state.endAskFires).toBe(1);
    expect(rearmed.state.endAskTotalFires).toBe(3);
  });

  it('the pre-arm directive orders the answer itself: full answer first, the offer as its finishing beat, no ask yet', () => {
    const d = endAskPreArmDirective();
    expect(d).toContain('Answer their question IN FULL first');
    expect(d).toContain('finishing beat of THIS SAME answer');
    expect(d).toContain('pass to their manager, a colleague, or the owner');
    expect(d).toContain('do NOT ask for their email address or mobile number yet');
    expect(d).toContain('NEVER ask again in this session');
  });

  it('wiring: the proxy runs the pre-answer decision in the text branch and sends directive + text as one clientContent', () => {
    expect(proxySource).toContain('salesGatePreAnswerDecision({');
    expect(proxySource).toContain("preArm.inject === 'end-ask-prearm'");
    expect(proxySource).toContain('endAskPreArmDirective()');
    expect(proxySource).toContain('if (!preArmed) geminiWs.send(JSON.stringify({ realtimeInput: { text: msg.text } }))');
  });
});

describe('Publish #84 — fix 2: the share-angle completion beat', () => {
  it('the verbatim run-1 offer earns the completion at its own boundary — then the decline closes it', () => {
    const r = boundary(freshSalesGateState(), S2_83_INTEREST_VISITOR, S3_83_OFFER_RUN1);
    expect(r.inject).toBe('share-angle');
    expect(r.state.offerOutstanding).toBe(true);
    expect(r.state.offerAngleMissing).toBe(true);
    expect(r.state.angleCompletionFires).toBe(1);
    expect(r.state.askDelivered).toBe(false);
    // The completion turn itself: the angle line lands, the
    // offer still stands, nothing further is ordered.
    const completed = boundary(r.state, '', ANGLE_LINE_MODEL);
    expect(completed.inject).toBeNull();
    expect(completed.state.offerOutstanding).toBe(true);
    // The decline (the #83 S3 wording) spends the ask for good.
    const declined = boundary(completed.state, S3_83_DECLINE, 'I completely understand.');
    expect(declined.inject).toBeNull();
    expect(declined.state.askDeclined).toBe(true);
    expect(declined.state.offerOutstanding).toBe(false);
  });

  it('no completion when the offer carries the angle — the offer simply stands', () => {
    const r = boundary(freshSalesGateState(), INTEREST_VISITOR, PURE_OFFER_MODEL);
    expect(r.inject).toBeNull();
    expect(r.state.offerOutstanding).toBe(true);
    expect(r.state.offerAngleMissing).toBe(false);
    expect(r.state.angleCompletionFires).toBe(0);
  });

  it('the completion stands down once the visitor responds to the offer', () => {
    // The offer observed at a BLOCKED boundary: folded and
    // observed, but the completion could not fire there.
    const observed = boundary(freshSalesGateState(), S2_83_INTEREST_VISITOR, S3_83_OFFER_RUN1, { blocked: true });
    expect(observed.inject).toBeNull();
    expect(observed.state.offerOutstanding).toBe(true);
    expect(observed.state.angleCompletionFires).toBe(0);
    // The visitor answers something else — the offer is
    // resolved, and the completion must NOT fire after the fact.
    const answered = boundary(observed.state, 'Tell me more about the dashboard first.', 'Sure — the dashboard shows every call, its summary and its transcript.');
    expect(answered.inject).not.toBe('share-angle');
    expect(answered.state.offerOutstanding).toBe(false);
    expect(answered.state.angleCompletionFires).toBe(0);
  });

  it('cap: one completion per offer episode — a re-offer inside the same episode earns no second one', () => {
    let s = boundary(freshSalesGateState(), S2_83_INTEREST_VISITOR, S3_83_OFFER_RUN1).state; // completion fired
    expect(s.angleCompletionFires).toBe(1);
    const reoffer = boundary(s, '', SHORT_OFFER_NO_ANGLE_MODEL); // still the same outstanding episode
    expect(reoffer.inject).toBeNull();
    expect(reoffer.state.angleCompletionFires).toBe(1);
    // A NEW episode (a fresh offer after the previous resolved)
    // resets the cap: hand-built settled state, one fresh offer.
    const fresh = boundary(
      { ...freshSalesGateState(), interestSeen: true, angleCompletionFires: 1 },
      '',
      SHORT_OFFER_NO_ANGLE_MODEL,
    );
    expect(fresh.inject).toBe('share-angle');
    expect(fresh.state.angleCompletionFires).toBe(1);
  });

  it('the completion directive is a follow-up beat — not a correction, not a repeat, not a collection', () => {
    const d = shareAngleCompletionDirective();
    expect(d).toContain('missing the share angle');
    expect(d).toContain('pass to their manager, a colleague, or the owner');
    expect(d).toContain('Before anything else in your next turn');
    expect(d).toContain('Do NOT repeat the offer itself');
    expect(d).toContain('ask for an email address or a mobile number');
  });
});

describe('Publish #84 — fix 3a: the bundled offer is its own violation class', () => {
  it('the verbatim S3 rerun turn is bundled: recorded, unspent, and uncorrected at its own boundary', () => {
    const r = boundary(freshSalesGateState(), S2_83_INTEREST_VISITOR, S3_83_OFFER_RERUN);
    expect(r.inject).toBeNull();
    expect(r.state.offerOutstanding).toBe(true);
    expect(r.state.offerBundled).toBe(true);
    expect(r.state.offerAngleMissing).toBe(true);
    expect(r.state.askDelivered).toBe(false);
  });

  it('a visitor who answers the bundled collection anyway has accepted — the ritual proceeds untouched', () => {
    let s = boundary(freshSalesGateState(), S2_83_INTEREST_VISITOR, S3_83_OFFER_RERUN).state;
    const r = boundary(s, 'My mobile is 954 555 0142.', 'Let me read that back: 9 5 4, 5 5 5, 0 1 4 2. Did I get that right?');
    expect(r.inject).toBeNull(); // no scolding, no walk-back, no correction of any kind
    expect(r.state.volunteered).toBe(true); // the #68/#74 ritual owns it from here
    expect(r.state.offerOutstanding).toBe(false);
    expect(r.state.bundledCorrections).toBe(0);
  });

  it('a verbal yes to a bundled offer makes the collection that follows legitimate', () => {
    let s = boundary(freshSalesGateState(), S2_83_INTEREST_VISITOR, S3_83_OFFER_RERUN).state;
    const r = boundary(s, 'Yes, go ahead.', "Perfect — what's the best mobile number for that?");
    expect(r.inject).toBeNull();
    expect(r.state.askDelivered).toBe(true);
    expect(r.state.offerAccepted).toBe(false); // consumed by the delivery
  });

  it('a visitor who ignores the bundled collection and answers something else earns the clean re-put', () => {
    let s = boundary(freshSalesGateState(), S2_83_INTEREST_VISITOR, S3_83_OFFER_RERUN).state;
    const r = boundary(s, 'What about the video avatar — how does that work?', 'The avatar appears right on your website, lip-synced to my voice, while I answer.');
    expect(r.inject).toBe('bundled-offer');
    expect(r.state.bundledCorrections).toBe(1);
    expect(r.state.bundledAngleMissing).toBe(true); // the re-put must carry the angle this offer dropped
    expect(r.state.offerBundled).toBe(false);
    // And the re-put itself, when it lands clean, stands as the
    // outstanding offer with nothing further owed.
    const reput = boundary(r.state, '', PURE_OFFER_MODEL);
    expect(reput.inject).toBeNull();
    expect(reput.state.offerOutstanding).toBe(true);
    expect(reput.state.offerBundled).toBe(false);
  });

  it('a speechless boundary earns the re-put too — the correction is not hostage to the visitor speaking', () => {
    let s = boundary(freshSalesGateState(), S2_83_INTEREST_VISITOR, S3_83_OFFER_RERUN).state;
    const r = boundary(s, '', "I'm still here whenever you're ready.");
    expect(r.inject).toBe('bundled-offer');
    expect(r.state.bundledAngleMissing).toBe(true);
    expect(r.state.offerOutstanding).toBe(true); // the offer stands — the re-put renews it
  });

  it('a bundled shape during qualification is still an early ask — the class needs interest behind it', () => {
    const r = boundary(freshSalesGateState(), QUALIFYING_VISITOR, "While that loads — I can send you the demo link. What's your email address?");
    expect(r.inject).toBe('early-ask');
    expect(r.state.offerBundled).toBe(false);
  });

  it('the re-put directive orders the offer to stand alone, and pre-answers the dictation continuation', () => {
    const withAngle = bundledOfferDirective(true);
    expect(withAngle).toContain('The offer must stand alone');
    expect(withAngle).toContain('dropped the share angle');
    expect(withAngle).toContain('pass to their manager, a colleague, or the owner');
    expect(withAngle).toContain('that is a yes');
    expect(withAngle).toContain('no apology and no walk-back');
    const withoutAngle = bundledOfferDirective(false);
    expect(withoutAngle).toContain('Re-put it with its full framing');
    expect(withoutAngle).not.toContain('dropped the share angle');
  });

  it('wiring: the proxy speaks the completion and the re-put from the gate\'s own state', () => {
    expect(proxySource).toContain("salesDecision.inject === 'share-angle'");
    expect(proxySource).toContain('shareAngleCompletionDirective()');
    expect(proxySource).toContain("salesDecision.inject === 'bundled-offer'");
    expect(proxySource).toContain('bundledOfferDirective(salesGate.bundledAngleMissing)');
  });
});

describe('Publish #84 — fix 3b: the silence ladder holds on an outstanding offer', () => {
  it('every rung references the offer and forbids the pivot — no stat, no price, no meeting', () => {
    for (const stage of ['checkin', 'bridge', 'continue', 'goodbye']) {
      const text = salesSilenceHoldText(stage);
      expect(text).toContain('send-offer');
      expect(text).not.toContain('85%');
      expect(text).not.toContain('introductory meeting');
      expect(text.toLowerCase()).toContain('meeting');
      expect(text).toMatch(/do not|do NOT/);
    }
    expect(salesSilenceHoldText('checkin')).toContain('still unanswered');
    expect(salesSilenceHoldText('goodbye')).toContain('never answered');
  });

  it('wiring: the proxy composes the hold at the idle_prompt point whenever the gate holds an outstanding offer', () => {
    expect(proxySource).toContain('salesGateSession && salesGate.offerOutstanding');
    expect(proxySource).toContain('salesSilenceHoldText(msg.stage)');
    // The ladder's own texts remain the default for every other state.
    expect(proxySource).toContain(': ladderText;');
  });
});
