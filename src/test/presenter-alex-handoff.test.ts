// Presenter → Alex handoff fix (2026-11-14).
//
// Ron's Latina/Aurelia live test (~04:00–04:19 EST, 2026-11-14; lead
// 850f3d17-85af-49e9-869b-aa6aa4ab540e): at the close, Latina spoke the
// scripted handoff line verbatim — "Of course — let me bring him in
// right now. This is Alex — our onboarding engineer. Alex — say
// hello." — and Alex never appeared. Root cause: presenter parents
// (Frank / Latina / Black Professional Lady) were composed with the
// legacy solo prompt, whose Alex beats stayed in the script, while
// gemini-session WITHHELD the personaSwapEnabled stamp from them —
// so the client never armed the swap state machine at all, and no
// boundary could ever fire. Nothing errored; the handoff was
// narrated into a void.
//
// The fix, pinned here:
//  - gemini-session stamps presenter parents on the LEAD path only
//    (the client derives the same presenter from the lead id);
//  - the client arms a PRESENTER chain (state.presenter set) whose
//    matcher has exactly two live boundaries — meet-alex and Alex's
//    return (which lands back on the presenter, never stock Aspen);
//  - her solo script's own doorway/step-out/summon anchors can never
//    arm anything on a presenter chain (she speaks those lines
//    herself, in role);
//  - the standard chain gains the host-phase strong-anchor rule, so
//    Aspen performing the same scripted announcement in 'host'
//    (where the host segment tells her to say it) arms meet-alex too;
//  - personaSegmentPrompt builds presenter re-entry segments (return
//    / step-out recovery) whose instructions name the PRESENTER.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { PERSONAS, personaSegmentPrompt, presenterAlexGuestPrompt } from '../../supabase/functions/_shared/personas';
import { ALEX_DEMO_GUEST_PROMPT } from '../../supabase/functions/_shared/alex-guide';
import { personaDisplayName, swapOpeningInstruction } from '../../supabase/functions/_shared/session-opening';
import {
  boundaryForAssistantLine, boundaryTargetFor, buildSwapRecap, INITIAL_SWAP_STATE,
  type SwapState,
} from '@/lib/personaSwap';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

// Ron's captions, verbatim, from the failing test.
const RON_LINE = 'Of course — let me bring him in right now. This is Alex — our onboarding engineer. Alex — say hello.';
// The close beat 4b line (SIMULATION_CLOSE_SEGMENT), visitor name substituted.
const BEAT_4B_LINE = 'That part is genuinely easy, so let me hand you to the person who does it. This is Alex — our onboarding engineer. Alex — say hello, and walk Dana through what getting started actually looks like.';

const presenterState = (over: Partial<SwapState> = {}): SwapState => ({
  ...INITIAL_SWAP_STATE, persona: 'latina', presenter: 'latina', ...over,
});

describe('presenter chain: the Alex handoff actually arms', () => {
  test("Ron's verbatim Latina line arms meet-alex in host phase", () => {
    expect(boundaryForAssistantLine(RON_LINE, presenterState())).toBe('meet-alex');
  });

  test('the close beat 4b line arms meet-alex in close phase', () => {
    expect(boundaryForAssistantLine(BEAT_4B_LINE, presenterState({ phase: 'close' }))).toBe('meet-alex');
  });

  test('visitor intent (pendingAlex) arms meet-alex on any presenter line', () => {
    expect(boundaryForAssistantLine('Sure — one moment.', presenterState({ pendingAlex: true }))).toBe('meet-alex');
  });

  test('Frank chain arms identically (the fix is presenter-generic)', () => {
    const frank = presenterState({ persona: 'frank', presenter: 'frank' });
    expect(boundaryForAssistantLine(RON_LINE, frank)).toBe('meet-alex');
    expect(boundaryForAssistantLine(BEAT_4B_LINE, { ...frank, phase: 'close' })).toBe('meet-alex');
  });

  test("Alex's hand-back arms return on a presenter chain", () => {
    const guest = presenterState({ phase: 'alex-guest', persona: 'alex', done: ['meet-alex'] });
    // the exact example line his presenter-parent guest prompt teaches
    expect(boundaryForAssistantLine('Let me bring Monica back for the plans side — she has all of that.', guest)).toBe('return');
    // Frank's chain, his line
    const frankGuest = presenterState({ phase: 'alex-guest', persona: 'alex', presenter: 'frank', done: ['meet-alex'] });
    expect(boundaryForAssistantLine('Let me bring Frank back for the plans side — he has all of that.', frankGuest)).toBe('return');
    // the Black Professional Lady's chain hands back to "your host"
    const bplGuest = presenterState({ phase: 'alex-guest', persona: 'alex', presenter: 'black-professional-lady', done: ['meet-alex'] });
    expect(boundaryForAssistantLine('Let me bring your host back for the plans side — she has all of that.', bplGuest)).toBe('return');
    // the stock Aspen anchor still arms it if he reaches for her name
    expect(boundaryForAssistantLine('Let me bring Aspen back for the plans side.', guest)).toBe('return');
    // an ordinary Alex answer arms nothing
    expect(boundaryForAssistantLine('Setup takes about fifteen minutes, and I stay with you for the install snippet too.', guest)).toBeNull();
  });

  test('meet-alex is one-shot: after it is done, the same line arms nothing', () => {
    expect(boundaryForAssistantLine(RON_LINE, presenterState({ phase: 'close', done: ['meet-alex'] }))).toBeNull();
  });
});

describe('presenter chain: her solo script can never arm a Sara/Aspen swap', () => {
  test("her own doorway announcement arms nothing (it IS a doorway anchor on the standard chain)", () => {
    const doorwayLine = "Alright — stepping into simulation mode for a moment. Imagine you found Aurelia Perez's website and you need a home valuation, so you click to talk.";
    expect(boundaryForAssistantLine(doorwayLine, presenterState())).toBeNull();
    // control: the same line on a standard chain arms the doorway
    expect(boundaryForAssistantLine(doorwayLine, { ...INITIAL_SWAP_STATE })).toBe('doorway');
  });

  test('her presenter-rewritten step-out line arms nothing', () => {
    // Her actual rewritten announcement (presenterSimulationPrompt's
    // close rewrite) — on the standard chain this text carries the
    // step-out anchors; on hers it is simply her own closing line.
    expect(boundaryForAssistantLine('Okay — I am stepping out of simulation mode now. This is Monica from AI Hidden Leads again.', presenterState({ phase: 'close', done: ['meet-alex'] }))).toBeNull();
  });

  test('a summon-Aspen anchor inside her script arms nothing', () => {
    expect(boundaryForAssistantLine('Let me bring Aspen back in to explain the plans.', presenterState())).toBeNull();
  });

  test('ordinary presenter chatter arms nothing', () => {
    expect(boundaryForAssistantLine("Great question — most of my sellers start with a free valuation, and I walk them through the comps myself.", presenterState())).toBeNull();
  });
});

describe('standard chain: the scripted announcement binds in host phase too', () => {
  test("Aspen performing the handoff line in 'host' arms meet-alex (no visitor intent needed)", () => {
    expect(boundaryForAssistantLine(RON_LINE, { ...INITIAL_SWAP_STATE })).toBe('meet-alex');
  });

  test('a topic mention of Alex arms nothing', () => {
    expect(boundaryForAssistantLine("This is Alex's area, honestly — setup questions go to him.", { ...INITIAL_SWAP_STATE })).toBeNull();
  });

  test('the close comfort line (mentions Alex by role) arms nothing in host', () => {
    expect(boundaryForAssistantLine('We can get you going in about 15 minutes. Alex, our onboarding engineer, will walk you through it — all you need to do is pick a plan.', { ...INITIAL_SWAP_STATE })).toBeNull();
  });

  test('meet-alex already done: the announcement cannot re-arm', () => {
    expect(boundaryForAssistantLine(RON_LINE, { ...INITIAL_SWAP_STATE, done: ['meet-alex'] })).toBeNull();
  });
});

describe('boundary targets on a presenter chain', () => {
  test("Alex's return targets the PRESENTER, never stock Aspen", () => {
    expect(boundaryTargetFor(presenterState(), 'return')).toBe('latina');
    expect(boundaryTargetFor(presenterState({ presenter: 'frank', persona: 'frank' }), 'return')).toBe('frank');
    expect(boundaryTargetFor(presenterState({ presenter: 'black-professional-lady', persona: 'black-professional-lady' }), 'return')).toBe('black-professional-lady');
  });

  test('standard chain targets are unchanged', () => {
    expect(boundaryTargetFor({ ...INITIAL_SWAP_STATE }, 'return')).toBe('aspen');
    expect(boundaryTargetFor({ ...INITIAL_SWAP_STATE }, 'meet-alex')).toBe('alex');
    expect(boundaryTargetFor({ ...INITIAL_SWAP_STATE }, 'doorway')).toBe('sara');
    expect(boundaryTargetFor(presenterState(), 'meet-alex')).toBe('alex');
  });

  test('the swap recap names the incoming presenter (and stays exact for Aspen)', () => {
    const turns = [{ role: 'assistant' as const, text: 'Welcome in.' }];
    const meta = { visitorName: 'Dana', businessName: 'Aurelia Perez Real Estate', facts: [] as string[] };
    expect(buildSwapRecap(turns, meta, 'latina')).toContain('You are now Monica from AI Hidden Leads.');
    expect(buildSwapRecap(turns, meta, 'aspen')).toContain('You are now Aspen from AI Hidden Leads.');
  });
});

describe('presenter segment builds (server)', () => {
  test("Alex's guest segment builds from a presenter parent exactly as from Aspen's", () => {
    const cfg = personaSegmentPrompt('alex', 'meet-alex', 'Aurelia Perez Real Estate', 'PARENT PROMPT',
      { systemPrompt: 'ALEX GUEST PROMPT', greeting: 'ALEX GREETING' });
    expect(cfg.systemPrompt).toBe('ALEX GUEST PROMPT');
    expect(cfg.greeting).toBe('ALEX GREETING');
  });

  test("Monica's return segment names MONICA re-entering — not Aspen", () => {
    const cfg = personaSegmentPrompt('latina', 'return', 'Aurelia Perez Real Estate', 'PARENT PROMPT');
    expect(cfg.greeting).toBe('');
    expect(cfg.systemPrompt).toContain('This is Monica from AI Hidden Leads again');
    expect(cfg.systemPrompt).not.toContain('This is Aspen from AI Hidden Leads again');
    // the close's follow-up seat is hers too, not Aspen's
    expect(cfg.systemPrompt).toContain('Answer follow-ups as Monica from AI Hidden Leads');
    expect(cfg.systemPrompt).not.toContain('Answer follow-ups as Aspen from AI Hidden Leads');
    // and the MEET ALEX beat itself survives in her close material
    expect(cfg.systemPrompt).toContain('MEET ALEX');
  });

  test("Frank's step-out (drop recovery) segment names Frank", () => {
    const cfg = personaSegmentPrompt('frank', 'stepout', 'Martinez Realty Group', 'PARENT PROMPT');
    expect(cfg.systemPrompt).toContain('This is Frank from AI Hidden Leads again');
  });

  test("the Black Professional Lady's return segment names her", () => {
    const cfg = personaSegmentPrompt('black-professional-lady', 'return', 'Chamberlain Realty', 'PARENT PROMPT');
    expect(cfg.systemPrompt).toContain(`This is ${PERSONAS['black-professional-lady'].displayName} from AI Hidden Leads again`);
  });
});

describe("Alex's guest prompt names the presenter host on a presenter chain", () => {
  test('the stock prompt (Aspen parent) is untouched', () => {
    expect(ALEX_DEMO_GUEST_PROMPT).toContain('Let me bring Aspen back for the plans side — she has all of that.');
    expect(ALEX_DEMO_GUEST_PROMPT).toContain('the session returns to Aspen.');
  });

  test("Monica's variant: he brings MONICA back and returns to her", () => {
    const prompt = presenterAlexGuestPrompt('latina');
    expect(prompt).toContain('Monica has just introduced you');
    expect(prompt).toContain('Let me bring Monica back for the plans side — she has all of that.');
    expect(prompt).toContain('the session returns to Monica.');
    expect(prompt).not.toContain('bring Aspen back');
  });

  test("Frank's variant uses his name and pronoun", () => {
    const prompt = presenterAlexGuestPrompt('frank');
    expect(prompt).toContain('Let me bring Frank back for the plans side — he has all of that.');
    expect(prompt).toContain('the session returns to Frank.');
  });

  test("the Black Professional Lady's variant says 'your host', never her working label", () => {
    const prompt = presenterAlexGuestPrompt('black-professional-lady');
    expect(prompt).toContain('Let me bring your host back for the plans side — she has all of that.');
    expect(prompt).toContain('the session returns to your host.');
    expect(prompt).not.toContain('Black Professional Lady has just introduced you');
  });
});

describe('session-opening return beat names the returning persona', () => {
  test('to=latina names Monica; to=aspen keeps the exact Aspen wording', () => {
    expect(swapOpeningInstruction({ to: 'latina', boundary: 'return' }, 'RECAP')).toContain('You are Monica from AI Hidden Leads again');
    expect(swapOpeningInstruction({ to: 'aspen', boundary: 'return' }, 'RECAP')).toContain('You are Aspen from AI Hidden Leads again');
  });

  test('personaDisplayName agrees with the persona registry', () => {
    for (const id of ['aspen', 'frank', 'latina', 'black-professional-lady'] as const) {
      expect(personaDisplayName(id)).toBe(PERSONAS[id].displayName);
    }
  });
});

describe('source pins: the wiring that makes it real', () => {
  test('gemini-session stamps presenter parents on the lead path', () => {
    const src = read('supabase/functions/gemini-session/index.ts');
    expect(src).toContain('(!config.demoPresenter || b.leadId)) config.personaSwapEnabled=true');
  });

  test("gemini-session builds Alex's guest prompt from the parent's presenter stamp", () => {
    const src = read('supabase/functions/gemini-session/index.ts');
    expect(src).toContain('parent.demoPresenter?presenterAlexGuestPrompt(parent.demoPresenter');
  });

  test('the client arms the presenter chain from the lead-derived presenter prop', () => {
    const src = read('src/components/GeminiConversation.tsx');
    expect(src).toContain("swapChainClassRef.current = 'presenter'");
    expect(src).toContain('presenter: presenterPersona');
    expect(src).toContain('boundaryTargetFor(swapStateRef.current, boundary)');
  });

  test('the live proxy carries presenter personas through the swap openings', () => {
    const src = read('supabase/functions/gemini-live-proxy/index.ts');
    expect(src).toContain("to: 'aspen' | 'sara' | 'alex' | 'frank' | 'latina' | 'black-professional-lady'");
  });
});
