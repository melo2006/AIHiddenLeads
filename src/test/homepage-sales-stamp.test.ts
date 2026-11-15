// @vitest-environment node
import { describe, expect, test } from 'vitest';
import {
  HOMEPAGE_GREETING,
  HOMEPAGE_GREETING_VARIANTS,
  HOMEPAGE_SALES_LAYER,
  stampHomepageSales,
} from '../../supabase/functions/_shared/homepage-knowledge';
import { NAME_ASK_SENTENCE } from '../../supabase/functions/_shared/team-intro';

describe('homepage greeting rotation (owner-approved 2026-11-15)', () => {
  test('three variants; A is the canonical greeting, byte-identical', () => {
    expect(HOMEPAGE_GREETING_VARIANTS).toHaveLength(3);
    expect(HOMEPAGE_GREETING_VARIANTS[0]).toBe(HOMEPAGE_GREETING);
  });

  test('every variant ends at the name ask (team-intro deferral keeps working)', () => {
    for (const greeting of HOMEPAGE_GREETING_VARIANTS) {
      expect(greeting.trimEnd().endsWith(NAME_ASK_SENTENCE)).toBe(true);
    }
  });

  test('each variant carries exactly its own approved statistic', () => {
    expect(HOMEPAGE_GREETING_VARIANTS[0]).toContain('85% of callers who reach a business\'s voicemail don\'t call back');
    expect(HOMEPAGE_GREETING_VARIANTS[1]).toContain('78% said they had abandoned a business after a call went unanswered');
    expect(HOMEPAGE_GREETING_VARIANTS[1]).toContain('2025 survey of 1,000 U.S. consumers');
    expect(HOMEPAGE_GREETING_VARIANTS[2]).toContain('67% of callers hang up the moment they can\'t reach a real person');
  });

  test('the banned first-responder paraphrase of the 78% figure never appears', () => {
    for (const greeting of HOMEPAGE_GREETING_VARIANTS) {
      expect(greeting).not.toContain('answers first');
      expect(greeting).not.toContain('first agent who responds');
      expect(greeting).not.toContain('go with the business that answers');
    }
    expect(HOMEPAGE_SALES_LAYER).not.toContain('first-responder');
  });
});

describe('homepage sales stamp', () => {
  test('sets the rotation and appends the arc layer exactly once', () => {
    const config: Record<string, unknown> = { greeting: 'stored', greetings: ['stored'], systemPrompt: 'BASE PROMPT' };
    stampHomepageSales(config);
    expect(config.greeting).toBe(HOMEPAGE_GREETING_VARIANTS[0]);
    expect(config.greetings).toEqual([...HOMEPAGE_GREETING_VARIANTS]);
    expect(String(config.systemPrompt)).toContain('SALES CONVERSATION ARC');
    stampHomepageSales(config);
    expect(String(config.systemPrompt).split('SALES CONVERSATION ARC').length - 1).toBe(1);
  });
});

describe('sales conversation arc content (the draft Ron approved)', () => {
  test('pain discovery comes before price; the question bank is present', () => {
    expect(HOMEPAGE_SALES_LAYER).toContain('Who answers your calls today');
    expect(HOMEPAGE_SALES_LAYER).toContain('what happens to that call? Does it go to voicemail?');
    expect(HOMEPAGE_SALES_LAYER).toContain('What\'s one new customer worth to you');
    expect(HOMEPAGE_SALES_LAYER.indexOf('PAIN DISCOVERY')).toBeLessThan(HOMEPAGE_SALES_LAYER.indexOf('PRICE (only after the fit'));
  });

  test('price framing keeps the approved shape', () => {
    expect(HOMEPAGE_SALES_LAYER).toContain('$99 a month — 400 voice minutes');
    expect(HOMEPAGE_SALES_LAYER).toContain('FREE for the first month');
    expect(HOMEPAGE_SALES_LAYER).toContain('never present the plan as "$99 plus $79"');
    expect(HOMEPAGE_SALES_LAYER).toContain('no specific count is guaranteed');
  });

  test('silence protocol: one check-in, then the bridge, price disarm, easy question', () => {
    expect(HOMEPAGE_SALES_LAYER).toContain('Are you still there?');
    expect(HOMEPAGE_SALES_LAYER).toContain('never ask it a second time');
    expect(HOMEPAGE_SALES_LAYER).toContain('Surveys of businesses like yours tell us');
    expect(HOMEPAGE_SALES_LAYER).toContain('yes-or-no or either-or question');
  });

  test('implementation detail is gated to when they ask', () => {
    expect(HOMEPAGE_SALES_LAYER).toContain('15 to 30 minutes with Alex');
    expect(HOMEPAGE_SALES_LAYER).toContain('ONLY when they ask how implementation works');
    expect(HOMEPAGE_SALES_LAYER).toContain('a couple of hours to a couple of days');
  });

  test('scope: sales layer only, never in-simulation', () => {
    expect(HOMEPAGE_SALES_LAYER).toContain('SALES CONVERSATION ARC');
    expect(HOMEPAGE_SALES_LAYER).toContain('booking the setup call is the FLOOR');
  });
});
