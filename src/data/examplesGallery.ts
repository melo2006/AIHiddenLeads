/**
 * The combined business-examples gallery (homepage + /demo, 2026-11-18).
 *
 * Ron's standing gallery: real businesses' websites with the AI
 * receptionist answering on them, shown as live demos a visitor can
 * open. Two proven sets feed it:
 *
 *  - the 22 general-business (B2B) pinned examples
 *    (src/data/b2bExamplePinnedLeads.ts + b2bExampleServices.ts for
 *    the niche label and city), and
 *  - the 14 realtor pinned examples
 *    (src/data/realtorExamplePinnedLeads.ts + the REALTOR_VERTICAL
 *    demoExamples groups for the city).
 *
 * Every entry carries its PINNED leadId, so a click launches the
 * pre-scanned demo through the same /demo sample handoff the realtor
 * page uses — no fresh ~2-minute scan. Thumbnail captures live in the
 * gallery component (real in-session captures only); an example with
 * no capture is filtered out there, never rendered with a placeholder.
 *
 * Presenter labels are honest about what the demo actually does
 * today: realtor examples front their wired solo presenters
 * (REALTOR_EXAMPLE_PRESENTERS); B2B examples run the standard Aspen
 * flow server-side — their pinned-leads `presenter` field is an
 * unwired proposal, so the gallery says Aspen for all of them.
 *
 * Each entry also carries ONE filter category (2026-11-21): realtors
 * are "real-estate"; B2B entries derive theirs from their pack's
 * niche. The section's default view is business-first (see
 * orderExamplesForDefaultView) — real estate is one category among
 * many, not the majority of the wall.
 */
import {
  REALTOR_EXAMPLE_PINNED_LEADS,
  REALTOR_EXAMPLE_PRESENTERS,
} from "@/data/realtorExamplePinnedLeads";
import { REALTOR_VERTICAL } from "@/data/agentVerticals";
import { B2B_EXAMPLE_PINNED_LEADS } from "@/data/b2bExamplePinnedLeads";
import { B2B_EXAMPLE_PACKS } from "@/data/b2bExampleServices";

/**
 * Filter categories for the gallery (Ron's mix call, 2026-11-21): the
 * grid is business-first, with real estate as ONE category among many
 * instead of the majority of the wall. Every example carries exactly
 * one category; the section renders a filter chip only for categories
 * that have at least one rendered example.
 */
export type GalleryCategory =
  | "real-estate"
  | "home-services"
  | "health-dental"
  | "legal"
  | "manufacturing"
  | "marine"
  | "auto"
  | "business-services";

/** Chip order in the filter row (after the "All" chip). */
export const GALLERY_CATEGORY_ORDER: GalleryCategory[] = [
  "real-estate",
  "home-services",
  "health-dental",
  "legal",
  "manufacturing",
  "marine",
  "auto",
  "business-services",
];

/**
 * B2B pack niche → gallery category. The packs' own niche vocabulary
 * (b2bExampleServices.ts) is the source; pool building/service and
 * landscaping crews are field-service home trades, so they sit with
 * the other home services. An unmapped future niche falls back to
 * business services rather than vanishing — the data test pins every
 * current example's category explicitly, so a new niche fails there
 * first and gets a deliberate home here.
 */
const NICHE_CATEGORIES: Record<string, GalleryCategory> = {
  dentist: "health-dental",
  roofer: "home-services",
  hvac: "home-services",
  plumber: "home-services",
  pavers: "home-services",
  "field-service": "home-services",
  lawyer: "legal",
  manufacturer: "manufacturing",
  marine: "marine",
  "auto-repair": "auto",
  "b2b-services": "business-services",
};

export interface GalleryExample {
  /** Unique across both sets (realtor slugs and B2B slugs never collide). */
  slug: string;
  kind: "b2b" | "realtor";
  /** Filter category this example belongs to (exactly one). */
  category: GalleryCategory;
  /** Business / agent name shown on the card. */
  name: string;
  /** Card sub-line: "City, ST · Niche" (B2B) or "City · Real estate" (realtor). */
  detail: string;
  url: string;
  leadId: string;
  /** Display name of the presenter the live demo actually opens with. */
  presenterName: string;
}

const REALTOR_PRESENTER_NAMES: Record<string, string> = {
  aspen: "Aspen",
  sara: "Sara",
  alex: "Alex",
  frank: "Frank",
  latina: "Monica",
  "black-professional-lady": "Denise",
  james: "James",
  diego: "Diego",
};

const realtorCityBySlug = new Map(
  (REALTOR_VERTICAL.demoExamples?.groups ?? [])
    .flatMap((group) => group.options)
    .map((option) => [option.slug, option.city] as const),
);

const packBySlug = new Map(B2B_EXAMPLE_PACKS.map((pack) => [pack.slug, pack] as const));

const b2bExamples: GalleryExample[] = B2B_EXAMPLE_PINNED_LEADS.map((entry) => {
  const pack = packBySlug.get(entry.slug);
  const place = pack ? `${pack.city}, ${pack.state}` : "";
  const niche = pack?.nicheLabel ?? "";
  return {
    slug: entry.slug,
    kind: "b2b" as const,
    category: (pack && NICHE_CATEGORIES[pack.niche]) || "business-services",
    name: entry.business,
    detail: [place, niche].filter(Boolean).join(" · "),
    url: entry.url,
    leadId: entry.leadId,
    // B2B demos open with Aspen today (the proposed presenters in the
    // pinned-leads file are not wired server-side) — label it Aspen.
    presenterName: "Aspen",
  };
});

const realtorExamples: GalleryExample[] = REALTOR_EXAMPLE_PINNED_LEADS.map((entry) => {
  const city = realtorCityBySlug.get(entry.slug) ?? "";
  const presenter = REALTOR_EXAMPLE_PRESENTERS[entry.slug];
  return {
    slug: entry.slug,
    kind: "realtor" as const,
    category: "real-estate" as const,
    name: entry.agent,
    detail: [city, "Real estate"].filter(Boolean).join(" · "),
    url: entry.url,
    leadId: entry.leadId,
    presenterName: presenter ? REALTOR_PRESENTER_NAMES[presenter] ?? "Aspen" : "Aspen",
  };
});

/**
 * Interleaved 2 B2B : 1 realtor so the grid opens with the general
 * business variety Ron asked for and the realtors are spread through
 * it, instead of two separate blocks.
 */
export const EXAMPLES_GALLERY: GalleryExample[] = (() => {
  const out: GalleryExample[] = [];
  let b = 0;
  let r = 0;
  while (b < b2bExamples.length || r < realtorExamples.length) {
    for (let i = 0; i < 2 && b < b2bExamples.length; i++) out.push(b2bExamples[b++]);
    if (r < realtorExamples.length) out.push(realtorExamples[r++]);
  }
  return out;
})();

/**
 * Default ("All") view ordering (Ron's mix call, 2026-11-21): diverse
 * businesses lead — the first screenful is six general businesses
 * with at most three real-estate cards woven in, then the remaining
 * businesses, then the remaining realtors. Nothing is dropped or
 * hidden; the full realtor set is one filter tap away and also
 * appears further down the expanded "All" view. Applied to whatever
 * subset is actually rendered (examples with a real capture), so the
 * business-first shape holds even while some captures are missing.
 */
export const orderExamplesForDefaultView = (examples: GalleryExample[]): GalleryExample[] => {
  const b2b = examples.filter((example) => example.kind === "b2b");
  const realtors = examples.filter((example) => example.kind === "realtor");
  return [
    ...b2b.slice(0, 6),
    ...realtors.slice(0, 3),
    ...b2b.slice(6),
    ...realtors.slice(3),
  ];
};
