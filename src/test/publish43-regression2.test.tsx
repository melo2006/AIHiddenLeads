import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

/**
 * Publish #43 regression round 2 (2026-11-14) — the Frank pinned
 * demos STILL never revealed on the live site after Publish #43,
 * while Aurelia's lead revealed through the scan-based preview.
 *
 * Traced divergence (live probes against the real backend, exact
 * /demo?leadId=… entry URLs): Aurelia's chain settled through the
 * scan-FALLBACK state, where the round-1 pinnedFallbackReady reveal
 * arms. The Frank demos' sites are judged EMBEDDABLE by
 * check-iframe-embed (Martinez) or reach the fallback only via the
 * 8s slow-iframe rescue timer (Saperstein), so their reveal stayed
 * chained to (a) the target iframe's load event — a heavy
 * third-party page — or (b) a multi-megabyte stored screenshot
 * download (Martinez's desktop capture is 9.3 MB), with every
 * rescue a sequential timer. On a slow network, or in a browser tab
 * whose timers are throttled, the chain stretched past 3.5 minutes
 * while the stored scan content sat rendered behind the curtain.
 *
 * The fix pinned here:
 *  1. Stored-content reveal on EVERY path: once a pinned lead's
 *     record has merged and carries scan content, the demo reveals
 *     on that content immediately — no iframe check verdict, no
 *     screenshot download, no rescue timer in the chain. Richer
 *     previews still take over when they arrive.
 *  2. A hard 15s deadline: if a pinned demo has not revealed by
 *     then, every preview gate is force-settled and the stored
 *     record is pulled once more.
 *  3. Scope pin: a pinned record WITHOUT stored content still
 *     waits for a real preview — the curtain does not just drop.
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
  rpcCalls: { getDemoLead: 0 },
  checkEmbed: { mode: "embeddable" as "embeddable" | "blocked" },
  leadRecord: null as null | Record<string, unknown>,
  hangFirstLeadFetch: false,
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
import { PINNED_REVEAL_DEADLINE_MS } from "@/lib/demoStartup";

const MARTINEZ_LEAD_ID = "10e46ba2-677d-4783-bcb2-1ddbe82e9fd3";
const DESKTOP_SHOT = "https://storage.example/demo-screenshots/martinez-desktop.png";
const TABLET_SHOT = "https://storage.example/website-screenshots/martinez-tablet.undefined";

// The stored record as it exists in production: enriched, with the
// re-hosted desktop capture, the empty .undefined variants, and the
// full scanned content (156 KB in production; shortened here).
const martinezRecord = {
  id: MARTINEZ_LEAD_ID,
  updated_at: "2026-11-13T21:28:10+00:00",
  scan_status: "enriched",
  full_name: "CRM Prospect",
  business_name: "Michael Martinez Group",
  email: null,
  phone: null,
  website_url: "https://michaelmartinezrealtor.com/",
  niche: "realtors",
  website_screenshot: DESKTOP_SHOT,
  screenshot_tablet: TABLET_SHOT,
  screenshot_mobile: TABLET_SHOT.replace("tablet", "mobile"),
  website_title: "Michael Martinez Realtor | South Florida Real Estate",
  website_description: "You can count on Michael Martinez Group to help you sell and buy a home.",
  website_content: "Michael Martinez Group listings, services and team. ".repeat(120),
  brand_colors: { primary: "#06623B" },
  brand_logo: "https://media-production.lp-cdn.com/logo.png",
};

const thenable = (value: unknown) => {
  const promise = Promise.resolve(value) as Promise<unknown> & {
    maybeSingle: () => Promise<unknown>;
  };
  promise.maybeSingle = () => Promise.resolve(value);
  return promise;
};

const hangingThenable = () => {
  const promise = new Promise<unknown>(() => {}) as Promise<unknown> & {
    maybeSingle: () => Promise<unknown>;
  };
  promise.maybeSingle = () => new Promise<unknown>(() => {});
  return promise;
};

const installSupabaseMocks = () => {
  mocks.rpc.mockImplementation((fn: string) => {
    if (fn === "get_demo_lead") {
      mocks.rpcCalls.getDemoLead += 1;
      if (mocks.hangFirstLeadFetch && mocks.rpcCalls.getDemoLead === 1) {
        return hangingThenable();
      }
      return thenable({ data: mocks.leadRecord, error: null });
    }
    return thenable({ data: null, error: null });
  });
  mocks.invoke.mockImplementation((fn: string) => {
    if (fn === "check-iframe-embed") {
      return Promise.resolve({
        data: { embeddable: mocks.checkEmbed.mode === "embeddable" },
        error: null,
      });
    }
    if (fn === "create-browser-session") {
      // Never resolves: the reveal must not depend on it in any way.
      return new Promise(() => {});
    }
    return Promise.resolve({ data: {}, error: null });
  });
};

const PINNED_URL =
  `/demo-site?url=${encodeURIComponent("https://michaelmartinezrealtor.com/")}` +
  `&callerName=${encodeURIComponent("John Doe")}&sample=1&lang=en&leadId=${MARTINEZ_LEAD_ID}`;

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
  mocks.rpcCalls.getDemoLead = 0;
  mocks.checkEmbed.mode = "embeddable";
  mocks.leadRecord = martinezRecord;
  mocks.hangFirstLeadFetch = false;
  installSupabaseMocks();
  setViewportWidth(1280); // desktop band — the live-verify viewport class
});

afterEach(() => {
  vi.useRealTimers();
  setViewportWidth(1024);
});

describe("round 2 — pinned demo on an EMBEDDABLE site (the Frank chain)", () => {
  it("reveals on the stored scan content as soon as the record merges — no iframe load, screenshot load, live view, or rescue timer in the chain", async () => {
    renderDemoSite(PINNED_URL);
    // jsdom never fires the target iframe's load event and the
    // screenshot <img> never loads or errors — exactly the stalled
    // live state. The demo must still reveal on stored content.
    await waitFor(() => {
      expect(screen.queryByTestId("scanning-animation")).toBeNull();
    });
    expect(screen.getByTestId("demo-widget")).toBeTruthy();
    expect(screen.getByText(/uses the scan result instead/i)).toBeTruthy();
    // The reveal needed no Browserbase session at all.
    const sessionCalls = mocks.invoke.mock.calls.filter((c) => c[0] === "create-browser-session");
    expect(sessionCalls.length).toBe(0);
  });

  it("hard deadline: when the first record fetch hangs, the 15s deadline re-pulls the record and the demo reveals", async () => {
    vi.useFakeTimers();
    mocks.hangFirstLeadFetch = true;
    renderDemoSite(PINNED_URL);
    // Let the mount effects run; the record fetch is hanging, so
    // there is no content and the curtain is correctly still up.
    await act(async () => {});
    expect(screen.queryByTestId("scanning-animation")).not.toBeNull();
    expect(screen.queryByTestId("demo-widget")).toBeNull();
    // Fire the deadline: gates force-settle and the record is
    // re-pulled (this time it answers).
    await act(async () => {
      vi.advanceTimersByTime(PINNED_REVEAL_DEADLINE_MS);
    });
    await act(async () => {});
    expect(mocks.rpcCalls.getDemoLead).toBeGreaterThanOrEqual(2);
    expect(screen.queryByTestId("scanning-animation")).toBeNull();
    expect(screen.getByTestId("demo-widget")).toBeTruthy();
  });

  it("scope pin: a pinned record WITHOUT stored content still waits for a real preview — the curtain does not just drop", async () => {
    mocks.leadRecord = {
      ...martinezRecord,
      website_content: "",
      website_description: "",
      website_title: "",
    };
    renderDemoSite(PINNED_URL);
    // Give the record time to merge and every state gate a chance
    // to (wrongly) release.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300));
    });
    expect(screen.queryByTestId("scanning-animation")).not.toBeNull();
    expect(screen.queryByTestId("demo-widget")).toBeNull();
  });
});
