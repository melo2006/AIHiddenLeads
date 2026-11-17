// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  assignSegmentTiming, countClarifications, formatClock, isClarificationTurn,
  mergeTranscriptFragments, parseConversationSummary, parseTranscriptString,
  speakerOf, wavDurationSeconds,
} from '@/lib/conversationDetail';

// Ron's 2026-11-17 screenshot: the Demo History record whose stored
// transcript was Gemini's streamed fragments, one per line.
const SCREENSHOT_FRAGMENTS = [
  { role: 'assistant', text: 'Good afternoon, and' },
  { role: 'assistant', text: 'thanks for calling' },
  { role: 'assistant', text: 'AI Hidden Leads!' },
  { role: 'assistant', text: "I'm Aspen." },
  { role: 'assistant', text: 'Did you know that' },
  { role: 'assistant', text: '67%' },
  { role: 'assistant', text: 'of callers hang' },
  { role: 'assistant', text: "up the moment they can't" },
  { role: 'assistant', text: 'reach a real person?' },
  { role: 'assistant', text: 'And may I have your' },
  { role: 'assistant', text: 'name, so I can greet' },
  { role: 'assistant', text: 'you by it?' },
];

describe('mergeTranscriptFragments', () => {
  test('merges the screenshot fragments into ONE assistant turn', () => {
    const turns = mergeTranscriptFragments(SCREENSHOT_FRAGMENTS);
    expect(turns).toHaveLength(1);
    expect(turns[0].speaker).toBe('assistant');
    expect(turns[0].text).toBe(
      "Good afternoon, and thanks for calling AI Hidden Leads! I'm Aspen. " +
      "Did you know that 67% of callers hang up the moment they can't reach a real person? " +
      'And may I have your name, so I can greet you by it?',
    );
    expect(turns[0].fragmentCount).toBe(SCREENSHOT_FRAGMENTS.length);
  });

  test('never merges across speakers; alternation stays separate', () => {
    const turns = mergeTranscriptFragments([
      { role: 'assistant', text: 'Hello,' },
      { role: 'assistant', text: 'how can I help?' },
      { role: 'caller', text: 'I need' },
      { role: 'caller', text: 'a quote.' },
      { role: 'assistant', text: 'Of course.' },
      { role: 'caller', text: 'Thanks.' },
    ]);
    expect(turns.map((t) => [t.speaker, t.text])).toEqual([
      ['assistant', 'Hello, how can I help?'],
      ['caller', 'I need a quote.'],
      ['assistant', 'Of course.'],
      ['caller', 'Thanks.'],
    ]);
  });

  test('chat roles (user) normalize to the caller side', () => {
    const turns = mergeTranscriptFragments([
      { role: 'user', text: 'How much' },
      { role: 'user', text: 'does it cost?' },
      { role: 'assistant', text: 'Premium is $99 a month.' },
    ]);
    expect(turns).toHaveLength(2);
    expect(turns[0]).toMatchObject({ speaker: 'caller', label: 'Caller', text: 'How much does it cost?' });
    expect(turns[1].label).toBe('Assistant');
  });

  test('drops empty fragments and tolerates nullish input', () => {
    expect(mergeTranscriptFragments(null)).toEqual([]);
    expect(mergeTranscriptFragments(undefined)).toEqual([]);
    expect(mergeTranscriptFragments([{ role: 'assistant', text: '  ' }, { role: 'assistant', text: 'Hi.' }]))
      .toEqual([{ speaker: 'assistant', label: 'Assistant', text: 'Hi.', fragmentCount: 1 }]);
  });

  test('speakerOf labels unknown roles as themselves', () => {
    expect(speakerOf('caller')).toEqual({ speaker: 'caller', label: 'Caller' });
    expect(speakerOf('Assistant')).toEqual({ speaker: 'assistant', label: 'Assistant' });
    expect(speakerOf('system')).toEqual({ speaker: 'other', label: 'System' });
  });
});

describe('parseTranscriptString', () => {
  test('rebuilds fragments from a call_history "role: text" string', () => {
    const fragments = parseTranscriptString(
      SCREENSHOT_FRAGMENTS.map((f) => `${f.role}: ${f.text}`).join('\n'),
    );
    expect(fragments).toEqual(SCREENSHOT_FRAGMENTS);
    const turns = mergeTranscriptFragments(fragments);
    expect(turns).toHaveLength(1);
    expect(turns[0].text).toContain('Good afternoon, and thanks for calling AI Hidden Leads!');
  });

  test('treats lines without a known role prefix as continuations', () => {
    const fragments = parseTranscriptString('caller: I was saying\nthat pricing matters\nassistant: Of course.');
    expect(fragments).toEqual([
      { role: 'caller', text: 'I was saying that pricing matters' },
      { role: 'assistant', text: 'Of course.' },
    ]);
  });

  test('free text with no role lines comes back as one unlabeled fragment', () => {
    expect(parseTranscriptString('Just a note.')).toEqual([{ role: 'transcript', text: 'Just a note.' }]);
    expect(parseTranscriptString('')).toEqual([]);
    expect(parseTranscriptString(null)).toEqual([]);
  });
});

describe('clarification counting', () => {
  test('counts the "didn\'t catch that" family on assistant turns only', () => {
    const turns = mergeTranscriptFragments([
      { role: 'assistant', text: "Sorry, I didn't catch that." },
      { role: 'caller', text: 'I said pricing.' },
      { role: 'assistant', text: 'Could you repeat the address?' },
      { role: 'caller', text: '123 Main Street.' },
      { role: 'assistant', text: 'You are breaking up a little — say that again?' },
      { role: 'caller', text: "I didn't hear you either." },
      { role: 'assistant', text: 'Our Premium plan is $99 a month.' },
    ]);
    expect(countClarifications(turns)).toBe(3);
  });

  test('isClarificationTurn matches variants and rejects normal speech', () => {
    expect(isClarificationTurn("I didn't quite hear you.")).toBe(true);
    expect(isClarificationTurn('Not sure I caught that.')).toBe(true);
    expect(isClarificationTurn('Can you repeat that?')).toBe(true);
    expect(isClarificationTurn('Let me repeat your number back.')).toBe(false);
    expect(isClarificationTurn('Did you know that 67% of callers hang up?')).toBe(false);
  });
});

describe('parseConversationSummary — backward compatibility', () => {
  test('old-shape summaries (no tone/lead fields) parse unchanged', () => {
    const parsed = parseConversationSummary({
      summary: 'Visitor asked about missed calls.',
      needs: ['Answering'],
      nextSteps: ['Send demo link'],
      outreachDraft: 'Hi there…',
    });
    expect(parsed).toEqual({
      summary: 'Visitor asked about missed calls.',
      needs: ['Answering'],
      nextSteps: ['Send demo link'],
      outreachDraft: 'Hi there…',
      callerTone: undefined,
      toneEvidence: undefined,
      intent: undefined,
      leadRating: undefined,
      leadReason: undefined,
    });
  });

  test('extended summaries keep the AI assessment fields', () => {
    const parsed = parseConversationSummary({
      summary: 'Owner wants the phones covered.',
      needs: [], nextSteps: [], outreachDraft: '',
      callerTone: 'Interested', toneEvidence: 'Asked for pricing twice.',
      intent: 'Wants after-hours answering', leadRating: 'hot', leadReason: 'Asked to book this week.',
    });
    expect(parsed?.callerTone).toBe('interested');
    expect(parsed?.toneEvidence).toBe('Asked for pricing twice.');
    expect(parsed?.intent).toBe('Wants after-hours answering');
    expect(parsed?.leadRating).toBe('hot');
    expect(parsed?.leadReason).toBe('Asked to book this week.');
    expect(parsed?.outreachDraft).toBeUndefined();
  });

  test('invalid tone/rating values are dropped, never rendered', () => {
    const parsed = parseConversationSummary({
      summary: 'Short call.', needs: [], nextSteps: [], outreachDraft: 'x',
      callerTone: 'ecstatic', leadRating: 'lukewarm',
    });
    expect(parsed?.callerTone).toBeUndefined();
    expect(parsed?.leadRating).toBeUndefined();
  });

  test('plain-string summaries (call_history) become summary-only objects', () => {
    expect(parseConversationSummary('Caller asked about pricing.')).toEqual({
      summary: 'Caller asked about pricing.', needs: [], nextSteps: [],
    });
    expect(parseConversationSummary('')).toBeNull();
    expect(parseConversationSummary(null)).toBeNull();
    expect(parseConversationSummary(undefined)).toBeNull();
    expect(parseConversationSummary({ needs: [] })).toBeNull();
    expect(parseConversationSummary(42)).toBeNull();
  });
});

describe('segment timing', () => {
  test('wavDurationSeconds is exact for the pipeline WAV shapes', () => {
    // 2 s of caller audio: 16000 Hz × 2 bytes × 2 s + 44-byte header.
    expect(wavDurationSeconds(44 + 16000 * 2 * 2, 'caller')).toBe(2);
    // 3 s of assistant audio: 24000 Hz × 2 bytes × 3 s + header.
    expect(wavDurationSeconds(44 + 24000 * 2 * 3, 'assistant')).toBe(3);
    expect(wavDurationSeconds(44 + 1000, 'mixed')).toBeNull();
    expect(wavDurationSeconds(44, 'caller')).toBeNull();
    expect(wavDurationSeconds(null, 'caller')).toBeNull();
  });

  test('assigns turns to same-speaker segments with cumulative offsets', () => {
    const turns = mergeTranscriptFragments([
      { role: 'assistant', text: 'Welcome in.' },
      { role: 'caller', text: 'Hi there.' },
      { role: 'assistant', text: 'How can I help you today?' },
    ]);
    const timing = assignSegmentTiming(turns, [
      { speaker: 'assistant', durationSeconds: 5 },
      { speaker: 'caller', durationSeconds: 4 },
      { speaker: 'assistant', durationSeconds: 6 },
    ]);
    expect(timing.segmentStartSeconds).toEqual([0, 5, 9]);
    // Both assistant turns exist but the two assistant segments split
    // them by text share; the caller turn lands on the caller segment.
    expect(timing.turnSegmentIndex[1]).toBe(1);
    expect(timing.turnOffsetSeconds[1]).toBe(5);
    expect(timing.turnSegmentIndex[0]).toBe(0);
    expect(timing.turnSegmentIndex[2]).toBe(2);
    expect(timing.turnOffsetSeconds[2]).toBe(9);
  });

  test('omits all timing when any segment duration is unknown', () => {
    const turns = mergeTranscriptFragments([{ role: 'assistant', text: 'Hi.' }]);
    const timing = assignSegmentTiming(turns, [
      { speaker: 'assistant', durationSeconds: 5 },
      { speaker: 'caller', durationSeconds: null },
    ]);
    expect(timing.segmentStartSeconds).toEqual([null, null]);
    expect(timing.turnSegmentIndex).toEqual([null]);
    expect(timing.turnOffsetSeconds).toEqual([null]);
  });

  test('formatClock renders m:ss', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(7)).toBe('0:07');
    expect(formatClock(80)).toBe('1:20');
    expect(formatClock(725)).toBe('12:05');
  });
});

describe('server summarizer contract (source pins)', () => {
  const src = readFileSync('supabase/functions/_shared/conversation-records.ts', 'utf8');
  test('SummarySchema carries the optional assessment fields', () => {
    expect(src).toContain("callerTone: z.enum(['calm', 'interested', 'frustrated', 'angry', 'neutral']).optional()");
    expect(src).toContain("leadRating: z.enum(['hot', 'warm', 'cold']).optional()");
    expect(src).toContain('toneEvidence: z.string().optional()');
    expect(src).toContain('intent: z.string().optional()');
    expect(src).toContain('leadReason: z.string().optional()');
  });
  test('the prompt asks for the assessment and allows omission over guessing', () => {
    expect(src).toContain('callerTone');
    expect(src).toContain('leadRating');
    expect(src).toContain('rather than guessing');
  });
  test('the recipient copy action still strips the summary to the public shape', () => {
    const fn = readFileSync('supabase/functions/conversation-records/index.ts', 'utf8');
    expect(fn).toContain('summary:r.summary?{summary:r.summary.summary,needs:r.summary.needs,nextSteps:r.summary.nextSteps}:null');
  });
});
