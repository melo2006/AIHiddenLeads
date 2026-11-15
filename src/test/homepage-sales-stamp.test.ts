// @vitest-environment node
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  HOMEPAGE_GREETING,
  HOMEPAGE_GREETING_FOLLOW_UP_BEATS,
  HOMEPAGE_GREETING_VARIANTS,
  HOMEPAGE_KNOWLEDGE,
  HOMEPAGE_OPENING_PRIORITY,
  HOMEPAGE_SALES_LAYER,
  TEAM_FACTS,
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

describe('Publish #67 extension — homepage opener restructured (Ron 2026-11-15)', () => {
  const words = (s: string) => s.trim().split(/\s+/).length;

  test('every variant is a SHORT first segment (the 15-30 second bound, Ron 2026-11-15)', () => {
    for (const greeting of HOMEPAGE_GREETING_VARIANTS) {
      expect(words(greeting)).toBeLessThanOrEqual(55);
      expect(words(greeting)).toBeGreaterThanOrEqual(30);
    }
  });

  test('each segment carries ONLY its own statistic — the other two never appear', () => {
    expect(HOMEPAGE_GREETING_VARIANTS[0]).not.toContain('78%');
    expect(HOMEPAGE_GREETING_VARIANTS[0]).not.toContain('67%');
    expect(HOMEPAGE_GREETING_VARIANTS[1]).not.toContain('85%');
    expect(HOMEPAGE_GREETING_VARIANTS[1]).not.toContain('67%');
    expect(HOMEPAGE_GREETING_VARIANTS[2]).not.toContain('85%');
    expect(HOMEPAGE_GREETING_VARIANTS[2]).not.toContain('78%');
  });

  test('the rest of each approved opener survives verbatim as follow-up beats', () => {
    expect(HOMEPAGE_GREETING_FOLLOW_UP_BEATS).toHaveLength(3);
    for (const beats of HOMEPAGE_GREETING_FOLLOW_UP_BEATS) expect(beats).toHaveLength(2);
    const [a, b, c] = HOMEPAGE_GREETING_FOLLOW_UP_BEATS;
    expect(a[0]).toContain('partner for finding the leads you\'re already losing: the hidden ones');
    expect(a[1]).toContain('live video as your spokesperson');
    expect(a[1]).toContain('capturing leads around the clock');
    expect(b[0]).toContain('That\'s the problem we solve');
    expect(b[0]).toContain('transfer straight to you, with a summary of what they need before you pick up');
    expect(b[1]).toContain('like a real spokesperson standing on your page');
    expect(c[0]).toContain('We make sure that never happens to you');
    expect(c[0]).toContain('capture the leads you\'d otherwise never know you lost');
    expect(c[1]).toContain('watching me say this, live on video');
    // No beat carries a statistic — the segment's figure is the opener's only one.
    for (const beats of HOMEPAGE_GREETING_FOLLOW_UP_BEATS) {
      for (const beat of beats) expect(beat).not.toMatch(/\d+%/);
    }
  });

  test('opening priority delivers the beats one per turn, visitor first, and quotes them verbatim', () => {
    expect(HOMEPAGE_OPENING_PRIORITY).toContain('only the opening\'s FIRST SHORT SEGMENT');
    expect(HOMEPAGE_OPENING_PRIORITY).not.toContain('complete first turn');
    expect(HOMEPAGE_OPENING_PRIORITY).toContain('ONE beat per turn');
    expect(HOMEPAGE_OPENING_PRIORITY).toContain('never resume a half-finished beat mid-sentence');
    expect(HOMEPAGE_OPENING_PRIORITY).toContain('answer THAT first');
    expect(HOMEPAGE_OPENING_PRIORITY).toContain('exactly ONE statistic');
    // The meet-the-team show still goes first on team-intro sessions.
    expect(HOMEPAGE_OPENING_PRIORITY).toContain('meet-the-team introduction, the show comes first');
    // A non-rotation opening (realtor landing, stored) earns no beats here.
    expect(HOMEPAGE_OPENING_PRIORITY).toContain('has no beats in this block');
    for (const beats of HOMEPAGE_GREETING_FOLLOW_UP_BEATS) {
      for (const beat of beats) expect(HOMEPAGE_OPENING_PRIORITY).toContain(beat);
    }
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
    expect(HOMEPAGE_SALES_LAYER).toContain('ONLY when they ask a follow-up about what is involved');
    expect(HOMEPAGE_SALES_LAYER).toContain('a couple of hours to a couple of days');
  });

  test('scope: sales layer only, never in-simulation', () => {
    expect(HOMEPAGE_SALES_LAYER).toContain('SALES CONVERSATION ARC');
    expect(HOMEPAGE_SALES_LAYER).toContain('booking the setup call is the FLOOR');
  });
});

describe('Publish #61 fixes (live-test defects, 2026-11-15)', () => {
  test('the silence bridge statistic is pinned to the 85% line — no invented figures', () => {
    // The first live bridge improvised "69%". The bridge may now use
    // exactly one figure, in exactly this framing.
    expect(HOMEPAGE_SALES_LAYER).toContain('Surveys of businesses like yours tell us that 85% of callers who reach a business\'s voicemail don\'t call back');
    expect(HOMEPAGE_SALES_LAYER).toContain('NEVER invent, blend, round or substitute a statistic');
    const proxy = readFileSync(new URL('../../supabase/functions/gemini-live-proxy/index.ts', import.meta.url), 'utf8');
    expect(proxy).toContain('That 85% figure is the ONLY percentage or statistic you may use in this turn');
  });

  test('setup-time questions get the short answer first (first-answer rule)', () => {
    expect(HOMEPAGE_SALES_LAYER).toContain('FIRST-ANSWER RULE');
    expect(HOMEPAGE_SALES_LAYER).toContain('Never lead with the long version');
  });

  test('no stale "few hours" setup claims remain in the code reference', () => {
    // The stored snapshots carried three of these; the code reference
    // carried two (TEAM_FACTS + HOMEPAGE_KNOWLEDGE). The snapshot fix
    // is migration 20261115020000; the code must never re-seed them.
    expect(TEAM_FACTS).not.toContain('few hours');
    expect(HOMEPAGE_KNOWLEDGE).not.toContain('few hours');
    expect(TEAM_FACTS).toContain('15 to 30 minutes');
    expect(HOMEPAGE_KNOWLEDGE).toContain('15 to 30 minutes');
  });
});

describe('Publish #62 fixes (Ron live-test defects, 2026-11-15)', () => {
  test('contact-claim rule: never claim a text/email send without holding the detail', () => {
    // Ron's homepage test: Aspen said "I'll text you the booking link"
    // holding no number at all. The claim is now gated on capture.
    expect(HOMEPAGE_SALES_LAYER).toContain('CONTACT-CLAIM RULE');
    expect(HOMEPAGE_SALES_LAYER).toContain('never say you will text or email the visitor anything');
    expect(HOMEPAGE_SALES_LAYER).toContain('what\'s the best mobile number for that?');
  });

  test('leaving rule: one final offer after a goodbye signal, then end', () => {
    expect(HOMEPAGE_SALES_LAYER).toContain('LEAVING RULE');
    expect(HOMEPAGE_SALES_LAYER).toContain('never make the visitor say goodbye twice');
  });
});
