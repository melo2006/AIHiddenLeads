import { describe, expect, it } from 'vitest';
import {
  strongestRole, roleSatisfies, subtreeOrgIds, childOrgIds, scopeIncludes, scopeCanManageOrg,
  normalizeLimits, validateLimitsInput, featureEnabled, capState, evaluateCaps, sessionGate,
  inviteGrantRole, inviteStatusAt, validateBrandingInput, initialsFor, placeholderLogoSvg,
  brandingComplete, EMPTY_LIMITS, type TenantLimits,
} from '../../supabase/functions/_shared/tenancy';

// Tenancy pure logic (multi-tenant / reseller design Phase 2,
// 2026-11-18): the role ladder, subtree scoping, limits and cap
// evaluation shared by the edge functions and the browser. The server
// re-makes every decision in this file from real membership rows —
// these tests pin the rules those decisions follow.

const orgs = [
  { id: 'platform', parentOrganizationId: null },
  { id: 'reseller-a', parentOrganizationId: null },
  { id: 'client-a1', parentOrganizationId: 'reseller-a' },
  { id: 'client-a2', parentOrganizationId: 'reseller-a' },
  { id: 'reseller-b', parentOrganizationId: null },
  { id: 'client-b1', parentOrganizationId: 'reseller-b' },
  { id: 'direct-1', parentOrganizationId: null },
];

describe('role ladder', () => {
  it('ranks owner > admin > editor > viewer', () => {
    expect(roleSatisfies('owner', 'admin')).toBe(true);
    expect(roleSatisfies('admin', 'editor')).toBe(true);
    expect(roleSatisfies('editor', 'editor')).toBe(true);
    expect(roleSatisfies('viewer', 'editor')).toBe(false);
    expect(roleSatisfies('editor', 'owner')).toBe(false);
    expect(roleSatisfies('bogus', 'viewer')).toBe(false);
    expect(roleSatisfies(null, 'viewer')).toBe(false);
  });

  it('picks the strongest role and ignores junk', () => {
    expect(strongestRole(['viewer', 'admin', 'editor'])).toBe('admin');
    expect(strongestRole(['editor'])).toBe('editor');
    expect(strongestRole(['nope', 42])).toBe(null);
    expect(strongestRole([])).toBe(null);
  });
});

describe('subtree scoping', () => {
  it('collects a reseller subtree and nothing sideways', () => {
    const ids = subtreeOrgIds(orgs, 'reseller-a');
    expect([...ids].sort()).toEqual(['client-a1', 'client-a2', 'reseller-a']);
    expect(ids.has('client-b1')).toBe(false);
    expect(ids.has('reseller-b')).toBe(false);
  });

  it('childOrgIds lists direct clients only', () => {
    expect(childOrgIds(orgs, 'reseller-a').sort()).toEqual(['client-a1', 'client-a2']);
    expect(childOrgIds(orgs, 'direct-1')).toEqual([]);
  });

  it('scopeIncludes: platform sees all, tenant sees only its subtree', () => {
    const tenant = { kind: 'tenant' as const, rootOrgId: 'reseller-a', orgIds: subtreeOrgIds(orgs, 'reseller-a'), role: 'owner' as const };
    expect(scopeIncludes({ kind: 'platform' }, 'client-b1')).toBe(true);
    expect(scopeIncludes(tenant, 'client-a1')).toBe(true);
    expect(scopeIncludes(tenant, 'reseller-a')).toBe(true);
    expect(scopeIncludes(tenant, 'client-b1')).toBe(false);
    expect(scopeIncludes(tenant, 'direct-1')).toBe(false);
    expect(scopeIncludes({ kind: 'none' }, 'client-a1')).toBe(false);
    expect(scopeIncludes(tenant, null)).toBe(false);
  });

  it('scopeCanManageOrg: only the root org, only with a manage role', () => {
    const owner = { kind: 'tenant' as const, rootOrgId: 'reseller-a', orgIds: subtreeOrgIds(orgs, 'reseller-a'), role: 'owner' as const };
    const editor = { ...owner, role: 'editor' as const };
    expect(scopeCanManageOrg(owner, 'reseller-a')).toBe(true);
    expect(scopeCanManageOrg(owner, 'client-a1')).toBe(false); // a client's own branding is the client's
    expect(scopeCanManageOrg(editor, 'reseller-a')).toBe(false);
    expect(scopeCanManageOrg({ kind: 'platform' }, 'client-a1')).toBe(true);
  });
});

describe('limits normalization + validation', () => {
  it('empty/absent limits mean unlimited with every feature on', () => {
    const l = normalizeLimits({});
    expect(l).toEqual(EMPTY_LIMITS);
    expect(featureEnabled(l, 'videoAvatar')).toBe(true);
    expect(normalizeLimits(null)).toEqual(EMPTY_LIMITS);
    expect(normalizeLimits('junk')).toEqual(EMPTY_LIMITS);
  });

  it('keeps sane values, drops junk, only explicit false disables a feature', () => {
    const l = normalizeLimits({ maxClients: 25.9, minutesPool: 1000, demoBudgetUsd: -5, features: { videoAvatar: false, sms: 'yes', bogus: false } });
    expect(l.maxClients).toBe(25);
    expect(l.minutesPool).toBe(1000);
    expect(l.demoBudgetUsd).toBe(null); // negative is junk on read → unlimited, never a surprise block
    expect(l.features).toEqual({ videoAvatar: false });
    expect(featureEnabled(l, 'videoAvatar')).toBe(false);
    expect(featureEnabled(l, 'sms')).toBe(true);
  });

  it('validateLimitsInput rejects bad writes instead of nulling them', () => {
    expect('error' in validateLimitsInput({ minutesPool: -1 })).toBe(true);
    expect('error' in validateLimitsInput({ features: { nope: true } })).toBe(true);
    expect('error' in validateLimitsInput({ features: { sms: 'off' } })).toBe(true);
    const ok = validateLimitsInput({ maxClients: 10, features: { leadGen: false } });
    expect('limits' in ok && ok.limits.maxClients).toBe(10);
  });
});

describe('cap evaluation — warn at 80%, hard stop at 100% (§8 decision 4)', () => {
  it('capState bands', () => {
    expect(capState(0, null)).toBe('unlimited');
    expect(capState(79, 100)).toBe('ok');
    expect(capState(80, 100)).toBe('warning');
    expect(capState(99.9, 100)).toBe('warning');
    expect(capState(100, 100)).toBe('blocked');
    expect(capState(150, 100)).toBe('blocked');
  });

  const limits: TenantLimits = { maxClients: 2, minutesPool: 100, demoBudgetUsd: 50, monthlySpendCapUsd: 200, features: {} };

  it('evaluateCaps reports each cap and the first blocker', () => {
    const e = evaluateCaps(limits, { minutes: 85, spendUsd: 10, demoSpendUsd: 10, clientCount: 1 });
    expect(e.minutes).toBe('warning');
    expect(e.blocked).toBe(false);
    const b = evaluateCaps(limits, { minutes: 100, spendUsd: 10, demoSpendUsd: 10, clientCount: 1 });
    expect(b.blocked).toBe(true);
    expect(b.blockedBy).toBe('minutes');
    const c = evaluateCaps(limits, { minutes: 0, spendUsd: 0, demoSpendUsd: 0, clientCount: 2 });
    expect(c.clients).toBe('blocked');
    expect(c.blockedBy).toBe('clients');
  });

  it('sessionGate: demo sessions answer to the demo budget, others do not', () => {
    const usage = { minutes: 10, spendUsd: 10, demoSpendUsd: 50, clientCount: 0 };
    expect(sessionGate(limits, usage, { demo: false })).toEqual({ allowed: true });
    const demo = sessionGate(limits, usage, { demo: true });
    expect(demo.allowed).toBe(false);
    expect((demo as { blockedBy?: string }).blockedBy).toBe('demoSpend');
    const spend = sessionGate(limits, { ...usage, spendUsd: 200, demoSpendUsd: 0 }, { demo: false });
    expect(spend.allowed).toBe(false);
    expect((spend as { blockedBy?: string }).blockedBy).toBe('spend');
  });
});

describe('invites', () => {
  it('grant roles: reseller/client invitees own their new org; staff never own', () => {
    expect(inviteGrantRole('reseller')).toBe('owner');
    expect(inviteGrantRole('client')).toBe('owner');
    expect(inviteGrantRole('staff', 'admin')).toBe('admin');
    expect(inviteGrantRole('staff', 'owner')).toBe('editor');
    expect(inviteGrantRole('staff', undefined)).toBe('editor');
    expect(inviteGrantRole('staff', 'bogus')).toBe('editor');
  });

  it('a pending invite past its expiry reads as expired', () => {
    const past = new Date(Date.now() - 1000).toISOString();
    const future = new Date(Date.now() + 60000).toISOString();
    expect(inviteStatusAt({ status: 'pending', expires_at: past })).toBe('expired');
    expect(inviteStatusAt({ status: 'pending', expires_at: future })).toBe('pending');
    expect(inviteStatusAt({ status: 'accepted', expires_at: past })).toBe('accepted');
    expect(inviteStatusAt({ status: 'revoked', expires_at: future })).toBe('revoked');
  });
});

describe('branding', () => {
  it('validates slogan length, email shape and hex color', () => {
    expect('error' in validateBrandingInput({ slogan: 'x'.repeat(81) })).toBe(true);
    expect('branding' in validateBrandingInput({ slogan: 'x'.repeat(80) })).toBe(true);
    expect('error' in validateBrandingInput({ supportEmail: 'not-an-email' })).toBe(true);
    expect('error' in validateBrandingInput({ brandColor: 'blue' })).toBe(true);
    const ok = validateBrandingInput({ name: ' B2 ', slogan: ' We answer ', supportEmail: 'a@b.co', brandColor: '#10B981', logoUrl: 'https://x.supabase.co/storage/v1/object/public/tenant-branding/org/logo.png' });
    expect('branding' in ok && ok.branding).toMatchObject({ name: 'B2', slogan: 'We answer', brandColor: '#10b981' });
  });

  it('initials and the generated placeholder mark', () => {
    expect(initialsFor('B2 Tecnologia')).toBe('BT');
    expect(initialsFor('Acme')).toBe('AC');
    expect(initialsFor('')).toBe('?');
    const svg = placeholderLogoSvg('B2 Tecnologia', '#0ea5e9');
    expect(svg).toContain('#0ea5e9');
    expect(svg).toContain('>BT<');
    expect(placeholderLogoSvg('X', 'junk')).toContain('#10b981'); // bad color falls back
  });

  it('branding is complete only once a logo exists (Phase 1 rule)', () => {
    expect(brandingComplete({ logoUrl: null })).toBe(false);
    expect(brandingComplete({ logoUrl: 'https://x/logo.png' })).toBe(true);
    expect(brandingComplete(null)).toBe(false);
  });
});
