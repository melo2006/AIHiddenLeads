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

describe('proxy wiring — PARKED (INCIDENT 2026-11-12 rollback)', () => {
  const src = read('supabase/functions/gemini-live-proxy/index.ts');

  it('the farewell wiring is NOT in the deployed proxy while it is rolled back', () => {
    // On 2026-11-12 the provider began closing every Edge session at
    // setup (code 1011) after the Batch 1/2 function deploys; the Edge
    // proxy was rolled back to the last-known-good 17331b2 file. The
    // detector module and its tests above remain in the tree; this
    // wiring returns with the Batch 1 proxy re-land.
    expect(src).not.toContain('detectFarewell(');
    expect(src).not.toContain('visitor_goodbye');
  });
});
