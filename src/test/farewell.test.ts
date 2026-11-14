// @vitest-environment node
// Fix 5 (Batch 1, 2026-11-12) — goodbye hang-up.
//
// D3 evidence: the visitor said goodbye five times, Aspen signed off
// five times, and the session never ended. detectFarewell is the
// conservative whole-utterance detector the proxy evaluates on the
// visitor's completed turn; the false-positive suite below matters
// as much as the positives — hanging up on a visitor who meant
// "see you at the showing" would be worse than missing a goodbye.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FAREWELL_END_DELAY_MS,
  FAREWELL_MAX_WORDS,
  detectFarewell,
  farewellSpeakerName,
  hasPresenterStamp,
} from '../../supabase/functions/_shared/farewell';
import {
  PRESENTER_SINGLE_CLOSE_RULE,
  personaFor,
  personaSegmentPrompt,
  presenterSimulationPrompt,
} from '../../supabase/functions/_shared/personas';
import {
  SIMULATION_PROMPT,
  SIMULATION_PROMPT_SWAP_PARENT,
} from '../../supabase/functions/_shared/voice-config';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

describe('detectFarewell — clear goodbyes are detected', () => {
  const positives = [
    'bye', 'Bye!', 'bye-bye', 'goodbye', 'good bye',
    'see you', 'see you later', 'See you soon.',
    'gotta go', 'I gotta go', 'I have to go', 'I need to go',
    "that's all", 'that is all', "I'm done", 'I am done',
    'disconnect me', 'hang up', 'end the call', 'please disconnect me',
    'thank you, bye', 'ok bye', 'Okay, bye-bye', "thanks, that's all",
    'well, goodbye, thank you', 'I have to go now', 'gotta go, bye',
    'Alright, I need to go.', 'okay thank you goodbye',
    'adiós', 'adeus', 'tchau', 'hasta luego',
  ];
  for (const utterance of positives) {
    it(`detects: ${JSON.stringify(utterance)}`, () => {
      expect(detectFarewell(utterance)).toBe(true);
    });
  }
});

describe('detectFarewell — the false-positive suite is rejected', () => {
  const negatives: [string, string][] = [
    ['did he say goodbye?', 'a question about a goodbye'],
    ['how do you say goodbye in Spanish?', 'asking how to say it'],
    ['how do you say goodbye in Spanish', 'same, without the question mark'],
    ["don't hang up", 'negated hang-up'],
    ["don't disconnect me", 'negated disconnect'],
    ["I'm not ready to say goodbye", 'not ready yet'],
    ['see you at the showing tomorrow at 3', 'an appointment, not a sign-off'],
    ['I have to go to the store tomorrow morning and buy paint', 'an errand, not a sign-off'],
    ['my client said goodbye to the seller', 'reported speech'],
    ['that would be all I need — can you also tell me about pricing?', 'farewell-shaped words plus a new request'],
    ['that is all I need for now, but what about pricing', 'a closer plus a new request'],
    ['thanks', 'gratitude alone is not a goodbye'],
    ['thank you', 'gratitude alone is not a goodbye'],
    ['ok', 'acknowledgement alone is not a goodbye'],
    ['bye?', 'a one-word question'],
    ['I have to go over the pricing with you', 'go over ≠ go'],
    ['end the call with the seller tomorrow', 'talking about a call, not ending this one'],
    ['hang up the sign in the window', 'a different hang up'],
    ['see you tomorrow at the open house', 'a plan, not a sign-off'],
    ['', 'empty'],
    ['hello, can you help me with pricing?', 'an ordinary opening'],
  ];
  for (const [utterance, why] of negatives) {
    it(`rejects (${why}): ${JSON.stringify(utterance)}`, () => {
      expect(detectFarewell(utterance)).toBe(false);
    });
  }

  it('rejects utterances longer than the word cap even when they start as farewells', () => {
    expect(FAREWELL_MAX_WORDS).toBe(12);
    expect(detectFarewell('bye and also I wanted to ask about the pricing plans for my office team')).toBe(false);
  });

  it('the end delay mirrors the quiet-period pattern at 9 seconds', () => {
    expect(FAREWELL_END_DELAY_MS).toBe(9000);
  });
});

describe('proxy wiring — detection at turnComplete, with cancel paths', () => {
  const src = read('supabase/functions/gemini-live-proxy/index.ts');

  it('evaluates the completed utterance BEFORE callerUtterance is reset', () => {
    const capture = src.indexOf('const completedUtterance = callerUtterance');
    expect(capture).toBeGreaterThan(-1);
    expect(src.indexOf("callerUtterance = ''", capture)).toBeGreaterThan(capture);
    expect(src).toContain('detectFarewell(completedUtterance)');
  });

  it('fires once per session, never for previews or before the visitor began', () => {
    expect(src).toContain('if (!farewellHandled && !preview && begun && detectFarewell(completedUtterance))');
    expect(src).toContain('farewellHandled = true');
  });

  it('injects NOTHING on a farewell — the model\'s own closing is the single farewell', () => {
    // Presenter farewell fix (2026-11-14, Ron's Frank/Martinez phone
    // test: two goodbyes in a row). The detection is evaluated on
    // the model's turnComplete — AFTER it has already answered the
    // visitor's goodbye with its own scripted closing line. The old
    // injected "give ONE brief, warm closing line now" turn made the
    // model close a second time. The proxy now only ends the call.
    expect(src).not.toContain('The visitor has clearly said goodbye.');
    expect(src).not.toContain('give ONE brief, warm closing line now');
    const farewellBlock = src.slice(
      src.indexOf('detectFarewell(completedUtterance)'),
      src.indexOf('FAREWELL_END_DELAY_MS', src.indexOf('detectFarewell(completedUtterance)')),
    );
    expect(farewellBlock).toContain('farewellHandled = true');
    expect(farewellBlock).toContain('farewellTimer = setTimeout');
    expect(farewellBlock).not.toContain('clientContent');
    expect(farewellBlock).not.toContain('geminiWs.send');
  });

  it('arms the end timer: visitor_goodbye, code 1000, the plain closed message', () => {
    expect(src).toContain('FAREWELL_END_DELAY_MS');
    expect(src).toContain("endReason = 'visitor_goodbye'; closeCode = 1000");
    // Presenter-name fix (2026-11-14): the farewell thanks the
    // session's OWN speaker, resolved by farewellSpeakerName — a
    // demoPresenter stamp outranks the config name field, so a
    // presenter demo can never be thanked as "Aspen" off a stale
    // name; Aspen sessions render the identical sentence as before.
    expect(src).toContain('const speakerDisplayName = farewellSpeakerName(config)');
    expect(src).toContain("clientSocket.send(JSON.stringify({ type: 'closed', reason: `Call ended — thanks for talking with ${speakerDisplayName}.` }))");
    expect(src).not.toContain('thanks for talking with Aspen.');
  });

  it('gates silence injections while the farewell end is armed (no second farewell)', () => {
    expect(src).toContain("const farewellOwnsClose = farewellTimer !== undefined && msg.stage !== 'bridge'");
    expect(src).toContain('if (!farewellOwnsClose) geminiWs.send');
  });

  it('cancels the armed end on new speech, on a non-farewell completed turn, on any tool call, and in closeAll', () => {
    // inputTranscription fragment path
    expect(src).toContain('if (farewellTimer && callerUtterance.trim()');
    // turnComplete path (spoke again, not a farewell) — a SUBSTANTIVE
    // completed utterance only: an empty one is the speaker's own
    // closing turn completing and must not cancel (live proof 2026-11-12)
    expect(src).toContain('} else if (farewellTimer && completedUtterance.trim() && !detectFarewell(completedUtterance)) {');
    // tool dispatch + closeAll + the two paths above
    expect(occurrences(src, 'cancelFarewellEnd()')).toBeGreaterThanOrEqual(4);
    expect(src).toContain('clearTimeout(handoffStartTimer); cancelFarewellEnd()');
  });

  it('gemini-session stamps the presenter chain the banner resolves from', () => {
    const session = read('supabase/functions/gemini-session/index.ts');
    // The presenter parent carries BOTH the display name and the
    // demoPresenter stamp; the proxy's farewellSpeakerName prefers
    // the stamp, so the two can never disagree into an "Aspen" banner.
    expect(session).toContain('name:presenter.displayName');
    expect(session).toContain('config.demoPresenter=presenter.id');
    // Segment configs name the segment's own persona (the speaker
    // who is live if the visitor says goodbye mid-cameo).
    expect(session).toContain('name:persona.displayName');
  });

  it('the handoff summary stamp on turnComplete still runs after the farewell block', () => {
    const farewellAt = src.indexOf('const completedUtterance = callerUtterance');
    const stampAt = src.indexOf("browser_voice_handoffs').update({summary})");
    expect(stampAt).toBeGreaterThan(farewellAt);
    expect(src).toContain("clientSocket.send(JSON.stringify({ type: 'turn_complete' }))");
  });
});

describe('farewellSpeakerName — the banner thanks the session\'s own speaker', () => {
  it('presenter demos thank the presenter, by persona', () => {
    expect(farewellSpeakerName({ name: 'Frank', demoPresenter: 'frank' })).toBe('Frank');
    expect(farewellSpeakerName({ name: 'Monica', demoPresenter: 'latina' })).toBe('Monica');
    expect(farewellSpeakerName({ name: 'Black Professional Lady', demoPresenter: 'black-professional-lady' })).toBe('Black Professional Lady');
  });

  it('the presenter stamp outranks a stale or Aspen name field', () => {
    // The exact live defect shape (Ron, 2026-11-14): a Frank demo
    // whose session config still said "Aspen" thanked Aspen. With
    // the stamp present, the banner can never do that again.
    expect(farewellSpeakerName({ name: 'Aspen', demoPresenter: 'frank' })).toBe('Frank');
    expect(farewellSpeakerName({ name: 'Aspen', demoPresenter: 'latina' })).toBe('Monica');
    expect(farewellSpeakerName({ demoPresenter: 'frank' })).toBe('Frank');
    expect(farewellSpeakerName({ name: '', demoPresenter: 'black-professional-lady' })).toBe('Black Professional Lady');
  });

  it('persona segments thank the persona who was live (name field, no stamp)', () => {
    expect(farewellSpeakerName({ name: 'Alex' })).toBe('Alex');
    expect(farewellSpeakerName({ name: 'Sara' })).toBe('Sara');
    expect(farewellSpeakerName({ name: 'Frank' })).toBe('Frank');
  });

  it('Aspen sessions are unchanged', () => {
    expect(farewellSpeakerName({ name: 'Aspen' })).toBe('Aspen');
    expect(farewellSpeakerName({ name: 'Aspen', demoPresenter: 'aspen' })).toBe('Aspen');
    expect(farewellSpeakerName({})).toBe('Aspen');
    expect(farewellSpeakerName({ name: '  ' })).toBe('Aspen');
    expect(farewellSpeakerName(null)).toBe('Aspen');
    expect(farewellSpeakerName(undefined)).toBe('Aspen');
  });

  it('a non-presenter demoPresenter value never hijacks the name', () => {
    expect(farewellSpeakerName({ name: 'Aspen', demoPresenter: 'sara' })).toBe('Aspen');
    expect(farewellSpeakerName({ name: 'Sara', demoPresenter: 'bogus' })).toBe('Sara');
  });
});

describe('hasPresenterStamp — the double-close gate scope', () => {
  it('is true exactly for the three whole-demo presenter stamps', () => {
    expect(hasPresenterStamp({ demoPresenter: 'frank' })).toBe(true);
    expect(hasPresenterStamp({ demoPresenter: 'latina' })).toBe(true);
    expect(hasPresenterStamp({ demoPresenter: 'black-professional-lady' })).toBe(true);
  });

  it('is false for Aspen, segments and unstamped sessions', () => {
    expect(hasPresenterStamp({ demoPresenter: 'aspen' })).toBe(false);
    expect(hasPresenterStamp({ demoPresenter: 'sara' })).toBe(false);
    expect(hasPresenterStamp({ demoPresenter: 'alex' })).toBe(false);
    expect(hasPresenterStamp({ demoPresenter: 'bogus' })).toBe(false);
    expect(hasPresenterStamp({ demoPresenter: 42 })).toBe(false);
    expect(hasPresenterStamp({})).toBe(false);
    expect(hasPresenterStamp(null)).toBe(false);
    expect(hasPresenterStamp(undefined)).toBe(false);
  });

  it('agrees with farewellSpeakerName on every stamp shape', () => {
    // One predicate, two consumers: the banner name and the gate
    // scope can never drift apart.
    for (const stamp of ['frank', 'latina', 'black-professional-lady', 'aspen', 'sara', 'bogus']) {
      const named = farewellSpeakerName({ name: 'ZZZ', demoPresenter: stamp });
      expect(hasPresenterStamp({ demoPresenter: stamp })).toBe(named !== 'ZZZ');
    }
  });
});

describe('double-close gate — one closing line is spoken, presenter path', () => {
  // Live proof (2026-11-14, session b8e5bc63, Publish #51 code): the
  // visitor said "Okay, bye-bye" and the stored final turn was TWO
  // closings — "Thank you so much for calling Michael Martinez
  // Realtor. Have a great day!" + "Thank you for calling Michael
  // Martinez Realtor." #51 had already removed the proxy's closing
  // injection; the second line is a second model turn elicited
  // inside the armed 9s window (the closing turn's own tool call
  // resolving there) whose output nothing gated. The gate below
  // makes the close single BY CONSTRUCTION on the presenter path.
  const src = read('supabase/functions/gemini-live-proxy/index.ts');

  it('scopes the gate to presenter-stamped sessions only', () => {
    expect(src).toContain('const presenterFarewellSession = hasPresenterStamp(config)');
    expect(src).toContain('const farewellGateActive = () => presenterFarewellSession && farewellTimer !== undefined');
  });

  it('swallows assistant audio/text after the farewell is armed (no second spoken closing)', () => {
    expect(src).toContain('const gatePostFarewellOutput = farewellGateActive()');
    expect(src).toContain('if (sc.modelTurn?.parts && !gatePostFarewellOutput) {');
    // The gate is computed inside the serverContent flow, before the
    // forwarding loops — and the closing turn itself is never gated,
    // because its parts are forwarded before its turnComplete arms
    // the end (farewellTimer is still undefined at that point).
    const gateAt = src.indexOf('const gatePostFarewellOutput = farewellGateActive()');
    expect(gateAt).toBeGreaterThan(src.indexOf('const sc = msg.serverContent'));
    expect(src.indexOf('if (sc.modelTurn?.parts && !gatePostFarewellOutput) {')).toBeGreaterThan(gateAt);
  });

  it('keeps the swallowed turn out of the transcript and the usage meter too', () => {
    expect(src).toContain('if (sc.outputTranscription?.text && !gatePostFarewellOutput) {');
    // Metering + recording live inside the gated modelTurn block:
    // the audio accounting line sits between the gate and the
    // transcription branch, so a swallowed turn is never billed or
    // recorded as if the visitor had heard it.
    const gateAt = src.indexOf('if (sc.modelTurn?.parts && !gatePostFarewellOutput) {');
    const meterAt = src.indexOf('outputAudioSeconds += pcmSeconds', gateAt);
    const captureAt = src.indexOf("captureAudio('assistant'", gateAt);
    const transcriptAt = src.indexOf('if (sc.outputTranscription?.text && !gatePostFarewellOutput) {', gateAt);
    expect(meterAt).toBeGreaterThan(gateAt);
    expect(captureAt).toBeGreaterThan(gateAt);
    expect(transcriptAt).toBeGreaterThan(captureAt);
  });

  it('does not let a tool call lift an armed presenter farewell (the eliciting path)', () => {
    expect(src).toContain('if (!farewellGateActive()) cancelFarewellEnd();');
    // The tool response itself is still sent — only the cancel is
    // stood down, so the provider session stays protocol-valid and
    // the follow-up turn is generated into the gate, not the room.
    expect(src).toContain('toolResponse:{functionResponses:');
  });

  it('never elicits a pacing turn inside the armed window', () => {
    const pacingAt = src.indexOf('At the next natural pause after this five-minute checkpoint');
    expect(pacingAt).toBeGreaterThan(-1);
    expect(src.slice(Math.max(0, pacingAt - 400), pacingAt)).toContain('if (!farewellGateActive()) geminiWs.send');
  });

  it('leaves the visitor-driven cancels armed (speaking again still saves the call)', () => {
    // Input transcription and the non-farewell turnComplete cancel
    // are NOT gated: they are how a visitor who changed their mind
    // lifts the end, and the output gate lifts with the timer.
    expect(src).toContain('if (farewellTimer && callerUtterance.trim()');
    expect(src).toContain('} else if (farewellTimer && completedUtterance.trim() && !detectFarewell(completedUtterance)) {');
    const inputAt = src.indexOf('if (sc.inputTranscription?.text) {');
    expect(src.slice(inputAt, inputAt + 900)).not.toContain('gatePostFarewellOutput');
  });
});

describe('presenter prompt — one closing line, declared once', () => {
  it('every presenter parent prompt carries the single-close rule', () => {
    for (const id of ['frank', 'latina', 'black-professional-lady'] as const) {
      const prompt = presenterSimulationPrompt(personaFor(id));
      expect(prompt).toContain('ONE CLOSING LINE — TOTAL');
      expect(prompt).toContain('never follow your closing line with a second thank-you');
      expect(prompt.endsWith(PRESENTER_SINGLE_CLOSE_RULE)).toBe(true);
    }
  });

  it('the rule names the stacking it bans: same turn and later turns', () => {
    expect(PRESENTER_SINGLE_CLOSE_RULE).toContain('not in the same turn, and not in a later turn either');
    expect(PRESENTER_SINGLE_CLOSE_RULE).toContain('do not close again: stay silent and let the session end');
  });

  it('Aspen-fronted prompts stay byte-identical: the rule is absent', () => {
    expect(SIMULATION_PROMPT).not.toContain('ONE CLOSING LINE — TOTAL');
    expect(SIMULATION_PROMPT_SWAP_PARENT).not.toContain('ONE CLOSING LINE — TOTAL');
  });

  it('persona segment prompts stay byte-identical: the rule is absent', () => {
    expect(personaSegmentPrompt('sara', 'doorway', 'Martinez Realtors', SIMULATION_PROMPT).systemPrompt).not.toContain('ONE CLOSING LINE — TOTAL');
    expect(personaSegmentPrompt('aspen', 'stepout', 'Martinez Realtors', SIMULATION_PROMPT).systemPrompt).not.toContain('ONE CLOSING LINE — TOTAL');
  });
});
