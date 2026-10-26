// @vitest-environment node
import { expect, test } from 'vitest';
import { demoPacingAction, DEMO_SAFETY_SECONDS, salesRecommendation } from '../../supabase/functions/_shared/demo-sales';
test('five-minute demo checkpoint is soft and occurs once', () => {
  expect(demoPacingAction(299, false)).toBeNull();
  expect(demoPacingAction(300, false)).toBe('checkpoint');
  expect(demoPacingAction(420, true)).toBeNull();
});
test('engaged demos have a fifteen-minute safety ceiling rather than five minutes', () => {
  expect(DEMO_SAFETY_SECONDS).toBe(900);
});
test('recommendations accept only the three purchasable plans', () => {
  expect(salesRecommendation('essentials')).toBe('essentials');
  expect(salesRecommendation('growth')).toBe('growth');
  expect(salesRecommendation('fullservice')).toBe('fullservice');
  expect(salesRecommendation('arbitrary')).toBeNull();
});