// @vitest-environment node
/**
 * Obey-requests pass (2026-11-23) — Ron's phone-test defects:
 * (a) ignored summons (Sara/Alex asked for by name and ignored),
 * (b) double demo-start confirmation, (c) Aspen returning
 * uninvited mid-Alex-segment, (d) the early "copy of this
 * conversation" capture ask inside demos, (e) demo dead stops,
 * (f) Sara pre-stage failure telemetry + retry + revival hold.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  FACE_REVIVAL_HOLD_MS, INITIAL_FACE_LIVENESS, INITIAL_SWAP_STATE,
  boundaryForAssistantLine, faceLivenessOnLive, faceLivenessOnNotLive,
  faceLivenessOnStartSettled, linePerformsHandBack, noteAlexIntent,
  noteAspenIntent, noteSaraIntent, revivalHoldContinues,
  visitorRequestsSara, type SwapState,
} from '@/lib/personaSwap';
import { SOUND_BLOCKED, classifyFaceStartFailure } from '@/components/SimliAvatar';
import {
  SUMMON_NUDGE_CAP, detectSummonIntent, modelPerformedHandoff, summonNudgeDirective,
} from '../../supabase/functions/_shared/summon-intent';
import { DEMO_INVITE_OPENING_SWAP } from '../../supabase/functions/_shared/demo-sales';
import { TEAM_FACTS } from '../../supabase/functions/_shared/homepage-knowledge';
import { ALEX_DEMO_GUEST_PROMPT } from '../../supabase/functions/_shared/alex-guide';
import { SIMULATION_PROMPT } from '../../supabase/functions/_shared/voice-config';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
const inPhase = (phase: SwapState['phase'], extra: Partial<SwapState> = {}): SwapState => ({
  ...INITIAL_SWAP_STATE,
  phase,
  ...(phase === 'simulation' ? { persona: 'sara' as const, done: ['doorway' as const] } : {}),
  ...(phase === 'alex-guest' ? { persona: 'alex' as const, done: ['doorway' as const, 'stepout' as const, 'meet-alex' as const] } : {}),
  ...extra,
});

// ---------------------------------------------------------------- (a) Sara summon, client side
describe('visitorRequestsSara — positives', () => {
  const positives = [
    'Can I talk to Sara?',
    'Let me speak to Sarah please',
    'Bring Sara in',
    'Get Sara',
    'Sara?',
    'I want to talk to Sara',
    'Transfer me to Sara',
    'Can I talk to your receptionist?',
    'Let me hear the receptionist',
  ];
  for (const line of positives) {
    test(`matches: ${line}`, () => { expect(visitorRequestsSara(line)).toBe(true); });
  }
});
describe('visitorRequestsSara — negatives', () => {
  const negatives = [
    'My partner Sara handles our phones',
    'Sara is my office manager',
    "Don't bring Sara",
    'Not Sara, thanks',
    'Tell me about your services',
    'What are your hours?',
    '',
  ];
  for (const line of negatives) {
    test(`no match: ${line || '(empty)'}`, () => { expect(visitorRequestsSara(line)).toBe(false); });
  }
});
describe('noteSaraIntent — state logic', () => {
  test('host + ask → pendingSara arms', () => {
    const state = noteSaraIntent(inPhase('host'), 'Can I talk to Sara?');
    expect(state.pendingSara).toBe(true);
  });
  test('host + armed → next Aspen line yields doorway with NO announcement text', () => {
    const state = noteSaraIntent(inPhase('host'), 'Get Sara');
    expect(boundaryForAssistantLine('Of course, one moment.', state)).toBe('doorway');
  });
  test('host WITHOUT the ask → a filler line still does NOT open the doorway (announcement gate intact)', () => {
    expect(boundaryForAssistantLine('Of course, one moment.', inPhase('host'))).toBe(null);
  });
  test('simulation phase is inert (Sara is already live)', () => {
    const before = inPhase('simulation');
    expect(noteSaraIntent(before, 'Can I talk to Sara?')).toBe(before);
  });
  test('presenter chains never summon Sara', () => {
    const before = inPhase('host', { presenter: 'frank' });
    expect(noteSaraIntent(before, 'Can I talk to Sara?')).toBe(before);
  });
  test('one-shot: doorway already done → inert', () => {
    const before = inPhase('simulation');
    expect(noteSaraIntent(before, 'Can I talk to Sara?')).toBe(before);
  });
  test('a decline does not arm', () => {
    const before = inPhase('host');
    expect(noteSaraIntent(before, "Don't bring Sara")).toBe(before);
  });
  test('the latest named-person ask wins: Sara supersedes a standing Alex intent and vice versa', () => {
    const alexArmed = noteAlexIntent(inPhase('host'), 'Where is Alex?');
    expect(alexArmed.pendingAlex).toBe(true);
    const saraArmed = noteSaraIntent(alexArmed, 'Actually, get Sara');
    expect(saraArmed.pendingSara).toBe(true);
    expect(saraArmed.pendingAlex).toBe(false);
    const alexAgain = noteAlexIntent(saraArmed, 'No wait — Alex');
    expect(alexAgain.pendingAlex).toBe(true);
    expect(alexAgain.pendingSara).toBe(false);
  });
});

// ---------------------------------------------------------------- (a) summon intent, proxy side
describe('detectSummonIntent', () => {
  const cases: Array<[string, ReturnType<typeof detectSummonIntent>]> = [
    ['Can I talk to Sara?', 'sara'],
    ['Let me speak to Sarah', 'sara'],
    ['Talk to your receptionist please', 'sara'],
    ['Get Alex for me', 'alex'],
    ['I want to talk to someone from your team about setup', 'alex'],
    ['Show me the demo for this site', 'skip'],
    ["Let's see it working", 'skip'],
    ['Skip to the demo', 'skip'],
    ['Can we start the demo now?', 'skip'],
    // Roleplay content about the simulated business is NOT a skip.
    ['Show me the diamond wire electrical work you did', null],
    ['Show me your service area', null],
    ["Don't bring Sara", null],
    ['Not Alex, thanks', null],
    ['Tell me about your prices', null],
    ['Sara is my office manager', null],
    ['', null],
  ];
  for (const [line, expected] of cases) {
    test(`${JSON.stringify(line)} → ${expected}`, () => { expect(detectSummonIntent(line)).toBe(expected); });
  }
  test('modelPerformedHandoff recognizes the taught handoff lines only', () => {
    expect(modelPerformedHandoff('Now, meet Sara — she will be the voice of this business.', 'sara')).toBe(true);
    expect(modelPerformedHandoff('So the Premium plan includes four hundred minutes.', 'sara')).toBe(false);
    expect(modelPerformedHandoff('This is Alex — our onboarding engineer. Alex — say hello.', 'alex')).toBe(true);
    expect(modelPerformedHandoff('Alex is great with setup questions later on.', 'alex')).toBe(false);
    expect(modelPerformedHandoff('', 'skip')).toBe(false);
  });
  test('directives order the handoff line and nothing else', () => {
    expect(summonNudgeDirective('sara')).toContain('Can I transfer you to Sara now?');
    expect(summonNudgeDirective('alex')).toContain('This is Alex — our onboarding engineer.');
    expect(summonNudgeDirective('skip')).toContain('skip ahead to the demo');
    expect(SUMMON_NUDGE_CAP).toBe(3);
  });
});

// ---------------------------------------------------------------- (c) Aspen stays gone
describe('alex-guest return gating', () => {
  const longMention = "I can bring Aspen back in a little while if you'd like, but first let me walk you through the install snippet and the wizard steps in some detail so you know exactly what setup involves.";
  const shortHandBack = 'Let me bring Aspen back for the plans side — she has all of that.';
  test('a mid-answer MENTION of bringing Aspen back no longer fires the return', () => {
    expect(longMention.length).toBeGreaterThan(120);
    expect(boundaryForAssistantLine(longMention, inPhase('alex-guest'))).toBe(null);
  });
  test('the taught hand-back as its own short line still fires', () => {
    expect(boundaryForAssistantLine(shortHandBack, inPhase('alex-guest'))).toBe('return');
  });
  test('linePerformsHandBack: performance vs mention', () => {
    expect(linePerformsHandBack(shortHandBack, ['bring aspen back'])).toBe(true);
    expect(linePerformsHandBack(longMention, ['bring aspen back'])).toBe(false);
    expect(linePerformsHandBack('Let me finish this thought first.', ['bring aspen back'])).toBe(false);
  });
  test('visitor asking for Aspen BY NAME while Alex is live arms the return on his next line, anchor or not', () => {
    const state = noteAspenIntent(inPhase('alex-guest'), 'Can I talk to Aspen?');
    expect(state.pendingReturn).toBe(true);
    expect(boundaryForAssistantLine('Sure — one second.', state)).toBe('return');
  });
  test('a platform topic WITHOUT her name does not arm the return (Alex deflects in words)', () => {
    const before = inPhase('alex-guest');
    expect(noteAspenIntent(before, 'How much does it cost?')).toBe(before);
  });
  test("Alex's guest prompt teaches stay-until-summoned and the performed hand-back", () => {
    expect(ALEX_DEMO_GUEST_PROMPT).toContain('STAYING AND LEAVING');
    expect(ALEX_DEMO_GUEST_PROMPT).toContain('a mention is not a hand-back');
  });
});

// ---------------------------------------------------------------- (f) face failure telemetry + hold
describe('classifyFaceStartFailure', () => {
  test('token refusal (final) → token-refused', () => {
    expect(classifyFaceStartFailure(Object.assign(new Error('nope'), { final: true }))).toBe('token-refused');
  });
  test('tagged timeout → timeout', () => {
    expect(classifyFaceStartFailure(Object.assign(new Error('slow'), { videoTimeout: true }))).toBe('timeout');
  });
  test('provider drops → provider-drop', () => {
    expect(classifyFaceStartFailure(new Error('Video disconnected during startup'))).toBe('provider-drop');
    expect(classifyFaceStartFailure(new Error('Websocket Failed'))).toBe('provider-drop');
    expect(classifyFaceStartFailure(new Error('Too Many Retry Attempts Failed to connect'))).toBe('provider-drop');
  });
  test('browser-side finals', () => {
    expect(classifyFaceStartFailure(new Error(SOUND_BLOCKED))).toBe('sound-blocked');
    expect(classifyFaceStartFailure(new Error('Video startup cancelled'))).toBe('cancelled');
    expect(classifyFaceStartFailure(new Error('Avatar view is not ready'))).toBe('not-ready');
  });
  test('anything else → unknown', () => {
    expect(classifyFaceStartFailure(new Error('mystery'))).toBe('unknown');
    expect(classifyFaceStartFailure(null)).toBe('unknown');
    expect(classifyFaceStartFailure(undefined)).toBe('unknown');
  });
});
describe('face liveness failureReason folds', () => {
  test('a failed settle records the classified reason', () => {
    const settled = faceLivenessOnStartSettled(INITIAL_FACE_LIVENESS, false, 'provider-drop');
    expect(settled.failed).toBe(true);
    expect(settled.failureReason).toBe('provider-drop');
  });
  test('a successful settle clears the reason', () => {
    const failed = faceLivenessOnStartSettled(INITIAL_FACE_LIVENESS, false, 'timeout');
    const recovered = faceLivenessOnStartSettled(failed, true);
    expect(recovered.ready).toBe(true);
    expect(recovered.failureReason).toBe(null);
  });
  test('a frame-proof live report clears the reason', () => {
    const failed = faceLivenessOnStartSettled(INITIAL_FACE_LIVENESS, false, 'token-refused');
    const live = faceLivenessOnLive(failed, true);
    expect(live.ready).toBe(true);
    expect(live.failureReason).toBe(null);
  });
  test('a not-live death fold defaults the reason to provider-drop when none was recorded', () => {
    const dead = faceLivenessOnNotLive({ ...INITIAL_FACE_LIVENESS, startFailed: true });
    expect(dead.failed).toBe(true);
    expect(dead.failureReason).toBe('provider-drop');
  });
});
describe('revival hold', () => {
  test('the bound is 2.5s and the decision honors it', () => {
    expect(FACE_REVIVAL_HOLD_MS).toBe(2500);
    expect(revivalHoldContinues({ elapsedMs: 0, faceReady: false })).toBe(true);
    expect(revivalHoldContinues({ elapsedMs: 2499, faceReady: false })).toBe(true);
    expect(revivalHoldContinues({ elapsedMs: 2500, faceReady: false })).toBe(false);
    expect(revivalHoldContinues({ elapsedMs: 100, faceReady: true })).toBe(false);
  });
});

// ---------------------------------------------------------------- prompt law + wiring pins
describe('prompt law (a) — direct requests outrank the script', () => {
  test('the demo-sales script lock carries rough-form skip + name-summon compliance', () => {
    expect(DEMO_INVITE_OPENING_SWAP).toContain('DIRECT REQUESTS OUTRANK THE SCRIPT');
    expect(DEMO_INVITE_OPENING_SWAP).toContain("let's see it working");
    expect(DEMO_INVITE_OPENING_SWAP).toContain('the ask IS the moment');
  });
  test('homepage team facts answer a by-name teammate ask THIS turn', () => {
    expect(TEAM_FACTS).toContain('ASKED FOR A TEAMMATE BY NAME — ANSWER THIS TURN');
    expect(TEAM_FACTS).toContain('offer to start it right now');
  });
});
describe('demo flow (e) — no dead stops', () => {
  test('the receptionist segment opens greet → 2–3 sentences → question, and brief replies are engagement', () => {
    expect(SIMULATION_PROMPT).toContain('introduce {businessName} in TWO OR THREE SENTENCES ONLY');
    expect(SIMULATION_PROMPT).toContain('THE INTRODUCTION NEVER ENDS A TURN ON ITS OWN');
    expect(SIMULATION_PROMPT).toContain('never a reason to stop and wait for more');
    expect(SIMULATION_PROMPT).not.toContain('give a 30 to 45 second overview of {businessName}');
  });
});
describe('wiring pins (b) + (d) + proxy nudge', () => {
  const conversation = read('src/components/GeminiConversation.tsx');
  const proxy = read('supabase/functions/gemini-live-proxy/index.ts');
  test('(b) the confirm tap reserves a tab; both action_result handlers navigate or close it', () => {
    expect(conversation).toContain("if (approved && !pendingAction.id.startsWith('reopen-')) reserveDemoTab();");
    expect(conversation.split('openReservedDemoTab(msg.demoPath)').length - 1).toBe(2);
    expect(conversation).toContain('closeReservedDemoTab()');
    expect(conversation).toContain('Your demo is opening in the new tab');
  });
  test('(d) the blanket early copy-offer is gone; simulation sessions carry the ban, others the genuine-close rule', () => {
    expect(proxy).not.toContain('At a natural closing pause offer once');
    expect(proxy).toContain('NOT DURING THIS DEMO: never offer to send');
    expect(proxy).toContain('Only at the genuine close of the conversation');
    expect(proxy).toContain('conversationCopyBody');
  });
  test('(a) the proxy summon nudge is wired at the turn boundary, scoped to simulation parents', () => {
    expect(proxy).toContain('detectSummonIntent(completedUtterance)');
    expect(proxy).toContain('modelPerformedHandoff(completedModelTurn, intent)');
    expect(proxy).toContain("event: 'summon_nudge'");
    expect(proxy).toContain('config.personaSwapEnabled === true && config.personaSegment == null');
  });
  test('(f) the cut-over persists the classified face-failure reason and holds for the revival', () => {
    expect(conversation).toContain('face-failed:${staged.faceFailureReason');
    expect(conversation).toContain("event: 'face-revival-hold'");
    expect(conversation).toContain('retriedStage');
  });
});
