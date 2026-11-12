import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// Welcome + day-1 email content pins (onboarding batch, 2026-11-12).
// hostinger-mail.ts imports a Deno URL module, so vitest cannot import it;
// following the repo's source-pin pattern (cf. live-setup-declarations),
// the customer-facing promises are pinned against the source instead. The
// live send itself is proven in the batch's test-mode pass.
const mail = readFileSync(path.join(__dirname, "..", "..", "supabase/functions/_shared/hostinger-mail.ts"), "utf8");
const welcome = readFileSync(path.join(__dirname, "..", "..", "supabase/functions/_shared/welcome.ts"), "utf8");
const webhook = readFileSync(path.join(__dirname, "..", "..", "supabase/functions/payments-webhook/index.ts"), "utf8");

describe("customer welcome email", () => {
  it("carries a set-password LINK and the first-steps essentials", () => {
    expect(mail).toContain("customerWelcome");
    expect(mail).toContain("setPasswordUrl");
    expect(mail).toContain("Set my password");
    expect(mail).toContain("/account");
    expect(mail).toContain("/setup");
    expect(mail).toContain("/help");
    expect(mail).toContain("(877) 862-4949");
  });

  it("never invents or includes a password", () => {
    const builder = mail.slice(mail.indexOf("export const customerWelcome"), mail.indexOf("export const onboardingDay1Nudge"));
    expect(builder).not.toMatch(/your password is/i);
    expect(builder).not.toMatch(/temporary password/i);
    expect(builder).toMatch(/password only you know/);
  });

  it("is generated from a Supabase recovery link, stamp-gated on app_metadata", () => {
    expect(welcome).toContain("generateLink");
    expect(welcome).toContain("type: 'recovery'");
    expect(welcome).toContain("/setup?reset=1");
    expect(welcome).toContain("welcome_sent_at");
    expect(welcome).toContain("already_sent");
  });

  it("the webhook sends it only after provisioning an active subscription, and never lets mail fail the payment", () => {
    expect(webhook).toContain("maybeSendWelcomeEmail");
    const hookAt = webhook.indexOf("maybeSendWelcomeEmail");
    const provisionAt = webhook.indexOf("provisionCustomer");
    expect(provisionAt).toBeGreaterThan(0);
    expect(hookAt).toBeGreaterThan(provisionAt);
    expect(webhook).toContain("Welcome email failed");
  });

  it("the day-1 nudge only exists for the unfinished phone step", () => {
    expect(mail).toContain("onboardingDay1Nudge");
    const nudge = mail.slice(mail.indexOf("export const onboardingDay1Nudge"));
    expect(nudge).toMatch(/phone number is not connected yet/);
    expect(nudge).toContain("/setup");
  });
});
