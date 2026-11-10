// Voice-first doorway (2026-11-10 — retest #4; investigation:
// face-readiness-investigation-2026-11-10.md Q3 D1–D4, Q5 items 1–7).
// Covers:
//  1. MODE SELECTION — a not-ready/failed face at the gate is no
//     longer a swap abort: cutoverMode demotes the verdict to
//     voice-first vs face-first; only token-stale / stage-missing
//     remain aborts.
//  2. READINESS REPAIR — a live staged face with a displayed frame
//     folds ready:true (the channels were disjoint: ready had ONE
//     source — the 10 s bounded settle — while liveness set only
//     everLive); the pre-stage watch loop polls the handle's liveness
//     and the effect re-keys on a stage-GENERATION counter so a retry
//     actually re-runs start() (the attempt-2 swallow).
//  3. RETRY ARM BUDGET — a re-armed swap gets a 5 s force deadline,
//     not a fresh 10 s one, against the ~140 s parent fuse.
//  4. BOUNDED-SETTLE ALIGNMENT — the pre-stage bound is 45 s and the
//     pre-stage start is capped at ONE attempt, matching SimliAvatar's
//     real single-attempt worst case instead of racing a 30–60 s
//     process at 10 s.
//  5. SERVER-VISIBLE DIAG — attempt resolutions persist onto the
//     attempt's own gemini_voice_sessions row (config.personaSwapDiag)
//     via the gemini-session swapDiag action; failure-class events
//     also stamp last_error on never-consumed rows.
//  6. SCRIPT GUARDRAILS — the swap-variant invite opening carries an
//     explicit script lock (beats in order, drifted framings banned);
//     the non-swap opening is untouched; Sara's doorway opening
//     carries the role lock banning any AiHiddenLeads/Maxdream pitch.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  cutoverMode, faceLivenessOnLive, INITIAL_FACE_LIVENESS, PRESTAGE_START_TIMEOUT_MS,
  prestageWatchDecision, retryArmStamp, SWAP_ARM_DEADLINE_MS, SWAP_DIAG_FAILURE_EVENTS,
  SWAP_DIAG_PERSIST_EVENTS, SWAP_GATE_WAIT_MS, SWAP_RETRY_DEADLINE_MS, swapDiagPersistPayload,
  swapWatchdogAction,
} from '@/lib/personaSwap';
import { DEMO_INVITE_OPENING, DEMO_INVITE_OPENING_SWAP } from '../../supabase/functions/_shared/demo-sales';
import { swapOpeningInstruction } from '../../supabase/functions/_shared/session-opening';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
const convo = read('src/components/GeminiConversation.tsx');
const simli = read('src/components/SimliAvatar.tsx');
const geminiSession = read('supabase/functions/gemini-session/index.ts');
const execBody = convo.slice(
  convo.indexOf('executeSwapRef.current = async'),
  convo.indexOf('dropRecoverRef.current = () =>'),
);
const takeoverBody = convo.slice(
  convo.indexOf('runFaceTakeoverRef.current = async'),
  convo.indexOf('executeSwapRef.current = async'),
);
const prestageEffect = convo.slice(
  convo.indexOf('useEffect(() => {\n    if (!stagedFace) return;'),
  convo.indexOf('const suspendConversation'),
);
const playBody = convo.slice(
  convo.indexOf('const playPcmChunk = useCallback'),
  convo.indexOf('// Interrupt: drop all queued playback instantly'),
);

describe('1 — mode selection (pure)', () => {
  test('a not-ready or failed face with a fresh token selects voice-first, never an abort', () => {
    expect(cutoverMode({ videoRequested: true, faceReady: false })).toBe('voice-first');
  });
  test('a ready face (or no video requested) selects face-first — the healthy path is unchanged', () => {
    expect(cutoverMode({ videoRequested: true, faceReady: true })).toBe('face-first');
    expect(cutoverMode({ videoRequested: false, faceReady: false })).toBe('face-first');
  });
  test('executeSwap selects the mode and pends the attach instead of funneling face-not-ready', () => {
    expect(execBody).toContain('cutoverMode({ videoRequested: avatarRequestedRef.current, faceReady: faceReadyNow })');
    expect(execBody).toContain('segmentFacePendingRef.current = { boundary, persona: incoming, slot: staged.slot };');
    expect(execBody).toContain("event: 'voice-first-cutover'");
    expect(execBody).not.toContain("handleSegmentFailureRef.current(boundary, 'face-not-ready')");
    // The gate verdict samples the handle's live frame proof, not
    // only the (possibly false) folded readiness latch.
    expect(execBody).toContain('earlySnap.displayedFrame');
    // The revival kick is delegated OUT of the cut-over body (the
    // pinned no-start()-in-executeSwap invariant stays absolute).
    expect(execBody).toContain('kickFaceRevivalRef.current(staged.slot);');
    expect(execBody).not.toContain('.start(');
  });
});

describe('2 — readiness repair (pure + wiring)', () => {
  test('a live face with a displayed frame folds ready:true and clears a latched failure', () => {
    const latched = { ...INITIAL_FACE_LIVENESS, startFailed: true };
    const repaired = faceLivenessOnLive(latched, true);
    expect(repaired.ready).toBe(true);
    expect(repaired.failed).toBe(false);
    expect(repaired.startFailed).toBe(false);
    expect(repaired.everLive).toBe(true);
  });
  test('without frame proof the fold stays legacy everLive-only (a bare live flag proves nothing)', () => {
    const latched = { ...INITIAL_FACE_LIVENESS, startFailed: true };
    const legacy = faceLivenessOnLive(latched);
    expect(legacy.everLive).toBe(true);
    expect(legacy.ready).toBe(false);
    expect(legacy.startFailed).toBe(true);
  });
  test('the pre-stage watch decision matrix', () => {
    expect(prestageWatchDecision(null)).toBe('failed');
    expect(prestageWatchDecision({ live: true, displayedFrame: true, starting: false, failed: false })).toBe('ready');
    expect(prestageWatchDecision({ live: false, displayedFrame: false, starting: false, failed: true })).toBe('failed');
    expect(prestageWatchDecision({ live: false, displayedFrame: false, starting: true, failed: false })).toBe('wait');
    expect(prestageWatchDecision({ live: false, displayedFrame: false, starting: false, failed: false })).toBe('kick-start');
    // Live but no frame yet and nothing starting: a fresh kick is
    // the only remaining move (bounded by the watch deadline).
    expect(prestageWatchDecision({ live: true, displayedFrame: false, starting: false, failed: false })).toBe('kick-start');
  });
  test('the pre-stage effect re-keys on the stage generation and watches liveness (not just the settle)', () => {
    expect(convo).toContain('stagedFace?.persona, stageGeneration]');
    expect(convo.split('setStageGeneration(g => g + 1);').length - 1).toBeGreaterThanOrEqual(2);
    expect(prestageEffect).toContain('prestageWatchDecision(handle.liveness?.() ?? null)');
    expect(prestageEffect).toContain('handle.start({ silent: true, maxAttempts: 1 })');
    // The settle alone is never the verdict any more.
    expect(prestageEffect).toContain('ok || currentReady');
  });
  test('SimliAvatar exposes the liveness query and the capped-attempt start', () => {
    expect(simli).toContain('liveness: () => ({');
    expect(simli).toContain('Math.min(MAX_VIDEO_ATTEMPTS, options?.maxAttempts ?? MAX_VIDEO_ATTEMPTS)');
  });
});

describe('3 — retry arm budget (pure)', () => {
  test('a retry arm stamp leaves exactly the retry deadline, not a full arm deadline', () => {
    const now = 1_000_000;
    expect(SWAP_ARM_DEADLINE_MS - (now - retryArmStamp(now))).toBe(SWAP_RETRY_DEADLINE_MS);
    expect(SWAP_RETRY_DEADLINE_MS).toBeLessThan(SWAP_ARM_DEADLINE_MS);
  });
  test('the watchdog forces a retry-stamped arm at the retry deadline', () => {
    const t0 = 1_700_000_000_000;
    const base = {
      boundary: 'doorway' as const,
      armedAt: retryArmStamp(t0), stagePresent: false, stageAuthorizedAt: 0,
      faceFailed: false, gateReady: false, turnInFlight: false,
    };
    expect(swapWatchdogAction({ ...base, now: t0 + SWAP_RETRY_DEADLINE_MS - 1 })).toBe('none');
    expect(swapWatchdogAction({ ...base, now: t0 + SWAP_RETRY_DEADLINE_MS })).toBe('force');
  });
});

describe('4 — bounded-settle alignment (item 6 design)', () => {
  test('the pre-stage bound covers one capped attempt, far beyond the old 10 s race', () => {
    expect(PRESTAGE_START_TIMEOUT_MS).toBe(45_000);
    expect(PRESTAGE_START_TIMEOUT_MS).toBeGreaterThan(SWAP_GATE_WAIT_MS);
  });
});

describe('5 — server-visible diag (pure + wiring)', () => {
  test('the payload maps an entry onto the attempt row; the caller reason rides as the reason, faceState via extra', () => {
    // Mirrors the component's real call shape: the reason arrives as
    // the entry detail, faceState in the extra bag.
    const payload = swapDiagPersistPayload({
      event: 'gate-abort', boundary: 'doorway', persona: 'sara', attempt: 2,
      detail: 'token-stale', at: 123,
    }, '11111111-2222-3333-4444-555555555555', { faceState: 'failed' });
    expect(payload).toEqual({
      sessionId: '11111111-2222-3333-4444-555555555555', event: 'gate-abort',
      boundary: 'doorway', persona: 'sara', attempt: 2, reason: 'token-stale',
      faceState: 'failed', at: 123,
    });
    // An explicit extra reason wins over the detail fallback.
    const overridden = swapDiagPersistPayload(
      { event: 'fallback', boundary: 'doorway', detail: 'segment-failed', at: 5 },
      'sid', { reason: 'explicit' },
    );
    expect(overridden.reason).toBe('explicit');
    // The component never posts without an attempt row + visitor key.
    expect(convo).toContain('if (!attemptRow?.sessionId || !visitorKey) return;');
  });
  test('the persisted vocabulary covers every doorway resolution; failures are exactly the three abort-class events', () => {
    for (const e of ['gate-abort', 'fallback', 'token-stale', 'stage-watchdog', 'forced-execute', 'cutover', 'voice-first-cutover', 'face-takeover']) {
      expect(SWAP_DIAG_PERSIST_EVENTS).toContain(e);
    }
    expect([...SWAP_DIAG_FAILURE_EVENTS].sort()).toEqual(['fallback', 'gate-abort', 'token-stale']);
  });
  test('the client posts the payload through the existing gemini-session path', () => {
    expect(convo).toContain("supabase.functions.invoke('gemini-session', { headers, body: { visitorKey, swapDiag: payload } })");
    expect(convo).toContain("persistSwapDiagRef.current({ event: 'face-takeover'");
    expect(convo).toContain("persistSwapDiagRef.current({ event: 'forced-execute'");
  });
  test('the server appends config.personaSwapDiag on the attempt row, visitor-verified, before any authorization branch', () => {
    expect(geminiSession).toContain('personaSwapDiag:[...priorDiag,diagEntry].slice(-30)');
    expect(geminiSession).toContain("reason:'client_swap_failure'");
    expect(geminiSession).toContain('diagRow.visitor_hash!==diagVisitor');
    expect(geminiSession.indexOf('if(b.swapDiag)')).toBeLessThan(geminiSession.indexOf('const bearer='));
    // Consumed sessions keep the proxy's last_error: the stamp is
    // guarded on started_at being null and an existing null error.
    expect(geminiSession).toContain('!diagRow.started_at && !diagRow.last_error');
  });
});

describe('6 — mid-segment face takeover (source pins)', () => {
  test('the audio sync runs BEFORE the pending attach clears and avatarLive flips', () => {
    const syncAt = takeoverBody.indexOf('cutoverAudioSync(sync)');
    const clearAt = takeoverBody.indexOf('segmentFacePendingRef.current = null;');
    const flipAt = takeoverBody.indexOf('avatarLiveRef.current = true;');
    expect(syncAt).toBeGreaterThanOrEqual(0);
    expect(clearAt).toBeGreaterThan(syncAt);
    expect(flipAt).toBeGreaterThan(clearAt);
    expect(takeoverBody).toContain("event: 'face-takeover'");
  });
  test('a voice-first segment routes local and its paired-send degrade never stops the warming handle', () => {
    expect(playBody).toContain('segmentFacePendingRef.current != null');
    expect(playBody).toContain("? 'local' as const");
    expect(playBody).toContain('if (!segmentFacePendingRef.current) engageVideoFallback();');
  });
  test('handleFaceLiveChange triggers the takeover for the pending segment face', () => {
    const handler = convo.slice(convo.indexOf('const handleFaceLiveChange'), convo.indexOf('const mainFaceLayer'));
    expect(handler).toContain('segmentFacePendingRef.current');
    expect(handler).toContain('runFaceTakeoverRef.current(slot)');
  });
});

describe('7 — script guardrails (prompt pins)', () => {
  test('the swap invite opening locks the beats in order and bans the drifted framings', () => {
    const i1 = DEMO_INVITE_OPENING_SWAP.indexOf('(1) the greeting');
    const i2 = DEMO_INVITE_OPENING_SWAP.indexOf('(2) the one approved statistic');
    const i3 = DEMO_INVITE_OPENING_SWAP.indexOf('(3) the partner-for-hidden-leads pitch');
    const i4 = DEMO_INVITE_OPENING_SWAP.indexOf('(4) the Alex comfort line');
    const i5 = DEMO_INVITE_OPENING_SWAP.indexOf('(5) the handover, exactly: "Now, meet Sara"');
    expect(i1).toBeGreaterThanOrEqual(0);
    expect(i2).toBeGreaterThan(i1);
    expect(i3).toBeGreaterThan(i2);
    expect(i4).toBeGreaterThan(i3);
    expect(i5).toBeGreaterThan(i4);
    expect(DEMO_INVITE_OPENING_SWAP).toContain('NEVER say "let me get your feedback"');
    expect(DEMO_INVITE_OPENING_SWAP).toContain('never say "my two cents on waiting"');
    expect(DEMO_INVITE_OPENING_SWAP).toContain("I'm not here to sell you anything");
    expect(DEMO_INVITE_OPENING_SWAP).toContain('resume the script where you stopped');
  });
  test('the script lock is swap-only: the non-swap opening carries none of it', () => {
    expect(DEMO_INVITE_OPENING).not.toContain('do not improvise it');
    expect(DEMO_INVITE_OPENING).not.toContain('let me get your feedback');
    expect(DEMO_INVITE_OPENING).not.toContain('my two cents on waiting');
  });
  test("Sara's doorway opening keeps the three passed beats and bans the AiHiddenLeads/Maxdream pitch", () => {
    const opening = swapOpeningInstruction({ to: 'sara', boundary: 'doorway' }, null);
    const confirmAt = opening.indexOf('confirm in ONE line that the site on their screen is the business');
    const honestyAt = opening.indexOf('YOUR honesty note');
    const overviewAt = opening.indexOf('business overview');
    expect(confirmAt).toBeGreaterThanOrEqual(0);
    expect(honestyAt).toBeGreaterThan(confirmAt);
    expect(overviewAt).toBeGreaterThan(honestyAt);
    expect(opening).toContain('ROLE LOCK');
    expect(opening).toContain('never pitch AI Hidden Leads or Maxdream');
    expect(opening).toContain('sales machine');
    expect(opening).toContain("Aspen's step-out beat");
  });
});
