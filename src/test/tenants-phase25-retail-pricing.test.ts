import { describe, expect, it } from "vitest";
import {
  RECOMMENDED_MARKUP_PCT,
  customerRetailView,
  defaultRetailPrices,
  defaultRetailSetting,
  normalizeRetailPrices,
  normalizeRetailSetting,
  retailPriceUsd,
  retailPriceView,
  retailSettingSummary,
  validateRetailPricesInput,
} from "@/lib/retailPricing";
import { tenantPriceView, DEFAULT_RATE_CARD } from "@/lib/rateCard";

// Phase 2.5 retail pricing (design 2026-11-18 §12.3): a reseller's
// own price list for his customers. Three modes, the 100% markup
// recommendation pre-filled, and a customer projection that can
// never carry wholesale or platform data.

describe("retail pricing — the three modes", () => {
  it("markup: 100% doubles the wholesale price", () => {
    expect(retailPriceUsd(0.05, { mode: "markup", markupPct: 100, flatUsd: 0, addonUsd: 0 })).toBe(0.1);
    expect(retailPriceUsd(0.05, { mode: "markup", markupPct: 300, flatUsd: 0, addonUsd: 0 })).toBe(0.2);
  });
  it("flat: the retail price is the flat value, wholesale is irrelevant", () => {
    expect(retailPriceUsd(0.05, { mode: "flat", markupPct: 100, flatUsd: 2.5, addonUsd: 0 })).toBe(2.5);
    expect(retailPriceUsd(99, { mode: "flat", markupPct: 100, flatUsd: 2.5, addonUsd: 0 })).toBe(2.5);
  });
  it("addon: cost plus a fixed amount", () => {
    expect(retailPriceUsd(0.03, { mode: "addon", markupPct: 100, flatUsd: 0, addonUsd: 0.02 })).toBe(0.05);
  });
});

describe("retail pricing — the recommendation", () => {
  it("the recommendation is 100% markup and pre-fills every line", () => {
    expect(RECOMMENDED_MARKUP_PCT).toBe(100);
    expect(defaultRetailSetting()).toEqual({ mode: "markup", markupPct: 100, flatUsd: 0, addonUsd: 0 });
    const all = defaultRetailPrices();
    for (const line of DEFAULT_RATE_CARD) {
      expect(all[line.key]).toEqual(defaultRetailSetting());
    }
  });
  it("an unset reseller prices everything at the recommendation", () => {
    const view = retailPriceView(tenantPriceView(DEFAULT_RATE_CARD), normalizeRetailPrices(null));
    const voice = view.find((l) => l.key === "voice_minutes")!;
    // Wholesale: 2.4¢ platform cost at the card's 108% markup.
    expect(voice.wholesaleUsd).toBe(0.0499);
    // Retail at the recommended 100% markup: exactly double.
    expect(voice.retailUsd).toBe(0.0998);
  });
});

describe("retail pricing — normalization and validation", () => {
  it("normalizes garbage to the recommendation, field by field", () => {
    expect(normalizeRetailSetting(null)).toEqual(defaultRetailSetting());
    expect(normalizeRetailSetting({ mode: "bogus", markupPct: -5 })).toEqual(defaultRetailSetting());
    expect(normalizeRetailSetting({ mode: "flat", flatUsd: 3 })).toEqual({
      mode: "flat", markupPct: 100, flatUsd: 3, addonUsd: 0,
    });
  });
  it("drops unknown line keys and completes missing ones", () => {
    const out = normalizeRetailPrices({ voice_minutes: { mode: "flat", flatUsd: 0.2 }, nope: { mode: "flat" } });
    expect(out.voice_minutes.flatUsd).toBe(0.2);
    expect("nope" in out).toBe(false);
    expect(out.chat_minutes).toEqual(defaultRetailSetting());
  });
  it("validation rejects unknown keys, bad modes and negative numbers", () => {
    expect(validateRetailPricesInput(null)).toHaveProperty("error");
    expect(validateRetailPricesInput({ nope: {} })).toHaveProperty("error");
    expect(validateRetailPricesInput({ voice_minutes: { mode: "sideways" } })).toHaveProperty("error");
    expect(validateRetailPricesInput({ voice_minutes: { markupPct: -1 } })).toHaveProperty("error");
    const ok = validateRetailPricesInput({ voice_minutes: { mode: "addon", addonUsd: 0.02 } });
    expect(ok).not.toHaveProperty("error");
  });
});

describe("retail pricing — the customer projection is tenant-safe", () => {
  it("customerRetailView carries retail prices and labels ONLY", () => {
    const view = retailPriceView(tenantPriceView(DEFAULT_RATE_CARD), normalizeRetailPrices(null));
    const customer = customerRetailView(view);
    for (const line of customer) {
      expect(Object.keys(line).sort()).toEqual(["key", "label", "retailUsd", "unit"]);
    }
    const serialized = JSON.stringify(customer);
    expect(serialized).not.toContain("wholesale");
    expect(serialized).not.toContain("cost");
    expect(serialized).not.toContain("markupPct");
    // The platform's true cost of voice minutes must not leak.
    expect(serialized).not.toContain("0.024");
  });
  it("summaries read plainly for the admin read-only view", () => {
    expect(retailSettingSummary({ mode: "markup", markupPct: 100, flatUsd: 0, addonUsd: 0 })).toBe("+100%");
    expect(retailSettingSummary({ mode: "flat", markupPct: 0, flatUsd: 2.5, addonUsd: 0 })).toBe("$2.50 flat");
    expect(retailSettingSummary({ mode: "addon", markupPct: 0, flatUsd: 0, addonUsd: 0.1 })).toBe("+$0.10");
  });
});
