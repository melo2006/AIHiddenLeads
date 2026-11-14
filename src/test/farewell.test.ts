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
} from '../../supabase/functions/_shared/farewell';

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
