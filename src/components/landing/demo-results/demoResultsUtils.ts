export type DemoBrandColors = Record<string, string | undefined>;

export interface DemoLeadData {
  leadId?: string;
  prospectId?: string;
  previewVersion?: string;
  scanStatus?: string;
  fullName: string;
  businessName?: string;
  email?: string;
  websiteUrl: string;
  phone?: string;
  niche?: string;
  screenshot?: string;
  screenshotTablet?: string;
  screenshotMobile?: string;
  title?: string;
  description?: string;
  websiteContent?: string;
  /**
   * The scan-time consent verdict (Publish #49 follow-up): the capture
   * pipeline witnessed a cookie/privacy banner on this site, so the
   * demo's live presentation routes through the dismissal-covered live
   * view. Undefined = never recorded (pre-flag scans, or a capture
   * that could not witness the page) — the live probe decides.
   */
  consentBannerSeen?: boolean;
  /**
   * The stored forced-covered-view pin (Ray Miramontes fix,
   * 2026-11-15): this lead's site is verified to refuse real browser
   * framing even though the embed probe's server-side fetch succeeds,
   * so the demo presents the covered screenshot view from the start
   * and never renders the raw iframe (which lands on a browser error
   * page whose load event would otherwise disarm the fallback).
   * Asserted onto the record from the pinned map by
   * refresh-example-leads. A PRESENTATION fact only — unrelated to
   * the consent flags. Undefined = not pinned.
   */
  forceCoveredView?: boolean;
  /**
   * The language the scanned website itself is published in, detected by
   * scan-website from the site's own content and stored on the lead row
   * (Publish #66): 'en' | 'es' | 'pt-BR' (Portuguese is always Brazilian —
   * the product's only Portuguese). Undefined/null = never recorded. When
   * the visitor has NOT explicitly picked a language with the site
   * switch, the demo runs in this language; an explicit pick always wins.
   */
  websiteLanguage?: string;
  colors?: DemoBrandColors;
  logo?: string;
  secondaryUrls?: string[];
  uploadedFiles?: string[];
  crawlDepth?: 1 | 2;
}

const GENERIC_NAV_LABELS = new Set([
  "home",
  "about",
  "contact",
  "blog",
  "our team",
  "team",
  "all listings",
]);

const STRUCTURED_PREFIX = /^(service|trust|faq|benefit|proof|detail|summary|business name|service area|detected niche|tone|call goal)\s*:\s*/i;

const cleanText = (value: string) =>
  value
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`>#|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const unique = (items: string[]) => Array.from(new Set(items.filter(Boolean)));

const stripStructuredPrefix = (value: string) => cleanText(value).replace(STRUCTURED_PREFIX, "").trim();

const extractStructuredBullets = (content: string | undefined, labels: string[], limit: number) => {
  if (!content) return [];

  const pattern = new RegExp(`^\\s*-\\s*(?:${labels.join("|")})\\s*:\\s*(.+)$`, "gim");
  return unique(
    Array.from(content.matchAll(pattern))
      .map((match) => stripStructuredPrefix(match[0]))
      .filter((item) => item.length > 2),
  ).slice(0, limit);
};

export const getImageSrc = (value?: string) => {
  if (!value || typeof value !== "string") return null;
  if (value.startsWith("http") || value.startsWith("data:")) return value;
  return `data:image/png;base64,${value}`;
};

export const withCacheKey = (value: string | null, cacheKey?: string) => {
  if (!value || !cacheKey || value.startsWith("data:")) return value;

  const separator = value.includes("?") ? "&" : "?";
  return `${value}${separator}v=${encodeURIComponent(cacheKey)}`;
};

/**
 * A stored screenshot value counts as a REAL capture only when it is
 * a non-empty value that is not the generated placeholder — the
 * data:image/svg+xml "CAPTURED WEBSITE SUMMARY" card scan-website
 * stores when no capture could be taken (the same signal
 * isGeneratedPlaceholderScreenshot reads in src/lib/demoInvite.ts and
 * the server's screenshot-banner-guard uses). A placeholder is not a
 * picture of the business's site, so the picker treats it as absent
 * and falls through to a real variant.
 */
const isRealCaptureValue = (value?: string | null): value is string =>
  typeof value === "string" && value.length > 0 && !value.startsWith("data:image/svg+xml");

export const getResponsiveScreenshotSrc = (
  leadData: Pick<DemoLeadData, "screenshot" | "screenshotTablet" | "screenshotMobile">,
  viewportWidth: number,
) => {
  if (viewportWidth <= 480) {
    // PHONE ORDER (demo capture fix, 2026-11-21): a real MOBILE
    // capture wins first — it is the only variant framed for the
    // phone. Behind it, the full-page DESKTOP capture outranks the
    // tablet variant: the tablet capture is a single viewport-height
    // shot, and for a site whose hero is one tall photo (Richard
    // Steinberg Team) that one viewport can be all sky — no name, no
    // nav, no content — while the full-page desktop capture carries
    // the branding and the whole page. The same order rescues sites
    // the capture browser cannot reach at the tablet viewport
    // (Michael Martinez: the stored tablet shot is the host's
    // bot-check page; the desktop capture is the real site). A lead
    // whose desktop value is only the generated placeholder falls
    // through to its tablet capture (Danielle Lazier), as before.
    if (isRealCaptureValue(leadData.screenshotMobile)) {
      return getImageSrc(leadData.screenshotMobile);
    }
    if (isRealCaptureValue(leadData.screenshot)) {
      return getImageSrc(leadData.screenshot);
    }
    if (isRealCaptureValue(leadData.screenshotTablet)) {
      return getImageSrc(leadData.screenshotTablet);
    }
    // Nothing real stored: keep the historical precedence so the
    // caller's own fallbacks (placeholder card, live view) engage
    // exactly as they did before.
    return (
      getImageSrc(leadData.screenshotMobile) ??
      getImageSrc(leadData.screenshotTablet) ??
      getImageSrc(leadData.screenshot)
    );
  }

  if (viewportWidth <= 820 && leadData.screenshotTablet) {
    return getImageSrc(leadData.screenshotTablet);
  }

  return getImageSrc(leadData.screenshot);
};

export const normalizeWebsiteUrl = (websiteUrl: string) => {
  try {
    return websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`;
  } catch {
    return websiteUrl;
  }
};

export const getSiteName = (websiteUrl: string, title?: string) => {
  if (title?.trim()) return title.trim();

  try {
    return new URL(normalizeWebsiteUrl(websiteUrl)).hostname.replace(/^www\./, "");
  } catch {
    return websiteUrl;
  }
};

export const hexToHslChannels = (value?: string) => {
  if (!value || typeof value !== "string") return null;

  if (value.startsWith("hsl(")) {
    return value.replace(/^hsl\(/, "").replace(/\)$/, "").replace(/,/g, " ");
  }

  if (!value.startsWith("#")) return null;

  const hex = value.replace("#", "");
  const normalized =
    hex.length === 3 ? hex.split("").map((char) => `${char}${char}`).join("") : hex;

  if (normalized.length !== 6) return null;

  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;

  if (delta === 0) {
    return `0 0% ${Math.round(lightness * 100)}%`;
  }

  const saturation =
    lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);

  let hue = 0;
  switch (max) {
    case r:
      hue = (g - b) / delta + (g < b ? 6 : 0);
      break;
    case g:
      hue = (b - r) / delta + 2;
      break;
    default:
      hue = (r - g) / delta + 4;
  }

  hue /= 6;

  return `${Math.round(hue * 360)} ${Math.round(saturation * 100)}% ${Math.round(lightness * 100)}%`;
};

export const getThemeColor = (value: string | undefined, fallback: string) =>
  hexToHslChannels(value) ?? fallback;

export const extractNavigationLabels = (content?: string, limit = 4) => {
  if (!content) return [];

  const labels = Array.from(content.matchAll(/\[([^\]]+)\]\([^)]*\)/g))
    .map((match) => cleanText(match[1]))
    .filter((label) => label.length > 2)
    .filter((label) => !GENERIC_NAV_LABELS.has(label.toLowerCase()));

  return unique(labels).slice(0, limit);
};

export const extractHeadings = (content?: string, limit = 3) => {
  const structuredServices = extractStructuredBullets(content, ["service", "offering", "specialty"], limit);
  if (structuredServices.length > 0) return structuredServices;
  if (!content) return [];

  const headings = Array.from(content.matchAll(/^#{1,3}\s+(.+)$/gm))
    .map((match) => cleanText(match[1]))
    .filter((heading) => heading.length > 3)
    .filter((heading) => !/welcome|about|areas serviced|business knowledge|business profile|source content/i.test(heading));

  return unique(headings).slice(0, limit);
};

export const extractBulletItems = (content?: string, limit = 6) => {
  const structuredBullets = extractStructuredBullets(content, ["trust", "benefit", "proof", "detail", "faq"], limit);
  if (structuredBullets.length > 0) return structuredBullets;
  if (!content) return [];

  const bullets = Array.from(content.matchAll(/^\s*-\s+(.+)$/gm))
    .map((match) => stripStructuredPrefix(match[1]))
    .filter((item) => item.length > 2);

  return unique(bullets).slice(0, limit);
};

export const buildModernHeadline = ({
  siteName,
  title,
  templates,
}: {
  siteName: string;
  title?: string;
  /** Localized templates (Publish #71); English when omitted. */
  templates?: { fromTitle: (title: string) => string; fromSite: (name: string) => string };
}) => {
  const cleanedTitle = cleanText(title ?? "").split(/[-|]/)[0]?.trim();

  if (cleanedTitle && cleanedTitle.length <= 42) {
    return templates ? templates.fromTitle(cleanedTitle) : `${cleanedTitle}, reimagined`;
  }

  return templates ? templates.fromSite(siteName) : `${siteName}, reimagined for the modern web`;
};

export const buildSupportingCopy = ({
  description,
  siteName,
  fallback,
}: {
  description?: string;
  siteName: string;
  /** Localized fallback (Publish #71); English when omitted. */
  fallback?: (name: string) => string;
}) => {
  const cleanedDescription = cleanText(description ?? "");

  if (cleanedDescription) return cleanedDescription;

  return fallback
    ? fallback(siteName)
    : `A cleaner, faster, more premium experience for ${siteName} with stronger trust signals, better service discovery, and built-in AI lead capture.`;
};
