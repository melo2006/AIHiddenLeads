import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Regression suite for Ron's 2026-11-13 phone test of the three pinned
 * example links (Martinez / Steinberg / Saperstein):
 *
 *  - the live (Publish #40) client dropped the pinned leadId in the
 *    /demo → /demo-site hop, so /demo-site minted a throwaway lead
 *    named "Business" and ran a full fresh scan behind the 88%
 *    progress curtain;
 *  - Saperstein + Steinberg forbid iframe embedding, so their demo
 *    lives or dies by the stored screenshot — a failed/hung screenshot
 *    must degrade to content, never blackness.
 *
 * These tests pin the /demo-site half of the fix on main: a pinned
 * leadId loads the stored lead with NO scan creation, the real
 * business name is present from the first frame, the preview reveals
 * without waiting for the voice session, and a screenshot error lands
 * on the scan-content fallback. (The /demo hop itself is source-pinned
 * below — it is what the live build got wrong.)
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
  // Deliberately never calls onAssistantReady: the pinned fast reveal
  // must not depend on the voice session being warm.
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
import { pinnedExampleSeedForLeadId } from "@/lib/pinnedExampleSeed";
import { shouldHoldLoadingOverlay, SCREENSHOT_LOAD_TIMEOUT_MS } from "@/lib/demoStartup";

const SAPERSTEIN_LEAD_ID = "8db3a00c-b24c-4c5c-a371-67db376c28ef";
const STEINBERG_LEAD_ID = "51353057-8b1d-4e89-828b-ae12287efb3c";
const MARTINEZ_LEAD_ID = "10e46ba2-677d-4783-bcb2-1ddbe82e9fd3";
const SHOT_URL = "https://storage.example/demo-screenshots/saperstein-desktop.png";

const sapersteinRecord = {
  id: SAPERSTEIN_LEAD_ID,
  updated_at: "2026-11-13T20:33:37+00:00",
  scan_status: "enriched",
  full_name: "John Doe",
  business_name: "Paul Saperstein Homes",
  email: null,
  phone: null,
  website_url: "https://paulsapersteinhomes.com/",
  niche: "realtor",
  website_screenshot: SHOT_URL,
  screenshot_tablet: null,
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

const installSupabaseMocks = (options?: { browserSessionFails?: boolean }) => {
  mocks.rpc.mockImplementation((fn: string) => {
    if (fn === "get_demo_lead") return thenable({ data: sapersteinRecord, error: null });
    if (fn === "create_demo_lead") return thenable({ data: "throwaway-lead-id", error: null });
    return thenable({ data: null, error: null });
  });
  mocks.invoke.mockImplementation(async (fn: string) => {
    if (fn === "check-iframe-embed") return { data: { embeddable: false }, error: null };
    if (fn === "create-browser-session") {
      return options?.browserSessionFails
        ? { data: null, error: new Error("no live view") }
        : { data: { liveViewUrl: "https://live.example/view", sessionId: "s1", navigated: true }, error: null };
    }
    return { data: {}, error: null };
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

const invokeNames = () => mocks.invoke.mock.calls.map((call) => call[0]);
const rpcNames = () => mocks.rpc.mock.calls.map((call) => call[0]);

beforeEach(() => {
  mocks.rpc.mockReset();
  mocks.invoke.mockReset();
  installSupabaseMocks();
});

describe("pinned example seed", () => {
  it("resolves the three Frank-example leadIds to their real names", () => {
    expect(pinnedExampleSeedForLeadId(SAPERSTEIN_LEAD_ID)?.businessName).toBe("Paul Saperstein");
    expect(pinnedExampleSeedForLeadId(STEINBERG_LEAD_ID)?.businessName).toBe("Richard Steinberg Team");
    expect(pinnedExampleSeedForLeadId(MARTINEZ_LEAD_ID)?.businessName).toBe("Michael Martinez");
  });

  it("gives no seed to unknown leadIds", () => {
    expect(pinnedExampleSeedForLeadId("00000000-0000-0000-0000-000000000000")).toBeUndefined();
    expect(pinnedExampleSeedForLeadId(null)).toBeUndefined();
    expect(pinnedExampleSeedForLeadId(undefined)).toBeUndefined();
  });
});

describe("loading overlay decision", () => {
  it("holds for preview loading regardless of fast reveal", () => {
    expect(shouldHoldLoadingOverlay(true, true, true, true)).toBe(true);
    expect(shouldHoldLoadingOverlay(true, false, false, false)).toBe(true);
  });

  it("normal demos still wait for the assistant once a preview exists", () => {
    expect(shouldHoldLoadingOverlay(false, true, false, false)).toBe(true);
    expect(shouldHoldLoadingOverlay(false, true, true, false)).toBe(false);
  });

  it("pinned examples reveal on the preview alone — no voice-session wait", () => {
    expect(shouldHoldLoadingOverlay(false, true, false, true)).toBe(false);
  });

  it("screenshot load budget is bounded", () => {
    expect(SCREENSHOT_LOAD_TIMEOUT_MS).toBeGreaterThan(0);
    expect(SCREENSHOT_LOAD_TIMEOUT_MS).toBeLessThanOrEqual(30000);
  });
});

describe("/demo-site with a pinned example leadId", () => {
  it("never creates a lead or starts a scan", async () => {
    renderDemoSite(PINNED_URL);
    await screen.findAllByText("Paul Saperstein Homes");
    expect(rpcNames()).not.toContain("create_demo_lead");
    expect(invokeNames()).not.toContain("scan-website");
  });

  it("shows the real business name from the first frame, then the stored lead name", async () => {
    renderDemoSite(PINNED_URL);
    // Synchronous seed: the pinned map's name is already on screen
    // before get_demo_lead resolves — never "Business", never a bare
    // hostname as the headline.
    expect(screen.getAllByText(/Paul Saperstein/).length).toBeGreaterThan(0);
    expect(screen.queryByText("Business")).toBeNull();
    // The stored record merges over the seed when it lands.
    await screen.findAllByText("Paul Saperstein Homes");
    expect(screen.queryByText("Business")).toBeNull();
  });

  it("reveals the stored screenshot without waiting for the voice session", async () => {
    renderDemoSite(PINNED_URL);
    await waitFor(() => {
      expect(document.querySelector(`img[src^="${SHOT_URL}"]`)).not.toBeNull();
    });
    const shot = document.querySelector(`img[src^="${SHOT_URL}"]`) as Element;
    fireEvent.load(shot);
    await waitFor(() => {
      expect(screen.queryByTestId("scanning-animation")).toBeNull();
    });
    expect(screen.getByTestId("aspen-widget")).toBeTruthy();
  });

  it("lands on the scan-content fallback — not blackness — when the screenshot fails and no live view exists", async () => {
    installSupabaseMocks({ browserSessionFails: true });
    renderDemoSite(PINNED_URL);
    await screen.findAllByText("Paul Saperstein Homes");
    const shot = document.querySelector(`img[src^="${SHOT_URL}"]`);
    expect(shot).not.toBeNull();
    fireEvent.error(shot as Element);
    await screen.findByText(/uses the scan result instead/i);
  });
});

describe("generic (non-pinned) demo flow stays intact", () => {
  it("still creates a lead and scans for a bare URL arrival", async () => {
    renderDemoSite(
      `/demo-site?url=${encodeURIComponent("https://paulsapersteinhomes.com/")}&name=${encodeURIComponent("Paul Saperstein Homes")}`,
    );
    await waitFor(() => {
      expect(rpcNames()).toContain("create_demo_lead");
    });
    await waitFor(() => {
      expect(invokeNames()).toContain("scan-website");
    });
  });
});

describe("/demo sample hop (the hop the live build got wrong)", () => {
  it("TryDemo forwards the pinned leadId to /demo-site untouched", () => {
    const tryDemo = readFileSync(path.join(__dirname, "..", "pages", "TryDemo.tsx"), "utf8");
    expect(tryDemo).toContain('searchParams.get("leadId")');
    expect(tryDemo).toContain('params.set("leadId", pinnedLeadId)');
  });
});
