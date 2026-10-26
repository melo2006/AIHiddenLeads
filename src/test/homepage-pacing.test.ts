// @vitest-environment node
import { expect, test } from 'vitest';
import { homepagePacingAction } from '../../supabase/functions/_shared/homepage-pacing';

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
