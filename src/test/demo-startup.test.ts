// @vitest-environment node
import { expect, test } from "vitest";
import { pendingScanProgress, shouldStartRemotePreview } from "../lib/demoStartup";
test("unfinished scans never report 100 percent or exceed 88 percent", () => {
  for (const ms of [0, 13200, 30000, 90000, 300000, 3600000]) expect(pendingScanProgress(ms)).toBeLessThanOrEqual(88);
  expect(pendingScanProgress(13200)).toBeLessThan(30);
});
test("pending progress moves forward while scraping continues", () => {
  expect(pendingScanProgress(90000)).toBeGreaterThan(pendingScanProgress(30000));
});
test("existing screenshot skips the unnecessary remote browser wait", () => {
  expect(shouldStartRemotePreview(true, true)).toBe(false);
  expect(shouldStartRemotePreview(true, false)).toBe(true);
  expect(shouldStartRemotePreview(false, false)).toBe(false);
});