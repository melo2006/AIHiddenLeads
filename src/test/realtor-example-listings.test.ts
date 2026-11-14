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
    // The not-my-listing branch: the honest line survives ONLY for a
    // specific named property, with the {agentName} placeholder the
    // layer substitutes per pack. The old path-one demand — "Give me
    // the exact address" — was the 2026-11-14 defect and is gone:
    // a criteria searcher is captured on criteria + callback number
    // instead (pinned in detail by the no-match describe below).
    expect(script).toContain("not among {agentName}'s listings");
    expect(script).not.toContain("Give me the exact address");
    expect(script).toContain("will search for them and call them back");
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

describe("listings no-match behavior (2026-11-14, Ron's Frank/Martinez retest)", () => {
  const script = REALTOR_EXAMPLE_SIMULATION_SCRIPT;
  const section = (from: string, to: string) =>
    script.slice(script.indexOf(from), script.indexOf(to));
  const collect = section(
    "COLLECT THE CRITERIA BEFORE YOU ANSWER",
    "THE LISTING MOMENT",
  );
  const criteriaNoMatch = section(
    "NO MATCH FOR THEIR CRITERIA",
    "NOT ONE OF OURS",
  );
  const notOurs = section("NOT ONE OF OURS", "SELLERS:");
  const sellers = section("SELLERS:", "THE DEMO-GUIDE INVITE");

  it("collects piecemeal criteria BEFORE answering — no yes-then-flip", () => {
    // The collect rule sits between the preference question and the
    // listing moment, so the ordering is structural, not a suggestion.
    expect(script.indexOf("COLLECT THE CRITERIA BEFORE YOU ANSWER")).toBeGreaterThan(
      script.indexOf("ASK WHAT THEY'RE LOOKING FOR"),
    );
    expect(script.indexOf("COLLECT THE CRITERIA BEFORE YOU ANSWER")).toBeLessThan(
      script.indexOf("THE LISTING MOMENT"),
    );
    expect(collect).toContain("piece by piece");
    expect(collect).toContain('NEVER begin a "yes, we have');
    expect(collect).toContain("Answer ONCE");
  });

  it("criteria no-match is worded about the criteria, never a phantom property", () => {
    expect(criteriaNoMatch).toContain("SEARCHING BY CRITERIA");
    expect(criteriaNoMatch).toContain(
      "don't have a match for that among {agentName}'s current listings",
    );
    // The defect line framed the visitor as having named a property.
    expect(criteriaNoMatch).toContain('there is no "that one"');
    expect(criteriaNoMatch).not.toContain(
      "That one's not among {agentName}'s listings",
    );
  });

  it("never demands an exact address from a searching buyer", () => {
    expect(script).not.toContain("Give me the exact address");
    expect(criteriaNoMatch).toContain("never ask a searching visitor");
    expect(notOurs).toContain("never DEMAND the exact address");
    // The honest not-ours line survives ONLY in the named-property branch.
    expect(notOurs).toContain(
      "\"That one's not among {agentName}'s listings.\"",
    );
  });

  it("criteria no-match captures the criteria and a callback number", () => {
    expect(criteriaNoMatch).toContain(
      "the area, the beds and baths, the budget",
    );
    expect(criteriaNoMatch).toContain(
      "{agentName} will search for them and call them back",
    );
    expect(criteriaNoMatch).toContain("best callback number");
    expect(criteriaNoMatch).toContain("if you do not already have them");
  });

  it("the address ask belongs ONLY to the seller path", () => {
    expect(sellers).toContain("ONLY place the address ask belongs");
    expect(sellers).toContain(
      "address of the property they want to sell",
    );
    expect(sellers).toContain("never turn a seller away for location");
  });

  it("the built layer carries the same split for the pack's agent", () => {
    const pack = examplePackForSiteUrl(
      "https://michaelmartinezrealtor.com/",
    )!;
    const layer = buildExampleListingsLayer(pack);
    expect(layer).toContain(
      "no current match for those criteria among Michael Martinez's listings",
    );
    expect(layer).toContain(
      "never ask a searching visitor for an exact address",
    );
    expect(layer).toContain(
      "never demand the exact address from a buyer",
    );
    expect(layer).not.toContain("take the exact address");
    // The presenter variant carries it too (Frank fronts Martinez).
    const presenterLayer = buildExampleListingsLayer(pack, {
      presenter: true,
    });
    expect(presenterLayer).toContain("NO MATCH FOR THEIR CRITERIA");
    expect(presenterLayer).not.toContain("Give me the exact address");
  });
});

describe("example listings wiring — source pins", () => {
  it("gemini-session accepts the sample flag and stamps only on flag + server-side URL match", () => {
    expect(geminiSessionSource).toContain("sample:z.boolean().optional()");
    // Frank batch (2026-11-13): the pack is resolved ONCE, up front —
    // the presenter decision reads the same flag + server-side URL
    // match — and stamped from that single resolution. The trust
    // semantics are unchanged: flag alone earns nothing, URL match
    // alone earns nothing.
    expect(
      occurrences(geminiSessionSource, "stampExampleListings(config, examplePack, presenter ? { presenter: true } : undefined);"),
    ).toBe(1);
    expect(geminiSessionSource).toContain(
      "const examplePack=b.sample===true?examplePackForSiteUrl(siteUrl):null;",
    );
    // Presenter-owns-close (2026-11-14): the stamp passes the
    // presenter variant when this session's resolved presenter
    // fronts the example — the layer's named-person paragraph is
    // the solo version there; the trust semantics are unchanged.
    expect(geminiSessionSource).toContain(
      "if(examplePack) stampExampleListings(config, examplePack, presenter ? { presenter: true } : undefined);",
    );
    expect(geminiSessionSource).toContain("siteUrl=lead.website_url || ''");
    // The stamp sits inside the simulation branch: after the simulation
    // config is composed and before the homepage branch opens.
    const stampAt = geminiSessionSource.indexOf(
      "stampExampleListings(config, examplePack, presenter ? { presenter: true } : undefined);",
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
