/**
 * Pinned demo leads for the /agents/realtors one-click examples.
 *
 * Each example site has ONE dedicated leads row, scanned once in
 * advance (2026-11-13) and refreshed weekly in place by the
 * refresh-example-leads edge function. Example links carry this
 * leadId, so /demo-site loads the stored knowledge and opens without
 * the ~2-minute from-scratch scan every visitor used to wait through
 * (and without minting another throwaway lead per visit).
 *
 * The server copy of this mapping — keep the two in sync — lives at
 * supabase/functions/_shared/realtor-example-pinned-leads.ts.
 * src/test/realtor-example-pinned-leads.test.ts pins both copies
 * against the REALTOR_VERTICAL demo examples.
 */
export interface RealtorExamplePinnedLead {
  /** Matches the example option slug in REALTOR_VERTICAL.demoExamples. */
  slug: string;
  agent: string;
  /** Bare domain (no www) — the durable key for the example. */
  domain: string;
  /** The exact example URL used by the page (and stored on the lead). */
  url: string;
  /** The pinned leads row id. */
  leadId: string;
}

export const REALTOR_EXAMPLE_PINNED_LEADS: RealtorExamplePinnedLead[] = [
  { slug: "aurelia-perez", agent: "Aurelia Perez", domain: "aureliaperez.com", url: "https://www.aureliaperez.com/", leadId: "850f3d17-85af-49e9-869b-aa6aa4ab540e" },
  { slug: "ann-chamberlain", agent: "Ann Chamberlain", domain: "annchamberlain.com", url: "https://www.annchamberlain.com/", leadId: "1b68b94a-45fa-446c-9395-7f182cb60abd" },
  { slug: "julie-melrose", agent: "Julie Melrose", domain: "juliemelrose.com", url: "https://www.juliemelrose.com/", leadId: "3680c03f-9241-4912-a4b7-d8390b16bf04" },
  { slug: "ashley-cusack", agent: "Ashley Cusack", domain: "ashleycusack.com", url: "https://ashleycusack.com/", leadId: "ec4f737f-6796-4542-95cc-d48082fad658" },
  { slug: "mauricio-barba", agent: "Mauricio J. Barba", domain: "miamisignaturehomes.com", url: "https://miamisignaturehomes.com/", leadId: "05bd17d7-56cc-40e5-96c2-48362d0d7d2b" },
  { slug: "michael-martinez", agent: "Michael Martinez", domain: "michaelmartinezrealtor.com", url: "https://michaelmartinezrealtor.com/", leadId: "10e46ba2-677d-4783-bcb2-1ddbe82e9fd3" },
  { slug: "jean-luc-andriot", agent: "Jean-Luc Andriot", domain: "jeanlucandriot.com", url: "https://jeanlucandriot.com/", leadId: "3a570d20-1739-489e-bbb8-646f280e0156" },
  { slug: "paul-saperstein", agent: "Paul Saperstein", domain: "paulsapersteinhomes.com", url: "https://paulsapersteinhomes.com/", leadId: "8db3a00c-b24c-4c5c-a371-67db376c28ef" },
  { slug: "baldemar-deleon", agent: "Baldemar De Leon", domain: "baldemardeleon.com", url: "https://www.baldemardeleon.com/", leadId: "4a65957b-72c1-4055-9f4f-d63dd098d14e" },
  { slug: "logan-walter", agent: "Logan Walter", domain: "loganwalter.com", url: "https://loganwalter.com/", leadId: "c9c202be-35c7-4ba7-b016-1dff9a35517b" },
  { slug: "ray-miramontes", agent: "Ray Miramontes", domain: "mira-realestate.com", url: "https://mira-realestate.com/", leadId: "0d9883e5-8ca9-44a9-b9bb-6d248178ab64" },
  { slug: "danielle-lazier", agent: "Danielle Lazier", domain: "daniellelazier.com", url: "https://daniellelazier.com/", leadId: "7dc878df-5559-4d0a-bada-06d5aac62c48" },
  { slug: "richard-steinberg", agent: "Richard Steinberg Team", domain: "therichardsteinbergteam.com", url: "https://www.therichardsteinbergteam.com/", leadId: "51353057-8b1d-4e89-828b-ae12287efb3c" },
  { slug: "gian-sexsmith", agent: "Gian Sexsmith", domain: "sexsmithrealty.com", url: "https://sexsmithrealty.com/", leadId: "335785bd-c994-4d13-9a6d-4d38d84fc11e" },
];

const hostOf = (raw: string): string | null => {
  try {
    return new URL(raw).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
};

const leadIdByHost = new Map(
  REALTOR_EXAMPLE_PINNED_LEADS.map((entry) => [entry.domain.toLowerCase(), entry.leadId]),
);

/**
 * The pinned leadId for an example URL, or undefined when the site has
 * no pinned lead (callers fall back to the fresh-scan launch). Host
 * matching is www-insensitive — the page's stored URLs mix both forms.
 */
export function pinnedLeadIdForExampleUrl(exampleUrl: string): string | undefined {
  const host = hostOf(exampleUrl);
  return host ? leadIdByHost.get(host) : undefined;
}
