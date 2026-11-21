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
 */
import {
  REALTOR_EXAMPLE_PINNED_LEADS,
  REALTOR_EXAMPLE_PRESENTERS,
} from "@/data/realtorExamplePinnedLeads";
import { REALTOR_VERTICAL } from "@/data/agentVerticals";
import { B2B_EXAMPLE_PINNED_LEADS } from "@/data/b2bExamplePinnedLeads";
import { B2B_EXAMPLE_PACKS } from "@/data/b2bExampleServices";

export interface GalleryExample {
  /** Unique across both sets (realtor slugs and B2B slugs never collide). */
  slug: string;
  kind: "b2b" | "realtor";
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
