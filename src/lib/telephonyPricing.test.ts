import { describe, expect, it } from "vitest";
import { customerRate, resolveRule, summarizeUsage } from "./telephonyPricing";

const costs = { inboundPerMin: 0.01, outboundPerMin: 0.02, smsPerSegment: 0.01 };

describe("telephony pricing", () => {
  it("adds a 30% markup to provider cost", () => {
    expect(customerRate(0.01, 30)).toBe(0.013);
  });
  it("uses a fixed price instead of markup when set", () => {
    expect(customerRate(0.01, 30, 0.05)).toBe(0.05);
  });
  it("client override beats the default markup", () => {
    expect(resolveRule({ markupPct: 30 }, { markupPct: 40 }).markupPct).toBe(40);
  });
  it("bills calls per second", () => {
    const s = summarizeUsage([{ kind: "call", direction: "inbound", seconds: 90, segments: 0 }], costs, { markupPct: 0, fixedVoicePerMin: 0.06 });
    expect(s.chargeUsd).toBe(0.09);
    expect(s.seconds).toBe(90);
  });
  it("charges texts per segment", () => {
    const s = summarizeUsage([{ kind: "sms", direction: "outbound", seconds: 0, segments: 3 }], costs, { markupPct: 100 });
    expect(s.chargeUsd).toBe(0.06);
    expect(s.profitUsd).toBe(0.03);
  });
});
