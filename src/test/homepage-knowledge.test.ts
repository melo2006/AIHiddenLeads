// @vitest-environment node
import { expect, test } from 'vitest';
import { HOMEPAGE_PLANS, HOMEPAGE_ADDONS, HOMEPAGE_KNOWLEDGE } from '../../supabase/functions/_shared/homepage-knowledge';
import { businessDemoConfig } from '../../supabase/functions/_shared/voice-config';

test('AI Essentials has the approved monthly and setup prices', () => {
  expect(HOMEPAGE_PLANS.find(p => p.name === 'AI Essentials')).toEqual({name:'AI Essentials',monthlyUsd:99,setupUsd:99});
});
test('Growth Engine has the approved monthly and setup prices', () => {
  expect(HOMEPAGE_PLANS.find(p => p.name === 'Growth Engine')).toEqual({name:'Growth Engine',monthlyUsd:199,setupUsd:199});
});
test('Full Service has no setup fee', () => {
  expect(HOMEPAGE_PLANS.find(p => p.name === 'Full Service')).toEqual({name:'Full Service',monthlyUsd:349,setupUsd:0});
});
test('Website Refresh costs $99 one time', () => expect(HOMEPAGE_ADDONS.find(a => a.name === 'Website Refresh')).toMatchObject({usd:99,cadence:'one-time'}));
test('SEO audit is free', () => expect(HOMEPAGE_ADDONS.find(a => a.name === 'SEO Audit')?.usd).toBe(0));
test('GEO costs $249 monthly', () => expect(HOMEPAGE_ADDONS.find(a => a.name === 'AI Search Optimization / GEO')).toMatchObject({usd:249,cadence:'monthly'}));
test('Maps Boost costs $149 monthly', () => expect(HOMEPAGE_ADDONS.find(a => a.name === 'Google Maps Boost')).toMatchObject({usd:149,cadence:'monthly'}));
test('homepage reference never becomes the simulated business knowledge', () => {
  const simulation = businessDemoConfig('Example Bank', 'Bank account evidence', {knowledge:HOMEPAGE_KNOWLEDGE});
  expect(simulation.knowledge).toBe('');
  expect(simulation.sourceKnowledge).toBe('Bank account evidence');
});