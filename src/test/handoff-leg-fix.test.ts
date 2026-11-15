// Handoff-leg fix (2026-11-14): the browser handoff leg's return
// path. Tonight's live evidence (homepage Aspen, Edge route):
//  - Round B: Aspen announced the transfer correctly; the return
//    session was authorized but NEVER STARTED, and the panel
//    showed "Microphone permission was denied" — the mid-leg
//    teardown had stopped the mic tracks and the silent
//    reconnect's fresh getUserMedia (no user gesture, Twilio
//    device still releasing its capture) was refused.
//  - Round A: the return session DID start, but its first turn
//    was the transfer announcement AGAIN, concatenated with the
//    welcome-back — the visit-memory recap's last assistant line
//    IS the announcement, and the drop-reconnect opening tells
//    the model to continue from the recap.
//  - Neither round left any handoff outcome on the session
//    record: whether the manager's phone rang was unknowable.
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearRetainedHandoffMic,
  fitHandoffRecap,
  handoffDiagDetail,
  handoffDiagPayload,
  handoffDiagSignature,
  handoffVisitFact,
  hasRetainedHandoffMic,
  isHandoffAnnouncement,
  micStreamIsLive,
  retainHandoffMic,
  reusableMicStream,
  stripHandoffAnnouncement,
  takeRetainedHandoffMic,
  type MicStreamLike,
} from '@/lib/handoffRecovery';
import { resumeRecap } from '@/components/GeminiConversation';
import { managerTransferAnnouncement } from '../../supabase/functions/_shared/manager-transfer';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

const ANNOUNCEMENT = "I'll transfer you to Ron from AI Hidden Leads now. I'll stay right here until you're through — then I'll step away, and you can talk to Ron directly.";

function fakeStream(readyState: string) {
  const track = { readyState, stop: vi.fn() };
  const stream: MicStreamLike = { getAudioTracks: () => [track] };
  return { stream, track };
}

afterEach(() => { clearRetainedHandoffMic(); });

describe('mic survival — the return start reuses a live stream instead of re-asking', () => {
  it('micStreamIsLive reads the track, not the wrapper', () => {
    expect(micStreamIsLive(fakeStream('live').stream)).toBe(true);
    expect(micStreamIsLive(fakeStream('ended').stream)).toBe(false);
    expect(micStreamIsLive(null)).toBe(false);
    expect(micStreamIsLive(undefined)).toBe(false);
  });

  it('reusableMicStream prefers the wired-in stream, then the retained one, else null', () => {
    const current = fakeStream('live').stream;
    const retained = fakeStream('live').stream;
    expect(reusableMicStream(current, retained)).toBe(current);
    expect(reusableMicStream(fakeStream('ended').stream, retained)).toBe(retained);
    expect(reusableMicStream(null, retained)).toBe(retained);
    expect(reusableMicStream(fakeStream('ended').stream, fakeStream('ended').stream)).toBeNull();
    expect(reusableMicStream(null, null)).toBeNull();
  });

  it('the stash hands the retained stream to exactly one return start', () => {
    const { stream } = fakeStream('live');
    retainHandoffMic(stream);
    expect(hasRetainedHandoffMic()).toBe(true);
    expect(takeRetainedHandoffMic()).toBe(stream);
    expect(hasRetainedHandoffMic()).toBe(false);
    expect(takeRetainedHandoffMic()).toBeNull();
  });

  it('a stream whose track ended while stashed is stopped, never handed out', () => {
    const { stream, track } = fakeStream('live');
    retainHandoffMic(stream);
    track.readyState = 'ended';
    expect(takeRetainedHandoffMic()).toBeNull();
    expect(track.stop).toHaveBeenCalledTimes(1);
  });

  it('an already-ended stream is never stashed; clearing stops a stashed stream', () => {
    retainHandoffMic(fakeStream('ended').stream);
    expect(hasRetainedHandoffMic()).toBe(false);
    const { stream, track } = fakeStream('live');
    retainHandoffMic(stream);
    clearRetainedHandoffMic();
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(hasRetainedHandoffMic()).toBe(false);
  });
});

describe('no announcement replay — the return recap is built without the say-it-once line', () => {
  const turns = [
    { role: 'user', text: 'Can you transfer me to a manager?' },
    { role: 'assistant', text: ANNOUNCEMENT },
  ];

  it('the leak, proven: the unstripped recap carries the announcement as its last line', () => {
    expect(resumeRecap(turns as never)).toContain(ANNOUNCEMENT);
  });

  it('the stripped recap keeps the conversation but not the announcement', () => {
    const recap = resumeRecap(stripHandoffAnnouncement(turns, ANNOUNCEMENT) as never);
    expect(recap).toBeUndefined(); // only the visitor's ask remains — no assistant line, no recap
    const longer = [
      { role: 'assistant', text: 'Welcome in. What does your business do?' },
      { role: 'user', text: 'Auto repair. Can you transfer me to a manager?' },
      { role: 'assistant', text: ANNOUNCEMENT },
    ];
    const stripped = resumeRecap(stripHandoffAnnouncement(longer, ANNOUNCEMENT) as never);
    expect(stripped).toContain('Auto repair');
    expect(stripped).not.toContain("I'll transfer you to");
  });

  it('only the assistant’s exact announcement turn is cut — quotes and other lines survive', () => {
    const mixed = [
      { role: 'assistant', text: 'Earlier line.' },
      { role: 'user', text: ANNOUNCEMENT }, // the visitor quoting it back is data, not the announcement
      { role: 'assistant', text: ANNOUNCEMENT },
      { role: 'assistant', text: 'Another line.' },
    ];
    const kept = stripHandoffAnnouncement(mixed, ANNOUNCEMENT);
    expect(kept).toHaveLength(3);
    expect(kept[1].role).toBe('user');
    expect(kept.some((t) => t.role === 'assistant' && t.text === ANNOUNCEMENT)).toBe(false);
  });

  it('no match (or no announcement captured) returns the turns untouched — non-handoff recaps stay byte-identical', () => {
    const plain = [{ role: 'assistant', text: 'Hello.' }, { role: 'user', text: 'Hi.' }];
    expect(stripHandoffAnnouncement(plain, ANNOUNCEMENT)).toBe(plain);
    expect(stripHandoffAnnouncement(plain, null)).toBe(plain);
    expect(stripHandoffAnnouncement(plain, '')).toBe(plain);
  });

  it('isHandoffAnnouncement keys on the invariant opening every announcement variant shares', () => {
    expect(isHandoffAnnouncement(ANNOUNCEMENT)).toBe(true);
    expect(isHandoffAnnouncement("I'll transfer you to the manager now. I'll stay right here until you're through — then I'll step away, and you can talk to the manager directly.")).toBe(true);
    expect(isHandoffAnnouncement('Welcome back! I hope your call went well.')).toBe(false);
    expect(isHandoffAnnouncement('I can transfer you to a manager if you like.')).toBe(false);
  });

  it('the visit fact states the transfer already happened and forbids re-announcing, per outcome', () => {
    for (const outcome of ['completed', 'unavailable', 'unknown'] as const) {
      const fact = handoffVisitFact(outcome);
      expect(fact).toContain('[visit fact] managerHandoff:');
      expect(fact).toContain('already announced to the visitor word for word');
      expect(fact).toContain('Do not announce a transfer again.');
    }
    expect(handoffVisitFact('completed')).toContain('the visitor spoke with the manager');
    expect(handoffVisitFact('unavailable')).toContain('no manager answered');
    expect(handoffVisitFact('unknown')).toContain('interrupted before its outcome was known');
  });
});

describe('fitHandoffRecap — the fact rides without eating the opening (Publish #63)', () => {
  const fact = handoffVisitFact('completed');

  it('appends the fact untouched when the recap fits', () => {
    const recap = 'Visitor: My name is Tony Miller\nAssistant: Nice to meet you, Tony.';
    expect(fitHandoffRecap(recap, fact)).toBe(`${recap}\n${fact}`);
  });

  it('an over-budget recap drops whole lines from the middle — the opening and the newest lines survive', () => {
    const lines = [
      'Visitor: My name is Tony Miller',
      'Assistant: Nice to meet you, Tony.',
      ...Array.from({ length: 30 }, (_, i) => `Assistant: Filler line number ${i} ${'with some padding words '.repeat(30)}`),
      'Visitor: The last thing I said',
      'Assistant: The last reply',
    ];
    const out = fitHandoffRecap(lines.join('\n'), fact, 4_000);
    expect(out.length).toBeLessThanOrEqual(4_000);
    expect(out).toContain('Visitor: My name is Tony Miller');
    expect(out).toContain('Visitor: The last thing I said');
    expect(out).toContain('Assistant: The last reply');
    expect(out.endsWith(fact)).toBe(true);
    // No line was cut in half: every surviving recap line is whole.
    const whole = new Set(lines);
    for (const line of out.split('\n').slice(0, -1)) expect(whole.has(line)).toBe(true);
  });
});

describe('handoffDiag stamp — the leg leaves a trace on the session record', () => {
  it('renders the compact k=v line, one fact per key', () => {
    expect(handoffDiagDetail({ event: 'announced', outcome: '-', mic: 'live' })).toBe('ev=announced;out=-;mic=live');
    expect(handoffDiagDetail({ event: 'return-failed', outcome: 'unknown', mic: 'denied' })).toBe('ev=return-failed;out=unknown;mic=denied');
    expect(handoffDiagDetail({ event: 'return-ok', outcome: 'completed', mic: 'reused' })).toBe('ev=return-ok;out=completed;mic=reused');
  });

  it('payload is session-scoped and dedupe follows the micDiag discipline', () => {
    const a = handoffDiagPayload('session-1', { event: 'ended', outcome: 'completed', mic: 'live' }, 123);
    expect(a).toEqual({ sessionId: 'session-1', detail: 'ev=ended;out=completed;mic=live', at: 123 });
    const b = handoffDiagPayload('session-2', { event: 'ended', outcome: 'completed', mic: 'live' }, 123);
    expect(handoffDiagSignature(a)).not.toBe(handoffDiagSignature(b)); // a new session's first stamp always lands
    expect(handoffDiagSignature(a)).toBe(handoffDiagSignature({ ...a }));
    expect(a.detail.length).toBeLessThanOrEqual(400);
  });
});

describe('the announcement copy itself is untouched — only its replay dies', () => {
  it('managerTransferAnnouncement still builds tonight’s exact line', () => {
    expect(managerTransferAnnouncement({ transferManagerName: 'Ron', businessName: 'AI Hidden Leads' })).toBe(ANNOUNCEMENT);
    expect(managerTransferAnnouncement({})).toBe("I'll transfer you to the manager now. I'll stay right here until you're through — then I'll step away, and you can talk to the manager directly.");
  });
});

describe('client wiring — GeminiConversation', () => {
  const src = read('src/components/GeminiConversation.tsx');

  it('the return start adopts the retained stream before any fresh getUserMedia', () => {
    expect(src).toContain('takeRetainedHandoffMic<MediaStream>()');
    expect(src).toContain('reusableMicStream(micStreamRef.current, stashedMic)');
    expect(src).toContain('const micRequest: Promise<MediaStream> = retainedMic ?? navigator.mediaDevices.getUserMedia({');
    expect(src).toContain('if (retainedMic && stream === retainedMic) handoffMicReusedRef.current = true;');
  });

  it('a mid-leg teardown retains the mic stream instead of stopping it, and stamps the interruption', () => {
    expect(src).toContain('const micRetainedForReturn = handoffRef.current ? micStreamRef.current : null;');
    expect(src).toContain('stampHandoffDiagRef.current("interrupted", "unknown", handoffMicState())');
    expect(src).toContain('if (micRetainedForReturn) retainHandoffMic(micRetainedForReturn);');
    expect(src).toContain('if (micStreamRef.current && micStreamRef.current !== micRetainedForReturn) micStreamRef.current.getTracks().forEach((t) => t.stop());');
  });

  it('a deliberate end drops the retained stream — the mic never stays hot on an ended call', () => {
    const endByVisitor = src.slice(src.indexOf('const endByVisitor'), src.indexOf('MANUAL-STOP SEGMENT RESUME'));
    expect(endByVisitor).toContain('clearRetainedHandoffMic();');
  });

  it('the announcement is captured at the dial signal and again when the leg starts', () => {
    expect(src.match(/noteHandoffAnnouncement\(\);/g)?.length).toBeGreaterThanOrEqual(3); // both sockets + leg start
    expect(src).toContain('if (isHandoffAnnouncement(stored[i].text)) { handoffAnnouncementRef.current = stored[i].text; return; }');
  });

  it('the return recap strips the announcement and appends the visit fact, inside the raised cap', () => {
    expect(src).toContain('stripHandoffAnnouncement(memoryTurns, handoffAnnouncementRef.current)');
    expect(src).toContain('handoffVisitFact(handoffReturnRef.current.outcome)');
    // Publish #63: the old 1600-char tail-slice (which cut the
    // conversation's opening out of the return session's memory) is
    // gone; fitHandoffRecap appends the fact under the 16,000 cap.
    expect(src).toContain('resumeContext = fitHandoffRecap(resumeContext, fact);');
    expect(src).not.toContain('1600 - fact.length');
  });

  it('every leg transition stamps: announced, leg-started, ended, return-ok', () => {
    expect(src.match(/stampHandoffDiag\("announced", "-", handoffMicState\(\)\)/g)?.length).toBe(2); // both sockets
    expect(src).toContain('stampHandoffDiag("leg-started", "-", handoffMicState())');
    expect(src).toContain('stampHandoffDiag("ended", endedOutcome, handoffMicState())');
    expect(src).toContain('stampHandoffDiag("return-ok", handoffReturnRef.current.outcome, handoffMicReusedRef.current ? "reused" : handoffMicState())');
  });

  it('a mic-denied return stamps return-failed BEFORE the teardown clears the diag target', () => {
    const stampAt = src.indexOf('stampHandoffDiag("return-failed", handoffReturnRef.current.outcome, "denied")');
    expect(stampAt).toBeGreaterThan(-1);
    expect(src.indexOf('stopEverything();', stampAt)).toBeGreaterThan(stampAt);
    const guardAt = src.indexOf('e.message === MICROPHONE_DENIED');
    expect(guardAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(stampAt);
  });

  it('an in-session come-back closes the return window only when the outcome report was delivered', () => {
    expect(src).toContain('const socketOpen = wsRef.current?.readyState === WebSocket.OPEN;');
    expect(src).toContain('if (socketOpen) handoffReturnRef.current = null;');
  });
});

describe('server wiring — gemini-session accepts the handoffDiag stamp onto config.handoffDiag', () => {
  const src = read('supabase/functions/gemini-session/index.ts');

  it('the schema carries handoffDiag with the same shape as micDiag', () => {
    expect(src).toContain('const handoffDiagSchema=z.object({sessionId:z.string().uuid(),detail:z.string().max(400),at:z.number().optional()});');
    expect(src).toContain('handoffDiag:handoffDiagSchema.optional()');
  });

  it('the handler appends to config.handoffDiag under the same visitor-hash ownership, bounded to the last 30', () => {
    expect(src).toContain('if(b.handoffDiag) {');
    expect(src).toContain('handoffDiag:[...priorHandoff,handoffEntry].slice(-30)');
    expect(src).toContain('handoffRow.visitor_hash!==handoffVisitor');
  });
});
