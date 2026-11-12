import { describe, it, expect } from "vitest";
import { ALEX_KNOWLEDGE, ALEX_SYSTEM_PROMPT, alexGuideConfig } from "../../supabase/functions/_shared/alex-guide";
import { CARRIER_GUIDES } from "../../supabase/functions/_shared/carrier-guides";

// Alex onboarding training pins (onboarding batch, 2026-11-12): the phone
// routes, the welcome/set-password flow, the checklist, the carrier guides
// FROM THE SAME DATA the site renders, and the honest limits.
describe("Alex knows the onboarding batch", () => {
  it("still presents the 6-step wizard (phone panel lives inside step 6)", () => {
    expect(alexGuideConfig().greeting).toContain("6 short steps");
    expect(ALEX_KNOWLEDGE).toContain("Step 6 addendum: your phone number");
  });

  it("teaches the three number routes and the ring math", () => {
    expect(ALEX_KNOWLEDGE).toMatch(/FORWARD your existing number/);
    expect(ALEX_KNOWLEDGE).toMatch(/PORT your number to us/);
    expect(ALEX_KNOWLEDGE).toMatch(/NEW number from us/);
    expect(ALEX_KNOWLEDGE).toMatch(/5 to 6 seconds/);
    expect(ALEX_KNOWLEDGE).toMatch(/2, 3, 4 or 5 rings/);
  });

  it("carries every carrier from the shared library data", () => {
    for (const g of CARRIER_GUIDES) {
      expect(ALEX_KNOWLEDGE, g.id).toContain(g.name);
    }
    // The proven codes Alex may recite come from the data, not hand-typing.
    expect(ALEX_KNOWLEDGE).toContain("**61*1");
    expect(ALEX_KNOWLEDGE).toContain("##61#");
    // Unverified carriers are fenced off explicitly.
    expect(ALEX_KNOWLEDGE).toMatch(/NOT VERIFIED from Metro by T-Mobile/);
    expect(ALEX_KNOWLEDGE).toMatch(/never give the customer a star code for this carrier/i);
  });

  it("explains the welcome email + set-password flow and never invents a password", () => {
    expect(ALEX_KNOWLEDGE).toContain("Set my password");
    expect(ALEX_KNOWLEDGE).toMatch(/NEVER invent a password/);
    expect(ALEX_KNOWLEDGE).toContain("first-steps checklist");
  });

  it("states the honest limits: porting days, Fi, SIP", () => {
    expect(ALEX_KNOWLEDGE).toMatch(/Porting takes several business days/);
    expect(ALEX_KNOWLEDGE).toMatch(/Google Fi has NO no-answer forwarding/);
    expect(ALEX_KNOWLEDGE).toMatch(/SIP trunk is an advanced integration/);
    expect(ALEX_KNOWLEDGE).toMatch(/never say it did/i);
  });

  it("the system prompt points at the phone panel and carrier reference", () => {
    expect(ALEX_SYSTEM_PROMPT).toMatch(/PHONE NUMBER panel/);
    expect(ALEX_SYSTEM_PROMPT).toMatch(/per-carrier forwarding guides/);
  });
});
