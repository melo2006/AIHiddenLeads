// Segment connect reliability (2026-11-09 — the authorized-but-never-
// connected failure class).
//
// Server record from the owner's Great Gulf demo (~22:56 AEDT): the
// doorway ARMED and a Sara segment was authorized server-side at
// 11:56:27Z (row ecbdfd71, status 'authorized') — but it recorded ZERO
// turns and never spoke; Aspen ran the whole demo solo with no error
// anywhere. Forensics (see segment-connect-report-2026-11-09.md): the
// consume never happened because the one-shot arm/execute design met a
// timing miss — the authorization had not landed when the handoff line
// completed, or the incoming face had not reported its first frame at
// the single gate instant — and every abort path discarded the stage,
// kept `armed` spent, and left no trace.
//
// These tests pin the recovery contract:
//  1. A failed first attempt retries EXACTLY ONCE (fresh authorization
//     — staged tokens die server-side at 120 s, so a retry never
//     re-presents an old token) and then falls back words-only.
//  2. A boundary already in `done` NEVER retries.
//  3. The retry carries its own execution trigger
//     (pendingSegmentRetry) — the original anchor line never re-fires.
//  4. Every failure is recorded as a recap fact (boundary, persona,
//     attempt, reason) so the retried segment's authorization carries
//     the trace server-side, and in the [persona-swap] diag buffer.
//  5. A staged token older than the freshness bound is stale and must
//     be re-authorized, never connected.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test, beforeEach } from 'vitest';
import {
  INITIAL_SWAP_STATE, MAX_SEGMENT_RETRIES, SEGMENT_TOKEN_FRESH_MS, SEGMENT_TOKEN_TTL_MS,
  clearSegmentRetry, noteSegmentFailure, pendingRetryBoundary, recordSwapDiag,
  resetSwapDiagnostics, segmentAttemptsFor, segmentConnectRetryAllowed, segmentTokenStale,
  swapDiagnostics, swapRecapFacts, SWAP_DIAG_TAG,
  type SwapState,
} from '@/lib/personaSwap';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
const host = (extra: Partial<SwapState> = {}): SwapState => ({
  ...INITIAL_SWAP_STATE, phase: 'host', armed: ['doorway'], ...extra,
});

describe('retry-once ledger (noteSegmentFailure)', () => {
  test('first connect failure → exactly one retry, with a fresh-execution trigger', () => {
    const { state, outcome, attempt } = noteSegmentFailure(host(), 'doorway', 'face-not-ready');
    expect(outcome).toBe('retry');
    expect(attempt).toBe(1);
    expect(segmentAttemptsFor(state, 'doorway')).toBe(1);
    expect(state.pendingSegmentRetry).toBe('doorway');
    expect(pendingRetryBoundary(state)).toBe('doorway');
  });

  test('second failure → words-only fallback, no third attempt', () => {
    const first = noteSegmentFailure(host(), 'doorway', 'face-not-ready');
    const second = noteSegmentFailure(first.state, 'doorway', 'stage-missing');
    expect(second.outcome).toBe('fallback');
    expect(second.attempt).toBe(2);
    expect(second.state.pendingSegmentRetry).toBeNull();
    expect(pendingRetryBoundary(second.state)).toBeNull();
    // Even a third recorded failure can never re-open the retry.
    const third = noteSegmentFailure(second.state, 'doorway', 'token-stale');
    expect(third.outcome).toBe('fallback');
    expect(MAX_SEGMENT_RETRIES).toBe(1);
  });

  test('a boundary in done never retries', () => {
    const done = host({ done: ['doorway'], phase: 'simulation', persona: 'sara' });
    const { state, outcome } = noteSegmentFailure(done, 'doorway', 'face-not-ready');
    expect(outcome).toBe('fallback');
    expect(state.pendingSegmentRetry).toBeNull();
    expect(pendingRetryBoundary(state)).toBeNull();
  });

  test('retries are per-boundary: doorway failing does not spend meet-alex', () => {
    const first = noteSegmentFailure(host(), 'doorway', 'face-not-ready');
    const alex = noteSegmentFailure(first.state, 'meet-alex', 'authorize-failed');
    expect(alex.outcome).toBe('retry');
    expect(segmentAttemptsFor(alex.state, 'doorway')).toBe(1);
    expect(segmentAttemptsFor(alex.state, 'meet-alex')).toBe(1);
  });

  test('pendingRetryBoundary requires armed and not-done', () => {
    const { state } = noteSegmentFailure(host(), 'doorway', 'face-not-ready');
    expect(pendingRetryBoundary({ ...state, armed: [] })).toBeNull();
    expect(pendingRetryBoundary({ ...state, done: ['doorway'] })).toBeNull();
    expect(pendingRetryBoundary(INITIAL_SWAP_STATE)).toBeNull();
  });

  test('clearSegmentRetry consumes the trigger and is identity when unset', () => {
    const { state } = noteSegmentFailure(host(), 'doorway', 'face-not-ready');
    const cleared = clearSegmentRetry(state, 'doorway');
    expect(cleared.pendingSegmentRetry).toBeNull();
    expect(clearSegmentRetry(cleared, 'doorway')).toBe(cleared);
  });
});

describe('failure trace (recap facts + diagnostics)', () => {
  test('each failure becomes a recap fact naming boundary, persona, attempt, reason', () => {
    const first = noteSegmentFailure(host(), 'doorway', 'face-not-ready');
    const facts = swapRecapFacts(first.state);
    expect(facts).toHaveLength(1);
    expect(facts[0]).toContain('doorway');
    expect(facts[0]).toContain('sara');
    expect(facts[0]).toContain('attempt 1');
    expect(facts[0]).toContain('face-not-ready');
    const second = noteSegmentFailure(first.state, 'doorway', 'authorize-failed');
    expect(swapRecapFacts(second.state)).toHaveLength(2);
    // No failures recorded → facts stay exactly what they were before
    // (teamIntroSeen only), so legacy recaps are byte-identical.
    expect(swapRecapFacts(INITIAL_SWAP_STATE)).toEqual([]);
    expect(swapRecapFacts({ ...INITIAL_SWAP_STATE, teamIntroSeen: true })).toHaveLength(1);
  });

  test('recordSwapDiag logs under the single tag and keeps a bounded buffer', () => {
    resetSwapDiagnostics();
    const entry = recordSwapDiag({ event: 'gate-abort', boundary: 'doorway', persona: 'sara', attempt: 1, detail: 'face-not-ready', at: 123 });
    expect(entry.at).toBe(123);
    expect(swapDiagnostics()).toHaveLength(1);
    expect(swapDiagnostics()[0]).toMatchObject({ event: 'gate-abort', boundary: 'doorway', persona: 'sara', attempt: 1 });
    expect(SWAP_DIAG_TAG).toBe('[persona-swap]');
    for (let i = 0; i < 150; i++) recordSwapDiag({ event: 'arm', boundary: 'doorway' });
    expect(swapDiagnostics().length).toBeLessThanOrEqual(100);
    resetSwapDiagnostics();
    expect(swapDiagnostics()).toHaveLength(0);
  });
});

describe('token lifecycle', () => {
  test('TTL mirror matches the database default (2 minutes, single-use consume)', () => {
    const migration = read('drizzle/migrations/0000_voice_agents_workspace.sql');
    expect(migration).toContain("expires_at timestamptz NOT NULL DEFAULT now()+interval '2 minutes'");
    expect(migration).toContain('AND NOT consumed AND expires_at>now()');
    expect(SEGMENT_TOKEN_TTL_MS).toBe(120_000);
    expect(SEGMENT_TOKEN_FRESH_MS).toBeLessThan(SEGMENT_TOKEN_TTL_MS);
  });

  test('a staged token is fresh inside the bound and stale beyond it', () => {
    const t0 = 1_000_000;
    expect(segmentTokenStale(t0, t0 + SEGMENT_TOKEN_FRESH_MS - 1)).toBe(false);
    expect(segmentTokenStale(t0, t0 + SEGMENT_TOKEN_FRESH_MS)).toBe(false);
    expect(segmentTokenStale(t0, t0 + SEGMENT_TOKEN_FRESH_MS + 1)).toBe(true);
    expect(segmentTokenStale(t0, t0 + SEGMENT_TOKEN_TTL_MS)).toBe(true);
  });

  test('post-cut-over connect retry is allowed exactly once', () => {
    expect(segmentConnectRetryAllowed(1)).toBe(true);
    expect(segmentConnectRetryAllowed(2)).toBe(false);
    expect(segmentConnectRetryAllowed(3)).toBe(false);
  });
});

describe('component wiring (source pins)', () => {
  const src = read('src/components/GeminiConversation.tsx');

  test('arm failures funnel into the retry ledger instead of a silent disarm', () => {
    expect(src).not.toContain('if (!segment) return; // disarmed: words-only continuation');
    expect(src).toContain("handleSegmentFailureRef.current(boundary, 'authorize-failed')");
    // Voice-first batch (2026-11-10): a not-ready face no longer
    // funnels into the ledger at all — the gate verdict selects the
    // cut-over MODE (voice-first) instead of aborting the swap
    // (investigation Q3-D4). The remaining funnels still cover the
    // genuinely unrecoverable failures (no token / stale token).
    expect(src).not.toContain("handleSegmentFailureRef.current(boundary, 'face-not-ready')");
    expect(src).toContain("handleSegmentFailureRef.current(boundary, 'token-stale')");
    expect(src).toContain("'stage-missing' : 'stage-mismatch'");
  });

  test('both turn_complete handlers execute a pending execution (the retry trigger, generalized by the handover fix)', () => {
    expect(src.split('?? pendingExecutionBoundary(state)')).toHaveLength(3); // two call sites
  });

  test('the retry arm re-enters armSwap with the retry flag and a fresh token', () => {
    expect(src).toContain('rearmSwapRef.current = (boundary: PersonaBoundary) => armSwap(boundary, { retry: true });');
    expect(src).toContain('authorizedAt: Date.now()');
  });

  test('the planned cut-over connects with a ctx and a fresh-authorization connect retry', () => {
    expect(src).toContain('onFailure: onSegmentConnectFailure(1)');
    expect(src).toContain('segmentConnectRetryAllowed(attempt)');
    expect(src).toContain("const fresh = await requestSegment(incoming, boundary, { swap: true });");
  });

  test('no prompt text was touched (SIMULATION_* byte-identity preserved)', () => {
    const voiceConfig = read('supabase/functions/_shared/voice-config.ts');
    expect(voiceConfig).toContain('SIMULATION_HOST_SEGMENT');
    expect(src).not.toContain('SIMULATION_HOST_SEGMENT');
  });
});

describe('diag buffer isolation', () => {
  beforeEach(() => resetSwapDiagnostics());
  test('starts empty for each suite run', () => {
    expect(swapDiagnostics()).toHaveLength(0);
  });
});
