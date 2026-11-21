import { ExternalLink, Globe } from "lucide-react";
import { useEffect, useState } from "react";
import { DemoLeadData, extractNavigationLabels, getResponsiveScreenshotSrc, getSiteName, normalizeWebsiteUrl } from "./demoResultsUtils";

interface BeforePreviewProps {
  leadData: DemoLeadData;
}

/** Pick the best screenshot for the current viewport (shared picker:
 *  getResponsiveScreenshotSrc owns the variant order, including the
 *  2026-11-21 phone order — real mobile, then full-page desktop,
 *  then tablet). */
function useResponsiveScreenshot(leadData: DemoLeadData): string | null {
  const { screenshot, screenshotTablet, screenshotMobile } = leadData;
  const [src, setSrc] = useState<string | null>(() =>
    getResponsiveScreenshotSrc(
      { screenshot, screenshotTablet, screenshotMobile },
      typeof window !== "undefined" ? window.innerWidth : 1024,
    ),
  );

  useEffect(() => {
    const variants = { screenshot, screenshotTablet, screenshotMobile };
    const handler = () => setSrc(getResponsiveScreenshotSrc(variants, window.innerWidth));
    handler();
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [screenshot, screenshotTablet, screenshotMobile]);

  return src;
}

const BeforePreview = ({ leadData }: BeforePreviewProps) => {
  const siteName = getSiteName(leadData.websiteUrl, leadData.title);
  const screenshotSrc = useResponsiveScreenshot(leadData);
  const navigationLabels = extractNavigationLabels(leadData.websiteContent);
  const normalizedUrl = normalizeWebsiteUrl(leadData.websiteUrl);

  return (
    <div className="rounded-[1.75rem] border border-border bg-card p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-destructive/20 bg-destructive/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-destructive">
            01 · Real site we scraped
          </div>
          <div>
            <h3 className="text-2xl font-bold text-foreground">This is the actual live homepage</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Straight from {leadData.websiteUrl} — no redesign applied here.
            </p>
          </div>
        </div>

        <a
          href={normalizedUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-2 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open live site
        </a>
      </div>

      <div className="overflow-hidden rounded-[1.25rem] border border-border bg-secondary/40">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-accent/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-primary/70" />
          <div className="ml-2 flex min-w-0 items-center gap-2 rounded-full border border-border bg-background/80 px-3 py-1 text-[11px] text-muted-foreground">
            <Globe className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{leadData.websiteUrl}</span>
          </div>
        </div>

        {screenshotSrc ? (
          <div className="max-h-[50rem] overflow-auto bg-background">
            <img
              src={screenshotSrc}
              alt={`Scraped homepage for ${siteName}`}
              className="w-full align-top"
              loading="lazy"
            />
          </div>
        ) : (
          <div className="flex aspect-[4/3] items-center justify-center bg-muted px-6 text-center text-sm text-muted-foreground">
            We scraped the content, but the visual screenshot was not available.
          </div>
        )}
      </div>

      <div className="mt-4 space-y-3">
        <div>
          <p className="text-sm font-semibold text-foreground">{siteName}</p>
          {leadData.description && (
            <p className="mt-1 text-sm text-muted-foreground">{leadData.description}</p>
          )}
        </div>

        {navigationLabels.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {navigationLabels.map((item) => (
              <span
                key={item}
                className="rounded-full border border-border bg-background/80 px-3 py-1 text-[11px] font-medium text-muted-foreground"
              >
                {item}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default BeforePreview;
