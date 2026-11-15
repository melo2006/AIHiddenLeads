// @vitest-environment node
// Publish #74 — the host→segment TRANSITION GATE for capture
// (2026-11-15).
//
// THE DEFECT (live-verified in the Publish #70 harness sessions,
// publish70-verification-2026-11-15.md): #70's consent machinery
// is correct once armed, but it arms on the record_captured_
// contact call — and in both defect sessions the model crossed
// the host→simulation transition WITHOUT ever making it. The
// visitor dictated email + mobile, confirmed "Yes, that's right",
// and the presenter stepped into simulation mode: nothing
// recorded, nothing asked, nothing durable. Session B's one
// read-back also came out in the segmented form ("tony dot test
// at example dot com") the tightened ritual names as NOT a
// spell-back. And on a fresh reconnect the presenter cited
// melo4000@gmail.com — the demo LEAD OWNER's own email, never
// given by that visitor — as the visitor's address on file.
//
// THE FIX, pinned here:
//  - _shared/capture-gate.ts: the proxy detects dictated-but-
//    unrecorded contact facts in the visitor's own utterances
//    (and, at a successor session's start, in its recap), and a
//    turn-boundary state machine injects the capture sequence —
//    read-back, record, then #70's consent ask — before the
//    conversation may move on; a segmented read-back earns a
//    one-time letter-by-letter correction;
//  - the bleed bar: gemini-session no longer copies the lead
//    row's email/phone into visitorContact, and the proxy renders
//    visitor details through promptVisitorDetails (name only) —
//    a recap draws only from this visitor's captured-contact
//    store and this session's transcript.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  capturedContactBlock,
  mergeCapturedContact,
  promptVisitorDetails,
  type CapturedContact,
} from '../../supabase/functions/_shared/captured-contact';
import {
  syncConsentAskState,
  freshConsentAskState,
} from '../../supabase/functions/_shared/consent-ask';
import {
  CAPTURE_GATE_MAX_FIRES,
  armCaptureGateFromRecap,
  captureGateDirective,
  captureGateRecordDirective,
  captureGateTurnDecision,
  detectDictatedContact,
  detectDictatedEmail,
  detectDictatedPhone,
  emailRenderingInTurn,
  freshCaptureGateState,
  noteVisitorUtterance,
  spellbackCorrectionNudge,
  turnReadsBackPhone,
  turnSignalsSimulationEntry,
  unrecordedFacts,
  type CaptureGateState,
} from '../../supabase/functions/_shared/capture-gate';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
const proxySource = read('supabase/functions/gemini-live-proxy/index.ts');
const sessionSource = read('supabase/functions/gemini-session/index.ts');

const NOW = new Date('2026-11-15T18:00:00.000Z');
const withContact = (patch: Parameters<typeof mergeCapturedContact>[1], prev: CapturedContact | null = null) =>
  mergeCapturedContact(prev, patch, NOW);
const DICTATE = 'My name is Tony Miller. My email is tony.test@example.com and my cell is 954-555-0142.';
const TRANSITION_TURN = "Thank you, Tony. Okay — now we are stepping into simulation mode. Please act like a visitor to your own website, or like a caller phoning your own number. I will treat you as a brand-new caller who knows nothing about this demo.";
const SPELLED_READBACK = 'Just to confirm your details: your email is t-o-n-y dot t-e-s-t at e-x-a-m-p-l-e dot c-o-m, and your cell number is 954 555 0142. Did I get that right?';
const SEGMENTED_READBACK = 'Thank you, Tony Miller. Let me confirm those details: your email is tony dot test at example dot com, and your cell number is 954 555 0142. Did I get that right?';

// Mirrors the proxy's exact call pattern: the completed visitor
// utterance is folded in first, then the boundary decision runs
// with the model turn that answered it.
const boundary = (
  state: CaptureGateState,
  contact: CapturedContact | null,
  modelTurnText: string,
  visitorUtterance = '',
  blocked = false,
  inSegment = false,
) => {
  const folded = noteVisitorUtterance(state, visitorUtterance, { inSegment });
  return captureGateTurnDecision({ state: folded, contact, modelTurnText, visitorUtterance, blocked });
};

describe('detectDictatedEmail — typed and spoken forms, nothing murkier', () => {
  it('finds the typed form', () => {
    expect(detectDictatedEmail(DICTATE)).toBe('tony.test@example.com');
    expect(detectDictatedEmail('Reach me at Maria.Garcia@Example.COM please')).toBe('maria.garcia@example.com');
  });

  it('reconstructs the spoken form ASR produces', () => {
    expect(detectDictatedEmail('my email is tony dot test at example dot com')).toBe('tony.test@example.com');
    expect(detectDictatedEmail('it is tony.test at example dot com')).toBe('tony.test@example.com');
    expect(detectDictatedEmail('ron dot melo at gmail dot com')).toBe('ron.melo@gmail.com');
  });

  it('Publish #78 (defect 4): "period" and "point" are separators too — the whole address, never a fragment', () => {
    expect(detectDictatedEmail('my email is tony period test at example dot com')).toBe('tony.test@example.com');
    expect(detectDictatedEmail('it is tony point test at example dot com')).toBe('tony.test@example.com');
    expect(detectDictatedEmail('tony period test at example period com')).toBe('tony.test@example.com');
  });

  it('rejects phrases that merely contain "at" or a fragment', () => {
    expect(detectDictatedEmail('Meet me at noon by the office.')).toBe('');
    expect(detectDictatedEmail('send it to me at gmail dot com')).toBe('');
    expect(detectDictatedEmail('I will be at the example office tomorrow')).toBe('');
    expect(detectDictatedEmail('No email here at all.')).toBe('');
    expect(detectDictatedEmail('')).toBe('');
  });
});

describe('detectDictatedPhone — the full shape or a bounded run, never a fragment', () => {
  it('finds the shaped forms', () => {
    expect(detectDictatedPhone(DICTATE)).toBe('9545550142');
    expect(detectDictatedPhone('call me on (954) 555-0142')).toBe('9545550142');
    expect(detectDictatedPhone('my number is +1 954.555.0142')).toBe('9545550142');
    expect(detectDictatedPhone('it is 9545550142')).toBe('9545550142');
  });

  it('rejects fragments, prices, years and longer numbers', () => {
    expect(detectDictatedPhone('my number ends in 555-0142')).toBe('');
    expect(detectDictatedPhone('the house is $300,000 and was built in 1998')).toBe('');
    expect(detectDictatedPhone('400 minutes for 99 dollars a month')).toBe('');
    expect(detectDictatedPhone('my card is 4111 1111 1111 1111')).toBe('');
    expect(detectDictatedPhone('order 954555014299 is ready')).toBe('');
    expect(detectDictatedPhone('')).toBe('');
  });
});

describe('noteVisitorUtterance — dictation arms; roleplay and segments never do', () => {
  it('folds dictated facts in; the latest dictation of a field wins', () => {
    let state = noteVisitorUtterance(freshCaptureGateState(), DICTATE, { inSegment: false });
    expect(state.email).toBe('tony.test@example.com');
    expect(state.phone).toBe('9545550142');
    state = noteVisitorUtterance(state, 'Sorry, the email is tony.test@other.com', { inSegment: false });
    expect(state.email).toBe('tony.test@other.com');
    expect(state.phone).toBe('9545550142');
  });

  it('an utterance without contact facts changes nothing', () => {
    const state = freshCaptureGateState();
    expect(noteVisitorUtterance(state, 'Tell me about your listings.', { inSegment: false })).toBe(state);
  });

  it('inside a persona segment the visitor is in roleplay — dictation never arms', () => {
    const state = noteVisitorUtterance(freshCaptureGateState(), DICTATE, { inSegment: true });
    expect(state.email).toBe('');
    expect(state.phone).toBe('');
  });

  it('after the simulation entry, new dictation belongs to the simulated business', () => {
    const entered = { ...freshCaptureGateState(), simulationEntered: true };
    const state = noteVisitorUtterance(entered, DICTATE, { inSegment: false });
    expect(state.email).toBe('');
  });
});

describe('unrecordedFacts — the store, in any formatting, settles a fact', () => {
  const dictated = { ...freshCaptureGateState(), email: 'tony.test@example.com', phone: '9545550142' };

  it('an empty store owes both facts', () => {
    expect(unrecordedFacts(dictated, null)).toEqual({ email: 'tony.test@example.com', phone: '9545550142' });
  });

  it('the same facts in the store — any phone formatting — settle the debt', () => {
    const stored = withContact({ email: 'tony.test@example.com', phone: '(954) 555-0142' });
    expect(unrecordedFacts(dictated, stored)).toEqual({ email: '', phone: '' });
  });

  it('a DIFFERENT stored email does not settle the dictated one', () => {
    const stored = withContact({ email: 'someone.else@example.com', phone: '954-555-0142' });
    expect(unrecordedFacts(dictated, stored).email).toBe('tony.test@example.com');
    expect(unrecordedFacts(dictated, stored).phone).toBe('');
  });
});

describe('armCaptureGateFromRecap — a successor session inherits the parent debt', () => {
  const RECAP = [
    'Assistant: Good afternoon — before we start, who do I have the pleasure of speaking with?',
    `Visitor: ${DICTATE}`,
    'Assistant: Thank you, Tony.',
  ].join('\n');

  it('arms the facts the parent never recorded', () => {
    const state = armCaptureGateFromRecap(freshCaptureGateState(), RECAP, null);
    expect(state.email).toBe('tony.test@example.com');
    expect(state.phone).toBe('9545550142');
  });

  it('facts the store already holds are not armed — the store is the durable truth', () => {
    const stored = withContact({ email: 'tony.test@example.com', phone: '954-555-0142' });
    const state = armCaptureGateFromRecap(freshCaptureGateState(), RECAP, stored);
    expect(state.email).toBe('');
    expect(state.phone).toBe('');
  });

  it('the walk stops at the simulation entry — later dictation was roleplay', () => {
    const recap = [
      'Assistant: Welcome in.',
      `Assistant: ${TRANSITION_TURN}`,
      `Visitor: ${DICTATE}`,
    ].join('\n');
    const state = armCaptureGateFromRecap(freshCaptureGateState(), recap, null);
    expect(state.email).toBe('');
    expect(state.phone).toBe('');
  });

  it('assistant lines are never scanned — the presenter reciting an address is not a dictation', () => {
    const recap = `Assistant: You can reach the office at tony.test@example.com or 954-555-0142 any time.`;
    const state = armCaptureGateFromRecap(freshCaptureGateState(), recap, null);
    expect(state.email).toBe('');
    expect(state.phone).toBe('');
  });
});

describe('read-back rendering detection — spelled, segmented, or not a read-back', () => {
  it('the letter-by-letter form is spelled', () => {
    expect(emailRenderingInTurn(SPELLED_READBACK, 'tony.test@example.com')).toBe('spelled');
    expect(emailRenderingInTurn('your email is t o n y dot t e s t at e x a m p l e dot c o m', 'tony.test@example.com')).toBe('spelled');
  });

  it('the whole-word form — the #70 session-B read-back verbatim — is segmented', () => {
    expect(emailRenderingInTurn(SEGMENTED_READBACK, 'tony.test@example.com')).toBe('segmented');
    expect(emailRenderingInTurn('your email is tony.test@example.com, right?', 'tony.test@example.com')).toBe('segmented');
  });

  it('Publish #78 (defect 4): a "period" rendering is segmented — the #74 verification session-A read-back verbatim', () => {
    // Before the fix this classified as null (not a read-back at
    // all): neither sequence contains "period", so no correction
    // fired and the capture stood on the segmented confirmation.
    expect(emailRenderingInTurn('That is tony period test at example dot com, and your number is 954 555 0142. Did I get that right?', 'tony.test@example.com')).toBe('segmented');
    expect(emailRenderingInTurn('your email is tony point test at example dot com', 'tony.test@example.com')).toBe('segmented');
    expect(emailRenderingInTurn('your email is tony period test at example period com', 'tony.test@example.com')).toBe('segmented');
  });

  it('Publish #78 (defect 4): a true spell-back spoken with "period" separators is spelled — never corrected', () => {
    expect(emailRenderingInTurn('your email is t-o-n-y period t-e-s-t at e-x-a-m-p-l-e dot c-o-m', 'tony.test@example.com')).toBe('spelled');
    expect(emailRenderingInTurn('your email is t o n y period t e s t at e x a m p l e period c o m', 'tony.test@example.com')).toBe('spelled');
  });

  it('a turn that does not render the address is not a read-back', () => {
    expect(emailRenderingInTurn(TRANSITION_TURN, 'tony.test@example.com')).toBeNull();
    expect(emailRenderingInTurn('Tony, let me show you the first listing.', 'tony.test@example.com')).toBeNull();
    expect(emailRenderingInTurn('', 'tony.test@example.com')).toBeNull();
  });

  it('phone read-backs count in digit groups and in spelled digits', () => {
    expect(turnReadsBackPhone(SPELLED_READBACK, '9545550142')).toBe(true);
    expect(turnReadsBackPhone('your number is nine five four, five five five, zero one four two', '9545550142')).toBe(true);
    expect(turnReadsBackPhone('we serve the 954 area proudly', '9545550142')).toBe(false);
  });

  it('the simulation entry shapes are recognized', () => {
    expect(turnSignalsSimulationEntry(TRANSITION_TURN)).toBe(true);
    expect(turnSignalsSimulationEntry('Let me read that back to you.')).toBe(false);
  });
});

describe('SIMULATION — the #70 defect sequence, replayed through the proxy call pattern', () => {
  it('session A: dictate → transition with no read-back → the gate fires; confirm → the record is ordered; the record settles it and arms #70', () => {
    let contact: CapturedContact | null = null;
    // The dictate turn: the model transitions WITHOUT a read-back
    // and without any record call — the defect itself.
    let turn = boundary(freshCaptureGateState(), contact, TRANSITION_TURN, DICTATE);
    let state = turn.state;
    expect(turn.inject).toBe('gate');
    expect(turn.facts).toEqual({ email: 'tony.test@example.com', phone: '9545550142' });
    expect(state.fires).toBe(1);
    expect(state.simulationEntered).toBe(true);
    const directive = captureGateDirective(turn.facts);
    expect(directive).toContain('tony.test@example.com');
    expect(directive).toContain('record_captured_contact');
    expect(directive).toContain('consentAskRequired');

    // The directive elicits the ritual read-back: observed, no
    // further injection while the visitor has not answered it.
    turn = boundary(state, contact, SPELLED_READBACK, '');
    state = turn.state;
    expect(turn.inject).toBeNull();
    expect(state.emailReadback).toBe(true);
    expect(state.phoneReadback).toBe(true);

    // The visitor confirms ONLY — and the model moves on again
    // without recording. The gate orders the record.
    turn = boundary(state, contact, 'We serve luxury home buyers and sellers throughout South Florida.', "Yes, that's right.");
    state = turn.state;
    expect(turn.inject).toBe('record');
    expect(turn.facts).toEqual({ email: 'tony.test@example.com', phone: '9545550142' });
    expect(captureGateRecordDirective(turn.facts)).toContain('record_captured_contact NOW');

    // The model finally records: the store settles the gate debt —
    // and the SAME record arms #70's consent ask (mobile, no
    // answer), which is the hand-off the whole sequence exists for.
    contact = withContact({ name: 'Tony Miller', email: 'tony.test@example.com', phone: '954-555-0142' });
    expect(syncConsentAskState(freshConsentAskState(), contact).owed).toBe(true);
    turn = boundary(state, contact, 'May we text you on this number?', '');
    expect(turn.inject).toBeNull();
  });

  it('session B: the segmented read-back earns the one-time correction; the voided confirmation cannot trigger the record-order', () => {
    let contact: CapturedContact | null = null;
    // Dictate + segmented read-back in the answering turn.
    let turn = boundary(freshCaptureGateState(), contact, SEGMENTED_READBACK, DICTATE);
    let state = turn.state;
    expect(turn.inject).toBe('spellback');
    expect(state.spellbackCorrected).toBe(true);
    // The grouped read-back does not count: its confirmation is void.
    expect(state.emailReadback).toBe(false);
    const nudge = spellbackCorrectionNudge('tony.test@example.com');
    expect(nudge).toContain('NOT a spell-back');
    expect(nudge).toContain('t o n y dot t e s t at e x a m p l e dot c o m');
    expect(nudge).toContain('Do not accept the earlier confirmation.');

    // The visitor's "Yes" (given to the voided form) arrives with
    // the corrected spell-back: NO record-order yet — the fresh
    // confirmation is still owed.
    turn = boundary(state, contact, SPELLED_READBACK, "Yes, that's right.");
    state = turn.state;
    expect(turn.inject).toBeNull();
    expect(state.emailReadback).toBe(true);

    // The visitor confirms the corrected read-back; the model
    // transitions without recording → the record is ordered.
    turn = boundary(state, contact, TRANSITION_TURN, "Yes, that's right.");
    state = turn.state;
    expect(turn.inject).toBe('record');

    // The correction is one-time: a later segmented rendering in
    // the same session earns nothing more.
    contact = withContact({ email: 'tony.test@example.com', phone: '954-555-0142' });
    turn = boundary(state, contact, SEGMENTED_READBACK, '');
    expect(turn.inject).toBeNull();
  });

  it('Publish #78 (defect 4): the #74 verification session A — the "period" read-back earns the same correction, and the corrected re-read follows', () => {
    // Verbatim from publish74-verification-2026-11-15.md, Check 1/3:
    // the dictate-turn read-back rendered the email with "period".
    const PERIOD_READBACK = 'Thank you, Tony. I want to confirm those details. That is tony period test at example dot com, and your number is 954 555 0142. Did I get that right?';
    let contact: CapturedContact | null = null;
    let turn = boundary(freshCaptureGateState(), contact, PERIOD_READBACK, DICTATE);
    let state = turn.state;
    // The same one-time correction the "dot" form earns — with the
    // exact letter-by-letter sequence — and the grouped form's
    // confirmation is void (the email read-back does not count).
    expect(turn.inject).toBe('spellback');
    expect(state.spellbackCorrected).toBe(true);
    expect(state.emailReadback).toBe(false);
    expect(state.phoneReadback).toBe(true);

    // The corrected letter-by-letter re-read follows; the visitor's
    // fresh confirmation is still owed before any record-order.
    turn = boundary(state, contact, SPELLED_READBACK, "Yes, that's right.");
    state = turn.state;
    expect(turn.inject).toBeNull();
    expect(state.emailReadback).toBe(true);

    // The visitor confirms the corrected read-back; the model
    // transitions without recording → the record is ordered, and
    // the correction stays one-time.
    turn = boundary(state, contact, TRANSITION_TURN, "Yes, that's right.");
    state = turn.state;
    expect(turn.inject).toBe('record');
    turn = boundary(state, contact, PERIOD_READBACK, '');
    expect(turn.inject).toBeNull();
  });

  it('a clean capture in the moment never hears from the gate', () => {
    let contact: CapturedContact | null = null;
    let turn = boundary(freshCaptureGateState(), contact, SPELLED_READBACK, DICTATE);
    const state = turn.state;
    expect(turn.inject).toBeNull();
    // The model records on the confirm turn (the tool call lands
    // before its turnComplete is judged).
    contact = withContact({ name: 'Tony Miller', email: 'tony.test@example.com', phone: '954-555-0142', smsConsent: true });
    turn = boundary(state, contact, 'Perfect — let me walk you through how this works.', "Yes, that's right, and yes you can text me.");
    expect(turn.inject).toBeNull();
  });

  it('a session with no dictation is never interrupted', () => {
    let state = freshCaptureGateState();
    for (const modelTurn of ['Welcome in — let me show you around.', TRANSITION_TURN, 'Tell me what you are picturing — a condo, a house, or near the water?']) {
      const turn = boundary(state, null, modelTurn, 'Just looking around, thanks.');
      state = turn.state;
      expect(turn.inject).toBeNull();
    }
    expect(state.fires).toBe(0);
  });

  it('a segment that inherits an unrecorded parent capture is gated at its first boundary', () => {
    const recap = [
      'Assistant: Good afternoon — who do I have the pleasure of speaking with?',
      `Visitor: ${DICTATE}`,
      'Assistant: Thank you, Tony. Let me introduce Sara.',
    ].join('\n');
    const armed = armCaptureGateFromRecap(freshCaptureGateState(), recap, null);
    const turn = captureGateTurnDecision({
      state: armed,
      contact: null,
      modelTurnText: "Good afternoon, Michael Martinez Group — I'm Sara, thanks for calling. How can I help you?",
      visitorUtterance: '',
      blocked: false,
    });
    expect(turn.inject).toBe('gate');
    expect(turn.facts.email).toBe('tony.test@example.com');
  });

  it('roleplay dictation after the entry never arms — the gate stays silent in the simulation', () => {
    let state = { ...freshCaptureGateState(), simulationEntered: true };
    const turn = boundary(state, null, 'And what number should the office call you back on?', 'Sure — 954-555-0142, and my email is tony.test@example.com.', false);
    state = turn.state;
    expect(state.email).toBe('');
    expect(turn.inject).toBeNull();
  });

  it('blocked boundaries inject nothing and spend nothing — the debt is judged at the first open boundary', () => {
    let turn = boundary(freshCaptureGateState(), null, TRANSITION_TURN, DICTATE, true);
    let state = turn.state;
    expect(turn.inject).toBeNull();
    expect(state.fires).toBe(0);
    // The observations still landed: the facts are known, the
    // entry was seen — the first unblocked boundary fires.
    turn = boundary(state, null, 'Anything else I can help with?', '');
    expect(turn.inject).toBe('gate');
  });

  it('fires are capped — a model that ignores the gate is not nagged forever', () => {
    let state = freshCaptureGateState();
    let injections = 0;
    let turn = boundary(state, null, TRANSITION_TURN, DICTATE);
    state = turn.state;
    if (turn.inject) injections++;
    for (let i = 0; i < CAPTURE_GATE_MAX_FIRES + 3; i++) {
      turn = boundary(state, null, 'Let me tell you about our services instead.', 'Uh huh.');
      state = turn.state;
      if (turn.inject) injections++;
    }
    expect(injections).toBe(CAPTURE_GATE_MAX_FIRES);
    expect(state.fires).toBe(CAPTURE_GATE_MAX_FIRES);
  });
});

describe('the bleed bar — lead-owner contact never reaches a visitor recap', () => {
  // The Martinez lead as the #70 verification found it: the lead
  // row carries the OWNER's own demo-form contact, while the
  // visitor talking to Frank is somebody else entirely.
  const LEAD_OWNER_CONTACT = { name: 'Ron Melo', email: 'melo4000@gmail.com', phone: '954-770-6622' };

  it('promptVisitorDetails projects the name and drops email/phone structurally', () => {
    const rendered = promptVisitorDetails(LEAD_OWNER_CONTACT);
    expect(rendered).toBe('{"name":"Ron Melo"}');
    expect(rendered).not.toContain('melo4000');
    expect(rendered).not.toContain('954');
    expect(promptVisitorDetails(null)).toBe('{"name":""}');
    expect(promptVisitorDetails('garbage')).toBe('{"name":""}');
    expect(promptVisitorDetails({ email: 'melo4000@gmail.com' })).toBe('{"name":""}');
  });

  it("the composed recap context recites THIS visitor's store record — and never the owner's address", () => {
    const visitorStore = withContact({ name: 'Tony Miller', email: 'tony.test@example.com', phone: '954-555-0142', smsConsent: true });
    const recapContext = `${promptVisitorDetails(LEAD_OWNER_CONTACT)}\n${capturedContactBlock(visitorStore)}`;
    expect(recapContext).toContain('tony.test@example.com');
    expect(recapContext).toContain('954-555-0142');
    expect(recapContext).not.toContain('melo4000@gmail.com');
    expect(recapContext).not.toContain('954-770-6622');
  });

  it('with no visitor capture, the recap context holds no address at all', () => {
    const recapContext = `${promptVisitorDetails(LEAD_OWNER_CONTACT)}\n${capturedContactBlock(null)}`;
    expect(recapContext).not.toContain('@');
  });

  it('gemini-session stamps the lead name only — the lead email/phone are never copied', () => {
    expect(sessionSource).toContain('visitorContact={name:sanitizeVisitorName(lead.full_name)}');
    const stampAt = sessionSource.indexOf('visitorContact={name:sanitizeVisitorName(lead.full_name)');
    const stampLine = sessionSource.slice(stampAt, sessionSource.indexOf('\n', stampAt));
    expect(stampLine).not.toContain('lead.email');
    expect(stampLine).not.toContain('lead.phone');
  });

  it('the proxy renders visitor details only through the name-only projection', () => {
    expect(proxySource).toContain('promptVisitorDetails(config.visitorContact)');
    expect(proxySource).not.toContain('JSON.stringify(config.visitorContact');
  });
});

describe('proxy wiring — the gate is driven at the transition, not advised', () => {
  it('imports the capture-gate state machine and the details projection', () => {
    expect(proxySource).toContain("from '../_shared/capture-gate.ts'");
    expect(proxySource).toContain('promptVisitorDetails');
  });

  it('seeds the gate from the session recap at session start', () => {
    expect(proxySource).toContain('let captureGate: CaptureGateState = armCaptureGateFromRecap(freshCaptureGateState(), String(config.resumeContext || \'\'), capturedContact)');
  });

  it('folds each completed visitor utterance, segments excluded', () => {
    expect(proxySource).toContain('captureGate = noteVisitorUtterance(captureGate, completedUtterance, { inSegment: config.personaSegment != null })');
  });

  it('runs the gate decision at turnComplete, ahead of the consent decision, on the same blocked terms', () => {
    const gateAt = proxySource.indexOf('const gateDecision = captureGateTurnDecision({');
    const consentAt = proxySource.indexOf('const decision = consentAskTurnDecision({');
    expect(gateAt).toBeGreaterThan(-1);
    expect(consentAt).toBeGreaterThan(gateAt);
    const block = proxySource.slice(gateAt, proxySource.indexOf('if (consentAsk.owed', gateAt));
    expect(block).toContain('blocked: preview || farewellHandled || farewellTimer !== undefined || managerTransferRequested || pendingActions.size > 0');
    expect(block).toContain('captureGateDirective(gateDecision.facts)');
    expect(block).toContain('captureGateRecordDirective(gateDecision.facts)');
    expect(block).toContain('spellbackCorrectionNudge(gateDecision.facts.email)');
    expect(block).toContain("clientContent:{turns:[{role:'user',parts:[{text}]}],turnComplete:true}");
  });

  it('a gate injection stands the consent nudge down for that boundary only', () => {
    expect(proxySource).toContain('if (consentAsk.owed && !gateInjected) {');
  });
});
