// @vitest-environment node
import { describe, expect, test, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

import {
  INVITE_CODE_ALPHABET,
  INVITE_CODE_LENGTH,
  buildInvitePath,
  inviteLeadToDemoData,
  inviteSlugForWebsite,
  isGeneratedPlaceholderScreenshot,
  isInviteCode,
  isInviteLeadReady,
  normalizeInviteSlug,
  parseResolveInviteData,
} from '../lib/demoInvite';
import {
  INVITE_READY_SCAN_STATUSES as SERVER_READY_STATUSES,
  generateInviteCode,
  inviteSlugForWebsite as serverSlug,
  isInviteCode as serverIsCode,
  isInviteLeadReady as serverIsReady,
  normalizeInviteSlug as serverNormalizeSlug,
} from '../../supabase/functions/_shared/demo-invite';
import {
  DEMO_INVITE_GREETING,
  DEMO_INVITE_OPENING,
} from '../../supabase/functions/_shared/demo-sales';

describe('invite slug normalization', () => {
  test.each([
    ['https://www.durginelectric.com', 'durginelectric.com'],
    ['http://durginelectric.com/', 'durginelectric.com'],
    ['www.DurginElectric.com/services/repair', 'durginelectric.com'],
    ['durginelectric.com', 'durginelectric.com'],
    ['HTTPS://WWW.EXAMPLE-SHOP.CO.UK:8443/x?y=1#z', 'example-shop.co.uk'],
    ['https://sub.domain.example.com', 'sub.domain.example.com'],
    ['user:pass@durginelectric.com', 'durginelectric.com'],
    ['  durginelectric.com  ', 'durginelectric.com'],
  ])('%s -> %s', (input, expected) => {
    expect(inviteSlugForWebsite(input)).toBe(expected);
    expect(serverSlug(input)).toBe(expected);
  });

  test.each(['', '   ', 'notaurl', 'localhost', 'example', 'https://192.168.0.1/', 'https://foo.local/', 'https://exam ple.com'])(
    'invalid %j -> null',
    (input) => {
      expect(inviteSlugForWebsite(input)).toBeNull();
      expect(serverSlug(input)).toBeNull();
    },
  );

  test('path slugs must already be normalized', () => {
    expect(normalizeInviteSlug('durginelectric.com')).toBe('durginelectric.com');
    expect(normalizeInviteSlug('WWW.DurginElectric.com')).toBeNull();
    expect(normalizeInviteSlug('www.durginelectric.com')).toBeNull();
    expect(normalizeInviteSlug('https://durginelectric.com')).toBeNull();
    expect(normalizeInviteSlug('')).toBeNull();
    expect(serverNormalizeSlug('durginelectric.com')).toBe('durginelectric.com');
    expect(serverNormalizeSlug('www.durginelectric.com')).toBeNull();
  });
});

describe('invite code', () => {
  test('shape: 10 chars from the unambiguous alphabet', () => {
    expect(INVITE_CODE_LENGTH).toBe(10);
    expect(isInviteCode('k7x9p2m4qs')).toBe(true);
    expect(serverIsCode('k7x9p2m4qs')).toBe(true);
    for (const bad of ['k7x9p2m4q', 'k7x9p2m4qss', 'K7X9P2M4QS', 'l1i0oabcde', '', 'k7x9 p2m4q', 'k7x9p2m4q!']) {
      expect(isInviteCode(bad)).toBe(false);
      expect(serverIsCode(bad)).toBe(false);
    }
    expect(isInviteCode(null)).toBe(false);
    expect(isInviteCode(1234567890)).toBe(false);
  });

  test('generated codes always match the shape', () => {
    for (let i = 0; i < 200; i += 1) {
      const code = generateInviteCode();
      expect(code).toHaveLength(INVITE_CODE_LENGTH);
      expect([...code].every((ch) => INVITE_CODE_ALPHABET.includes(ch))).toBe(true);
      expect(isInviteCode(code)).toBe(true);
    }
  });

  test('link path stays short and readable — no query strings, no UTM tails', () => {
    expect(buildInvitePath('durginelectric.com', 'k7x9p2m4qs')).toBe('/demo/durginelectric.com/k7x9p2m4qs');
  });
});

describe('pre-build quality gate', () => {
  const ready = {
    scan_status: 'completed',
    website_content: 'x'.repeat(200),
    website_screenshot: 'https://example.com/shot.png',
  };

  test('ready matrix', () => {
    expect(isInviteLeadReady(ready)).toBe(true);
    expect(isInviteLeadReady({ ...ready, scan_status: 'enriched' })).toBe(true);
    expect(isInviteLeadReady({ ...ready, website_content: 'x'.repeat(5_000) })).toBe(true);
  });

  test('not-ready matrix', () => {
    expect(isInviteLeadReady({ ...ready, scan_status: 'failed' })).toBe(false);
    expect(isInviteLeadReady({ ...ready, scan_status: 'scanning' })).toBe(false);
    expect(isInviteLeadReady({ ...ready, scan_status: 'pending' })).toBe(false);
    expect(isInviteLeadReady({ ...ready, scan_status: null })).toBe(false);
    expect(isInviteLeadReady({ ...ready, website_content: 'x'.repeat(199) })).toBe(false);
    expect(isInviteLeadReady({ ...ready, website_content: '' })).toBe(false);
    expect(isInviteLeadReady({ ...ready, website_content: null })).toBe(false);
    expect(isInviteLeadReady({ ...ready, website_screenshot: null })).toBe(false);
    expect(isInviteLeadReady({ ...ready, website_screenshot: '' })).toBe(false);
    expect(isInviteLeadReady({ ...ready, website_screenshot: 'data:image/svg+xml;base64,PHN2Zz4=' })).toBe(false);
    expect(isInviteLeadReady({})).toBe(false);
  });

  test('generated placeholder detection matches the DemoSite signal', () => {
    expect(isGeneratedPlaceholderScreenshot('data:image/svg+xml;utf8,<svg/>')).toBe(true);
    expect(isGeneratedPlaceholderScreenshot('https://example.com/shot.png')).toBe(false);
    expect(isGeneratedPlaceholderScreenshot(null)).toBe(false);
    expect(isGeneratedPlaceholderScreenshot(undefined)).toBe(false);
  });

  test('client and server predicates agree', () => {
    const cases = [
      ready,
      { ...ready, scan_status: 'failed' },
      { ...ready, scan_status: 'enriched' },
      { ...ready, website_content: 'short' },
      { ...ready, website_screenshot: 'data:image/svg+xml;base64,x' },
      { ...ready, website_screenshot: null },
    ];
    for (const c of cases) expect(serverIsReady(c)).toBe(isInviteLeadReady(c));
    expect([...SERVER_READY_STATUSES].sort()).toEqual(['completed', 'enriched']);
  });
});

describe('resolve response parsing', () => {
  const lead = {
    id: 'a2cb5f16-4c77-481e-8c9a-d8519a3df40f',
    full_name: 'Office Manager',
    business_name: 'Durgin Electric',
    email: 'Office@durginelectric.com',
    phone: '970.704.9473',
    niche: 'general',
    website_url: 'www.durginelectric.com',
    website_screenshot: 'https://example.com/shot.png',
    website_title: 'Durgin Electric',
    website_description: 'Electricians in Carbondale, CO',
    website_content: 'x'.repeat(300),
    brand_colors: null,
    brand_logo: null,
    scan_status: 'enriched',
  };

  test('success maps lead + attribution', () => {
    const result = parseResolveInviteData({ ok: true, campaign: 'assoc-outreach-1', source: 'cold-email', lead });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.lead.id).toBe(lead.id);
      expect(result.campaign).toBe('assoc-outreach-1');
      expect(result.source).toBe('cold-email');
    }
  });

  test('failures stay typed, never throw', () => {
    expect(parseResolveInviteData({ ok: false, error: 'invite_not_found' })).toEqual({ ok: false, error: 'invite_not_found' });
    expect(parseResolveInviteData({ ok: false, error: 'demo_not_ready' })).toEqual({ ok: false, error: 'demo_not_ready' });
    expect(parseResolveInviteData(null)).toEqual({ ok: false, error: 'invite_failed' });
    expect(parseResolveInviteData('nope')).toEqual({ ok: false, error: 'invite_failed' });
    expect(parseResolveInviteData({ ok: true })).toEqual({ ok: false, error: 'invite_failed' });
    expect(parseResolveInviteData({ ok: true, lead: { id: '' } })).toEqual({ ok: false, error: 'invite_failed' });
    expect(parseResolveInviteData({ ok: false })).toEqual({ ok: false, error: 'invite_failed' });
  });

  test('inviteLeadToDemoData maps like the DemoSite lead merge', () => {
    const data = inviteLeadToDemoData(lead);
    expect(data.leadId).toBe(lead.id);
    expect(data.fullName).toBe('Office Manager');
    expect(data.businessName).toBe('Durgin Electric');
    expect(data.email).toBe('Office@durginelectric.com');
    expect(data.websiteUrl).toBe('www.durginelectric.com');
    expect(data.screenshot).toBe('https://example.com/shot.png');
    expect(data.websiteContent).toHaveLength(300);
    expect(data.scanStatus).toBe('enriched');
    expect(data.colors).toEqual({});
    expect(data.logo).toBe('');
  });
});

describe('invite opening copy (Aspen host phase)', () => {
  test('greeting: pre-built, no waiting, partner pitch + Sara intro; the spoken disclaimer is Sara\'s now (owner, 2026-11-09)', () => {
    expect(DEMO_INVITE_GREETING).toContain('{timeGreeting}');
    expect(DEMO_INVITE_GREETING).toContain('{visitorFirstName}');
    expect(DEMO_INVITE_GREETING).toContain('{businessName}');
    expect(DEMO_INVITE_GREETING).toContain('Aspen from AI Hidden Leads');
    expect(DEMO_INVITE_GREETING).toContain('already loaded on your website');
    expect(DEMO_INVITE_GREETING).toContain('no waiting');
    expect(DEMO_INVITE_GREETING).toContain('Thanks for accepting the invitation');
    expect(DEMO_INVITE_GREETING).toContain('your partner for growth');
    expect(DEMO_INVITE_GREETING).toContain('meet Sara');
    // The scripted not-touched lines moved OUT of Aspen's greeting —
    // Sara speaks the honesty note at the simulation entry (beat 4b).
    expect(DEMO_INVITE_GREETING).not.toContain('simulation layered over your website');
    expect(DEMO_INVITE_GREETING).not.toContain('has not been changed');
    expect(DEMO_INVITE_GREETING).not.toContain("haven't touched your website or your server");
    expect(DEMO_INVITE_GREETING).toContain('{nameConfirm}');
    expect(DEMO_INVITE_GREETING).not.toContain('being prepared');
    expect(DEMO_INVITE_GREETING).not.toContain('4-digit code');
  });

  test('opening: host phase before the simulation, pre-built honesty', () => {
    expect(DEMO_INVITE_OPENING).toContain('has not begun');
    expect(DEMO_INVITE_OPENING).toContain('personal email invitation');
    expect(DEMO_INVITE_OPENING).toContain('AHEAD of time');
    expect(DEMO_INVITE_OPENING).toContain('Never say the demo is being prepared');
    expect(DEMO_INVITE_OPENING).toContain('never ask them to fill in a form');
    expect(DEMO_INVITE_OPENING).toContain('simulation layered over their website');
    expect(DEMO_INVITE_OPENING).toContain('has not been changed');
    expect(DEMO_INVITE_OPENING).toContain('live AI talking with them right now');
  });

  test('opening: confirm name + website before loading', () => {
    expect(DEMO_INVITE_OPENING).toContain('Is this <name>?');
    expect(DEMO_INVITE_OPENING).toContain('confirm the website on screen is the right site');
    expect(DEMO_INVITE_OPENING).toContain('accept the correction gracefully');
    expect(DEMO_INVITE_OPENING).toContain('never treat contacts scraped from the website as the visitor');
  });

  test('opening: the continue step waits for the go-ahead', () => {
    expect(DEMO_INVITE_OPENING).toContain('Shall we continue?');
    expect(DEMO_INVITE_OPENING).toContain('wait for their go-ahead');
  });

  test('opening: follow-up contact never re-asks the held email', () => {
    expect(DEMO_INVITE_OPENING).toContain('We already hold the email address this invitation was sent to');
    expect(DEMO_INVITE_OPENING).toContain('NEVER ask the visitor to re-enter it');
    expect(DEMO_INVITE_OPENING).toContain('best address for the follow-up');
    expect(DEMO_INVITE_OPENING).toContain('forward this demo to a colleague, the owner, or another decision-maker');
    expect(DEMO_INVITE_OPENING).toContain('mobile number for the recap is welcome but optional');
    expect(DEMO_INVITE_OPENING).toContain('read it back spelled out');
    expect(DEMO_INVITE_OPENING).toContain('none of this is a condition of seeing the demo');
  });

  test('opening: simulation entry announcement and same-link return', () => {
    // Demo Script v2 (audit C4f): the invite opening now hands the doorway to
    // the SIMULATION ENTRY sequence instead of reciting the announcement
    // itself — the manager/pricing examples moved into SIMULATION_PROMPT's
    // announcement beat (pinned in demo-script-v2.test.ts).
    expect(DEMO_INVITE_OPENING).toContain('run the SIMULATION ENTRY sequence');
    expect(DEMO_INVITE_OPENING).toContain('stepping into simulation mode');
    expect(DEMO_INVITE_OPENING).toContain('act like a visitor to your own website');
    expect(DEMO_INVITE_OPENING).toContain('clear unfilled pause');
    expect(DEMO_INVITE_OPENING).toContain('this same personal link reopens their demo any time');
    expect(DEMO_INVITE_OPENING).toContain('never claim a real action succeeded without its result');
    expect(DEMO_INVITE_OPENING).toContain('anti-transfer rule');
    expect(DEMO_INVITE_OPENING).toContain('Set expectations, once');
    expect(DEMO_INVITE_OPENING).toContain('Alex, once');
    expect(DEMO_INVITE_GREETING).toContain('onboarding engineer, Alex');
  });
});

describe('invite arrival UX (autoplay-safe, one tap)', () => {
  // Source-level pins: the arrival pattern is assembled from the existing
  // three-stage widget + prewarm contract, so these assertions read the
  // real component sources rather than re-implementing them.
  const fs = require('node:fs') as typeof import('node:fs');
  const path = require('node:path') as typeof import('node:path');
  const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

  test('Stage 1 invite affordance: animated bubble + play overlay + "Hear Aspen" label', () => {
    const frame = read('components/FloatingPersonFrame.tsx');
    expect(frame).toContain('inviteArrival');
    expect(frame).toContain('Hear ${firstName');
    expect(frame).toContain('<Play');
    // The animated idle (beckon GIF) remains the bubble face.
    expect(frame).toContain('aspenIdleBeckon');
    // The generic label is untouched for non-invite surfaces.
    expect(frame).toContain("'Tap to talk'");
  });

  test('widget threads invite into the frame; session stays prewarmed-silent until the tap', () => {
    const widget = read('components/landing/demo-results/AspenDemoWidget.tsx');
    expect(widget).toContain('inviteArrival={!!invite}');
    // Prewarm mounts the session silently; auto-start fires only when expanded (the tap).
    expect(widget).toContain('prewarm={prewarm}');
    expect(widget).toContain('autoStart={expanded}');
    expect(widget).toContain('consentOnOpen={expanded}');
  });

  test('DemoSite passes invite=1 through and never engages the code gate for invites', () => {
    const site = read('pages/DemoSite.tsx');
    expect(site).toContain('searchParams.get("invite") === "1"');
    expect(site).toContain('invite={inviteRequested}');
  });
});
