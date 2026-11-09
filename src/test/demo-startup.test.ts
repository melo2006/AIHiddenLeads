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
test("screenshot that exists but has not failed still skips the remote browser", () => {
  // Pending (still loading) and loaded screenshots keep the cost-saving skip.
  expect(shouldStartRemotePreview(true, true, false)).toBe(false);
});
test("REGRESSION (greatgulf.com, 2026-11-09): screenshot URL present but load FAILED starts the remote preview", () => {
  // Iframe blocked (X-Frame-Options: DENY) + stored screenshot is a dead
  // signed URL (HTTP 403) — gating on URL existence alone left a blank demo.
  expect(shouldStartRemotePreview(true, true, true)).toBe(true);
});
test("screenshot failure never starts the remote preview when no fallback is needed", () => {
  expect(shouldStartRemotePreview(false, true, true)).toBe(false);
  expect(shouldStartRemotePreview(false, false, true)).toBe(false);
});