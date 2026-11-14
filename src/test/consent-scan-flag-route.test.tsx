import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

/**
 * Consent routing from the STORED SCAN FLAG (Publish #49 follow-up,
 * 2026-11-14).
 *
 * #49's live probe failed on the exact site it was built for:
 * check-iframe-embed's datacenter fetch of martinezrealtorsfl.com is
 * bot-walled, so it answered `unreachable` + no detection and the raw
 * iframe shipped the banner. Detection now lives in the scan capture
 * pipeline and is stored on the lead (`consent_banner_seen`). These
 * tests pin the precedence DemoSite must apply:
 *
 *  - stored TRUE routes the covered live view even when the probe
 *    says unreachable (Martinez's real verdicts);
 *  - stored FALSE keeps the fast raw-iframe path (Aurelia-class);
 *  - a flag that arrives MID-VISIT — this visit's own scan finishing —
 *    re-routes to the covered view without the page hanging.
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

const LIVE_VIEW_URL = "https://live.example/view";
const SHOT_URL = "https://storage.example/demo-screenshots/site-desktop.png";

const baseRecord = {
  updated_at: "2026-11-14T15:30:00+00:00",
  full_name: "John Doe",
  email: null,
  phone: null,
  niche: "realtor",
  website_screenshot: SHOT_URL,
  screenshot_tablet: null,
  screenshot_mobile: null,
  website_description: "Fort Lauderdale real estate, homes and condos.",
  website_content: "Listings, services and team. ".repeat(120),
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

const invokeNames = () => mocks.invoke.mock.calls.map((call) => call[0]);
const iframeSrcs = () =>
  Array.from(document.querySelectorAll("iframe")).map((frame) => frame.getAttribute("src") || "");

beforeEach(() => {
  mocks.rpc.mockReset();
  mocks.invoke.mockReset();
});

describe("stored scan-flag consent routing", () => {
  it("stored TRUE routes covered even when the probe says unreachable (the Martinez verdicts)", async () => {
    const MARTINEZ_LEAD_ID = "10e46ba2-677d-4783-bcb2-1ddbe82e9fd3";
    const CANONICAL_URL = "https://michaelmartinezrealtor.com/";
    const record = {
      ...baseRecord,
      id: MARTINEZ_LEAD_ID,
      scan_status: "enriched",
      business_name: "Michael Martinez",
      website_url: CANONICAL_URL,
      website_title: "Michael Martinez",
      consent_banner_seen: true,
      consent_banner_dismissed: true,
    };
    mocks.rpc.mockImplementation((fn: string) => {
      if (fn === "get_demo_lead") return thenable({ data: record, error: null });
      return thenable({ data: null, error: null });
    });
    mocks.invoke.mockImplementation(async (fn: string) => {
      if (fn === "check-iframe-embed") {
        // The exact deployed verdicts that defeated #49.
        return { data: { embeddable: false, unreachable: true, consentDetected: false }, error: null };
      }
      if (fn === "create-browser-session") {
        return { data: { liveViewUrl: LIVE_VIEW_URL, sessionId: "s1", navigated: true }, error: null };
      }
      return { data: {}, error: null };
    });

    render(
      <MemoryRouter
        initialEntries={[
          `/demo-site?url=${encodeURIComponent("https://www.martinezrealtorsfl.com/")}` +
            `&callerName=${encodeURIComponent("John Doe")}&sample=1&lang=en&leadId=${MARTINEZ_LEAD_ID}`,
        ]}
      >
        <Routes>
          <Route path="/demo-site" element={<DemoSite />} />
        </Routes>
      </MemoryRouter>,
    );

    // The probe is still consulted (it stays the secondary signal)…
    await waitFor(() => {
      expect(invokeNames()).toContain("check-iframe-embed");
    });
    // …but the stored flag starts the covered view despite its verdict.
    await waitFor(() => {
      expect(invokeNames()).toContain("create-browser-session");
    });
    await waitFor(() => {
      expect(iframeSrcs()).toContain(LIVE_VIEW_URL);
    });
    // The raw iframe (banner inside, undismissable) never mounts.
    expect(iframeSrcs().some((src) => src.startsWith(CANONICAL_URL))).toBe(false);
    expect(screen.getByTestId("aspen-widget")).toBeTruthy();
  });

  it("stored FALSE keeps the fast raw-iframe path — no Browserbase session (Aurelia-class)", async () => {
    const AURELIA_LEAD_ID = "850f3d17-85af-49e9-869b-aa6aa4ab540e";
    const AURELIA_URL = "https://www.aureliaperez.com/";
    const record = {
      ...baseRecord,
      id: AURELIA_LEAD_ID,
      scan_status: "enriched",
      business_name: "Aurelia Perez",
      website_url: AURELIA_URL,
      website_title: "Aurelia Perez",
      consent_banner_seen: false,
      consent_banner_dismissed: false,
    };
    mocks.rpc.mockImplementation((fn: string) => {
      if (fn === "get_demo_lead") return thenable({ data: record, error: null });
      return thenable({ data: null, error: null });
    });
    mocks.invoke.mockImplementation(async (fn: string) => {
      if (fn === "check-iframe-embed") {
        return { data: { embeddable: true, consentDetected: false, finalUrl: AURELIA_URL }, error: null };
      }
      if (fn === "create-browser-session") {
        return { data: { liveViewUrl: LIVE_VIEW_URL, sessionId: "s1", navigated: true }, error: null };
      }
      return { data: {}, error: null };
    });

    render(
      <MemoryRouter initialEntries={[`/demo-site?leadId=${AURELIA_LEAD_ID}`]}>
        <Routes>
          <Route path="/demo-site" element={<DemoSite />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(iframeSrcs().some((src) => src.startsWith(AURELIA_URL))).toBe(true);
    });
    // Give any stray effect a chance to fire, then pin the negative:
    // a witnessed no-banner site never pays for a covered session.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(invokeNames()).not.toContain("create-browser-session");
  });

  it("a flag arriving mid-visit (this visit's scan completing) re-routes to the covered view", async () => {
    const LEAD_ID = "22222222-2222-4222-8222-222222222222";
    const SITE_URL = "https://www.harborlightrealty.com/";
    const earlyRecord = {
      ...baseRecord,
      id: LEAD_ID,
      // Stale 'scanning' row: not terminal, not recently scanning, and
      // crucially carrying NO consent flag yet.
      scan_status: "scanning",
      updated_at: "2026-01-01T00:00:00+00:00",
      business_name: "Harbor Light Realty",
      website_url: SITE_URL,
      website_title: "Harbor Light Realty",
      consent_banner_seen: null,
      consent_banner_dismissed: null,
    };
    const scannedRecord = {
      ...earlyRecord,
      scan_status: "completed",
      updated_at: "2026-11-14T15:40:00+00:00",
      consent_banner_seen: true,
      consent_banner_dismissed: true,
    };
    let leadCalls = 0;
    mocks.rpc.mockImplementation((fn: string) => {
      if (fn === "get_demo_lead") {
        leadCalls += 1;
        // Calls 1–3 see the pre-scan row (initial load, poll sync, the
        // scan flow's pre-check); the scan's completion lands the flag.
        return thenable({ data: leadCalls <= 3 ? earlyRecord : scannedRecord, error: null });
      }
      return thenable({ data: null, error: null });
    });
    mocks.invoke.mockImplementation(async (fn: string) => {
      if (fn === "check-iframe-embed") {
        return { data: { embeddable: true, consentDetected: false, finalUrl: SITE_URL }, error: null };
      }
      if (fn === "create-browser-session") {
        return { data: { liveViewUrl: LIVE_VIEW_URL, sessionId: "s1", navigated: true }, error: null };
      }
      return { data: {}, error: null };
    });

    render(
      <MemoryRouter initialEntries={[`/demo-site?leadId=${LEAD_ID}&scan=1`]}>
        <Routes>
          <Route path="/demo-site" element={<DemoSite />} />
        </Routes>
      </MemoryRouter>,
    );

    // The visit's own scan ran…
    await waitFor(() => {
      expect(invokeNames()).toContain("scan-website");
    });
    // …and when its record landed with the flag, the covered view
    // started even though the probe never detected a banner.
    await waitFor(() => {
      expect(invokeNames()).toContain("create-browser-session");
    });
    await waitFor(() => {
      expect(iframeSrcs()).toContain(LIVE_VIEW_URL);
    });
    // The reveal machinery was never held hostage by the re-route:
    // once the interim screenshot paints (jsdom never fires img load
    // on its own — a real browser does), the page settles with the
    // assistant mounted over the interim visual.
    const shot = document.querySelector(`img[src^="${SHOT_URL}"]`);
    expect(shot).not.toBeNull();
    fireEvent.load(shot as Element);
    await waitFor(() => {
      expect(screen.getByTestId("aspen-widget")).toBeTruthy();
    });
  });
});
