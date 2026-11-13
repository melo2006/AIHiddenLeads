// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import en from "../i18n/locales/en.json";
import es from "../i18n/locales/es.json";
import pt from "../i18n/locales/pt-BR.json";

/**
 * Pricing-decision guards for checkout + pricing copy (Ron's decisions,
 * 2026-11-12, replacing the 2026-11-09 evergreen-promo pins).
 *
 * $99 / $199 / $349 are PERMANENT prices. The retired story — "50% off
 * every plan for the first 3 months", prices "rising" to $199/$399/$699,
 * launch pricing, bonus promo minutes — was never implemented in
 * checkout and must never come back in copy. The live offer that
 * replaces it: the video avatar add-on's first month is FREE ($79/mo
 * from month 2 only if kept). The setup-fee waiver is a separate offer
 * and stays (its own line, no plan-discount claims attached).
 */

const checkout = readFileSync(new URL("../pages/Checkout.tsx", import.meta.url), "utf8");
const pricingSection = readFileSync(new URL("../components/landing/PricingSection.tsx", import.meta.url), "utf8");

// Claims, not denials: "no intro discount" / "sin descuento introductorio"
// is the DECIDED copy and must pass; what can never return is the claim
// itself (a percentage off, a first-3-months window, a launch price, a
// "regular" higher price the plan supposedly rises to).
const INTRO_CLAIMS = /50% off|50 percent off|first 3 months|launch price|precio de lanzamiento|preço de lançamento|regular \$199/i;

describe("no introductory-discount story anywhere in checkout/pricing copy", () => {
  it("Checkout.tsx carries no intro claims", () => {
    expect(checkout).not.toMatch(INTRO_CLAIMS);
    expect(checkout).not.toContain("$180/mo on Professional");
    expect(checkout).not.toContain("$250/mo on Platinum");
  });

  it("PricingSection.tsx carries no intro claims or tiered avatar prices", () => {
    expect(pricingSection).not.toMatch(INTRO_CLAIMS);
    expect(pricingSection).not.toContain("originalPrice");
    expect(pricingSection).not.toContain("+$180");
    expect(pricingSection).not.toContain("+$250");
    expect(pricingSection).toContain("first month of the avatar is free");
    expect(pricingSection).toContain("+$79/mo on any plan");
  });

  it("pricing locale strings carry no intro claims in any locale", () => {
    for (const [name, locale] of [["en", en], ["es", es], ["pt-BR", pt]] as const) {
      const pricingStrings = [locale.pricing.badge, locale.pricing.setupPromo, locale.tryDemo.priceStrip].join("\n");
      expect(pricingStrings, `${name}.pricing`).not.toMatch(INTRO_CLAIMS);
    }
  });

  it("the retired promo keys are gone from every locale", () => {
    for (const [name, locale] of [["en", en], ["es", es], ["pt-BR", pt]] as const) {
      expect("launchPrice" in locale.pricing, `${name}.launchPrice`).toBe(false);
      expect("promoMinutes" in locale.pricing, `${name}.promoMinutes`).toBe(false);
    }
  });
});

describe("the live offers are stated where Ron decided they belong", () => {
  it("the pricing badge leads with the avatar free month in every locale", () => {
    expect(en.pricing.badge).toContain("FREE for your first month");
    expect(es.pricing.badge).toContain("GRATIS");
    expect(pt.pricing.badge).toContain("GRÁTIS");
  });

  it("the setup-fee waiver survives as its own line, with no discount attached", () => {
    expect(checkout).toContain("Setup fee is waived during the current promotion");
    expect(checkout).toContain("Setup fee waived during the current promotion");
    expect(en.pricing.setupPromo).toContain("during the promotion");
  });

  it("Checkout.tsx states the avatar free-month terms plainly", () => {
    expect(checkout).toContain("FREE for your first month");
    expect(checkout).toContain("only if you keep it");
    expect(checkout).toContain("switches off automatically");
    expect(checkout).toContain("One free avatar month per business");
    expect(checkout).toContain("video_avatar_monthly");
    expect(checkout).toContain("+$50 one-time");
  });

  it("the demo price strip states the permanent price and the free avatar month", () => {
    expect(en.tryDemo.priceStrip).toContain("$99/mo");
    expect(en.tryDemo.priceStrip).toContain("permanent price");
    expect(en.tryDemo.priceStrip).toContain("free for your first month");
    expect(en.tryDemo.priceStrip).not.toMatch(/november|december|january|20\d\d/i);
  });
});
