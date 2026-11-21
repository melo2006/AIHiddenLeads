import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { EXAMPLES_GALLERY, type GalleryExample } from "@/data/examplesGallery";
import { EXAMPLE_THUMBS, EXAMPLE_THUMBS_MOBILE } from "./examplesGalleryThumbs";

/**
 * Business-examples gallery (2026-11-18) — the section Ron approved
 * for the realtor page, now on the homepage (replacing the
 * before/after phones block) and under the /demo form.
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
 * The grid sits in a bounded-height scroll frame on sm+ screens (two
 * rows visible, the rest scroll inside the frame so the section never
 * swallows the page); on phones it flows naturally in one column.
 */
const ExamplesGallerySection = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const visible = EXAMPLES_GALLERY.filter((example) => EXAMPLE_THUMBS[example.slug]);

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
        <div className="max-w-5xl mx-auto rounded-2xl border border-border bg-card p-3 sm:p-4">
          <div
            data-examples-gallery-scroll
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:max-h-[528px] sm:overflow-y-auto sm:pr-1"
          >
            {visible.map((example) => (
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
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          {t("examplesGallery.scrollHint", { count: visible.length })}
        </p>
      </div>
    </section>
  );
};

export default ExamplesGallerySection;
