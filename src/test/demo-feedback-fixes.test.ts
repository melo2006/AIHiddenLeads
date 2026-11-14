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
  SIMULATION_RECEPTIONIST_SEGMENT,
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
 *     demo entry surface AND the first spoken beat of every demo greeting
 *     (copy slimmed later the same day on the owner's order after his
 *     Great Gulf phone test — one line visible, one sentence spoken;
 *     collapse behavior lives in demo-reassurance-strip.test.tsx);
 * (4) the Voice/Type pill: both options fully visible in both states
 *     (opaque pill background, full-strength inactive text);
 * (1) a provider drop must read as a plain-language line, never a raw
 *     provider close code.
 */
describe("demo feedback fixes (2026-11-09)", () => {
  it("pins the visible reassurance copy verbatim (slimmed 2026-11-09 on the owner's order; Dennis's meaning kept)", () => {
    expect(en.tryDemo.notTouched).toBe(
      "Demo mock-up — your website is untouched, nothing on your server is changed.",
    );
    expect(en.tryDemo.notTouchedShort).toBe("Mock-up — site untouched");
    // The slimmed line stays a single short line — it can never grow back
    // into the paragraph that ate the prospect's site on phone screens.
    expect(en.tryDemo.notTouched.split(" ").length).toBeLessThanOrEqual(14);
    // es / pt-BR are real translations of the same promise, never copies.
    for (const locale of [es, pt]) {
      expect(locale.tryDemo.notTouched.trim().length).toBeGreaterThan(20);
      expect(locale.tryDemo.notTouched).not.toBe(en.tryDemo.notTouched);
      expect(locale.tryDemo.notTouchedShort.trim().length).toBeGreaterThan(5);
      expect(locale.tryDemo.notTouchedShort).not.toBe(en.tryDemo.notTouchedShort);
    }
  });

  it("shows the reassurance strip on /demo, /demo-site and the invite interstitial", () => {
    expect(tryDemo).toContain("<DemoReassuranceStrip />");
    expect(demoSite).toContain("<DemoReassuranceStrip compact />");
    expect(inviteDemo).toContain("<DemoReassuranceStrip compact />");
    // /demo: the strip renders BEFORE the intake form in source order.
    expect(tryDemo.indexOf("<DemoReassuranceStrip />")).toBeLessThan(tryDemo.indexOf("<DemoIntakePanel"));
  });

  it("spoken not-touched reassurance: Sara owns it at the simulation entry; Aspen's demo-site greetings no longer carry it", () => {
    // Owner decision (2026-11-09 21:00, superseding the same-day
    // disclaimer-slim greeting pins below): the SPOKEN disclaimer moved
    // from Aspen to Sara — she is the one standing on the mock-up. The
    // verification gate's Act 1 greeting KEEPS Aspen's line (deliberate
    // scoping: the gate speaks before any mock-up is on screen).
    expect(DEMO_VERIFICATION_GREETING).toContain(DEMO_NOT_TOUCHED_REASSURANCE);
    expect(DEMO_VERIFICATION_GREETING.indexOf(DEMO_NOT_TOUCHED_REASSURANCE)).toBeLessThan(120);
    for (const greeting of [SIMULATION_GREETING, DEMO_INVITE_GREETING]) {
      expect(greeting).not.toContain(DEMO_NOT_TOUCHED_REASSURANCE);
      expect(greeting).not.toContain("haven't touched your website or your server");
    }
    // Sara's first in-simulation beat carries the full substance: the
    // slim sentence's clauses plus the public-pages clause.
    expect(SIMULATION_RECEPTIONIST_SEGMENT).toContain("THE HONESTY NOTE");
    expect(SIMULATION_RECEPTIONIST_SEGMENT).toContain("mock-up layered over a copy of your site — we haven't touched your website or your server");
    expect(SIMULATION_RECEPTIONIST_SEGMENT).toContain("built only from your public pages");
    // Slimmed spoken line (owner's order, 2026-11-09): one sentence, exact
    // pin plus a word-count ceiling so it cannot creep back to a paragraph.
    expect(DEMO_NOT_TOUCHED_REASSURANCE).toBe(
      "Before we start: this is a mock-up layered over a copy of your site — we haven't touched your website or your server.",
    );
    expect(DEMO_NOT_TOUCHED_REASSURANCE).toContain("mock-up layered over a copy");
    expect(DEMO_NOT_TOUCHED_REASSURANCE).toContain("haven't touched your website or your server");
    expect(DEMO_NOT_TOUCHED_REASSURANCE.split(/\s+/).length).toBeLessThanOrEqual(24);
  });

  it("keeps BOTH Voice/Type options fully visible in both states (Ron's Z Fold screenshots)", () => {
    // The pill carries its own opaque background — never a translucent wash.
    expect(frame).toContain("border-border bg-card p-1 shadow-md");
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
