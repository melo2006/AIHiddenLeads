// @vitest-environment node
// Browser-minutes overage pin (Handoff improvement batch, 2026-11-12;
// browser rate wired 2026-11-12 on Ron's decision).
//
// Forensic trigger: in Ron's live session Aspen quoted "20 cents per
// minute" for BROWSER voice minutes on the first ask, then hedged
// ("I'm not entirely sure") on the second. At that time NO browser
// voice overage rate existed anywhere in the repo — the 20¢ figure
// was scoped to additional VIDEO AVATAR minutes (homepage-knowledge
// HOMEPAGE_ADDONS), telephone usage is a separate 5¢/minute, and
// rollover is Ron-approved (2026-11-08) and already pinned in
// PLAN_FACTS_EXACT. Ron then DECIDED the browser voice overage rate
// himself (2026-11-12): 20 cents per minute, quotable. These tests
// pin the quotable browser fact AND its separation from the avatar
// fact — same number, different source, never merged.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BROWSER_MINUTES_OVERAGE_POLICY,
  BROWSER_VOICE_OVERAGE_CENTS_PER_MINUTE,
} from '../../supabase/functions/_shared/overage-facts';

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

  it('carries the browser voice overage rate as its own sourced constant (Ron, 2026-11-12)', () => {
    expect(BROWSER_VOICE_OVERAGE_CENTS_PER_MINUTE).toBe(20);
    const facts = read('supabase/functions/_shared/overage-facts.ts');
    expect(facts).toContain("Source: Ron's decision, 2026-11-12");
    // The policy's browser figure is interpolated from the constant,
    // so the number Aspen quotes can never drift from the source.
    expect(BROWSER_MINUTES_OVERAGE_POLICY).toContain(
      `browser voice minutes beyond the included amount cost ${BROWSER_VOICE_OVERAGE_CENTS_PER_MINUTE} cents per minute`,
    );
  });

  it('states the browser rate cold: same answer every time, no hedging, no specialist deflection', () => {
    expect(BROWSER_MINUTES_OVERAGE_POLICY).toContain('give the same answer every time');
    expect(BROWSER_MINUTES_OVERAGE_POLICY).toContain('state that plainly, every time, without hedging');
    expect(BROWSER_MINUTES_OVERAGE_POLICY).toContain('without deflecting to a sales specialist');
    // The pre-decision no-quote language is gone for browser voice.
    expect(BROWSER_MINUTES_OVERAGE_POLICY).not.toContain('no per-minute overage rate for browser voice minutes is published');
    expect(BROWSER_MINUTES_OVERAGE_POLICY).not.toContain('never quote one');
    expect(BROWSER_MINUTES_OVERAGE_POLICY).not.toContain('without first quoting a rate');
    expect(BROWSER_MINUTES_OVERAGE_POLICY).not.toContain('sales specialist who can confirm it');
  });

  it('keeps the video avatar rate a separate fact, sourced from HOMEPAGE_ADDONS', () => {
    expect(BROWSER_MINUTES_OVERAGE_POLICY).toContain('additional video avatar minutes beyond the included video minutes');
    expect(BROWSER_MINUTES_OVERAGE_POLICY).toContain('the same price, but a different allowance');
    expect(BROWSER_MINUTES_OVERAGE_POLICY).toContain('never mix the allowances up');
    // The avatar figure's own source of truth still carries it,
    // independently of the browser constant.
    const knowledge = read('supabase/functions/_shared/homepage-knowledge.ts');
    expect(knowledge).toContain('additional video avatar minutes beyond the included amount cost 20 cents/minute');
  });

  it('keeps telephone usage distinct at 5 cents/minute', () => {
    expect(BROWSER_MINUTES_OVERAGE_POLICY).toContain('telephone usage is a separate allowance, billed at 5 cents/minute');
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
