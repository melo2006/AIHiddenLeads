import { describe, expect, test } from 'vitest';
import {
  DEMO_START_CLIENT_ERROR,
  DEMO_START_FALLBACK_TOOL_RESPONSE,
  DEMO_START_TOOL_DECLARATION,
  DEMO_START_TOOL_NAME,
  buildDemoSitePath,
  businessNameFromWebsiteUrl,
  demoStartApplies,
  demoStartCardFromArgs,
  demoStartToolSuccessResponse,
  looksLikeDomain,
  normalizeDemoUrl,
  startDemoForVisitor,
  type DemoStartWriters,
} from '../../supabase/functions/_shared/demo-start';
import { looksLikeDomain as clientLooksLikeDomain, normalizeDemoUrl as clientNormalizeDemoUrl } from '../lib/demoVerification';

// Homepage-test items 9 + 10 (2026-11-21): the voice demo start.
// Before this, no path existed from a homepage voice session to demo
// creation — Aspen narrated a build that never happened. The tool
// reuses the /demo pipeline (create_demo_lead -> gate code ->
// scan-website -> /demo-site) instead of inventing a parallel one.

describe('demo-start gate', () => {
  test('applies only to homepage sales sessions that are not simulations or previews', () => {
    expect(demoStartApplies({ homepageSales: true, simulation: false })).toBe(true);
    expect(demoStartApplies({ homepageSales: true })).toBe(true);
    expect(demoStartApplies({ homepageSales: true, simulation: true })).toBe(false);
    expect(demoStartApplies({ homepageSales: true, preview: true })).toBe(false);
    expect(demoStartApplies({ homepageSales: false })).toBe(false);
    expect(demoStartApplies({})).toBe(false);
  });
});

describe('demo-start URL helpers (Deno port and browser copy agree)', () => {
  test('normalizeDemoUrl mirrors the demo intake behavior', () => {
    expect(normalizeDemoUrl('acmeplumbing.com')).toBe('https://acmeplumbing.com');
    expect(normalizeDemoUrl('http://acmeplumbing.com/')).toBe('https://acmeplumbing.com');
    expect(normalizeDemoUrl(' "www.acmeplumbing.com" ')).toBe('https://www.acmeplumbing.com');
    expect(normalizeDemoUrl('acmeplumbing.com/services')).toBe('https://acmeplumbing.com/services');
  });
  test('looksLikeDomain accepts domains and rejects prose', () => {
    expect(looksLikeDomain('acmeplumbing.com')).toBe(true);
    expect(looksLikeDomain('www.acmeplumbing.com')).toBe(true);
    expect(looksLikeDomain('my shop')).toBe(false);
    expect(looksLikeDomain('acme')).toBe(false);
    expect(looksLikeDomain('')).toBe(false);
  });
  test('the src/lib copy behaves identically', () => {
    for (const sample of ['acmeplumbing.com', 'http://www.x-y.co.uk/', ' "shop.example.com" ']) {
      expect(clientNormalizeDemoUrl(sample)).toBe(normalizeDemoUrl(sample));
    }
    for (const sample of ['acmeplumbing.com', 'my shop', 'acme', '']) {
      expect(clientLooksLikeDomain(sample)).toBe(looksLikeDomain(sample));
    }
  });
  test('businessNameFromWebsiteUrl mirrors the intake: first host label, capitalized', () => {
    expect(businessNameFromWebsiteUrl('https://www.acme-plumbing.com')).toBe('Acme-plumbing');
    expect(businessNameFromWebsiteUrl('https://acmeplumbing.com')).toBe('Acmeplumbing');
    expect(businessNameFromWebsiteUrl('')).toBe('this business');
  });
});

describe('demo-start card from tool args', () => {
  test('model args win; captured contact fills the gaps', () => {
    const card = demoStartCardFromArgs(
      { websiteUrl: 'acmeplumbing.com', email: 'owner@acmeplumbing.com' },
      { name: 'Pat', email: 'pat@example.com' },
    );
    expect(card).toEqual({ websiteUrl: 'acmeplumbing.com', name: 'Pat', email: 'owner@acmeplumbing.com' });
  });
  test('missing args degrade to empty fields, never invented data', () => {
    expect(demoStartCardFromArgs(undefined, null)).toEqual({ websiteUrl: '', name: '', email: '' });
    expect(demoStartCardFromArgs({ websiteUrl: 42, name: null }, null)).toEqual({ websiteUrl: '', name: '', email: '' });
  });
});

describe('demo-start entry path', () => {
  test('no email: scan only, no gate (nothing to send a code to)', () => {
    expect(buildDemoSitePath({ leadId: 'lead-1', gate: false })).toBe('/demo-site?leadId=lead-1&scan=1');
  });
  test('email: the Verified Demo Gate engages exactly like the /demo form', () => {
    expect(buildDemoSitePath({ leadId: 'lead-1', gate: true, callerName: 'Pat Lee', callerEmail: 'pat@example.com' }))
      .toBe('/demo-site?leadId=lead-1&scan=1&gate=1&gateChannel=email&callerName=Pat+Lee&callerEmail=pat%40example.com');
  });
});

function fakeWriters(overrides: Partial<DemoStartWriters> = {}): { writers: DemoStartWriters; calls: Record<string, unknown[]> } {
  const calls: Record<string, unknown[]> = { createLead: [], sendGateCode: [], invokeScan: [] };
  const writers: DemoStartWriters = {
    createLead: async (args) => { calls.createLead.push(args); return { data: 'lead-9', error: null }; },
    sendGateCode: async (leadId, email) => { calls.sendGateCode.push([leadId, email]); return { ok: true }; },
    invokeScan: async (leadId, websiteUrl, businessName) => { calls.invokeScan.push([leadId, websiteUrl, businessName]); return { ok: true }; },
    ...overrides,
  };
  return { writers, calls };
}

describe('demo-start orchestration', () => {
  test('happy path with email: lead via the demo RPC shape, gate code sent, scan invoked, gated path', async () => {
    const { writers, calls } = fakeWriters();
    const result = await startDemoForVisitor(writers, { websiteUrl: 'acme-plumbing.com', name: 'Pat Lee', email: 'pat@example.com' });
    expect(result).toEqual({
      ok: true,
      leadId: 'lead-9',
      websiteUrl: 'https://acme-plumbing.com',
      gate: true,
      scanInvoked: true,
      demoPath: '/demo-site?leadId=lead-9&scan=1&gate=1&gateChannel=email&callerName=Pat+Lee&callerEmail=pat%40example.com',
    });
    // The intake's RPC argument shape — no phone on the voice path,
    // scan_status pending because the scan runs as its own stage.
    expect(calls.createLead).toEqual([{
      _business_name: 'Acme-plumbing',
      _full_name: 'Pat Lee',
      _phone: null,
      _email: 'pat@example.com',
      _website_url: 'https://acme-plumbing.com',
      _niche: 'general',
      _secondary_url: null,
      _scan_status: 'pending',
    }]);
    expect(calls.sendGateCode).toEqual([['lead-9', 'pat@example.com']]);
    expect(calls.invokeScan).toEqual([['lead-9', 'https://acme-plumbing.com', 'Acme-plumbing']]);
  });

  test('no email: no gate code is attempted and the path is ungated', async () => {
    const { writers, calls } = fakeWriters();
    const result = await startDemoForVisitor(writers, { websiteUrl: 'acmeplumbing.com', name: '', email: '' });
    expect(result.ok).toBe(true);
    expect(calls.sendGateCode).toEqual([]);
    if (result.ok) {
      expect(result.gate).toBe(false);
      expect(result.demoPath).toBe('/demo-site?leadId=lead-9&scan=1');
    }
  });

  test('a bad address fails at validation before any writer runs', async () => {
    const { writers, calls } = fakeWriters();
    const result = await startDemoForVisitor(writers, { websiteUrl: 'my shop', name: '', email: '' });
    expect(result).toEqual({ ok: false, stage: 'validate' });
    expect(calls.createLead).toEqual([]);
  });

  test('a lead-creation error is an honest failure, nothing downstream runs', async () => {
    const { writers, calls } = fakeWriters({
      createLead: async (args) => { calls.createLead.push(args); return { data: null, error: { message: 'boom' } }; },
    });
    const result = await startDemoForVisitor(writers, { websiteUrl: 'acmeplumbing.com', name: '', email: '' });
    expect(result).toEqual({ ok: false, stage: 'create' });
    expect(calls.sendGateCode).toEqual([]);
    expect(calls.invokeScan).toEqual([]);
  });

  test('a failed scan invoke still reports a started demo (the page retries the scan itself)', async () => {
    const { writers } = fakeWriters({ invokeScan: async () => ({ ok: false }) });
    const result = await startDemoForVisitor(writers, { websiteUrl: 'acmeplumbing.com', name: '', email: '' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.scanInvoked).toBe(false);
  });

  test('a failed gate-code send still starts the demo but drops the gate (no code was delivered)', async () => {
    const { writers } = fakeWriters({ sendGateCode: async () => ({ ok: false }) });
    const result = await startDemoForVisitor(writers, { websiteUrl: 'acmeplumbing.com', name: '', email: 'pat@example.com' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.gate).toBe(false);
      expect(result.demoPath).not.toContain('gate=1');
    }
  });
});

describe('demo-start model-facing responses', () => {
  test('the success response claims only what happened', () => {
    const started = demoStartToolSuccessResponse({ ok: true, leadId: 'l1', websiteUrl: 'https://a.com', demoPath: '/demo-site?leadId=l1&scan=1', gate: true, scanInvoked: true });
    expect(started.started).toBe(true);
    expect(started.status).toBe('building');
    expect(started.demoPath).toBe('/demo-site?leadId=l1&scan=1');
    expect(started.instruction).toContain('really started');
    // One-tap start (2026-11-23): the demo opens in a new tab from
    // the confirm tap itself; the card remains only as the backup.
    expect(started.instruction).toContain('opening in a new tab');
    expect(started.instruction).toContain('card on their screen also opens the demo');
    expect(started.instruction).toContain('Do not invent progress updates');
  });
  test('the failure response forbids claiming a build and routes to the honest fallback', () => {
    expect(DEMO_START_FALLBACK_TOOL_RESPONSE.started).toBe(false);
    expect(DEMO_START_FALLBACK_TOOL_RESPONSE.instruction).toContain('Do not claim a demo is building');
    expect(DEMO_START_FALLBACK_TOOL_RESPONSE.instruction).toContain('Try it on your website — free');
    expect(DEMO_START_CLIENT_ERROR).toBeTruthy();
  });
  test('the declaration names the tool and requires the website address', () => {
    expect(DEMO_START_TOOL_NAME).toBe('request_demo_start');
    expect(DEMO_START_TOOL_DECLARATION.name).toBe(DEMO_START_TOOL_NAME);
    expect(DEMO_START_TOOL_DECLARATION.parameters.required).toEqual(['websiteUrl']);
    expect(DEMO_START_TOOL_DECLARATION.description).toContain('narrate ONLY what the result says');
  });
});
