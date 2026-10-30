// @vitest-environment node
import { expect, test } from 'vitest';
import { HOMEPAGE_EVIDENCE } from '../../supabase/functions/_shared/homepage-evidence';

test('phone opening uses the verified 78% consumer survey figure', () => {
  expect(HOMEPAGE_EVIDENCE[0]).toMatchObject({ value: '78%', url: 'https://www.callrail.com/blog/missed-calls-cost-businesses-more-than-ever' });
});
test('second phone benchmark is 37% phone-lead conversion, not the old 41%', () => {
  expect(HOMEPAGE_EVIDENCE[2]).toMatchObject({ value: '37%', url: 'https://www.invoca.com/press-release/invoca-releases-definitive-cross-channel-and-cross-industry-buyer-conversion-benchmark-report' });
});