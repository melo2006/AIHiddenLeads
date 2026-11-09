// Alex visitor-intent trigger (2026-11-09, Parkland Scientific forensics).
//
// The bug: the meet-alex swap armed ONLY when Aspen spoke an exact
// anchor phrase while the chain was in phase 'close'. After a drop the
// session restarted in 'host'; Aspen improvised the promise ("you'll be
// able to connect with Alex"), the visitor asked "where is Alex?"
// twice, she stalled and closed — no Alex segment was ever authorized.
// The fix listens to the VISITOR: visitorRequestsAlex matches intent in
// a visitor line, noteAlexIntent folds it into the swap state, and
// boundaryForAssistantLine then yields 'meet-alex' for Aspen's next
// line whatever words she uses — the same boundary the anchor path
// arms and executeSwap cuts over.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  boundaryForAssistantLine, INITIAL_SWAP_STATE, noteAlexIntent, visitorRequestsAlex,
  type SwapState,
} from '@/lib/personaSwap';
import { SIMULATION_CLOSE_SEGMENT } from '../../supabase/functions/_shared/voice-config';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
const inPhase = (phase: SwapState['phase'], extra: Partial<SwapState> = {}): SwapState => ({
  ...INITIAL_SWAP_STATE,
  phase,
  ...(phase === 'simulation' ? { persona: 'sara' as const, done: ['doorway' as const] } : {}),
  ...(phase === 'close' ? { done: ['doorway' as const, 'stepout' as const] } : {}),
  ...extra,
});

describe('visitorRequestsAlex — positives', () => {
  const positives = [
    'Where is Alex?',
    'I thought you were going to bring Alex',
    "What's the setup process?",
    'Can I meet with anybody from your staff?',
    'talk to your support specialist',
    'Can I talk to Alex?',
    'How does the set up work?',
    'Tell me about installation',
    'What does onboarding look like?',
    'I want to get started',
    'Can I speak with your team?',
    'Let me meet someone from your team',
  ];
  for (const line of positives) {
    test(`matches: ${line}`, () => {
      expect(visitorRequestsAlex(line)).toBe(true);
    });
  }
});

describe('visitorRequestsAlex — negatives', () => {
  const negatives = [
    'Do you sell Alexa devices?',
    'Alexander the Great',
    'Tell me more about your hours',
    'What does the business do?',
    '',
  ];
  for (const line of negatives) {
    test(`no match: ${line || '(empty)'}`, () => {
      expect(visitorRequestsAlex(line)).toBe(false);
    });
  }
});

describe('visitor-armed meet-alex state logic', () => {
  test('host + intent → next Aspen line yields meet-alex with NO anchor text', () => {
    const state = noteAlexIntent(inPhase('host'), 'Where is Alex?');
    expect(state.pendingAlex).toBe(true);
    // A plain filler line — no "this is alex", no anchor of any kind.
    expect(boundaryForAssistantLine('Of course, one moment.', state)).toBe('meet-alex');
  });

  test('close + intent → next Aspen line yields meet-alex with NO anchor text', () => {
    const state = noteAlexIntent(inPhase('close'), "What's the setup process?");
    expect(state.pendingAlex).toBe(true);
    expect(boundaryForAssistantLine('Great question — happy to help with that.', state)).toBe('meet-alex');
  });

  test('close + pending flag carried in state → fires on any line', () => {
    const state = inPhase('close', { pendingAlex: true });
    expect(boundaryForAssistantLine('Sure thing.', state)).toBe('meet-alex');
  });

  test('visitor-armed beats the doorway in host (no detour through Sara)', () => {
    const state = noteAlexIntent(inPhase('host'), 'Can I talk to Alex?');
    expect(boundaryForAssistantLine("Perfect — I'm stepping into simulation mode now.", state)).toBe('meet-alex');
  });

  test('simulation + intent → pending flags only, no direct swap to Alex', () => {
    const state = noteAlexIntent(inPhase('simulation'), "What's the setup process?");
    expect(state.pendingAlex).toBe(true);
    // The intent also counts as a step-out signal: Sara steps out first.
    expect(state.pendingStepout).toBe(true);
    // Sara's in-role lines never yield meet-alex while she is live.
    expect(boundaryForAssistantLine('We groom dogs of all sizes, and we can book you Tuesday.', state)).toBeNull();
    expect(boundaryForAssistantLine('Let me check that for you.', state)).toBeNull();
  });

  test('simulation → step-out lands in close with the flag set → fires', () => {
    const sim = noteAlexIntent(inPhase('simulation'), 'Can I meet with anybody from your staff?');
    // What executeSwap does at the step-out cut-over: phase/persona move
    // to close/Aspen, stepout joins done, pendingStepout clears and
    // pendingAlex SURVIVES (pinned in the component source test below).
    const close: SwapState = {
      ...sim, phase: 'close', persona: 'aspen', segment: 2,
      done: [...sim.done, 'stepout'], pendingStepout: false,
    };
    expect(boundaryForAssistantLine('So — did you like it?', close)).toBe('meet-alex');
  });

  test('done → never re-fires, and later intent is a no-op', () => {
    const doneState = inPhase('alex-guest', { persona: 'alex', pendingAlex: true, done: ['doorway', 'stepout', 'meet-alex'] });
    expect(boundaryForAssistantLine('Anything else I can do?', { ...doneState, phase: 'close', persona: 'aspen' })).toBeNull();
    expect(noteAlexIntent(doneState, 'Where is Alex?')).toBe(doneState);
    const closeDone = inPhase('close', { done: ['doorway', 'stepout', 'meet-alex'] });
    expect(noteAlexIntent(closeDone, "What's the setup process?")).toBe(closeDone);
  });

  test('intro family is unaffected — intent there changes nothing', () => {
    for (const phase of ['intro', 'intro-sara', 'intro-host', 'intro-alex'] as const) {
      const state = inPhase(phase);
      expect(noteAlexIntent(state, 'Where is Alex?')).toBe(state);
      // Even a hand-set flag cannot fire meet-alex from an intro phase.
      expect(boundaryForAssistantLine('This is Alex', { ...state, pendingAlex: true })).not.toBe('meet-alex');
    }
  });

  test('no intent → state untouched (anchor path behaves exactly as before)', () => {
    const host = inPhase('host');
    expect(noteAlexIntent(host, 'Tell me about the demo')).toBe(host);
    expect(boundaryForAssistantLine("Perfect — I'm stepping into simulation mode now.", host)).toBe('doorway');
    const close = inPhase('close');
    expect(boundaryForAssistantLine('Before we talk next steps, this is Alex — say hello.', close)).toBe('meet-alex');
    expect(boundaryForAssistantLine('Let me go over the plans.', close)).toBeNull();
  });

  test('initial state carries no pending Alex intent', () => {
    expect(INITIAL_SWAP_STATE.pendingAlex).toBe(false);
  });
});

describe('component + prompt wiring (source pins)', () => {
  test('both sockets fold visitor lines through noteAlexIntent', () => {
    const convo = read('src/components/GeminiConversation.tsx');
    expect(convo.match(/noteAlexIntent\(swapStateRef\.current, userLineRef\.current\)/g)?.length).toBe(2);
    // Late-arm fallback on BOTH turn_complete handlers.
    expect(convo.match(/armSwapRef\.current\('meet-alex'\)/g)?.length).toBe(2);
    // executeSwap consumes the flag only for meet-alex itself; every
    // other cut-over (the step-out above all) preserves it.
    expect(convo).toContain("pendingAlex: boundary === 'meet-alex' ? false : swapStateRef.current.pendingAlex");
  });

  test('host prompt: visitor ask → one short line + "This is Alex", no future-tense promise, no stalling', () => {
    expect(SIMULATION_CLOSE_SEGMENT).toContain('VISITOR ASKS FOR ALEX');
    expect(SIMULATION_CLOSE_SEGMENT).toContain('containing "This is Alex"');
    expect(SIMULATION_CLOSE_SEGMENT).toContain('do not promise Alex in the future tense');
    expect(SIMULATION_CLOSE_SEGMENT).toContain('do not stall');
  });
});
