// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  COMPRESSION_ABSOLUTE_MAX_TRIGGER_TOKENS,
  COMPRESSION_KEPT_HISTORY_TOKENS,
  COMPRESSION_MIN_PRUNE_SPAN_TOKENS,
  COMPRESSION_SETUP_SUFFIX_CHARS,
  COMPRESSION_TOOLS_ALLOWANCE_TOKENS,
  contextCompressionEnabled,
  contextWindowCompressionConfig,
  estimateTokensFromChars,
} from "../../supabase/functions/_shared/context-compression";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const proxy = read("../../supabase/functions/gemini-live-proxy/index.ts");

/**
 * Publish #85a — Gemini Live context-window compression. Google bills
 * every Live turn for ALL tokens in the session context window, so a
 * server-side sliding window caps the history component of that
 * re-billing (and lifts the ~15-minute uncompressed session limit).
 * Caching is not an alternative: gemini-3.8-live lists it as not
 * supported. The config is sized per session from its own composed
 * prompt so the prune target can never sit below the session's
 * instruction floor (system instruction + tool declarations).
 */
describe("context compression kill switch", () => {
  it("is ON by default and only the exact value 'off' disables it", () => {
    const env = (vals: Record<string, string>) => (n: string) => vals[n];
    expect(contextCompressionEnabled(env({}))).toBe(true);
    expect(contextCompressionEnabled(env({ LIVE_CONTEXT_COMPRESSION: "on" }))).toBe(true);
    expect(contextCompressionEnabled(env({ LIVE_CONTEXT_COMPRESSION: "true" }))).toBe(true);
    expect(contextCompressionEnabled(env({ LIVE_CONTEXT_COMPRESSION: "" }))).toBe(true);
    expect(contextCompressionEnabled(env({ LIVE_CONTEXT_COMPRESSION: "off" }))).toBe(false);
  });
});

describe("instruction token estimator", () => {
  it("uses the conservative 3.25 chars/token divisor and rejects junk", () => {
    expect(estimateTokensFromChars(0)).toBe(0);
    expect(estimateTokensFromChars(-50)).toBe(0);
    expect(estimateTokensFromChars(Number.NaN)).toBe(0);
    expect(estimateTokensFromChars(325)).toBe(100);
    expect(estimateTokensFromChars(326)).toBe(101);
    // Conservative: at least the ~4 chars/token English-prose count.
    expect(estimateTokensFromChars(4000)).toBeGreaterThanOrEqual(1000);
  });
});

describe("contextWindowCompressionConfig sizing", () => {
  it("sizes a homepage-sales session (~76K chars of composed prompt) above its floor", () => {
    const est = estimateTokensFromChars(76354 + COMPRESSION_SETUP_SUFFIX_CHARS) + COMPRESSION_TOOLS_ALLOWANCE_TOKENS;
    const cfg = contextWindowCompressionConfig(est);
    expect(cfg.slidingWindow.targetTokens).toBe(est + COMPRESSION_KEPT_HISTORY_TOKENS);
    expect(cfg.triggerTokens).toBeGreaterThan(cfg.slidingWindow.targetTokens);
    expect(cfg.triggerTokens).toBeLessThanOrEqual(104000);
  });

  it("sizes a Martinez-sized session (~253K chars of composed prompt) above its much larger floor", () => {
    const est = estimateTokensFromChars(253235 + COMPRESSION_SETUP_SUFFIX_CHARS) + COMPRESSION_TOOLS_ALLOWANCE_TOKENS;
    const cfg = contextWindowCompressionConfig(est);
    // The prune target stays above the whole instruction estimate —
    // the KB and persona layers can never be pruned away.
    expect(cfg.slidingWindow.targetTokens).toBe(est + COMPRESSION_KEPT_HISTORY_TOKENS);
    expect(cfg.triggerTokens).toBe(104000); // normal-path cap
    expect(cfg.triggerTokens - cfg.slidingWindow.targetTokens).toBeGreaterThanOrEqual(COMPRESSION_MIN_PRUNE_SPAN_TOKENS);
  });

  it("holds Google's documented ranges and a real prune span for every instruction size", () => {
    for (const est of [0, 1000, 5000, 20000, 27000, 50000, 78000, 94000, 100000, 110000, 120000, 200000]) {
      const cfg = contextWindowCompressionConfig(est);
      expect(cfg.triggerTokens).toBeGreaterThanOrEqual(5000);
      expect(cfg.triggerTokens).toBeLessThanOrEqual(COMPRESSION_ABSOLUTE_MAX_TRIGGER_TOKENS);
      expect(cfg.triggerTokens).toBeLessThan(128000); // the model's hard window
      expect(cfg.slidingWindow.targetTokens).toBeGreaterThanOrEqual(0);
      expect(cfg.slidingWindow.targetTokens).toBeLessThan(cfg.triggerTokens);
      expect(cfg.triggerTokens - cfg.slidingWindow.targetTokens).toBeGreaterThanOrEqual(COMPRESSION_MIN_PRUNE_SPAN_TOKENS);
    }
  });

  it("keeps the prune target at or above the instruction estimate whenever the window leaves room", () => {
    for (const est of [0, 5000, 27000, 50000, 78000, 94000, 100000, 110000]) {
      const cfg = contextWindowCompressionConfig(est);
      expect(cfg.slidingWindow.targetTokens).toBeGreaterThanOrEqual(est);
    }
  });

  it("never lets a small session's trigger start below the floor that keeps compression inert for short demos", () => {
    const cfg = contextWindowCompressionConfig(2000);
    expect(cfg.triggerTokens).toBe(40000);
    expect(cfg.slidingWindow.targetTokens).toBe(12000);
  });
});

describe("proxy wiring", () => {
  it("sends contextWindowCompression in the setup, sized once per session, absent when the kill switch is off", () => {
    expect(proxy).toContain("from '../_shared/context-compression.ts'");
    expect(proxy).toContain("let compressionConfig: ContextWindowCompressionConfig | null | undefined");
    expect(proxy).toContain("if (compressionConfig === undefined)");
    expect(proxy).toContain("contextCompressionEnabled((n) => Deno.env.get(n))");
    expect(proxy).toContain("...(compressionConfig ? { contextWindowCompression: compressionConfig } : {})");
  });

  it("keeps the resumption field first in the setup and the compression field right after it", () => {
    const resumption = proxy.indexOf("sessionResumption: sessionResumptionConfig(providerConnectHandle)");
    const compression = proxy.indexOf("contextWindowCompression: compressionConfig");
    const model = proxy.indexOf("model: `models/${model}`");
    expect(resumption).toBeGreaterThan(-1);
    expect(compression).toBeGreaterThan(resumption);
    expect(model).toBeGreaterThan(compression);
  });
});
