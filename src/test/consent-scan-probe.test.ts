// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  buildBrowserlessConsentProbeCode,
  consentScanFlagsFromReport,
  extractConsentReportFromFirecrawlPayload,
  looksLikeBotWall,
  probeConsentBannerViaBrowserless,
} from "../../supabase/functions/_shared/consent-scan-probe";
import type { CookieConsentDismissalReport } from "../../supabase/functions/_shared/cookie-consent-dismissal";

/**
 * Consent-banner scan recording (Publish #49 follow-up, 2026-11-14).
 *
 * #49's detection lived in check-iframe-embed's live HTML probe, which
 * bot-walled sites (Martinez) render unreachable — detection never ran
 * and the banner shipped in the raw iframe. Detection moved into the
 * scan-website capture pipeline: these tests pin how the dismissal
 * script's in-page report becomes the durable leads-row flags, how the
 * Browserless /function probe reads it back, and how the Firecrawl
 * fallback's javascriptReturns are mined for the same report.
 */

const report = (over: Partial<CookieConsentDismissalReport>): CookieConsentDismissalReport => ({
  status: "not-found",
  clicked: null,
  clickedText: null,
  attempts: 3,
  containers: 0,
  ...over,
});

describe("consentScanFlagsFromReport", () => {
  it("a Reject dismissal records seen + dismissed", () => {
    expect(
      consentScanFlagsFromReport(report({ status: "dismissed-reject", clicked: "reject", containers: 1 })),
    ).toEqual({ seen: true, dismissed: true, clicked: "reject", status: "dismissed-reject" });
  });

  it("an Accept dismissal (no refusal existed) still records seen + dismissed", () => {
    expect(
      consentScanFlagsFromReport(report({ status: "dismissed-accept", clicked: "accept", containers: 1 })),
    ).toEqual({ seen: true, dismissed: true, clicked: "accept", status: "dismissed-accept" });
  });

  it("a witnessed page with no banner records a durable FALSE", () => {
    expect(consentScanFlagsFromReport(report({}))).toEqual({
      seen: false,
      dismissed: false,
      clicked: null,
      status: "not-found",
    });
  });

  it("a banner that could not be dismissed (Customize-only) is still SEEN", () => {
    expect(
      consentScanFlagsFromReport(report({ status: "pending", containers: 2 })),
    ).toEqual({ seen: true, dismissed: false, clicked: null, status: "pending" });
  });

  it("a known-selector click with no generic containers still counts as seen", () => {
    expect(
      consentScanFlagsFromReport(report({ status: "dismissed-reject", clicked: "reject", containers: 0 }))?.seen,
    ).toBe(true);
  });

  it("no report means unrecorded (null), never a false", () => {
    expect(consentScanFlagsFromReport(null)).toBeNull();
    expect(consentScanFlagsFromReport(undefined)).toBeNull();
  });
});

describe("bot-wall recognition", () => {
  it("flags Cloudflare-class interstitials", () => {
    expect(looksLikeBotWall("Just a moment... Performing security verification")).toBe(true);
    expect(looksLikeBotWall("Verify you are human — ray id 8f00")).toBe(true);
    expect(looksLikeBotWall("Attention Required! | Cloudflare")).toBe(true);
  });

  it("does not flag an ordinary homepage", () => {
    expect(looksLikeBotWall("Michael Martinez Group — Fort Lauderdale homes for sale")).toBe(false);
    expect(looksLikeBotWall("")).toBe(false);
    expect(looksLikeBotWall(null)).toBe(false);
    expect(looksLikeBotWall(undefined)).toBe(false);
  });
});

describe("buildBrowserlessConsentProbeCode", () => {
  const code = buildBrowserlessConsentProbeCode("https://www.martinezrealtorsfl.com/", "DISMISSAL_SCRIPT_BODY");

  it("uses the established /function shape and returns the report as data", () => {
    expect(code).toContain("export default async function ({ page })");
    expect(code).toContain('return { data, type: \'application/json\' }');
  });

  it("navigates at the desktop capture viewport class (the one that gets past the walls)", () => {
    expect(code).toContain("page.setViewport({ width: 1920, height: 1080 })");
    expect(code).toContain('page.goto(targetUrl, { waitUntil: \'networkidle2\', timeout: 30000 })');
  });

  it("injects the dismissal script and polls its live report until it clicks", () => {
    expect(code).toContain("DISMISSAL_SCRIPT_BODY");
    expect(code).toContain("window.__aihlCookieDismissal");
    expect(code).toContain("report.clicked");
  });

  it("samples the page text so the caller can refuse a bot-walled false", () => {
    expect(code).toContain("pageTextSample");
  });
});

describe("probeConsentBannerViaBrowserless", () => {
  const fakeFetcher = (status: number, payload: unknown) =>
    vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => payload,
    })) as unknown as typeof fetch;

  it("records the flags from the probe's report and posts the dismissal script to /function", async () => {
    const fetcher = fakeFetcher(200, report({ status: "dismissed-reject", clicked: "reject", containers: 1 }));
    const flags = await probeConsentBannerViaBrowserless("https://www.martinezrealtorsfl.com/", "bl-key", {
      fetcher,
      log: () => {},
    });
    expect(flags).toEqual({ seen: true, dismissed: true, clicked: "reject", status: "dismissed-reject" });

    const [url, init] = (fetcher as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).toContain("https://production-sfo.browserless.io/function?token=bl-key");
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.code).toContain("cookieConsentDismissalMain");
    expect(body.code).toContain("https://www.martinezrealtorsfl.com/");
  });

  it("records a witnessed FALSE when the page carried no banner", async () => {
    const fetcher = fakeFetcher(200, {
      ...report({}),
      pageTextSample: "Harbor Light Realty — homes for sale",
      finalUrl: "https://www.harborlightrealty.com/",
    });
    const flags = await probeConsentBannerViaBrowserless("https://www.harborlightrealty.com/", "bl-key", {
      fetcher,
      log: () => {},
    });
    expect(flags).toEqual({ seen: false, dismissed: false, clicked: null, status: "not-found" });
  });

  it("a bot wall is UNRECORDED (null), never a durable false", async () => {
    const fetcher = fakeFetcher(200, {
      ...report({}),
      pageTextSample: "Just a moment... Performing security verification — Verify you are human",
      finalUrl: "https://www.martinezrealtorsfl.com/",
    });
    const flags = await probeConsentBannerViaBrowserless("https://www.martinezrealtorsfl.com/", "bl-key", {
      fetcher,
      log: () => {},
    });
    expect(flags).toBeNull();
  });

  it("HTTP errors, malformed payloads and transport failures all resolve null", async () => {
    await expect(
      probeConsentBannerViaBrowserless("https://x.example/", "k", { fetcher: fakeFetcher(500, {}), log: () => {} }),
    ).resolves.toBeNull();
    await expect(
      probeConsentBannerViaBrowserless("https://x.example/", "k", { fetcher: fakeFetcher(200, null), log: () => {} }),
    ).resolves.toBeNull();
    await expect(
      probeConsentBannerViaBrowserless("https://x.example/", "k", { fetcher: fakeFetcher(200, "not a report"), log: () => {} }),
    ).resolves.toBeNull();
    const throwing = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    await expect(
      probeConsentBannerViaBrowserless("https://x.example/", "k", { fetcher: throwing, log: () => {} }),
    ).resolves.toBeNull();
  });
});

describe("extractConsentReportFromFirecrawlPayload", () => {
  const dismissalReport = report({ status: "dismissed-reject", clicked: "reject", containers: 1 });

  it("finds the report in v2 javascriptReturns ({ value } entries)", () => {
    const payload = {
      success: true,
      data: {
        screenshot: "https://fc.example/shot.png",
        actions: { javascriptReturns: [{ type: "object", value: dismissalReport }] },
      },
    };
    expect(extractConsentReportFromFirecrawlPayload(payload)).toEqual(dismissalReport);
  });

  it("finds raw (unwrapped) return entries and skips junk", () => {
    const payload = {
      data: { actions: { javascriptReturns: [null, 42, { unrelated: true }, dismissalReport] } },
    };
    expect(extractConsentReportFromFirecrawlPayload(payload)).toEqual(dismissalReport);
  });

  it("returns null when the tier discarded action values", () => {
    expect(extractConsentReportFromFirecrawlPayload({ success: true, data: { screenshot: "x" } })).toBeNull();
    expect(extractConsentReportFromFirecrawlPayload(null)).toBeNull();
    expect(extractConsentReportFromFirecrawlPayload({ data: { actions: { javascriptReturns: [] } } })).toBeNull();
  });
});
