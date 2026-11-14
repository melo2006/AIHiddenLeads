import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

/**
 * Consent-covered live-view route (Publish #48 follow-up, 2026-11-14).
 *
 * The verified gap: the Martinez demo's site ALLOWS framing, so
 * DemoSite presented it through the raw cross-origin iframe — and the
 * "We value your privacy" banner sat in the middle of the live demo,
 * because a cross-origin iframe's DOM cannot be scripted and #48's
 * dismissal never runs there. check-iframe-embed now also reports
 * `consentDetected` (a consent-banner fingerprint in the site's
 * HTML), and for such sites the demo's live presentation must be
 * the dismissal-covered Browserbase live view:
 *
 *  - covered view starts even though the raw iframe would work and
 *    a stored screenshot exists;
 *  - the raw iframe stays unmounted while the covered view is
 *    pending/live (no banner flash);
 *  - the raw iframe is the last resort when the covered view fails;
 *  - without a detected banner, routing is exactly as before.
 */

// jsdom has no ResizeObserver; DemoSite observes its header bar.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = (globalThis as any).ResizeObserver || ResizeObserverStub;

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: mocks.rpc,
    functions: { invoke: mocks.invoke },
  },
}));

vi.mock("@/lib/voicePreload", () => ({ preloadVoiceIdentity: vi.fn(async () => {}) }));
vi.mock("@/lib/campaignTracking", () => ({ linkCampaignLead: vi.fn() }));
vi.mock("@/lib/demoVerification", () => ({
  getDemoVerificationStatus: vi.fn(async () => ({ ok: false })),
  extractSpokenCode: () => null,
  clearDemoResume: vi.fn(),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en", resolvedLanguage: "en", changeLanguage: vi.fn(async () => {}) },
  }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/components/landing/demo-results/AspenDemoWidget", () => ({
  default: (props: { businessName?: string }) => (
    <div data-testid="aspen-widget">{props.businessName}</div>
  ),
}));
vi.mock("@/components/landing/demo-results/WebsiteShowcase", () => ({
  default: () => <div data-testid="website-showcase" />,
}));
vi.mock("@/components/landing/demo-results/GeoGridWidget", () => ({ default: () => null }));
vi.mock("@/components/landing/demo-results/RankAuditPanel", () => ({ default: () => null }));
vi.mock("@/components/landing/demo-results/DemoWatermark", () => ({ default: () => null }));
vi.mock("@/components/landing/demo-results/DemoVerificationGate", () => ({ default: () => null }));
vi.mock("@/components/landing/DemoReassuranceStrip", () => ({ default: () => null }));
vi.mock("@/components/LanguageSwitcher", () => ({ default: () => null }));
vi.mock("@/components/landing/ScanningAnimation", () => ({
  default: (props: { businessName?: string }) => (
    <div data-testid="scanning-animation">{props.businessName}</div>
  ),
}));

import DemoSite from "@/pages/DemoSite";

const MARTINEZ_LEAD_ID = "10e46ba2-677d-4783-bcb2-1ddbe82e9fd3";
const CANONICAL_URL = "https://michaelmartinezrealtor.com/";
const SHOT_URL = "https://storage.example/demo-screenshots/martinez-desktop.png";
const LIVE_VIEW_URL = "https://live.example/view";

const martinezRecord = {
  id: MARTINEZ_LEAD_ID,
  updated_at: "2026-11-14T13:00:00+00:00",
  scan_status: "enriched",
  full_name: "John Doe",
  business_name: "Michael Martinez",
  email: null,
  phone: null,
  website_url: CANONICAL_URL,
  niche: "realtor",
  website_screenshot: SHOT_URL,
  screenshot_tablet: null,
  screenshot_mobile: null,
  website_title: "Michael Martinez",
  website_description: "Fort Lauderdale real estate, homes and condos.",
  website_content: "Martinez Realtors listings, services and team. ".repeat(120),
  brand_colors: {},
  brand_logo: "",
};

const thenable = (value: unknown) => {
  const promise = Promise.resolve(value) as Promise<unknown> & {
    maybeSingle: () => Promise<unknown>;
  };
  promise.maybeSingle = () => Promise.resolve(value);
  return promise;
};

const installSupabaseMocks = (options: { consentDetected: boolean; browserSessionFails?: boolean }) => {
  mocks.rpc.mockImplementation((fn: string) => {
    if (fn === "get_demo_lead") return thenable({ data: martinezRecord, error: null });
    return thenable({ data: null, error: null });
  });
  mocks.invoke.mockImplementation(async (fn: string) => {
    if (fn === "check-iframe-embed") {
      return {
        data: { embeddable: true, consentDetected: options.consentDetected, finalUrl: CANONICAL_URL },
        error: null,
      };
    }
    if (fn === "create-browser-session") {
      return options.browserSessionFails
        ? { data: null, error: new Error("quota exceeded") }
        : { data: { liveViewUrl: LIVE_VIEW_URL, sessionId: "s1", navigated: true }, error: null };
    }
    return { data: {}, error: null };
  });
};

// The exact hand-shared entry form: vanity domain in the link, the
// pinned leadId doing the identifying.
const MARTINEZ_URL =
  `/demo-site?url=${encodeURIComponent("https://www.martinezrealtorsfl.com/")}` +
  `&callerName=${encodeURIComponent("John Doe")}&sample=1&lang=en&leadId=${MARTINEZ_LEAD_ID}`;

const renderDemoSite = () =>
  render(
    <MemoryRouter initialEntries={[MARTINEZ_URL]}>
      <Routes>
        <Route path="/demo-site" element={<DemoSite />} />
      </Routes>
    </MemoryRouter>,
  );

const invokeNames = () => mocks.invoke.mock.calls.map((call) => call[0]);
const iframeSrcs = () =>
  Array.from(document.querySelectorAll("iframe")).map((frame) => frame.getAttribute("src") || "");

beforeEach(() => {
  mocks.rpc.mockReset();
  mocks.invoke.mockReset();
});

describe("consent-covered live-view route (Martinez shape)", () => {
  it("routes an embeddable banner site to the covered live view — raw iframe never mounts", async () => {
    installSupabaseMocks({ consentDetected: true });
    renderDemoSite();

    // The covered session starts even though the site is embeddable
    // AND a stored screenshot exists.
    await waitFor(() => {
      expect(invokeNames()).toContain("create-browser-session");
    });
    // The covered live view is the live presentation…
    await waitFor(() => {
      expect(iframeSrcs()).toContain(LIVE_VIEW_URL);
    });
    // …and the raw cross-origin iframe (whose banner cannot be
    // dismissed) is never mounted.
    expect(iframeSrcs().some((src) => src.startsWith(CANONICAL_URL))).toBe(false);
    // The stored screenshot is the interim visual underneath.
    expect(document.querySelector(`img[src^="${SHOT_URL}"]`)).not.toBeNull();
    expect(screen.getByTestId("aspen-widget")).toBeTruthy();
  });

  it("falls back to the raw iframe — the last resort — when the covered view fails", async () => {
    installSupabaseMocks({ consentDetected: true, browserSessionFails: true });
    renderDemoSite();

    await waitFor(() => {
      expect(invokeNames()).toContain("create-browser-session");
    });
    await waitFor(() => {
      expect(iframeSrcs().some((src) => src.startsWith(CANONICAL_URL))).toBe(true);
    });
    expect(iframeSrcs()).not.toContain(LIVE_VIEW_URL);
  });

  it("without a detected banner, routing is unchanged: raw iframe, no Browserbase session", async () => {
    installSupabaseMocks({ consentDetected: false });
    renderDemoSite();

    await waitFor(() => {
      expect(iframeSrcs().some((src) => src.startsWith(CANONICAL_URL))).toBe(true);
    });
    // Give any stray effect a chance to fire, then pin the negative:
    // no consent verdict, no metered session.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(invokeNames()).not.toContain("create-browser-session");
  });
});
