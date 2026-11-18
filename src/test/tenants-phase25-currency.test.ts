import { describe, expect, it } from "vitest";
import {
  DEFAULT_CURRENCY_RATES,
  DEFAULT_RATES_AS_OF,
  convertFromUsd,
  effectiveCurrencyRates,
  formatMoney,
  isSupportedCurrency,
  rateFor,
  validateCurrencyRatesInput,
} from "@/lib/currency";

// Phase 2.5 currency conversion (design 2026-11-18 §12.4): USD is
// the base and the only settlement currency; CAD and BRL exist so a
// reseller's customers can be SHOWN his prices in their currency.
// Rates are editable defaults with an as-of date — never a live feed.

describe("currency — defaults", () => {
  it("ships CAD and BRL defaults with a visible as-of date", () => {
    expect(DEFAULT_CURRENCY_RATES.CAD).toBe(1.39);
    expect(DEFAULT_CURRENCY_RATES.BRL).toBe(5.35);
    expect(DEFAULT_RATES_AS_OF).toBe("2026-11-18");
    const rates = effectiveCurrencyRates(null);
    const cad = rates.find((r) => r.code === "CAD")!;
    expect(cad.rate).toBe(1.39);
    expect(cad.asOf).toBe(DEFAULT_RATES_AS_OF);
    expect(cad.edited).toBe(false);
    const usd = rates.find((r) => r.code === "USD")!;
    expect(usd.rate).toBe(1);
  });
  it("an admin-stored rate wins over the default and is marked edited", () => {
    const rates = effectiveCurrencyRates({ CAD: { rate: 1.42, updated_at: "2026-12-01T00:00:00Z" } });
    const cad = rates.find((r) => r.code === "CAD")!;
    expect(cad.rate).toBe(1.42);
    expect(cad.edited).toBe(true);
    expect(cad.asOf).toBe("2026-12-01");
    // BRL stays the untouched default.
    expect(rates.find((r) => r.code === "BRL")!.rate).toBe(5.35);
  });
  it("a corrupt stored rate falls back to the default", () => {
    const rates = effectiveCurrencyRates({ CAD: { rate: -3 } });
    expect(rates.find((r) => r.code === "CAD")!.rate).toBe(1.39);
  });
});

describe("currency — conversion and formatting", () => {
  const rates = effectiveCurrencyRates(null);
  it("converts display prices from USD", () => {
    expect(convertFromUsd(10, "CAD", rates)).toBeCloseTo(13.9, 6);
    expect(convertFromUsd(10, "BRL", rates)).toBeCloseTo(53.5, 6);
    expect(convertFromUsd(10, "USD", rates)).toBe(10);
    expect(rateFor(rates, "CAD")).toBe(1.39);
    expect(rateFor(rates, "XXX")).toBe(1);
  });
  it("formats with the right symbol and precision per currency", () => {
    expect(formatMoney(0.1, "USD")).toBe("$0.10");
    expect(formatMoney(0.0499, "USD")).toBe("$0.0499");
    expect(formatMoney(13.9, "CAD")).toBe("CA$13.90");
    expect(formatMoney(53.5, "BRL")).toBe("R$53.50");
  });
});

describe("currency — validation", () => {
  it("only USD, CAD and BRL are supported", () => {
    expect(isSupportedCurrency("USD")).toBe(true);
    expect(isSupportedCurrency("CAD")).toBe(true);
    expect(isSupportedCurrency("BRL")).toBe(true);
    expect(isSupportedCurrency("EUR")).toBe(false);
    expect(isSupportedCurrency("usd")).toBe(false);
    expect(isSupportedCurrency(42)).toBe(false);
  });
  it("rate edits reject USD, unknown codes and non-positive numbers", () => {
    expect(validateCurrencyRatesInput({ USD: 1 })).toHaveProperty("error");
    expect(validateCurrencyRatesInput({ EUR: 0.9 })).toHaveProperty("error");
    expect(validateCurrencyRatesInput({ CAD: 0 })).toHaveProperty("error");
    expect(validateCurrencyRatesInput({ CAD: -1.4 })).toHaveProperty("error");
    expect(validateCurrencyRatesInput(null)).toHaveProperty("error");
    const ok = validateCurrencyRatesInput({ CAD: 1.41, BRL: 5.4 });
    expect(ok).toEqual({ value: { CAD: 1.41, BRL: 5.4 } });
  });
});
