// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Publish #41 Pick 1 guard (Ron approved 2026-11-13).
 *
 * The scrolling promo bar's component (ScrollingPromoBar.tsx) is
 * Studio-local-only — it exists in NO git ref — so its line cannot be
 * edited from main. The approved replacement line
 *   "Premium $99/mo · Professional $199/mo — and your $199 setup fee is
 *    waived through the end of the month"
 * is applied to the Studio copy in-session at publish time
 * (publish-41-prep-plan-2026-11-13.md §3, step 4a).
 *
 * What main CAN pin — and what this test pins — is the main-side half of
 * the pick: the retired line must exist NOWHERE in the tree main ships.
 * The pricing cleanup already removed it from copy, locales, checkout and
 * tests; if it ever creeps back into src, this guard fails before a
 * publish can carry it. Needles are concatenated so this guard file does
 * not itself contain the retired strings.
 */
const RETIRED_FRAGMENTS = ["50% " + "OFF", "ENDS THIS " + "MONTH"];
const SRC_ROOT = path.join(__dirname, "..");
const SELF = path.join(__dirname, "promo-bar-line-guard.test.ts");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|json)$/.test(entry)) out.push(full);
  }
  return out;
}

describe("retired promo-bar line — absent from everything main ships (Publish #41 Pick 1)", () => {
  it("no source, locale or test file in src carries the retired line", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC_ROOT)) {
      if (file === SELF) continue;
      const text = readFileSync(file, "utf8");
      if (RETIRED_FRAGMENTS.some((fragment) => text.includes(fragment))) {
        offenders.push(path.relative(SRC_ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});
