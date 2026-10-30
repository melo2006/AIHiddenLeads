import { describe, it, expect } from "vitest";
import { monthlyRate, phoneMaxSeconds } from "../../supabase/functions/_shared/telephony-rules";

const pricing = { twilio_inbound_per_min: 0.01, default_markup_pct: 30, fixed_voice_per_min: null };

describe("phone answering rules", () => {
  it("client markup overrides default markup", () => {
    expect(monthlyRate(pricing, { markup_pct: 1, fixed_voice_per_min: null })).toBeCloseTo(0.0101);
  });
  it("$10 cap at 5¢/min with 100 minutes used leaves 100 minutes, capped at 15-minute call ceiling", () => {
    expect(phoneMaxSeconds(10, 0.05, 6000)).toBe(900);
  });
  it("cap reached means no AI minutes", () => {
    expect(phoneMaxSeconds(10, 0.05, 12000)).toBe(0);
  });
});
