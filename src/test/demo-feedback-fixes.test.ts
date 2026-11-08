// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import en from "../i18n/locales/en.json";
import es from "../i18n/locales/es.json";
import pt from "../i18n/locales/pt-BR.json";
import {
  DEMO_INVITE_GREETING,
  DEMO_VERIFICATION_GREETING,
} from "../../supabase/functions/_shared/demo-sales";
import {
  DEMO_NOT_TOUCHED_REASSURANCE,
  SIMULATION_GREETING,
  VOICE_DISCONNECT_PLAIN,
} from "../../supabase/functions/_shared/voice-config";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const frame = read("../components/FloatingPersonFrame.tsx");
const tryDemo = read("../pages/TryDemo.tsx");
const demoSite = read("../pages/DemoSite.tsx");
const inviteDemo = read("../pages/InviteDemo.tsx");
const proxy = read("../../supabase/functions/gemini-live-proxy/index.ts");

/**
 * Guards for the 2026-11-09 Ron + Dennis live-demo feedback batch:
 * (2) the "we did NOT hack your website" reassurance — visible on every
 *     demo entry surface AND the first spoken beat of every demo greeting;
 * (4) the Voice/Type pill: both options fully visible in both states
 *     (opaque pill background, full-strength inactive text);
 * (1) a provider drop must read as a plain-language line, never a raw
 *     provider close code.
 */
describe("demo feedback fixes (2026-11-09)", () => {
  it("pins the visible reassurance copy verbatim (Dennis's wording)", () => {
    expect(en.tryDemo.notTouched).toBe(
      "Quick reassurance before we start: we have NOT touched your website. We read only what's public on it — the same pages any visitor can see — so Aspen understands what you do. This demo is a mock-up: your site stays exactly as it is, and our assistant is simply layered over a copy. Nothing on your server is changed, accessed or stored — ever.",
    );
    // es / pt-BR are real translations of the same promise, never copies.
    for (const locale of [es, pt]) {
      expect(locale.tryDemo.notTouched.trim().length).toBeGreaterThan(50);
      expect(locale.tryDemo.notTouched).not.toBe(en.tryDemo.notTouched);
    }
  });

  it("shows the reassurance strip on /demo, /demo-site and the invite interstitial", () => {
    expect(tryDemo).toContain("<DemoReassuranceStrip />");
    expect(demoSite).toContain("<DemoReassuranceStrip compact />");
    expect(inviteDemo).toContain("<DemoReassuranceStrip compact />");
    // /demo: the strip renders BEFORE the intake form in source order.
    expect(tryDemo.indexOf("<DemoReassuranceStrip />")).toBeLessThan(tryDemo.indexOf("<DemoIntakePanel"));
  });

  it("opens every spoken demo greeting with the not-touched reassurance, before any pitch", () => {
    for (const greeting of [SIMULATION_GREETING, DEMO_VERIFICATION_GREETING, DEMO_INVITE_GREETING]) {
      expect(greeting).toContain(DEMO_NOT_TOUCHED_REASSURANCE);
      // The reassurance lands in the first beat of the greeting, not buried.
      expect(greeting.indexOf(DEMO_NOT_TOUCHED_REASSURANCE)).toBeLessThan(120);
    }
    expect(DEMO_NOT_TOUCHED_REASSURANCE).toContain("we have not touched your website");
    expect(DEMO_NOT_TOUCHED_REASSURANCE).toContain("mock-up layered over a copy");
    expect(DEMO_NOT_TOUCHED_REASSURANCE).toContain("Your site and your server are exactly as you left them.");
  });

  it("keeps BOTH Voice/Type options fully visible in both states (Ron's Z Fold screenshots)", () => {
    // The pill carries its own opaque background — never a translucent wash.
    expect(frame).toContain("border-border bg-card p-0.5 shadow-md");
    expect(frame).not.toContain("bg-muted/50");
    // The inactive segment is full-strength foreground text, never muted.
    expect(frame).not.toContain("text-muted-foreground hover:text-foreground");
    expect(frame).toContain("'bg-transparent text-foreground hover:bg-muted'");
    // Both segments always render, with pressed state on the active one.
    expect(frame).toContain('aria-pressed={mode === \'voice\'}');
    expect(frame).toContain('aria-pressed={mode === \'chat\'}');
    expect(frame).toContain(">Voice</button>");
    expect(frame).toContain(">Type</button>");
  });

  it("replaces the raw provider close code with a plain-language drop line", () => {
    expect(VOICE_DISCONNECT_PLAIN).toContain("The connection dropped");
    expect(VOICE_DISCONNECT_PLAIN).not.toMatch(/code|1007|provider/i);
    expect(proxy).toContain("reason: VOICE_DISCONNECT_PLAIN");
    expect(proxy).not.toContain("Voice provider connection ended");
  });
});
