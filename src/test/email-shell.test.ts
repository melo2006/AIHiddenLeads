// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  EMAIL_DEMO_URL,
  EMAIL_LOGO_URL,
  PROMO_PITCH,
  PROMO_SLOGAN,
  emailPromoText,
  wrapEmailHtml,
} from "../../supabase/functions/_shared/email-shell";
import {
  aggregateUsage,
  renderUsageReportHtml,
  renderUsageReportText,
} from "../../supabase/functions/_shared/usage-reporting";

// Branded email shell (2026-11-20): every user-facing email carries the
// logo header and the free-demo footer promo. email-shell.ts is pure
// (no Deno imports), so the shell itself is unit-tested directly; the
// Deno-only senders (hostinger-mail.ts pulls denomailer) are pinned
// against their source, following the repo's source-pin pattern.

const root = path.join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

describe("shared email shell", () => {
  it("wraps content with the logo header and the footer demo promo", () => {
    const html = wrapEmailHtml({
      preheader: "Your call is booked",
      title: "You're booked!",
      bodyHtml: "<p>MAIN-CONTENT-MARKER</p>",
    });
    expect(html).toContain(EMAIL_LOGO_URL);
    expect(EMAIL_LOGO_URL).toBe("https://aihiddenleads.com/logo.png");
    expect(html).toContain(PROMO_SLOGAN);
    expect(html).toContain(PROMO_PITCH);
    expect(html).toContain(`href="${EMAIL_DEMO_URL}"`);
    expect(EMAIL_DEMO_URL).toBe("https://aihiddenleads.com/demo");
    expect(html).toContain("No credit card required");
    expect(html).toContain("under 2 minutes");
  });

  it("keeps the promo BELOW the main content", () => {
    const html = wrapEmailHtml({
      preheader: "x",
      bodyHtml: "<p>MAIN-CONTENT-MARKER</p>",
    });
    const contentAt = html.indexOf("MAIN-CONTENT-MARKER");
    const promoAt = html.indexOf(PROMO_SLOGAN);
    const headerAt = html.indexOf(EMAIL_LOGO_URL);
    expect(headerAt).toBeGreaterThanOrEqual(0);
    expect(headerAt).toBeLessThan(contentAt);
    expect(promoAt).toBeGreaterThan(contentAt);
  });

  it("omits the promo only when explicitly disabled (owner-internal mail)", () => {
    const html = wrapEmailHtml({ preheader: "x", bodyHtml: "<p>hi</p>", promo: false });
    expect(html).toContain(EMAIL_LOGO_URL);
    expect(html).not.toContain(PROMO_SLOGAN);
    expect(html).not.toContain(EMAIL_DEMO_URL);
  });

  it("plain-text promo carries the slogan, pitch and demo link", () => {
    const text = emailPromoText();
    expect(text).toContain(PROMO_SLOGAN);
    expect(text).toContain(PROMO_PITCH);
    expect(text).toContain(EMAIL_DEMO_URL);
  });
});

describe("usage report emails wear the shell", () => {
  const renderInput = {
    orgName: "Acme Widgets",
    periodLabel: "October 2026",
    totals: aggregateUsage([
      { service: "web_voice", quantity_minutes: 140, quantity_count: null, est_cost_usd: 8.5, occurred_at: "2026-10-05T10:00:00.000Z" },
    ]),
    balance: { allowanceMinutes: 400, bankedMinutes: 50, currentUsed: 140, currentRemaining: 310 },
    dashboardUrl: "https://aihiddenleads.com/account",
    callsAnswered: 3,
  };

  it("HTML report contains the logo and the footer demo link", () => {
    const html = renderUsageReportHtml(renderInput);
    expect(html).toContain(EMAIL_LOGO_URL);
    expect(html).toContain(`href="${EMAIL_DEMO_URL}"`);
    expect(html.indexOf(PROMO_SLOGAN)).toBeGreaterThan(html.indexOf("View your usage dashboard"));
  });

  it("text report ends with the promo block", () => {
    const text = renderUsageReportText(renderInput);
    expect(text).toContain(PROMO_SLOGAN);
    expect(text.trimEnd().endsWith(EMAIL_DEMO_URL)).toBe(true);
  });
});

describe("shell adoption pins (source)", () => {
  it("hostinger-mail delegates its layout to the shell and opts customer mail into the promo", () => {
    const mail = read("supabase/functions/_shared/hostinger-mail.ts");
    expect(mail).toContain("from './email-shell.ts'");
    expect(mail).toContain("wrapEmailHtml");
    // bookingConfirmation, bookingReminder, bookingNoShowRecovery,
    // visitorFollowup, customerWelcome, onboardingDay1Nudge,
    // avatarTrialReminder, conversationCopy
    expect(mail.match(/promo: true|promo:true/g)?.length).toBeGreaterThanOrEqual(8);
  });

  it("every Supabase Auth template renders the brand header and promo footer", () => {
    const shell = read("supabase/functions/_shared/email-templates/shell.tsx");
    expect(shell).toContain("https://aihiddenleads.com");
    expect(shell).toContain("/logo.png");
    expect(shell).toContain("/demo");
    for (const name of ["signup", "invite", "magic-link", "recovery", "email-change", "reauthentication"]) {
      const tpl = read(`supabase/functions/_shared/email-templates/${name}.tsx`);
      expect(tpl, name).toContain("BrandHeader");
      expect(tpl, name).toContain("PromoFooter");
      expect(tpl, name).toContain("from './shell.tsx'");
    }
  });

  it("voice-agents invites and the demo code email use the shell", () => {
    expect(read("supabase/functions/voice-agents/index.ts")).toContain("email-shell.ts");
    expect(read("supabase/functions/demo-verification/index.ts")).toContain("email-shell.ts");
  });
});
