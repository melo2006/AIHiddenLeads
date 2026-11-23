// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../index.css", import.meta.url), "utf8");

/**
 * Avatar framing invariant (2026-11-23, Ron's phone test of the demo
 * simulations): on the Madalon demo Aspen showed as a HEAD ONLY, cut
 * at the mouth above the panel, while on Synectics she was framed
 * head + shoulders + blazer. The presenter media (the still portrait
 * and the live keyed face alike) renders object-fit: cover, anchored
 * to the top of its box, from a near-square source frame — so the
 * fraction of the frame that stays visible is boxHeight / boxWidth,
 * and the presenter's framing is decided by the box's proportion
 * alone. The standard box (234×188, compact 187×150, focus 293×235)
 * shows ~80% of the frame. The short-viewport regimes (the
 * max-height:560px media query and the .aspen-vv-short twins) cut
 * ONLY the height — 234×120 ≈ 51% — so any short visible viewport
 * (a landscape foldable, split-screen, an open keyboard) cropped her
 * to the head. These pins hold every presenter box to the standard
 * proportion and ban the height-only shape outright. CSS behaviour
 * is asserted at the stylesheet seam, the repo's established pattern
 * (see widget-viewport-fit.test.ts); jsdom does not apply index.css.
 */
const STANDARD_FRACTION = 188 / 234; // ≈ 0.803 — head, shoulders, blazer

interface PresenterRule { selector: string; width?: number; height?: number }

/** Every rule whose selector targets the livebox or the standalone
 * portrait sizing (percentage-sized child rules carry no px pair and
 * are ignored by the dimension checks below). */
function presenterRules(fragment: string): PresenterRule[] {
  const rules: PresenterRule[] = [];
  const pattern = /([^{}]*)\{([^{}]*)\}/g;
  for (const match of css.matchAll(pattern)) {
    const selector = match[1].trim();
    if (!selector.includes(fragment)) continue;
    const width = /(?:^|;)\s*width: (\d+)px/.exec(match[2]);
    const height = /(?:^|;)\s*height: (\d+)px/.exec(match[2]);
    rules.push({ selector, width: width ? Number(width[1]) : undefined, height: height ? Number(height[1]) : undefined });
  }
  return rules;
}

describe("avatar framing invariant — presenter boxes keep the standard proportion", () => {
  it("every px-sized livebox shows ~80% of the frame (never the ~51% head-only crop)", () => {
    const sized = presenterRules(".aspen-person-livebox").filter((r) => r.width !== undefined && r.height !== undefined);
    // base, compact, focus, focus-compact, short media query (+focus),
    // vv-short (+focus): the invariant must be checked everywhere the
    // box is sized, so a new regime cannot slip in unpinned.
    expect(sized.length).toBeGreaterThanOrEqual(7);
    for (const rule of sized) {
      expect(Math.abs(rule.height! / rule.width! - STANDARD_FRACTION), `${rule.selector} (${rule.width}x${rule.height})`).toBeLessThan(0.01);
    }
  });

  it("every px-sized standalone portrait keeps the same proportion", () => {
    const sized = presenterRules(".aspen-person-portrait")
      .filter((r) => !r.selector.includes(".aspen-person-livebox"))
      .filter((r) => r.width !== undefined && r.height !== undefined);
    expect(sized.length).toBeGreaterThanOrEqual(5);
    for (const rule of sized) {
      expect(Math.abs(rule.height! / rule.width! - STANDARD_FRACTION), `${rule.selector} (${rule.width}x${rule.height})`).toBeLessThan(0.01);
    }
  });

  it("no presenter rule cuts the height without pairing the width (the 2026-11-23 defect shape)", () => {
    for (const fragment of [".aspen-person-livebox", ".aspen-person-portrait"]) {
      for (const rule of presenterRules(fragment)) {
        if (rule.height !== undefined) {
          expect(rule.width, `${rule.selector} sets a px height with no px width`).toBeDefined();
        }
      }
    }
  });

  it("the short-viewport pairs are the scaled standard boxes (150x120, focus 187x150)", () => {
    expect(css).toContain(".aspen-person-livebox { width: 150px; height: 120px; }");
    expect(css).toContain(".aspen-vv-short .aspen-person-livebox { width: 150px; height: 120px; }");
    expect(css).toContain(".aspen-person-shell.aspen-person-focus .aspen-person-livebox { width: 187px; height: 150px; }");
    expect(css).toContain(".aspen-vv-short .aspen-person-shell.aspen-person-focus .aspen-person-livebox { width: 187px; height: 150px; }");
  });
});
