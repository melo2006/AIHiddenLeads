import { describe, it, expect } from "vitest";
import {
  vanityToDigits, zipToState, normalizeSearchQuery, buildNumberSearchUrl,
  parseAvailableNumbers, searchAvailableNumbers, provisioningMode,
  planProvisioning, createNumberOrder, PhonePlatformError,
} from "../../supabase/functions/_shared/phone-numbers";
import { formatUsNumber, prettyPlace } from "../components/setup-wizard/PhoneSetupPanel";

// Phone step v2 (2026-11-18): self-serve number picker logic. The parse
// fixture below is a REAL provider response captured live on 2026-11-18
// (read-only inventory search, area code 954) — trimmed to two rows.
const LIVE_FIXTURE = {
  data: [
    {
      cost_information: { upfront_cost: "1.00000", monthly_cost: "1.00000", currency: "USD" },
      best_effort: true, reservable: true, record_type: "available_phone_number", vanity_format: null,
      phone_number_type: "local",
      features: [{ name: "sms" }, { name: "mms" }, { name: "fax" }, { name: "voice" }, { name: "hd_voice" }, { name: "emergency" }],
      region_information: [
        { region_name: "POMPANO BEACH", region_type: "rate_center" },
        { region_name: "POMPANO BEACH", region_type: "location" },
        { region_name: "FL", region_type: "state" },
        { region_name: "US", region_type: "country_code" },
      ],
      phone_number: "+17543102753", quickship: false,
    },
    {
      cost_information: { upfront_cost: "1.00000", monthly_cost: "1.00000", currency: "USD" },
      best_effort: true, reservable: true, record_type: "available_phone_number", vanity_format: null,
      phone_number_type: "local",
      features: [{ name: "sms" }, { name: "voice" }],
      region_information: [
        { region_name: "POMPANO BEACH", region_type: "rate_center" },
        { region_name: "POMPANO BEACH", region_type: "location" },
        { region_name: "FL", region_type: "state" },
        { region_name: "US", region_type: "country_code" },
      ],
      phone_number: "+17543102738", quickship: false,
    },
  ],
};

describe("vanity text -> keypad digits", () => {
  it("maps letters on the phone keypad", () => {
    expect(vanityToDigits("PLUMB")).toBe("75862");
    expect(vanityToDigits("flowers")).toBe("3569377");
    expect(vanityToDigits("555-0199")).toBe("5550199");
  });
  it("rejects input with nothing searchable", () => {
    expect(vanityToDigits("")).toBeNull();
    expect(vanityToDigits("A")).toBeNull();
    expect(vanityToDigits(undefined)).toBeNull();
  });
});

describe("ZIP -> state scoping", () => {
  it("resolves well-known ZIP ranges", () => {
    expect(zipToState("33308")).toBe("FL");
    expect(zipToState("90210")).toBe("CA");
    expect(zipToState("10001")).toBe("NY");
    expect(zipToState("75201")).toBe("TX");
  });
  it("returns null for unusable ZIPs", () => {
    expect(zipToState("1234")).toBeNull();
    expect(zipToState("")).toBeNull();
    expect(zipToState(undefined)).toBeNull();
  });
});

describe("search normalization", () => {
  it("accepts an area code search", () => {
    expect(normalizeSearchQuery({ areaCode: "954" })).toEqual({ areaCode: "954", limit: 10 });
  });
  it("scopes a ZIP-only search to its state", () => {
    expect(normalizeSearchQuery({ zip: "33308" })).toEqual({ state: "FL", limit: 10 });
  });
  it("combines area code + vanity and converts the vanity text", () => {
    expect(normalizeSearchQuery({ areaCode: "954", contains: "PLUMB" })).toEqual({ areaCode: "954", containsDigits: "75862", limit: 10 });
  });
  it("refuses an empty search with a customer-safe message", () => {
    expect(() => normalizeSearchQuery({})).toThrow(/area code, a ZIP code, or a word/);
  });
  it("refuses a malformed area code", () => {
    expect(() => normalizeSearchQuery({ areaCode: "95" })).toThrow(/3-digit area code/);
  });
  it("clamps the limit", () => {
    expect(normalizeSearchQuery({ areaCode: "954", limit: 500 }).limit).toBe(25);
  });
});

describe("provider URL building", () => {
  it("builds an area-code search with best_effort and voice+sms features", () => {
    const url = buildNumberSearchUrl("https://api.telnyx.com/v2", normalizeSearchQuery({ areaCode: "954" }));
    expect(url).toContain("/available_phone_numbers?");
    expect(url).toContain("filter%5Bnational_destination_code%5D=954");
    expect(url).toContain("filter%5Bbest_effort%5D=true");
    expect(url).toContain("filter%5Bcountry_code%5D=US");
  });
  it("builds a state search from a ZIP and a contains search from vanity text", () => {
    const byState = buildNumberSearchUrl("https://api.telnyx.com/v2", normalizeSearchQuery({ zip: "33308" }));
    expect(byState).toContain("filter%5Badministrative_area%5D=FL");
    const byVanity = buildNumberSearchUrl("https://api.telnyx.com/v2", normalizeSearchQuery({ contains: "PLUMB" }));
    expect(byVanity).toContain("filter%5Bphone_number%5D%5Bcontains%5D=75862");
  });
});

describe("provider payload parsing (live fixture)", () => {
  it("maps numbers, place, costs and features", () => {
    const rows = parseAvailableNumbers(LIVE_FIXTURE);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      phoneNumber: "+17543102753", locality: "POMPANO BEACH", region: "FL",
      rateCenter: "POMPANO BEACH", monthlyCost: "1.00000", upfrontCost: "1.00000",
      features: ["sms", "mms", "fax", "voice", "hd_voice", "emergency"],
    });
  });
  it("tolerates junk payloads", () => {
    expect(parseAvailableNumbers(null)).toEqual([]);
    expect(parseAvailableNumbers({})).toEqual([]);
    expect(parseAvailableNumbers({ data: [{ phone_number: "" }, { phone_number: "+13055550100" }] })).toHaveLength(1);
  });
});

describe("search with a stubbed provider", () => {
  const okFetch = (seen: { url?: string; auth?: string }) => async (url: string, init?: Record<string, unknown>) => {
    seen.url = url;
    seen.auth = (init?.headers as Record<string, string>)?.Authorization;
    return { ok: true, status: 200, text: async () => JSON.stringify(LIVE_FIXTURE) };
  };
  it("sends the bearer key and returns parsed candidates", async () => {
    const seen: { url?: string; auth?: string } = {};
    const { numbers } = await searchAvailableNumbers({ apiKey: "KEY_test", query: { areaCode: "954" }, fetchImpl: okFetch(seen) });
    expect(seen.auth).toBe("Bearer KEY_test");
    expect(seen.url).toContain("national_destination_code");
    expect(numbers.map((n) => n.phoneNumber)).toEqual(["+17543102753", "+17543102738"]);
  });
  it("never leaks the vendor name in error copy", async () => {
    const failFetch = async () => ({ ok: false, status: 500, text: async () => "{}" });
    await expect(searchAvailableNumbers({ apiKey: "KEY_test", query: { areaCode: "954" }, fetchImpl: failFetch }))
      .rejects.toSatisfy((e: unknown) => e instanceof PhonePlatformError && !/telnyx/i.test((e as Error).message));
  });
  it("refuses to search without a key, with the manual-route message", async () => {
    await expect(searchAvailableNumbers({ apiKey: "", query: { areaCode: "954" } }))
      .rejects.toThrow(/our team will assign your number/);
  });
});

describe("provisioning money gate + idempotency", () => {
  it("is dry-run unless the mode is exactly 'live'", () => {
    expect(provisioningMode({})).toBe("dry-run");
    expect(provisioningMode({ TELNYX_PROVISION_MODE: "on" })).toBe("dry-run");
    expect(provisioningMode({ TELNYX_PROVISION_MODE: "LIVE" })).toBe("dry-run");
    expect(provisioningMode({ TELNYX_PROVISION_MODE: "live" })).toBe("live");
  });
  it("adopts an existing assignment instead of buying again", () => {
    expect(planProvisioning({ aspenNumber: "+19545550100" }, "+19545550199")).toEqual({ action: "already", number: "+19545550100", source: "agent" });
    expect(planProvisioning({ telephonyVoiceNumber: "+19545550100" }, "+19545550199")).toEqual({ action: "already", number: "+19545550100", source: "telephony" });
    expect(planProvisioning({}, "+19545550199")).toEqual({ action: "provision", number: "+19545550199" });
  });
  it("places an order on the voice connection (stubbed provider)", async () => {
    let body: unknown;
    const stub = async (_url: string, init?: Record<string, unknown>) => {
      body = JSON.parse(String(init?.body));
      return { ok: true, status: 201, text: async () => JSON.stringify({ data: { id: "order-1" } }) };
    };
    const out = await createNumberOrder({ apiKey: "KEY_test", connectionId: "conn-1", phoneNumber: "+17543102753", fetchImpl: stub });
    expect(out.orderId).toBe("order-1");
    expect(body).toEqual({ phone_numbers: [{ phone_number: "+17543102753" }], connection_id: "conn-1" });
  });
});

describe("panel display helpers", () => {
  it("formats US numbers for humans", () => {
    expect(formatUsNumber("+17543102753")).toBe("(754) 310-2753");
    expect(formatUsNumber("+442071234567")).toBe("+442071234567");
  });
  it("softens ALL-CAPS provider place names", () => {
    expect(prettyPlace("POMPANO BEACH", "FL")).toBe("Pompano Beach, FL");
    expect(prettyPlace(undefined, undefined, "FT LAUDERDALE")).toBe("Ft Lauderdale");
    expect(prettyPlace("Miami", "FL")).toBe("Miami, FL");
  });
});
