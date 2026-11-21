import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { HOMEPAGE_SALES_PROMPT } from '../../supabase/functions/_shared/homepage-knowledge';

// Wiring pins for the voice demo start (2026-11-21, homepage-test
// items 9 + 10). The mechanical behavior lives in
// _shared/demo-start.ts (demo-start.test.ts); these pins lock the
// four surfaces that must agree for the feature to exist at all: the
// proxy declares and runs the tool, the client renders its card and
// the entry affordance, and the sales prompt drives the tool instead
// of narrating a build.

const proxy = readFileSync(resolve(__dirname, '../../supabase/functions/gemini-live-proxy/index.ts'), 'utf8');
const conversation = readFileSync(resolve(__dirname, '../components/GeminiConversation.tsx'), 'utf8');
const card = readFileSync(resolve(__dirname, '../components/DemoStartConfirmation.tsx'), 'utf8');

test('proxy declares the demo-start tool only on homepage sales sessions', () => {
  expect(proxy).toContain("from '../_shared/demo-start.ts'");
  expect(proxy).toContain('demoStartApplies({ homepageSales: config.homepageSales, simulation: config.simulation, preview })');
  expect(proxy).toContain('...(demoStartAvailable ? [DEMO_START_TOOL_DECLARATION] : [])');
});

test('proxy runs the tool through the session-bound pending-action registry', () => {
  expect(proxy).toContain("call.name === 'request_demo_start'");
  expect(proxy).toContain('demoStartCardFromArgs(call.args as Record<string, unknown> | undefined, capturedContact)');
  expect(proxy).toContain('pendingActions.set(call.id,{call:{id:call.id,name:call.name},demo:demoCard})');
  expect(proxy).toContain("action.call.name === 'request_demo_start'");
});

test('proxy confirm handler creates the lead through the existing demo pipeline', () => {
  expect(proxy).toContain("db.rpc('create_demo_lead', args)");
  expect(proxy).toContain('/functions/v1/demo-verification');
  expect(proxy).toContain('disclosureVersion: DEMO_CONSENT_DISCLOSURE_VERSION');
  expect(proxy).toContain('/functions/v1/scan-website');
  expect(proxy).toContain('session.lead_id = started.leadId');
  expect(proxy).toContain('demoStartToolSuccessResponse(started)');
  expect(proxy).toContain('DEMO_START_FALLBACK_TOOL_RESPONSE');
  // No parallel pipeline: the proxy never writes demo_leads directly.
  expect(proxy).not.toContain("from('demo_leads')");
});

test('client renders the demo confirmation card and the persistent entry card', () => {
  expect(conversation).toContain("import DemoStartConfirmation, { type DemoStartValues } from \"./DemoStartConfirmation\"");
  expect(conversation).toContain("pendingAction.action === 'request_demo_start'");
  expect(conversation).toContain('JSON.stringify({type:\'confirm_action\',id:pendingAction.id,approved,demo})');
  expect(conversation).toContain('setDemoCard({ demoPath: msg.demoPath');
  expect(conversation).toContain('href={demoCard.demoPath}');
  expect(conversation).toContain('{demoEntryCard}');
});

test('the demo card is disclosure-by-continuing: disclosure shown, no consent checkbox', () => {
  expect(card).toContain('DEMO_CONSENT_DISCLOSURE');
  expect(card).not.toContain('type="checkbox"');
  expect(card).not.toContain('confirmedVisitorContact');
  // Persistence: only the explicit buttons answer; dismissal
  // gestures are swallowed so an edit keystroke can never lose it.
  expect(card).toContain('onEscapeKeyDown={(e) => e.preventDefault()}');
  expect(card).toContain('onPointerDownOutside={(e) => e.preventDefault()}');
  // Keyboard-aware: the card tracks visualViewport so it stays
  // above the phone keyboard while the address is corrected.
  expect(card).toContain('window.visualViewport');
  expect(card).toContain('looksLikeDomain(websiteUrl)');
  expect(card).toContain('normalizeDemoUrl(websiteUrl)');
});

test('sales prompt bridge drives the tool and keeps the button as fallback', () => {
  const bridge = HOMEPAGE_SALES_PROMPT.slice(
    HOMEPAGE_SALES_PROMPT.indexOf('DEMO BRIDGE'),
    HOMEPAGE_SALES_PROMPT.indexOf('OPENING AND POSITIONING'),
  );
  expect(bridge).toContain('request_demo_start');
  expect(bridge).toContain('Narrate ONLY what the tool result says');
  expect(bridge).toContain("Try it on your website — free");
});
