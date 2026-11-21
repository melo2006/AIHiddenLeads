import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  EXAMPLES_GALLERY,
  GALLERY_CATEGORY_ORDER,
  orderExamplesForDefaultView,
  type GalleryCategory,
  type GalleryExample,
} from "@/data/examplesGallery";
import { EXAMPLE_THUMBS, EXAMPLE_THUMBS_MOBILE } from "./examplesGalleryThumbs";

/**
 * Business-examples gallery (2026-11-18) — the section Ron approved
 * for the realtor page, now on the homepage (directly below the film
 * gallery since 2026-11-21) and under the /demo form.
 *
 * Every card is a REAL capture of that business's website: the
 * original set are in-session captures with the receptionist panel
 * open on it; the 2026-11-21 refreshed cards are shot from the
 * stored demo captures the demos themselves run on. Desktop + plain
 * phone views side by side, no phone-frame graphic. Examples
 * without a real capture are not rendered at all — no placeholders,
 * no redrawn composites.
 *
 * Clicking a card launches that example's LIVE demo through the same
 * /demo sample handoff the realtor page uses (sample=1 + the pinned
 * leadId, so the pre-scanned demo opens without a fresh scan).
 *
 * Mix + layout (Ron's call, 2026-11-21): the wall used to read as a
 * real-estate gallery with a couple of businesses mixed in. Now the
 * default view is business-first (diverse B2B examples lead, at most
 * three realtor cards in the first screenful), a category filter row
 * lets a visitor jump straight to their own industry, and the grid
 * is contained — the first screenful of cards shows, with a
 * "Show all" button expanding the rest in place instead of the
 * section sprawling down the page. Under the grid, a strip names
 * other industries Aspen answers for; those are plain text, NOT
 * demos — the live demos are the cards, and the strip's button runs
 * the free demo on the visitor's own website.
 */

/** Cards shown before the "Show all" expand (3 rows on desktop). */
const GALLERY_PAGE_SIZE = 9;

const CATEGORY_LABEL_KEYS: Record<GalleryCategory, string> = {
  "real-estate": "examplesGallery.catRealEstate",
  "home-services": "examplesGallery.catHomeServices",
  "health-dental": "examplesGallery.catHealthDental",
  legal: "examplesGallery.catLegal",
  manufacturing: "examplesGallery.catManufacturing",
  marine: "examplesGallery.catMarine",
  auto: "examplesGallery.catAuto",
  "business-services": "examplesGallery.catBusinessServices",
};

type CategoryFilter = GalleryCategory | "all";

const ExamplesGallerySection = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>("all");
  const [expanded, setExpanded] = useState(false);

  const visible = EXAMPLES_GALLERY.filter((example) => EXAMPLE_THUMBS[example.slug]);

  // A filter chip renders only for a category with at least one
  // rendered example — no dead filters.
  const presentCategories = GALLERY_CATEGORY_ORDER.filter((category) =>
    visible.some((example) => example.category === category),
  );

  const inCategory =
    activeCategory === "all" ? null : visible.filter((example) => example.category === activeCategory);
  const filtered =
    inCategory && inCategory.length > 0 ? inCategory : orderExamplesForDefaultView(visible);
  const shown = expanded ? filtered : filtered.slice(0, GALLERY_PAGE_SIZE);

  const niches = (t("examplesGallery.moreNiches", { returnObjects: true }) as string[]) || [];

  const selectCategory = (category: CategoryFilter) => {
    setActiveCategory(category);
    setExpanded(false);
  };

  const runExampleDemo = (example: GalleryExample) => {
    const params = new URLSearchParams({
      leadId: example.leadId,
      url: example.url,
      sample: "1",
      callerName: t("examplesGallery.visitorName"),
    });
    navigate(`/demo?${params.toString()}`);
  };

  if (visible.length === 0) return null;

  const chipClass = (active: boolean) =>
    `rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
      active
        ? "border-primary bg-primary text-primary-foreground"
        : "border-border bg-background text-foreground hover:border-primary/60"
    }`;

  return (
    <section
      id="examples"
      data-examples-gallery
      className="border-b border-primary/20 bg-background py-12 sm:py-16"
    >
      <div className="container mx-auto px-5 sm:px-6">
        <div className="max-w-3xl mx-auto text-center mb-8">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            {t("examplesGallery.title")}
          </h2>
          <p className="text-muted-foreground text-base sm:text-lg">
            {t("examplesGallery.sub")}
          </p>
          <p className="text-muted-foreground text-base sm:text-lg mt-3">
            {t("examplesGallery.devices")}
          </p>
        </div>

        <div
          data-examples-gallery-filters
          className="max-w-5xl mx-auto mb-4 flex flex-wrap justify-center gap-2"
        >
          <button
            type="button"
            aria-pressed={activeCategory === "all"}
            onClick={() => selectCategory("all")}
            className={chipClass(activeCategory === "all")}
          >
            {t("examplesGallery.filterAll")}
            <span className="opacity-70"> ({visible.length})</span>
          </button>
          {presentCategories.map((category) => {
            const count = visible.filter((example) => example.category === category).length;
            return (
              <button
                key={category}
                type="button"
                aria-pressed={activeCategory === category}
                onClick={() => selectCategory(category)}
                className={chipClass(activeCategory === category)}
              >
                {t(CATEGORY_LABEL_KEYS[category])}
                <span className="opacity-70"> ({count})</span>
              </button>
            );
          })}
        </div>

        <div className="max-w-5xl mx-auto rounded-2xl border border-border bg-card p-3 sm:p-4">
          <div
            data-examples-gallery-grid
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {shown.map((example) => (
              <button
                key={example.slug}
                type="button"
                onClick={() => runExampleDemo(example)}
                aria-label={t("examplesGallery.openDemo", { name: example.name })}
                className="group block w-full text-left rounded-xl border border-border bg-background overflow-hidden shadow-sm transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <span className="flex items-stretch gap-2 p-2 pb-0">
                  <img
                    src={EXAMPLE_THUMBS[example.slug]}
                    alt={t("examplesGallery.cardAltDesktop", { name: example.name })}
                    loading="lazy"
                    className="aspect-[16/10] min-w-0 flex-1 rounded-lg object-cover object-top"
                  />
                  {EXAMPLE_THUMBS_MOBILE[example.slug] && (
                    <img
                      src={EXAMPLE_THUMBS_MOBILE[example.slug]}
                      alt={t("examplesGallery.cardAltMobile", { name: example.name })}
                      loading="lazy"
                      className="w-[23%] shrink-0 rounded-lg object-cover object-top"
                    />
                  )}
                </span>
                <span className="flex items-center justify-between gap-2 px-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-foreground">
                      {example.name}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {example.detail}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {t("examplesGallery.presenterLine", { name: example.presenterName })}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-primary">
                    {t("examplesGallery.runDemo")}
                  </span>
                </span>
              </button>
            ))}
          </div>
          {filtered.length > GALLERY_PAGE_SIZE && (
            <div className="pt-4 text-center">
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setExpanded((value) => !value)}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {expanded
                  ? t("examplesGallery.showLess")
                  : t("examplesGallery.showAll", { count: filtered.length })}
                {expanded ? (
                  <ChevronUp className="h-4 w-4" aria-hidden />
                ) : (
                  <ChevronDown className="h-4 w-4" aria-hidden />
                )}
              </button>
            </div>
          )}
        </div>

        <div className="max-w-5xl mx-auto mt-6 rounded-2xl border border-border bg-card p-5 sm:p-6 text-center">
          <h3 className="text-xl sm:text-2xl font-bold mb-2">
            {t("examplesGallery.moreTitle")}
          </h3>
          <p className="mx-auto max-w-2xl text-muted-foreground text-sm sm:text-base">
            {t("examplesGallery.moreText")}
          </p>
          {niches.length > 0 && (
            <ul className="mt-4 flex flex-wrap justify-center gap-1.5">
              {niches.map((niche) => (
                <li
                  key={niche}
                  className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground"
                >
                  {niche}
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => navigate("/demo")}
            className="mt-5 inline-flex items-center rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {t("examplesGallery.moreCta")}
          </button>
        </div>
      </div>
    </section>
  );
};

export default ExamplesGallerySection;
