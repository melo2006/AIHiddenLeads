// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  buildCookieConsentDismissalActions,
  buildFirecrawlScreenshotBody,
  fetchFirecrawlScreenshot,
  firecrawlPaceWaitMs,
  markFirecrawlRequest,
  parseRetryAfterSeconds,
} from "../../supabase/functions/_shared/firecrawl-screenshot";

// The Firecrawl fallback leg moved from the deprecated v1 /scrape body
// (whose `screenshotOptions` key Firecrawl now rejects with a 400) to the
// v2 format-object shape. These tests pin the v2 body, the retry_after
// parsing, the pacing math, and the bounded 429 retry loop — all with a
// fake fetcher, no network.

const fakeResponse = (status: number, body: unknown, headers: Record<string, string> = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
  json: async () => body,
});

describe("firecrawl v2 screenshot body", () => {
  it("uses the v2 format object: screenshot type, full page, desktop viewport", () => {
    const body = buildFirecrawlScreenshotBody("https://example.com/");
    expect(body).toEqual({
      url: "https://example.com/",
      formats: [{ type: "screenshot", fullPage: true, viewport: { width: 1920, height: 1080 } }],
      waitFor: 10000,
      timeout: 40000,
    });
  });

  it("carries no v1-era keys Firecrawl rejects", () => {
    const body = buildFirecrawlScreenshotBody("https://example.com/");
    expect(body).not.toHaveProperty("screenshotOptions");
    expect(JSON.stringify(body)).not.toContain("screenshotOptions");
  });
});

describe("cookie consent dismissal actions", () => {
  const SCRIPT = "cookieConsentDismissalMain(document, {});";

  it("builds wait → executeJavascript → wait actions around the dismissal script", () => {
    expect(buildCookieConsentDismissalActions(SCRIPT)).toEqual([
      { type: "wait", milliseconds: 1200 },
      { type: "executeJavascript", script: SCRIPT },
      { type: "wait", milliseconds: 2500 },
    ]);
  });

  it("adds actions to the body only when provided, keeping the v2 format shape", () => {
    const withActions = buildFirecrawlScreenshotBody(
      "https://example.com/",
      buildCookieConsentDismissalActions(SCRIPT),
    );
    expect(withActions.formats).toEqual([
      { type: "screenshot", fullPage: true, viewport: { width: 1920, height: 1080 } },
    ]);
    expect(withActions.actions).toEqual(buildCookieConsentDismissalActions(SCRIPT));
    expect(buildFirecrawlScreenshotBody("https://example.com/")).not.toHaveProperty("actions");
  });

  it("sends the dismissal actions when a consent script is provided", async () => {
    const fetcher = vi.fn(async () => fakeResponse(200, { success: true, data: { screenshot: "https://fc.example/shot.png" } }));
    const data: any = await fetchFirecrawlScreenshot("https://example.com/", "fc-key", {
      fetcher: fetcher as any,
      sleep: async () => {},
      log: () => {},
      paceWaitMs: () => 0,
      consentDismissalScript: SCRIPT,
    });
    expect(data.data.screenshot).toBe("https://fc.example/shot.png");
    const [, init] = fetcher.mock.calls[0] as any;
    const body = JSON.parse(init.body);
    expect(body.actions).toEqual(buildCookieConsentDismissalActions(SCRIPT));
  });

  it("retries WITHOUT actions if Firecrawl rejects them with a 400", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse(400, { error: "Unrecognized key: actions" }))
      .mockResolvedValueOnce(fakeResponse(200, { success: true, data: { screenshot: "https://fc.example/shot.png" } }));
    const logs: string[] = [];
    const data: any = await fetchFirecrawlScreenshot("https://example.com/", "fc-key", {
      fetcher: fetcher as any,
      sleep: async () => {},
      log: (...args) => { logs.push(args.join(" ")); },
      paceWaitMs: () => 0,
      consentDismissalScript: SCRIPT,
    });
    expect(data.data.screenshot).toBe("https://fc.example/shot.png");
    expect(fetcher).toHaveBeenCalledTimes(2);
    const secondBody = JSON.parse((fetcher.mock.calls[1] as any)[1].body);
    expect(secondBody).not.toHaveProperty("actions");
    expect(secondBody).toEqual(buildFirecrawlScreenshotBody("https://example.com/"));
    expect(logs.some((l) => l.includes("without consent-dismissal actions"))).toBe(true);
  });
});

describe("parseRetryAfterSeconds", () => {
  it("reads the top-level retry_after_seconds from the 429 payload", () => {
    expect(parseRetryAfterSeconds({ body: { retry_after_seconds: 17 } })).toBe(17);
  });

  it("reads a nested error retry_after_seconds", () => {
    expect(parseRetryAfterSeconds({ body: { error: { retry_after_seconds: 9 } } })).toBe(9);
  });

  it("falls back to the Retry-After header", () => {
    expect(parseRetryAfterSeconds({ body: {}, retryAfterHeader: "23" })).toBe(23);
  });

  it("returns null when nothing usable is present", () => {
    expect(parseRetryAfterSeconds({ body: { error: "slow down" } })).toBeNull();
    expect(parseRetryAfterSeconds({ body: null })).toBeNull();
    expect(parseRetryAfterSeconds({ body: { retry_after_seconds: "abc" } })).toBeNull();
    expect(parseRetryAfterSeconds({ body: { retry_after_seconds: 0 } })).toBeNull();
  });
});

describe("firecrawl pacing", () => {
  it("waits out the remainder of the pace window after a marked call", () => {
    const t0 = 1_700_000_000_000;
    markFirecrawlRequest(t0);
    expect(firecrawlPaceWaitMs(t0)).toBe(1500);
    expect(firecrawlPaceWaitMs(t0 + 500)).toBe(1000);
    expect(firecrawlPaceWaitMs(t0 + 1500)).toBe(0);
    expect(firecrawlPaceWaitMs(t0 + 60_000)).toBe(0);
  });
});

describe("fetchFirecrawlScreenshot 429 handling", () => {
  const noPacing = () => 0;

  it("posts to /v2/scrape with the v2 body and returns the payload", async () => {
    const fetcher = vi.fn(async () => fakeResponse(200, { success: true, data: { screenshot: "https://fc.example/shot.png" } }));
    const data: any = await fetchFirecrawlScreenshot("https://example.com/", "fc-key", {
      fetcher: fetcher as any,
      sleep: async () => {},
      log: () => {},
      paceWaitMs: noPacing,
    });
    expect(data.data.screenshot).toBe("https://fc.example/shot.png");
    const [calledUrl, init] = fetcher.mock.calls[0] as any;
    expect(calledUrl).toBe("https://api.firecrawl.dev/v2/scrape");
    expect(JSON.parse(init.body)).toEqual(buildFirecrawlScreenshotBody("https://example.com/"));
  });

  it("retries a 429 after retry_after_seconds and then succeeds", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse(429, { error: "rate limited", retry_after_seconds: 3 }))
      .mockResolvedValueOnce(fakeResponse(200, { success: true, data: { screenshot: "https://fc.example/shot.png" } }));
    const sleeps: number[] = [];
    const logs: string[] = [];
    const data: any = await fetchFirecrawlScreenshot("https://example.com/", "fc-key", {
      fetcher: fetcher as any,
      sleep: async (ms) => { sleeps.push(ms); },
      log: (...args) => { logs.push(args.join(" ")); },
      paceWaitMs: noPacing,
    });
    expect(data.data.screenshot).toBe("https://fc.example/shot.png");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([3000]);
    expect(logs.some((l) => l.includes("429") && l.includes("retry 1/2"))).toBe(true);
  });

  it("gives up after 2 retries (3 calls total) on persistent 429s", async () => {
    const fetcher = vi.fn(async () => fakeResponse(429, { retry_after_seconds: 1 }));
    const sleeps: number[] = [];
    await expect(fetchFirecrawlScreenshot("https://example.com/", "fc-key", {
      fetcher: fetcher as any,
      sleep: async (ms) => { sleeps.push(ms); },
      log: () => {},
      paceWaitMs: noPacing,
    })).rejects.toThrow(/429/);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(sleeps).toEqual([1000, 1000]);
  });

  it("caps a huge retry_after_seconds at the 20s wait bound", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse(429, { retry_after_seconds: 300 }))
      .mockResolvedValueOnce(fakeResponse(200, { success: true, data: {} }));
    const sleeps: number[] = [];
    await fetchFirecrawlScreenshot("https://example.com/", "fc-key", {
      fetcher: fetcher as any,
      sleep: async (ms) => { sleeps.push(ms); },
      log: () => {},
      paceWaitMs: noPacing,
    });
    expect(sleeps).toEqual([20000]);
  });

  it("does not retry non-429 errors", async () => {
    const fetcher = vi.fn(async () => fakeResponse(400, { error: "bad request" }));
    await expect(fetchFirecrawlScreenshot("https://example.com/", "fc-key", {
      fetcher: fetcher as any,
      sleep: async () => {},
      log: () => {},
      paceWaitMs: noPacing,
    })).rejects.toThrow(/400/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("waits for pacing before firing when the pace window is still open", async () => {
    const fetcher = vi.fn(async () => fakeResponse(200, { success: true, data: {} }));
    const events: string[] = [];
    await fetchFirecrawlScreenshot("https://example.com/", "fc-key", {
      fetcher: (async (...args: any[]) => { events.push("fetch"); return fetcher(...args); }) as any,
      sleep: async (ms) => { events.push(`sleep:${ms}`); },
      log: () => {},
      paceWaitMs: () => 1200,
    });
    expect(events).toEqual(["sleep:1200", "fetch"]);
  });
});
