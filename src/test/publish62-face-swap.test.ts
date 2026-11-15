// Publish #62 — meet-Alex face swap (presenter demos), 2026-11-15.
//
// Ron's live presenter test (Martinez demo, 2026-11-15 ~02:29–02:41
// EST): Frank introduced Alex, the Alex segment was authorized and
// ran (voice Puck, correct intro) — but Alex's face NEVER appeared;
// Ron watched Frank's face for two whole Alex segments, and
// config->>'swapDiag' / personaSwapDiag held nothing that explained
// it. Two defects, both pinned here:
//
//  1. THE FACE VERDICT (fixed in SimliAvatar + avatarAudioTransition,
//     unit-tested in avatar-audio-transition.test.ts): in local-first
//     paired mode — the default — a pre-staged face's returned audio
//     is unsubscribed the moment it goes live (the starve), and
//     LiveKit's detach nulls the audio element's srcObject. The
//     cut-over/takeover audio sync judged liveness by
//     `live && audio.srcObject`, so a healthy live Alex read as DEAD
//     at every attempt: face-first demoted to voice-first, and the
//     takeover refused forever. The verdict is mode-aware now
//     (faceActivationReady): liveness alone in local mode, the
//     srcObject requirement kept in stream mode.
//
//  2. THE SILENT REFUSAL: the takeover's not-live return recorded
//     NOTHING — no ring-buffer entry, no persisted event. It now
//     records + persists 'face-attach-failed' (ring buffer +
//     gemini-session's swapDiag channel → config.personaSwapDiag on
//     the segment's own row), so the next failure of this class is
//     readable from the session record.
//
//  Plus the decline gate: Ron tried to DECLINE Alex ("No hay que ver
//  esa Alex") and the bare-name intent match armed the swap anyway.
//  visitorDeclinesAlex now wins over intent in the same line.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  INITIAL_SWAP_STATE, noteAlexIntent, SWAP_DIAG_PERSIST_EVENTS,
  swapDiagPersistPayload, visitorDeclinesAlex, visitorRequestsAlex,
  type SwapDiagEntry, type SwapState,
} from '@/lib/personaSwap';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

const presenterHost: SwapState = { ...INITIAL_SWAP_STATE, persona: 'frank', presenter: 'frank' };

describe('decline gate: a refusal never arms the swap it refuses', () => {
  const declines = [
    "No hay que ver esa Alex.", // Ron's verbatim line, 2026-11-15
    "Don't bring Alex in.",
    'Do not want Alex, thanks.',
    'No — not Alex.',
    'Skip Alex.',
    'Alex? No thanks.',
    "I don't want to meet anyone right now.",
  ];
  for (const line of declines) {
    test(`decline: ${line}`, () => {
      expect(visitorDeclinesAlex(line)).toBe(true);
      expect(visitorRequestsAlex(line)).toBe(false);
    });
  }

  test("Ron's decline leaves the swap state untouched (no pendingAlex)", () => {
    expect(noteAlexIntent(presenterHost, 'No hay que ver esa Alex.')).toBe(presenterHost);
  });

  const asks = [
    'Can I talk to Alex?',
    'Bring Alex in, please.',
    'Where is Alex?',
    "What's the setup process?",
    'I thought you were going to bring Alex',
  ];
  for (const line of asks) {
    test(`still arms: ${line}`, () => {
      expect(visitorDeclinesAlex(line)).toBe(false);
      expect(visitorRequestsAlex(line)).toBe(true);
    });
  }

  test('a decline suppresses only its own line — a later genuine ask still arms', () => {
    const afterDecline = noteAlexIntent(presenterHost, "Don't bring Alex in.");
    expect(afterDecline).toBe(presenterHost);
    const afterAsk = noteAlexIntent(afterDecline, 'Actually, can I talk to Alex?');
    expect(afterAsk.pendingAlex).toBe(true);
  });
});

describe('swap diagnostics: the attach refusal is persisted (Publish #62)', () => {
  test("'face-attach-failed' is a persisted swap-diag event", () => {
    expect(SWAP_DIAG_PERSIST_EVENTS).toContain('face-attach-failed');
  });

  test('the persist payload carries boundary, persona, reason and face state', () => {
    const entry: SwapDiagEntry = { at: 123, event: 'face-attach-failed', boundary: 'meet-alex', persona: 'alex', attempt: 1, detail: 'sync-not-live' };
    const payload = swapDiagPersistPayload(entry, 'session-1', { faceState: 'not-live' });
    expect(payload).toMatchObject({
      sessionId: 'session-1', event: 'face-attach-failed', boundary: 'meet-alex',
      persona: 'alex', attempt: 1, reason: 'sync-not-live', faceState: 'not-live', at: 123,
    });
  });

  test('the takeover refusal is recorded AND persisted in GeminiConversation (source pin)', () => {
    const convo = read('src/components/GeminiConversation.tsx');
    const takeover = convo.slice(convo.indexOf('runFaceTakeoverRef.current = async'), convo.indexOf('executeSwapRef.current = async'));
    expect(takeover).toContain("recordSwapDiag({ event: 'face-attach-failed'");
    expect(takeover).toContain("persistSwapDiagRef.current({ event: 'face-attach-failed'");
    expect(takeover).toContain("reason: 'sync-not-live'");
    // The refusal still leaves the pending in place for a later retry
    // (the persist sits BEFORE the return, the pending clear does not
    // run on this path).
    const refusalAt = takeover.indexOf("event: 'face-attach-failed'");
    expect(takeover.indexOf('segmentFacePendingRef.current = null')).toBeGreaterThan(refusalAt);
  });

  test('gemini-session admits face-attach-failed on the swapDiag channel (source pin)', () => {
    const fn = read('supabase/functions/gemini-session/index.ts');
    expect(fn).toContain("'face-takeover','face-attach-failed'");
  });
});

describe('the mode-aware verdict is wired into BOTH SimliAvatar gates (source pins)', () => {
  const simli = read('src/components/SimliAvatar.tsx');
  test('no srcObject-only liveness gate remains in SimliAvatar', () => {
    expect(simli).not.toContain('if (!liveRef.current || !audio.srcObject)');
    expect(simli.match(/faceActivationReady\(\{ live: liveRef\.current, streamMuted: streamMuted\(\), hasAudioSource: !!audio\.srcObject \}\)/g)?.length).toBe(2);
  });
  test('the local-first branches still succeed on liveness alone (the contract the gate used to defeat)', () => {
    expect(simli).toContain('Activation succeeds on liveness alone');
  });
});
