// Demo swap hardening (2026-11-09, Incident C forensics).
//
// Two silent solo-demo failure modes are removed here:
//
// A) GREETING GATE DECOUPLING — the business-demo opening (pitch +
//    Sara introduction) was gated on teamIntroOn (AVATAR_SWAP_ENABLED
//    && TEAM_INTRO_ENABLED). With TEAM_INTRO_ENABLED alone off, the
//    gemini-session fallback silently downgraded every business demo
//    to the legacy slim greeting: no Sara promised, no handoff set up,
//    no error. The opening now keys on swapEnabled alone;
//    TEAM_INTRO_ENABLED keeps gating ONLY the /demo explainer cameo
//    chain (parent stamp + teamIntroSeen inheritance).
//
// B) STRUCTURAL DOORWAY — the host → Sara swap armed ONLY on Aspen
//    speaking the exact anchor "stepping into simulation mode", a
//    prompt-driven line she may paraphrase or skip. Now the VISITOR
//    arms it: noteDoorwayEngagement folds a visitor line (after the
//    greeting turn completed) into pendingDoorway, and Aspen's next
//    line yields 'doorway' whatever words it uses — the pendingAlex
//    pattern from the Alex trigger (publish #12) applied to the
//    doorway. The widened anchor set (C) stays as the earlier net.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  boundaryForAssistantLine, INITIAL_SWAP_STATE, noteDoorwayEngagement,
  type SwapState,
} from '@/lib/personaSwap';
import { BOUNDARY_ANCHORS } from '../../supabase/functions/_shared/session-opening';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
const host = (extra: Partial<SwapState> = {}): SwapState => ({ ...INITIAL_SWAP_STATE, phase: 'host', ...extra });

describe('A — gemini-session greeting gating (source pins)', () => {
  const src = read('supabase/functions/gemini-session/index.ts');

  test('the business-demo fallback keys on swapEnabled, not teamIntroOn', () => {
    expect(src).toContain("if(!swapEnabled && b.verification!=='pending') {");
    expect(src).not.toContain("if(!teamIntroOn && b.verification!=='pending')");
    // The fallback body is unchanged: rotation cleared, legacy slim served.
    expect(src).toContain("config.greeting=(b.invite===true && leadInviteArrivedAt) ? DEMO_INVITE_GREETING_LEGACY_SLIM : SIMULATION_GREETING_LEGACY_SLIM;");
  });

  test('the /demo explainer stamp still requires teamIntroOn (cameo chain only)', () => {
    expect(src).toContain("if(teamIntroOn && !b.agentId && agent.slug==='aspen-homepage' && b.campaign?.entryPath==='/demo') {");
    expect(src).toContain('config.teamIntroEnabled=true;');
    expect(src).toContain('TEAM_INTRO_TEACHING');
  });

  test('personaSwapEnabled is still stamped on swapEnabled alone', () => {
    expect(src).toContain('if(!b.personaSegment && swapEnabled && (b.leadId || b.prospectId) && !b.draft && !b.preview) config.personaSwapEnabled=true;');
  });

  test('the verification-pending (code gate) path is untouched', () => {
    expect(src).toContain("if(b.verification==='pending') { config.greeting=DEMO_VERIFICATION_GREETING; config.greetings=[];");
  });
});

describe('B — structural doorway (pendingDoorway)', () => {
  test('host + greeting done + visitor line → next Aspen line yields doorway with NO anchor text', () => {
    const state = noteDoorwayEngagement(host(), true);
    expect(state.pendingDoorway).toBe(true);
    // A pure paraphrase — no anchor phrase of any kind.
    expect(boundaryForAssistantLine("Great — let's take a look at your website together.", state)).toBe('doorway');
    expect(boundaryForAssistantLine('Sure, happy to show you around.', state)).toBe('doorway');
  });

  test('visitor line BEFORE any assistant turn → no flag', () => {
    const state = host();
    expect(noteDoorwayEngagement(state, false)).toBe(state);
    expect(state.pendingDoorway).toBe(false);
  });

  test('intro phases → never (and neither does any non-host phase)', () => {
    for (const phase of ['intro', 'intro-sara', 'intro-host', 'intro-alex', 'simulation', 'close', 'alex-guest'] as const) {
      const state: SwapState = { ...INITIAL_SWAP_STATE, phase };
      expect(noteDoorwayEngagement(state, true)).toBe(state);
      // Even a hand-set flag cannot fire the doorway outside 'host'.
      expect(boundaryForAssistantLine('Sure thing.', { ...state, pendingDoorway: true })).not.toBe('doorway');
    }
  });

  test('anchor-first → normal path; the flag is moot once the doorway is done', () => {
    // No visitor engagement at all: the anchor still arms, as before.
    expect(boundaryForAssistantLine("Okay — now we are stepping into simulation mode.", host())).toBe('doorway');
    // Flag set, then the doorway executed (done): engagement is a no-op
    // and no later line can yield the doorway again.
    const doneState = host({ done: ['doorway'], pendingDoorway: true });
    expect(noteDoorwayEngagement(doneState, true)).toBe(doneState);
    expect(boundaryForAssistantLine('And here is the next part.', doneState)).toBeNull();
  });

  test('visitor-armed Alex still beats the structural doorway in host', () => {
    const state = noteDoorwayEngagement(host({ pendingAlex: true }), true);
    expect(state.pendingDoorway).toBe(true);
    expect(boundaryForAssistantLine('Of course — one moment.', state)).toBe('meet-alex');
  });

  test('initial state carries no pending doorway', () => {
    expect(INITIAL_SWAP_STATE.pendingDoorway).toBe(false);
  });
});

describe('C — widened doorway anchors (second net)', () => {
  test('the anchor set carries the original phrase plus the five additions', () => {
    expect(BOUNDARY_ANCHORS.doorway).toEqual([
      'stepping into simulation mode',
      'step into simulation',
      'stepping into the simulation',
      'into simulation mode',
      'enter simulation mode',
      'entering simulation mode',
    ]);
  });

  test('each widened phrasing arms the doorway in host', () => {
    const lines = [
      "Alright, let's step into simulation now.",
      "Okay, we're stepping into the simulation.",
      'And now we go into simulation mode.',
      'Let me enter simulation mode for you.',
      "We're entering simulation mode now.",
    ];
    for (const line of lines) {
      expect(boundaryForAssistantLine(line, host())).toBe('doorway');
    }
  });

  test("bare 'simulation' in an assistant line NEVER arms", () => {
    const chatter = [
      'This simulation shows how I would answer your visitors.',
      'The simulation is built from your public pages only.',
      'In the simulation I play your receptionist.',
      'simulations like this one are a great way to test me',
    ];
    for (const line of chatter) {
      expect(boundaryForAssistantLine(line, host())).toBeNull();
    }
  });
});

describe('B — component wiring (source pins)', () => {
  const convo = read('src/components/GeminiConversation.tsx');

  test('both sockets fold visitor lines through noteDoorwayEngagement, simulation chains only', () => {
    expect(convo.match(/noteDoorwayEngagement\(swapStateRef\.current, assistantTurnsRef\.current > 0\)/g)?.length).toBe(2);
    expect(convo.match(/swapChainClassRef\.current === 'simulation'/g)?.length).toBe(2);
  });

  test('chain class is set at both arming sites (simulation vs intro)', () => {
    expect(convo).toContain("swapChainClassRef.current = 'simulation';");
    expect(convo).toContain("swapChainClassRef.current = 'intro';");
    expect(convo).toContain('swapChainClassRef.current = null;');
  });

  test('late-arm fallback on BOTH turn_complete handlers; flag stays set', () => {
    expect(convo.match(/armSwapRef\.current\('doorway'\)/g)?.length).toBe(2);
    expect(convo).toContain("state.pendingDoorway && state.phase === 'host'");
  });

  test('executeSwap consumes pendingDoorway only for the doorway itself', () => {
    expect(convo).toContain("pendingDoorway: boundary === 'doorway' ? false : swapStateRef.current.pendingDoorway");
  });
});
