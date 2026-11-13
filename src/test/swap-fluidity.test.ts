// Swap fluidity batch (2026-11-10 — Ron's Great Gulf retest verdict:
// handovers "very bad, not fluid at all"; root-cause report
// ~/workspace/connection-root-cause-report-2026-11-10.md, findings
// F1–F4). Part 1 of the approved fix batch:
//
//  F1 GATE-WAIT — executeSwap no longer samples the cut-over gate
//     once; it waits (bounded) for the stage to exist and the face to
//     become ready, and never discards a still-warming face.
//  F2 RETRY-ON-READINESS — a pending retry executes when its stage
//     becomes ready, not on some later turn_complete.
//  F3 PRE-STAGE SARA — her face warms (concealed, silent) from the
//     moment the simulation chain goes live; a warm face survives a
//     gate abort when a retry will use it; a stale token on a warm
//     face gets a token-only refresh.
//  F4 CHAIN SNAPSHOT BEFORE TEARDOWN — both socket close paths and
//     recoverFromProviderClosed snapshot the swap chain BEFORE any
//     teardown, so the same-persona personaDrop recovery is actually
//     reachable; a host-phase drop with an armed-but-undone doorway
//     re-arms the doorway in the reconnected parent.
//  Plus: Alex's voice Charon → Puck (Ron's ruling on the retest),
//  Sara's language mirror + role guard, and the meet-Alex wording
//  (never "cannot complete a transfer" for the Alex handoff).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  SEGMENT_TOKEN_FRESH_MS, SWAP_GATE_POLL_MS, SWAP_GATE_WAIT_MS, gateWaitContinues,
  type StagedGateFacts,
} from '@/lib/personaSwap';
import {
  SIMULATION_CLOSE_SEGMENT, SIMULATION_HOST_SEGMENT, SIMULATION_RECEPTIONIST_SEGMENT,
} from '../../supabase/functions/_shared/voice-config';
import { VOICES as WIZARD_VOICES } from '@/components/setup-wizard/wizardModel';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
const convo = read('src/components/GeminiConversation.tsx');

const facts = (extra: Partial<StagedGateFacts> = {}): StagedGateFacts => ({
  stagePresent: true, boundaryMatches: true, faceReady: false, faceFailed: false, tokenStale: false, ...extra,
});

describe('F1 — gate-wait decision (gateWaitContinues)', () => {
  test('no stage yet, or a stage for another boundary → keep waiting (authorization in flight)', () => {
    expect(gateWaitContinues(facts({ stagePresent: false, boundaryMatches: false }), true)).toBe(true);
    expect(gateWaitContinues(facts({ boundaryMatches: false }), true)).toBe(true);
  });

  test('face ready → stop waiting (the atomic gate will pass)', () => {
    expect(gateWaitContinues(facts({ faceReady: true }), true)).toBe(false);
  });

  test('face still warming with video requested → keep waiting; without video the gate already passes', () => {
    expect(gateWaitContinues(facts(), true)).toBe(true);
    expect(gateWaitContinues(facts(), false)).toBe(false);
  });

  test('face settled-failed → stop waiting (fail into the retry ledger now, not at expiry)', () => {
    expect(gateWaitContinues(facts({ faceFailed: true }), true)).toBe(false);
  });

  test('stale token → stop waiting (the stale path re-authorizes instead of connecting)', () => {
    expect(gateWaitContinues(facts({ tokenStale: true, faceReady: true }), true)).toBe(false);
  });

  test('the wait is bounded at ~8 s and can never outlive a fresh token', () => {
    expect(SWAP_GATE_WAIT_MS).toBe(8_000);
    expect(SWAP_GATE_POLL_MS).toBeGreaterThan(0);
    expect(SWAP_GATE_POLL_MS).toBeLessThan(SWAP_GATE_WAIT_MS);
    expect(SWAP_GATE_WAIT_MS).toBeLessThan(SEGMENT_TOKEN_FRESH_MS);
  });
});

describe('F1 — component wiring (source pins)', () => {
  const execBody = convo.slice(convo.indexOf('executeSwapRef.current = async'), convo.indexOf('dropRecoverRef.current = () =>'));

  test('executeSwap waits on gateWaitContinues BEFORE any failure funnel', () => {
    expect(execBody).toContain('gateWaitContinues');
    // Handover fix: the deadline is the gate-wait bound normally, and
    // ZERO for a watchdog-forced (immediate) execution — the decision
    // the deadline demands must not wait out a second window.
    expect(execBody).toContain('const waitDeadline = immediate ? waitStartedAt : waitStartedAt + SWAP_GATE_WAIT_MS');
    expect(execBody.indexOf('gateWaitContinues')).toBeLessThan(execBody.indexOf("'stage-missing'"));
    expect(execBody.indexOf('gateWaitContinues')).toBeLessThan(execBody.indexOf("'face-not-ready'"));
  });

  test('the busy flag is held across the wait and released on the abort exits', () => {
    // Held before the wait loop…
    expect(execBody.indexOf('swapBusyRef.current = true;')).toBeLessThan(execBody.indexOf('gateWaitContinues'));
    // …and released on stage-missing, token-stale and gate-abort exits.
    expect(execBody.split('swapBusyRef.current = false;').length - 1).toBeGreaterThanOrEqual(3);
  });
});

describe('F2 — retry-on-readiness (source pins)', () => {
  // Handover fix (2026-11-10): the executor was GENERALIZED from
  // retry-only to any pending execution (pendingExecutionBoundary —
  // the ledger trigger remains its first check) and renamed
  // maybeExecutePending; the retry path still records the
  // 'retry-execute-ready' diag event. The pins below assert the
  // generalized wiring with the same intent as the originals.
  test('the executor is gated on the pending-execution trigger, live, and not busy', () => {
    expect(convo).toContain('maybeExecutePendingRef.current = (boundary: PersonaBoundary) => {');
    expect(convo).toContain('if (pendingExecutionBoundary(state) !== boundary) return;');
    expect(convo).toContain("pendingRetryBoundary(state) === boundary ? 'retry-execute-ready' : 'execute-ready'");
  });

  test('readiness call sites: arm landing, kept-stage failure, pre-stage settle (ready AND failed)', () => {
    expect(convo).toContain('maybeExecutePendingRef.current(boundary);');
    expect(convo.split('maybeExecutePendingRef.current(stagedFace.boundary)').length - 1).toBe(1);
  });

  test('the turn_complete pending-execution backstop is in place (both sockets)', () => {
    expect(convo.split('?? pendingExecutionBoundary(state)').length - 1).toBe(2);
  });
});

describe('F3 — pre-stage Sara (source pins)', () => {
  test('the prestage trigger is the doorway-ENGAGEMENT point, not goLive; the prestage stays face-only', () => {
    // Voice-first batch (2026-11-10, investigation Q5 item 6): the
    // goLive trigger was removed — a face warmed at parent go-live
    // was 87–109 s old at every first-parent gate, the exact age
    // band where cold starts outran the bounded settle. The trigger
    // now sits at the two noteDoorwayEngagement folds (parent +
    // segment socket — the first post-greeting visitor line), so
    // exactly two call sites exist and goLive has none.
    expect(convo.split('prestageDoorwayFace();').length - 1).toBe(2);
    const goLive = convo.slice(convo.indexOf('const goLive = () => {'), convo.indexOf('const connectSegmentSocket'));
    expect(goLive).not.toContain('prestageDoorwayFace()');
    expect(convo).toContain('const prestageDoorwayFace = useCallback(() => {');
    expect(convo).toContain("warmedFaceRef.current = { boundary: 'doorway', slot, ready: false, failed: false };");
    // Face-only: the prestage never authorizes a segment (recap freshness).
    const prestage = convo.slice(convo.indexOf('const prestageDoorwayFace'), convo.indexOf('const teardown'));
    expect(prestage).not.toContain('requestSegment');
  });

  test('armSwap folds the warmed state into the stage and refreshes a stale token on a warm face', () => {
    expect(convo).toContain("recordSwapDiag({ event: 'token-refresh', boundary, persona });");
    expect(convo).toContain('warmed.slot === slot && warmed.ready');
    expect(convo).toContain('warmed.failed ? true : undefined');
  });

  test('a warm face survives a failure only while a retry will use it (the token-stale path; the gate abort is gone)', () => {
    // Voice-first batch: the face-not-ready GATE ABORT — the second
    // keepWarmedFace call site — no longer exists: a not-ready face
    // cuts over voice-first instead of aborting. The token-stale
    // funnel is the one abort path that remains, and it keeps the
    // same conditional keep.
    expect(convo.split('const keepWarmedFace =').length - 1).toBe(1);
    expect(convo.split('keepWarmedFace && pendingRetryBoundary(swapStateRef.current) !== boundary').length - 1).toBe(1);
  });
});

describe('F4 — chain snapshot before teardown (source pins)', () => {
  test('all three close paths snapshot the chain (recover + both socket onclose handlers)', () => {
    expect(convo.split('const chainSnap = snapshotChainState();').length - 1).toBe(3);
    expect(convo.split('chainIsMidSegment(chainSnap.state)').length - 1).toBe(3);
  });

  test('recoverFromProviderClosed snapshots BEFORE stopEverything and keeps the pinned drop branch', () => {
    const body = convo.slice(convo.indexOf('const recoverFromProviderClosed'), convo.indexOf('const startConversation = useCallback'));
    expect(body.indexOf('snapshotChainState()')).toBeLessThan(body.indexOf('stopEverything()'));
    expect(body).toContain('partialTeardownForSwap();');
    expect(body).toContain('if (swapEnabledRef.current) { dropRecoverRef.current(); return; }');
  });

  test('a mid-segment snapshot routes to the partial teardown + dropRecover in the close paths', () => {
    expect(convo.split('partialTeardownForSwap();\n            dropRecoverRef.current();').length - 1).toBe(1); // parent onclose
    expect(convo.split('partialTeardownForSwap();\n          dropRecoverRef.current();').length - 1).toBe(1); // segment onclose
  });

  test('the reconnected parent re-arms an armed-but-undone doorway from the snapshot', () => {
    expect(convo).toContain("pendingDoorway: true, drops: dropSnap.state.drops");
    expect(convo).toContain("dropSnap.state.armed.includes('doorway') && !dropSnap.state.done.includes('doorway')");
    expect(convo).toContain('chainDropSnapshotRef.current = null;');
  });

  test('drop recovery refuses to resurrect a segment after a full teardown spent the chain', () => {
    expect(convo).toContain('if (!swapEnabledRef.current) { setSwapTransition(false); return; }');
  });
});

describe('Alex voice — Puck, and the wizard catalogue is NOT Alex', () => {
  test('the customer voice catalogue still offers every voice, Charon included', () => {
    // wizardModel's VOICES is the setup wizard's picker for the
    // CUSTOMER's own assistant — changing Alex's bound voice must not
    // remove Charon (or anything else) from what customers can pick.
    // Expanded 2026-11-13 (Ron's direction): the picker now offers the
    // full 30-voice Gemini Live catalog; the original six must remain.
    const ids = WIZARD_VOICES.map(v => v.id);
    expect(ids).toHaveLength(30);
    for (const id of ['Kore', 'Aoede', 'Leda', 'Puck', 'Charon', 'Zephyr']) expect(ids).toContain(id);
  });
});

describe('Sara language mirror + role guard (prompt pins)', () => {
  test('language: sustained visitor speech or an explicit ask switches her; a flat refusal is banned', () => {
    expect(SIMULATION_RECEPTIONIST_SEGMENT).toContain('YOUR LANGUAGE — FOLLOW THE VISITOR, THE WAY ASPEN DOES');
    expect(SIMULATION_RECEPTIONIST_SEGMENT).toContain('full sentences, sustainedly');
    expect(SIMULATION_RECEPTIONIST_SEGMENT).toContain('An explicit request to switch languages is honored the same way, at once.');
    expect(SIMULATION_RECEPTIONIST_SEGMENT).toContain('never say "I must speak English"');
    // Start language still comes from the session, not the visitor's first word.
    expect(SIMULATION_RECEPTIONIST_SEGMENT).toContain("you start in this session's starting language");
  });

  test('role guard: AiHiddenLeads topics get one in-role deflection and route back to Aspen at the step-out', () => {
    expect(SIMULATION_RECEPTIONIST_SEGMENT).toContain('QUESTIONS ABOUT AI HIDDEN LEADS ITSELF ARE NOT YOURS TO SELL');
    expect(SIMULATION_RECEPTIONIST_SEGMENT).toContain('never push scheduling a sales meeting');
    expect(SIMULATION_RECEPTIONIST_SEGMENT).toContain('Aspen from AI Hidden Leads can walk you through all of that when we step out');
    expect(SIMULATION_RECEPTIONIST_SEGMENT).toContain("you are {businessName}'s receptionist — never AI Hidden Leads staff");
  });

  test('the in-role transfer/booking honesty line is untouched (it governs the BUSINESS roleplay only)', () => {
    expect(SIMULATION_RECEPTIONIST_SEGMENT).toContain('in this demo I cannot complete the transfer, but as a customer, that is exactly what happens');
  });
});

describe('meet-Alex wording (prompt pins)', () => {
  test('close segment: never "cannot complete a transfer" for Alex, never a scheduled call instead', () => {
    expect(SIMULATION_CLOSE_SEGMENT).toContain('Never say you cannot complete a transfer to Alex');
    expect(SIMULATION_CLOSE_SEGMENT).toContain('never offer a scheduled call or a callback as the answer instead');
    expect(SIMULATION_CLOSE_SEGMENT).toContain('it never applies to Alex');
  });

  test('host segment carries the same rule for the host phase, with the one-line bring-him-in', () => {
    expect(SIMULATION_HOST_SEGMENT).toContain('IF THE VISITOR ASKS FOR ALEX DURING THIS HOST PHASE');
    expect(SIMULATION_HOST_SEGMENT).toContain('do not say you cannot complete a transfer');
    expect(SIMULATION_HOST_SEGMENT).toContain('This is Alex — our support specialist. Alex — say hello.');
  });
});
