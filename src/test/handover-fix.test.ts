// Handover fix (2026-11-10 — retest #3 stall; investigation:
// handover-stall-investigation-2026-11-10.md Q4). Covers:
//  1. FORCED CUT-OVER — pendingExecutionBoundary generalizes the F2
//     readiness executor to normal arms; swapWatchdogAction executes
//     on stage readiness (never mid-line), fails fast on a latched
//     face death, and FORCES a bounded decision at the ~10 s arm
//     deadline / stage watchdog; executeSwap's busy guard is now a
//     single-flight queue (enqueue/dequeue) instead of a discard.
//  2. RECOVERABLE FACE VERDICTS — the face-liveness machine: a
//     never-live face reporting not-live during warm-up is NOT a
//     death; a successful start() settle clears a transient latch.
//  3. MIC HOLD — micAudioPasses silences the host's mic from arm
//     until cut-over/fallback; the fallback line rotates, never
//     repeats back-to-back.
//  4. BOUNDED START — boundedSettle settles a hung pre-stage start()
//     as a failure instead of leaving the stage in limbo.
//  5. SWAP HOST PROMPT — swap parents exclude the host entry beats
//     and the receptionist segment; the invite opening's swap variant
//     drops the confirm/continue beats and replaces the simulation-
//     entry order with an explicit yield bar. The NON-swap path is
//     byte-identical (pinned below against the pre-fix literal).
//  6. SARA OVERVIEW CONDITIONING — her doorway opening confirms the
//     website in one line and conditions beats 4–6 on the recap.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  boundedSettle, dequeueSwapExecution, enqueueSwapExecution, faceLivenessOnLive,
  faceLivenessOnNotLive, faceLivenessOnStartSettled, faceNotLiveIsDeath,
  INITIAL_FACE_LIVENESS, micAudioPasses, pendingExecutionBoundary, STAGE_WATCHDOG_MS,
  SWAP_ARM_DEADLINE_MS, swapFallbackLine, swapWatchdogAction,
  type StagedFaceLiveness, type SwapState, INITIAL_SWAP_STATE,
} from '@/lib/personaSwap';
import { DEMO_INVITE_OPENING, DEMO_INVITE_OPENING_SWAP } from '../../supabase/functions/_shared/demo-sales';
import {
  businessDemoConfig, businessDemoConfigSwapParent, SIMULATION_CLOSE_SEGMENT,
  SIMULATION_HOST_SEGMENT, SIMULATION_PROMPT, SIMULATION_RECEPTIONIST_SEGMENT,
} from '../../supabase/functions/_shared/voice-config';
import { swapOpeningInstruction } from '../../supabase/functions/_shared/session-opening';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
const convo = read('src/components/GeminiConversation.tsx');
const geminiSession = read('supabase/functions/gemini-session/index.ts');

const state = (extra: Partial<SwapState> = {}): SwapState => ({ ...INITIAL_SWAP_STATE, ...extra });
const facts = (extra: Partial<Parameters<typeof swapWatchdogAction>[0]> = {}) => ({
  boundary: 'doorway' as const, now: 100_000, armedAt: 95_000,
  stagePresent: true, stageAuthorizedAt: 96_000, faceFailed: false,
  gateReady: false, turnInFlight: false, ...extra,
});

describe('1 — pendingExecutionBoundary generalizes the readiness executor', () => {
  test('a NORMAL arm (no retry pending) is executable', () => {
    expect(pendingExecutionBoundary(state({ armed: ['doorway'] }))).toBe('doorway');
  });
  test('a pending retry still wins over a plain arm', () => {
    expect(pendingExecutionBoundary(state({ armed: ['doorway', 'stepout'], pendingSegmentRetry: 'stepout' }))).toBe('stepout');
  });
  test('done boundaries and empty state are not executable', () => {
    expect(pendingExecutionBoundary(state({ armed: ['doorway'], done: ['doorway'] }))).toBeNull();
    expect(pendingExecutionBoundary(state())).toBeNull();
  });
});

describe('1 — swapWatchdogAction: forced, bounded cut-over', () => {
  test('gate-ready stage with no turn in flight executes on readiness — no turn_complete needed', () => {
    expect(swapWatchdogAction(facts({ gateReady: true }))).toBe('execute');
  });
  test('gate-ready but the outgoing persona is mid-line → wait (never truncate her line)', () => {
    expect(swapWatchdogAction(facts({ gateReady: true, turnInFlight: true }))).toBe('none');
  });
  test('a latched face death executes immediately (the gate fails fast into the ledger), even mid-line', () => {
    expect(swapWatchdogAction(facts({ faceFailed: true, turnInFlight: true }))).toBe('execute');
  });
  test('still warming inside every bound → none', () => {
    expect(swapWatchdogAction(facts())).toBe('none');
  });
  test('the hard arm deadline forces a decision even with NO stage (authorization hung)', () => {
    expect(swapWatchdogAction(facts({ stagePresent: false, stageAuthorizedAt: 0, now: 95_000 + SWAP_ARM_DEADLINE_MS }))).toBe('force');
  });
  test('an authorized-but-unconsumed stage past the watchdog bound forces a decision', () => {
    // Armed recently (deadline not hit) but the stage itself sat unconsumed.
    expect(swapWatchdogAction(facts({ now: 96_000 + STAGE_WATCHDOG_MS, armedAt: 96_000 + STAGE_WATCHDOG_MS - 1_000 }))).toBe('force');
  });
  test('one ms before the deadline → still none', () => {
    expect(swapWatchdogAction(facts({ stagePresent: false, stageAuthorizedAt: 0, now: 95_000 + SWAP_ARM_DEADLINE_MS - 1 }))).toBe('none');
  });
  test('no pending boundary → none whatever the clocks say', () => {
    expect(swapWatchdogAction(facts({ boundary: null, now: 10_000_000 }))).toBe('none');
  });
});

describe('1 — single-flight execution queue (busy turn_complete is remembered, not discarded)', () => {
  test('enqueue remembers a boundary once; dequeue drains in order', () => {
    let q = enqueueSwapExecution([], 'doorway');
    q = enqueueSwapExecution(q, 'doorway');
    q = enqueueSwapExecution(q, 'stepout');
    expect(q).toEqual(['doorway', 'stepout']);
    const first = dequeueSwapExecution(q);
    expect(first.next).toBe('doorway');
    expect(first.rest).toEqual(['stepout']);
    expect(dequeueSwapExecution([])).toEqual({ next: null, rest: [] });
  });
  test('the component queues on busy and the watchdog drains the queue', () => {
    expect(convo).toContain("recordSwapDiag({ event: 'execute-queued'");
    expect(convo).toContain('enqueueSwapExecution(swapExecQueueRef.current, boundary)');
    expect(convo).toContain('dequeueSwapExecution(swapExecQueueRef.current)');
    expect(convo).toContain("recordSwapDiag({ event: 'stage-watchdog'");
    expect(convo).toContain('maybeExecutePendingRef.current(boundary)');
  });
});

describe('2 — face liveness: warm-up not-live is not a death', () => {
  const fresh: StagedFaceLiveness = { ...INITIAL_FACE_LIVENESS };
  test('a never-live face reporting not-live during warm-up changes nothing (no gate abort)', () => {
    const next = faceLivenessOnNotLive(fresh);
    expect(next).toBe(fresh);
    expect(next.failed).toBe(false);
    expect(faceNotLiveIsDeath(fresh)).toBe(false);
  });
  test('a face that WAS live and then reports not-live is dead', () => {
    const lived = faceLivenessOnLive(fresh);
    const dead = faceLivenessOnNotLive(lived);
    expect(dead.failed).toBe(true);
    expect(dead.ready).toBe(false);
    expect(faceNotLiveIsDeath(lived)).toBe(true);
  });
  test('a start() that settled failed is a true failure even without a live report', () => {
    const settled = faceLivenessOnStartSettled(fresh, false);
    expect(settled.failed).toBe(true);
    expect(settled.startFailed).toBe(true);
  });
  test('verdicts are recoverable: a later successful start() clears a transient failure latch', () => {
    const failed = faceLivenessOnStartSettled(fresh, false);
    const recovered = faceLivenessOnStartSettled(failed, true);
    expect(recovered.failed).toBe(false);
    expect(recovered.ready).toBe(true);
    expect(recovered.startFailed).toBe(false);
  });
  test('the component judges staged faces through the machine on BOTH slots', () => {
    expect(convo).toContain('faceLivenessOnNotLive(current)');
    // Voice-first batch: the live fold now carries handle FRAME
    // PROOF (liveness().displayedFrame) so a genuinely live staged
    // face can repair a false readiness verdict (investigation
    // Q5 item 3); the no-frame fold stays everLive-only.
    expect(convo).toContain('faceLivenessOnLive(current, !!(snap?.live && snap.displayedFrame))');
    expect(convo).toContain("onLiveChange={live => handleFaceLiveChange('main', live, mainFace)}");
    expect(convo).toContain("onLiveChange={live => handleFaceLiveChange('second', live, secondFace)}");
    // The #16 degrade-on-paired-failure behavior stays intact.
    expect(convo).toContain('pairedAudioShouldDegrade');
    expect(convo).toContain("'audio-degraded'");
  });
});

describe('3 — mic hold: silence from arm until cut-over or fallback', () => {
  test('the swap hold silences every mic mode', () => {
    expect(micAudioPasses({ swapHold: true, openingGate: false, noiseGateOpen: true, holdToTalk: false })).toBe(false);
    expect(micAudioPasses({ swapHold: true, openingGate: false, noiseGateOpen: true, holdToTalk: true })).toBe(false);
  });
  test('without the hold, the pre-existing semantics are unchanged', () => {
    expect(micAudioPasses({ swapHold: false, openingGate: false, noiseGateOpen: true, holdToTalk: false })).toBe(true);
    expect(micAudioPasses({ swapHold: false, openingGate: true, noiseGateOpen: true, holdToTalk: false })).toBe(false);
    expect(micAudioPasses({ swapHold: false, openingGate: false, noiseGateOpen: false, holdToTalk: false })).toBe(false);
    expect(micAudioPasses({ swapHold: false, openingGate: true, noiseGateOpen: false, holdToTalk: true })).toBe(true);
  });
  test('both mic pipelines consult the hold, the hold engages at arm and releases at cut-over and fallback', () => {
    expect(convo.match(/micAudioPasses\(\{ swapHold: swapHoldRef\.current !== null/g)?.length).toBe(2);
    expect(convo).toContain('startSwapHold(boundary)');
    expect(convo).toContain('partialTeardownForSwap();\n      // Handover fix: the cut-over resolves the mic hold');
    expect(convo).toContain('releaseSwapHold();\n      setSwapNotice(swapFallbackLine(');
    expect(convo).toContain('Connecting ${PERSONAS[swapConnecting].displayName}');
    // Silence check-ins are suspended while the hold is on.
    expect(convo).toContain('if (swapHoldRef.current) { idle.quietSince = Date.now(); return; }');
  });
  test('the fallback line rotates — consecutive fallbacks never repeat a wording', () => {
    const lines = [0, 1, 2].map(i => swapFallbackLine('Sara', 'Aspen', i));
    expect(new Set(lines).size).toBe(3);
    expect(swapFallbackLine('Sara', 'Aspen', 3)).toBe(lines[0]);
    expect(lines[0]).toContain("Sara couldn't connect");
    expect(lines[0]).toContain('Aspen will continue');
  });
});

describe('4 — bounded pre-stage start', () => {
  test('a hung start settles as the timeout value instead of hanging forever', async () => {
    const hung = new Promise<boolean>(() => { /* never settles */ });
    await expect(boundedSettle(hung, 10, false)).resolves.toBe(false);
  });
  test('a prompt settle wins the race; a rejection settles as the timeout value', async () => {
    await expect(boundedSettle(Promise.resolve(true), 10_000, false)).resolves.toBe(true);
    await expect(boundedSettle(Promise.reject(new Error('nope')), 10_000, false)).resolves.toBe(false);
  });
  test('the pre-stage effect bounds Simli start() with the timeout', () => {
    expect(convo).toContain('boundedSettle(');
    expect(convo).toContain('PRESTAGE_START_TIMEOUT_MS');
  });
});

describe('5 — swap vs non-swap prompt composition', () => {
  const LEGACY_INVITE_OPENING = "Host role: You are Aspen of AI Hidden Leads, personally hosting a demo you prepared in advance for this invited visitor. The business simulation has not begun. Do not roleplay the business, do not give the business overview, and do not answer as the business until you announce the move into simulation mode below. In this phase you speak only as Aspen from AI Hidden Leads, the host.\nWhy there is no wait: This visitor arrived through a personal email invitation. We scanned and learned their website AHEAD of time and pre-built this demo, so it is already loaded on their website on this page. Never say the demo is being prepared, never ask them to fill in a form, and never make them wait for a build.\nWhat this is \u2014 say it plainly, in your own words: this is a simulation layered over their website; their real website has not been changed and nothing was installed or taken over; you are a live AI talking with them right now on top of it.\nSet expectations, once, in your own words: You learned this business from its public pages ahead of time \u2014 a quick learn, not the full setup. The real assistant keeps perfecting and expanding her knowledge base: she learns from the owner as they talk, and from any FAQs, documents, price lists and vendor manuals they give her. If a deep technical question catches you out during the demo, say so honestly and give this as the reason \u2014 never bluff an answer the pages did not give you.\nAlex, once: Before you ask to continue, add one line, in your own words: if they decide to make this real, our onboarding engineer Alex personally walks them through setup, step by step \u2014 nobody is left alone with forms. Say it at most once; do not pitch it.\nConfirm before loading: The session context holds the name and contact details this invitation was prepared for \u2014 treat them as the person in front of you unless they say otherwise. When a name is known, confirm it (\"Is this <name>?\") and confirm the website on screen is the right site before going further. If no name is known, ask what first name you may use, and still confirm the website. If they say the name or the site is wrong, accept the correction gracefully and continue with what they give you; never argue, and never treat contacts scraped from the website as the visitor.\nThe continue step: After the explanation and the confirmation, ask plainly whether they are ready \u2014 \"Shall we continue?\" \u2014 and wait for their go-ahead before entering the simulation. Do not rush past this step.\nFollow-up contact: We already hold the email address this invitation was sent to \u2014 it is in the session context. NEVER ask the visitor to re-enter it as if it were unknown. Instead, confirm it is the best address for the follow-up and the demo recap. Offer two easy options: use a better address if they name one, or forward this demo to a colleague, the owner, or another decision-maker if they give that person's email address. A mobile number for the recap is welcome but optional. If the visitor dictates an address, read it back spelled out for confirmation before relying on it. If they decline, proceed without friction \u2014 none of this is a condition of seeing the demo, and never repeat the ask.\nEntering the simulation: Only after their go-ahead, thank them, then run the SIMULATION ENTRY sequence from the rest of this prompt exactly: the announcement in your host voice (\"Okay \u2014 now we are stepping into simulation mode; please act like a visitor to your own website, or a caller phoning your own number; I will treat you as a brand-new caller\"), the expectations line, a clear unfilled pause, and only then the in-role greeting as the business and the 30 to 45 second business overview. Never slide into the business role without the announcement and the pause.\nIf they leave: If the visitor wants to stop or come back later, reassure them this same personal link reopens their demo any time, wish them well briefly, and end politely. Never pressure them.\nThroughout: Keep responses concise and natural. Speak English unless the caller explicitly requests a language change. Never invent a sending, a forwarding, a booking or a transfer, and never claim a real action succeeded without its result. After the simulation begins, the anti-transfer rule and the sales policies in the rest of this prompt still apply exactly as written.";
  test('NON-SWAP: DEMO_INVITE_OPENING is byte-identical to the pre-fix text', () => {
    expect(DEMO_INVITE_OPENING).toBe(LEGACY_INVITE_OPENING);
  });
  test('NON-SWAP: businessDemoConfig still composes the full SIMULATION_PROMPT', () => {
    const cfg = businessDemoConfig('Great Gulf', 'knowledge');
    expect(String(cfg.systemPrompt)).toContain(SIMULATION_PROMPT);
    expect(String(cfg.systemPrompt)).toContain(SIMULATION_HOST_SEGMENT);
    expect(String(cfg.systemPrompt)).toContain(SIMULATION_RECEPTIONIST_SEGMENT);
  });
  test('SWAP: the parent prompt EXCLUDES the host entry beats and the receptionist segment', () => {
    const cfg = businessDemoConfigSwapParent('Great Gulf', 'knowledge');
    const prompt = String(cfg.systemPrompt);
    expect(prompt).not.toContain(SIMULATION_HOST_SEGMENT);
    expect(prompt).not.toContain(SIMULATION_RECEPTIONIST_SEGMENT);
    expect(prompt).not.toContain('THE SIMULATION ENTRY');
    expect(prompt).not.toContain('THE IN-ROLE GREETING');
    // The close segment and the yield bar are what the host keeps.
    expect(prompt).toContain(SIMULATION_CLOSE_SEGMENT);
    expect(prompt).toContain('YOU NEVER ENTER THE SIMULATION');
    expect(prompt).toContain('never roleplay the business');
    // Everything else about the config is the legacy builder's output.
    expect(cfg.greetings).toEqual(businessDemoConfig('Great Gulf', 'knowledge').greetings);
    expect(cfg.greeting).toBe(businessDemoConfig('Great Gulf', 'knowledge').greeting);
  });
  test('SWAP invite opening: confirm + continue beats removed, entry order replaced by the yield bar', () => {
    expect(DEMO_INVITE_OPENING_SWAP).not.toContain('Confirm before loading');
    expect(DEMO_INVITE_OPENING_SWAP).not.toContain('The continue step');
    expect(DEMO_INVITE_OPENING_SWAP).not.toContain('Entering the simulation');
    expect(DEMO_INVITE_OPENING_SWAP).not.toContain('stepping into simulation mode; please act like a visitor');
    expect(DEMO_INVITE_OPENING_SWAP).toContain('The handover to Sara');
    // Bug 3 (2026-11-13): the script now ends at the transfer QUESTION.
    expect(DEMO_INVITE_OPENING_SWAP).toContain('that question is where your host script ENDS');
    expect(DEMO_INVITE_OPENING_SWAP).toContain('never roleplay the business');
    // The kept beats survive: the greeting's {nameConfirm} story, the
    // Alex line, follow-up contact, and the shared head/tail.
    expect(DEMO_INVITE_OPENING_SWAP).toContain('Alex, once');
    expect(DEMO_INVITE_OPENING_SWAP).toContain('We already hold the email address this invitation was sent to');
    expect(DEMO_INVITE_OPENING_SWAP.startsWith('Host role: You are Aspen of AI Hidden Leads')).toBe(true);
  });
  test('gemini-session serves the swap composition only when the swap family is armed', () => {
    expect(geminiSession).toContain('businessDemoConfigSwapParent(businessName,knowledge,published) : businessDemoConfig(businessName,knowledge,published)');
    expect(geminiSession).toContain('swapEnabled ? DEMO_INVITE_OPENING_SWAP : DEMO_INVITE_OPENING');
  });
});

describe('6 — Sara overview conditioning (defense in depth)', () => {
  const opening = swapOpeningInstruction({ to: 'sara', boundary: 'doorway' }, 'Assistant: overview already delivered here');
  test('her opening conditions beats 4–6 on the recap — already delivered means skip to the open question', () => {
    expect(opening).toContain('CONDITIONED on the recap below');
    // Bug 2 (2026-11-13): the conditioning now keys on SARA's own prior
    // delivery (the host's greeting in the recap is not hers).
    expect(opening).toContain('already delivered the business overview or your open question earlier in this same visit');
    expect(opening).toContain('do NOT deliver either again');
    expect(opening).toContain('skip straight to engaging the visitor with the open question');
    // And the plain path still offers the full overview when it was not delivered.
    expect(opening).toContain('Otherwise give the 30 to 45 second business overview');
  });
  test('the website-confirm question moved into her first beat', () => {
    expect(opening).toContain('confirm in ONE line that the site on their screen is the business');
    expect(opening).toContain('the host deliberately did not ask this');
  });
});
