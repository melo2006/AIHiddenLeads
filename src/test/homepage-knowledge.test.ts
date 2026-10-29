// @vitest-environment node
import { expect, test } from 'vitest';
import { HOMEPAGE_PLANS, HOMEPAGE_ADDONS, HOMEPAGE_KNOWLEDGE } from '../../supabase/functions/_shared/homepage-knowledge';
import { businessDemoConfig } from '../../supabase/functions/_shared/voice-config';

test('Natural Voice has the approved price, minutes and leads', () => {
  expect(HOMEPAGE_PLANS.find(p => p.name === 'Natural Voice')).toEqual({name:'Natural Voice',monthlyUsd:99,setupUsd:99,browserVoiceMinutes:400,normalMinutes:200,perMinEquivUsd:0.25,leadsPerMonth:50});
});
test('Pro has the approved price, minutes and leads', () => {
  expect(HOMEPAGE_PLANS.find(p => p.name === 'Pro')).toEqual({name:'Pro',monthlyUsd:199,setupUsd:199,browserVoiceMinutes:1200,normalMinutes:600,perMinEquivUsd:0.17,leadsPerMonth:100});
});
test('Premium has the approved price, minutes and leads', () => {
  expect(HOMEPAGE_PLANS.find(p => p.name === 'Premium')).toEqual({name:'Premium',monthlyUsd:349,setupUsd:349,browserVoiceMinutes:2500,normalMinutes:1250,perMinEquivUsd:0.14,leadsPerMonth:200});
});
test('Connected Bundle costs $79 monthly', () => expect(HOMEPAGE_ADDONS.find(a => a.name.startsWith('Connected Bundle'))).toMatchObject({usd:79,cadence:'monthly'}));
test('Warm Transfer add-on costs $49 monthly', () => expect(HOMEPAGE_ADDONS.find(a => a.name.startsWith('Warm Transfer'))).toMatchObject({usd:49,cadence:'monthly'}));
test('SMS notifications add-on costs $19 monthly', () => expect(HOMEPAGE_ADDONS.find(a => a.name.startsWith('SMS Lead Notifications'))).toMatchObject({usd:19,cadence:'monthly'}));
test('Appointment reminders add-on costs $29 monthly', () => expect(HOMEPAGE_ADDONS.find(a => a.name.startsWith('SMS/Email Appointment Reminders'))).toMatchObject({usd:29,cadence:'monthly'}));
test('Website Refresh costs $99 one time', () => expect(HOMEPAGE_ADDONS.find(a => a.name === 'Website Refresh')).toMatchObject({usd:99,cadence:'one-time'}));
test('SEO audit is free', () => expect(HOMEPAGE_ADDONS.find(a => a.name === 'SEO Audit')?.usd).toBe(0));
test('GEO costs $249 monthly', () => expect(HOMEPAGE_ADDONS.find(a => a.name === 'AI Search Optimization / GEO')).toMatchObject({usd:249,cadence:'monthly'}));
test('Maps Boost costs $149 monthly', () => expect(HOMEPAGE_ADDONS.find(a => a.name === 'Google Maps Boost')).toMatchObject({usd:149,cadence:'monthly'}));
test('knowledge quotes the doubled-minutes and setup waiver promo through Nov 30', () => {
  expect(HOMEPAGE_KNOWLEDGE).toContain('DOUBLED');
  expect(HOMEPAGE_KNOWLEDGE).toContain('November 30');
  expect(HOMEPAGE_KNOWLEDGE).toContain('400 browser voice minutes');
});
test('homepage reference never becomes the simulated business knowledge', () => {
  const simulation = businessDemoConfig('Example Bank', 'Bank account evidence', {knowledge:HOMEPAGE_KNOWLEDGE});
  expect(simulation.knowledge).toBe('');
  expect(simulation.sourceKnowledge).toBe('Bank account evidence');
});
