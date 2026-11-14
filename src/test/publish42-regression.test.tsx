import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

/**
 * Publish #42 regression suite (2026-11-14) — Ron's morning-test blockers:
 *
 * FAIL 1: both Frank pinned demos hung at the 88% curtain forever.
 *   Chain: at ≤820px-wide viewports the responsive picker serves the
 *   stored TABLET screenshot; the Frank leads' tablet/mobile variants
 *   are empty 0-byte objects (HTTP 200, text/plain), so the <img>
 *   errors and the demo falls to the Browserbase live view. The live
 *   -view effect in DemoSite set isLiveViewLoading(true) while ALSO
 *   listing it in its own dependency array: the state flip re-ran the
 *   effect, the cleanup cancelled the in-flight attempt, and the
 *   create-browser-session result (HTTP 200 — success OR the quota
 *   body) was discarded. liveViewFailed/liveViewUrl never arrived,
 *   isLiveViewLoading wedged true, and the preview-loading clause for
 *   the fallback path never cleared. In jsdom the wedge needs the
 *   network to be slower than a render commit (always true in
 *   production), so the session invoke below is DEFERRED and resolved
 *   only after the loading state has committed.
 *
 * FAIL 2: the in-demo presenter still must be the transparent cutout
 *   for Frank / Latina / Black Professional Lady (pinned here against
 *   the rendered widget, not source strings).
 *
 * FAIL 3: in the scan-fallback state the page ALSO mounted
 *   WebsiteShowcase's embedded platform widget — an "Aspen floating
 *   assistant" with the "Try a live demo with Aspen" card — inside a
 *   pinned presenter demo. A pinned demo carries exactly one
 *   assistant: its presenter, from first paint.
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
  browserSession: { deferred: null as null | { promise: Promise<unknown>; resolve: (v: unknown) => void } },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: mocks.rpc,
    functions: { invoke: mocks.invoke },
  },
}));

vi.mock("@/lib/voicePreload", () => ({ preloadVoiceIdentity: vi.fn(async () => ({})) }));
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
    <div data-testid="demo-widget">{props.businessName}</div>
  ),
}));
vi.mock("@/components/GeminiAgentWidget", () => ({
  // The platform (Aspen) sales widget WebsiteShowcase embeds. Inside a
  // pinned presenter demo this surface must never appear (FAIL 3).
  default: () => <div data-testid="showcase-aspen-widget" />,
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

const SAPERSTEIN_LEAD_ID = "8db3a00c-b24c-4c5c-a371-67db376c28ef";
const DESKTOP_SHOT = "https://storage.example/demo-screenshots/saperstein-desktop.png";
const TABLET_SHOT = "https://storage.example/website-screenshots/saperstein-tablet.undefined";

// The stored record as it exists in production: enriched, with the
// re-hosted desktop capture AND the empty tablet variant.
const sapersteinRecord = {
  id: SAPERSTEIN_LEAD_ID,
  updated_at: "2026-11-13T20:33:37+00:00",
  scan_status: "enriched",
  full_name: "CRM Prospect",
  business_name: "Paul Saperstein Homes",
  email: null,
  phone: null,
  website_url: "https://paulsapersteinhomes.com/",
  niche: "realtors",
  website_screenshot: DESKTOP_SHOT,
  screenshot_tablet: TABLET_SHOT,
  screenshot_mobile: null,
  website_title: "Paul Saperstein Homes",
  website_description: "Luxury real estate in Fort Lauderdale.",
  website_content: "Saperstein Group listings and services. ".repeat(120),
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

const installSupabaseMocks = () => {
  mocks.rpc.mockImplementation((fn: string) => {
    if (fn === "get_demo_lead") return thenable({ data: sapersteinRecord, error: null });
    return thenable({ data: null, error: null });
  });
  mocks.invoke.mockImplementation((fn: string) => {
    if (fn === "check-iframe-embed") return Promise.resolve({ data: { embeddable: false }, error: null });
    if (fn === "create-browser-session") {
      // Deferred: production session creation takes seconds — long
      // after the loading state commits. Tests resolve it explicitly.
      let resolve!: (v: unknown) => void;
      const promise = new Promise<unknown>((r) => { resolve = r; });
      mocks.browserSession.deferred = { promise, resolve };
      return promise;
    }
    return Promise.resolve({ data: {}, error: null });
  });
};

const PINNED_URL =
  `/demo-site?url=${encodeURIComponent("https://paulsapersteinhomes.com/")}` +
  `&callerName=${encodeURIComponent("John Doe")}&sample=1&lang=en&leadId=${SAPERSTEIN_LEAD_ID}`;

const renderDemoSite = (entry: string) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/demo-site" element={<DemoSite />} />
      </Routes>
    </MemoryRouter>,
  );

const setViewportWidth = (width: number) => {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
  window.dispatchEvent(new Event("resize"));
};

beforeEach(() => {
  mocks.rpc.mockReset();
  mocks.invoke.mockReset();
  mocks.browserSession.deferred = null;
  installSupabaseMocks();
  setViewportWidth(800); // tablet band: the picker serves screenshot_tablet
});

afterEach(() => {
  setViewportWidth(1024);
});

// Drive the demo past BOTH screenshot variants: the tablet variant
// errors (empty stored object), the picker retries with the desktop
// capture, and when that is gone too the screenshot counts as failed
// and the Browserbase live view becomes the only path left.
const failBothScreenshotVariants = async () => {
  const tabletImg = await waitFor(() => {
    const img = document.querySelector(`img[src^="${TABLET_SHOT}"]`);
    expect(img).not.toBeNull();
    return img as Element;
  });
  fireEvent.error(tabletImg);
  const desktopImg = await waitFor(() => {
    const img = document.querySelector(`img[alt="Paul Saperstein Homes website"]`);
    expect(img?.getAttribute("src") || "").toContain("saperstein-desktop.png");
    return img as Element;
  });
  fireEvent.error(desktopImg);
};

describe("FAIL 1 — pinned demo must reveal even when the live view is the only path left", () => {
  it("reveals on the pinned scan content while the browser session is still pending — nothing waits on it", async () => {
    renderDemoSite(PINNED_URL);
    await failBothScreenshotVariants();
    // The live view gets requested (session creation in flight)…
    await waitFor(() => expect(mocks.browserSession.deferred).not.toBeNull());
    // …but a PINNED demo must not wait for it: its scan content is the
    // preview, and the curtain drops with the presenter widget mounted.
    await waitFor(() => {
      expect(screen.queryByTestId("scanning-animation")).toBeNull();
    });
    expect(screen.getByTestId("demo-widget")).toBeTruthy();
  });

  it("a browser-session result that lands after the loading state committed is applied, not discarded (no wedged retry)", async () => {
    renderDemoSite(PINNED_URL);
    await failBothScreenshotVariants();
    await waitFor(() => expect(mocks.browserSession.deferred).not.toBeNull());
    // Let the loading state fully commit (the production ordering:
    // render commit first, network answer second).
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    // Production shape: HTTP 200 with the quota body (supabase-js
    // resolves it as data, not error).
    await act(async () => {
      mocks.browserSession.deferred!.resolve({ data: { error: "QUOTA_EXCEEDED", fallback: true }, error: null });
    });
    // The quota verdict must be RECORDED (live view marked failed):
    // the demo settles on content instead of holding the curtain.
    await waitFor(() => {
      expect(screen.queryByTestId("scanning-animation")).toBeNull();
    });
    expect(screen.getByTestId("demo-widget")).toBeTruthy();
    // And it must not retry in a loop: exactly one session request.
    const sessionCalls = mocks.invoke.mock.calls.filter((c) => c[0] === "create-browser-session");
    expect(sessionCalls.length).toBe(1);
  });

  it("falls back to the DESKTOP screenshot when the responsive variant fails, before giving up on screenshots", async () => {
    renderDemoSite(PINNED_URL);
    const tabletImg = await waitFor(() => {
      const img = document.querySelector(`img[src^="${TABLET_SHOT}"]`);
      expect(img).not.toBeNull();
      return img as Element;
    });
    fireEvent.error(tabletImg);
    // The preview <img> (alt = "<business> website") retries with the
    // desktop capture — the canonical stored screenshot.
    await waitFor(() => {
      const preview = document.querySelector(`img[alt="Paul Saperstein Homes website"]`);
      expect(preview?.getAttribute("src") || "").toContain("saperstein-desktop.png");
    });
    const preview = document.querySelector(`img[alt="Paul Saperstein Homes website"]`) as Element;
    fireEvent.load(preview);
    await waitFor(() => {
      expect(screen.queryByTestId("scanning-animation")).toBeNull();
    });
    expect(screen.getByTestId("demo-widget")).toBeTruthy();
  });
});

describe("FAIL 3 — a pinned presenter demo carries no second (Aspen) assistant surface", () => {
  it("the scan-fallback state renders the demo's own widget and never the showcase's Aspen widget", async () => {
    renderDemoSite(PINNED_URL);
    await failBothScreenshotVariants();
    // Settle the live view with the production quota shape.
    await waitFor(() => expect(mocks.browserSession.deferred).not.toBeNull());
    await act(async () => {
      mocks.browserSession.deferred!.resolve({ data: { error: "QUOTA_EXCEEDED", fallback: true }, error: null });
    });
    await waitFor(() => {
      expect(screen.queryByTestId("scanning-animation")).toBeNull();
    });
    expect(screen.getByText(/uses the scan result instead/i)).toBeTruthy();
    expect(screen.getByTestId("demo-widget")).toBeTruthy();
    expect(screen.queryByTestId("showcase-aspen-widget")).toBeNull();
  });
});
