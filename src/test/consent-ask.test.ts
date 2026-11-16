// @vitest-environment node
// Publish #70 — the texting-consent ASK, mechanically driven
// (2026-11-15).
//
// THE DEFECT (live-verified in the Publish #68 harness sessions,
// publish68-verification-2026-11-15.md, Check 1): #68's CAPTURE
// RITUAL POLICY told the presenter to ask the texting question at
// the capture moment. Spell-back, grouped phone read-back and the
// confirmation ask all fired — but the texting ask NEVER did when
// the visitor merely confirmed their details: the presenter
// transitioned straight into the next topic in a scripted session
// and in a supplementary control session. (When the visitor
// VOLUNTEERED consent it was recorded — the ask was the gap.)
// A policy sentence is not a mechanism for a step with TCPA weight.
//
// THE FIX, pinned here:
//  - the _shared/consent-ask.ts state machine: a capture holding a
//    mobile with no boolean texting answer OWES the ask; the debt
//    is judged at every model turnComplete — a turn without the
//    ask earns a server nudge that elicits it, an ask without a
//    recorded answer earns the record-order, and any recorded
//    boolean (either way, from any path) settles the debt for the
//    visit, so the ask is never re-asked;
//  - the proxy wiring: noteCapture re-syncs the debt at every
//    capture moment, the record_captured_contact response carries
//    the directive while the debt is open, and the turnComplete
//    decision injects the nudges — blocked while a farewell owns
//    the close, a transfer connects, or a card is on screen;
//  - the tightened ritual: the ask is gated as the very next thing
//    after the read-back confirmation, and the email spell-back is
//    every character of the whole address (the #68 session-3b
//    read-back grouped the address into whole words — pinned as
//    NOT a spell-back).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  mergeCapturedContact,
  type CapturedContact,
} from '../../supabase/functions/_shared/captured-contact';
import {
  CONSENT_ASK_MAX_NUDGES,
  CONSENT_ASK_NUDGE,
  CONSENT_RECORD_NUDGE,
  CONSENT_ASK_TOOL_DIRECTIVE,
  consentAskOwedFor,
  consentAskTurnDecision,
  freshConsentAskState,
  spokenTextingAnswer,
  syncConsentAskState,
  turnContainsTextingAsk,
  type ConsentAskState,
} from '../../supabase/functions/_shared/consent-ask';
import { CAPTURE_RITUAL_POLICY } from '../../supabase/functions/_shared/visitor-followup';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
const proxySource = read('supabase/functions/gemini-live-proxy/index.ts');

const NOW = new Date('2026-11-15T17:00:00.000Z');
const withContact = (patch: Parameters<typeof mergeCapturedContact>[1], prev: CapturedContact | null = null) =>
  mergeCapturedContact(prev, patch, NOW);
const MOBILE_ONLY = { name: 'Tony Miller', email: 'tony.test@example.com', phone: '954-555-0142' };

describe('consentAskOwedFor — the debt exists exactly while a textable number has no answer', () => {
  it('a mobile with no texting answer owes the ask', () => {
    expect(consentAskOwedFor(withContact(MOBILE_ONLY))).toBe(true);
  });

  it('a recorded yes settles it; a recorded no settles it finally', () => {
    expect(consentAskOwedFor(withContact({ ...MOBILE_ONLY, smsConsent: true }))).toBe(false);
    expect(consentAskOwedFor(withContact({ ...MOBILE_ONLY, smsConsent: false }))).toBe(false);
  });

  it('no mobile, no debt — an email-only capture never triggers a texting ask', () => {
    expect(consentAskOwedFor(withContact({ name: 'Tony Miller', email: 'tony.test@example.com' }))).toBe(false);
    expect(consentAskOwedFor(null)).toBe(false);
  });
});

describe('syncConsentAskState — capture moments arm the debt; any recorded answer clears it', () => {
  it('arms on a capture that lands a mobile without an answer', () => {
    const state = syncConsentAskState(freshConsentAskState(), withContact(MOBILE_ONLY));
    expect(state.owed).toBe(true);
    expect(state.delivered).toBe(false);
  });

  it('a boolean from ANY path settles it — including one recorded before the ask was armed', () => {
    const armed = syncConsentAskState(freshConsentAskState(), withContact(MOBILE_ONLY));
    const settled = syncConsentAskState(armed, withContact({ ...MOBILE_ONLY, smsConsent: false }));
    expect(settled.owed).toBe(false);
    // And a contact that already carries an answer never arms at all.
    expect(syncConsentAskState(freshConsentAskState(), withContact({ ...MOBILE_ONLY, smsConsent: true })).owed).toBe(false);
  });

  it('a later silence never un-settles an answer (the store tri-state, restated)', () => {
    const answered = withContact({ ...MOBILE_ONLY, smsConsent: true });
    const after = syncConsentAskState({ owed: false, delivered: true, nudges: 1 }, withContact({}, answered));
    expect(after.owed).toBe(false);
  });
});

describe('turnContainsTextingAsk — a statement about texting is not the ask', () => {
  it('recognizes the ritual question and its natural variants', () => {
    expect(turnContainsTextingAsk('May we text you on this number?')).toBe(true);
    expect(turnContainsTextingAsk('Can we text you at that number?')).toBe(true);
    expect(turnContainsTextingAsk('Is it okay to send you a text with the details?')).toBe(true);
    expect(turnContainsTextingAsk('Would you like us to text you the list?')).toBe(true);
  });

  it('rejects statements, read-backs and other questions', () => {
    expect(turnContainsTextingAsk('We will text you the details shortly.')).toBe(false);
    expect(turnContainsTextingAsk('Your number is nine five four, five five five, zero one four two. Did I get that right?')).toBe(false);
    expect(turnContainsTextingAsk('Great — let me show you how the demo works.')).toBe(false);
    expect(turnContainsTextingAsk('')).toBe(false);
  });
});

describe('SIMULATION — the #68 defect sequence, replayed through the proxy call pattern', () => {
  // Mirrors the proxy exactly: noteCapture merges + re-syncs; each
  // model turnComplete runs the decision with that turn's spoken
  // text and the visitor utterance that preceded it.
  const runTurn = (
    state: ConsentAskState,
    contact: CapturedContact | null,
    modelTurnText: string,
    visitorUtterance = '',
    blocked = false,
  ) => consentAskTurnDecision({ state, contact, modelTurnText, visitorUtterance, blocked });

  it('capture-without-consent forces the ask, then forces the recording', () => {
    // The visitor gives email + mobile; the presenter reads back;
    // the visitor confirms ONLY ("Yes, that's right.") — the exact
    // supplementary-session shape in which the ask never fired.
    let contact = withContact(MOBILE_ONLY);
    let state = syncConsentAskState(freshConsentAskState(), contact);
    expect(state.owed).toBe(true);
    // The tool response for that record call is the directive, not
    // the plain receipt (the proxy branch is source-pinned below).
    expect(CONSENT_ASK_TOOL_DIRECTIVE).toContain('Your VERY NEXT spoken turn');
    expect(CONSENT_ASK_TOOL_DIRECTIVE).toContain('"May we text you on this number?"');

    // The model's next turn TRANSITIONS instead of asking — the
    // defect itself. The turn-boundary decision must force the ask.
    let turn = runTurn(state, contact, 'Perfect, thank you. Now, let me walk you through how this works for your business.', "Yes, that's right.");
    state = turn.state;
    expect(turn.inject).toBe('ask');
    expect(state.nudges).toBe(1);
    expect(state.delivered).toBe(false);

    // The nudge elicits the ask as the model's next turn: observed,
    // marked delivered, nothing more injected.
    turn = runTurn(state, contact, 'May we text you on this number?');
    state = turn.state;
    expect(turn.inject).toBeNull();
    expect(state.delivered).toBe(true);

    // The visitor answers yes — but the model just says "Great!"
    // and moves on without recording. The decision orders the
    // recording.
    turn = runTurn(state, contact, 'Great, glad to hear it.', 'Sure, you can text me.');
    state = turn.state;
    expect(turn.inject).toBe('record');

    // The model records the answer: the debt settles for the visit
    // and no turn ever injects again.
    contact = withContact({ smsConsent: true }, contact);
    state = syncConsentAskState(state, contact);
    expect(state.owed).toBe(false);
    turn = runTurn(state, contact, 'Let me show you the first listing.', 'Thanks.');
    expect(turn.inject).toBeNull();
    expect(turn.state.owed).toBe(false);
  });

  it('when the model obeys the directive at once, no nudge is ever spent', () => {
    let contact = withContact(MOBILE_ONLY);
    let state = syncConsentAskState(freshConsentAskState(), contact);
    // The record call's follow-up turn IS the ask.
    const turn = runTurn(state, contact, 'May we text you on this number?', "Yes, that's right.");
    state = turn.state;
    expect(turn.inject).toBeNull();
    expect(state.delivered).toBe(true);
    expect(state.nudges).toBe(0);
    // The answer is recorded on the very next turn.
    contact = withContact({ smsConsent: true }, contact);
    state = syncConsentAskState(state, contact);
    expect(state.owed).toBe(false);
  });

  it('a NO is final: recorded once, the ask can never be re-armed or re-asked', () => {
    let contact = withContact(MOBILE_ONLY);
    let state = syncConsentAskState(freshConsentAskState(), contact);
    state = runTurn(state, contact, 'May we text you on this number?').state;
    contact = withContact({ smsConsent: false }, contact);
    state = syncConsentAskState(state, contact);
    expect(state.owed).toBe(false);
    // Even a later fresh capture in the same visit cannot re-arm it:
    // the store keeps the explicit no.
    const later = withContact({ email: 'tony.test@other.com' }, contact);
    expect(later.smsConsent).toBe(false);
    expect(syncConsentAskState(state, later).owed).toBe(false);
    expect(runTurn(state, later, 'Anything else I can do for you?', 'No thanks.').inject).toBeNull();
  });

  it('the asked state waits quietly while the visitor has not answered yet', () => {
    const contact = withContact(MOBILE_ONLY);
    let state = syncConsentAskState(freshConsentAskState(), contact);
    state = runTurn(state, contact, 'May we text you on this number?').state;
    // A silent beat (empty visitor utterance, empty model turn):
    // nothing to record, nothing to re-ask.
    const turn = runTurn(state, contact, '', '');
    expect(turn.inject).toBeNull();
    expect(turn.state.delivered).toBe(true);
  });

  it('nudges are capped — a session that burns through them just stays un-consented', () => {
    const contact = withContact(MOBILE_ONLY);
    let state = syncConsentAskState(freshConsentAskState(), contact);
    let injections = 0;
    for (let i = 0; i < CONSENT_ASK_MAX_NUDGES + 3; i++) {
      const turn = runTurn(state, contact, 'Let me tell you about our services instead.', 'Uh huh.');
      state = turn.state;
      if (turn.inject) injections++;
    }
    expect(injections).toBe(CONSENT_ASK_MAX_NUDGES);
    expect(state.nudges).toBe(CONSENT_ASK_MAX_NUDGES);
    // Fail-safe: the store still holds NO answer, so no text can
    // ever be sent on this visit.
    expect(contact.smsConsent).toBeUndefined();
  });

  it('blocked turns inject nothing — a farewell or an on-screen card owns the moment', () => {
    const contact = withContact(MOBILE_ONLY);
    const state = syncConsentAskState(freshConsentAskState(), contact);
    const turn = runTurn(state, contact, 'Thanks for your time, goodbye.', 'Bye.', true);
    expect(turn.inject).toBeNull();
    expect(turn.state.nudges).toBe(0);
    expect(turn.state.owed).toBe(true);
  });

  it('the nudge texts order exactly one thing each', () => {
    expect(CONSENT_ASK_NUDGE).toContain('"May we text you on this number?"');
    expect(CONSENT_ASK_NUDGE).toContain('Ask nothing else in this turn.');
    expect(CONSENT_ASK_NUDGE).toContain('record_captured_contact');
    expect(CONSENT_RECORD_NUDGE).toContain('record_captured_contact');
    expect(CONSENT_RECORD_NUDGE).toContain('smsConsent true if they said yes, false if they said no');
  });
});

describe('the tightened ritual policy (Publish #70)', () => {
  it('the spell-back is every character of the whole address — grouped words are named as not a spell-back', () => {
    expect(CAPTURE_RITUAL_POLICY).toContain('spell the email letter by letter');
    expect(CAPTURE_RITUAL_POLICY).toContain('EVERY character of the whole address, one at a time, start to finish');
    expect(CAPTURE_RITUAL_POLICY).toContain('"tony dot test at example dot com" is NOT a spell-back');
  });

  it('the texting ask is gated: the very next thing after the confirmation, before recording', () => {
    expect(CAPTURE_RITUAL_POLICY).toContain('THE TEXTING ASK RIDES THE SAME MOMENT');
    expect(CAPTURE_RITUAL_POLICY).toContain('the ask is the very next thing after the visitor confirms the read-back — before you record, before any new topic, transition or question');
    expect(CAPTURE_RITUAL_POLICY).toContain('AND answered the texting ask, call record_captured_contact');
    expect(CAPTURE_RITUAL_POLICY).toContain('consentAskRequired');
    expect(CAPTURE_RITUAL_POLICY).toContain('a spoken yes is consent');
    expect(CAPTURE_RITUAL_POLICY).toContain('a no is final for this visit');
  });
});

describe('proxy wiring — the mechanism is driven, not just advised', () => {
  it('imports the consent-ask state machine', () => {
    expect(proxySource).toContain("from '../_shared/consent-ask.ts'");
    expect(proxySource).toContain('let consentAsk: ConsentAskState = freshConsentAskState()');
  });

  it('every capture moment re-syncs the debt inside noteCapture', () => {
    const at = proxySource.indexOf('const noteCapture = ');
    const body = proxySource.slice(at, proxySource.indexOf('stampCapturedContact()', at) + 'stampCapturedContact()'.length);
    expect(body).toContain('consentAsk = syncConsentAskState(consentAsk, capturedContact)');
  });

  it('the record tool response carries the directive while the ask is owed; the plain receipt otherwise', () => {
    expect(proxySource).toContain('if (consentAsk.owed) respond({recorded:true,consentAskRequired:true,instruction:CONSENT_ASK_TOOL_DIRECTIVE});');
    expect(proxySource).toContain("else respond({recorded:true,note:'Details noted for this visit and carried across reconnects.");
    const declAt = proxySource.indexOf("{name:'record_captured_contact'");
    const decl = proxySource.slice(declAt, proxySource.indexOf('}},', declAt));
    expect(decl).toContain('consentAskRequired');
  });

  it('the model turn text is accumulated from output transcriptions for the decision', () => {
    expect(proxySource).toContain('modelTurnText += sc.outputTranscription.text');
  });

  it('the turnComplete decision injects the nudges as clientContent turns', () => {
    const at = proxySource.indexOf('const decision = consentAskTurnDecision({');
    expect(at).toBeGreaterThan(-1);
    const block = proxySource.slice(at, proxySource.indexOf("if(config.transferPhone)", at));
    expect(block).toContain('modelTurnText: completedModelTurn');
    expect(block).toContain('visitorUtterance: completedUtterance');
    expect(block).toContain("decision.inject === 'ask' ? CONSENT_ASK_NUDGE : CONSENT_RECORD_NUDGE");
    expect(block).toContain("clientContent:{turns:[{role:'user',parts:[{text}]}],turnComplete:true}");
  });

  it('the decision is blocked while a farewell owns the close, a transfer connects, or a card is on screen', () => {
    const at = proxySource.indexOf('const decision = consentAskTurnDecision({');
    const block = proxySource.slice(at, proxySource.indexOf("if(config.transferPhone)", at));
    expect(block).toContain('blocked: preview || farewellHandled || farewellTimer !== undefined || managerTransferRequested || pendingActions.size > 0');
  });
});

describe('spokenTextingAnswer — the mechanical spoken-consent stamp (2026-11-16)', () => {
  it('clear affirmatives stamp TRUE', () => {
    for (const t of ['Yes', 'Yes, please', 'Sure', 'Okay', 'Go ahead', 'Sim', 'Claro', 'Sí, por favor']) {
      expect(spokenTextingAnswer(t), t).toBe(true);
    }
  });

  it('leading negatives stamp FALSE', () => {
    for (const t of ['No', 'No thanks', 'No, email is fine', 'Não', 'No gracias']) {
      expect(spokenTextingAnswer(t), t).toBe(false);
    }
  });

  it('anything ambiguous stamps NOTHING (the model path decides)', () => {
    for (const t of [
      'Yes, but not on that number', // negation anywhere kills a TRUE
      'What number do you have?', // a question back is not an answer
      'Maybe later',
      'I need to think about it and also my email is different and this is a long sentence about something else entirely that goes on for a while longer yes',
      '',
    ]) {
      expect(spokenTextingAnswer(t), t).toBe(undefined);
    }
  });

  it('the proxy stamps the answer at the visitor turnComplete when the ask was delivered', () => {
    const proxy = fs.readFileSync(path.join(__dirname, '..', '..', 'supabase/functions/gemini-live-proxy/index.ts'), 'utf8');
    expect(proxy).toContain('spokenTextingAnswer(completedUtterance)');
    expect(proxy).toContain("event: 'consent_answer_stamped'");
    expect(proxy).toContain('consentAsk.owed && consentAsk.delivered');
  });
});
