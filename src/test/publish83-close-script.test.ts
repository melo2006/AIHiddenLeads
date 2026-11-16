// @vitest-environment node
// Publish #83 — the sales close is RE-SCRIPTED at the prompt layer
// (2026-11-15).
//
// Why: two consecutive directive-injection rounds failed live on
// the same behavior. #79's sales gate ordered the framed send-offer
// (demo link / copy of this conversation / follow-up, with the
// manager-colleague-owner share angle) after interest; #81 made the
// order persist and taught the gate to see booking-form collection.
// Both verifications (publish79-verification-2026-11-15.md,
// publish81-verification-2026-11-15.md) show the same outcome: the
// interest turn is answered with pricing + setup, and the next
// model speech is either the meeting-booking offer or booking-form
// collection ("Before I can send that, may I have your first and
// last name, along with your email address?") — the framed
// send-offer is NEVER spoken. The post-interest listen windows are
// silent, so the next model speech after interest IS the scripted
// close — and the scripted close said BOOKING: the sales arc ran
// 5) PRICE → 6) THE CLOSE ("Let's book you a proper setup
// conversation…"), the booking policy invited interested visitors
// straight to a meeting, and the send-offer existed only as an
// unnumbered constraint paragraph the numbered arc outranked.
//
// #83 changes strategy: the gate stays as backstop, untouched; the
// CLOSE SCRIPT ITSELF is re-sequenced so the composed sales layer
// tells Aspen the send-offer is the next beat after interest —
// before any meeting offer and before any collection. These tests
// pin that re-sequencing at the composition level. Each assertion
// is written against the failure shape: on the pre-#83 composition
// every one of them fails for the same reason the live checks did.
import { describe, expect, it } from 'vitest';
import {
  HOMEPAGE_SALES_LAYER,
  HOMEPAGE_SALES_PROMPT,
} from '../../supabase/functions/_shared/homepage-knowledge';
import { DEMO_SALES_POLICY } from '../../supabase/functions/_shared/demo-sales';
import { platformBookingInstruction } from '../../supabase/functions/_shared/phone-demo';

const SHARE_ANGLE = 'pass to their manager, a colleague, or the owner';

describe('Publish #83 — (a) the arc itself sequences send-offer before meeting before collection', () => {
  it('the send-offer is a numbered arc beat (step 6) and the meeting follows it (step 7)', () => {
    expect(HOMEPAGE_SALES_LAYER).toContain('6) THE SEND-OFFER — THE CLOSE\'S FIRST MOVE');
    expect(HOMEPAGE_SALES_LAYER).toContain('7) THE MEETING (only once the send-offer has been made');
    const sendAt = HOMEPAGE_SALES_LAYER.indexOf('6) THE SEND-OFFER');
    const meetingAt = HOMEPAGE_SALES_LAYER.indexOf('7) THE MEETING');
    const bookingLineAt = HOMEPAGE_SALES_LAYER.indexOf("Let's book you a proper setup conversation");
    expect(sendAt).toBeGreaterThan(-1);
    expect(meetingAt).toBeGreaterThan(sendAt);
    // The approved booking line survives — inside the meeting beat,
    // after the send-offer beat, never as the close's first move.
    expect(bookingLineAt).toBeGreaterThan(meetingAt);
  });

  it('the old booking-first close step is gone — no step makes the meeting the close\'s first move', () => {
    expect(HOMEPAGE_SALES_LAYER).not.toContain('6) THE CLOSE:');
    expect(HOMEPAGE_SALES_LAYER).not.toContain('6) THE CLOSE —');
  });

  it('the send-offer beat states its own precedence: before any meeting offer and before any collection', () => {
    const beat = HOMEPAGE_SALES_LAYER.slice(
      HOMEPAGE_SALES_LAYER.indexOf('6) THE SEND-OFFER'),
      HOMEPAGE_SALES_LAYER.indexOf('7) THE MEETING'),
    );
    expect(beat).toContain('BEFORE any meeting offer and BEFORE any collection of any kind');
    expect(beat).toContain('the link to this demo so you can replay it, a copy of this conversation, or a follow-up from the team');
  });

  it('the CAPTURE TIMING rule now states the scripted order and bars booking wording from outranking it', () => {
    expect(HOMEPAGE_SALES_LAYER).toContain('THE ORDER IS SCRIPTED, NOT OPTIONAL');
    expect(HOMEPAGE_SALES_LAYER).toContain('the send-offer is step 6 of the arc above — the first beat after interest — and the meeting is step 7');
    expect(HOMEPAGE_SALES_LAYER).toContain('the only way past the send-offer without making it is the visitor waiving it by asking to be booked in');
  });
});

describe('Publish #83 — (b) the share-angle framing lives inside the sequenced beats, not only in the rule paragraph', () => {
  it('the arc\'s send-offer beat carries the manager-colleague-owner share angle', () => {
    const beat = HOMEPAGE_SALES_LAYER.slice(
      HOMEPAGE_SALES_LAYER.indexOf('6) THE SEND-OFFER'),
      HOMEPAGE_SALES_LAYER.indexOf('7) THE MEETING'),
    );
    // Inside the beat the line is quoted as speech TO the visitor,
    // so the angle reads "your manager"; the rule paragraph carries
    // Ron's canonical third-person framing (pinned in (a) via the
    // layer-wide tests in sales-gate.test.ts).
    expect(beat).toContain('pass to your manager, a colleague, or the owner');
  });

  it('the knowledge prompt\'s SALES APPROACH and CLOSING both run send-offer first, with the share angle', () => {
    expect(HOMEPAGE_SALES_PROMPT).toContain('the FIRST next step is always the send-offer from the sales layer');
    expect(HOMEPAGE_SALES_PROMPT).toContain('The close runs in the sales layer\'s order: the send-offer first');
    const closingAt = HOMEPAGE_SALES_PROMPT.indexOf('CLOSING:');
    expect(HOMEPAGE_SALES_PROMPT.slice(closingAt, closingAt + 700)).toContain(SHARE_ANGLE);
  });

  it('the demo bridge step-back leads with the send-offer, share angle included', () => {
    const stepBackAt = HOMEPAGE_SALES_PROMPT.indexOf('6) STEP BACK');
    const stepBack = HOMEPAGE_SALES_PROMPT.slice(stepBackAt);
    expect(stepBack).toContain('the END-ASK: offer to send them the demo link and a copy of this conversation');
    expect(stepBack).toContain(SHARE_ANGLE);
    expect(stepBack).toContain('the step-back\'s FIRST next step');
  });
});

describe('Publish #83 — (c) the held-contact send-offer is scripted as compliant and desirable', () => {
  it('the arc\'s send-offer beat scripts the offer TO an already-held detail', () => {
    const beat = HOMEPAGE_SALES_LAYER.slice(
      HOMEPAGE_SALES_LAYER.indexOf('6) THE SEND-OFFER'),
      HOMEPAGE_SALES_LAYER.indexOf('7) THE MEETING'),
    );
    expect(beat).toContain('If you already HOLD their email or number from earlier in this conversation, make the same offer TO that detail');
    expect(beat).toContain('an offer to send to a detail you already hold collects nothing, asks for nothing, and is exactly the right close move');
    expect(beat).toContain('asking again for a detail you already hold is the one thing never to do');
  });

  it('the CAPTURE TIMING rule states the held-detail case explicitly, so layer and gate stand-down agree', () => {
    expect(HOMEPAGE_SALES_LAYER).toContain('THE HELD-DETAIL CASE: when you already hold the visitor\'s email or number, the end-ask is the offer to send TO that detail');
    expect(HOMEPAGE_SALES_LAYER).toContain('it collects nothing, it is not a second capture ask, and it is the right move at the close');
    expect(HOMEPAGE_SALES_LAYER).toContain('never re-ask for a detail already held');
  });
});

describe('Publish #83 — (d) no surviving instruction makes collection-for-scheduling the first move after interest', () => {
  it('the old SALES APPROACH (interest → checkout/booked call, no send-offer) is gone', () => {
    expect(HOMEPAGE_SALES_PROMPT).not.toContain('When interest appears, invite them to start the Premium plan now through secure checkout');
    expect(HOMEPAGE_SALES_PROMPT).not.toContain('offer the free website demo or a booked call. One clear next step');
  });

  it('the demo bridge no longer offers the setup walkthrough as an alternative INSTEAD of the send-offer', () => {
    expect(HOMEPAGE_SALES_PROMPT).not.toContain('then offer exactly one next step — walk through what setting her up for their business would look like, or the END-ASK');
    const stepBackAt = HOMEPAGE_SALES_PROMPT.indexOf('6) STEP BACK');
    const stepBack = HOMEPAGE_SALES_PROMPT.slice(stepBackAt);
    expect(stepBack).toContain('the setup walkthrough never replaces the send offer and never goes first');
  });

  it('the platform booking policy\'s meeting invite is conditioned on the send-offer having been made', () => {
    const text = platformBookingInstruction(true, false);
    const conditionAt = text.indexOf('only once the sales conversation\'s framed send-offer has been made');
    const inviteAt = text.indexOf('Would you have 15 to 20 minutes for a quick introductory meeting');
    expect(conditionAt).toBeGreaterThan(-1);
    expect(inviteAt).toBeGreaterThan(conditionAt);
    expect(text).toContain('the send-offer goes first and this invitation follows it');
  });

  it('the step-out policy names its capture ask as the summary SEND offer, sequenced before scheduling collection', () => {
    expect(DEMO_SALES_POLICY).toContain('That ask IS the close sequence\'s summary offer — a SEND offer');
    expect(DEMO_SALES_POLICY).toContain('never a bare collection to schedule a call');
    expect(DEMO_SALES_POLICY).toContain('the meeting offer and any collection for scheduling come only after it');
  });
});

describe('Publish #83 — the meeting\'s own collection is framed as scheduling, and the waiver is scripted', () => {
  it('the meeting beat collects inside the scheduling frame, never as a bare form demand', () => {
    const meeting = HOMEPAGE_SALES_LAYER.slice(HOMEPAGE_SALES_LAYER.indexOf('7) THE MEETING'));
    expect(meeting).toContain('collect them INSIDE the scheduling frame');
    expect(meeting).toContain('"Where should I send the invite? I\'ll send the demo link there too"');
    expect(meeting).toContain('never as a bare form demand for a first and last name and an email address');
  });

  it('the booking policy carries the same scheduling frame for its collection', () => {
    const text = platformBookingInstruction(true, false);
    expect(text).toContain('"Where should I send the invite? I\'ll send the demo link there too"');
    expect(text).toContain('never as a bare form demand for a first and last name and an email address, and never before the send-offer has run its course');
  });

  it('"just book me in" is scripted as the visitor waiving the send-offer — allowed, and the offer is not forced', () => {
    const beat = HOMEPAGE_SALES_LAYER.slice(
      HOMEPAGE_SALES_LAYER.indexOf('6) THE SEND-OFFER'),
      HOMEPAGE_SALES_LAYER.indexOf('7) THE MEETING'),
    );
    expect(beat).toContain('they have waived the send-offer: skip it without a murmur and go straight to step 7');
    const text = platformBookingInstruction(true, false);
    expect(text).toContain('the visitor who asks to be booked in themselves has waived the offer');
  });

  it('an accepted send-offer collects through the existing capture ritual — the sequence wires to it, unchanged', () => {
    const beat = HOMEPAGE_SALES_LAYER.slice(
      HOMEPAGE_SALES_LAYER.indexOf('6) THE SEND-OFFER'),
      HOMEPAGE_SALES_LAYER.indexOf('7) THE MEETING'),
    );
    expect(beat).toContain('collect the detail it should go to through the capture ritual — read it back, spell the email, confirm the number, ask the texting permission');
  });
});
