import { describe, it, expect } from "vitest";
import {
  CARRIER_GUIDES, carrierGuide, fillAspenNumber, renderCarrierGuidesText,
} from "../../supabase/functions/_shared/carrier-guides";

// Carrier guide library pins (onboarding batch, 2026-11-12). The library's
// core promise: no guessed star codes. A guide may only carry dialling
// steps when it is `verified` from the carrier's own support pages;
// unverified carriers must ship the honest fallback instead.
describe("carrier guide library", () => {
  it("covers the big 6 + the full MVNO expansion", () => {
    const ids = CARRIER_GUIDES.map((g) => g.id);
    for (const id of ["att", "verizon", "tmobile", "rogers", "bell", "telus",
      "metro", "mint", "consumer-cellular", "cricket", "visible", "boost", "google-fi",
      "straight-talk", "tracfone", "xfinity-mobile", "spectrum-mobile"]) {
      expect(ids, id).toContain(id);
    }
    expect(CARRIER_GUIDES).toHaveLength(17);
  });

  it("every guide carries official source URLs", () => {
    for (const g of CARRIER_GUIDES) {
      expect(g.sourceUrls.length, g.id).toBeGreaterThan(0);
      for (const u of g.sourceUrls) expect(u, g.id).toMatch(/^https?:\/\//);
    }
  });

  it("unverified carriers ship a fallback and no dialling steps presented as fact", () => {
    for (const g of CARRIER_GUIDES.filter((x) => !x.verified)) {
      expect(g.fallback, g.id).toBeTruthy();
      expect(g.fallback!.length, g.id).toBeGreaterThan(40);
    }
  });

  it("AT&T wireless is never given a GSM star code (refuted in research)", () => {
    const att = carrierGuide("att")!;
    const wireless = att.sections.find((s) => /wireless/i.test(s.heading))!;
    const text = wireless.steps.join(" ");
    expect(text).not.toMatch(/\*\*61/);
    expect(text).toMatch(/does not publish star codes/i);
    // The verified business products keep their own, different codes.
    const biz = att.sections.map((s) => s.steps.join(" ")).join(" ");
    expect(biz).toContain("*92");
    expect(biz).toContain("*93#");
  });

  it("T-Mobile and Mint carry their own verified GSM forms — and Mint gets no borrowed delay", () => {
    const tm = carrierGuide("tmobile")!;
    expect(tm.sections[0].steps.join(" ")).toContain("**61*1");
    expect(tm.sections[0].steps.join(" ")).toContain("##61#");
    const mint = carrierGuide("mint")!;
    expect(mint.hostNetwork).toBe("T-Mobile");
    expect(mint.sections[0].steps.join(" ")).toContain("**61*1");
    expect(mint.sections[0].steps.join(" ")).toMatch(/does not publish a ring-delay/i);
  });

  it("Verizon mobile is *71/*73 with a fixed delay honestly stated", () => {
    const v = carrierGuide("verizon")!;
    const text = v.sections[0].steps.join(" ");
    expect(text).toContain("*71");
    expect(text).toContain("*73");
    expect(text).toMatch(/can't be set|fixed/i);
  });

  it("Google Fi is a verified negative — no conditional forwarding exists", () => {
    const fi = carrierGuide("google-fi")!;
    expect(fi.verified).toBe(true);
    expect(fi.conditionalOffered).toBe(false);
    expect(fi.sections[0].steps.join(" ")).toMatch(/does not offer conditional/i);
  });

  it("Visible keeps the busy-only nuance — no silent Verizon wording", () => {
    const vis = carrierGuide("visible")!;
    expect(vis.verified).toBe(false);
    const text = vis.sections.map((s) => s.steps.join(" ")).join(" ");
    expect(text).toMatch(/does NOT say unanswered calls forward/i);
  });

  it("Metro never imports T-Mobile codes", () => {
    const metro = carrierGuide("metro")!;
    expect(metro.verified).toBe(false);
    expect(metro.fallback).toContain("(888) 863-8768");
    expect(metro.fallback).not.toContain("**61");
  });

  it("Aspen number placeholders fill for display", () => {
    expect(fillAspenNumber("dial <ASPEN NUMBER> now", "+1 (877) 862-4949")).toBe("dial 18778624949 now");
    expect(fillAspenNumber("dial <ASPEN NUMBER> now", undefined)).toContain("your Aspen number");
  });

  it("Alex's rendering never gives an unverified carrier a code to recite", () => {
    const text = renderCarrierGuidesText();
    for (const g of CARRIER_GUIDES.filter((x) => !x.verified)) {
      const start = text.indexOf(`--- ${g.name}`);
      expect(start, g.id).toBeGreaterThanOrEqual(0);
      const chunk = text.slice(start, start + 400);
      expect(chunk, g.id).toContain("NOT VERIFIED");
    }
    // And the verified anchors are present for the proven carriers.
    expect(text).toContain("**61*1");
    expect(text).toContain("*71");
  });
});
