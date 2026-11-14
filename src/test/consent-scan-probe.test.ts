// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import {
  buildBrowserlessConsentProbeCode,
  consentScanFlagsFromEvidence,
  consentScanFlagsFromReport,
  extractConsentEvidenceFromFirecrawlPayload,
  extractConsentReportFromFirecrawlPayload,
  loadConsentTextWitnessMain,
  looksLikeBotWall,
  mergeConsentBannerFlags,
  probeConsentBannerViaBrowserless,
  type ConsentTextWitness,
} from "../../supabase/functions/_shared/consent-scan-probe";
import {
  loadCookieConsentDismissalMain,
  type CookieConsentDismissalReport,
} from "../../supabase/functions/_shared/cookie-consent-dismissal";

/**
 * Consent-banner scan recording (Publish #49 follow-up, 2026-11-14) +
 * witness repair (same day, post-#50).
 *
 * #49's detection lived in check-iframe-embed's live HTML probe, which
 * bot-walled sites (Martinez) render unreachable — detection never ran
 * and the banner shipped in the raw iframe. Detection moved into the
 * scan-website capture pipeline. The first backfill then recorded
 * seen=false for ALL 14 pinned leads including Martinez: "seen" was
 * defined solely as the dismissal script's container-gated report
 * over a short window, and the payload reducers had no shape guard.
 * These tests pin the repaired contract: the independent text/CMP
 * witness, shape-guarded reductions (absence = unrecorded, never a
 * false), and the sticky-true write merge.
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
    ).toEqual({ seen: true, dismissed: true, clicked: "reject", status: "dismissed-reject", witnessVia: "report" });
  });

  it("an Accept dismissal (no refusal existed) still records seen + dismissed", () => {
    expect(
      consentScanFlagsFromReport(report({ status: "dismissed-accept", clicked: "accept", containers: 1 })),
    ).toEqual({ seen: true, dismissed: true, clicked: "accept", status: "dismissed-accept", witnessVia: "report" });
  });

  it("a witnessed page with no banner records a durable FALSE", () => {
    expect(consentScanFlagsFromReport(report({}))).toEqual({
      seen: false,
      dismissed: false,
      clicked: null,
      status: "not-found",
      witnessVia: null,
    });
  });

  it("a banner that could not be dismissed (Customize-only) is still SEEN", () => {
    expect(
      consentScanFlagsFromReport(report({ status: "pending", containers: 2 })),
    ).toEqual({ seen: true, dismissed: false, clicked: null, status: "pending", witnessVia: "report" });
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

  it("a value that is not shaped like a report is unrecorded, never a false (shape guard)", () => {
    expect(consentScanFlagsFromReport({} as never)).toBeNull();
    expect(consentScanFlagsFromReport({ data: null, type: "application/json" } as never)).toBeNull();
    expect(consentScanFlagsFromReport({ error: "boom" } as never)).toBeNull();
    expect(consentScanFlagsFromReport("not a report" as never)).toBeNull();
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

  it("uses the established /function shape and returns the evidence as data", () => {
    expect(code).toContain("export default async function ({ page })");
    expect(code).toContain("return { data, type: 'application/json' }");
    expect(code).toContain("textWitness");
    expect(code).toContain("pageTextSample");
  });

  it("navigates at the desktop capture viewport class (the one that gets past the walls)", () => {
    expect(code).toContain("page.setViewport({ width: 1920, height: 1080 })");
    expect(code).toContain("page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 })");
  });

  it("injects the dismissal script and polls its live report until it clicks", () => {
    expect(code).toContain("DISMISSAL_SCRIPT_BODY");
    expect(code).toContain("window.__aihlCookieDismissal");
    expect(code).toContain("report.clicked");
  });

  it("nudges a scroll mid-window and evaluates the independent witness before returning", () => {
    expect(code).toContain("scrollTo");
    expect(code).toContain("consentTextWitnessMain");
  });
});

describe("probeConsentBannerViaBrowserless", () => {
  const fakeFetcher = (status: number, payload: unknown) =>
    vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => payload,
    })) as unknown as typeof fetch;

  it("records the flags from the probe's evidence and posts the dismissal script to /function", async () => {
    const fetcher = fakeFetcher(200, {
      report: report({ status: "dismissed-reject", clicked: "reject", containers: 1 }),
      textWitness: { seen: true, via: "phrase", detail: "we value your privacy" },
      pageTextSample: "Michael Martinez Group — Fort Lauderdale homes for sale",
      finalUrl: "https://www.martinezrealtorsfl.com/",
    });
    const flags = await probeConsentBannerViaBrowserless("https://www.martinezrealtorsfl.com/", "bl-key", {
      fetcher,
      log: () => {},
    });
    expect(flags).toEqual({
      seen: true,
      dismissed: true,
      clicked: "reject",
      status: "dismissed-reject",
      witnessVia: "report",
    });

    const [url, init] = (fetcher as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).toContain("https://production-sfo.browserless.io/function?token=bl-key");
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.code).toContain("cookieConsentDismissalMain");
    expect(body.code).toContain("consentTextWitnessMain");
    expect(body.code).toContain("https://www.martinezrealtorsfl.com/");
  });

  it("the witness rescues a banner the dismissal's containers missed (Martinez shape)", async () => {
    const fetcher = fakeFetcher(200, {
      report: report({}),
      textWitness: { seen: true, via: "phrase", detail: "we value your privacy" },
      pageTextSample: "Michael Martinez Group — Fort Lauderdale homes for sale",
      finalUrl: "https://www.martinezrealtorsfl.com/",
    });
    const flags = await probeConsentBannerViaBrowserless("https://www.martinezrealtorsfl.com/", "bl-key", {
      fetcher,
      log: () => {},
    });
    expect(flags?.seen).toBe(true);
    expect(flags?.dismissed).toBe(false);
    expect(flags?.witnessVia).toBe("phrase");
  });

  it("unwraps a { data, type } envelope before reducing", async () => {
    const fetcher = fakeFetcher(200, {
      data: {
        report: report({ status: "dismissed-reject", clicked: "reject", containers: 1 }),
        pageTextSample: "Harbor Light Realty — homes for sale",
      },
      type: "application/json",
    });
    const flags = await probeConsentBannerViaBrowserless("https://www.harborlightrealty.com/", "bl-key", {
      fetcher,
      log: () => {},
    });
    expect(flags?.seen).toBe(true);
    expect(flags?.clicked).toBe("reject");
  });

  it("records a witnessed FALSE when the page carried no banner", async () => {
    const fetcher = fakeFetcher(200, {
      report: report({}),
      textWitness: { seen: false, via: null, detail: null },
      pageTextSample: "Harbor Light Realty — homes for sale",
      finalUrl: "https://www.harborlightrealty.com/",
    });
    const flags = await probeConsentBannerViaBrowserless("https://www.harborlightrealty.com/", "bl-key", {
      fetcher,
      log: () => {},
    });
    expect(flags).toEqual({ seen: false, dismissed: false, clicked: null, status: "not-found", witnessVia: null });
  });

  it("a bot wall is UNRECORDED (null), never a durable false — even with witness evidence attached", async () => {
    const fetcher = fakeFetcher(200, {
      report: report({}),
      textWitness: { seen: true, via: "phrase", detail: "we value your privacy" },
      pageTextSample: "Just a moment... Performing security verification — Verify you are human",
      finalUrl: "https://www.martinezrealtorsfl.com/",
    });
    const flags = await probeConsentBannerViaBrowserless("https://www.martinezrealtorsfl.com/", "bl-key", {
      fetcher,
      log: () => {},
    });
    expect(flags).toBeNull();
  });

  it("an empty/unreadable page is UNRECORDED (null), never a false", async () => {
    const fetcher = fakeFetcher(200, {
      report: report({}),
      textWitness: { seen: false, via: null, detail: null },
      pageTextSample: "   ",
      finalUrl: "https://www.martinezrealtorsfl.com/",
    });
    await expect(
      probeConsentBannerViaBrowserless("https://www.martinezrealtorsfl.com/", "bl-key", {
        fetcher,
        log: () => {},
      }),
    ).resolves.toBeNull();
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
    // Regression (post-#50 defect): an empty-object payload used to
    // reduce to a durable seen=false.
    await expect(
      probeConsentBannerViaBrowserless("https://x.example/", "k", { fetcher: fakeFetcher(200, {}), log: () => {} }),
    ).resolves.toBeNull();
    await expect(
      probeConsentBannerViaBrowserless("https://x.example/", "k", {
        fetcher: fakeFetcher(200, { data: null, type: "application/json" }),
        log: () => {},
      }),
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

describe("consent text witness (jsdom fixtures)", () => {
  const dismissalMain = loadCookieConsentDismissalMain();
  const witnessMain = loadConsentTextWitnessMain();
  const doms: JSDOM[] = [];
  const makeDom = (bodyHtml: string) => {
    const dom = new JSDOM(`<!DOCTYPE html><html><head><title>Michael Martinez Group</title></head><body>${bodyHtml}</body></html>`, {
      url: "https://www.martinezrealtorsfl.com/",
    });
    doms.push(dom);
    return dom;
  };
  afterEach(() => {
    while (doms.length) doms.pop()?.window.close();
  });

  // The Martinez banner's TEXT and buttons, in a container none of the
  // dismissal's heuristics classify: no cookie/consent/privacy in the
  // class, no dialog role, not fixed/sticky (absolutely positioned) —
  // the shape a roll-your-own CMP ships and the clicker cannot see.
  const MARTINEZ_NONSTANDARD_BANNER = `
    <div class="cky-note" style="position: absolute; bottom: 0; left: 0; right: 0;">
      <h2>We value your privacy</h2>
      <p>We use cookies and similar technologies to run this site, remember your
         preferences, and understand how the site is used.</p>
      <button type="button">REJECT NON-ESSENTIAL</button>
      <button type="button">CUSTOMIZE</button>
      <button type="button">ACCEPT ALL</button>
    </div>
    <main><h1>Michael Martinez Group</h1><p>Fort Lauderdale homes for sale.</p></main>`;

  it("the dismissal misses the non-standard container, but the witness sees the banner (probe-channel evidence)", () => {
    const dom = makeDom(MARTINEZ_NONSTANDARD_BANNER);
    const doc = dom.window.document;

    const dismissalReport = dismissalMain(doc, { observeMs: 0 });
    expect(dismissalReport.containers).toBe(0);
    expect(dismissalReport.clicked).toBeNull();
    expect(consentScanFlagsFromReport(dismissalReport)?.seen).toBe(false);

    const witness = witnessMain(doc);
    expect(witness.seen).toBe(true);
    expect(witness.via).toBe("phrase");

    const flags = consentScanFlagsFromEvidence({ report: dismissalReport, textWitness: witness });
    expect(flags?.seen).toBe(true);
    expect(flags?.dismissed).toBe(false);
    expect(flags?.witnessVia).toBe("phrase");
  });

  it("the same fixture witnesses TRUE through the Firecrawl read-back channel", () => {
    const dom = makeDom(MARTINEZ_NONSTANDARD_BANNER);
    const doc = dom.window.document;
    const dismissalReport = dismissalMain(doc, { observeMs: 0 });
    const witness = witnessMain(doc);

    const payload = {
      success: true,
      data: {
        screenshot: "https://fc.example/shot.png",
        actions: {
          javascriptReturns: [
            { type: "object", value: dismissalReport },
            { type: "object", value: { report: dismissalReport, textWitness: witness } },
          ],
        },
      },
    };
    const evidence = extractConsentEvidenceFromFirecrawlPayload(payload);
    expect(evidence?.report).toEqual(dismissalReport);
    expect(evidence?.textWitness?.seen).toBe(true);
    expect(consentScanFlagsFromEvidence(evidence)?.seen).toBe(true);
  });

  it("a CMP script fingerprint witnesses seen even when the banner div never rendered", () => {
    const dom = makeDom(`
      <script src="https://cdn-cookieyes.com/client_data/abc123/script.js"></script>
      <main><h1>Michael Martinez Group</h1><p>Fort Lauderdale homes for sale.</p></main>`);
    const witness = witnessMain(dom.window.document);
    expect(witness.seen).toBe(true);
    expect(witness.via).toBe("cmp");
  });

  it("a plain homepage with a footer Cookie Policy link witnesses nothing", () => {
    const dom = makeDom(`
      <main><h1>Harbor Light Realty</h1><p>Homes for sale in Fort Lauderdale.</p></main>
      <footer><a href="/privacy">Privacy Policy</a> <a href="/cookies">Cookie Policy</a></footer>`);
    const witness = witnessMain(dom.window.document);
    expect(witness).toEqual({ seen: false, via: null, detail: null });
    // And the evidence reduction of a witness-only FALSE is a witnessed false…
    expect(consentScanFlagsFromEvidence({ report: null, textWitness: witness })).toEqual({
      seen: false,
      dismissed: false,
      clicked: null,
      status: null,
      witnessVia: null,
    });
  });

  it("an exact consent-action button alone witnesses seen via the button channel", () => {
    const dom = makeDom(`
      <div class="notice-bar"><span>Welcome to our site.</span>
      <button type="button">ACCEPT ALL</button></div>
      <main><h1>Harbor Light Realty</h1></main>`);
    const witness = witnessMain(dom.window.document);
    expect(witness.seen).toBe(true);
    expect(witness.via).toBe("button");
  });
});

describe("consentScanFlagsFromEvidence", () => {
  const witnessSeen: ConsentTextWitness = { seen: true, via: "cmp", detail: "cookieyes" };
  const witnessNone: ConsentTextWitness = { seen: false, via: null, detail: null };

  it("the report stays primary for clicked/dismissed facts", () => {
    const flags = consentScanFlagsFromEvidence({
      report: report({ status: "dismissed-reject", clicked: "reject", containers: 1 }),
      textWitness: witnessNone,
    });
    expect(flags).toEqual({
      seen: true,
      dismissed: true,
      clicked: "reject",
      status: "dismissed-reject",
      witnessVia: "report",
    });
  });

  it("the witness can only add a seen, never remove one", () => {
    expect(
      consentScanFlagsFromEvidence({ report: report({}), textWitness: witnessSeen })?.seen,
    ).toBe(true);
    expect(
      consentScanFlagsFromEvidence({
        report: report({ status: "dismissed-accept", clicked: "accept", containers: 1 }),
        textWitness: witnessNone,
      })?.seen,
    ).toBe(true);
  });

  it("absent or mis-shaped evidence is unrecorded (null), never a false", () => {
    expect(consentScanFlagsFromEvidence(null)).toBeNull();
    expect(consentScanFlagsFromEvidence(undefined)).toBeNull();
    expect(consentScanFlagsFromEvidence({})).toBeNull();
    expect(consentScanFlagsFromEvidence({ report: null, textWitness: null })).toBeNull();
    expect(consentScanFlagsFromEvidence({ report: {} as never, textWitness: { nope: 1 } as never })).toBeNull();
    expect(extractConsentEvidenceFromFirecrawlPayload({ data: { actions: { javascriptReturns: [] } } })).toBeNull();
    expect(
      extractConsentEvidenceFromFirecrawlPayload({ data: { actions: { javascriptReturns: [null, 42, "x"] } } }),
    ).toBeNull();
  });
});

describe("mergeConsentBannerFlags (sticky-true writes)", () => {
  const incomingFalse = consentScanFlagsFromReport(report({}))!;
  const incomingTrue = consentScanFlagsFromReport(
    report({ status: "dismissed-reject", clicked: "reject", containers: 1 }),
  )!;

  it("a recorded TRUE survives a later scan whose witness came back FALSE", () => {
    const merged = mergeConsentBannerFlags({ seen: true, dismissed: true }, incomingFalse);
    expect(merged?.seen).toBe(true);
    expect(merged?.dismissed).toBe(true);
  });

  it("a recorded TRUE survives a later empty/absent witness (no write at all)", () => {
    expect(mergeConsentBannerFlags({ seen: true, dismissed: false }, null)).toBeNull();
    expect(mergeConsentBannerFlags({ seen: true, dismissed: false }, undefined)).toBeNull();
  });

  it("with no prior record the incoming witness stands as-is", () => {
    expect(mergeConsentBannerFlags(null, incomingFalse)).toEqual(incomingFalse);
    expect(mergeConsentBannerFlags({ seen: null, dismissed: null }, incomingTrue)).toEqual(incomingTrue);
    expect(mergeConsentBannerFlags({ seen: false, dismissed: false }, incomingTrue)?.seen).toBe(true);
  });
});
