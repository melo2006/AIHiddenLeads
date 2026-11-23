// @vitest-environment node
import { expect, test } from 'vitest';
import { HOMEPAGE_PLANS, HOMEPAGE_ADDONS, HOMEPAGE_KNOWLEDGE, HOMEPAGE_SALES_LAYER, HOMEPAGE_SALES_PROMPT, TEAM_FACTS } from '../../supabase/functions/_shared/homepage-knowledge';
import { businessDemoConfig } from '../../supabase/functions/_shared/voice-config';
import { SALES_ACTION_POLICY } from '../../supabase/functions/_shared/demo-sales';
import { GUARDED_SEARCH_SALES_POLICY, guardedSearchPolicyFor } from '../../supabase/functions/_shared/guarded-search';

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
// Retired 2026-11-23 (Ron's decision): the paid ranking tiers are no longer
// purchasable packages — visibility help is a concierge engagement scoped
// after the free audit. These pins now assert the tiers stay GONE.
test('AI Search Optimization / GEO is not an offered add-on', () => expect(HOMEPAGE_ADDONS.find(a => (a.name as string) === 'AI Search Optimization / GEO')).toBeUndefined());
test('Google Maps Boost is not an offered add-on', () => expect(HOMEPAGE_ADDONS.find(a => (a.name as string) === 'Google Maps Boost')).toBeUndefined());
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
test('knowledge knows Alex is the onboarding engineer for setup and onboarding', () => {
  expect(TEAM_FACTS).toContain('ALEX is our onboarding engineer for setup and onboarding');
  expect(TEAM_FACTS).toContain('never call him the engineering department');
  expect(TEAM_FACTS).toContain('6-step setup wizard');
  expect(HOMEPAGE_KNOWLEDGE).toContain('Alex is our onboarding engineer for setup and onboarding');
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
// 2026-11-21 homepage test, item 7: Ron asked for the ATP Finals
// schedule and Aspen refused — "I cannot access the internet" — even
// though guarded search was live. The wiring was correct; the seeded
// STAY ON SCRIPT block still told her "You cannot browse or search the
// web. Politely decline off-topic requests…", and the model followed
// the instruction over the tool. This pins the composed homepage
// SALES prompt (exactly as reseed-homepage-agent stores it and
// gemini-live-proxy assembles it) so the contradiction cannot return:
// the guarded-search block is present and no no-browse /
// decline-off-topic string survives anywhere in the composition.
test('composed homepage sales prompt carries guarded search and no no-browse contradiction', () => {
  const composed = [
    HOMEPAGE_SALES_PROMPT,
    SALES_ACTION_POLICY,
    HOMEPAGE_SALES_LAYER,
    HOMEPAGE_KNOWLEDGE,
    guardedSearchPolicyFor({ homepageSales: true, simulation: false }),
  ].join('\n');
  expect(guardedSearchPolicyFor({ homepageSales: true, simulation: false })).toBe(GUARDED_SEARCH_SALES_POLICY);
  expect(composed).toContain('WEB SEARCH — GUARDED');
  expect(composed).toContain('You can check the live web');
  expect(composed).not.toContain('You cannot browse or search the web');
  expect(composed).not.toContain('cannot browse or search the web');
  expect(composed).not.toContain('Politely decline off-topic requests');
  expect(composed).not.toContain('decline off-topic requests');
});

// 2026-11-21 homepage test, items 5 + 10 (prompt layer): the DEMO
// BRIDGE used to (a) announce a two-minute in-conversation build that
// no machinery could perform from a homepage session, and (b) in the
// live seed, order contact capture EARLY while it "loads" — the exact
// opposite of Ron's END-ASK rule. The stop-gap pointed the visitor at
// the on-page demo button; the real request_demo_start tool has now
// shipped (same day), so the bridge drives the tool, narrates ONLY
// tool-confirmed status, and keeps the button as the honest fallback.
test('demo bridge drives the demo-start tool and narrates only tool-confirmed status', () => {
  const bridge = HOMEPAGE_SALES_PROMPT.slice(
    HOMEPAGE_SALES_PROMPT.indexOf('DEMO BRIDGE'),
    HOMEPAGE_SALES_PROMPT.indexOf('OPENING AND POSITIONING'),
  );
  expect(bridge).toContain('START THEIR DEMO WITH THE TOOL');
  expect(bridge).toContain('request_demo_start');
  expect(bridge).toContain('Narrate ONLY what the tool result says');
  expect(bridge).toContain("Try it on your website — free");
  expect(bridge).not.toContain('ANNOUNCE THE BUILD');
  expect(bridge).not.toContain("I'm pulling up your website right now");
  expect(bridge).not.toContain('WHILE IT LOADS');
  expect(HOMEPAGE_SALES_PROMPT).not.toContain("give me your website address, and in about two minutes I'll show you");
});

test('demo bridge states the END-ASK capture discipline in full', () => {
  const bridge = HOMEPAGE_SALES_PROMPT.slice(
    HOMEPAGE_SALES_PROMPT.indexOf('DEMO BRIDGE'),
    HOMEPAGE_SALES_PROMPT.indexOf('OPENING AND POSITIONING'),
  );
  expect(bridge).toContain('NEVER CAPTURE');
  expect(bridge).toContain('happens ONCE, at the END');
  expect(bridge).toContain('pass to their manager, a colleague, or the owner');
  expect(bridge).toContain('ONE ask only');
  expect(bridge).toContain('a decline closes warmly');
  expect(bridge).not.toContain('CONTACT DETAILS EARLY');
});

test('homepage reference never becomes the simulated business knowledge', () => {
  const simulation = businessDemoConfig('Example Bank', 'Bank account evidence', {knowledge:HOMEPAGE_KNOWLEDGE});
  expect(simulation.knowledge).toBe('');
  expect(simulation.sourceKnowledge).toBe('Bank account evidence');
});
