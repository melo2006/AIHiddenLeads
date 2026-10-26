// @vitest-environment node
import { expect, test } from 'vitest';
import { HOMEPAGE_SERVICE_AREAS, HOMEPAGE_STARTER } from '../../supabase/functions/_shared/homepage-services';
import { HOMEPAGE_PLANS } from '../../supabase/functions/_shared/homepage-knowledge';

test('five areas keep reception first, reputation fourth and social fifth', () => {
  expect(HOMEPAGE_SERVICE_AREAS.map(s => s.id)).toEqual(['voice','leads','search','reputation','social']);
});
test('starter offer is $99 with 50 included prospects and matches the approved plan', () => {
  expect(HOMEPAGE_STARTER).toEqual({monthlyUsd:99, leadsPerMonth:50});
  expect(HOMEPAGE_PLANS[0]).toMatchObject(HOMEPAGE_STARTER);
});