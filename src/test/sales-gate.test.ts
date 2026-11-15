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
  classifyModelAsk,
  detectAskDecline,
  detectCloseSignal,
  detectInterestSignal,
  earlyAskDirective,
  endAskDirective,
  freshSalesGateState,
  noRepeatDirective,
  salesGateTurnDecision,
  turnAsksForContact,
  turnBeginsClose,
  turnCollectsBookingContact,
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
    // The ordered delivery on the next turn is compliance, not a repeat.
    const delivered = boundary(r.state, 'Sure.', END_ASK_MODEL);
    expect(delivered.inject).toBeNull();
    expect(delivered.state.askDelivered).toBe(true);
  });

  it('when the model makes the end-ask itself on interest, the gate spends it silently', () => {
    const r = boundary(freshSalesGateState(), INTEREST_VISITOR, END_ASK_MODEL);
    expect(r.inject).toBeNull();
    expect(r.state.askFired).toBe(true);
    expect(r.state.askDelivered).toBe(true);
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
    s = boundary(s, INTEREST_VISITOR, END_ASK_MODEL).state; // model asked on interest
    expect(s.askFired).toBe(true);
    let r = boundary(s, DECLINE_VISITOR, 'No problem at all — happy to keep going without it.');
    expect(r.inject).toBeNull();
    expect(r.state.askDeclined).toBe(true);
    s = r.state;
    r = boundary(s, 'What about the video avatar part?', "Sure — and quickly, what's your email so I can send that over?");
    expect(r.inject).toBe('no-repeat');
    expect(noRepeatDirective(false)).toContain('already been made');
    // Even a fresh interest signal cannot resurrect the ask.
    const again = boundary(r.state, 'Actually that sounds good, how do I get started?', 'Great — let me walk you through it.');
    expect(again.inject).toBeNull();
  });

  it('a repeat ask with no explicit decline is still nagging and earns the same order', () => {
    let s = freshSalesGateState();
    s = boundary(s, INTEREST_VISITOR, PRICE_ANSWER_MODEL).state; // gate ordered the end-ask
    s = boundary(s, 'Sure.', END_ASK_MODEL).state; // delivered
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
    // Compliance after the sterner order discharges the debt.
    const delivered = boundary(r.state, 'Sure.', END_ASK_MODEL);
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

  it('once the framed ask HAS been made, booking-form collection proceeds unimpeded', () => {
    let s = freshSalesGateState();
    s = boundary(s, INTEREST_VISITOR, END_ASK_MODEL).state; // the model's own framed ask
    expect(s.askDelivered).toBe(true);
    const r = boundary(s, "Yes — send it over, and let's book the meeting too.", S2_BOOKING_COLLECTION_MODEL);
    expect(r.inject).toBeNull();
  });

  it('when the send-offer leads and the booking collection follows in the same turn, the ask counts as made', () => {
    const r = boundary(freshSalesGateState(), INTEREST_VISITOR, SEND_THEN_BOOK_MODEL);
    expect(r.inject).toBeNull();
    expect(r.state.askDelivered).toBe(true);
  });

  it('when the collection leads and the send-offer trails in the same turn, the sterner order answers', () => {
    const r = boundary(freshSalesGateState(), INTEREST_VISITOR, BOOK_THEN_SEND_MODEL);
    expect(r.inject).toBe('end-ask');
    expect(r.state.endAskRepeat).toBe(true);
    expect(r.state.askDelivered).toBe(false);
  });
});

describe('Publish #81 — the full S3 sequence, exercised through the persisted-order machinery', () => {
  it('interest → gate order → framed ask made → decline → no repeat; a later booking collection earns the no-repeat order', () => {
    let s = freshSalesGateState();
    s = boundary(s, S2_INTEREST_VISITOR, S2_BOOKING_OFFER_RERUN).state; // the gate's order, fired over the booking offer
    expect(s.askFired).toBe(true);
    expect(s.askDelivered).toBe(false);
    s = boundary(s, 'Sure.', END_ASK_MODEL).state; // the ask, made at last
    expect(s.askDelivered).toBe(true);
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
