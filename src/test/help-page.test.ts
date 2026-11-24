// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(resolve(__dirname, "..", rel), "utf8");
const readRoot = (rel: string) => readFileSync(resolve(__dirname, "../..", rel), "utf8");

// Help & Support page, portion one (Ron's order, 2026-11-21): a real
// /help page — searchable guides, Alex the support engineer, the full
// FAQ, and a ticket form that creates real tickets (table + function
// + owner email). These pins keep the page from quietly degrading
// into a dead form or a stub again.
describe("help & support page (2026-11-21)", () => {
  const page = read("pages/Help.tsx");

  it("hero carries a search input over the guides and FAQs", () => {
    expect(page).toContain("Help &amp; Support");
    expect(page).toContain('aria-label="Search help guides and FAQs"');
    expect(page).toContain("1-877-862-4949 · 1-877-86-AI WIZ");
  });

  it("all six guides exist as anchor-linked articles", () => {
    for (const id of ["install", "setup", "crm", "zapier", "booking", "troubleshooting"]) {
      expect(page, id).toContain(`id: "${id}"`);
    }
    expect(page).toContain("HELP_GUIDES");
    // The carrier forwarding library from the original /help stays.
    expect(page).toContain('id="phone-forwarding"');
    expect(page).toContain("CarrierGuideView");
  });

  it("CRM guidance is honest: guided paths, never a native connector", () => {
    expect(page).toContain("does not plug into your CRM with a built-in native connector");
    expect(page).toContain("Reviewed Zapier sends");
    expect(page).toContain("Catch Hook");
    expect(page).toContain("nothing goes automatically");
  });

  it("the full FAQ renders the homepage set plus the onboarding set", () => {
    expect(page).toContain('t("faqSection.items", { returnObjects: true })');
    expect(page).toContain("HELP_FAQS");
  });

  it("Alex is presented as support engineer and wired through the real guide session", () => {
    expect(page).toContain("Alex — Support Engineer");
    expect(page).toContain('<GeminiAgentWidget guide="alex" autoStart');
    // The guide branch is signed-in only server-side; the page gates
    // the mount on a real Supabase session and offers sign-in instead.
    expect(page).toContain("supabase.auth.getSession()");
    expect(page).toContain('to="/account"');
    expect(page).toContain("ALEX_FACE_ID");
  });

  it("the ticket form section mounts the real form component", () => {
    expect(page).toContain('id="support-ticket"');
    expect(page).toContain("<SupportTicketForm />");
  });
});

describe("support ticket form + backend (2026-11-21)", () => {
  const form = read("components/help/SupportTicketForm.tsx");
  const fn = readRoot("supabase/functions/support-ticket/index.ts");

  it("the form carries every field Ron specified and invokes the function", () => {
    for (const topic of ["Setup", "Installation", "CRM & integrations", "Billing", "Technical problem", "Other"]) {
      expect(form, topic).toContain(`"${topic}"`);
    }
    for (const urgency of ["Low", "Normal", "High", "Urgent"]) {
      expect(form, urgency).toContain(`"${urgency}"`);
    }
    expect(form).toContain('supabase.functions.invoke("support-ticket"');
    expect(form).toContain("data.reference");
  });

  it("the function validates, stores a real ticket and emails the owner", () => {
    expect(fn).toContain("z.enum(['Setup', 'Installation', 'CRM & integrations', 'Billing', 'Technical problem', 'Other'])");
    expect(fn).toContain(".from('support_tickets').insert(");
    expect(fn).toContain("sendOwnerMail(supportTicketAlert(");
    expect(fn).toContain("AHL-");
    expect(fn).toContain("return json({ ok: true, reference })");
  });

  it("the owner mail template exists and lands in the owner mailbox", () => {
    const mail = readRoot("supabase/functions/_shared/hostinger-mail.ts");
    expect(mail).toContain("export const supportTicketAlert");
    expect(mail).toContain("to: OWNER_MAILBOX");
    expect(mail).toContain("Support ticket ${t.reference}");
  });

  it("the table migration exists in both trees, service-role only", () => {
    const core = readRoot("supabase/migrations/20261121160000_support_tickets.sql");
    expect(core).toContain("create table public.support_tickets");
    expect(core).toContain("alter table public.support_tickets enable row level security");
    const twin = readRoot("drizzle/migrations/0022_support_tickets.sql");
    expect(twin).toContain("CREATE TABLE IF NOT EXISTS public.support_tickets");
    expect(twin).toContain("ENABLE ROW LEVEL SECURITY");
  });

  it("the function is public at the gateway (it validates itself)", () => {
    const config = readRoot("supabase/config.toml");
    const at = config.indexOf("[functions.support-ticket]");
    expect(at).toBeGreaterThan(-1);
    expect(config.slice(at, at + 120)).toContain("verify_jwt = false");
  });

  it("Alex's knowledge covers the new help topics at the same honesty level", () => {
    const alex = readRoot("supabase/functions/_shared/alex-guide.ts");
    expect(alex).toContain("Help & support topics: CRM, Zapier, calendar, troubleshooting");
    expect(alex).toContain("NO native CRM connector");
    expect(alex).toContain("Catch Hook");
  });

  it("nav and footer link to /help in every locale", () => {
    const nav = read("components/landing/LandingNavbar.tsx");
    // Menu cleanup (2026-11-24): Help is a single route entry in the
    // shared menuLinks list (rendered by both desktop and mobile).
    expect(nav).toContain('{ to: "/help", label: t("nav.help", "Help") }');
    expect(nav.match(/nav\.help/g)).toHaveLength(1);
    expect(nav).toContain('t("nav.help", "Help")');
    const footer = read("components/landing/Footer.tsx");
    expect(footer).toContain('to="/help"');
    expect(footer).toContain('t("footer.help")');
    for (const loc of ["en", "es", "fr", "pt-BR"]) {
      const json = JSON.parse(read(`i18n/locales/${loc}.json`));
      expect(json.nav.help, loc).toBeTruthy();
      expect(json.footer.help, loc).toBeTruthy();
    }
  });
});
