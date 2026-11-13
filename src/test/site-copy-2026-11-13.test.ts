// @vitest-environment node
import { readFileSync, readdirSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatSetupWaiverEnd, setupWaiverEndDate } from "../lib/setupWaiver";

/**
 * Site-copy build (2026-11-13) — Ron's two decisions:
 *  1. The setup-fee waiver is DATED and auto-rolling: rendered copy says
 *     "waived through {last day of the current month}", computed at
 *     render; agent facts phrase it qualitatively ("through the end of
 *     the month"); the undated "current promotion" wording is gone from
 *     every live surface. (Historical applied migrations under
 *     supabase/migrations are immutable records and out of scope.)
 *  2. Public numbers are promoted in dual form — digits + vanity
 *     letters — while tel: hrefs and structured data stay digit-only.
 *     The 786 realtor line (AI-4ALL) appears on /agents/realtors only,
 *     never on the homepage surfaces.
 */

const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

function walk(dir: URL, exts: string[]): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const child = new URL(entry, dir.href.endsWith("/") ? dir : `${dir.href}/`);
    if (statSync(child).isDirectory()) {
      if (entry === "test" || entry === "node_modules") continue;
      out.push(...walk(child, exts));
    } else if (exts.some((e) => entry.endsWith(e))) {
      out.push(readFileSync(child, "utf8"));
    }
  }
  return out;
}

describe("setup waiver — the rendered date is the real last day of the month", () => {
  const cases: Array<[string, Date, number]> = [
    ["mid-November", new Date(2026, 10, 13), 30],
    ["December 1st rolls to December 31st", new Date(2026, 11, 1), 31],
    ["non-leap February", new Date(2027, 1, 10), 28],
    ["leap February", new Date(2028, 1, 10), 29],
    ["the 31st itself", new Date(2026, 0, 31), 31],
    ["a 30-day month-end", new Date(2026, 3, 30), 30],
  ];
  for (const [label, now, lastDay] of cases) {
    it(label, () => {
      const end = setupWaiverEndDate(now);
      expect(end.getFullYear()).toBe(now.getFullYear());
      expect(end.getMonth()).toBe(now.getMonth());
      expect(end.getDate()).toBe(lastDay);
    });
  }

  it("formats per locale", () => {
    const nov13 = new Date(2026, 10, 13);
    expect(formatSetupWaiverEnd("en-US", nov13)).toBe("November 30");
    expect(formatSetupWaiverEnd("es", nov13)).toBe("30 de noviembre");
    expect(formatSetupWaiverEnd("pt-BR", nov13)).toBe("30 de novembro");
  });

  it("the default (today) lands on the current month's last day", () => {
    const end = setupWaiverEndDate();
    const probe = new Date(end.getFullYear(), end.getMonth() + 1, 0);
    expect(end.getDate()).toBe(probe.getDate());
    expect(end.getTime()).toBeGreaterThanOrEqual(new Date().setHours(0, 0, 0, 0) - 86400000);
  });
});

describe("setup waiver — no undated 'current promotion' wording on live surfaces", () => {
  it("src, _shared facts, index.html and seo-routes are clean", () => {
    const surfaces = [
      ...walk(new URL("../", import.meta.url), [".ts", ".tsx", ".json"]),
      ...walk(
        new URL("../../supabase/functions/_shared/", import.meta.url),
        [".ts"],
      ),
      read("../../index.html"),
      read("../../scripts/seo-routes.mjs"),
    ];
    for (const text of surfaces) {
      expect(text.toLowerCase()).not.toContain("current promotion");
    }
  });

  it("agent facts phrase the waiver qualitatively, never a hard date", () => {
    const facts = read("../../supabase/functions/_shared/homepage-knowledge.ts");
    expect(facts).toContain("waived through the end of the month");
    expect(facts).not.toContain("currently waived");
    expect(facts).not.toContain("currently WAIVED");
  });

  it("the pricing FAQ parity set carries the qualitative phrasing", () => {
    for (const rel of ["../i18n/locales/en.json", "../../scripts/seo-routes.mjs", "../../index.html"]) {
      expect(read(rel)).toContain("setup fee is waived through the end of the month");
    }
  });
});

describe("vanity numbers — digits + letters on display, digits only in hrefs/data", () => {
  it("the display constants carry the exact dual forms", () => {
    const lib = read("../lib/phoneDisplay.ts");
    expect(lib).toContain('digits: "1-877-862-4949"');
    expect(lib).toContain('vanity: "1-877-86-AIWIZ"');
    expect(lib).toContain('digits: "1-772-362-4949"');
    expect(lib).toContain('vanity: "1-772-36-AIWIZ"');
    expect(lib).toContain('digits: "786-244-9688"');
    expect(lib).toContain('vanity: "AI-4ALL"');
    expect(lib).toContain('href: "tel:+18778624949"');
    expect(lib).toContain('href: "tel:+17723624949"');
    expect(lib).toContain('href: "tel:+17862449688"');
  });

  it("the shared footer shows the AIWIZ pair dual form — and never the 786", () => {
    const footer = read("../components/landing/Footer.tsx");
    expect(footer).toContain("phoneDisplay");
    expect(footer).toContain("TOLL_FREE_DISPLAY");
    expect(footer).toContain("LOCAL_DISPLAY");
    expect(footer).not.toContain("786");
    expect(footer).not.toContain("AI-4ALL");
  });

  it("the Help contact line promotes the vanity form", () => {
    expect(read("../pages/Help.tsx")).toContain("1-877-862-4949 · 1-877-86-AIWIZ");
  });

  it("structured data stays digit-only", () => {
    const html = read("../../index.html");
    expect(html).toContain('"telephone": "+1-877-862-4949"');
    expect(html).not.toContain("AIWIZ");
    expect(html).not.toContain("AI-4ALL");
  });
});
