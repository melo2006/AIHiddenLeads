// @vitest-environment node
import { expect, test } from 'vitest';
import { HOMEPAGE_PLANS, HOMEPAGE_ADDONS, HOMEPAGE_KNOWLEDGE, HOMEPAGE_SALES_PROMPT, TEAM_FACTS } from '../../supabase/functions/_shared/homepage-knowledge';
import { businessDemoConfig } from '../../supabase/functions/_shared/voice-config';

test('Premium has the approved price, minutes and leads', () => {
  expect(HOMEPAGE_PLANS.find(p => p.name === 'Premium')).toEqual({name:'Premium',monthlyUsd:99,setupUsd:99,browserVoiceMinutes:400,perMinEquivUsd:0.25,leadsPerMonth:50});
});
test('Professional has the approved price, minutes and leads', () => {
  expect(HOMEPAGE_PLANS.find(p => p.name === 'Professional')).toEqual({name:'Professional',monthlyUsd:199,setupUsd:199,browserVoiceMinutes:1200,perMinEquivUsd:0.17,leadsPerMonth:100});
});
test('Platinum has the approved price, minutes and leads', () => {
  expect(HOMEPAGE_PLANS.find(p => p.name === 'Platinum')).toEqual({name:'Platinum',monthlyUsd:349,setupUsd:349,browserVoiceMinutes:2500,perMinEquivUsd:0.14,leadsPerMonth:200});
});
test('Connected Bundle costs $79 monthly', () => expect(HOMEPAGE_ADDONS.find(a => a.name.startsWith('Connected Bundle'))).toMatchObject({usd:79,cadence:'monthly'}));
test('Warm Transfer add-on costs $49 monthly', () => expect(HOMEPAGE_ADDONS.find(a => a.name.startsWith('Warm Transfer'))).toMatchObject({usd:49,cadence:'monthly'}));
test('SMS notifications add-on costs $19 monthly', () => expect(HOMEPAGE_ADDONS.find(a => a.name.startsWith('SMS Lead Notifications'))).toMatchObject({usd:19,cadence:'monthly'}));
test('Appointment reminders add-on costs $29 monthly', () => expect(HOMEPAGE_ADDONS.find(a => a.name.startsWith('SMS/Email Appointment Reminders'))).toMatchObject({usd:29,cadence:'monthly'}));
test('Website Modernization costs $99 one time for up to 5 pages', () => expect(HOMEPAGE_ADDONS.find(a => a.name.startsWith('Website Modernization (up to 5 pages'))).toMatchObject({usd:99,cadence:'one-time'}));
test('SEO audit is free', () => expect(HOMEPAGE_ADDONS.find(a => a.name === 'SEO Audit')?.usd).toBe(0));
test('GEO costs $249 monthly', () => expect(HOMEPAGE_ADDONS.find(a => a.name === 'AI Search Optimization / GEO')).toMatchObject({usd:249,cadence:'monthly'}));
test('Maps Boost costs $149 monthly', () => expect(HOMEPAGE_ADDONS.find(a => a.name === 'Google Maps Boost')).toMatchObject({usd:149,cadence:'monthly'}));
// Pricing pins track Ron's decisions, not the other way round. History:
// the pre-2026-11-08 pin held the retired launch promo ('DOUBLED' minutes
// + a hard 'November 30' end); the 2026-11-09 pin held the evergreen
// 50%-off-first-3-months promo. On 2026-11-12 Ron made $99/$199/$349 the
// PERMANENT prices and killed the intro story outright (it was never
// implemented in checkout); the live offer is the avatar's free first
// month. These pins hold the decided facts.
test('knowledge quotes permanent prices and 400 Premium minutes, never the intro story', () => {
  expect(HOMEPAGE_KNOWLEDGE).toContain('400 browser voice minutes');
  expect(HOMEPAGE_KNOWLEDGE).toContain('permanent');
  expect(HOMEPAGE_KNOWLEDGE).toContain('no introductory discount');
  expect(HOMEPAGE_KNOWLEDGE).not.toContain('50% off');
  expect(HOMEPAGE_KNOWLEDGE).not.toContain('DOUBLED');
  expect(HOMEPAGE_KNOWLEDGE).not.toContain('November 30');
  expect(HOMEPAGE_KNOWLEDGE).not.toContain('$99 plus $79');
  expect(HOMEPAGE_KNOWLEDGE).not.toContain('$180');
  expect(HOMEPAGE_KNOWLEDGE).not.toContain('$250/month on Platinum');
});
test('knowledge states the avatar add-on exactly as decided: $79 flat, first month free', () => {
  expect(HOMEPAGE_SALES_PROMPT).toContain('$79/month flat on every plan');
  expect(HOMEPAGE_SALES_PROMPT).toContain('first month of the avatar is FREE');
  expect(HOMEPAGE_SALES_PROMPT).toContain('switches off automatically');
  expect(HOMEPAGE_SALES_PROMPT).toContain('pauses to voice-only');
  expect(HOMEPAGE_SALES_PROMPT).not.toContain('$180/month on Professional');
});
test('knowledge carries the minutes rollover rule', () => {
  expect(HOMEPAGE_SALES_PROMPT).toContain('roll over month to month while the subscription stays active');
  expect(HOMEPAGE_SALES_PROMPT).toContain('expire after 90 days');
});
test('knowledge knows Sara is the demo receptionist', () => {
  expect(TEAM_FACTS).toContain('SARA is our demo receptionist');
  expect(TEAM_FACTS).toContain('plays the role of THEIR business\'s receptionist inside the simulation');
  expect(TEAM_FACTS).toContain('she does not sell AI Hidden Leads');
  expect(HOMEPAGE_KNOWLEDGE).toContain('Sara is our demo receptionist');
});
test('knowledge knows Alex is the Support Specialist for setup and onboarding', () => {
  expect(TEAM_FACTS).toContain('ALEX is our Support Specialist for setup and onboarding');
  expect(TEAM_FACTS).toContain('never call him an engineer');
  expect(TEAM_FACTS).toContain('6-step setup wizard');
  expect(HOMEPAGE_KNOWLEDGE).toContain('Alex is our Support Specialist for setup and onboarding');
});
test('knowledge forbids denying the teammates exist', () => {
  expect(TEAM_FACTS).toContain('you never deny working with them');
  expect(TEAM_FACTS).toContain('YOU DO NOT WORK ALONE');
  expect(HOMEPAGE_SALES_PROMPT).toContain('YOUR TEAM — YOU DO NOT WORK ALONE');
});
test('knowledge introduces Alex on setup/implementation topics and Sara at the demo', () => {
  expect(TEAM_FACTS).toContain('INTRODUCING YOUR TEAMMATES');
  expect(TEAM_FACTS).toContain('implementation, setup, onboarding, getting started');
  expect(TEAM_FACTS).toContain('introduce Alex by name and title');
  expect(TEAM_FACTS).toContain('name Sara as the one who will play their receptionist inside the simulation');
});
test('knowledge carries the current website services list', () => {
  for (const name of [
    'Live Video Receptionist on Your Website',
    'AI Phone Receptionist — No Website Needed',
    'Fresh B2B Prospects, Delivered Weekly',
    'Google Maps & AI Search Visibility',
    'Reviews & Reputation Management',
    'Social Media Management',
    'Website Revamp or a Brand-New Site',
  ]) {
    expect(HOMEPAGE_KNOWLEDGE).toContain(name);
  }
  expect(HOMEPAGE_KNOWLEDGE).toContain('25-point Map & AI Audit Report is free');
  expect(HOMEPAGE_KNOWLEDGE).toContain('ChatGPT, Gemini and Claude');
});
test('homepage reference never becomes the simulated business knowledge', () => {
  const simulation = businessDemoConfig('Example Bank', 'Bank account evidence', {knowledge:HOMEPAGE_KNOWLEDGE});
  expect(simulation.knowledge).toBe('');
  expect(simulation.sourceKnowledge).toBe('Bank account evidence');
});
