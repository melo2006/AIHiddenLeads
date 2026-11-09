// Team intro tests (design §8.3 + 2026-11-09 evening rework deltas +
// owner transition spec).
//
// Coverage:
//  - flag gating: TEAM_INTRO_ENABLED can never outlive the master
//    AVATAR_SWAP_ENABLED flag (both off/one-sided combinations dark)
//  - prompt content pins: Sara's cameo carries the FULL honesty clauses
//    (rework delta c — not touched / public pages only / server
//    untouched); Alex names WordPress/Wix/plain HTML + "most hosted
//    builders" and NOT GoDaddy/IONOS (delta d); no "engineer" anywhere;
//    no prices in any beat
//  - segment routing for the intro family (right persona/boundary
//    pairs build, wrong pairs throw, host segments require the
//    teamIntro options)
//  - the demo-site introduction beat (rework delta a):
//    withSimulationTeamIntro inserts after BOTH reassurance forms and
//    on the invite greeting, and is the identity otherwise
//  - opening priority: an intro boundary opening is the planned-swap
//    branch — no apology, no "you're back", no resume text
//  - client state machine: intro anchor gating per phase, the
//    once-per-session latch, the bridge-yield rule, drop targets
//  - owner transition spec: 300ms crossfade constant + slot flipping,
//    handoff divider rows (transcript never cleared; dividers are
//    chrome and never enter a swap recap), the divider strings in all
//    three locales, and the client source pins for the fade/retire
//    cut-over + per-persona speaker stamps
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  avatarSwapEnabled, personaSegmentPrompt, teamIntroEnabled,
} from '../../supabase/functions/_shared/personas';
import {
  ALEX_CAMEO_PROMPT, DEMO_NOT_TOUCHED_REASSURANCE_SLIM, INTRO_BOUNDARIES, SARA_CAMEO_PROMPT,
  SIMULATION_TEAM_INTRO_BEAT, TEAM_INTRO_BEAT_ALEX, TEAM_INTRO_BEAT_BRIDGE_ALEX, TEAM_INTRO_BEAT_BRIDGE_SARA,
  TEAM_INTRO_BEAT_RETURN, TEAM_INTRO_BEAT_SARA, TEAM_INTRO_FALLBACK_ALEX, TEAM_INTRO_FALLBACK_SARA,
  TEAM_INTRO_HOST_SEGMENT, TEAM_INTRO_TEACHING, isIntroBoundary, withSimulationTeamIntro,
} from '../../supabase/functions/_shared/team-intro';
import { DEMO_NOT_TOUCHED_REASSURANCE, SIMULATION_GREETING } from '../../supabase/functions/_shared/voice-config';
import { DEMO_INVITE_GREETING } from '../../supabase/functions/_shared/demo-sales';
import { openingText } from '../../supabase/functions/_shared/session-opening';
import {
  INITIAL_SWAP_STATE, SWAP_CROSSFADE_MS, TEAM_INTRO_SEEN_FACT, boundaryForAssistantLine, buildSwapRecap,
  introYieldOnVisitorLine, otherFaceSlot, reconnectTarget, swapRecapFacts, type SwapState,
} from '@/lib/personaSwap';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
const envOf = (m: Record<string, string>) => (n: string) => m[n];
const RECAP = 'The visitor is Dana from Durgin Electric. Website: durginelectric.com.';
const ALL_INTRO_PROMPTS = [
  TEAM_INTRO_BEAT_BRIDGE_SARA, TEAM_INTRO_BEAT_SARA, TEAM_INTRO_BEAT_BRIDGE_ALEX, TEAM_INTRO_BEAT_ALEX,
  TEAM_INTRO_BEAT_RETURN, TEAM_INTRO_FALLBACK_SARA, TEAM_INTRO_FALLBACK_ALEX, TEAM_INTRO_TEACHING,
  SARA_CAMEO_PROMPT, TEAM_INTRO_HOST_SEGMENT, ALEX_CAMEO_PROMPT, SIMULATION_TEAM_INTRO_BEAT,
];

describe('flag gating', () => {
  test('team intro requires BOTH the master swap flag and its own sub-flag', () => {
    expect(teamIntroEnabled(envOf({}))).toBe(false);
    expect(teamIntroEnabled(envOf({ AVATAR_SWAP_ENABLED: 'true' }))).toBe(false);
    expect(teamIntroEnabled(envOf({ TEAM_INTRO_ENABLED: 'true' }))).toBe(false);
    expect(teamIntroEnabled(envOf({ AVATAR_SWAP_ENABLED: 'true', TEAM_INTRO_ENABLED: 'false' }))).toBe(false);
    expect(teamIntroEnabled(envOf({ AVATAR_SWAP_ENABLED: 'true', TEAM_INTRO_ENABLED: 'true' }))).toBe(true);
    expect(avatarSwapEnabled(envOf({ TEAM_INTRO_ENABLED: 'true' }))).toBe(false);
  });
});

describe('prompt content pins', () => {
  test("Sara's cameo carries the FULL honesty clauses (delta c)", () => {
    for (const text of [TEAM_INTRO_BEAT_SARA, SARA_CAMEO_PROMPT]) {
      expect(text).toContain('we have not touched your website');
      expect(text).toContain('built only from your public pages');
      expect(text).toContain('your server is untouched');
    }
    expect(TEAM_INTRO_FALLBACK_SARA).toContain('your server');
    expect(TEAM_INTRO_FALLBACK_SARA).toContain('nothing on your real site');
  });
  test('Alex names the settled platforms and NOT GoDaddy/IONOS (delta d)', () => {
    expect(TEAM_INTRO_BEAT_ALEX).toContain('WordPress');
    expect(TEAM_INTRO_BEAT_ALEX).toContain('Wix');
    expect(TEAM_INTRO_BEAT_ALEX).toContain('plain HTML');
    expect(TEAM_INTRO_BEAT_ALEX).toContain('most hosted builders');
    for (const text of ALL_INTRO_PROMPTS) {
      expect(text).not.toContain('GoDaddy');
      expect(text).not.toContain('IONOS');
    }
  });
  test('no intro prompt calls Alex an engineer, and no beat quotes a price', () => {
    for (const text of ALL_INTRO_PROMPTS) {
      expect(text.toLowerCase()).not.toContain('engineer');
      expect(text).not.toContain('$');
    }
  });
  test('Alex is framed as the support specialist in every intro surface', () => {
    expect(TEAM_INTRO_BEAT_ALEX.toLowerCase()).toContain('support specialist');
    expect(SIMULATION_TEAM_INTRO_BEAT).toContain('Alex, our support specialist');
  });
});

describe('segment routing', () => {
  test('intro segments build for the right persona/boundary pairs', () => {
    expect(personaSegmentPrompt('sara', 'intro-sara', 'Any', '').systemPrompt).toBe(SARA_CAMEO_PROMPT);
    expect(personaSegmentPrompt('alex', 'intro-alex', 'Any', '').systemPrompt).toBe(ALEX_CAMEO_PROMPT);
    const host = personaSegmentPrompt('aspen', 'intro-return-1', 'Any', '', undefined, false, { parentPrompt: 'PARENT PROMPT' });
    expect(host.systemPrompt).toContain('PARENT PROMPT');
    expect(host.systemPrompt).toContain(TEAM_INTRO_HOST_SEGMENT);
    const host2 = personaSegmentPrompt('aspen', 'intro-return-2', 'Any', '', undefined, false, { parentPrompt: 'PARENT PROMPT' });
    expect(host2.systemPrompt).toBe(host.systemPrompt);
  });
  test('wrong persona/boundary pairs throw, and host segments require the teamIntro options', () => {
    expect(() => personaSegmentPrompt('aspen', 'intro-sara', 'Any', '')).toThrow();
    expect(() => personaSegmentPrompt('sara', 'intro-alex', 'Any', '')).toThrow();
    expect(() => personaSegmentPrompt('alex', 'intro-return-1', 'Any', '')).toThrow();
    expect(() => personaSegmentPrompt('aspen', 'intro-return-1', 'Any', '')).toThrow(/teamIntro options are required/);
    expect(() => personaSegmentPrompt('aspen', 'intro-return-2', 'Any', '')).toThrow(/teamIntro options are required/);
  });
  test('intro boundary helpers agree with the family list', () => {
    expect(INTRO_BOUNDARIES).toEqual(['intro-sara', 'intro-return-1', 'intro-alex', 'intro-return-2']);
    for (const b of INTRO_BOUNDARIES) expect(isIntroBoundary(b)).toBe(true);
    expect(isIntroBoundary('doorway')).toBe(false);
    expect(isIntroBoundary('nonsense')).toBe(false);
  });
});

describe('demo-site introduction beat (delta a)', () => {
  test('inserts immediately after the long reassurance in SIMULATION_GREETING', () => {
    const out = withSimulationTeamIntro(SIMULATION_GREETING);
    expect(out).toContain(SIMULATION_TEAM_INTRO_BEAT);
    expect(out.indexOf(SIMULATION_TEAM_INTRO_BEAT)).toBeGreaterThan(out.indexOf(DEMO_NOT_TOUCHED_REASSURANCE));
    expect(out.indexOf(SIMULATION_TEAM_INTRO_BEAT)).toBeLessThan(out.indexOf('Here is exactly what this is:'));
  });
  test('inserts immediately after the SLIMMED reassurance (disclaimer-slim form)', () => {
    const slimGreeting = `{timeGreeting}, {visitorFirstName}. ${DEMO_NOT_TOUCHED_REASSURANCE_SLIM} Here is exactly what this is: the explanation.`;
    const out = withSimulationTeamIntro(slimGreeting);
    expect(out.indexOf(SIMULATION_TEAM_INTRO_BEAT)).toBeGreaterThan(out.indexOf(DEMO_NOT_TOUCHED_REASSURANCE_SLIM));
    expect(out.indexOf(SIMULATION_TEAM_INTRO_BEAT)).toBeLessThan(out.indexOf('Here is exactly what this is:'));
  });
  test('lands on the invite greeting too (invites arrive on /demo-site)', () => {
    const out = withSimulationTeamIntro(DEMO_INVITE_GREETING);
    expect(out).toContain(SIMULATION_TEAM_INTRO_BEAT);
    expect(out.indexOf(SIMULATION_TEAM_INTRO_BEAT)).toBeGreaterThan(out.indexOf(DEMO_NOT_TOUCHED_REASSURANCE));
  });
  test('identity when the beat is already present, no anchor matches, or input is empty', () => {
    const once = withSimulationTeamIntro(SIMULATION_GREETING);
    expect(withSimulationTeamIntro(once)).toBe(once);
    const unrelated = 'Good morning, and welcome to the show.';
    expect(withSimulationTeamIntro(unrelated)).toBe(unrelated);
    expect(withSimulationTeamIntro('')).toBe('');
  });
  test('the beat introduces Sara as the walkthrough receptionist and name-drops Alex once', () => {
    expect(SIMULATION_TEAM_INTRO_BEAT).toContain('meet Sara');
    expect(SIMULATION_TEAM_INTRO_BEAT).toContain("playing your own receptionist");
    expect(SIMULATION_TEAM_INTRO_BEAT).toContain("you'll meet Alex");
  });
});

describe('opening priority', () => {
  test('an intro boundary opening is the planned-swap branch: no apology, no resume, no re-greet', () => {
    for (const [to, boundary] of [['sara', 'intro-sara'], ['aspen', 'intro-return-1'], ['alex', 'intro-alex'], ['aspen', 'intro-return-2']] as const) {
      const text = openingText({ preview: false, personaSwap: { to, boundary }, resumeContext: RECAP });
      expect(text).toContain('planned persona handoff');
      // The resume greeting itself must never appear (the instruction's
      // own prohibition — never say "you're back" — is quoted text, not
      // a greeting; same assertion shape as avatar-swap.test.ts).
      expect(text).not.toMatch(/Hey, you're back/);
      expect(text).not.toContain('Sorry');
      expect(text).not.toContain('hiccuped');
      expect(text).not.toContain('Apologize ONCE');
    }
  });
});

describe('client state machine', () => {
  const inPhase = (phase: SwapState['phase'], extra: Partial<SwapState> = {}): SwapState => ({ ...INITIAL_SWAP_STATE, phase, ...extra });
  test('intro anchors arm only in their own phase', () => {
    expect(boundaryForAssistantLine(TEAM_INTRO_BEAT_BRIDGE_SARA, inPhase('intro'))).toBe('intro-sara');
    expect(boundaryForAssistantLine(TEAM_INTRO_BEAT_SARA, inPhase('intro-sara'))).toBe('intro-return-1');
    expect(boundaryForAssistantLine(TEAM_INTRO_BEAT_BRIDGE_ALEX, inPhase('intro-host'))).toBe('intro-alex');
    expect(boundaryForAssistantLine(TEAM_INTRO_BEAT_ALEX, inPhase('intro-alex'))).toBe('intro-return-2');
    expect(boundaryForAssistantLine(TEAM_INTRO_BEAT_BRIDGE_SARA, inPhase('host'))).toBeNull();
    expect(boundaryForAssistantLine(TEAM_INTRO_BEAT_BRIDGE_SARA, inPhase('intro-host'))).toBeNull();
  });
  test('the once-per-session latch closes every intro anchor', () => {
    expect(boundaryForAssistantLine(TEAM_INTRO_BEAT_BRIDGE_SARA, inPhase('intro', { teamIntroDone: true }))).toBeNull();
    expect(boundaryForAssistantLine(TEAM_INTRO_BEAT_BRIDGE_ALEX, inPhase('intro-host', { teamIntroDone: true }))).toBeNull();
  });
  test('bridge beats yield to a visitor line; cameo beats do not', () => {
    expect(introYieldOnVisitorLine(inPhase('intro'))).toBe(true);
    expect(introYieldOnVisitorLine(inPhase('intro', { armed: ['intro-sara'] }))).toBe(false);
    expect(introYieldOnVisitorLine(inPhase('intro-host'))).toBe(true);
    expect(introYieldOnVisitorLine(inPhase('intro-host', { armed: ['intro-alex'] }))).toBe(false);
    expect(introYieldOnVisitorLine(inPhase('intro-sara'))).toBe(false);
    expect(introYieldOnVisitorLine(inPhase('intro', { teamIntroDone: true }))).toBe(false);
  });
  test('a drop mid-show re-authorizes the SAME persona; the parent Aspen stays legacy', () => {
    expect(reconnectTarget(inPhase('intro'), 'parent-1')).toEqual({ persona: 'aspen' });
    expect(reconnectTarget(inPhase('intro-sara', { persona: 'sara' }), 'parent-1')).toEqual({
      persona: 'sara', personaSegment: { persona: 'sara', boundary: 'intro-sara', parentSessionId: 'parent-1' },
    });
    expect(reconnectTarget(inPhase('intro-host'), 'parent-1')).toEqual({
      persona: 'aspen', personaSegment: { persona: 'aspen', boundary: 'intro-return-1', parentSessionId: 'parent-1' },
    });
    expect(reconnectTarget(inPhase('intro-alex', { persona: 'alex' }), 'parent-1')).toEqual({
      persona: 'alex', personaSegment: { persona: 'alex', boundary: 'intro-alex', parentSessionId: 'parent-1' },
    });
  });
  test('the teamIntroSeen recap fact rides exactly while the chain carries it', () => {
    expect(swapRecapFacts(inPhase('intro'))).toEqual([]);
    expect(swapRecapFacts(inPhase('intro', { teamIntroSeen: true }))).toEqual([TEAM_INTRO_SEEN_FACT]);
  });
});

describe('owner transition spec — crossfade + transcript', () => {
  test('the crossfade is 300ms and face slots alternate', () => {
    expect(SWAP_CROSSFADE_MS).toBe(300);
    expect(otherFaceSlot('main')).toBe('second');
    expect(otherFaceSlot('second')).toBe('main');
  });
  test('handoff divider rows never enter a swap recap', () => {
    const recap = buildSwapRecap([
      { role: 'assistant', text: 'Aspen line before the handoff' },
      { role: 'divider', text: 'DIVIDER-MARKER' },
      { role: 'user', text: 'Visitor line' },
    ], { businessName: 'Durgin Electric', facts: [] }, 'sara');
    expect(recap).not.toContain('DIVIDER-MARKER');
    expect(recap).toContain('Aspen line before the handoff');
    expect(recap).toContain('Visitor line');
  });
  test('divider strings exist in all three locales with the name slot', () => {
    const en = JSON.parse(read('src/i18n/locales/en.json')) as { voice: Record<string, string> };
    const es = JSON.parse(read('src/i18n/locales/es.json')) as { voice: Record<string, string> };
    const pt = JSON.parse(read('src/i18n/locales/pt-BR.json')) as { voice: Record<string, string> };
    expect(en.voice.handoffTo).toBe('— {{name}} takes over —');
    expect(es.voice.handoffTo).toBe('— {{name}} toma el relevo —');
    expect(pt.voice.handoffTo).toBe('— {{name}} assume agora —');
  });
  test('SimliAvatar carries the dissolve: style opacity, 300ms transition, fadeOut + retire handles', () => {
    const src = read('src/components/SimliAvatar.tsx');
    expect(src).toContain("transition: 'opacity 300ms ease-in-out'");
    expect(src).toContain('fadeOut: () => { setFadedOut(true); }');
    expect(src).toContain('retire?: () => void');
    expect(src).toContain('layer?: number');
  });
  test('the cut-over reveals in the free slot, fades the frozen frame, retires after the fade, and stamps a divider', () => {
    const src = read('src/components/GeminiConversation.tsx');
    expect(src).toContain('otherFaceSlot(faceSlotOwnerRef.current)');
    expect(src).toContain('outgoing?.fadeOut?.()');
    expect(src).toContain('SWAP_CROSSFADE_MS + 80');
    expect(src).toContain('{ role: "divider" as const, text: "", speaker: incoming }');
    expect(src).toContain('t("voice.handoffTo"');
    // Per-persona speaker stamps are read from the swap state at flush time.
    expect(src).toContain('swapStateRef.current.persona');
    // The partial teardown (the only teardown a swap runs) never clears turns.
    const partial = src.slice(src.indexOf('const partialTeardownForSwap'), src.indexOf('const stopEverything'));
    expect(partial).not.toContain('setTurns');
  });
});
