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
 * with real storage-bucket screenshots. A 17th (az-pools — AZ Pools
 * LLC, the full-service pool company: construction + weekly cleaning
 * + repair) was added the same way on 2026-11-21 and also reached
 * scan_status='enriched'.
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
  { slug: "az-pools", domain: "azpoolsllc.com", url: "https://azpoolsllc.com/", leadId: "e7f6deed-0e9c-4915-a2e2-1330d0478390" },
  { slug: "prestige-landscape", domain: "prestigelandscapedesign.com", url: "https://www.prestigelandscapedesign.com/", leadId: "a5459029-5431-4dbc-8f80-ccd8b2b34754" },
  { slug: "tropic-supply", domain: "tropicsupply.com", url: "https://www.tropicsupply.com/", leadId: "3c7f0d98-f17e-4440-9cf9-b038bb2ac777" },
  { slug: "royal-electrical-supply", domain: "royalelectricalsupply.com", url: "https://royalelectricalsupply.com/", leadId: "57565033-d9d3-4e39-8dc1-5f5c25dbe83c" },
  { slug: "mjm-manufacturing", domain: "mjmmfg.com", url: "https://mjmmfg.com/", leadId: "a265677d-75ca-4a5b-a4c4-55c6a1591f5c" },
  { slug: "westway-towing", domain: "westwaytowing.com", url: "https://westwaytowing.com/", leadId: "2604bee5-0436-4149-b8fa-d032883081d6" },
  { slug: "lan-infotech", domain: "laninfotech.com", url: "https://laninfotech.com/", leadId: "79ca6c55-723c-4b3b-ae2f-b5c84b4e6bbe" },
  { slug: "john-the-plumber", domain: "johntheplumberfl.com", url: "https://johntheplumberfl.com/", leadId: "44690ce7-fb21-4486-bf32-68cfbeaee119" },
  { slug: "septic-doctor", domain: "thesepticdoctor.com", url: "https://thesepticdoctor.com/", leadId: "ad030a46-ba0d-446c-9bb6-56d24f434adc" },
  { slug: "mamas-boy-air", domain: "mamasboyair.com", url: "https://www.mamasboyair.com/", leadId: "2a9c2684-c90d-4462-a6be-b69ae7125be8" },
  { slug: "evo-air", domain: "evo-air.com", url: "https://evo-air.com/", leadId: "55035708-5a9f-4f0c-a834-1b98eaf3c07a" },
  { slug: "john-orthodontics", domain: "johnortho.com", url: "https://johnortho.com/", leadId: "798b24ff-76c0-4c4d-a806-37c6035cd05d" },
  { slug: "jj-dental", domain: "jjdentalpractice.com", url: "https://www.jjdentalpractice.com/", leadId: "993487b4-a883-421b-bf43-62040ed11f9a" },
  { slug: "tole-electric", domain: "toleelectric.com", url: "https://toleelectric.com/", leadId: "919ace5c-c8ac-4505-b2d6-acd7ea8b4793" },
  { slug: "bos-generators", domain: "bosgenerators.com", url: "https://www.bosgenerators.com/", leadId: "27055c8b-2965-42db-a1ad-97ade337c44d" },
  { slug: "levine-family-law", domain: "levinefamilylaw.com", url: "https://www.levinefamilylaw.com/", leadId: "3f410cf0-5b89-4e8d-9f6d-f7d735b7bce6" },
  { slug: "meltzer-bell", domain: "browardcriminalteam.com", url: "https://www.browardcriminalteam.com/", leadId: "810010c2-d16f-483a-829e-2902368dce31" },
  { slug: "robson-industrial", domain: "robsonindustrial.com", url: "https://www.robsonindustrial.com/", leadId: "8e5e6bd8-3eac-4f4d-aa60-841c8d6c0755" },
  { slug: "amaira-medspa", domain: "amairamedspa.com", url: "https://amairamedspa.com/", leadId: "b0f7801e-9c36-4ff6-9ccb-1177ba2842bb" },
  { slug: "central-broward-vet", domain: "centralbrowardvet.com", url: "https://centralbrowardvet.com/", leadId: "e7ae9865-237e-498c-b81f-bf6a1d04d221" },
  { slug: "chiangwell-medical", domain: "chiangwellmedical.com", url: "https://www.chiangwellmedical.com/", leadId: "3e88cdcb-9365-444c-9b7d-5462b9dfe714" },
  { slug: "solaris-financial", domain: "solarisfg.com", url: "https://solarisfg.com/", leadId: "7a5b3e10-ef87-4c8a-a8d1-67f9e4e38d32" },
  { slug: "freedom-insurance", domain: "freedominsurancefinancial.com", url: "https://freedominsurancefinancial.com/", leadId: "9e9da794-daca-4a9e-ab12-98447b8d8e67" },
];
