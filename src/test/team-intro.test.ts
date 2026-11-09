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
//  - the demo-site opening (REVISED delta a + disclaimer ownership,
//    owner 2026-11-09 20:58–21:00): greeting variants rotate one
//    approved statistic each; welcome → pitch → comfort → Sara intro
//    last; NO spoken disclaimer in Aspen's greetings; Sara's beat 4b
//    carries it; the close's single homepage line; Act 1 scoping
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
  ALEX_CAMEO_PROMPT, INTRO_BOUNDARIES, SARA_CAMEO_PROMPT,
  TEAM_INTRO_BEAT_ALEX, TEAM_INTRO_BEAT_BRIDGE_ALEX, TEAM_INTRO_BEAT_BRIDGE_SARA,
  TEAM_INTRO_BEAT_RETURN, TEAM_INTRO_BEAT_SARA, TEAM_INTRO_FALLBACK_ALEX, TEAM_INTRO_FALLBACK_SARA,
  TEAM_INTRO_HOST_SEGMENT, TEAM_INTRO_TEACHING, isIntroBoundary,
} from '../../supabase/functions/_shared/team-intro';
import {
  DEMO_NOT_TOUCHED_REASSURANCE, DEMO_SITE_COMFORT_LINE, DEMO_SITE_GREETING_VARIANTS, DEMO_SITE_SARA_INTRO,
  DEMO_SITE_STAT_LINES, SIMULATION_CLOSE_SEGMENT, SIMULATION_GREETING, SIMULATION_RECEPTIONIST_SEGMENT,
  businessDemoConfig,
} from '../../supabase/functions/_shared/voice-config';
import { DEMO_INVITE_GREETING, DEMO_INVITE_GREETING_VARIANTS, DEMO_VERIFICATION_GREETING } from '../../supabase/functions/_shared/demo-sales';
import { openingText, personaResumeInstruction, swapOpeningInstruction } from '../../supabase/functions/_shared/session-opening';
import {
  INITIAL_SWAP_STATE, SWAP_CROSSFADE_MS, TEAM_INTRO_SEEN_FACT, boundaryForAssistantLine, buildSwapRecap,
  chainIsMidSegment, chainStashTarget, cutoverAudioSync, introYieldOnVisitorLine, otherFaceSlot, reconnectTarget, swapRecapFacts,
  type ChainStash, type SwapState,
} from '@/lib/personaSwap';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
const envOf = (m: Record<string, string>) => (n: string) => m[n];
const RECAP = 'The visitor is Dana from Durgin Electric. Website: durginelectric.com.';
const ALL_INTRO_PROMPTS = [
  TEAM_INTRO_BEAT_BRIDGE_SARA, TEAM_INTRO_BEAT_SARA, TEAM_INTRO_BEAT_BRIDGE_ALEX, TEAM_INTRO_BEAT_ALEX,
  TEAM_INTRO_BEAT_RETURN, TEAM_INTRO_FALLBACK_SARA, TEAM_INTRO_FALLBACK_ALEX, TEAM_INTRO_TEACHING,
  SARA_CAMEO_PROMPT, TEAM_INTRO_HOST_SEGMENT, ALEX_CAMEO_PROMPT,
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
    // The demo-site opening's only Alex material is the comfort line.
    expect(DEMO_SITE_COMFORT_LINE).toContain('our support specialist, Alex');
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

describe('demo-site opening (revised delta a + disclaimer ownership, owner 2026-11-09 20:58–21:00)', () => {
  test('three standard variants rotate exactly one approved statistic each', () => {
    expect(DEMO_SITE_GREETING_VARIANTS).toHaveLength(3);
    expect(DEMO_SITE_STAT_LINES).toHaveLength(3);
    DEMO_SITE_GREETING_VARIANTS.forEach((greeting, i) => {
      expect(greeting).toContain(DEMO_SITE_STAT_LINES[i]);
      DEMO_SITE_STAT_LINES.forEach((stat, j) => { if (j !== i) expect(greeting).not.toContain(stat); });
      // Approved framings survive: the 78% line keeps its survey scope
      // and SAID framing; no publisher is named in any opening.
      expect(greeting).not.toContain('Facebook');
    });
    expect(DEMO_SITE_STAT_LINES[0]).toContain("85% of callers who hit a business's voicemail don't call back");
    expect(DEMO_SITE_STAT_LINES[1]).toContain('78% of 1,000 U.S. consumers said they had abandoned a business');
    expect(DEMO_SITE_STAT_LINES[2]).toContain("67% of callers hang up the moment they can't reach a real person");
  });
  test('every standard variant: welcome → pitch → comfort → Sara intro LAST, and NO spoken disclaimer from Aspen', () => {
    for (const greeting of DEMO_SITE_GREETING_VARIANTS) {
      expect(greeting).toContain('thanks for trying the demo I built for {businessName}');
      expect(greeting).toContain('your partner for growth');
      expect(greeting).toContain('bread and butter');
      expect(greeting).toContain('more revenue, without more staff');
      expect(greeting).toContain('a live avatar just like me can be on your website');
      expect(greeting).toContain(DEMO_SITE_COMFORT_LINE);
      expect(greeting.endsWith(DEMO_SITE_SARA_INTRO)).toBe(true);
      expect(greeting).not.toContain(DEMO_NOT_TOUCHED_REASSURANCE);
      expect(greeting).not.toContain("haven't touched your website or your server");
      // No Alex cameo in the opening: his name appears only in the comfort line.
      expect(greeting.split('Alex').length - 1).toBe(1);
    }
    expect(SIMULATION_GREETING).toBe(DEMO_SITE_GREETING_VARIANTS[0]);
  });
  test('invite variants mirror the structure with the invitation welcome and the name check', () => {
    expect(DEMO_INVITE_GREETING_VARIANTS).toHaveLength(3);
    DEMO_INVITE_GREETING_VARIANTS.forEach((greeting, i) => {
      expect(greeting).toContain(DEMO_SITE_STAT_LINES[i]);
      expect(greeting).toContain('Thanks for accepting the invitation');
      expect(greeting).toContain('already loaded on your website');
      expect(greeting).toContain('{nameConfirm}');
      expect(greeting).toContain('your partner for growth');
      expect(greeting.endsWith(DEMO_SITE_SARA_INTRO)).toBe(true);
      expect(greeting).not.toContain(DEMO_NOT_TOUCHED_REASSURANCE);
      // The channel is never named (word-boundary: "voicemail" in the
      // 85% statistic is obviously not the channel).
      expect(greeting).not.toContain('Facebook');
      expect(greeting.toLowerCase()).not.toMatch(/\bemail\b/);
    });
    expect(DEMO_INVITE_GREETING).toBe(DEMO_INVITE_GREETING_VARIANTS[0]);
  });
  test('businessDemoConfig wires the rotation: snapshot simulationGreetings win, code variants are the fallback', () => {
    const fromCode = businessDemoConfig('Durgin Electric', 'knowledge');
    expect(fromCode.greetings).toEqual(DEMO_SITE_GREETING_VARIANTS);
    expect(fromCode.greeting).toBe(SIMULATION_GREETING);
    const fromSnapshot = businessDemoConfig('Durgin Electric', 'knowledge', { simulationGreeting: 'SNAP GREETING', simulationGreetings: ['SNAP A', 'SNAP B'] });
    expect(fromSnapshot.greeting).toBe('SNAP GREETING');
    expect(fromSnapshot.greetings).toEqual(['SNAP A', 'SNAP B']);
  });
  test('gemini-session protects Act 1 and the flags-off path from the pitch rotation', () => {
    const src = read('supabase/functions/gemini-session/index.ts');
    // Verification-pending: the rotation array is cleared with the Act 1 greeting.
    expect(src).toContain("config.greeting=DEMO_VERIFICATION_GREETING; config.greetings=[];");
    // Invite arrivals rotate the INVITE variants.
    expect(src).toContain('config.greetings=DEMO_INVITE_GREETING_VARIANTS');
    // Flags off: legacy slim greetings, rotation cleared (dark launch stays byte-identical).
    expect(src).toContain('SIMULATION_GREETING_LEGACY_SLIM');
    expect(src).toContain('DEMO_INVITE_GREETING_LEGACY_SLIM');
  });
  test("Sara's first in-simulation beat carries the disclaimer (all three clauses + public pages)", () => {
    expect(SIMULATION_RECEPTIONIST_SEGMENT).toContain('THE HONESTY NOTE');
    expect(SIMULATION_RECEPTIONIST_SEGMENT).toContain("this is a mock-up layered over a copy of your site — we haven't touched your website or your server");
    expect(SIMULATION_RECEPTIONIST_SEGMENT).toContain('built only from your public pages');
    // The doorway swap opening directs the same order: greeting → honesty note → overview.
    const doorway = swapOpeningInstruction({ to: 'sara', boundary: 'doorway' }, RECAP);
    expect(doorway).toContain('honesty note');
    expect(doorway.indexOf('honesty note')).toBeLessThan(doorway.indexOf('business overview'));
  });
  test('the close gains exactly one homepage invitation line', () => {
    const line = "visit aihiddenleads.com — there's more we can do to help you grow than one demo can show";
    expect(SIMULATION_CLOSE_SEGMENT).toContain(line);
    expect(SIMULATION_CLOSE_SEGMENT.split(line).length - 1).toBe(1);
  });
  test("the verification gate's Act 1 greeting keeps Aspen's reassurance (deliberate scoping)", () => {
    expect(DEMO_VERIFICATION_GREETING).toContain(DEMO_NOT_TOUCHED_REASSURANCE);
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

describe('swap-audio fix batch (2026-11-09 evening) — defects 1, 2, 4', () => {
  const convo = read('src/components/GeminiConversation.tsx');
  const simli = read('src/components/SimliAvatar.tsx');

  test('defect 1: the cut-over audio sync is mute-sync, routing, activate — in that order', () => {
    expect(cutoverAudioSync({ speakerMuted: false, paused: false, replaying: false, selectedDeviceId: null }))
      .toEqual({ muted: false, deviceId: null });
    expect(cutoverAudioSync({ speakerMuted: true, paused: false, replaying: false, selectedDeviceId: 'spk-1' }))
      .toEqual({ muted: true, deviceId: 'spk-1' });
    // A muted outgoing state yields a muted incoming activation: pause
    // and replay states mute exactly like the speaker toggle does.
    expect(cutoverAudioSync({ speakerMuted: false, paused: true, replaying: false, selectedDeviceId: null }).muted).toBe(true);
    expect(cutoverAudioSync({ speakerMuted: false, paused: false, replaying: true, selectedDeviceId: null }).muted).toBe(true);
  });

  test('defect 1: the cut-over applies the sync to the INCOMING handle after the pointer re-point', () => {
    const repoint = convo.indexOf('avatarRef.current = incomingHandle');
    const syncAt = convo.indexOf('incomingHandle.cutoverAudioSync(sync)', repoint);
    const socketAt = convo.indexOf('connectSegmentSocket(staged.token,', repoint); // segment-connect build: the cut-over call now also passes a connect ctx (retry-once + diagnostics); the ordering this pin guards is unchanged
    expect(repoint).toBeGreaterThanOrEqual(0);
    expect(syncAt).toBeGreaterThan(repoint);
    expect(socketAt).toBeGreaterThan(syncAt);
    // The sync payload is the session's CURRENT effective state.
    expect(convo).toContain('cutoverAudioSync({ speakerMuted: speakerMutedRef.current, paused: captureRef.current.paused, replaying: captureRef.current.replaying, selectedDeviceId: selectedOutputIdRef.current })');
    // A sound block surfaces the tap affordance instead of failing the swap.
    expect(convo).toContain("e.message === SOUND_BLOCKED) setAudioNeedsTap(true)");
    // The trap stays shut: no start() re-call inside the cut-over body.
    const body = convo.slice(convo.indexOf('executeSwapRef.current = async'), convo.indexOf('dropRecoverRef.current = () =>'));
    expect(body).not.toContain('.start(');
  });

  test('defect 1: the handle method performs setPlaybackMuted-then-activate semantics in order', () => {
    const start = simli.indexOf('cutoverAudioSync: async');
    const body = simli.slice(start, simli.indexOf('sendPcm24k:', start));
    const muteAt = body.indexOf('playbackMutedRef.current = muted');
    const sinkAt = body.indexOf('desiredSinkIdRef.current = deviceId');
    const playAt = body.indexOf('await audio.play()');
    expect(muteAt).toBeGreaterThanOrEqual(0);
    expect(sinkAt).toBeGreaterThan(muteAt);
    expect(playAt).toBeGreaterThan(sinkAt);
    expect(body).toContain("throw new Error(SOUND_BLOCKED)");
    expect(simli).toContain('cutoverAudioSync?: (sync: { muted: boolean; deviceId: string | null }) => Promise<void>');
  });

  test('defect 2: both speaking labels render the ACTIVE persona, never the static name prop', () => {
    expect(convo).toContain('t("voice.speaking", { name: PERSONAS[activePersona].displayName })');
    expect(convo).toContain('t("voice.isSpeaking", { name: PERSONAS[activePersona].displayName })');
    expect(convo).not.toContain('t("voice.speaking", { name })');
    expect(convo).not.toContain('t("voice.isSpeaking", { name })');
    // The name prop still serves the strings that mean the tenant agent.
    expect(convo).toContain('t("voice.pressPlayReconnect", { name })');
  });

  test('defect 4: the caption region clips, and the karaoke surface flexes instead of a fixed height', () => {
    const css = read('src/index.css');
    const region = css.slice(css.indexOf('.aspen-voice-panel > .aspen-caption-region {'));
    expect(region.slice(0, region.indexOf('}'))).toContain('overflow: hidden');
    expect(convo).toContain('flex min-h-0 flex-1 flex-col rounded-md border border-border bg-background/95 p-1.5');
    const caption = read('src/components/PlaybackCaption.tsx');
    expect(caption).toContain('h-full min-h-0 flex-1');
    expect(caption).not.toContain('h-[58px]');
  });
});

describe('swap-audio fix batch — defect 3: manual stop resumes the chain', () => {
  const simState: SwapState = { ...INITIAL_SWAP_STATE, phase: 'simulation', persona: 'sara', segment: 1, armed: ['doorway'], done: ['doorway'] };
  const stashOf = (state: SwapState): ChainStash => ({ state, parentSessionId: 'parent-123', visitorKey: 'vk-1', businessName: 'Great Gulf' });

  test('teardown mid-segment → restart re-authorises the ACTIVE segment (persona, entry boundary, original parent)', () => {
    expect(chainIsMidSegment(simState)).toBe(true);
    expect(chainStashTarget(stashOf(simState))).toEqual({
      persona: 'sara',
      personaSegment: { persona: 'sara', boundary: 'doorway', parentSessionId: 'parent-123' },
    });
    const closeState: SwapState = { ...simState, phase: 'close', persona: 'aspen', segment: 2, done: ['doorway', 'stepout'] };
    expect(chainStashTarget(stashOf(closeState))?.personaSegment?.boundary).toBe('stepout');
    const alexState: SwapState = { ...simState, phase: 'alex-guest', persona: 'alex', segment: 3, done: ['doorway', 'stepout', 'meet-alex'] };
    expect(chainStashTarget(stashOf(alexState))?.personaSegment).toEqual({ persona: 'alex', boundary: 'meet-alex', parentSessionId: 'parent-123' });
    const introSara: SwapState = { ...INITIAL_SWAP_STATE, phase: 'intro-sara', persona: 'sara', segment: 1, done: ['intro-sara'] };
    expect(chainStashTarget(stashOf(introSara))?.personaSegment?.boundary).toBe('intro-sara');
  });

  test('teardown as host (or intro parent) → no segment target: the fresh-parent start stays unchanged', () => {
    expect(chainIsMidSegment(INITIAL_SWAP_STATE)).toBe(false);
    expect(chainStashTarget(stashOf({ ...INITIAL_SWAP_STATE }))).toBeNull();
    expect(chainStashTarget(stashOf({ ...INITIAL_SWAP_STATE, phase: 'intro' }))).toBeNull();
    expect(chainStashTarget(null)).toBeNull();
    expect(chainStashTarget(undefined)).toBeNull();
  });

  test('the segment resume target matches the drop-recovery target for the same state', () => {
    expect(chainStashTarget(stashOf(simState))).toEqual(reconnectTarget(simState, 'parent-123'));
  });

  test('the resume opening is a welcome-back from the SAME persona: no apology, no host greeting, no restart', () => {
    for (const persona of ['sara', 'alex', 'aspen'] as const) {
      const text = personaResumeInstruction({ persona }, RECAP);
      expect(text).toContain('Welcome back');
      expect(text).toContain('Do NOT apologize');
      expect(text).not.toContain("Hey, you're back");
      expect(text).not.toContain('connection dropped');
    }
    expect(personaResumeInstruction({ persona: 'sara' }, RECAP)).toContain('You are still Sara');
    // Priority: a resume segment can never fall through to branch 5.
    const viaOpening = openingText({ preview: false, personaResume: { persona: 'sara' }, resumeContext: RECAP, reconnect: true });
    expect(viaOpening).toBe(personaResumeInstruction({ persona: 'sara' }, RECAP));
    expect(viaOpening).not.toContain("Hey, you're back");
    // The drop branch still outranks resume when both are somehow set.
    const dropFirst = openingText({ preview: false, personaDrop: { persona: 'sara', drops: 0 }, personaResume: { persona: 'sara' }, resumeContext: RECAP });
    expect(dropFirst).toContain('connection dropped for a moment');
  });

  test('client wiring: teardown stashes mid-segment, start resumes the stash, drop recovery untouched', () => {
    const convo = read('src/components/GeminiConversation.tsx');
    expect(convo).toContain('const visitChainStash = new Map<string, ChainStash>();');
    const teardown = convo.slice(convo.indexOf('const teardown = useCallback'), convo.indexOf('const partialTeardownForSwap'));
    expect(teardown).toContain('chainIsMidSegment(swapStateRef.current)');
    expect(teardown).toContain('visitChainStash.set(agentId || "homepage"');
    expect(convo).toContain('await resumeSegmentChainRef.current(stash)');
    expect(convo).toContain("{ swap: false, manualResume: true }");
    // The unplanned-drop path is exactly as it was: same request shape.
    expect(convo).toContain("{ swap: false, dropRecovery: true }");
    // A fresh parent authorization spends the stash (new demo journey).
    expect(convo).toContain('visitChainStash.delete(agentId || "homepage")');
  });

  test('server wiring: gemini-session stamps personaResume (never alongside swap/drop); the proxy passes it through', () => {
    const session = read('supabase/functions/gemini-session/index.ts');
    expect(session).toContain('manualResume:z.boolean().default(false)');
    expect(session.match(/personaResume:\{persona:persona\.id\}/g)).toHaveLength(2);
    expect(session.match(/manualResume:b\.personaSegment\.manualResume/g)).toHaveLength(2);
    const proxy = read('supabase/functions/gemini-live-proxy/index.ts');
    expect(proxy).toContain('personaResume: (config.personaResume ?? null)');
  });
});
