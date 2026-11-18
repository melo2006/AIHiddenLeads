import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Phase 2 wiring pins (multi-tenant / reseller design, 2026-11-18).
// Source-level assertions for the server-side guarantees that unit
// tests of the pure logic can't prove: hierarchy enforcement lives in
// the edge functions (not the UI), caps are checked at session
// creation in gemini-session, and the locked playout engine is
// untouched by this phase.

const root = path.resolve(__dirname, '../..');
const read = (p: string) => readFileSync(path.join(root, p), 'utf8');

describe('voice-agents Phase 2 actions', () => {
  const src = read('supabase/functions/voice-agents/index.ts');

  it('exposes the tenancy actions', () => {
    for (const action of ['myTenancy', 'tenants', 'updateTenant', 'rateCard', 'saveRateCard', 'tenantClients', 'resellerConsole', 'inviteCreate', 'inviteList', 'inviteRevoke', 'invitePreview', 'inviteAccept', 'saveBranding']) {
      expect(src).toContain(`'${action}'`);
    }
  });

  it('scopes tenant clients to a server-resolved subtree', () => {
    expect(src).toContain('subtreeOrgIds(lite,root.id)');
    expect(src).toContain('buildClients(db,scope)');
    // The reseller path resolves managed resellers from memberships.
    expect(src).toContain('managedResellerOrgs(orgs,memberships)');
  });

  it('the rate card (with costs) is admin-gated; tenants get tenantPriceView only', () => {
    const rateCardBlock = src.slice(src.indexOf("body.action==='rateCard'"), src.indexOf("body.action==='saveRateCard'"));
    expect(rateCardBlock).toContain('Administrator access required');
    expect(src).toContain('prices:tenantPriceView(card)');
  });

  it('invites store only the token hash and always return the link', () => {
    expect(src).toContain('token_hash:await sha256(token)');
    expect(src).toContain('inviteUrl:url,emailSent');
    // The raw token is never written to a database row field.
    expect(src).not.toMatch(/insert\(\{[^}]*token:/);
  });

  it('client invites enforce branding-first and the max-clients cap', () => {
    expect(src).toContain("brandingComplete({logoUrl:inviterOrg.logo_url})");
    expect(src).toContain("evaluateCaps(limits,{minutes:0,spendUsd:0,demoSpendUsd:0,clientCount:childCount}).clients==='blocked'");
  });

  it('accepting an invite requires the signed-in email to match', () => {
    expect(src).toContain("(user.email || '').toLowerCase()!==String(inv.email).toLowerCase()");
  });

  it('the role ladder replaced editor-only membership checks', () => {
    expect(src).toContain(".in('role',WORK_ROLES)");
    expect(src).not.toContain(".eq('role','editor')");
  });
});

describe('gemini-session tenant caps', () => {
  const src = read('supabase/functions/gemini-session/index.ts');

  it('checks caps at session creation, before authorization', () => {
    const capsAt = src.indexOf('TENANT CAPS');
    const rpcAt = src.indexOf("db.rpc('authorize_gemini_session'");
    expect(capsAt).toBeGreaterThan(-1);
    expect(rpcAt).toBeGreaterThan(capsAt);
    expect(src).toContain('sessionGate(limits,totals,{demo:isDemo})');
  });

  it('suspension blocks and the check is failure-open', () => {
    expect(src).toContain("status==='suspended'");
    expect(src).toContain('tenant caps check failed (allowing session)');
  });
});

describe('locked playout engine untouched', () => {
  it('Phase 2 did not modify the playout module', () => {
    // The guard is structural: nothing in the Phase 2 server code
    // references the playout engine at all.
    const va = read('supabase/functions/voice-agents/index.ts');
    const gs = read('supabase/functions/gemini-session/index.ts');
    expect(va).not.toContain('blobElementPlayout');
    expect(gs).not.toContain('blobElementPlayout');
  });
});
