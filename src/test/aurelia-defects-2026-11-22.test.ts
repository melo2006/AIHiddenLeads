/**
 * Aurelia Perez defect fixes (Publish #87, 2026-11-22) — Ron's two
 * test calls (records 27c58682 + 7dae3a37). Eight defects:
 *  1. the simulation entry re-ran mid-session (call 2, one session);
 *  2. a fresh sample launch opened as a resume of the prior call;
 *  3. the in-role greeting addressed the BUSINESS as the caller;
 *  4. answered qualification facts were re-asked (amnesia);
 *  5. the same line was generated twice inside one turn;
 *  6. the no-match value path (agent sends the list + one capture)
 *     never fired — the qualification loop never terminated;
 *  7. "warn transfer" wording, a mutating transfer target, and no
 *     fallback on a second transfer demand;
 *  8. "Are you still there?" fired while the caller was mid-flow.
 *
 * These tests replay call 2's ACTUAL turns through the discovery
 * gate and pin the prompt/source shapes the fixes rely on.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  armDiscoveryGate,
  detectStatedAreas,
  detectStatedBedsBaths,
  detectStatedType,
  detectTransferDemand,
  discoveryGateTurnDecision,
  entryRerunDirective,
  freshDiscoveryGateState,
  noMatchCloseDirective,
  settledReaskDirective,
  transferFallbackDirective,
  turnAsksPurposeChoice,
  turnAsksType,
  turnIsNoMatchAnswer,
  type DiscoveryGateState,
} from '../../supabase/functions/_shared/discovery-gate.ts';
import {
  ONE_LINE_ONCE_POLICY,
  SIMULATION_HOST_SEGMENT,
  SIMULATION_RECEPTIONIST_SEGMENT,
} from '../../supabase/functions/_shared/voice-config.ts';
import { REALTOR_DISCOVERY_GREETING_VARIANTS } from '../../supabase/functions/_shared/realtor-discovery.ts';
import { silenceCheckinSuppressed } from '../../supabase/functions/_shared/homepage-pacing.ts';

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const sessionSource = read('../../supabase/functions/gemini-session/index.ts');
const proxySource = read('../../supabase/functions/gemini-live-proxy/index.ts');
const personasSource = read('../../supabase/functions/_shared/personas.ts');
const phoneDemoSource = read('../../supabase/functions/_shared/phone-demo.ts');

const boundary = (
  state: DiscoveryGateState,
  visitorUtterance: string,
  modelTurnText: string,
) => discoveryGateTurnDecision({ state, visitorUtterance, modelTurnText, blocked: false });

// ---------------------------------------------------------------------------
// Defect 4 + 7 detectors — the extended ledger's eyes
// ---------------------------------------------------------------------------

describe('Publish #87 — extended-ledger detectors', () => {
  it('banks areas, type and beds/baths from the caller\'s own words (call 2)', () => {
    expect(detectStatedAreas('Do you have anything in Fort Lauderdale?')).toContain('Fort Lauderdale');
    expect(detectStatedType('any type is fine with me')).toBe('any type (open)');
    expect(detectStatedType('two bedroom two baths with a water view and a house or a condo')).not.toBe('');
    expect(detectStatedBedsBaths("I'm looking for a two bedroom, two baths")).toBe(true);
    expect(detectStatedBedsBaths('I want to be under $400,000')).toBe(false);
  });

  it('counts transfer demands from the caller\'s words — and only demands', () => {
    expect(detectTransferDemand('But I want you to transfer me to the manager sales director.')).toBe(true);
    expect(detectTransferDemand('I want to speak to a manager. This is terrible.')).toBe(true);
    expect(detectTransferDemand('talk to me about the listing')).toBe(false);
  });

  it('purpose-choice detector: an echo of the answer is not a re-ask', () => {
    // The model's acknowledgment in the Publish #78 replay suite.
    expect(turnAsksPurposeChoice('Got it, a home to live in.')).toBe(false);
    expect(turnAsksPurposeChoice('Is this a home you plan to live in, or is it an investment property?')).toBe(true);
  });

  it('type detector: the purpose opener merely mentions types — it is not the type question', () => {
    expect(turnAsksType('Are you interested in selling, or are you looking to buy a home or a condo?')).toBe(false);
    expect(turnAsksType('What are you picturing regarding property type — a single-family home, a townhouse, or a condo?')).toBe(true);
  });

  it('recognises call 2\'s no-match answers', () => {
    expect(turnIsNoMatchAnswer("Right now, I don't have a match for a two-bedroom, two-bath in Fort Lauderdale with a golf or water view under $400,000 in Aurelia Perez's current listings.")).toBe(true);
    expect(turnIsNoMatchAnswer("Right now I don't have a match for that among Aurelia Perez's current listings.")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Call 2 replay — defects 4, 6, 7 through the gate
// ---------------------------------------------------------------------------

describe('Publish #87 — call 2 replay (record 7dae3a37)', () => {
  it('settled facts are never re-asked; the no-match loop closes; a second transfer demand converts to the callback', () => {
    let s = armDiscoveryGate(freshDiscoveryGateState(), { seedName: 'Ronald' });

    // The session opened as a resume (defect 2's mint side is pinned
    // below). With the caller's name recap-seeded, the gate's first
    // act is the pre-existing name protection — it preempts any
    // move toward re-asking a name it already holds.
    let r = boundary(s, '', "Hey, you're back! Thank you. Would you like to continue where we left off? We were just discussing whether you're interested in selling or looking to buy a home or a condo. Shall we continue from there?");
    expect(r.inject).toBe('name-known-preempt');
    s = r.state;

    // FIRST transfer demand — the honesty line is the designed answer.
    r = boundary(s, 'But I want you to transfer me to the manager sales director.', 'In your live setup, I would warn transfer you to the sales director right here; in this demo, I cannot complete the transfer, but as a customer, that is exactly what happens.');
    expect(r.inject).toBeNull();
    expect(r.state.transferDemands).toBe(1);
    s = r.state;

    r = boundary(s, '¿Qué hay?', 'To get started, are you interested in selling, or are you looking to buy a home or a condo?');
    expect(r.inject).toBeNull();
    s = r.state;

    r = boundary(s, "I'm interested in buying a home. Do you have anything in Fort Lauderdale?", 'Fort Lauderdale is wonderful! Before we dive into specific listings, is this a home you plan to live in, or is it an investment property?');
    expect(r.inject).toBeNull();
    expect(r.state.areasBanked).toContain('Fort Lauderdale');
    s = r.state;

    // Criteria land; the model answers no-match AND re-asks the areas
    // the caller just named — the settled-fact correction fires.
    r = boundary(s, 'I want to live in there. I\'m looking for a two bedroom, two baths. 400,000. Find me something in Fort Lauderdale. Some kind of a golf view or view.', "Right now, I don't have a match for a two-bedroom, two-bath in Fort Lauderdale with a golf or water view under $400,000 in Aurelia Perez's current listings. I'll search the broader market for exactly that. Which areas are you drawn to?");
    expect(r.inject).toBe('settled-reask');
    expect(r.state.lastReaskDimension).toMatch(/area/i);
    expect(r.state.noMatchCount).toBe(1);
    s = r.state;

    r = boundary(s, "don't know. It was set for Lauderdale.", 'Got it, all of Fort Lauderdale.');
    expect(r.inject).toBeNull();
    s = r.state;

    // The caller completes the criteria (type + a $-budget); the
    // second no-match lands with the core criteria complete — the
    // loop must END: the close order fires (defect 6).
    r = boundary(s, 'two bedroom two baths with a water view and a family or house or a condo. I want to be under $400,000. Find me something.', "Right now, I don't have a match for a two-bed, two-bath condo with a water view under four hundred thousand among Aurelia Perez's current listings. I will search the broader market for exactly that.");
    expect(r.inject).toBe('no-match-close');
    expect(r.state.noMatchCount).toBe(2);
    s = r.state;

    // SECOND transfer demand — never the honesty line again: the
    // callback-capture fallback order fires (defect 7).
    r = boundary(s, "That's not good. I want to speak to a manager. This is terrible.", 'In your live setup, I would warn transfer you to Aurelia Perez right here. In this demo, I cannot complete the transfer, but as a customer, that is exactly what happens.');
    expect(r.inject).toBe('transfer-fallback');
    expect(r.state.transferDemands).toBe(2);
  });

  it('directives carry the designed content', () => {
    const s = armDiscoveryGate(freshDiscoveryGateState(), { seedName: 'Ronald' });
    expect(noMatchCloseDirective(s)).toContain('SEND');
    expect(noMatchCloseDirective(s)).toContain('Did I capture that all correctly?');
    expect(transferFallbackDirective('Aurelia Perez')).toContain('Aurelia Perez will call you back');
    expect(transferFallbackDirective('Aurelia Perez')).toContain('SECOND time');
    expect(settledReaskDirective('the areas', 'Fort Lauderdale')).toContain('Fort Lauderdale');
    expect(entryRerunDirective(s)).toContain('ONCE');
  });
});

// ---------------------------------------------------------------------------
// Defect 1 — the entry runs once per visit
// ---------------------------------------------------------------------------

describe('Publish #87 — defect 1: the displaced entry, fired late, is corrected', () => {
  const RERUN_TURN = 'Before we start — who do I have the pleasure of speaking with? Thank you, Ronald. I will now transition into the role for Aurelia Perez. Okay — now we are stepping into simulation mode. Please act like a visitor to your own website, or like a caller phoning your own number. Good morning, Aurelia Perez — I\'m Monica, thanks for calling. How can I help you?';

  it('the call-2 re-run (entry arriving mid-conversation, criteria banked) earns the entry-rerun correction', () => {
    let s = armDiscoveryGate(freshDiscoveryGateState(), { seedName: 'Ronald' });
    // The session opened as a resume — no entry ever ran.
    s = boundary(s, '', "Hey, you're back! Would you like to continue where we left off?").state;
    s = boundary(s, "I'm interested in buying a home in Fort Lauderdale. I want to live in there — two bedroom, two baths, under $400,000.", 'Fort Lauderdale is wonderful! Is this a home you plan to live in, or is it an investment property?').state;
    const r = boundary(s, 'by the water. Amanhã.', RERUN_TURN);
    expect(r.inject).toBe('entry-rerun');
  });

  it('the same entry turn at the START of a visit earns no entry correction — the scripted entry is legitimate', () => {
    const s = armDiscoveryGate(freshDiscoveryGateState(), { seedName: 'Ronald' });
    const r = boundary(s, '', RERUN_TURN);
    // Judged by the name rules (the entry's name ask, against a name
    // the ledger already holds) — never by the entry-rerun rule.
    expect(r.inject).toBe('name-known');
  });

  it('the prompt law: the entry is once-per-visit, in the host segment itself', () => {
    expect(SIMULATION_HOST_SEGMENT).toContain('THE ENTRY RUNS ONCE');
    expect(SIMULATION_HOST_SEGMENT).toContain('NEVER AGAIN');
  });
});

// ---------------------------------------------------------------------------
// Defect 2 — sample launches start clean (mint)
// ---------------------------------------------------------------------------

describe('Publish #87 — defect 2: the mint never hands a fresh sample launch a prior recap', () => {
  it('gemini-session suppresses resume context for non-reconnect sample launches', () => {
    expect(sessionSource).toContain('SAMPLE LAUNCHES START CLEAN');
    expect(sessionSource).toContain('b.sample === true && b.reconnect !== true');
    expect(sessionSource).toContain('effectiveResumeContext = undefined');
  });
});

// ---------------------------------------------------------------------------
// Defect 3 — the greeting greets the CALLER and names the business as
// the business being called, in every presenter template
// ---------------------------------------------------------------------------

describe('Publish #87 — defect 3: greeting composition', () => {
  it('the receptionist segment\'s in-role greeting shape names the business as the business called', () => {
    expect(SIMULATION_RECEPTIONIST_SEGMENT).toContain("thanks for calling {businessName}. How can I help you?");
    expect(SIMULATION_RECEPTIONIST_SEGMENT).toContain('GREET THE CALLER, NEVER THE BUSINESS');
    expect(SIMULATION_RECEPTIONIST_SEGMENT).not.toContain('Good morning, {businessName} — I\'m {agentName}');
  });

  it('the Sara segment template carries the same corrected shape', () => {
    expect(personasSource).toContain("thanks for calling {businessName}. How can I help you?");
    expect(personasSource).not.toContain('{timeGreeting}, {businessName} — I\'m');
  });

  it('no discovery warm-opening variant addresses the business', () => {
    for (const v of REALTOR_DISCOVERY_GREETING_VARIANTS) {
      expect(v).toContain('{businessName}');
      // The defect shape: the business in the ADDRESSEE slot, right
      // after the time greeting ("Good morning, Aurelia Perez — I'm…").
      expect(v).not.toMatch(/^\{timeGreeting\}, \{businessName\}/);
      expect(v).not.toContain('{businessName} — I\'m');
    }
  });

  it('the phone demo greeting + honesty line use the corrected shapes', () => {
    expect(phoneDemoSource).toContain('thanks for calling [their business name]');
    expect(phoneDemoSource).toContain('I would make a warm transfer right here');
    expect(phoneDemoSource).not.toContain('warn transfer');
  });
});

// ---------------------------------------------------------------------------
// Defect 5 — one line, once (transport-level policy + prompt law)
// ---------------------------------------------------------------------------

describe('Publish #87 — defect 5: in-turn duplication', () => {
  it('the ONE LINE, ONCE policy exists and rides every composed prompt', () => {
    expect(ONE_LINE_ONCE_POLICY).toContain('ONE LINE, ONCE');
    expect(ONE_LINE_ONCE_POLICY).toContain('never say the same sentence, greeting, question or line twice in a single turn');
    expect(proxySource).toContain('ONE_LINE_ONCE_POLICY');
  });
});

// ---------------------------------------------------------------------------
// Defect 7 — "warm transfer", one consistent target (prompt law)
// ---------------------------------------------------------------------------

describe('Publish #87 — defect 7: transfer wording in the scripts', () => {
  it('the receptionist segment scripts "make a warm transfer" and one consistent target', () => {
    expect(SIMULATION_RECEPTIONIST_SEGMENT).toContain('I would make a warm transfer to the owner right here');
    expect(SIMULATION_RECEPTIONIST_SEGMENT).toContain('SAME target every time');
    expect(SIMULATION_RECEPTIONIST_SEGMENT).not.toContain('warn transfer');
    expect(SIMULATION_RECEPTIONIST_SEGMENT).not.toContain('warm-transfer you to the owner');
  });
});

// ---------------------------------------------------------------------------
// Defect 8 — silence prompts key off actual inactivity only
// ---------------------------------------------------------------------------

describe('Publish #87 — defect 8: the silence check-in suppression', () => {
  const now = 1_000_000;
  it('suppresses while a model turn is in flight', () => {
    expect(silenceCheckinSuppressed({ now, lastCallerSpeechAt: 0, lastCallerTurnAt: 0, lastModelTurnAt: 0, modelTurnInFlight: true })).toBe(true);
  });
  it('suppresses on recent mic activity or a recent completed caller turn', () => {
    expect(silenceCheckinSuppressed({ now, lastCallerSpeechAt: now - 5_000, lastCallerTurnAt: 0, lastModelTurnAt: 0, modelTurnInFlight: false })).toBe(true);
    expect(silenceCheckinSuppressed({ now, lastCallerSpeechAt: 0, lastCallerTurnAt: now - 5_000, lastModelTurnAt: 0, modelTurnInFlight: false })).toBe(true);
  });
  it('suppresses while the model has only just finished speaking', () => {
    expect(silenceCheckinSuppressed({ now, lastCallerSpeechAt: 0, lastCallerTurnAt: 0, lastModelTurnAt: now - 5_000, modelTurnInFlight: false })).toBe(true);
  });
  it('allows the check-in only on genuine inactivity', () => {
    expect(silenceCheckinSuppressed({ now, lastCallerSpeechAt: now - 60_000, lastCallerTurnAt: now - 60_000, lastModelTurnAt: now - 60_000, modelTurnInFlight: false })).toBe(false);
  });
  it('the proxy consults its own clocks before forwarding an idle prompt on simulation sessions', () => {
    expect(proxySource).toContain('silenceCheckinSuppressed');
    expect(proxySource).toContain('idle_prompt_suppressed_active');
  });
});
