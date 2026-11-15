// @vitest-environment node
import { expect, test } from 'vitest';
import { voiceIdleAction, homepageWalkthroughDue } from '../lib/voiceIdle';
import { HOMEPAGE_GREETING } from '../../supabase/functions/_shared/homepage-knowledge';

test('phone-or-website opening waits for an answer rather than auto-selling', () => {
  expect(homepageWalkthroughDue(HOMEPAGE_GREETING, false, 1000, 15000)).toBe(false);
});

test('homepage silence check-in waits fifteen seconds', () => {
  expect(voiceIdleAction('waiting', 1000, 15999)).toBeNull();
  expect(voiceIdleAction('waiting', 1000, 16000)).toBe('checkin');
});
test('caller has another fifteen seconds after check-in playback', () => {
  expect(voiceIdleAction('checkin', 20000, 34999)).toBeNull();
  expect(voiceIdleAction('checkin', 20000, 35000)).toBe('goodbye');
});
test('resumed conversation resets the silence deadline', () => {
  expect(voiceIdleAction('waiting', 35000, 35001)).toBeNull();
});
test('sales silence ladder: check-in after ~7s of quiet (owner, 2026-11-15)', () => {
  expect(voiceIdleAction('waiting', 1000, 7999, true)).toBeNull();
  expect(voiceIdleAction('waiting', 1000, 8000, true)).toBe('checkin');
});
test('sales silence ladder: a bridge follows the check-in, not a goodbye', () => {
  expect(voiceIdleAction('checkin', 20000, 39999, true)).toBeNull();
  expect(voiceIdleAction('checkin', 20000, 40000, true)).toBe('bridge');
});
test('sales silence ladder: only a long quiet after the bridge earns the goodbye', () => {
  expect(voiceIdleAction('bridge', 50000, 94999, true)).toBeNull();
  expect(voiceIdleAction('bridge', 50000, 95000, true)).toBe('goodbye');
});
test('non-sales sessions never bridge', () => {
  expect(voiceIdleAction('checkin', 20000, 120000, false)).toBe('goodbye');
  expect(voiceIdleAction('waiting', 1000, 8000, false)).toBeNull();
});
test('permission question allows one short continuation after six seconds', () => {
  expect(homepageWalkthroughDue('Shall we explore the other advantages?', false, 1000, 6999)).toBe(false);
  expect(homepageWalkthroughDue('Shall we explore the other advantages?', false, 1000, 7000)).toBe(true);
  expect(homepageWalkthroughDue('Shall we explore the other advantages?', true, 1000, 7000)).toBe(false);
  expect(homepageWalkthroughDue('What is your business name?', false, 1000, 7000)).toBe(false);
});