import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  REALTOR_EXAMPLE_PACKS as CLIENT_PACKS,
  examplePackForSiteUrl as clientPackFor,
  topExampleListings as clientTop,
} from "../data/realtorExampleListings";
import {
  REALTOR_EXAMPLE_PACKS as SERVER_PACKS,
  REALTOR_EXAMPLE_SIMULATION_SCRIPT,
  buildExampleListingsLayer,
  examplePackForSiteUrl,
  normalizeExampleSiteUrl,
  stampExampleListings,
  topExampleListings,
} from "../../supabase/functions/_shared/realtor-example-listings";
import { REALTOR_VERTICAL } from "../data/agentVerticals";
import {
  REALTOR_CONVERSATION_LAYER,
  REALTOR_GREETING_VARIANTS,
} from "../../supabase/functions/_shared/homepage-knowledge";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) =>
  fs.readFileSync(path.join(here, "..", "..", rel), "utf8");
const occurrences = (haystack: string, needle: string) =>
  haystack.split(needle).length - 1;

const geminiSessionSource = read("supabase/functions/gemini-session/index.ts");
const templateSource = read(
  "src/components/landing/AgentLandingTemplate.tsx",
);
const templateFlat = templateSource.replace(/\s+/g, " ");
const demoSiteSource = read("src/pages/DemoSite.tsx");
const conversationSource = read("src/components/GeminiConversation.tsx");
const widgetSource = read(
  "src/components/landing/demo-results/AspenDemoWidget.tsx",
);

describe("realtor example listings packs (Batch 2)", () => {
  it("carries one pack per demo example, keyed by the example site URL", () => {
    const options = REALTOR_VERTICAL.demoExamples!.groups.flatMap(
      (g) => g.options,
    );
    expect(options).toHaveLength(14);
    expect(CLIENT_PACKS).toHaveLength(14);
    expect(
      CLIENT_PACKS.map((p) => normalizeExampleSiteUrl(p.url)).sort(),
    ).toEqual(
      options.map((o) => normalizeExampleSiteUrl(o.url)).sort(),
    );
    expect(CLIENT_PACKS.map((p) => p.slug).sort()).toEqual(
      options.map((o) => o.slug).sort(),
    );
  });

  it("every pack has a full listings set with descriptors, taglines and honest source marks", () => {
    for (const pack of CLIENT_PACKS) {
      expect(pack.agentName.length).toBeGreaterThan(2);
      expect(pack.listings.length).toBeGreaterThanOrEqual(8);
      for (const listing of pack.listings) {
        expect(listing.address.length).toBeGreaterThan(3);
        expect(listing.descriptor.length).toBeGreaterThan(8);
        expect(listing.tagline.length).toBeGreaterThan(10);
        expect(["site", "sample"]).toContain(listing.source);
      }
      // The agent's own listings lead the pack where the site had any.
      const own = pack.listings.filter((l) => l.source === "site");
      if (own.length) {
        const top = topExampleListings(pack, 3);
        expect(top[0].source).toBe("site");
      }
    }
  });

  it("client and server copies of the packs stay in lockstep", () => {
    expect(JSON.stringify(SERVER_PACKS)).toBe(JSON.stringify(CLIENT_PACKS));
    for (const pack of CLIENT_PACKS) {
      expect(clientPackFor(pack.url)?.slug).toBe(pack.slug);
      expect(clientTop(pack, 3).map((l) => l.descriptor)).toEqual(
        topExampleListings(pack, 3).map((l) => l.descriptor),
      );
    }
  });
});

describe("example listings stamp — predicate and layer", () => {
  it("matches example sites across www / trailing-slash shapes, and nothing else", () => {
    expect(examplePackForSiteUrl("https://www.aureliaperez.com/")?.slug).toBe(
      "aurelia-perez",
    );
    expect(examplePackForSiteUrl("https://aureliaperez.com")?.slug).toBe(
      "aurelia-perez",
    );
    expect(examplePackForSiteUrl("miamisignaturehomes.com/")?.slug).toBe(
      "mauricio-barba",
    );
    expect(examplePackForSiteUrl("https://example.com/")).toBeNull();
    expect(examplePackForSiteUrl("")).toBeNull();
    expect(examplePackForSiteUrl(undefined)).toBeNull();
    expect(examplePackForSiteUrl(null)).toBeNull();
    expect(normalizeExampleSiteUrl("HTTPS://WWW.Mira-Realestate.com/")).toBe(
      "mira-realestate.com",
    );
  });

  it("builds a layer with the agent name, top descriptors and every listing", () => {
    const pack = examplePackForSiteUrl("https://michaelmartinezrealtor.com/")!;
    const layer = buildExampleListingsLayer(pack);
    expect(layer).toContain("EXAMPLE LISTINGS LAYER");
    expect(layer).toContain("Michael Martinez");
    expect(layer).toContain("NAME THESE FIRST");
    for (const listing of pack.listings) {
      expect(layer).toContain(listing.address);
      expect(layer).toContain(listing.descriptor);
    }
    expect(layer).toContain("$16,500,000");
    // Structure for the not-my-listing branch.
    expect(layer).toContain("NOT on this list");
    expect(layer).toContain("transfer to Michael Martinez right now");
    // The approved script lands in the layer with this pack's agent
    // name substituted — no {agentName} placeholder survives.
    expect(layer).toContain(
      "In a real call I'd whisper a summary and transfer you to Michael Martinez right now",
    );
    expect(layer).toContain(
      "Are you calling about one of our listings today?",
    );
    expect(layer).toContain(
      "Ask me about a specific property — try the first one on the list.",
    );
    expect(layer).not.toContain("{agentName}");
  });

  it("carries the owner-approved simulation script (approved 2026-11-12)", () => {
    const script = REALTOR_EXAMPLE_SIMULATION_SCRIPT;
    expect(script.length).toBeGreaterThan(400);
    // The one soft door-opener, verbatim — and the greeting stays clean.
    expect(script).toContain(
      "Are you calling about one of our listings today?",
    );
    expect(script).toContain("no listing dump up front");
    // The listing moment adapts to the pack's real count.
    expect(script).toContain("and a few others on the site");
    expect(script).toContain("exactly one listing, feature that one");
    // The showing close, verbatim.
    expect(script).toContain("What day suits you?");
    // The not-my-listing branch: the honest line and both offers, with
    // the {agentName} placeholder the layer substitutes per pack.
    expect(script).toContain("not among {agentName}'s listings");
    expect(script).toContain("Give me the exact address");
    expect(script).toContain("will search it and call you back");
    // Ron's transfer narration line, verbatim.
    expect(script).toContain(
      "In a real call I'd whisper a summary and transfer you to {agentName} right now — this is a simulation, so let me take your name and number instead",
    );
    expect(script).toContain("offer to line up a showing");
    // The demo-guide invite, verbatim.
    expect(script).toContain(
      "Ask me about a specific property — try the first one on the list.",
    );
  });

  it("stamps a production-shaped simulation config exactly once", () => {
    const pack = examplePackForSiteUrl("https://mira-realestate.com/")!;
    const config: Record<string, unknown> = {
      businessName: "MIRA Real Estate",
      simulation: true,
      systemPrompt:
        "You are the virtual customer-service assistant for MIRA Real Estate.",
    };
    stampExampleListings(config, pack);
    expect(config.exampleListings).toMatchObject({
      slug: "ray-miramontes",
      agentName: "Ray Miramontes",
    });
    const prompt = String(config.systemPrompt);
    expect(prompt).toContain("EXAMPLE LISTINGS LAYER");
    expect(occurrences(prompt, "EXAMPLE LISTINGS LAYER")).toBe(1);
    stampExampleListings(config, pack);
    expect(
      occurrences(String(config.systemPrompt), "EXAMPLE LISTINGS LAYER"),
    ).toBe(1);
  });
});

describe("example listings wiring — source pins", () => {
  it("gemini-session accepts the sample flag and stamps only on flag + server-side URL match", () => {
    expect(geminiSessionSource).toContain("sample:z.boolean().optional()");
    expect(
      occurrences(geminiSessionSource, "stampExampleListings(config, pack);"),
    ).toBe(1);
    expect(geminiSessionSource).toContain(
      "if(b.sample===true) { const pack=examplePackForSiteUrl(siteUrl); if(pack) stampExampleListings(config, pack); }",
    );
    expect(geminiSessionSource).toContain("siteUrl=lead.website_url || ''");
    // The stamp sits inside the simulation branch: after the simulation
    // config is composed and before the homepage branch opens.
    const stampAt = geminiSessionSource.indexOf(
      "stampExampleListings(config, pack);",
    );
    const composedAt = geminiSessionSource.indexOf("businessDemoConfig(");
    const homepageStampAt = geminiSessionSource.indexOf(
      "stampRealtorLanding(config);",
    );
    expect(composedAt).toBeGreaterThan(-1);
    expect(stampAt).toBeGreaterThan(composedAt);
    expect(stampAt).toBeLessThan(homepageStampAt);
  });

  it("the sample flag threads /demo-site -> widget -> conversation -> authorization", () => {
    expect(demoSiteSource).toContain(
      'searchParams.get("sample") === "1"',
    );
    expect(demoSiteSource).toContain("sample={sampleRequested}");
    expect(widgetSource).toContain("sample={sample}");
    expect(conversationSource).toContain("sample?: boolean");
    expect(conversationSource).toContain("invite, sample, guide");
  });
});

describe("realtor page — examples grid and listings-first copy (Batch 2)", () => {
  it("renders the honestly-labelled grid below the hero form, two rows in a scroll frame", () => {
    expect(templateSource).toContain("data-agent-example-grid");
    expect(templateSource).toContain("What your website could look like");
    expect(templateFlat).toContain("example simulations");
    expect(templateFlat).toContain("not our customers");
    expect(templateSource).toContain("data-agent-example-grid-scroll");
    expect(templateSource).toContain("overflow-y-auto");
    expect(templateSource).toContain("lg:grid-cols-3");
    expect(templateSource).toContain("onClick={() => runExampleDemo(option.url)}");
    expect(templateSource).toContain("EXAMPLE_THUMBNAILS[option.slug]");
    const gridAt = templateSource.indexOf("data-agent-example-grid");
    const formAt = templateSource.indexOf("data-agent-demo-examples");
    const statBarAt = templateSource.indexOf("Stat bar");
    expect(formAt).toBeGreaterThan(-1);
    expect(gridAt).toBeGreaterThan(formAt);
    expect(gridAt).toBeLessThan(statBarAt);
  });

  it("carries the listings-first line in the grid framing and the services list", () => {
    expect(templateFlat).toContain("she leads with your listings first");
    expect(templateFlat).toContain(
      "Your listings first — Aspen leads with your active listings on every call and visit",
    );
  });
});

describe("realtor layer — listings first and examples pitch (Batch 2, greetings untouched)", () => {
  it("adds the listings-first commitment with the dual-side commission framing", () => {
    expect(REALTOR_CONVERSATION_LAYER).toContain("YOUR LISTINGS FIRST");
    expect(REALTOR_CONVERSATION_LAYER).toContain("5–6% commission");
    expect(REALTOR_CONVERSATION_LAYER).toContain(
      "both sides of the 5–6% commission",
    );
  });

  it("adds the examples pitch beat after the own-site pitch, honestly framed", () => {
    expect(REALTOR_CONVERSATION_LAYER).toContain(
      "SHOW THE PROOF — THE EXAMPLE SITES ON THIS PAGE",
    );
    expect(REALTOR_CONVERSATION_LAYER).toContain(
      "Here are examples of other real estate sites — click one and I'll start the demo for you.",
    );
    expect(REALTOR_CONVERSATION_LAYER).toContain("NOT our customers");
    const ownSiteAt = REALTOR_CONVERSATION_LAYER.indexOf(
      "first pitch what you would do on THIS agent's own website",
    );
    expect(ownSiteAt).toBeGreaterThan(-1);
  });

  it("pins the greeting rotation's opening (cater-to revision, owner-directed 2026-11-12)", () => {
    expect(REALTOR_GREETING_VARIANTS).toHaveLength(4);
    expect(REALTOR_GREETING_VARIANTS[0]).toMatch(
      /^Hi, I'm Aspen — and at AiHiddenLeads, we cater to realtors\./,
    );
  });
});
