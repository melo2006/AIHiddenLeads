// @vitest-environment node
/**
 * Demo close + lead capture (2026-11-14, Ron's live Frank-demo review).
 *
 * Ron's Frank call handled listings and stepped out politely, but never
 * tried to CLOSE or CAPTURE: no early name ask, no name/email/phone
 * capture, no start-now offer, no summary-email offer. This batch adds,
 * in the shared conversation-script layer only:
 *   - host beat 0: the real-layer name-early ask (skip when known);
 *   - the in-role CAPTURE THE CALLER block (simulated name early, then
 *     need + callback number, politely, never twice);
 *   - a listings-layer capture sentence for the showing flow;
 *   - close beat 5's START-NOW offer and close beat 6: the SUMMARY
 *     OFFER (confirm an on-file email, never re-ask), the ONE CAPTURE
 *     ASK (at most once; a decline ends it), and the PARTNER CLOSE.
 * The capture persists through the existing tools — request_platform_
 * followup (lead save) and request_conversation_copy (recap email) —
 * no second email system.
 *
 * These tests pin the script TEXT and its composition into every
 * presenter prompt; live behavior is proven only by Ron's phone test.
 */
import { describe, expect, test } from 'vitest';
import {
  SIMULATION_PROMPT, SIMULATION_HOST_SEGMENT, SIMULATION_RECEPTIONIST_SEGMENT,
  SIMULATION_CLOSE_SEGMENT, SIMULATION_PROMPT_SWAP_PARENT, SWAP_HOST_YIELD_BAR,
} from '../../supabase/functions/_shared/voice-config';
import {
  personaFor, personaSegmentPrompt, presenterSimulationPrompt,
} from '../../supabase/functions/_shared/personas';
import {
  REALTOR_EXAMPLE_PACKS, REALTOR_EXAMPLE_SIMULATION_SCRIPT, buildExampleListingsLayer,
} from '../../supabase/functions/_shared/realtor-example-listings';

const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

const NAME_LINE = 'Before we start — who do I have the pleasure of speaking with?';
const START_NOW_LINE = 'We can get you going in about 15 minutes. Alex, our onboarding engineer, will walk you through it — all you need to do is pick a plan.';
const SUMMARY_LINE = 'Or I can email you a summary of this conversation and the simulation, so you can show your colleagues or your manager.';
const CAPTURE_LINE = 'So we can send the summary and follow up properly — may I have your name, your email, and the best phone number for you?';
const PARTNER_LINE = "we're here to be your vendor — and your partner";

describe('composition invariants survive the new beats', () => {
  test('segment parity: HOST + RECEPTIONIST + CLOSE === SIMULATION_PROMPT', () => {
    expect(SIMULATION_HOST_SEGMENT + SIMULATION_RECEPTIONIST_SEGMENT + SIMULATION_CLOSE_SEGMENT)
      .toBe(SIMULATION_PROMPT);
  });

  test('the pre-existing close beats still run in order', () => {
    const beats = [
      'ANNOUNCE THE STEP-OUT', 'ASK FOR THEIR GENUINE REACTION', 'RECAP THIS DEMO',
      'OPEN THE FLOOR', 'MEET ALEX', 'NEXT STEPS come last',
      'THE SUMMARY OFFER', 'THE ONE CAPTURE ASK', 'THE PARTNER CLOSE',
    ];
    let last = -1;
    for (const beat of beats) {
      const idx = SIMULATION_CLOSE_SEGMENT.indexOf(beat);
      expect(idx, beat).toBeGreaterThan(last);
      last = idx;
    }
    expect(SIMULATION_CLOSE_SEGMENT).toContain(
      'I am stepping out of simulation mode now. This is Aspen from AI Hidden Leads again.');
  });
});

describe('1a — real layer: name-early', () => {
  test('host beat 0 asks the name before the announcement, with the exact line', () => {
    expect(SIMULATION_HOST_SEGMENT).toContain('THE NAME — THE FIRST EXCHANGE');
    expect(SIMULATION_HOST_SEGMENT).toContain(NAME_LINE);
    expect(SIMULATION_HOST_SEGMENT.indexOf('THE NAME — THE FIRST EXCHANGE'))
      .toBeLessThan(SIMULATION_HOST_SEGMENT.indexOf('THE ANNOUNCEMENT'));
  });

  test('beat 0 skips when the name is already known and never re-asks in the host phase', () => {
    expect(SIMULATION_HOST_SEGMENT).toContain('not already known in this session');
    expect(SIMULATION_HOST_SEGMENT).toContain('skip this beat silently');
    expect(SIMULATION_HOST_SEGMENT).toContain('never ask again in this host phase');
    // The pinned beat-6 in-role ask keeps its own skip-if-known rule.
    expect(SIMULATION_RECEPTIONIST_SEGMENT)
      .toContain("skip this ask entirely if the visitor's name is already known");
  });

  test('the swap host carries the name ask in its one-short-line allowance', () => {
    expect(SWAP_HOST_YIELD_BAR).toContain(NAME_LINE);
    expect(SIMULATION_PROMPT_SWAP_PARENT).toContain(NAME_LINE);
  });
});

describe('1b — simulated layer: the caller is captured in role', () => {
  test('CAPTURE THE CALLER: name at first engagement, then need + callback number', () => {
    expect(SIMULATION_RECEPTIONIST_SEGMENT).toContain('CAPTURE THE CALLER');
    expect(SIMULATION_RECEPTIONIST_SEGMENT)
      .toContain('Before we go any further — who do I have the pleasure of speaking with?');
    expect(SIMULATION_RECEPTIONIST_SEGMENT).toContain("What's the best number to reach you on?");
    expect(SIMULATION_RECEPTIONIST_SEGMENT).toContain('their need in their own words');
    // The block sits after beat 6: beat 6 is the fallback, capture at
    // first engagement takes over when the caller engages early.
    expect(SIMULATION_RECEPTIONIST_SEGMENT.indexOf('CAPTURE THE CALLER'))
      .toBeGreaterThan(SIMULATION_RECEPTIONIST_SEGMENT.indexOf('THE NAME, THEN THE OPENING QUESTION'));
  });

  test('capture is polite and never forced: no second ask, help never conditional', () => {
    expect(SIMULATION_RECEPTIONIST_SEGMENT).toContain('Never ask for the same detail twice');
    expect(SIMULATION_RECEPTIONIST_SEGMENT).toContain('never make help conditional on giving details');
    expect(SIMULATION_RECEPTIONIST_SEGMENT).toContain('No problem at all');
  });

  test('the listings flow takes name + number as the showing firms up', () => {
    const layer = buildExampleListingsLayer(REALTOR_EXAMPLE_PACKS[0]);
    expect(layer).toContain("take the caller's name and best callback number");
    expect(layer).toContain('never asked twice');
    // Preference-first / feature-first rules intact; the owner-locked
    // quoted script itself is unchanged by this batch.
    expect(layer).toContain('ask ONE preference question');
    expect(layer).toContain('FEATURE-FIRST');
    expect(REALTOR_EXAMPLE_SIMULATION_SCRIPT).not.toContain('best callback number');
  });

  test("Sara's doorway segment carries the capture block", () => {
    const built = personaSegmentPrompt('sara', 'doorway', 'Durgin Electric', SIMULATION_PROMPT);
    expect(built.systemPrompt).toContain('CAPTURE THE CALLER');
  });
});

describe('2 — the close: start-now, summary, one capture ask, partner line', () => {
  test('the close triggers on wrap-up — including a goodbye aimed at the demo itself', () => {
    expect(SIMULATION_CLOSE_SEGMENT).toContain('they say they have seen enough');
    expect(SIMULATION_CLOSE_SEGMENT).toContain('A goodbye aimed at the demo itself');
  });

  test('start-now offer: the verbatim line, existing paths only, no invented URL', () => {
    expect(SIMULATION_CLOSE_SEGMENT).toContain('THE START-NOW OFFER');
    expect(SIMULATION_CLOSE_SEGMENT).toContain(START_NOW_LINE);
    expect(SIMULATION_CLOSE_SEGMENT).toContain('the Start now action and the reviewed plans on this page');
    expect(SIMULATION_CLOSE_SEGMENT).not.toContain('aihiddenleads.com/plans');
    expect(SIMULATION_CLOSE_SEGMENT).toContain('never claim a plan was chosen, a payment made');
  });

  test('summary offer: verbatim line, hooked into the existing recap tool', () => {
    expect(SIMULATION_CLOSE_SEGMENT).toContain(SUMMARY_LINE);
    expect(SIMULATION_CLOSE_SEGMENT).toContain('request_conversation_copy');
  });

  test('an email already on file is confirmed, not re-asked', () => {
    expect(SIMULATION_CLOSE_SEGMENT).toContain('CONFIRM it instead of asking again');
    expect(SIMULATION_CLOSE_SEGMENT)
      .toContain('I have that email from when you started the demo — shall I send it there?');
  });

  test('the capture ask happens at most once — one ask, one rule, old duplicate gone', () => {
    expect(SIMULATION_CLOSE_SEGMENT).toContain(CAPTURE_LINE);
    // The label appears exactly twice — the beat-6 group header and the
    // rule itself — while the ASK (the spoken question line) appears once.
    expect(occurrences(SIMULATION_PROMPT, 'THE ONE CAPTURE ASK')).toBe(2);
    expect(occurrences(SIMULATION_PROMPT, 'may I have your name, your email, and the best phone number')).toBe(1);
    expect(occurrences(SIMULATION_PROMPT, CAPTURE_LINE)).toBe(1);
    // The pre-existing trailing collection sentence no longer competes:
    // it now defers to beat 6 as the ONLY collection point.
    expect(SIMULATION_PROMPT).not.toContain('ask permission for full name, email and optional phone');
    expect(SIMULATION_PROMPT).toContain("collected ONLY in beat 6's one capture ask");
    // Persistence rides the existing follow-up tool, not a new system.
    expect(SIMULATION_CLOSE_SEGMENT).toContain('request_platform_followup');
  });

  test('a decline produces no second ask — accepted instantly, never re-asked in any form', () => {
    expect(SIMULATION_CLOSE_SEGMENT).toContain('accepted instantly and warmly');
    expect(SIMULATION_CLOSE_SEGMENT)
      .toContain('you never ask again, in any form, for the rest of the conversation');
    expect(SIMULATION_CLOSE_SEGMENT)
      .toContain('never hold the summary, a booking or the goodbye hostage to contact details');
  });

  test('the partner close lands once, as the last word', () => {
    expect(SIMULATION_CLOSE_SEGMENT).toContain('THE PARTNER CLOSE');
    expect(SIMULATION_CLOSE_SEGMENT).toContain(PARTNER_LINE);
    expect(occurrences(SIMULATION_PROMPT, 'your vendor — and your partner')).toBe(1);
  });
});

describe('every presenter inherits the close + capture', () => {
  for (const id of ['frank', 'latina', 'black-professional-lady'] as const) {
    test(`${id}: solo prompt carries beat 0, the capture block and the full close`, () => {
      const prompt = presenterSimulationPrompt(personaFor(id));
      expect(prompt).toContain(NAME_LINE);
      expect(prompt).toContain('CAPTURE THE CALLER');
      expect(prompt).toContain(START_NOW_LINE);
      expect(prompt).toContain(SUMMARY_LINE);
      expect(prompt).toContain(CAPTURE_LINE);
      expect(prompt).toContain(PARTNER_LINE);
      expect(occurrences(prompt, CAPTURE_LINE)).toBe(1);
    });
  }

  test("Aspen's step-out segment carries the full close", () => {
    const built = personaSegmentPrompt('aspen', 'stepout', 'Durgin Electric', SIMULATION_PROMPT);
    expect(built.systemPrompt).toContain('THE ONE CAPTURE ASK');
    expect(built.systemPrompt).toContain(PARTNER_LINE);
    expect(built.systemPrompt).toContain(START_NOW_LINE);
  });
});
