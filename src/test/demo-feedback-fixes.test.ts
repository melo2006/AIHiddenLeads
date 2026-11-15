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
  SIMULATION_PROMPT,
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

  it("spoken not-touched reassurance: the host owns it ONCE at the very beginning; NO disclaimer in role (owner, 2026-11-15)", () => {
    // Owner decision (2026-11-15, superseding the 2026-11-09 placement
    // below): the SPOKEN disclaimer is said ONCE, at the very beginning
    // of the demo, in the host greeting — and is NEVER repeated when
    // the presenter steps into the website-spokesperson role (Ron's
    // Frank-test direction: the in-role repeat is removed from every
    // demo). The verification gate's Act 1 greeting KEEPS Aspen's line
    // (deliberate scoping: the gate speaks before any mock-up is on
    // screen).
    expect(DEMO_VERIFICATION_GREETING).toContain(DEMO_NOT_TOUCHED_REASSURANCE);
    expect(DEMO_VERIFICATION_GREETING.indexOf(DEMO_NOT_TOUCHED_REASSURANCE)).toBeLessThan(120);
    for (const greeting of [SIMULATION_GREETING, DEMO_INVITE_GREETING]) {
      expect(greeting).toContain(DEMO_NOT_TOUCHED_REASSURANCE);
      expect(greeting).toContain("haven't touched your website or your server");
      // Exactly once per greeting — the dedup is the point.
      expect(greeting.split(DEMO_NOT_TOUCHED_REASSURANCE).length - 1).toBe(1);
    }
    // The in-role segment carries the prohibition, never the delivery:
    // the old honesty-note beat is gone, replaced by the no-disclaimer
    // rule, and its scripted delivery sentence appears nowhere.
    expect(SIMULATION_RECEPTIONIST_SEGMENT).toContain("NO DISCLAIMER IN ROLE");
    expect(SIMULATION_RECEPTIONIST_SEGMENT).not.toContain("quick honesty note: this is a mock-up layered over a copy of your site");
    expect(SIMULATION_PROMPT).not.toContain("quick honesty note: this is a mock-up layered over a copy of your site");
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
    // Publish #71: the toggle labels come from the frame.* catalog so
    // /demo/br renders "Voz"/"Texto"; the English catalog values are the
    // same labels this pin always protected.
    expect(frame).toContain('t("frame.voice"');
    expect(frame).toContain('t("frame.type"');
    expect(en.frame.voice).toBe("Voice");
    expect(en.frame.type).toBe("Type");
  });

  it("replaces the raw provider close code with a plain-language drop line", () => {
    expect(VOICE_DISCONNECT_PLAIN).toContain("The connection dropped");
    expect(VOICE_DISCONNECT_PLAIN).not.toMatch(/code|1007|provider/i);
    expect(proxy).toContain("reason: VOICE_DISCONNECT_PLAIN");
    expect(proxy).not.toContain("Voice provider connection ended");
  });
});
