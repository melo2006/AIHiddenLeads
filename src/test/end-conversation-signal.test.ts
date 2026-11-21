// End-conversation signal — client half (2026-11-21, homepage-test
// item 1). Ron asked Aspen to hang up; she said goodbye and the
// session lingered ~60 s because the goodbye reset the silence
// clock and the whole ladder had to run. The client now consumes a
// prompt-layer signal token (END_CONVERSATION_SIGNAL) from the
// assistant's final line: the token never reaches captions, the
// live partial or the stored transcript, and the session closes
// promptly after the farewell instead of entering the ladder.
// The prompt hook itself (and the proxy's end_conversation tool)
// is a separate follow-up — see src/lib/endConversation.ts.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  consumeEndConversationSignal,
  endSignalVisibleChunk,
  END_CONVERSATION_SIGNAL,
  END_SIGNAL_MAX_WAIT_MS,
} from '@/lib/endConversation';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

describe('consumeEndConversationSignal — the accumulated line', () => {
  it('strips the token from a completed farewell and reports the signal', () => {
    const out = consumeEndConversationSignal(`Thanks for calling — goodbye for now! ${END_CONVERSATION_SIGNAL}`);
    expect(out.signalled).toBe(true);
    expect(out.visible).toBe('Thanks for calling — goodbye for now! ');
    expect(out.visible).not.toContain('END_CONVERSATION');
  });

  it('withholds a trailing partial build-up without reporting a signal', () => {
    const partial = consumeEndConversationSignal('Thanks for calling — goodbye for now! [[END_CON');
    expect(partial.signalled).toBe(false);
    expect(partial.visible).toBe('Thanks for calling — goodbye for now! ');
    // Even a single leading bracket of the token is withheld.
    expect(consumeEndConversationSignal('Goodbye! [').visible).toBe('Goodbye! ');
  });

  it('leaves ordinary speech untouched — brackets that are not the token survive', () => {
    const line = 'Our plan costs [see the pricing page] and starts Monday.';
    const out = consumeEndConversationSignal(line);
    expect(out.signalled).toBe(false);
    expect(out.visible).toBe(line);
    expect(consumeEndConversationSignal('').visible).toBe('');
  });

  it('a line that is only the token becomes empty, and every occurrence is removed', () => {
    expect(consumeEndConversationSignal(END_CONVERSATION_SIGNAL)).toEqual({ visible: '', signalled: true });
    const twice = consumeEndConversationSignal(`${END_CONVERSATION_SIGNAL} bye ${END_CONVERSATION_SIGNAL}`);
    expect(twice).toEqual({ visible: ' bye ', signalled: true });
  });
});

describe('endSignalVisibleChunk — the incremental caption feed', () => {
  it('cuts a chunk at the start of the token or of its partial build-up', () => {
    expect(endSignalVisibleChunk(`care. ${END_CONVERSATION_SIGNAL}`)).toBe('care. ');
    expect(endSignalVisibleChunk('care. [[END_C')).toBe('care. ');
    expect(endSignalVisibleChunk('Take care now.')).toBe('Take care now.');
  });
});

describe('client wiring — GeminiConversation', () => {
  const src = read('src/components/GeminiConversation.tsx');

  it('both sockets consume the signal from the growing line and close on the completed farewell', () => {
    expect(src).toContain("from '@/lib/endConversation'");
    // Consumption runs in BOTH aspen_transcript handlers.
    expect(src.match(/consumeEndConversationSignal\(aspenLineRef\.current\)/g)?.length).toBe(2);
    expect(src.match(/if \(consumed\.signalled\) endSignalRef\.current = true;/g)?.length).toBe(2);
    // The close fires from BOTH turn_complete handlers.
    expect(src.match(/if \(endSignalRef\.current && liveRef\.current\) closeOnEndSignal\(\);/g)?.length).toBe(2);
  });

  it('new visitor speech or a barge-in cancels the pending close in both sockets', () => {
    expect(src.match(/if \(endSignalRef\.current\) cancelEndSignalClose\(\);/g)?.length).toBe(4);
  });

  it('the close is capped and drains first — never the silence ladder', () => {
    expect(END_SIGNAL_MAX_WAIT_MS).toBe(2000);
    expect(src).toContain('const deadline = Date.now() + END_SIGNAL_MAX_WAIT_MS;');
    expect(src).toContain('const drained = sourcesRef.current.size === 0 && !idleRef.current.generating;');
    // The signal end routes through the visitor-requested end path.
    expect(src).toContain('if (drained || Date.now() >= deadline) { endSignalRef.current = false; endByVisitor(); return; }');
  });

  it('the lib carries the clearly-marked prompt hook for the prompt layer to adopt', () => {
    const lib = read('src/lib/endConversation.ts');
    expect(lib).toContain('PROMPT HOOK — FOR THE PROMPT LAYER TO ADOPT');
    expect(lib).toContain('export const END_CONVERSATION_SIGNAL = "[[END_CONVERSATION]]";');
  });
});
