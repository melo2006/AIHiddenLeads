// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, test } from 'vitest';
import { homepagePacingAction, silenceLadderRung, silenceLadderDue, substantiveCallerTurn, SILENCE_NUDGE_1, SILENCE_NUDGE_2, SILENCE_NUDGE_3 } from '../../supabase/functions/_shared/homepage-pacing';

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
    expect(proxy).toContain('silenceLadderDue({');
    expect(proxy).toContain('modelSpeaking: modelTurnInFlight');
    // The ladder clock is the VISITOR's silence alone (cadence fix,
    // 2026-11-17): the either-side max() that restarted the climb
    // on every model turn is gone, and the raw rung math now lives
    // behind silenceLadderDue in the shared module.
    expect(proxy).toContain('const silenceSeconds = (Date.now() - lastRealCallerTurnAt) / 1000');
    expect(proxy).not.toContain('Math.max(lastRealCallerTurnAt, lastModelTurnAt)');
    const pacing = fs.readFileSync(path.join(__dirname, '..', '..', 'supabase/functions/_shared/homepage-pacing.ts'), 'utf8');
    expect(pacing).toContain('return silenceLadderRung(args.silenceSeconds, args.currentRung)');
  });

  it('the client idle check-in/goodbye stages are ignored on sales sessions — the ladder is the single silence owner', () => {
    const proxy = fs.readFileSync(path.join(__dirname, '..', '..', 'supabase/functions/gemini-live-proxy/index.ts'), 'utf8');
    expect(proxy).toContain("event: 'idle_prompt_ignored_sales'");
    expect(proxy).toContain("(msg.stage === 'checkin' || msg.stage === 'goodbye')");
  });

  it('the episode resets only on a substantive completed turn — never on a raw fragment', () => {
    const proxy = fs.readFileSync(path.join(__dirname, '..', '..', 'supabase/functions/gemini-live-proxy/index.ts'), 'utf8');
    expect(proxy).toContain('substantiveCallerTurn(completedUtterance) || detectFarewell(completedUtterance)');
    // The fragment handler must not reset the rung: between the
    // inputTranscription branch and the callerUtterance accumulation
    // there is no silenceRung assignment.
    const fragAt = proxy.indexOf('if (sc.inputTranscription?.text) {');
    const fragBlock = proxy.slice(fragAt, proxy.indexOf('callerUtterance = (callerUtterance', fragAt));
    expect(fragBlock).not.toContain('silenceRung = 0');
  });
});

describe('silenceLadderDue — episode cadence: model turns never restart the climb (2026-11-17)', () => {
  // One pacing tick, with the conversational defaults filled in:
  // Aspen idle, her last turn long settled, no recent ladder fire.
  const due = (over: Partial<Parameters<typeof silenceLadderDue>[0]>) => silenceLadderDue({
    silenceSeconds: 0,
    currentRung: 0,
    modelSpeaking: false,
    sinceModelTurnEndSeconds: 60,
    sinceLastFireSeconds: Number.POSITIVE_INFINITY,
    ...over,
  });

  it('the journal pattern (session 3cfadd76): her check-in turn intervenes — the next fire is rung 2 at cumulative 40s, never rung 1 twice', () => {
    // t=15s of visitor silence; Aspen idle since her question ended.
    expect(due({ silenceSeconds: 15, currentRung: 0, sinceModelTurnEndSeconds: 7 })).toBe(1);
    // She speaks the check-in (t≈15–18): the ladder never fires over her.
    expect(due({ silenceSeconds: 17, currentRung: 1, modelSpeaking: true, sinceModelTurnEndSeconds: 0, sinceLastFireSeconds: 2 })).toBe(0);
    // The check-in just ended: the settle beat holds the ladder.
    expect(due({ silenceSeconds: 20, currentRung: 1, modelSpeaking: false, sinceModelTurnEndSeconds: 2, sinceLastFireSeconds: 5 })).toBe(0);
    // The climb is cumulative against the VISITOR's silence — her
    // check-in did not restart it: short of 40s, nothing; at 40s,
    // rung 2 (the selling bridge), NOT a second "are you still there?".
    expect(due({ silenceSeconds: 39, currentRung: 1, sinceLastFireSeconds: 24 })).toBe(0);
    expect(due({ silenceSeconds: 40, currentRung: 1, sinceLastFireSeconds: 25 })).toBe(2);
    // Her bridge turn runs (t≈40–65): nothing fires over it.
    expect(due({ silenceSeconds: 55, currentRung: 2, modelSpeaking: true, sinceModelTurnEndSeconds: 0, sinceLastFireSeconds: 15 })).toBe(0);
    // Rung 3 at cumulative 75s — the final nudge.
    expect(due({ silenceSeconds: 74, currentRung: 2, sinceLastFireSeconds: 34 })).toBe(0);
    expect(due({ silenceSeconds: 75, currentRung: 2, sinceLastFireSeconds: 35 })).toBe(3);
    // After rung 3 the episode is done: minutes more silence fire nothing.
    expect(due({ silenceSeconds: 300, currentRung: 3, sinceLastFireSeconds: 225 })).toBe(0);
  });

  it('a substantive visitor turn starts a NEW episode at rung 1 — and the fire-gap guard never blocks a fresh episode', () => {
    // The previous episode fired 3s ago; the visitor then spoke
    // (the proxy resets rung + clock — pinned in the wiring tests
    // above) and has now been quiet 15s in the new episode.
    expect(due({ silenceSeconds: 15, currentRung: 0, sinceLastFireSeconds: 3 })).toBe(1);
  });

  it('one long model turn spanning every threshold still climbs in order, spaced by the fire gap', () => {
    // Her pitch runs while the visitor's silence crosses 15/40/75.
    expect(due({ silenceSeconds: 50, currentRung: 0, modelSpeaking: true, sinceModelTurnEndSeconds: 0 })).toBe(0);
    // She finishes; the first crossed threshold fires as rung 1.
    expect(due({ silenceSeconds: 51, currentRung: 0, modelSpeaking: false, sinceModelTurnEndSeconds: 5 })).toBe(1);
    // 5s later the cumulative silence is already past rung 2's mark,
    // but the minimum fire gap holds it — no back-to-back nudges.
    expect(due({ silenceSeconds: 56, currentRung: 1, modelSpeaking: false, sinceModelTurnEndSeconds: 10, sinceLastFireSeconds: 5 })).toBe(0);
    expect(due({ silenceSeconds: 60, currentRung: 1, modelSpeaking: false, sinceModelTurnEndSeconds: 14, sinceLastFireSeconds: 9 })).toBe(2);
    expect(due({ silenceSeconds: 75, currentRung: 2, modelSpeaking: false, sinceModelTurnEndSeconds: 29, sinceLastFireSeconds: 15 })).toBe(3);
  });

  it('rung contents differ per rung — only rung 1 is the "are you still there?" check-in', () => {
    expect(SILENCE_NUDGE_1).toContain('Are you still there?');
    expect(SILENCE_NUDGE_2).not.toContain('Are you still there?');
    expect(SILENCE_NUDGE_3).not.toContain('Are you still there?');
    expect(new Set([SILENCE_NUDGE_1, SILENCE_NUDGE_2, SILENCE_NUDGE_3]).size).toBe(3);
  });
});

describe('substantiveCallerTurn — fragments never reset the silence episode (2026-11-16)', () => {
  it('rejects the one-word background fragments from Ron\'s noisy-room retest', () => {
    expect(substantiveCallerTurn('tú')).toBe(false);
    expect(substantiveCallerTurn('¿Qué?')).toBe(false);
    expect(substantiveCallerTurn('Ja.')).toBe(false);
    expect(substantiveCallerTurn('Es')).toBe(false);
    expect(substantiveCallerTurn('')).toBe(false);
    expect(substantiveCallerTurn('   ')).toBe(false);
    expect(substantiveCallerTurn('okay')).toBe(false);
    expect(substantiveCallerTurn('thank you')).toBe(false);
  });

  it('accepts real visitor turns', () => {
    expect(substantiveCallerTurn('go ahead, continue')).toBe(true);
    expect(substantiveCallerTurn('my name is Robert')).toBe(true);
    expect(substantiveCallerTurn('I run a painting business')).toBe(true);
    expect(substantiveCallerTurn('how much does it cost')).toBe(true);
  });
});
