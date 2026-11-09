// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import en from "../i18n/locales/en.json";
import es from "../i18n/locales/es.json";
import pt from "../i18n/locales/pt-BR.json";

/**
 * Evergreen-promo guards for checkout + pricing copy (2026-11-09).
 *
 * The retired launch promo had a hard calendar end ("setup fee waived
 * through November 30") and a "minutes doubled" claim. The live,
 * owner-approved promo is EVERGREEN with no calendar date: 50% off every
 * plan for the first 3 months ("50% OFF — ENDS THIS MONTH"), setup fee
 * waived during the promotion, and plans carry their normal minute
 * allowances (no doubling). These pins keep the retired wording from
 * creeping back into Checkout.tsx or the pricing locale strings.
 */

const checkout = readFileSync(new URL("../pages/Checkout.tsx", import.meta.url), "utf8");

const RETIRED = /november 30|nov 30|doubled|duplicado|dobrado|30 de noviembre|30 de novembro|30\/nov/i;

describe("checkout + pricing promo copy stays evergreen", () => {
  it("Checkout.tsx carries no retired launch-promo strings", () => {
    expect(checkout).not.toMatch(RETIRED);
  });

  it("Checkout.tsx carries the evergreen promo line", () => {
    expect(checkout).toContain("50% OFF — ENDS THIS MONTH");
    expect(checkout).toContain("50% off every plan for the first 3 months");
    expect(checkout).toContain("setup fee waived");
  });

  it("pricing locale strings carry no retired launch-promo wording in any locale", () => {
    for (const [name, locale] of [["en", en], ["es", es], ["pt-BR", pt]] as const) {
      const pricingStrings = [locale.pricing.badge, locale.pricing.setupPromo, locale.pricing.promoMinutes].join("\n");
      expect(pricingStrings, `${name}.pricing`).not.toMatch(RETIRED);
    }
  });

  it("pricing promo strings stay evergreen (promotion-framed, no dates)", () => {
    expect(en.pricing.badge).toContain("50% OFF — ENDS THIS MONTH");
    expect(en.pricing.setupPromo).toContain("during the promotion");
    expect(en.pricing.promoMinutes).toContain("first 3 months");
    expect(en.pricing.promoMinutes).not.toContain("normally");
  });
});
