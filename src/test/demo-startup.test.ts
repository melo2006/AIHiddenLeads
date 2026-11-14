// @vitest-environment node
import { expect, test } from "vitest";
import { canPresentRawIframe, pendingScanProgress, shouldStartLiveView, shouldStartRemotePreview, shouldUseConsentCoveredRoute, shouldWaitForFreshLeadData } from "../lib/demoStartup";
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
test("REGRESSION (Publish #44 round-3 follow-up, 2026-11-14): a pinned demo reveals for ANY entry url form tied to its leadId, even when the record homepage is a different (canonical) host", () => {
  // Martinez, exactly as hand-shared: pinned leadId + entry link url
  // param https://www.martinezrealtorsfl.com/ (vanity domain), while
  // the stored record homepage is the canonical
  // michaelmartinezrealtor.com. Homepage equality can never hold, and
  // the gate early-returns ABOVE the pinned stored-content reveal +
  // 15s deadline, so waiting here hung the demo forever — the pinned
  // demo must reveal from stored content instead.
  expect(
    shouldWaitForFreshLeadData(
      "https://www.martinezrealtorsfl.com/",
      "https://michaelmartinezrealtor.com/",
      false,
      true,
    ),
  ).toBe(false);
  // Same pinned lead, bare vanity host (no www) and no trailing slash
  // in the record form: still no wait — any URL form goes.
  expect(
    shouldWaitForFreshLeadData(
      "https://martinezrealtorsfl.com/",
      "https://michaelmartinezrealtor.com",
      false,
      true,
    ),
  ).toBe(false);
  // Saperstein: same shape (sapersteinrealty.com vs paulsapersteinhomes.com).
  expect(
    shouldWaitForFreshLeadData(
      "https://www.sapersteinrealty.com/",
      "https://paulsapersteinhomes.com/",
      false,
      true,
    ),
  ).toBe(false);
});
test("the fresh-data wait still protects ordinary demos from stale cross-site data", () => {
  // A visitor building a demo of site B must not be shown site A's
  // cached/merged record: no router state, not pinned, homepages differ.
  expect(
    shouldWaitForFreshLeadData("https://site-b.example/", "https://site-a.example/", false, false),
  ).toBe(true);
});
test("consent-covered route engages only for embeddable, reachable, banner-detected sites", () => {
  // The verified gap (Martinez, 2026-11-14): embeddable + banner → covered route.
  expect(shouldUseConsentCoveredRoute(true, false, false)).toBe(true);
  // No banner detected → the raw iframe keeps the live presentation.
  expect(shouldUseConsentCoveredRoute(false, false, false)).toBe(false);
  // Blocked / mixed-content sites already belong to the fallback chain.
  expect(shouldUseConsentCoveredRoute(true, true, false)).toBe(false);
  // Unreachable sites keep their own chain.
  expect(shouldUseConsentCoveredRoute(true, false, true)).toBe(false);
  expect(shouldUseConsentCoveredRoute(false, true, true)).toBe(false);
});
test("covered route starts the live view even when a stored screenshot exists and loads", () => {
  // The screenshot is only the interim visual on the covered route —
  // the blocked path's cost rule must not gate the start.
  expect(shouldStartLiveView(false, true, false, true)).toBe(true);
  expect(shouldStartLiveView(false, false, false, true)).toBe(true);
});
test("off the covered route, live-view starts keep the existing screenshot cost rule", () => {
  expect(shouldStartLiveView(true, true, false, false)).toBe(false);
  expect(shouldStartLiveView(true, false, false, false)).toBe(true);
  expect(shouldStartLiveView(true, true, true, false)).toBe(true);
  expect(shouldStartLiveView(false, false, false, false)).toBe(false);
  expect(shouldStartLiveView(false, true, true, false)).toBe(false);
});
test("raw iframe is the last resort on the covered route — suppressed until the covered view fails", () => {
  expect(canPresentRawIframe(true, false)).toBe(false);
  expect(canPresentRawIframe(true, true)).toBe(true);
  // Off the covered route the raw iframe is the primary live surface.
  expect(canPresentRawIframe(false, false)).toBe(true);
  expect(canPresentRawIframe(false, true)).toBe(true);
});
test("no fresh-data wait when homepages match, router data exists, or either side is unknown", () => {
  expect(shouldWaitForFreshLeadData("https://a.example/", "https://a.example/", false, false)).toBe(false);
  expect(shouldWaitForFreshLeadData("https://b.example/", "https://a.example/", true, false)).toBe(false);
  expect(shouldWaitForFreshLeadData(null, "https://a.example/", false, false)).toBe(false);
  expect(shouldWaitForFreshLeadData("https://b.example/", null, false, false)).toBe(false);
  expect(shouldWaitForFreshLeadData(null, null, false, false)).toBe(false);
});