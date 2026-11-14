import { describe, expect, it } from "vitest";
import {
  REALTOR_DISCOVERY_GREETING_VARIANTS,
  REALTOR_DISCOVERY_OPENER,
  buildRealtorDiscoveryLayer,
  renderRealtorDiscoveryGreeting,
} from "../../supabase/functions/_shared/realtor-discovery";
import {
  REALTOR_EXAMPLE_PACKS,
  buildExampleListingsLayer,
  examplePackBySlug,
} from "../../supabase/functions/_shared/realtor-example-listings";
import { REALTOR_EXAMPLE_PRESENTERS } from "../../supabase/functions/_shared/realtor-example-pinned-leads";

const occurrences = (haystack: string, needle: string) =>
  haystack.split(needle).length - 1;

const layer = buildRealtorDiscoveryLayer({ agentName: "Michael Martinez" });

describe("realtor discovery — warm opening variants (step 0)", () => {
  it("rotates at least three distinct openings, each carrying gratitude", () => {
    expect(REALTOR_DISCOVERY_GREETING_VARIANTS.length).toBeGreaterThanOrEqual(3);
    // all distinct — no two callers are guaranteed the same script
    expect(new Set(REALTOR_DISCOVERY_GREETING_VARIANTS).size).toBe(
      REALTOR_DISCOVERY_GREETING_VARIANTS.length,
    );
    for (const variant of REALTOR_DISCOVERY_GREETING_VARIANTS) {
      // gratitude is in every variant, not just some
      expect(variant).toMatch(/thank you|appreciate/i);
      // every variant is a full opening: time-of-day, business, self
      expect(variant).toContain("{timeGreeting}");
      expect(variant).toContain("{businessName}");
      expect(variant).toContain("{presenterName}");
    }
  });

  it("renders rotated greetings with the session's facts filled in", () => {
    const facts = {
      timeGreeting: "Good morning",
      businessName: "Martinez Realty Group",
      presenterName: "Frank",
    };
    const rendered = REALTOR_DISCOVERY_GREETING_VARIANTS.map((_, i) =>
      renderRealtorDiscoveryGreeting(i, facts),
    );
    // rotation actually rotates
    expect(new Set(rendered).size).toBe(rendered.length);
    for (const line of rendered) {
      expect(line).toContain("Good morning");
      expect(line).toContain("Martinez Realty Group");
      expect(line).toContain("Frank");
      expect(line).toMatch(/thank you|appreciate/i);
      expect(line).not.toContain("{");
    }
    // the rotation wraps
    expect(renderRealtorDiscoveryGreeting(rendered.length, facts)).toBe(rendered[0]);
  });

  it("the layer embeds every variant and makes the warm opening replace the plain greeting shape", () => {
    for (const variant of REALTOR_DISCOVERY_GREETING_VARIANTS) {
      expect(layer).toContain(variant);
    }
    expect(layer).toContain("0) THE WARM OPENING");
    expect(layer).toContain("REPLACES the plain in-role greeting shape");
    expect(layer).toContain("rotating them from call to call");
  });
});

describe("realtor discovery — opener, then early capture (steps 1–2)", () => {
  it("pins Ron's opener verbatim: buy or sell, one simple question", () => {
    expect(REALTOR_DISCOVERY_OPENER).toBe(
      "Are you interested in selling, or are you looking to buy a home or a condo?",
    );
    expect(layer).toContain(REALTOR_DISCOVERY_OPENER);
  });

  it("orders the arc: warm opening → opener → capture → discovery → close", () => {
    const warm = layer.indexOf("0) THE WARM OPENING");
    const opener = layer.indexOf("1) THE OPENER");
    const capture = layer.indexOf("2) EARLY CAPTURE");
    const discovery = layer.indexOf("3) DISCOVERY");
    const close = layer.indexOf("5) THE CLOSE");
    for (const at of [warm, opener, capture, discovery, close]) {
      expect(at).toBeGreaterThan(-1);
    }
    expect(warm).toBeLessThan(opener);
    expect(opener).toBeLessThan(capture);
    expect(capture).toBeLessThan(discovery);
    expect(discovery).toBeLessThan(close);
  });

  it("the capture ask carries the list/link reason, matched to the channel given", () => {
    // the reason is attached to the ask: the matched-properties list
    expect(layer).toContain("put together a list of the properties that match");
    expect(layer).toContain("look through it at your leisure");
    // email → the list by email; mobile → the link by text
    expect(layer).toContain("the list sent by email");
    expect(layer).toContain("the link by text message");
  });

  it("capture is asked once, decline is final until the one close re-offer, and never a third ask", () => {
    expect(layer).toContain("Ask ONCE");
    expect(layer).toContain("No problem at all");
    expect(layer).toContain("the only other time you may raise it is once at the close");
    expect(layer).toContain("never a third time in any form");
    expect(layer).toContain("the ONE re-offer from step 2");
  });
});

describe("realtor discovery — branching discovery (step 3)", () => {
  it("branches live-in buyers into primary / second-vacation / retirement", () => {
    expect(layer).toContain("a home to live in, or is this an investment?");
    expect(layer).toContain("a primary home");
    expect(layer).toContain("a second home or vacation home");
    expect(layer).toContain("a retirement move");
  });

  it("branches investors into flip vs long-term hold, in investor language", () => {
    expect(layer).toContain("buy it, fix it up and sell it");
    expect(layer).toContain("hold it long-term, for rent and cash flow");
    expect(layer).toContain("cash flow month to month, or appreciation over time");
    expect(layer).toContain("cosmetic, the systems, or structural");
  });

  it("covers the property questions: type, area, views, condition, must-haves, deal-breaker", () => {
    expect(layer).toContain("a single-family home, a townhouse, a condo");
    expect(layer).toContain("waterfront, an ocean view, a golf view");
    expect(layer).toContain("move-in ready, a light refresh, a fixer-upper");
    expect(layer).toContain("a two-car garage, a home office, a yard, a pool");
    expect(layer).toContain("an automatic no for them");
  });

  it("handles money softly: brackets offered, numbers never pushed", () => {
    expect(layer).toContain("up to about five hundred, or closer to a million?");
    expect(layer).toContain("spoken with a lender or been pre-approved yet");
    expect(layer).toContain("ten percent, twenty, more");
    expect(layer).toContain("the list comes first");
    expect(layer).toContain("never circle back to it");
  });

  it("never re-asks a banked answer, and never concludes before the criteria are complete", () => {
    expect(layer).toContain("never ask about anything you already know");
    expect(layer).toContain("bank it and never ask again");
    expect(layer).toContain("collect first, conclude second");
    // the nomatch coordination line: a searching caller is never
    // asked for an exact address — their criteria are the search
    expect(layer).toContain(
      "never ask a caller who is searching by criteria for an exact address",
    );
    expect(layer).toContain("their criteria ARE the search");
  });

  it("routes sellers to the existing seller flow, unchanged, under the same capture frame", () => {
    expect(layer).toContain("selling goes to the seller path (step 3S)");
    expect(layer).toContain("3S) SELLING");
    expect(layer).toContain("take the seller road your instructions already lay out");
    expect(layer).toContain("out-of-area sellers are leads too");
    expect(layer).toContain("do not run a seller through them");
  });
});

describe("realtor discovery — conversation rules and close (steps 4–5)", () => {
  it("caps questions per turn, reacts before asking, and wraps to the close on signal", () => {
    expect(layer).toContain("never more than one or two questions in a single turn");
    expect(layer).toContain("Always react to their answer first");
    expect(layer).toContain("six to eight exchanges");
    expect(layer).toContain("go straight to the close");
    expect(layer).toContain("zero pressure at every step");
  });

  it("the recap precedes the promise, and the promise keeps the caller's channel", () => {
    const recapAt = layer.indexOf("First, THE RECAP");
    const promiseAt = layer.indexOf("Second, THE PROMISE");
    expect(recapAt).toBeGreaterThan(-1);
    expect(promiseAt).toBeGreaterThan(recapAt);
    expect(layer).toContain("did I get that right?");
    expect(layer).toContain("Use THEIR criteria, never a template");
    expect(layer).toContain("send it to your email");
    expect(layer).toContain("text you the link");
  });

  it("invents no goodbye of its own — the shared close owns the farewell", () => {
    expect(layer).toContain("this layer adds no new goodbye of its own");
  });
});

describe("realtor discovery — hardening: resumable arc + the list is the capture (2026-11-14, session b8e5bc63)", () => {
  it("the list is the capture: contact details exist to send the list, in the caller's channel", () => {
    expect(layer).toContain("THE LIST IS THE CAPTURE");
    expect(layer).toContain("the deliverable of this conversation is THE LIST");
    expect(layer).toContain("collected TO SEND THE LIST");
    // the block sits inside the capture step, before discovery opens
    const captureBlock = layer.indexOf("THE LIST IS THE CAPTURE");
    expect(captureBlock).toBeGreaterThan(layer.indexOf("2) EARLY CAPTURE"));
    expect(captureBlock).toBeLessThan(layer.indexOf("3) DISCOVERY"));
  });

  it("bars the callback as the default close, deflection, or pushback reply", () => {
    expect(layer).toContain("NOT the answer to a search or a no-match");
    expect(layer).toContain("never offer a callback as the default outcome of anything");
    // a callback survives only as the caller's own choice
    expect(layer).toContain(
      "only when the caller asks for a call, or declines the list",
    );
    expect(layer).toContain("never your deflection");
  });

  it("a promised list stays promised — pushback re-affirms it, never swaps in the callback", () => {
    expect(layer).toContain("THE PROMISE DOES NOT CHANGE MID-CALL");
    expect(layer).toContain("I thought you were going to send me something");
    expect(layer).toContain("never answer that moment by repeating a callback line");
    // and the close itself keeps the list promise even on a no-match
    expect(layer).toContain(
      "a no-match never converts the list promise into a callback",
    );
  });

  it("names the precedence over the script's callback capture, while the no-match wording stands", () => {
    expect(layer).toContain("PRECEDENCE, NAMED");
    expect(layer).toContain("IN THIS MODE THAT CAPTURE DOES NOT GOVERN");
    expect(layer).toContain(
      "the no-match wording itself — plain, about the criteria, with the criteria read back to confirm — stands exactly as written",
    );
  });

  it("the resumable arc: bank the search, answer once, then return to discovery", () => {
    expect(layer).toContain("A SEARCH QUESTION NEVER ENDS DISCOVERY");
    expect(layer).toContain("FIRST, BANK THE SEARCH");
    expect(layer).toContain("SECOND, ANSWER ONCE");
    expect(layer).toContain("THIRD, COME BACK — THE RETURN");
    // the arc lives inside discovery, after the matching-listing beat
    const arc = layer.indexOf("A SEARCH QUESTION NEVER ENDS DISCOVERY");
    expect(arc).toBeGreaterThan(layer.indexOf("3) DISCOVERY"));
    expect(arc).toBeLessThan(layer.indexOf("5) THE CLOSE"));
  });

  it("the return names the unanswered questions in order: price, area narrowed, type, must-haves, deal-breaker", () => {
    const arcText = layer.slice(
      layer.indexOf("THIRD, COME BACK — THE RETURN"),
      layer.indexOf("3S) SELLING"),
    );
    const price = arcText.indexOf("the PRICE BRACKET");
    const area = arcText.indexOf("the AREA, NARROWED");
    const type = arcText.indexOf("the PROPERTY TYPE");
    const mustHaves = arcText.indexOf("the MUST-HAVES");
    const dealBreaker = arcText.indexOf("the ONE DEAL-BREAKER question");
    for (const at of [price, area, type, mustHaves, dealBreaker]) {
      expect(at).toBeGreaterThan(-1);
    }
    expect(price).toBeLessThan(area);
    expect(area).toBeLessThan(type);
    expect(type).toBeLessThan(mustHaves);
    expect(mustHaves).toBeLessThan(dealBreaker);
    // area narrowing is specific: a city is not an area; neighborhoods,
    // subdivisions and local landmarks are the grain Ron asked for
    expect(arcText).toContain("a whole city is not an area");
    expect(arcText).toContain("a neighborhood or subdivision they like");
    expect(arcText).toContain("the landmarks locals navigate by");
  });

  it("a no-match is a beat inside discovery — the capture close is barred while questions remain", () => {
    expect(layer).toContain("A no-match is a BEAT inside discovery, never the end of it");
    expect(layer).toContain("it is not the close");
    expect(layer).toContain(
      "The capture close (step 5) is BARRED while discovery questions remain unanswered",
    );
    expect(layer).toContain("unless the caller signals they are done");
  });

  it("the composed presenter layer drops the script's callback-capture recipe; the standard layer keeps it", () => {
    const pack = examplePackBySlug("michael-martinez")!;
    const presenterLayer = buildExampleListingsLayer(pack, { presenter: true });
    // the deflection recipe never reaches a presenter prompt…
    expect(presenterLayer).not.toContain(
      "take their name and best callback number so the callback can actually happen",
    );
    // …it is replaced by the fold-back into discovery…
    expect(presenterLayer).toContain(
      "fold the search back into the discovery conversation",
    );
    expect(presenterLayer).toContain("never a callback capture");
    // …while the no-match wording itself and the read-back stand
    expect(presenterLayer).toContain("NO MATCH FOR THEIR CRITERIA");
    expect(presenterLayer).toContain(
      "don't have a match for that among Michael Martinez's current listings",
    );
    expect(presenterLayer).toContain(
      "Read their criteria back to confirm them (the area, the beds and baths, the budget)",
    );
    // the standard layer keeps the approved callback capture untouched
    const standardLayer = buildExampleListingsLayer(pack);
    expect(standardLayer).toContain(
      "Michael Martinez will search for them and call them back",
    );
    expect(standardLayer).toContain(
      "take their name and best callback number so the callback can actually happen",
    );
    expect(standardLayer).not.toContain(
      "fold the search back into the discovery conversation",
    );
  });
});

describe("realtor discovery — wiring into the presenter listings layer", () => {
  it("every pack's discovery layer names that pack's agent, with no placeholder left", () => {
    for (const pack of REALTOR_EXAMPLE_PACKS) {
      const own = buildRealtorDiscoveryLayer(pack);
      expect(own).toContain("REALTOR DISCOVERY LAYER");
      expect(own).toContain(`${pack.agentName}'s follow-up`);
      expect(own).not.toContain("{agentName}");
    }
  });

  it("the presenter layer carries the discovery layer exactly once; the standard layer never does", () => {
    const pack = examplePackBySlug("michael-martinez")!;
    const presenterLayer = buildExampleListingsLayer(pack, { presenter: true });
    expect(occurrences(presenterLayer, "REALTOR DISCOVERY LAYER")).toBe(1);
    // no Aspen-handoff wording is introduced by the discovery text
    expect(presenterLayer).not.toContain("bring Aspen back");
    expect(presenterLayer).not.toContain("bring-Aspen-back");
    expect(presenterLayer).not.toContain("{agentName}");

    const standardLayer = buildExampleListingsLayer(pack);
    expect(standardLayer).not.toContain("REALTOR DISCOVERY LAYER");
    // no-opts and explicit-false builds stay byte-identical
    expect(buildExampleListingsLayer(pack, { presenter: false })).toBe(standardLayer);
    expect(buildExampleListingsLayer(pack, {})).toBe(standardLayer);
  });

  it("every presenter-fronted example inherits the discovery layer", () => {
    const slugs = Object.keys(REALTOR_EXAMPLE_PRESENTERS);
    // Frank ×3, Monica ×2, Black Professional Lady ×2
    expect(slugs.length).toBe(7);
    for (const slug of slugs) {
      const pack = examplePackBySlug(slug)!;
      const presenterLayer = buildExampleListingsLayer(pack, { presenter: true });
      expect(presenterLayer).toContain("REALTOR DISCOVERY LAYER");
      expect(presenterLayer).toContain(REALTOR_DISCOVERY_OPENER);
    }
  });
});
