// Realtor landing greeting rotation (owner-approved 2026-11-11).
//
// A website session that STARTS on /agents/realtors opens with the
// realtor rotation (REALTOR_GREETING_VARIANTS) instead of the standard
// homepage greeting. Coverage:
//  - the three variant texts, pinned word for word (curiosity-framed
//    statistic pairs, digits in stored text — never spelled out)
//  - rotation: openingFor picks from exactly these three for a
//    realtor-stamped config, and every variant is reachable
//  - route scoping: the gemini-session stamp is server-derived from
//    the campaign entryPath (same trust pattern as the team-intro
//    /demo stamp), replaces greeting AND greetings in the homepage
//    branch only, and lands before the final opening assembly — so a
//    session that starts elsewhere can never pick up the rotation by
//    navigating to the page mid-conversation
//  - non-realtor resolution: configs without the stamp resolve to the
//    standard greeting/opening exactly as before
//  - the path channel: '/agents/realtors' is a public campaign path on
//    BOTH the client tracker and the server allowlist (kept in parity),
//    so campaignVisit() carries it as entryPath and milestones accept it
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke } } }));
import { HOMEPAGE_GREETING, REALTOR_GREETING_VARIANTS } from '../../supabase/functions/_shared/homepage-knowledge';
import { greeting, openingFor } from '../../supabase/functions/_shared/voice-config';
import { PUBLIC_PATHS, validMilestone, visitJourney } from '../../supabase/functions/_shared/report-context';
import { campaignVisit, PUBLIC_CAMPAIGN_PATHS } from '../lib/campaignTracking';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

const EXPECTED_A = `Hi, I'm Aspen — and this page was built for realtors. Did you know the average agent takes over 15 hours to respond to a new inquiry? And here's the part that stings — 48% of inquiries never get a response at all. I answer your calls and website visitors in seconds, 24/7. I qualify buyers and sellers, book showings on your calendar, and warm-transfer hot leads straight to your phone. It's $99 a month with 400 minutes, and I can show you live on your own website, free. May I have your name?`;
const EXPECTED_B = `Hi, I'm Aspen with AiHiddenLeads — this page is for realtors and brokers. Have you heard that 78% of buyers work with the first agent who responds? And did you know that answering in 5 minutes, instead of 30, makes you 21x more likely to qualify that lead? While you're at a showing or a closing, I answer in seconds — I qualify them, book them on your calendar, or transfer them to you live with a quick summary. $99 a month, 400 minutes included. Want to see me do it on your own website, free? May I have your name?`;
const EXPECTED_C = `Hi, I'm Aspen — realtors, this one's for you. Ever wonder where callers who hit your voicemail actually go? 85% of them never call back. And here's another one — only 1 in 3 callers ever reaches an agent at all. I make sure they reach you: I answer 24/7, talk with your buyers and sellers, book showings on your calendar, and hand hot leads back to you live. I'm also the video receptionist your website visitors would get — $99 a month with 400 minutes. Try me free on your own website. May I have your name?`;

describe('the three approved realtor greetings', () => {
  it('are pinned word for word, in rotation order A, B, C', () => {
    expect(REALTOR_GREETING_VARIANTS).toEqual([EXPECTED_A, EXPECTED_B, EXPECTED_C]);
  });

  it('each carries exactly its approved statistic pair, curiosity-framed', () => {
    const [a, b, c] = REALTOR_GREETING_VARIANTS;
    expect(a).toContain('Did you know');
    expect(a).toContain('15 hours');
    expect(a).toContain('48%');
    expect(b).toContain('Have you heard');
    expect(b).toContain('78%');
    expect(b).toContain('21x');
    expect(c).toContain('Ever wonder');
    expect(c).toContain('85%');
    expect(c).toContain('1 in 3');
    // No variant borrows another variant's statistics.
    expect(a).not.toContain('78%');
    expect(b).not.toContain('48%');
    expect(c).not.toContain('21x');
  });

  it('stored text keeps digits — statistics and prices are never spelled out', () => {
    for (const variant of REALTOR_GREETING_VARIANTS) {
      expect(variant).toContain('$99');
      expect(variant).toContain('400 minutes');
      expect(variant.toLowerCase()).not.toMatch(/seventy|eighty|forty|fifteen|thirty|twenty|ninety|five minutes/);
      expect(variant).toContain('May I have your name?');
    }
    // 24/7 appears in variants A and C (B carries the showing/closing frame instead).
    expect(REALTOR_GREETING_VARIANTS[0]).toContain('24/7');
    expect(REALTOR_GREETING_VARIANTS[2]).toContain('24/7');
  });

  it('the standard homepage greeting is untouched by the rotation', () => {
    expect(HOMEPAGE_GREETING).not.toContain('built for realtors');
    expect(HOMEPAGE_GREETING).not.toContain('this one\'s for you');
    expect(HOMEPAGE_GREETING).toContain('85% of callers who reach a business\'s voicemail');
  });
});

describe('rotation through openingFor (the standard mechanism)', () => {
  const realtorConfig = () => ({
    name: 'Aspen',
    businessName: 'AI Hidden Leads',
    greeting: REALTOR_GREETING_VARIANTS[0],
    greetings: [...REALTOR_GREETING_VARIANTS],
  });

  it('picks A, B and C across the rotation range', () => {
    const random = vi.spyOn(Math, 'random');
    try {
      random.mockReturnValue(0);
      expect(openingFor(realtorConfig(), 10)).toBe(EXPECTED_A);
      random.mockReturnValue(0.34);
      expect(openingFor(realtorConfig(), 10)).toBe(EXPECTED_B);
      random.mockReturnValue(0.99);
      expect(openingFor(realtorConfig(), 10)).toBe(EXPECTED_C);
    } finally {
      random.mockRestore();
    }
  });

  it('every pick is one of the three, and all three are reachable', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const pick = openingFor(realtorConfig(), 10);
      expect(REALTOR_GREETING_VARIANTS).toContain(pick);
      seen.add(pick);
    }
    expect(seen).toEqual(new Set(REALTOR_GREETING_VARIANTS));
  });

  it('a config WITHOUT the stamp resolves to the standard greeting, never a realtor variant', () => {
    // No greetings array: the templated standard greeting.
    const plain = { name: 'Aspen', businessName: 'AI Hidden Leads', greeting: '{timeGreeting}! I am {agentName} from {businessName}. {nameQuestion}' };
    const opened = openingFor(plain, 10);
    expect(opened).toBe(greeting(plain, 10));
    expect(REALTOR_GREETING_VARIANTS).not.toContain(opened);
    // A snapshot-style rotation (the standard homepage variant): only
    // its own variants can come back.
    const snapshot = { name: 'Aspen', businessName: 'AI Hidden Leads', greeting: HOMEPAGE_GREETING, greetings: [HOMEPAGE_GREETING] };
    for (let i = 0; i < 50; i++) {
      const pick = openingFor(snapshot, 10);
      expect(pick).toBe(HOMEPAGE_GREETING);
      expect(REALTOR_GREETING_VARIANTS).not.toContain(pick);
    }
  });
});

describe('route scoping in gemini-session', () => {
  const src = read('supabase/functions/gemini-session/index.ts');
  const knowledge = read('supabase/functions/_shared/homepage-knowledge.ts');

  it('gemini-session applies the shared stamp helper; the helper owns the swap', () => {
    expect(src).toContain("import { realtorLandingApplies, stampRealtorLanding } from '../_shared/homepage-knowledge.ts';");
    expect(knowledge).toContain('config.realtorLanding = true;');
    expect(knowledge).toContain('config.greeting = REALTOR_GREETING_VARIANTS[0];');
    expect(knowledge).toContain('config.greetings = [...REALTOR_GREETING_VARIANTS];');
  });

  it('stamps only the homepage agent, only when the session starts on /agents/realtors', () => {
    // Reachability fix (2026-11-11): the decision is the shared
    // realtorLandingApplies predicate (resolved slug + entryPath), with
    // NO !b.agentId term — the public widget addresses the homepage
    // agent by its resolved public id, so an agentId is present on
    // every genuine widget session and the old term silently disabled
    // the stamp in production.
    expect(src).toContain('if(realtorLandingApplies(agent.slug, b.campaign)) {');
    expect(src).toContain('stampRealtorLanding(config);');
  });

  it('the stamp lands inside the homepage branch, before the opening is assembled', () => {
    const branchAt = src.indexOf("agent.slug==='aspen-homepage'");
    const stampAt = src.indexOf('realtorLandingApplies(agent.slug, b.campaign)');
    const assemblyAt = src.indexOf('opening:openingFor(');
    expect(branchAt).toBeGreaterThan(-1);
    expect(stampAt).toBeGreaterThan(branchAt);
    expect(assemblyAt).toBeGreaterThan(stampAt);
  });

  it('the realtor path is in the server entryPath allowlist (schema enum source)', () => {
    expect(PUBLIC_PATHS).toContain('/agents/realtors');
    expect(src).toContain('entryPath:z.enum(PUBLIC_PATHS).optional()');
  });
});

describe('the page-context channel (client tracker ⇄ server allowlist)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    invoke.mockResolvedValue({ error: null });
  });

  it('client and server public-path lists stay in parity', () => {
    expect([...PUBLIC_CAMPAIGN_PATHS]).toEqual([...PUBLIC_PATHS]);
  });

  it('campaignVisit carries /agents/realtors as the entryPath for a session started there', () => {
    window.history.replaceState({}, '', '/agents/realtors');
    const visit = campaignVisit();
    expect(visit?.entryPath).toBe('/agents/realtors');
  });

  it('campaignVisit on the homepage still carries / (standard greeting territory)', () => {
    window.history.replaceState({}, '', '/');
    expect(campaignVisit()?.entryPath).toBe('/');
  });

  it('server milestones accept the realtor page and label it in visit journeys', () => {
    expect(validMilestone('page_view', '/agents/realtors')).toBe(true);
    expect(validMilestone('voice_started', '/agents/realtors')).toBe(true);
    expect(visitJourney([
      { visit_id: 'a', event: 'page_view', path: '/agents/realtors', created_at: '2026-11-11T10:00:00Z' },
    ], 'a')).toContain('Realtors page');
  });
});
