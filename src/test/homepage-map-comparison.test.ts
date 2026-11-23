// @vitest-environment node
import { expect, test } from "vitest";
import { homepageMapComparison } from "../lib/homepageMapComparison";

test("comparison shows 25 checkpoints on each map", () => {
  expect(homepageMapComparison).toHaveLength(25);
  expect(new Set(homepageMapComparison.map(p => `${p.row},${p.col}`)).size).toBe(25);
});
test("before has only the office green at number one", () => {
  expect(homepageMapComparison.filter(p => p.beforeTone === "good").map(p => p.index)).toEqual([12]);
  expect(homepageMapComparison[12].beforeRank).toBe(1);
  expect(homepageMapComparison.filter(p => p.index !== 12).every(p => p.beforeRank >= 14)).toBe(true);
});
test("after illustrates exactly 22 green ranks between one and three", () => {
  const green = homepageMapComparison.filter(p => p.afterTone === "good");
  expect(green).toHaveLength(22);
  expect(green.every(p => p.afterRank >= 1 && p.afterRank <= 3)).toBe(true);
});
// Paid ranking tiers (Maps Boost $149 / AI Search $249 / bundle $299) were
// pulled on 2026-11-23 by Ron's decision — the offer constants and their
// price pins were removed with the cards. The illustrative grid stays.