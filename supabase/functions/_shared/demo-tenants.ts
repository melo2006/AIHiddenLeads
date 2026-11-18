// Demo / presentation tenants (design 2026-11-18 §12.1, Phase 2.5).
//
// A complete, clearly-labelled fake world the platform admin can seed
// in one click and remove in one click, so the whole multi-tenant
// story can be PRESENTED — admin view, reseller console, client
// accounts — with believable names, plans and dollar figures:
//
//   NorthPeak Partners (demo reseller, branded, CAD retail currency)
//   ├─ Sunset Dental Studio      (Premium plan)
//   ├─ Harbor & Vine Realty      (Pro plan)
//   ├─ Peak Performance Fitness  (Premium plan)
//   └─ BlueLine Plumbing Co.     (Platinum plan)
//
// HOW DEMO DATA STAYS OUT OF REAL NUMBERS (the load-bearing rule):
// demo orgs are flagged voice_organizations.is_demo = true and their
// "usage" lives ONLY in voice_organizations.demo_profile — the seed
// writes ZERO rows to usage_events / gemini_voice_sessions, so every
// ledger-based rollup in the product (Tenants usage columns, usage
// summaries, voice costs) never sees a demo number. The tenants /
// reseller-console actions substitute the demo_profile figures when
// (and only when) they render a demo org's own row, and client rows
// carry isDemo so every surface can badge them.
//
// Everything here is fictional: invented companies, .example contact
// domains, and sign-in accounts on the platform's own domain with a
// demo- prefix. No real reseller (e.g. the first expected partner) is
// named anywhere — the demo world must be safe to show to anyone.

import type { TenantLimits } from './tenancy.ts';
import type { RetailLineSetting } from './retail-pricing.ts';

export interface DemoStats {
  /** Voice + avatar minutes this month (presentation figure). */
  minutes: number;
  /** Metered spend this month in USD (presentation figure). */
  spendUsd: number;
  /** Demo-classified spend this month in USD (presentation figure). */
  demoSpendUsd: number;
}

/** The presentation figures stored in an org's demo_profile. */
export interface DemoProfile extends DemoStats {
  seededAt: string;
}

export function normalizeDemoProfile(raw: unknown): DemoProfile | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
  return {
    minutes: n(r.minutes),
    spendUsd: n(r.spendUsd),
    demoSpendUsd: n(r.demoSpendUsd),
    seededAt: typeof r.seededAt === 'string' ? r.seededAt : '',
  };
}

export interface DemoAccountFixture {
  slug: string;
  businessName: string;
  ownerName: string;
  /** Sign-in email for the demo account (platform domain, demo- prefix). */
  email: string;
}

export interface DemoClientFixture extends DemoAccountFixture {
  planPriceId: string;
  joinedDaysAgo: number;
  assistantName: string;
  stats: DemoStats;
}

export const DEMO_RESELLER = {
  slug: 'northpeak',
  businessName: 'NorthPeak Partners',
  ownerName: 'Jordan Ellis',
  email: 'demo-northpeak@aihiddenleads.com',
  slogan: 'Every call answered. Every lead captured.',
  supportEmail: 'support@northpeakpartners.example',
  brandColor: '#0ea5e9',
  /** His customers see prices in Canadian dollars (§12.4 demo). */
  customerCurrency: 'CAD',
  limits: {
    maxClients: 25,
    minutesPool: 6000,
    demoBudgetUsd: 150,
    monthlySpendCapUsd: 750,
    features: {},
  } as TenantLimits,
  /** 4,860 / 6,000 minutes = 81% — deliberately in the 80% warning
   *  band so a presentation can show the warning state too. */
  stats: { minutes: 4860, spendUsd: 412.35, demoSpendUsd: 58.2 } as DemoStats,
  /** A worked example of §12.3: the recommendation on the two big
   *  per-minute lines, one add-on line, two flat lines — all three
   *  modes visible in one price list. Lines not listed here fall back
   *  to the recommendation (100% markup). */
  retailPrices: {
    voice_minutes: { mode: 'markup', markupPct: 100, flatUsd: 0, addonUsd: 0 },
    avatar_minutes: { mode: 'markup', markupPct: 100, flatUsd: 0, addonUsd: 0 },
    chat_minutes: { mode: 'addon', markupPct: 100, flatUsd: 0, addonUsd: 0.02 },
    website_scan: { mode: 'flat', markupPct: 100, flatUsd: 2.5, addonUsd: 0 },
    voice_clone_creation: { mode: 'flat', markupPct: 100, flatUsd: 49, addonUsd: 0 },
    email_sends: { mode: 'flat', markupPct: 100, flatUsd: 12, addonUsd: 0 },
  } as Record<string, RetailLineSetting>,
  /** Catalog curation (§12.5 demo): our named avatar models only (the
   *  standard preset faces are off), two voices off, Spanish on and
   *  Portuguese off. Null would mean "everything offered". */
  offeredCatalog: {
    avatars: ['aspen', 'frank', 'latina', 'black-professional-lady', 'executive', 'middle-aged-pro', 'sara', 'alex', 'james', 'diego'],
    voices: [
      'Zephyr', 'Puck', 'Charon', 'Kore', 'Leda', 'Orus', 'Aoede', 'Callirrhoe',
      'Autonoe', 'Enceladus', 'Iapetus', 'Umbriel', 'Algieba', 'Despina', 'Erinome',
      'Algenib', 'Rasalgethi', 'Laomedeia', 'Achernar', 'Alnilam', 'Schedar',
      'Pulcherrima', 'Achird', 'Zubenelgenubi', 'Vindemiatrix', 'Sadachbia',
      'Sadaltager', 'Sulafat',
    ],
    languages: ['en', 'es'],
  },
};

export const DEMO_CLIENTS: DemoClientFixture[] = [
  {
    slug: 'sunset-dental',
    businessName: 'Sunset Dental Studio',
    ownerName: 'Maria Lopez',
    email: 'demo-sunset-dental@aihiddenleads.com',
    planPriceId: 'essentials_monthly',
    joinedDaysAgo: 46,
    assistantName: 'Sara',
    stats: { minutes: 1240, spendUsd: 96.4, demoSpendUsd: 0 },
  },
  {
    slug: 'harbor-vine',
    businessName: 'Harbor & Vine Realty',
    ownerName: 'Daniel Cho',
    email: 'demo-harbor-vine@aihiddenleads.com',
    planPriceId: 'growth_monthly',
    joinedDaysAgo: 38,
    assistantName: 'Frank',
    stats: { minutes: 1510, spendUsd: 128.75, demoSpendUsd: 0 },
  },
  {
    slug: 'peak-fitness',
    businessName: 'Peak Performance Fitness',
    ownerName: 'Alicia Grant',
    email: 'demo-peak-fitness@aihiddenleads.com',
    planPriceId: 'essentials_monthly',
    joinedDaysAgo: 21,
    assistantName: 'Alex',
    stats: { minutes: 980, spendUsd: 74.1, demoSpendUsd: 0 },
  },
  {
    slug: 'blueline-plumbing',
    businessName: 'BlueLine Plumbing Co.',
    ownerName: 'Tom Becker',
    email: 'demo-blueline@aihiddenleads.com',
    planPriceId: 'fullservice_monthly',
    joinedDaysAgo: 12,
    assistantName: 'Aspen',
    stats: { minutes: 1130, spendUsd: 113.1, demoSpendUsd: 0 },
  },
];

/** Every demo sign-in email (reseller owner + client owners). */
export const DEMO_EMAILS: string[] = [DEMO_RESELLER.email, ...DEMO_CLIENTS.map((c) => c.email)];

/** True when an org row is a demo org. The is_demo column is the one
 *  source of truth; rows from before the Phase 2.5 update simply have
 *  it undefined, which reads as false. */
export function isDemoOrg(org: { is_demo?: boolean | null } | null | undefined): boolean {
  return org?.is_demo === true;
}
