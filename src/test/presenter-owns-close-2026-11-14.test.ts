// Presenter owns the close (2026-11-14).
//
// Ron's Frank/Martinez phone test (2026-11-14, ~08:17–08:26 EST):
// mid-demo, Frank said he would bring Aspen in for the AI Hidden
// Leads questions — and nothing happened, because a presenter chain
// has no Aspen swap to keep that promise (the client disarms it by
// design). Frank then ran the sales conversation and the booking
// himself, fine. Ron's ruling: demo visitors don't know who Aspen
// is yet, so the handoff is needless complexity — in PRESENTER
// demos (Frank, Monica, Black Professional Lady) there is no
// Aspen-handoff beat at all: no offer, no promise, no swap; the
// presenter runs the close, plans/pricing and booking end to end.
// The meet-Alex beat stays exactly as built in #45/#47, and
// Aspen-fronted demos (homepage, generic /demo) are unchanged.
//
// The promise had THREE script sources in a presenter session, all
// pinned here:
//  1. the receptionist segment's "BRING ASPEN BACK, LIVE" beat —
//     presenterSimulationPrompt rewrote the host doorway, the
//     honesty note and the close, but NOT this beat or the
//     named-person beat beside it, so both survived verbatim into
//     every presenter prompt;
//  2. the example-listings layer's closing ASKING FOR A PERSON BY
//     NAME paragraph ("use the bring-Aspen-back line"), appended to
//     presenter parents by stampExampleListings AFTER the prompt
//     rewrites ran;
//  3. improvisation room: the client could record a summon-Aspen
//     intent and the server would authorize an Aspen segment — now
//     closed on both sides (noteAspenIntent's presenter guard;
//     gemini-session's presenter segment gate).
// Plus one latent defect found on the way: gemini-session's segment
// schema admitted only aspen/sara/alex, so the client's presenter
// RETURN request (Alex's hand-back, persona = the presenter) failed
// validation outright — the #45/#47 return build existed but could
// never be authorized. The enum now admits the presenter ids and
// the gate keeps every other shape refused.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  PERSONAS, isPresenterPersona, personaSegmentPrompt, presenterSimulationPrompt,
  type PersonaId,
} from '../../supabase/functions/_shared/personas';
import {
  SIMULATION_CLOSE_SEGMENT, SIMULATION_PROMPT, SIMULATION_RECEPTIONIST_SEGMENT,
} from '../../supabase/functions/_shared/voice-config';
import {
  buildExampleListingsLayer, examplePackBySlug,
} from '../../supabase/functions/_shared/realtor-example-listings';
import { BOUNDARY_ANCHORS } from '../../supabase/functions/_shared/session-opening';
import {
  INITIAL_SWAP_STATE, MEET_ALEX_STRONG_ANCHORS, PRESENTER_HAND_BACK_ANCHORS,
  boundaryForAssistantLine, noteAspenIntent, type SwapState,
} from '@/lib/personaSwap';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

const PRESENTER_IDS: PersonaId[] = ['frank', 'latina', 'black-professional-lady'];
const presenterState = (over: Partial<SwapState> = {}): SwapState => ({
  ...INITIAL_SWAP_STATE, persona: 'frank', presenter: 'frank', ...over,
});

describe('presenter prompt: no Aspen-handoff beat survives', () => {
  for (const id of PRESENTER_IDS) {
    const binding = PERSONAS[id];
    const prompt = presenterSimulationPrompt(binding);

    test(`${binding.displayName}: the bring-Aspen-back beat is gone`, () => {
      expect(prompt).not.toContain('bring Aspen back');
      expect(prompt).not.toContain('BRING ASPEN BACK');
      expect(prompt).not.toContain('NOT YOURS TO SELL');
      expect(prompt).not.toContain('brings Aspen back IMMEDIATELY');
      expect(prompt).not.toContain('hand you back to Aspen');
      expect(prompt).not.toContain('This is Aspen from AI Hidden Leads again');
      expect(prompt).not.toContain('Answer follow-ups as Aspen');
      expect(prompt).not.toContain("in Aspen's voice after the introduction");
    });

    test(`${binding.displayName}: the close is positively his/hers to run`, () => {
      // the platform topic is assigned to the presenter, by name
      expect(prompt).toContain('THERE IS NO HANDOFF TO ASPEN IN THIS DEMO');
      expect(prompt).toContain(`as ${binding.displayName} from AI Hidden Leads, under the sales policy`);
      expect(prompt).toContain('the plans, the pricing and the booking are yours to run');
      // an ask for Aspen/Sara gets the solo answer, never a promise
      expect(prompt).toContain("Aspen and Sara are on my team — for this demonstration you've got me");
      expect(prompt).toContain('never a promised handoff');
      // the close's own seats name the presenter
      expect(prompt).toContain(`This is ${binding.displayName} from AI Hidden Leads again`);
      expect(prompt).toContain(`Answer follow-ups as ${binding.displayName} from AI Hidden Leads`);
      expect(prompt).toContain('do not keep selling in your own voice after the introduction');
    });

    test(`${binding.displayName}: the meet-Alex beat is untouched`, () => {
      expect(prompt).toContain('This is Alex — our onboarding engineer');
      expect(prompt).toContain('Alex — say hello');
      expect(prompt).toContain('VISITOR ASKS FOR ALEX — AT ANY POINT, NOT ONLY IN THIS CLOSE');
    });
  }

  test('the needles are pinned against the shared constants (standard chain untouched)', () => {
    // If a future prompt edit moves a needle, presenterSimulationPrompt's
    // replace silently no-ops — these pins fail first, loudly.
    expect(SIMULATION_RECEPTIONIST_SEGMENT).toContain('BRING ASPEN BACK, LIVE');
    expect(SIMULATION_RECEPTIONIST_SEGMENT).toContain('let me bring Aspen back for that.');
    expect(SIMULATION_RECEPTIONIST_SEGMENT).toContain('brings Aspen back IMMEDIATELY');
    expect(SIMULATION_CLOSE_SEGMENT).toContain("do not keep selling in Aspen's voice after the introduction.");
    expect(SIMULATION_PROMPT).toContain('bring Aspen back');
  });

  test("the presenter's Alex-return segment carries no Aspen-voice line either", () => {
    const cfg = personaSegmentPrompt('frank', 'return', 'Martinez Realty Group', 'PARENT PROMPT');
    expect(cfg.systemPrompt).not.toContain("in Aspen's voice");
    expect(cfg.systemPrompt).toContain('do not keep selling in your own voice after the introduction');
    expect(cfg.systemPrompt).toContain('MEET ALEX');
  });
});

describe('example listings layer: presenter variant drops the Aspen line', () => {
  const pack = examplePackBySlug('michael-martinez');
  if (!pack) throw new Error('michael-martinez pack missing');

  test('the standard layer keeps the stock bring-Aspen-back instruction (Sara)', () => {
    const layer = buildExampleListingsLayer(pack);
    expect(layer).toContain('use the bring-Aspen-back line from your instructions');
    // no-opts and explicit-false builds are byte-identical
    expect(buildExampleListingsLayer(pack, { presenter: false })).toBe(layer);
    expect(buildExampleListingsLayer(pack, {})).toBe(layer);
  });

  test('the presenter layer has no Aspen handoff and keeps the listings', () => {
    const layer = buildExampleListingsLayer(pack, { presenter: true });
    expect(layer).not.toContain('bring-Aspen-back');
    expect(layer).not.toContain('bring Aspen back');
    expect(layer).toContain('there is no handoff to her here');
    expect(layer).toContain('Never answer AS Aspen, never impersonate her');
    // the listings themselves and the approved flow survive verbatim
    expect(layer).toContain('NAME THESE FIRST');
    expect(layer).toContain('THE LISTING MOMENT — FEATURE-FIRST, NEVER ADDRESS-FIRST');
    expect(layer).toContain(pack.agentName);
  });
});

describe('client: no Aspen boundary can arm on a presenter chain', () => {
  const ASPEN_LINE = "That's one for Aspen — let me bring Aspen back for that.";

  test("Frank speaking the old scripted line arms nothing, in any presenter phase", () => {
    for (const phase of ['host', 'close'] as const) {
      expect(boundaryForAssistantLine(ASPEN_LINE, presenterState({ phase }))).toBeNull();
    }
    // the step-out / hand-back anchors are equally inert for the presenter
    expect(boundaryForAssistantLine('Okay — I am stepping out of simulation mode now, and I\'ll hand you back to Aspen', presenterState({ phase: 'close' }))).toBeNull();
    expect(boundaryForAssistantLine('Okay — now we are stepping into simulation mode.', presenterState())).toBeNull();
  });

  test('summon intent is never even recorded on a presenter chain', () => {
    // forced into the simulation phase a presenter chain never reaches:
    // the guard, not the phase, is what keeps the promise unmakeable.
    const state = presenterState({ phase: 'simulation' });
    const next = noteAspenIntent(state, 'How much does AI Hidden Leads charge for your plans?');
    expect(next).toBe(state);
    expect(next.pendingAspen).toBe(false);
    const named = noteAspenIntent(state, 'Can I talk to Aspen instead?');
    expect(named.pendingAspen).toBe(false);
  });

  test('control: the same visitor lines DO record intent on the standard chain', () => {
    const standard: SwapState = { ...INITIAL_SWAP_STATE, phase: 'simulation', persona: 'sara' };
    expect(noteAspenIntent(standard, 'How much does AI Hidden Leads charge for your plans?').pendingAspen).toBe(true);
    expect(boundaryForAssistantLine(ASPEN_LINE, standard)).toBe('summon-aspen');
  });

  test('the Alex anchors are exactly as built in #45/#47', () => {
    expect(PRESENTER_HAND_BACK_ANCHORS.frank).toEqual(['bring frank back']);
    expect(PRESENTER_HAND_BACK_ANCHORS.latina).toEqual(['bring monica back']);
    expect(PRESENTER_HAND_BACK_ANCHORS['black-professional-lady']).toEqual(['bring your host back', 'bring our host back']);
    expect(MEET_ALEX_STRONG_ANCHORS).toContain('alex — say hello');
    expect(MEET_ALEX_STRONG_ANCHORS).toContain('this is alex — our onboarding engineer');
    expect(BOUNDARY_ANCHORS['meet-alex']).toEqual(['this is alex', 'alex — say hello', 'alex - say hello']);
    expect(BOUNDARY_ANCHORS.return).toEqual(['bring aspen back']);
    expect(BOUNDARY_ANCHORS['summon-aspen']).toEqual(['bring aspen back']);
    // and Alex's hand-back still arms the return onto the presenter
    const guest = presenterState({ phase: 'alex-guest', persona: 'alex', done: ['meet-alex'] });
    expect(boundaryForAssistantLine('Let me bring Frank back for the plans side — he has all of that.', guest)).toBe('return');
  });
});

describe('gemini-session: presenter segment gate + schema (source pins)', () => {
  const src = read('supabase/functions/gemini-session/index.ts');

  test('the segment schema admits the presenter personas (the return can authorize)', () => {
    expect(src).toContain("persona:z.enum(['aspen','sara','alex','frank','latina','black-professional-lady'])");
    expect(isPresenterPersona('frank')).toBe(true);
  });

  test('the presenter segment gate refuses every non-presenter-chain shape', () => {
    expect(src).toContain('parent.demoPresenter');
    expect(src).toContain("segPersona==='alex' && segBoundary==='meet-alex'");
    expect(src).toContain("segBoundary==='return' || segBoundary==='stepout'");
    expect(src).toContain("json({error:'Persona segment not available for this demo'},404)");
  });

  test('the listings stamp passes the presenter variant for presenter parents only', () => {
    expect(src).toContain('stampExampleListings(config, examplePack, presenter ? { presenter: true } : undefined)');
  });
});
