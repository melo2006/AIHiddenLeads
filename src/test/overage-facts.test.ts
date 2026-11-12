// @vitest-environment node
// Browser-minutes overage pin (Handoff improvement batch, 2026-11-12).
//
// Forensic trigger: in Ron's live session Aspen quoted "20 cents per
// minute" for BROWSER voice minutes on the first ask, then hedged
// ("I'm not entirely sure") on the second. Source-of-truth sweep:
// NO per-minute overage rate for browser voice minutes exists
// anywhere in the repo (plan data, pricing UI, checkout, Stripe) —
// the 20¢ figure is scoped to additional VIDEO AVATAR minutes
// (homepage-knowledge HOMEPAGE_ADDONS), telephone usage is a
// separate 5¢/minute, and rollover is Ron-approved (2026-11-08) and
// already pinned in PLAN_FACTS_EXACT. So the pin states the sourced
// facts and the one consistent answer; it must never invent a rate.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BROWSER_MINUTES_OVERAGE_POLICY } from '../../supabase/functions/_shared/overage-facts';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

describe('BROWSER_MINUTES_OVERAGE_POLICY — the sourced facts', () => {
  it('states the included browser minutes per plan', () => {
    expect(BROWSER_MINUTES_OVERAGE_POLICY).toContain('400 a month on Premium');
    expect(BROWSER_MINUTES_OVERAGE_POLICY).toContain('1,200 on Professional');
    expect(BROWSER_MINUTES_OVERAGE_POLICY).toContain('2,500 on Platinum');
  });

  it('states the Ron-approved rollover policy (2026-11-08)', () => {
    expect(BROWSER_MINUTES_OVERAGE_POLICY).toContain('roll over month to month while the subscription stays active');
    expect(BROWSER_MINUTES_OVERAGE_POLICY).toContain('banked minutes expire after 90 days');
    expect(BROWSER_MINUTES_OVERAGE_POLICY).toContain('forfeited if the subscription ends');
  });

  it('forbids quoting any browser overage rate — none is published', () => {
    expect(BROWSER_MINUTES_OVERAGE_POLICY).toContain('no per-minute overage rate for browser voice minutes is published');
    expect(BROWSER_MINUTES_OVERAGE_POLICY).toContain('never quote one');
    expect(BROWSER_MINUTES_OVERAGE_POLICY).toContain('without first quoting a rate');
  });

  it('scopes the 20-cent figure to video avatar minutes only', () => {
    expect(BROWSER_MINUTES_OVERAGE_POLICY).toContain('applies ONLY to additional video avatar minutes');
    expect(BROWSER_MINUTES_OVERAGE_POLICY).toContain('never present it as the browser voice rate');
  });

  it('keeps telephone usage distinct at 5 cents/minute', () => {
    expect(BROWSER_MINUTES_OVERAGE_POLICY).toContain('Telephone usage is a separate allowance, billed at 5 cents/minute');
  });

  it('the fallback is one consistent honest answer, offered the same way every time', () => {
    expect(BROWSER_MINUTES_OVERAGE_POLICY).toContain('give the same answer every time');
    expect(BROWSER_MINUTES_OVERAGE_POLICY).toContain('sales specialist who can confirm it');
  });
});

describe('proxy wiring — homepage-sales sessions only', () => {
  const src = read('supabase/functions/gemini-live-proxy/index.ts');

  it('the block is gated on homepageSales and appended beside the transfer block', () => {
    expect(src).toContain("import { BROWSER_MINUTES_OVERAGE_POLICY } from '../_shared/overage-facts.ts'");
    expect(src).toContain('const overageBlock = config.homepageSales === true ? `\\n${BROWSER_MINUTES_OVERAGE_POLICY}` : \'\'');
    expect(src).toContain('${managerTransferBlock}${overageBlock}` }] }');
  });
});

describe('the wizard-close setup facts are no longer contradicted', () => {
  it('the sales action policy states self-service setup is live after a plan is chosen', () => {
    const demoSales = read('supabase/functions/_shared/demo-sales.ts');
    expect(demoSales).toContain('Self-service setup is live once a plan is chosen');
    expect(demoSales).toContain('6-step setup wizard');
    expect(demoSales).not.toContain('planned, not released');
  });

  it('the homepage closing guidance matches: wizard live, Alex guides, assisted setup offered', () => {
    const knowledge = read('supabase/functions/_shared/homepage-knowledge.ts');
    expect(knowledge).toContain('Guided self-service setup is live once a plan is chosen');
    expect(knowledge).not.toContain('planned, not released');
  });
});
