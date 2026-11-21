// @vitest-environment node
// PAGE KNOWLEDGE (homepage-test item 6, 2026-11-21): the seeded
// homepage knowledge gains (a) the /plans page's per-plan feature
// lines verbatim from the page itself, (b) the page→intent map, and
// (c) the grounded prospect-targeting explainer. The verbatim lines
// are pinned against the page's own source
// (src/components/landing/PricingSection.tsx FEATURES.en) so the
// knowledge can never drift from what the visitor is reading.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  HOMEPAGE_KNOWLEDGE,
  HOMEPAGE_SALES_PROMPT,
  PAGE_INTENT_MAP,
  PLANS_PAGE_FEATURES,
  PROSPECT_TARGETING,
} from '../../supabase/functions/_shared/homepage-knowledge';

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

describe('plans page feature lines — verbatim from the page', () => {
  const pricingSection = read('src/components/landing/PricingSection.tsx');

  it('every English feature line on the /plans page appears word-for-word in the knowledge', () => {
    // Pull the FEATURES.en block out of the page source and check
    // each quoted line against the seeded knowledge text.
    const enStart = pricingSection.indexOf('en: {');
    const enEnd = pricingSection.indexOf('"pt-BR"', enStart);
    const enBlock = pricingSection.slice(enStart, enEnd);
    const lines = [...enBlock.matchAll(/"([^"\n]{12,})"/g)].map(m => m[1]);
    expect(lines.length).toBeGreaterThanOrEqual(30);
    for (const line of lines) {
      expect(PLANS_PAGE_FEATURES, `missing verbatim line: ${line}`).toContain(line);
      expect(HOMEPAGE_KNOWLEDGE).toContain(line);
    }
  });

  it('the block is framed as the plans page’s own lines', () => {
    expect(PLANS_PAGE_FEATURES).toContain("WHAT EACH PLAN'S CARD SAYS, LINE FOR LINE");
    expect(PLANS_PAGE_FEATURES).toContain('Premium ($99/month)');
    expect(PLANS_PAGE_FEATURES).toContain('Professional ($199/month)');
    expect(PLANS_PAGE_FEATURES).toContain('Platinum ($349/month)');
    expect(HOMEPAGE_KNOWLEDGE).toContain(PLANS_PAGE_FEATURES);
  });
});

describe('page → intent map', () => {
  it('covers home, plans, demo, realtors and setup, each with its one next step', () => {
    for (const page of ['The homepage (/)', 'The plans page (/plans)', 'The free demo page (/demo)', 'The realtors page (/agents/realtors)', 'The setup wizard (/setup)']) {
      expect(PAGE_INTENT_MAP).toContain(page);
    }
    expect(PAGE_INTENT_MAP).toContain('recommend ONE plan from their numbers');
    expect(PAGE_INTENT_MAP).toContain('referral-partner prospects, never buyer or seller lists');
    expect(PAGE_INTENT_MAP).toContain('never recite this map aloud');
    expect(HOMEPAGE_KNOWLEDGE).toContain(PAGE_INTENT_MAP);
  });
});

describe('prospect targeting explainer — grounded, with the qualifier attached', () => {
  it('describes the setup-defined profile matched from public sources', () => {
    expect(PROSPECT_TARGETING).toContain('defines their ideal customer WITH us during setup');
    expect(PROSPECT_TARGETING).toContain('public sources');
    expect(PROSPECT_TARGETING).toContain('weekly batches');
    expect(HOMEPAGE_KNOWLEDGE).toContain(PROSPECT_TARGETING);
  });

  it('carries the no-guaranteed-count qualifier and the honesty limits', () => {
    expect(PROSPECT_TARGETING).toContain('no specific count is guaranteed');
    expect(PROSPECT_TARGETING).toContain('never promise that every record carries a verified decision-maker email and phone');
    expect(PROSPECT_TARGETING).toContain('We never buy private data');
  });

  it('invents no new ICP: sectors and areas are the ones the existing knowledge already names', () => {
    // The pre-existing knowledge already said: target by sector and
    // region with available contact evidence (B2B ADVANTAGES) and by
    // business type, location and opportunity (Hidden Lead
    // Generation). The explainer must stay inside that vocabulary.
    expect(HOMEPAGE_SALES_PROMPT).toContain('Target by sector and region with available contact evidence');
    expect(PROSPECT_TARGETING).toContain('their sector or trade');
    expect(PROSPECT_TARGETING).toContain('the area they serve');
  });
});
