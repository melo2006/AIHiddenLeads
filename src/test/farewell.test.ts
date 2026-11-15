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
  FAREWELL_PERSISTENCE_MAX_WORDS,
  FAREWELL_REPEAT_END_DELAY_MS,
  detectFarewell,
  detectFarewellLeadIn,
  detectFarewellPersistence,
  detectFarewellSoftClose,
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

  it('arms on the visitor\'s clear goodbye, never for previews or before the visitor began', () => {
    // Round 2: farewellHandled marks the DELIVERED state, not a
    // once-ever latch — a revival resets it (pinned below), so this
    // same condition arms again on a later goodbye.
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
      src.indexOf('FAREWELL_END_DELAY_MS', src.indexOf('detectFarewell(completedUtterance)')) + 'FAREWELL_END_DELAY_MS'.length,
    );
    expect(farewellBlock).toContain('farewellHandled = true');
    expect(farewellBlock).toContain('armFarewellEnd(FAREWELL_END_DELAY_MS');
    expect(src).toContain("armFarewellEnd(FAREWELL_END_DELAY_MS, 'timer')");
    expect(farewellBlock).not.toContain('clientContent');
    expect(farewellBlock).not.toContain('geminiWs.send');
  });

  it('armFarewellEnd is the single scheduling point: banner, visitor_goodbye, path stamp, closeAll', () => {
    // Farewell round 2 (2026-11-14): every farewell end — first arm,
    // repeat-goodbye prompt end, tool-window re-arm — goes through
    // the one helper, so the firing behavior can never drift between
    // paths: the timer posts the banner, stamps the end path for the
    // session record, and closes the session from our side.
    const armAt = src.indexOf('const armFarewellEnd = (delayMs: number, path: string) => {');
    expect(armAt).toBeGreaterThan(-1);
    const armBlock = src.slice(armAt, src.indexOf('}, delayMs)', armAt));
    expect(armBlock).toContain('farewellTimer = setTimeout');
    expect(armBlock).toContain("endReason = 'visitor_goodbye'; closeCode = 1000; farewellEndPath = path");
    expect(armBlock).toContain('Call ended — thanks for talking with ${speakerDisplayName}.');
    expect(armBlock).toContain('closeAll()');
    // No other place in the proxy schedules a farewell timer.
    expect(occurrences(src, 'farewellTimer = setTimeout')).toBe(1);
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

  it('cancels the armed end on new-topic speech, on any tool call, and in closeAll', () => {
    // inputTranscription fragment path (round 2: farewell-shaped
    // accumulations defer — see the round-2 describe below)
    expect(src).toContain('if (farewellTimer && callerUtterance.trim()');
    // turnComplete path: the revival branch of the round-2
    // classification (a completed non-farewell, non-persistence,
    // non-soft utterance) cancels — an EMPTY completed utterance
    // never cancels: it is the speaker's own closing turn or a tool
    // follow-up completing (live proof 2026-11-12, session 59d8731e)
    expect(src).toContain('farewellHandled = false');
    // tool dispatch + closeAll + armFarewellEnd + the paths above
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
    expect(farewellSpeakerName({ name: 'Denise', demoPresenter: 'black-professional-lady' })).toBe('Denise');
  });

  it('the presenter stamp outranks a stale or Aspen name field', () => {
    // The exact live defect shape (Ron, 2026-11-14): a Frank demo
    // whose session config still said "Aspen" thanked Aspen. With
    // the stamp present, the banner can never do that again.
    expect(farewellSpeakerName({ name: 'Aspen', demoPresenter: 'frank' })).toBe('Frank');
    expect(farewellSpeakerName({ name: 'Aspen', demoPresenter: 'latina' })).toBe('Monica');
    expect(farewellSpeakerName({ demoPresenter: 'frank' })).toBe('Frank');
    expect(farewellSpeakerName({ name: '', demoPresenter: 'black-professional-lady' })).toBe('Denise');
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
    // Input transcription and the turnComplete classification are
    // NOT gated: they are how a visitor who changed their mind lifts
    // the end, and the output gate lifts with the timer.
    expect(src).toContain('if (farewellTimer && callerUtterance.trim()');
    expect(src).toContain('} else if (farewellHandled && completedUtterance.trim()) {');
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

describe('detectFarewellPersistence — post-close repeats are still goodbyes', () => {
  // Farewell round 2 (2026-11-14). Live proof, session 4f161ea7
  // (Publish #52, Martinez/Frank): the closing line was delivered,
  // and the visitor then said goodbye THREE more times — the three
  // verbatim utterances below. detectFarewell rejects every one
  // (the \bsaid\b reported-speech guard, the question form, the
  // extra words) and round 1 treated each as a revival that
  // cancelled the armed end; the session ran 428s and ended
  // user_ended — the visitor had to kill it himself. Persistence is
  // consulted ONLY after the close has been delivered, where the
  // risk calculus flips: ending is the low-harm read.
  const positives = [
    // The three evidence utterances, verbatim:
    "Go ahead and hang up. I said goodbye. You're still there.",
    "I said goodbye and you're still there. How come? You're not hanging up?",
    "I said goodbye. Aren't you going to hang up?",
    // Variants of the same intent:
    'I already said goodbye', 'I just said bye', 'I said',
    'You can hang up now', 'Just hang up already', 'please disconnect me',
    'Are you still there?', "Why haven't you hung up?",
    "that's all, hang up", 'end the call', 'okay, goodbye, thank you',
    // Deliberate difference from detectFarewell: pre-close this is a
    // plan, not a sign-off; POST-close (the visitor already said a
    // clean goodbye and heard the closing line) it is a sign-off
    // with a plan attached, and ending is correct.
    'see you at the showing tomorrow at 3',
  ];
  for (const utterance of positives) {
    it(`persists: ${JSON.stringify(utterance)}`, () => {
      expect(detectFarewellPersistence(utterance)).toBe(true);
    });
  }

  it('the persistence word cap is wider than the first-trigger cap', () => {
    expect(FAREWELL_PERSISTENCE_MAX_WORDS).toBe(24);
    expect(FAREWELL_PERSISTENCE_MAX_WORDS).toBeGreaterThan(FAREWELL_MAX_WORDS);
  });

  it('rejects a ramble past the cap even with a farewell anchor', () => {
    expect(detectFarewellPersistence('bye and I wanted to tell you the whole story about my cousin and his boat and the lake house and everything that happened last summer at the marina with all of our friends')).toBe(false);
  });
});

describe('detectFarewellPersistence — post-close revivals and prohibitions are rejected', () => {
  const negatives: [string, string][] = [
    ["don't hang up", 'a prohibition, not a demand'],
    ['do not disconnect me', 'a prohibition'],
    ["I'm not ready to say goodbye", 'not ready yet'],
    ["I'm not done yet", 'not done — keep talking'],
    ['my client said goodbye to the seller', 'third-party reported speech'],
    ['he said goodbye earlier', 'third-party reported speech'],
    ['bye — wait, one more question', 'a new request attached'],
    ["bye, and also what's the deposit?", 'a topic question attached'],
    ['I have to go over the pricing with you', 'go over ≠ go'],
    ['wait, tell me about the garage', 'a new request'],
    ['hold on, what about parking', 'a new topic'],
    ['Before you go, what is the deposit?', 'a revival with a topic question'],
    ['I said I wanted the list emailed to me', 'close business continuing, not a repeat goodbye'],
    ['hello, can you help me with pricing?', 'an ordinary opening'],
    ['', 'empty'],
  ];
  for (const [utterance, why] of negatives) {
    it(`rejects (${why}): ${JSON.stringify(utterance)}`, () => {
      expect(detectFarewellPersistence(utterance)).toBe(false);
    });
  }
});

describe('detectFarewellSoftClose — post-close politeness is neither end-demand nor revival', () => {
  const positives = [
    'thank you', 'thanks', 'ok', 'okay, thank you', 'thank you so much',
    'thanks so much', 'thanks very much', 'you too', 'same to you',
    'have a good day', 'have a great day', 'sounds good', 'great, thanks',
    'perfect', 'much appreciated',
  ];
  for (const utterance of positives) {
    it(`soft: ${JSON.stringify(utterance)}`, () => {
      expect(detectFarewellSoftClose(utterance)).toBe(true);
    });
  }
  const negatives: [string, string][] = [
    ["thank you, but what's the price?", 'politeness plus a question is a revival'],
    ['thanks, can you send the list?', 'politeness plus a request is a revival'],
    ['ok, what time?', 'a question is a revival'],
    ['thank you, hang up', 'a hang-up demand is persistence, not soft'],
    ['thank you for the information about the pricing plans', 'substantive content'],
    ['great, tell me more', 'an invitation to continue'],
    ['', 'empty'],
  ];
  for (const [utterance, why] of negatives) {
    it(`rejects (${why}): ${JSON.stringify(utterance)}`, () => {
      expect(detectFarewellSoftClose(utterance)).toBe(false);
    });
  }
});

describe('detectFarewellLeadIn — fragments that must not cancel the armed end mid-utterance', () => {
  const positives = [
    'go ahead', 'go ahead and', 'go ahead and hang', 'I said',
    "you're still", "I said goodbye you're still", 'please hang',
  ];
  for (const utterance of positives) {
    it(`lead-in: ${JSON.stringify(utterance)}`, () => {
      expect(detectFarewellLeadIn(utterance)).toBe(true);
    });
  }
  const negatives = ['wait actually what', 'tell me the price', 'my wife said we', 'what about the garage', ''];
  for (const utterance of negatives) {
    it(`not a lead-in: ${JSON.stringify(utterance)}`, () => {
      expect(detectFarewellLeadIn(utterance)).toBe(false);
    });
  }
});

describe('farewell round 2 — after the close, the session actually ends', () => {
  const src = read('supabase/functions/gemini-live-proxy/index.ts');

  it('the repeat-goodbye grace is short: 1.5 seconds', () => {
    expect(FAREWELL_REPEAT_END_DELAY_MS).toBe(1500);
    expect(FAREWELL_REPEAT_END_DELAY_MS).toBeLessThan(FAREWELL_END_DELAY_MS);
  });

  it('classifies post-close speech at turnComplete instead of cancelling on any non-farewell', () => {
    expect(src).toContain('} else if (farewellHandled && completedUtterance.trim()) {');
    expect(src).toContain('if (detectFarewell(completedUtterance) || detectFarewellPersistence(completedUtterance)) {');
  });

  it('a repeat goodbye ends the session promptly, from our side', () => {
    expect(src).toContain('farewellRepeats += 1');
    expect(src).toContain("armFarewellEnd(FAREWELL_REPEAT_END_DELAY_MS, 'repeat_goodbye')");
  });

  it('politeness after the close leaves the armed end standing (and re-arms a tool-consumed one)', () => {
    expect(src).toContain('} else if (detectFarewellSoftClose(completedUtterance)) {');
    expect(src).toContain("if (!farewellTimer) armFarewellEnd(FAREWELL_END_DELAY_MS, 'timer')");
  });

  it('a genuine new topic revives — and RESETS the flag so a later goodbye can close again', () => {
    // Round 1's stranding bug: farewellHandled was once-ever, so a
    // revived session could never be farewell-ended again.
    const reviveAt = src.indexOf('farewellRevivals += 1');
    expect(reviveAt).toBeGreaterThan(-1);
    const reviveBlock = src.slice(reviveAt, src.indexOf('cancelFarewellEnd()', reviveAt));
    expect(reviveBlock).toContain('farewellHandled = false');
  });

  it('a tool-consumed window re-arms on the empty follow-up turn — unless a handoff or transfer continues the call', () => {
    expect(src).toContain('} else if (farewellHandled && !farewellTimer && !handoffReturnHandled && !managerTransferRequested) {');
  });

  it('the fragment cancel defers on farewell-shaped accumulations', () => {
    expect(src).toContain('!detectFarewellPersistence(callerUtterance) && !detectFarewellSoftClose(callerUtterance) && !detectFarewellLeadIn(callerUtterance)) cancelFarewellEnd()');
  });

  it('stamps the ending in the session record: last_error suffix + call-history metadata', () => {
    expect(src).toContain('farewell_path=${farewellEndPath}');
    expect(src).toContain('farewell_end_path:farewellEndPath || null');
    expect(src).toContain('farewell_repeats:farewellRepeats');
    expect(src).toContain('farewell_revivals:farewellRevivals');
  });

  it('the round-1 output gate is untouched: still keyed on the armed timer, presenter scope only', () => {
    expect(src).toContain('const farewellGateActive = () => presenterFarewellSession && farewellTimer !== undefined');
    // Inside the post-close classification, the ONLY cancel is the
    // revival branch: the repeat and soft paths re-arm or stand, so
    // the gate (which follows the timer) never drops between the
    // delivered close and the end.
    const classAt = src.indexOf('} else if (farewellHandled && completedUtterance.trim()) {');
    const classBlock = src.slice(classAt, src.indexOf('} else if (farewellHandled && !farewellTimer', classAt));
    expect(occurrences(classBlock, 'cancelFarewellEnd()')).toBe(1);
    expect(occurrences(classBlock, 'armFarewellEnd(')).toBe(2);
  });
});
