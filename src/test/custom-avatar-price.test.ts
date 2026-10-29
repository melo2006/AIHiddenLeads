import { expect, test } from 'vitest';
import { CUSTOM_AVATAR_PRICE } from '../../supabase/functions/_shared/payment-rules';
import { HOMEPAGE_ADDONS } from '../../supabase/functions/_shared/homepage-knowledge';

test('custom photo avatar is a $50 one-time add-on', () => {
  expect(CUSTOM_AVATAR_PRICE).toEqual({ id: 'custom_avatar_once', amount: 5000 });
});

test('Aspen knows the custom avatar is one-time $50 and library faces are free', () => {
  const addOn = HOMEPAGE_ADDONS.find(a => a.name.startsWith('Custom video avatar'));
  expect(addOn?.usd).toBe(50);
  expect(addOn?.cadence).toBe('one-time');
});
