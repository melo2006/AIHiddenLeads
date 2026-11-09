// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Pins for the "Meet the team" section (audit: meet-the-team-audit-2026-11-09.md;
 * homepage placement: Ron's call, 2026-11-09 — directly under the hero).
 *
 * Source-level pins in the style of demo-invite.test.ts: the section is
 * assembled from real shipped assets and audit-approved copy, so these
 * assertions read the real component/page sources rather than
 * re-implementing them.
 */

const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

const section = read("../components/landing/TeamSection.tsx");
const index = read("../pages/Index.tsx");
const tryDemo = read("../pages/TryDemo.tsx");

describe("meet the team section", () => {
  it("Aspen's card uses the shipped wave GIF — the real face, never a redraw", () => {
    expect(section).toContain('from "@/assets/aspen-idle-wave.gif"');
    // The widget's own usage of the same GIF is untouched (FloatingPersonFrame
    // pin lives in demo-invite.test.ts).
    expect(section).not.toContain("FloatingPersonFrame");
  });

  it("renders the three approved people with their audit roles", () => {
    expect(section).toContain("Aspen — your host");
    expect(section).toContain("Sara — your demo receptionist");
    expect(section).toContain("Alex — setup & support");
    // Alex is a support specialist — never an "engineer".
    expect(section.toLowerCase()).not.toContain("engineer");
  });

  it("keeps Sara's honesty wording: a mock-up, the real site unchanged", () => {
    expect(section).toContain("mock-up of your website");
    expect(section).toContain("Nothing on your real site is changed.");
  });

  it("wires Sara and Alex to their real faces and captured-loop paths", () => {
    // The catalogue stills of the exact Simli faces (personas.ts SARA_FACE_ID,
    // alex-guide.ts ALEX_FACE_ID) are the shipped fallbacks/posters.
    expect(section).toContain("f735e62c-dce7-4c0b-8e85-1c7e21774c45.webp");
    expect(section).toContain("a36d66df-a23d-4569-996b-d0e990019857.webp");
    // Captured loops drop into src/assets/team/ under these names.
    expect(section).toContain("assets/team/sara-loop.webp");
    expect(section).toContain("assets/team/alex-loop.webp");
  });

  it("loops resolve via static imports — never import.meta.glob (production regression)", () => {
    // Regression pin for the defect found live on 2026-11-09: the section
    // originally resolved the loops through
    //   import.meta.glob("../assets/team/*.webp", { eager: true })
    // Vite's glob transform joins the importer dir with the RAW pattern
    // via posix.join, so ".." cancelled the importer's last segment
    // (src/components/landing → src/components) and the scan ran against
    // the nonexistent src/components/assets/team/ — zero matches, no
    // warning, and the production bundle shipped `Object.assign({})`,
    // silently degrading both cards to the catalogue stills while every
    // source-level test stayed green. Static imports cannot fall into
    // that trap: they resolve against the file's real directory and the
    // build FAILS loudly if a committed loop file ever goes missing.
    expect(section).not.toContain("import.meta.glob");
    expect(section).toContain('import saraLoop from "@/assets/team/sara-loop.webp"');
    expect(section).toContain('import alexLoop from "@/assets/team/alex-loop.webp"');
    // And the committed loop files the imports point at must exist.
    for (const name of ["sara-loop.webp", "alex-loop.webp"]) {
      expect(existsSync(new URL(`../assets/team/${name}`, import.meta.url))).toBe(true);
    }
  });

  it("hear-her/him affordances: Aspen opens the widget, Sara goes to /demo, Alex to /setup", () => {
    expect(section).toContain("open-homepage-aspen");
    expect(section).toContain('navigate("/demo")');
    expect(section).toContain('navigate("/setup")');
  });

  it("homepage: the section sits directly under the hero, above Stats", () => {
    const hero = index.indexOf("<HeroSection");
    const team = index.indexOf("<TeamSection />");
    const stats = index.indexOf("<StatsSection");
    expect(hero).toBeGreaterThan(-1);
    expect(team).toBeGreaterThan(hero);
    expect(stats).toBeGreaterThan(team);
  });

  it("demo page: compact variant at the Benefits → How-it-works seam only", () => {
    const benefits = tryDemo.indexOf('t("tryDemo.smsNote")');
    const team = tryDemo.indexOf("<TeamSection compact />");
    const how = tryDemo.indexOf('id="demo-how-title"');
    expect(benefits).toBeGreaterThan(-1);
    expect(team).toBeGreaterThan(benefits);
    expect(how).toBeGreaterThan(team);
    // Exactly one mount on the page; the intake panel and the widget mount
    // are untouched by this build.
    expect(tryDemo.match(/<TeamSection/g)).toHaveLength(1);
    expect(tryDemo).toContain("<DemoIntakePanel");
    expect(tryDemo).toContain("<GeminiAgentWidget");
  });

  it("captured loops: whatever has landed in src/assets/team is an animated asset, not a still renamed", () => {
    // State pin: at ship time the capture may not have landed yet (the
    // component falls back to the catalogue stills). When a loop file IS
    // present it must be a real WebP (RIFF/WEBP header) or GIF.
    for (const name of ["sara-loop.webp", "alex-loop.webp"]) {
      const file = new URL(`../assets/team/${name}`, import.meta.url);
      if (!existsSync(file)) continue;
      const head = readFileSync(file).subarray(0, 12).toString("latin1");
      const isWebp = head.startsWith("RIFF") && head.slice(8, 12) === "WEBP";
      const isGif = head.startsWith("GIF8");
      expect(isWebp || isGif).toBe(true);
    }
  });
});
