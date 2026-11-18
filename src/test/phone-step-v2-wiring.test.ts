import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Phone step v2 (2026-11-18) wiring pins: the guarantees pure-logic
// tests can't prove — the new voice-agents actions exist in schema AND
// handler, provisioning is money-gated and viewer-blocked, the phone
// setup schemas carry the pick + SMS intent, the config schema accepts
// the notification email, and the customer-facing panel never names
// the phone vendor.

const root = path.resolve(__dirname, "../..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

describe("voice-agents phone step v2 actions", () => {
  const src = read("supabase/functions/voice-agents/index.ts");

  it("exposes searchNumbers + provisionNumber in the schema and the handlers", () => {
    for (const action of ["searchNumbers", "provisionNumber"]) {
      expect(src).toContain(`'${action}'`);
      expect(src).toContain(`body.action==='${action}'`);
    }
  });

  it("keeps provisioning behind the exact-'live' money gate", () => {
    expect(src).toContain("provisioningMode");
    expect(src).toContain("TELNYX_PROVISION_MODE");
    expect(src).toContain("mode!=='live'");
    expect(src).toContain("dryRun:true");
  });

  it("blocks view-only members from provisioning", () => {
    const deny = src.match(/\['save'[^\]]*'provisionNumber'[^\]]*\]/);
    expect(deny).not.toBeNull();
  });

  it("carries the pick + SMS intent in the phone setup schemas", () => {
    expect(src).toContain("selectedNumber");
    expect(src).toContain("selectedNumberLocality");
    expect(src).toContain("smsIntent");
    expect(src).toContain("provisionedAt");
  });

  it("accepts the booking notification email in the config schema", () => {
    expect(src).toContain("notificationEmail");
  });

  it("persists the SMS request + picked number into the ops notes", () => {
    expect(src).toContain("SMS requested");
    expect(src).toContain("picked number=");
  });
});

describe("shared onboarding state", () => {
  const src = read("supabase/functions/_shared/onboarding.ts");
  it("models the SMS intent and the picked number", () => {
    expect(src).toContain("SmsIntentState");
    expect(src).toContain("selectedNumber");
    expect(src).toContain("smsIntent");
  });
});

describe("wizard panel (customer-facing)", () => {
  const src = read("src/components/setup-wizard/PhoneSetupPanel.tsx");

  it("never names the phone vendor", () => {
    expect(src).not.toMatch(/telnyx/i);
  });

  it("offers the picker, the plan-included price copy and the SMS block", () => {
    expect(src).toContain("Find my numbers");
    expect(src).toContain("included in your plan");
    expect(src).toContain("Additional numbers are $3/mo each");
    expect(src).toContain("I also want texting (SMS) on my number");
    expect(src).toContain("anti-spam rule");
    expect(src).toContain("Legal business name");
  });

  it("activates the pick after save and from the wizard publish", () => {
    expect(src).toContain('action: "provisionNumber"');
    const wizard = read("src/components/setup-wizard/SetupWizard.tsx");
    expect(wizard).toContain('action: "provisionNumber"');
    expect(wizard).toContain("Booking notifications");
    expect(wizard).toContain("notificationEmail");
  });

  it("keeps the three routes and the carrier guides intact", () => {
    expect(src).toContain("Forward my existing number");
    expect(src).toContain("Bring my number to AiHiddenLeads");
    expect(src).toContain("Get a new number");
    expect(src).toContain("CarrierGuideView");
  });
});
