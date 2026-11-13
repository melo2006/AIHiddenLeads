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
export interface RealtorExamplePinnedLead {
  slug: string;
  domain: string;
  url: string;
  leadId: string;
}

export const REALTOR_EXAMPLE_PINNED_LEADS: RealtorExamplePinnedLead[] = [
  { slug: "aurelia-perez", domain: "aureliaperez.com", url: "https://www.aureliaperez.com/", leadId: "850f3d17-85af-49e9-869b-aa6aa4ab540e" },
  { slug: "ann-chamberlain", domain: "annchamberlain.com", url: "https://www.annchamberlain.com/", leadId: "1b68b94a-45fa-446c-9395-7f182cb60abd" },
  { slug: "julie-melrose", domain: "juliemelrose.com", url: "https://www.juliemelrose.com/", leadId: "3680c03f-9241-4912-a4b7-d8390b16bf04" },
  { slug: "ashley-cusack", domain: "ashleycusack.com", url: "https://ashleycusack.com/", leadId: "ec4f737f-6796-4542-95cc-d48082fad658" },
  { slug: "mauricio-barba", domain: "miamisignaturehomes.com", url: "https://miamisignaturehomes.com/", leadId: "05bd17d7-56cc-40e5-96c2-48362d0d7d2b" },
  { slug: "michael-martinez", domain: "michaelmartinezrealtor.com", url: "https://michaelmartinezrealtor.com/", leadId: "10e46ba2-677d-4783-bcb2-1ddbe82e9fd3" },
  { slug: "jean-luc-andriot", domain: "jeanlucandriot.com", url: "https://jeanlucandriot.com/", leadId: "3a570d20-1739-489e-bbb8-646f280e0156" },
  { slug: "paul-saperstein", domain: "paulsapersteinhomes.com", url: "https://paulsapersteinhomes.com/", leadId: "8db3a00c-b24c-4c5c-a371-67db376c28ef" },
  { slug: "baldemar-deleon", domain: "baldemardeleon.com", url: "https://www.baldemardeleon.com/", leadId: "4a65957b-72c1-4055-9f4f-d63dd098d14e" },
  { slug: "logan-walter", domain: "loganwalter.com", url: "https://loganwalter.com/", leadId: "c9c202be-35c7-4ba7-b016-1dff9a35517b" },
  { slug: "ray-miramontes", domain: "mira-realestate.com", url: "https://mira-realestate.com/", leadId: "0d9883e5-8ca9-44a9-b9bb-6d248178ab64" },
  { slug: "danielle-lazier", domain: "daniellelazier.com", url: "https://daniellelazier.com/", leadId: "7dc878df-5559-4d0a-bada-06d5aac62c48" },
  { slug: "richard-steinberg", domain: "therichardsteinbergteam.com", url: "https://www.therichardsteinbergteam.com/", leadId: "51353057-8b1d-4e89-828b-ae12287efb3c" },
  { slug: "gian-sexsmith", domain: "sexsmithrealty.com", url: "https://sexsmithrealty.com/", leadId: "335785bd-c994-4d13-9a6d-4d38d84fc11e" },
];
