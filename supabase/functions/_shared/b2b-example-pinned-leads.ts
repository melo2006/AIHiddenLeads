/**
 * Pinned demo leads for the general-business (B2B) one-click examples —
 * SERVER COPY, consumed by server code that re-scans or refreshes these
 * leads in place.
 *
 * Keep in sync with the client copy at
 * src/data/b2bExamplePinnedLeads.ts (the page's example links are built
 * from that one). src/test/b2b-example-pinned-leads.test.ts pins both
 * copies to the same slugs and leadIds.
 *
 * Created 2026-11-13: one lead per example domain via the public
 * create_demo_lead RPC (same arguments an example click used), then
 * one scan-website run per lead. All 16 reached scan_status='enriched'
 * with real storage-bucket screenshots.
 */
export interface B2BExamplePinnedLead {
  slug: string;
  domain: string;
  url: string;
  leadId: string;
}

export const B2B_EXAMPLE_PINNED_LEADS: B2BExamplePinnedLead[] = [
  { slug: "spodak-dental", domain: "spodakdental.com", url: "https://www.spodakdental.com/", leadId: "5d6648dc-4998-40ac-8107-676ac8712526" },
  { slug: "ts-roofing", domain: "tsroofingsystems.com", url: "https://www.tsroofingsystems.com/", leadId: "6dfb91ef-5356-4212-9936-5c2da41369a0" },
  { slug: "cool-air-usa", domain: "coolairusa.com", url: "https://www.coolairusa.com/", leadId: "a3d10c22-0e9d-4b7d-af98-7288b9bf5cdd" },
  { slug: "madalon-law", domain: "madalonlaw.com", url: "https://madalonlaw.com/", leadId: "577469ab-a8cf-4d43-8def-db48f52ac4d2" },
  { slug: "paradise-plumbing", domain: "paradiseplumbingandac.com", url: "https://paradiseplumbingandac.com/", leadId: "0e99dd66-2c79-4c05-b1eb-729d71bc14f6" },
  { slug: "national-brick-pavers", domain: "bricksandblocks.com", url: "https://www.bricksandblocks.com/", leadId: "16ff659d-7b88-4e03-93aa-aa0f720d7d83" },
  { slug: "anco-precision", domain: "ancoprecision.com", url: "https://www.ancoprecision.com/", leadId: "f3c728c1-6ae0-460c-a523-9fe61e00cb16" },
  { slug: "ast-manufacturing", domain: "astmanufacturing.com", url: "https://astmanufacturing.com/", leadId: "b04df1da-9fdd-4807-a6a8-0be2c08521a1" },
  { slug: "cable-marine", domain: "cablemarine.com", url: "https://www.cablemarine.com/", leadId: "34974ee1-5f1f-4600-bcde-9a1f09aecc6f" },
  { slug: "a2z-marine", domain: "a2zmarine4less.com", url: "http://a2zmarine4less.com/", leadId: "5239927f-9067-4a5c-807d-278806254b14" },
  { slug: "prestige-auto", domain: "prestige.tires", url: "https://prestige.tires/", leadId: "c7bc0aff-758f-49dd-9e4c-0dbe5968acc1" },
  { slug: "autoscope", domain: "autoscopecarcare.com", url: "https://www.autoscopecarcare.com/", leadId: "f2f7ec06-3bd3-4f7e-a42e-56e34f0262cf" },
  { slug: "ak-building-services", domain: "akbuildingservices.com", url: "https://www.akbuildingservices.com/", leadId: "2102b305-b788-425b-8985-1f958e4691ed" },
  { slug: "it-yall", domain: "ityall.com", url: "https://www.ityall.com/", leadId: "490134ef-bccd-4ee4-b64e-94ac391dba20" },
  { slug: "essig-pools", domain: "essigpools.com", url: "https://essigpools.com/", leadId: "720da556-14df-44d6-83f8-f3e6b778176e" },
  { slug: "prestige-landscape", domain: "prestigelandscapedesign.com", url: "https://www.prestigelandscapedesign.com/", leadId: "a5459029-5431-4dbc-8f80-ccd8b2b34754" },
];
