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
//
// D) ANNOUNCEMENT GATE (2026-11-20 — owner's live T&S Roofing
//    example run) — rule (B) overshot: the visitor engaged right
//    after the greeting ("yes, I'm here, continue"), the doorway
//    executed on Aspen's next line — a short host reply — and Sara
//    appeared with NO spoken pass, the exact announcement the
//    script exists to deliver. pendingDoorway now only pre-stages
//    Sara's face and arms the doorway; the swap EXECUTES solely on
//    a line where Aspen announces the pass (lineAnnouncesDoorway:
//    the scripted Sara introduction or a close paraphrase, or the
//    legacy entry announcement). Her composed instructions
//    (SWAP_HOST_YIELD_BAR + the follow-up beats) make that
//    announcement her required, verbatim next beat, so the gate
//    cannot stall the demo in practice — and a visitor asking for
//    Sara by name lands on the same line by the host-phase rule.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  boundaryForAssistantLine, INITIAL_SWAP_STATE, lineAnnouncesDoorway, noteDoorwayEngagement,
  type SwapState,
} from '@/lib/personaSwap';
import { BOUNDARY_ANCHORS, DOORWAY_ANNOUNCEMENT_ANCHORS } from '../../supabase/functions/_shared/session-opening';
import {
  DEMO_SITE_SARA_INTRO, SIMULATION_PROMPT_SWAP_PARENT, SWAP_HOST_YIELD_BAR,
} from '../../supabase/functions/_shared/voice-config';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
const host = (extra: Partial<SwapState> = {}): SwapState => ({ ...INITIAL_SWAP_STATE, phase: 'host', ...extra });

describe('A — gemini-session greeting gating (source pins)', () => {
  const src = read('supabase/functions/gemini-session/index.ts');

  test('the business-demo fallback keys on swapEnabled, not teamIntroOn', () => {
    // Frank batch (2026-11-13): presenter parents take the slim
    // fallback too — their rotation variants would promise a Sara
    // introduction no swap will keep. Non-presenter semantics are
    // unchanged: the key is still swapEnabled, never teamIntroOn.
    expect(src).toContain("if((!swapEnabled || presenter) && b.verification!=='pending') {");
    expect(src).not.toContain("if(!teamIntroOn && b.verification!=='pending')");
    // The fallback body is unchanged: rotation cleared, legacy slim served.
    expect(src).toContain("config.greeting=(b.invite===true && leadInviteArrivedAt) ? DEMO_INVITE_GREETING_LEGACY_SLIM : SIMULATION_GREETING_LEGACY_SLIM;");
  });

  test('the /demo explainer stamp still requires teamIntroOn (cameo chain only)', () => {
    expect(src).toContain("if(teamIntroOn && !b.agentId && agent.slug==='aspen-homepage' && b.campaign?.entryPath==='/demo') {");
    expect(src).toContain('config.teamIntroEnabled=true;');
    expect(src).toContain('TEAM_INTRO_TEACHING');
  });

  test('personaSwapEnabled is stamped on swapEnabled alone — presenter parents included on the lead path', () => {
    // Frank batch (2026-11-13) withheld the stamp from presenter
    // parents (the presenter fronts the whole demo solo) — but her
    // prompt kept the close's MEET ALEX beat, so she narrated a
    // handoff nothing executed (Ron's Latina test, 2026-11-14).
    // Alex handoff fix: a presenter parent earns the stamp on the
    // LEAD path (the client derives the same presenter there and
    // runs the meet-alex-only presenter chain); a prospect-path
    // presenter parent still earns nothing, because the client
    // cannot name its presenter.
    expect(src).toContain('if(!b.personaSegment && swapEnabled && (b.leadId || b.prospectId) && !b.draft && !b.preview && (!config.demoPresenter || b.leadId)) config.personaSwapEnabled=true;');
  });

  test('the verification-pending (code gate) path is untouched', () => {
    expect(src).toContain("if(b.verification==='pending') { config.greeting=DEMO_VERIFICATION_GREETING; config.greetings=[];");
  });
});

describe('B — structural doorway (pendingDoorway)', () => {
  test('host + greeting done + visitor line → the flag sets (pre-stage/arm only, post-2026-11-20 gate)', () => {
    const state = noteDoorwayEngagement(host(), true);
    expect(state.pendingDoorway).toBe(true);
    // ANNOUNCEMENT GATE (D): engagement alone no longer executes —
    // a pure paraphrase with no announcement of the pass yields NO
    // doorway. (Pre-gate this asserted 'doorway' for both lines;
    // that behaviour is the owner's 2026-11-20 defect.)
    expect(boundaryForAssistantLine("Great — let's take a look at your website together.", state)).toBeNull();
    expect(boundaryForAssistantLine('Sure, happy to show you around.', state)).toBeNull();
    // The same engaged state DOES execute the moment Aspen
    // announces the pass.
    expect(boundaryForAssistantLine('Now, meet Sara — she will walk you through your site. Can I transfer you to Sara now?', state)).toBe('doorway');
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

describe('D — announcement gate (2026-11-20): Sara never arrives unannounced', () => {
  test("the owner's repro: greeting, visitor go-ahead, short host reply → NO doorway", () => {
    // Ron's T&S Roofing example run, step for step: Aspen greeted,
    // he answered the greeting, she replied briefly — and Sara was
    // simply THERE. The engaged flag is set, but without an
    // announcement nothing executes.
    const state = noteDoorwayEngagement(host(), true);
    expect(state.pendingDoorway).toBe(true);
    expect(boundaryForAssistantLine("Yes, I'm here — let's keep going.", state)).toBeNull();
    expect(boundaryForAssistantLine('Wonderful. So, a little about us first.', state)).toBeNull();
  });

  test('the scripted introduction itself executes the doorway — no flag needed', () => {
    expect(DEMO_SITE_SARA_INTRO).toContain('Sara');
    expect(DEMO_SITE_SARA_INTRO).toContain('Can I transfer you to Sara now?');
    expect(lineAnnouncesDoorway(DEMO_SITE_SARA_INTRO)).toBe(true);
    expect(boundaryForAssistantLine(DEMO_SITE_SARA_INTRO, host())).toBe('doorway');
    expect(boundaryForAssistantLine(DEMO_SITE_SARA_INTRO, host({ pendingDoorway: true }))).toBe('doorway');
  });

  test('close paraphrases of the pass announce it too', () => {
    const lines = [
      "Let me pass you to Sara — she'll show you how this works on your site.",
      "I'll hand you over to Sara now.",
      "Let me bring Sara in — she'll take it from here.",
      'Introducing Sara, your demo receptionist.',
    ];
    for (const line of lines) {
      expect(lineAnnouncesDoorway(line)).toBe(true);
      expect(boundaryForAssistantLine(line, host({ pendingDoorway: true }))).toBe('doorway');
    }
  });

  test('topic mentions of Sara or the simulation do NOT announce the pass', () => {
    const chatter = [
      'Sara is the receptionist who will run your demo in a moment.',
      'Our receptionist handles calls just like this.',
      'This simulation shows how I would answer your visitors.',
      'The demo takes about two minutes of learning from your site.',
    ];
    for (const line of chatter) {
      expect(lineAnnouncesDoorway(line)).toBe(false);
      expect(boundaryForAssistantLine(line, host({ pendingDoorway: true }))).toBeNull();
    }
  });

  test('the announcement anchors name the pass, not just Sara', () => {
    expect(DOORWAY_ANNOUNCEMENT_ANCHORS).toContain('meet sara');
    expect(DOORWAY_ANNOUNCEMENT_ANCHORS).toContain('transfer you to sara');
    expect(DOORWAY_ANNOUNCEMENT_ANCHORS).toContain('pass you to sara');
    for (const a of DOORWAY_ANNOUNCEMENT_ANCHORS) expect(a).toContain('sara');
  });

  test('presenter chains stay solo: an announcement-shaped line arms nothing there', () => {
    const presenterState: SwapState = { ...INITIAL_SWAP_STATE, phase: 'host', presenter: 'frank' };
    expect(boundaryForAssistantLine(DEMO_SITE_SARA_INTRO, presenterState)).toBeNull();
  });

  test('the composed swap-parent prompt carries the gate and the scripted line', () => {
    expect(SWAP_HOST_YIELD_BAR).toContain('an unannounced Sara is a broken demo');
    expect(SWAP_HOST_YIELD_BAR).toContain('she arrives right after you speak it');
    expect(SIMULATION_PROMPT_SWAP_PARENT).toContain(DEMO_SITE_SARA_INTRO);
    expect(SIMULATION_PROMPT_SWAP_PARENT).toContain('BEAT 3 IS THE HANDOVER');
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
