// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, test } from 'vitest';
import { homepagePacingAction, silenceLadderRung, SILENCE_NUDGE_1, SILENCE_NUDGE_2, SILENCE_NUDGE_3 } from '../../supabase/functions/_shared/homepage-pacing';

test('soft wrap-up offer starts at seven minutes, once', () => {
  expect(homepagePacingAction(419, 5, false)).toBeNull();
  expect(homepagePacingAction(420, 5, false)).toBe('wrapup');
  expect(homepagePacingAction(500, 5, true)).toBeNull();
});
test('engaged callers continue past ten minutes', () => {
  expect(homepagePacingAction(700, 30, true)).toBeNull();
});
test('after ten minutes, ninety quiet seconds closes the call', () => {
  expect(homepagePacingAction(600, 91, true)).toBe('close');
});

describe('silenceLadderRung — the mechanical silence ladder (2026-11-16)', () => {
  it('fires rung 1 at 15s, rung 2 at 40s, rung 3 at 75s of silence', () => {
    expect(silenceLadderRung(14, 0)).toBe(0);
    expect(silenceLadderRung(15, 0)).toBe(1);
    expect(silenceLadderRung(39, 1)).toBe(0);
    expect(silenceLadderRung(40, 1)).toBe(2);
    expect(silenceLadderRung(74, 2)).toBe(0);
    expect(silenceLadderRung(75, 2)).toBe(3);
    expect(silenceLadderRung(300, 3)).toBe(0);
  });

  it('advances ONE rung per call — a long silence still climbs in order, never skipping the check-in', () => {
    expect(silenceLadderRung(80, 0)).toBe(1);
    expect(silenceLadderRung(80, 1)).toBe(2);
    expect(silenceLadderRung(80, 2)).toBe(3);
    expect(silenceLadderRung(45, 0)).toBe(1);
  });

  it('the nudges carry Ron\'s spec: one check-in, then selling + a yes/no question, then the demo-link close', () => {
    expect(SILENCE_NUDGE_1).toContain('Are you still there?');
    expect(SILENCE_NUDGE_2).toContain('yes-or-no question');
    expect(SILENCE_NUDGE_3).toContain('demo link');
    expect(SILENCE_NUDGE_3).toContain('Do not ask a question');
  });

  it('the proxy wires the ladder into the pacing timer with its guards', () => {
    const proxy = fs.readFileSync(path.join(__dirname, '..', '..', 'supabase/functions/gemini-live-proxy/index.ts'), 'utf8');
    expect(proxy).toContain("event: 'silence_ladder_fire'");
    expect(proxy).toContain('silenceLadderRung(silenceSeconds, silenceRung)');
    expect(proxy).toContain('Math.max(lastCallerSpeech, lastModelTurnAt)');
  });
});
