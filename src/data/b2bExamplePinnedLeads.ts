/**
 * Pinned demo leads for the general-business (B2B) one-click examples.
 *
 * Each example site has ONE dedicated leads row, scanned once in
 * advance (2026-11-13) and refreshed in place — the same arrangement as
 * the realtor examples. Example links carry this leadId, so /demo-site
 * loads the stored knowledge and opens without the ~2-minute
 * from-scratch scan (and without minting a throwaway lead per visit).
 *
 * The server copy of this mapping — keep the two in sync — lives at
 * supabase/functions/_shared/b2b-example-pinned-leads.ts.
 * src/test/b2b-example-pinned-leads.test.ts pins both copies.
 *
 * `presenter` is the PROPOSED demo presenter for the example (working
 * names from the avatar roster: Aspen, Marcus, Frank, Sara, Alex and
 * the brown-haired preset lady) — a proposal for the client wiring,
 * not yet a live assignment.
 */
export interface B2BExamplePinnedLead {
  /** Matches the example pack slug in B2B_EXAMPLE_PACKS. */
  slug: string;
  business: string;
  /** Bare domain (no www) — the durable key for the example. */
  domain: string;
  /** The exact example URL used by the page (and stored on the lead). */
  url: string;
  /** The pinned leads row id. */
  leadId: string;
  /** Proposed presenter (working name) for this example's demo. */
  presenter: string;
}

export const B2B_EXAMPLE_PINNED_LEADS: B2BExamplePinnedLead[] = [
  { slug: "spodak-dental", business: "Spodak Dental Group", domain: "spodakdental.com", url: "https://www.spodakdental.com/", leadId: "5d6648dc-4998-40ac-8107-676ac8712526", presenter: "Sara" },
  { slug: "ts-roofing", business: "T&S Roofing Systems", domain: "tsroofingsystems.com", url: "https://www.tsroofingsystems.com/", leadId: "6dfb91ef-5356-4212-9936-5c2da41369a0", presenter: "Alex" },
  { slug: "cool-air-usa", business: "Cool Air USA", domain: "coolairusa.com", url: "https://www.coolairusa.com/", leadId: "a3d10c22-0e9d-4b7d-af98-7288b9bf5cdd", presenter: "Aspen" },
  { slug: "madalon-law", business: "Madalon Injury Law", domain: "madalonlaw.com", url: "https://madalonlaw.com/", leadId: "577469ab-a8cf-4d43-8def-db48f52ac4d2", presenter: "Marcus" },
  { slug: "paradise-plumbing", business: "Paradise Plumbing, Air & Electric", domain: "paradiseplumbingandac.com", url: "https://paradiseplumbingandac.com/", leadId: "0e99dd66-2c79-4c05-b1eb-729d71bc14f6", presenter: "Aspen" },
  { slug: "national-brick-pavers", business: "National Brick Pavers", domain: "bricksandblocks.com", url: "https://www.bricksandblocks.com/", leadId: "16ff659d-7b88-4e03-93aa-aa0f720d7d83", presenter: "Brown-haired preset lady" },
  { slug: "anco-precision", business: "Anco Precision Inc.", domain: "ancoprecision.com", url: "https://www.ancoprecision.com/", leadId: "f3c728c1-6ae0-460c-a523-9fe61e00cb16", presenter: "Frank" },
  { slug: "ast-manufacturing", business: "AST Manufacturing", domain: "astmanufacturing.com", url: "https://astmanufacturing.com/", leadId: "b04df1da-9fdd-4807-a6a8-0be2c08521a1", presenter: "Marcus" },
  { slug: "cable-marine", business: "Cable Marine", domain: "cablemarine.com", url: "https://www.cablemarine.com/", leadId: "34974ee1-5f1f-4600-bcde-9a1f09aecc6f", presenter: "Frank" },
  { slug: "a2z-marine", business: "A2Z Marine 4 Less", domain: "a2zmarine4less.com", url: "http://a2zmarine4less.com/", leadId: "5239927f-9067-4a5c-807d-278806254b14", presenter: "Aspen" },
  { slug: "prestige-auto", business: "Prestige Auto Repairs & Tires", domain: "prestige.tires", url: "https://prestige.tires/", leadId: "c7bc0aff-758f-49dd-9e4c-0dbe5968acc1", presenter: "Frank" },
  { slug: "autoscope", business: "Autoscope European Car Care", domain: "autoscopecarcare.com", url: "https://www.autoscopecarcare.com/", leadId: "f2f7ec06-3bd3-4f7e-a42e-56e34f0262cf", presenter: "Marcus" },
  { slug: "ak-building-services", business: "AK Building Services", domain: "akbuildingservices.com", url: "https://www.akbuildingservices.com/", leadId: "2102b305-b788-425b-8985-1f958e4691ed", presenter: "Aspen" },
  { slug: "it-yall", business: "IT Y'ALL", domain: "ityall.com", url: "https://www.ityall.com/", leadId: "490134ef-bccd-4ee4-b64e-94ac391dba20", presenter: "Brown-haired preset lady" },
  { slug: "essig-pools", business: "Essig Pools", domain: "essigpools.com", url: "https://essigpools.com/", leadId: "720da556-14df-44d6-83f8-f3e6b778176e", presenter: "Aspen" },
  { slug: "prestige-landscape", business: "Prestige Landscape & Design", domain: "prestigelandscapedesign.com", url: "https://www.prestigelandscapedesign.com/", leadId: "a5459029-5431-4dbc-8f80-ccd8b2b34754", presenter: "Sara" },
];

const hostOf = (raw: string): string | null => {
  try {
    return new URL(raw).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
};

const leadIdByHost = new Map(
  B2B_EXAMPLE_PINNED_LEADS.map((entry) => [entry.domain.toLowerCase(), entry.leadId]),
);

/**
 * The pinned leadId for an example URL, or undefined when the site has
 * no pinned lead (callers fall back to the fresh-scan launch). Host
 * matching is www-insensitive — stored URLs mix both forms.
 */
export function pinnedLeadIdForExampleUrl(exampleUrl: string): string | undefined {
  const host = hostOf(exampleUrl);
  return host ? leadIdByHost.get(host) : undefined;
}
