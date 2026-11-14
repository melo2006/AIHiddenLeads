// @vitest-environment node
import { describe, expect, test } from "vitest";
import {
  CONSENT_HTML_SIGNATURES,
  detectConsentInHtml,
} from "../../supabase/functions/_shared/cookie-consent-dismissal";

/**
 * Consent detection for the covered live-view route (Publish #48
 * follow-up, 2026-11-14): check-iframe-embed fingerprints the
 * prospect homepage's HTML so DemoSite can route banner-carrying
 * embeddable sites through the dismissal-covered Browserbase live
 * view instead of the raw cross-origin iframe.
 */

const htmlPage = (head: string, body: string) =>
  `<!DOCTYPE html><html><head><title>Realtor</title>${head}</head><body>${body}</body></html>`;

describe("detectConsentInHtml", () => {
  test("detects the Martinez-style banner (CookieYes fingerprint + exact headline)", () => {
    const html = htmlPage(
      `<script src="https://cdn-cookieyes.com/client_data/abc123/script.js"></script>`,
      `<div class="cky-consent-container"><p>We value your privacy</p>` +
        `<button>Reject Non-Essential</button><button>Customize</button><button>Accept All</button></div>`,
    );
    expect(detectConsentInHtml(html)).toBe(true);
  });

  test("detects the major consent frameworks by their script/SDK fingerprints", () => {
    expect(detectConsentInHtml(htmlPage(`<script src="https://cdn.cookielaw.org/scripttemplates/otSDKStub.js"></script>`, ""))).toBe(true);
    expect(detectConsentInHtml(htmlPage(`<script id="Cookiebot" src="https://consent.cookiebot.com/uc.js"></script>`, ""))).toBe(true);
    expect(detectConsentInHtml(htmlPage(`<script src="https://static.axept.io/sdk.js"></script><div id="didomi-host"></div>`, ""))).toBe(true);
    expect(detectConsentInHtml(htmlPage("", `<div id="usercentrics-root"></div>`))).toBe(true);
    expect(detectConsentInHtml(htmlPage(`<link rel="stylesheet" href="/wp-content/plugins/complianz-gdpr/assets/css/cookieblocker.min.css">`, ""))).toBe(true);
    expect(detectConsentInHtml(htmlPage("", `<div id="cookie-law-info-bar"><span>This website uses cookies.</span></div>`))).toBe(true);
  });

  test("matching is case-insensitive", () => {
    expect(detectConsentInHtml(htmlPage(`<SCRIPT SRC="HTTPS://CDN.COOKIELAW.ORG/OT.JS"></SCRIPT>`, ""))).toBe(true);
    expect(detectConsentInHtml(htmlPage("", `<H2>WE VALUE YOUR PRIVACY</H2>`))).toBe(true);
  });

  test("a plain site with cookie WORDS but no banner fingerprint does not trip detection", () => {
    const html = htmlPage(
      `<meta name="description" content="Homes for sale in Fort Lauderdale">`,
      `<h1>Find your home</h1><p>We use cookies to improve your experience — see our policy.</p>` +
        `<footer><a href="/privacy-policy">Privacy Policy</a> <a href="/cookie-policy">Cookie Policy</a></footer>`,
    );
    expect(detectConsentInHtml(html)).toBe(false);
  });

  test("empty and non-HTML input never detects", () => {
    expect(detectConsentInHtml("")).toBe(false);
    expect(detectConsentInHtml('{"json":true}')).toBe(false);
  });

  test("the signature list carries no bare generic words", () => {
    // A bare "cookie" / "privacy" / "gdpr" token would fire on almost
    // every site on the web and route the whole demo fleet through
    // metered Browserbase sessions — the list must stay fingerprints.
    for (const signature of CONSENT_HTML_SIGNATURES) {
      expect(["cookie", "privacy", "gdpr", "consent"]).not.toContain(signature);
    }
  });
});
