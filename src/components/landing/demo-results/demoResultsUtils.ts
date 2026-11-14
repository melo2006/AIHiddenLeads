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

export const getResponsiveScreenshotSrc = (
  leadData: Pick<DemoLeadData, "screenshot" | "screenshotTablet" | "screenshotMobile">,
  viewportWidth: number,
) => {
  if (viewportWidth <= 480 && leadData.screenshotMobile) {
    return getImageSrc(leadData.screenshotMobile);
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
}: {
  siteName: string;
  title?: string;
}) => {
  const cleanedTitle = cleanText(title ?? "").split(/[-|]/)[0]?.trim();

  if (cleanedTitle && cleanedTitle.length <= 42) {
    return `${cleanedTitle}, reimagined`;
  }

  return `${siteName}, reimagined for the modern web`;
};

export const buildSupportingCopy = ({
  description,
  siteName,
}: {
  description?: string;
  siteName: string;
}) => {
  const cleanedDescription = cleanText(description ?? "");

  if (cleanedDescription) return cleanedDescription;

  return `A cleaner, faster, more premium experience for ${siteName} with stronger trust signals, better service discovery, and built-in AI lead capture.`;
};
