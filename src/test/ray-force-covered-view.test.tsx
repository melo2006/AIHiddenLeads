import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

/**
 * Forced covered view from the STORED PIN (Ray Miramontes fix,
 * 2026-11-15).
 *
 * mira-realestate.com defeats every existing route: check-iframe-embed's
 * server-side fetch succeeds (200, no framing headers) so the probe
 * reports EMBEDDABLE, but real browser navigation is refused
 * (HTTP 403 / ERR_BLOCKED_BY_RESPONSE). The browser error page fires
 * the iframe's load event, DemoSite marks the iframe loaded, the
 * blocked watchdog stands down and the screenshot fallback (which
 * requires !hasIframeLoaded) never engages — visitors saw the error
 * page with a real stored screenshot sitting unused.
 *
 * The stored pin `force_covered_view` (asserted onto Ray's lead by
 * refresh-example-leads from the pinned map) is the witness. These
 * tests pin:
 *
 *  - stored TRUE + the probe's real "embeddable" verdict → the
 *    covered screenshot view is presented, the raw iframe NEVER
 *    mounts, and no Browserbase session is spent (the screenshot
 *    exists and loads, so the cost rule holds);
 *  - the SAME record with the pin absent keeps the raw-iframe path —
 *    the pin, and nothing else, changes the presentation;
 *  - the pin is not a consent signal: Ray's record carries
 *    consent_banner_seen=false throughout, and no consent routing is
 *    involved in either case.
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
vi.mock("@/components/DemoReassuranceStrip", () => ({ default: () => null }));
vi.mock("@/components/LanguageSwitcher", () => ({ default: () => null }));
vi.mock("@/components/landing/ScanningAnimation", () => ({
  default: (props: { businessName?: string }) => (
    <div data-testid="scanning-animation">{props.businessName}</div>
  ),
}));

import DemoSite from "@/pages/DemoSite";

const RAY_LEAD_ID = "0d9883e5-8ca9-44a9-b9bb-6d248178ab64";
const RAY_URL = "https://mira-realestate.com/";
const SHOT_URL = "https://storage.example/demo-screenshots/ray-desktop.png";
const LIVE_VIEW_URL = "https://live.example/view";

const rayRecord = (forceCoveredView: boolean | null) => ({
  id: RAY_LEAD_ID,
  updated_at: "2026-11-15T15:30:00+00:00",
  full_name: "John Doe",
  email: null,
  phone: null,
  niche: "realtor",
  scan_status: "enriched",
  business_name: "Mira Real Estate",
  website_url: RAY_URL,
  website_title: "Mira Real Estate",
  website_screenshot: SHOT_URL,
  screenshot_tablet: null,
  screenshot_mobile: null,
  website_description: "Greater Los Angeles real estate, buying and selling.",
  website_content: "Listings, services and team. ".repeat(120),
  brand_colors: {},
  brand_logo: "",
  // Ray's consent state is FALSE and stays out of this entirely:
  // the forced covered view is a presentation pin, not a consent pin.
  consent_banner_seen: false,
  consent_banner_dismissed: false,
  force_covered_view: forceCoveredView,
});

const thenable = (value: unknown) => {
  const promise = Promise.resolve(value) as Promise<unknown> & {
    maybeSingle: () => Promise<unknown>;
  };
  promise.maybeSingle = () => Promise.resolve(value);
  return promise;
};

const invokeNames = () => mocks.invoke.mock.calls.map((call) => call[0]);
const iframeSrcs = () =>
  Array.from(document.querySelectorAll("iframe")).map((frame) => frame.getAttribute("src") || "");

const setupMocks = (record: ReturnType<typeof rayRecord>) => {
  mocks.rpc.mockImplementation((fn: string) => {
    if (fn === "get_demo_lead") return thenable({ data: record, error: null });
    return thenable({ data: null, error: null });
  });
  mocks.invoke.mockImplementation(async (fn: string) => {
    if (fn === "check-iframe-embed") {
      // The exact deployed verdict that caused the bug: the probe's
      // server-side fetch succeeds, so it reports embeddable.
      return { data: { embeddable: true, consentDetected: false, finalUrl: RAY_URL }, error: null };
    }
    if (fn === "create-browser-session") {
      return { data: { liveViewUrl: LIVE_VIEW_URL, sessionId: "s1", navigated: true }, error: null };
    }
    return { data: {}, error: null };
  });
};

const renderRay = () =>
  render(
    <MemoryRouter initialEntries={[`/demo-site?leadId=${RAY_LEAD_ID}`]}>
      <Routes>
        <Route path="/demo-site" element={<DemoSite />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  mocks.rpc.mockReset();
  mocks.invoke.mockReset();
});

describe("forced covered view (Ray Miramontes)", () => {
  it("stored TRUE presents the covered screenshot view even though the probe says embeddable", async () => {
    setupMocks(rayRecord(true));
    renderRay();

    // The probe is still consulted (it stays a signal for other routes)…
    await waitFor(() => {
      expect(invokeNames()).toContain("check-iframe-embed");
    });
    // …but the covered screenshot view is the presentation.
    await waitFor(() => {
      expect(document.querySelector(`img[src^="${SHOT_URL}"]`)).not.toBeNull();
    });
    // The raw iframe — which would land on the browser error page and
    // disarm the fallback by firing load — NEVER mounts.
    expect(iframeSrcs().some((src) => src.startsWith(RAY_URL))).toBe(false);
    // The screenshot exists and has not failed, so the cost rule
    // holds: no Browserbase session is spent on the forced route.
    expect(invokeNames()).not.toContain("create-browser-session");
    // Once the screenshot paints, the demo settles with the assistant
    // mounted over the covered view.
    const shot = document.querySelector(`img[src^="${SHOT_URL}"]`);
    fireEvent.load(shot as Element);
    await waitFor(() => {
      expect(screen.getByTestId("aspen-widget")).toBeTruthy();
    });
    expect(iframeSrcs().some((src) => src.startsWith(RAY_URL))).toBe(false);
  });

  it("the same record WITHOUT the pin keeps the raw-iframe path (pin absent = behavior unchanged)", async () => {
    setupMocks(rayRecord(false));
    renderRay();

    await waitFor(() => {
      expect(iframeSrcs().some((src) => src.startsWith(RAY_URL))).toBe(true);
    });
    // No covered routing of any kind engages without the pin.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(invokeNames()).not.toContain("create-browser-session");
  });
});
