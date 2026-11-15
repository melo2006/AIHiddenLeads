/**
 * Pinned demo leads for the /agents/realtors one-click examples —
 * SERVER COPY, consumed by the refresh-example-leads edge function,
 * which re-scans each of these leads in place on a weekly schedule.
 *
 * Keep in sync with the client copy at
 * src/data/realtorExamplePinnedLeads.ts (the page's example links are
 * built from that one). src/test/realtor-example-pinned-leads.test.ts
 * pins both copies to the same slugs and leadIds.
 *
 * Created 2026-11-13: one lead per example domain via the public
 * create_demo_lead RPC (same arguments an example click used), then
 * one scan-website run per lead. All reached scan_status='enriched'
 * (the 14th, julie-melrose, was added later the same day when the
 * grid went back to 14 examples after Scalone's removal).
 */
import type { PersonaId } from './personas.ts';

export interface RealtorExamplePinnedLead {
  slug: string;
  domain: string;
  url: string;
  leadId: string;
  /**
   * Pinned KB service area (Martinez pins fix, 2026-11-14). The scan
   * derives `serviceArea` as a free-text model answer on every run,
   * with no pinning — for a business whose site the capture browsers
   * cannot reliably read, the answer confabulates and flip-flops
   * between same-named businesses in other states. This field is the
   * recorded truth (sourced per entry below from the example
   * definitions in src/data/agentVerticals.ts — the demoExamples
   * group area each example is filed under — except michael-martinez,
   * whose area is owner-verified). scan-website substitutes it for
   * the model's answer on pinned leads, and refresh-example-leads
   * re-asserts it into the stored knowledge after every refresh, so
   * a confabulated rewrite cannot survive. SERVER-ONLY: the client
   * copy in src/data does not carry this field.
   */
  serviceArea?: string;
  /**
   * Owner-verified consent banner (Martinez pins fix, 2026-11-14).
   * TRUE only where a human has personally witnessed the site's
   * cookie banner live and the capture pipeline provably cannot
   * witness it itself (michaelmartinezrealtor.com sits behind a
   * Cloudflare bot check that walls the capture browsers, and the
   * consent probe records null on a wall by design — so no scan can
   * ever correct the stale FALSE the pre-repair backfill wrote).
   * refresh-example-leads re-asserts consent_banner_seen=true after
   * every refresh of a flagged pin, even when the scan walled and
   * recorded nothing. NEVER set this for a pin whose banner has not
   * been human-verified. SERVER-ONLY, like serviceArea.
   */
  consentBannerVerified?: boolean;
}

export const REALTOR_EXAMPLE_PINNED_LEADS: RealtorExamplePinnedLead[] = [
  { slug: "aurelia-perez", domain: "aureliaperez.com", url: "https://www.aureliaperez.com/", leadId: "850f3d17-85af-49e9-869b-aa6aa4ab540e", serviceArea: "Broward County, FL" },
  { slug: "ann-chamberlain", domain: "annchamberlain.com", url: "https://www.annchamberlain.com/", leadId: "1b68b94a-45fa-446c-9395-7f182cb60abd", serviceArea: "Broward County, FL" },
  { slug: "julie-melrose", domain: "juliemelrose.com", url: "https://www.juliemelrose.com/", leadId: "3680c03f-9241-4912-a4b7-d8390b16bf04", serviceArea: "Broward County, FL" },
  { slug: "ashley-cusack", domain: "ashleycusack.com", url: "https://ashleycusack.com/", leadId: "ec4f737f-6796-4542-95cc-d48082fad658", serviceArea: "Miami-Dade County, FL" },
  { slug: "mauricio-barba", domain: "miamisignaturehomes.com", url: "https://miamisignaturehomes.com/", leadId: "05bd17d7-56cc-40e5-96c2-48362d0d7d2b", serviceArea: "Miami-Dade County, FL" },
  { slug: "michael-martinez", domain: "michaelmartinezrealtor.com", url: "https://michaelmartinezrealtor.com/", leadId: "10e46ba2-677d-4783-bcb2-1ddbe82e9fd3", serviceArea: "South Florida", consentBannerVerified: true },
  { slug: "jean-luc-andriot", domain: "jeanlucandriot.com", url: "https://jeanlucandriot.com/", leadId: "3a570d20-1739-489e-bbb8-646f280e0156", serviceArea: "Palm Beach County, FL" },
  { slug: "paul-saperstein", domain: "paulsapersteinhomes.com", url: "https://paulsapersteinhomes.com/", leadId: "8db3a00c-b24c-4c5c-a371-67db376c28ef", serviceArea: "Palm Beach County, FL" },
  { slug: "baldemar-deleon", domain: "baldemardeleon.com", url: "https://www.baldemardeleon.com/", leadId: "4a65957b-72c1-4055-9f4f-d63dd098d14e", serviceArea: "Dallas, TX" },
  { slug: "logan-walter", domain: "loganwalter.com", url: "https://loganwalter.com/", leadId: "c9c202be-35c7-4ba7-b016-1dff9a35517b", serviceArea: "Dallas, TX" },
  { slug: "ray-miramontes", domain: "mira-realestate.com", url: "https://mira-realestate.com/", leadId: "0d9883e5-8ca9-44a9-b9bb-6d248178ab64", serviceArea: "Los Angeles, CA" },
  { slug: "danielle-lazier", domain: "daniellelazier.com", url: "https://daniellelazier.com/", leadId: "7dc878df-5559-4d0a-bada-06d5aac62c48", serviceArea: "San Francisco, CA" },
  { slug: "richard-steinberg", domain: "therichardsteinbergteam.com", url: "https://www.therichardsteinbergteam.com/", leadId: "51353057-8b1d-4e89-828b-ae12287efb3c", serviceArea: "New York, NY" },
  { slug: "gian-sexsmith", domain: "sexsmithrealty.com", url: "https://sexsmithrealty.com/", leadId: "335785bd-c994-4d13-9a6d-4d38d84fc11e", serviceArea: "Salt Lake City, UT" },
];

/** The pinned entry for a leadId, or null when the lead is not pinned. */
export function pinnedExampleLeadForLeadId(
  leadId: string | undefined | null,
): RealtorExamplePinnedLead | null {
  if (!leadId) return null;
  return REALTOR_EXAMPLE_PINNED_LEADS.find((lead) => lead.leadId === leadId) ?? null;
}

/** The pinned KB service area for a leadId, or null when unpinned / unrecorded. */
export function pinnedServiceAreaForLeadId(leadId: string | undefined | null): string | null {
  return pinnedExampleLeadForLeadId(leadId)?.serviceArea ?? null;
}

/** TRUE only for pins whose consent banner a human has verified (see the field doc). */
export function pinnedConsentBannerVerifiedForLeadId(leadId: string | undefined | null): boolean {
  return pinnedExampleLeadForLeadId(leadId)?.consentBannerVerified === true;
}

/**
 * Rewrite stored knowledge so its SERVICE AREA line(s) state the
 * pinned service area. The knowledge text carries the line once per
 * generated section (initial summary + research summary), so EVERY
 * occurrence is replaced; when no line exists (a scan whose profile
 * had no area omits it), the line is inserted after the BUSINESS
 * NAME line, or prepended when there is none. Idempotent: asserting
 * an already-pinned text returns it unchanged. Pure — the refresh
 * function compares and only writes when the text actually changed.
 */
export function applyPinnedServiceArea(
  content: string | null | undefined,
  serviceArea: string,
): string {
  const line = `SERVICE AREA: ${serviceArea}`;
  const text = content ?? "";
  if (/^SERVICE AREA:.*$/m.test(text)) {
    return text.replace(/^SERVICE AREA:.*$/gm, line);
  }
  if (!text) return line;
  if (/^BUSINESS NAME:.*$/m.test(text)) {
    return text.replace(/^BUSINESS NAME:.*$/m, (match) => `${match}\n${line}`);
  }
  return `${line}\n${text}`;
}

/**
 * Example presenters (Frank batch, 2026-11-13): examples NOT listed
 * here run the standard Aspen→Sara flow. A listed example is fronted
 * SOLO by the named presenter persona (see personas.ts
 * presenterSimulationPrompt): the Senior Owner ("Frank") fronts the
 * three MALE agents' examples; Monica and the Black Professional
 * Lady front two FEMALE agents' examples each (Ladies batch,
 * 2026-11-13 — Ron approved the build the same night; Monica's
 * name was settled by Ron 2026-11-14, the Black Professional
 * Lady's name in personas.ts is still a working label, and both
 * voices are Muse's picks, not Ron-settled). This map is the
 * server-known source of
 * truth — gemini-session stamps the presenter onto the demo parent
 * only when the request is a marked sample whose lead's stored site
 * URL matches the example (the same trust pattern as the listings
 * stamp), and simli-avatar authorizes the presenter's face token
 * against this map by pinned leadId. A client claim alone earns
 * nothing. Keep in sync with the client copy in
 * src/data/realtorExamplePinnedLeads.ts.
 */
export const REALTOR_EXAMPLE_PRESENTERS: Partial<Record<string, PersonaId>> = {
  "michael-martinez": "frank",
  "richard-steinberg": "frank",
  "paul-saperstein": "frank",
  "aurelia-perez": "latina",
  "danielle-lazier": "latina",
  "ann-chamberlain": "black-professional-lady",
  "ashley-cusack": "black-professional-lady",
};

export function examplePresenterForSlug(slug: string | undefined | null): PersonaId | null {
  if (!slug) return null;
  return REALTOR_EXAMPLE_PRESENTERS[slug] ?? null;
}

export function examplePresenterForLeadId(leadId: string | undefined | null): PersonaId | null {
  if (!leadId) return null;
  const entry = REALTOR_EXAMPLE_PINNED_LEADS.find((lead) => lead.leadId === leadId);
  return entry ? examplePresenterForSlug(entry.slug) : null;
}
