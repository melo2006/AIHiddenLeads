import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import ResellerPricing from "@/components/crm/ResellerPricing";
import ResellerCatalog from "@/components/crm/ResellerCatalog";
import TenantsView from "@/components/crm/TenantsView";
import { DEFAULT_RATE_CARD } from "@/lib/rateCard";

// Phase 2.5 screens (multi-tenant / reseller design, 2026-11-18
// §12): the reseller's selling-prices page and catalog page, and the
// admin Tenants demo panel + read-only retail summary. Assertions
// pin the white-label boundary: no platform costs, no vendor names,
// settlement always USD. (Radix Select popups don't open reliably in
// jsdom, so mode/currency switching is exercised in the Playwright
// QA script instead; the pricing math itself is unit-tested.)

const RATES = [
  { code: "USD", rate: 1, edited: false, asOf: "2026-11-18" },
  { code: "CAD", rate: 1.39, edited: false, asOf: "2026-11-18" },
  { code: "BRL", rate: 5.35, edited: false, asOf: "2026-11-18" },
];

const retailFixture = {
  organizationId: "org-reseller",
  wholesale: [
    { key: "voice_minutes", label: "Voice minutes", unit: "minute", priceUsd: 0.0499 },
    { key: "avatar_minutes", label: "Avatar/video minutes", unit: "minute", priceUsd: 0.05 },
    { key: "website_scan", label: "Website scan for a demo", unit: "scan", priceUsd: 1 },
  ],
  retail: {},
  lines: [],
  customerPrices: [],
  customerCurrency: "USD",
  currencies: RATES,
};

const catalogFixture = {
  organizationId: "org-reseller",
  selection: { avatars: null, voices: null, languages: ["en", "es", "pt-BR"] },
  charges: { avatarCreationUsd: 25, voiceCloneUsd: 5 },
  features: { voiceCloning: true, videoAvatar: true },
};

const demoTenantFixture = {
  id: "org-demo-reseller", name: "NorthPeak Partners", type: "reseller", status: "active", isDemo: true,
  parentOrganizationId: null, parentName: null,
  branding: { logoUrl: null, slogan: "Every call answered. Every lead captured.", supportEmail: "support@northpeakpartners.example", brandColor: "#0ea5e9" },
  limits: { maxClients: 25, minutesPool: 6000, demoBudgetUsd: 150, monthlySpendCapUsd: 750, features: {} },
  rateCardOverrides: {},
  clientCount: 4, monthMinutes: 4860, monthSpendUsd: 412.35, monthDemoSpendUsd: 58.2,
  caps: { minutes: "warning", spend: "ok", demoSpend: "ok", clients: "ok" },
  brandingComplete: true,
};

const tenantRetailFixture = {
  readOnly: true,
  organizationId: "org-demo-reseller",
  wholesale: retailFixture.wholesale,
  retail: {},
  lines: [
    { key: "voice_minutes", label: "Voice minutes", unit: "minute", wholesaleUsd: 0.0499, setting: { mode: "markup", markupPct: 100, flatUsd: 0, addonUsd: 0 }, retailUsd: 0.0998 },
  ],
  customerPrices: [],
  customerCurrency: "CAD",
  currencies: RATES,
};

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(async (_name: string, opts?: { body?: Record<string, unknown> }) => {
    const action = opts?.body?.action;
    if (action === "resellerRetail") return { data: retailFixture, error: null };
    if (action === "resellerCatalog") return { data: catalogFixture, error: null };
    if (action === "tenants") return { data: { tenants: [demoTenantFixture] }, error: null };
    if (action === "rateCard") return { data: { rateCard: DEFAULT_RATE_CARD }, error: null };
    if (action === "demoStatus") return { data: { seeded: true, resellerName: "NorthPeak Partners", clientCount: 4, orgCount: 5 }, error: null };
    if (action === "tenantRetail") return { data: tenantRetailFixture, error: null };
    return { data: {}, error: null };
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: mocks.invoke },
    from: () => ({
      select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
    storage: { from: () => ({ upload: vi.fn(async () => ({ error: null })), getPublicUrl: () => ({ data: { publicUrl: "https://x/logo.png" } }) }) },
    auth: { getUser: vi.fn(async () => ({ data: { user: null } })), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }) },
  },
}));

const wrap = (el: React.ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>{el}</MemoryRouter>
    </QueryClientProvider>,
  );

afterEach(() => cleanup());

const VENDOR_WORDS = ["Simli", "ElevenLabs", "Gemini", "Twilio", "Telnyx"];

describe("reseller selling-prices page (§12.3 + §12.4)", () => {
  const renderPage = () =>
    wrap(
      <ResellerPricing
        organizationId="org-reseller"
        organizationName="NorthPeak Partners"
        branding={{ name: "NorthPeak Partners", logoUrl: null, slogan: "Every call answered. Every lead captured.", supportEmail: null, brandColor: "#0ea5e9" }}
      />,
    );

  it("shows his wholesale cost and the 100% recommendation applied by default", async () => {
    renderPage();
    expect(await screen.findByText("Your selling prices")).toBeTruthy();
    // His cost for voice minutes, and double it as his default price.
    expect(screen.getAllByText("$0.0499").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$0.0998").length).toBeGreaterThan(0);
    expect(screen.getByText(/pre-filled on every line/)).toBeTruthy();
  });

  it("recomputes his price live when he changes the markup", async () => {
    renderPage();
    const input = await screen.findByLabelText("Markup percent for Voice minutes");
    fireEvent.change(input, { target: { value: "300" } });
    // 0.0499 × (1 + 300%) = 0.1996 — in the editor AND the preview.
    await waitFor(() => expect(screen.getAllByText("$0.1996").length).toBeGreaterThan(0));
  });

  it("states USD settlement plainly and shows the branded customer preview", async () => {
    renderPage();
    expect(await screen.findByText("What your customers see")).toBeTruthy();
    expect(screen.getAllByText(/You always settle with us in US dollars/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("NorthPeak Partners").length).toBeGreaterThan(0);
    expect(screen.getByText("Customer preview")).toBeTruthy();
  });

  it("never shows platform costs or vendor names", async () => {
    renderPage();
    await screen.findByText("Your selling prices");
    const text = document.body.textContent ?? "";
    expect(text).not.toContain("0.024");
    for (const w of VENDOR_WORDS) expect(text).not.toContain(w);
  });
});

describe("reseller avatar & voice catalog page (§12.5)", () => {
  it("lists the shared library with everything offered by default", async () => {
    wrap(<ResellerCatalog organizationId="org-reseller" />);
    expect(await screen.findByText("Avatars, voices & languages")).toBeTruthy();
    expect(screen.getByText("Aspen")).toBeTruthy();
    expect(screen.getByText("Frank")).toBeTruthy();
    expect(screen.getByText("English")).toBeTruthy();
    expect(screen.getByText("Português (Brasil)")).toBeTruthy();
  });

  it("shows creation charges from HIS rate card before he commits", async () => {
    wrap(<ResellerCatalog organizationId="org-reseller" />);
    expect(await screen.findByText("Create a custom avatar")).toBeTruthy();
    expect(screen.getByText("$25.00")).toBeTruthy();
    expect(screen.getByText("$5.00")).toBeTruthy();
    expect(screen.getAllByText(/charged to your account when a creation completes/).length).toBeGreaterThan(0);
    const text = document.body.textContent ?? "";
    for (const w of VENDOR_WORDS) expect(text).not.toContain(w);
  });
});

describe("admin Tenants screen — demo panel and retail summary (§12.1 + §12.3)", () => {
  it("offers seed/remove and badges the demo reseller", async () => {
    wrap(<TenantsView />);
    expect(await screen.findByText("Demo / presentation data")).toBeTruthy();
    expect(await screen.findByText(/Currently seeded:/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Remove demo data/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Re-seed \(refresh\) demo data/ })).toBeTruthy();
    expect(screen.getAllByText("NorthPeak Partners").length).toBeGreaterThan(0);
    expect(screen.getByText("Demo")).toBeTruthy();
  });

  it("shows the reseller's retail setup read-only in the expanded row", async () => {
    wrap(<TenantsView />);
    // Click inside the tenants TABLE row (the demo panel's status line
    // also names the reseller — the minutes cell is unique to the row).
    const cell = await screen.findByText("4860");
    fireEvent.click(cell);
    expect(await screen.findByText(/His selling prices \(read-only\)/)).toBeTruthy();
    expect(screen.getByText(/he always settles with us in USD/)).toBeTruthy();
    expect(screen.getByText(/\+100% markup/)).toBeTruthy();
  });
});
