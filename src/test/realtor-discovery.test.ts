import { describe, expect, it } from "vitest";
import {
  REALTOR_DISCOVERY_GREETING_VARIANTS,
  REALTOR_DISCOVERY_OPENER,
  buildRealtorDiscoveryLayer,
  buildVerbalCaptureConfirmation,
  renderRealtorDiscoveryGreeting,
} from "../../supabase/functions/_shared/realtor-discovery";
import {
  REALTOR_EXAMPLE_PACKS,
  buildExampleListingsLayer,
  examplePackBySlug,
  stampExampleListings,
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
    // Amendment pin note (2026-11-15, the owner's review of
    // Publish #72): as first built, Publish #72 deferred the
    // step-2 ask to the close and this test was rewritten to
    // match ("made once — at the close, after the gate"). The
    // owner's review reversed the deferral: the #69 verification
    // defect was the un-gated PROMISE, never the early ask —
    // Ron's approved design (2026-11-14) captures email/phone
    // early, with the list/link as the reason, because visitors
    // drop off and the contact is the point of the demo. The
    // two-ask accounting is therefore restored — the early ask at
    // step 2, the one re-offer at the close, never a third ask —
    // and what Publish #72 added stands alongside it: the gate
    // in front of the PROMISE (see the Publish #72 block below).
    expect(layer).toContain("Ask ONCE");
    expect(layer).toContain("No problem at all");
    expect(layer).toContain("make the one early ask");
    expect(layer).toContain("the only other time you may raise it is once at the close");
    expect(layer).toContain("never a third time in any form");
    expect(layer).toContain("the ONE re-offer from step 2");
    // the deferral's own markers are gone
    expect(layer).not.toContain("THE ASK ITSELF WAITS FOR THE GATE");
    expect(layer).not.toContain("THE ASK, WHEN IT COMES, IS MADE ONCE");
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
    // Publish #69 pin change (justified): the recap's closing
    // question was "did I get that right?" — it is now the
    // confirm-gate question, asked about ALL banked criteria, and
    // the promise waits for the caller's yes (see the Publish #69
    // describe block below). The pin's intent — the recap asks the
    // caller to confirm before the promise — is preserved and
    // strengthened; the old wording survives only as the verbal
    // capture beat's per-detail "Did I get that right?".
    expect(layer).toContain("Did I capture that all correctly?");
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
    // Frank ×3, Monica ×2, Denise ×2, Diego ×3, James ×3 (2026-11-16)
    expect(slugs.length).toBe(13);
    for (const slug of slugs) {
      const pack = examplePackBySlug(slug)!;
      const presenterLayer = buildExampleListingsLayer(pack, { presenter: true });
      expect(presenterLayer).toContain("REALTOR DISCOVERY LAYER");
      expect(presenterLayer).toContain(REALTOR_DISCOVERY_OPENER);
    }
  });
});

describe("realtor discovery — verbal capture confirmation (2026-11-14, Ron: a phone caller gets the card's job done out loud)", () => {
  const beat = buildVerbalCaptureConfirmation("Michael Martinez");
  const BEAT_MARKER = "DETAILS DICTATED BY VOICE ARE CONFIRMED OUT LOUD";

  it("step 2 runs the beat explicitly — the old deferral to unnamed instructions is gone", () => {
    expect(layer).toContain("run the VERBAL CAPTURE CONFIRMATION below on it");
    expect(layer).toContain(
      "bank it as captured only once they have confirmed it",
    );
    expect(layer).not.toContain(
      "read it back the way your instructions direct",
    );
    // the beat itself sits inside the capture step: after the
    // list-is-the-capture rule, before discovery opens
    const beatAt = layer.indexOf(BEAT_MARKER);
    expect(beatAt).toBeGreaterThan(layer.indexOf("THE LIST IS THE CAPTURE"));
    expect(beatAt).toBeLessThan(layer.indexOf("3) DISCOVERY"));
  });

  it("the beat is ordered: spell-back → what-happens-next + spoken yes → graceful narrowing", () => {
    const b1 = beat.indexOf("BEAT 1 — SPELL IT BACK");
    const b2 = beat.indexOf("BEAT 2 — SAY WHAT HAPPENS NEXT");
    const b3 = beat.indexOf("BEAT 3 — A NO OR A HESITATION");
    for (const at of [b1, b2, b3]) {
      expect(at).toBeGreaterThan(-1);
    }
    expect(b1).toBeLessThan(b2);
    expect(b2).toBeLessThan(b3);
  });

  it("beat 1 — email spell-back mirrors the on-screen card: local part letter by letter, domain plainly", () => {
    expect(beat).toContain('spell the part before the "at" letter by letter');
    expect(beat).toContain("every digit named");
    expect(beat).toContain("then say the domain plainly");
    // the card's own shape, from Ron's screenshot: "…at gmail dot com"
    expect(beat).toContain("…at gmail dot com");
    expect(beat).toContain("Did I get that right?");
    // a correction re-reads the corrected version and re-confirms;
    // only the confirmed version is kept
    expect(beat).toContain("say the WHOLE corrected address back");
    expect(beat).toContain(
      "a correction restarts the read-back of that address, never the whole conversation",
    );
    expect(beat).toContain("only the version they confirm is the one you keep");
  });

  it("beat 1 — a phone number is read back in digit groups under the same confirm/correct rule", () => {
    expect(beat).toContain("read it back in digit groups");
    expect(beat).toContain(
      "the area code, then the next three digits, then the last four",
    );
    expect(beat).toContain("under the same correction rule");
  });

  it("beat 2 — what happens next is stated per channel, and only a spoken yes confirms", () => {
    expect(beat).toContain("the matched-properties list to that email address");
    expect(beat).toContain(
      "the link to the list by text message to that mobile number",
    );
    // the seller channel: the agent's follow-up about their home
    expect(beat).toContain(
      "Michael Martinez's follow-up about their home, in the channel they gave",
    );
    // never invent a send that was not set up in the conversation
    expect(beat).toContain("never a send that was not offered");
    expect(beat).toContain("Is that okay?");
    expect(beat).toContain("Only a spoken yes confirms the capture");
    // silence is not consent
    expect(beat).toContain(
      "Silence, a vague sound or a change of subject is NOT a yes",
    );
  });

  it("beat 3 — a no or hesitation narrows to email only / text only / neither; nothing unconsented is sent", () => {
    expect(beat).toContain("email only, text only, or neither");
    expect(beat).toContain("What they declined is never sent");
    expect(beat).toContain(
      "nothing is treated as consented that they did not say yes to",
    );
    // and the declined send is not raised again later in the call
    expect(beat).toContain("that no is final for this call");
    expect(beat).toContain("do not raise the send again later in the conversation");
  });

  it("no double confirmation: details the on-screen card already confirmed skip the verbal beats", () => {
    expect(beat).toContain("NO DOUBLE CONFIRMATION");
    expect(beat).toContain(
      "already confirmed these same details on the on-screen confirmation card",
    );
    expect(beat).toContain("never make anyone confirm the same details twice");
    expect(beat).toContain(
      "run only for details that arrived by voice and were never confirmed on the card",
    );
  });

  it("the close promise names only consented channels, and a declined send is never re-offered", () => {
    expect(layer).toContain(
      "The promise names only the channels they actually said yes to",
    );
    expect(layer).toContain(
      "a channel they declined is never promised as if it were happening",
    );
    // Amendment pin note (2026-11-15): Publish #72 as first
    // built renamed this close beat "THE CAPTURE ASK" (the one
    // ask, deferred from step 2); the owner's amendment restored
    // the step-2 early ask, so the close beat is once more the
    // ONE re-offer of that ask, in the parent design's words: a
    // declined send is NOT re-offered, and details dictated at
    // this re-offer go through the same verbal capture
    // confirmation.
    expect(layer).toContain(
      "a caller who gave details but declined the send itself is NOT re-offered it",
    );
    expect(layer).toContain(
      "details dictated at this re-offer go through the same verbal capture confirmation",
    );
  });

  it("the composed presenter layer carries the beat exactly once", () => {
    const pack = examplePackBySlug("michael-martinez")!;
    const presenterLayer = buildExampleListingsLayer(pack, { presenter: true });
    expect(occurrences(presenterLayer, BEAT_MARKER)).toBe(1);
    // …and the production stamp path (presenter) also lands it once
    const config: Record<string, unknown> = { systemPrompt: "BASE" };
    stampExampleListings(config, pack, { presenter: true });
    expect(occurrences(String(config.systemPrompt), BEAT_MARKER)).toBe(1);
    expect(String(config.systemPrompt)).toContain("REALTOR DISCOVERY LAYER");
  });

  it("Aspen-fronted simulations get the beat through the stamp — without the discovery layer, and otherwise unchanged", () => {
    const pack = examplePackBySlug("michael-martinez")!;
    const config: Record<string, unknown> = { systemPrompt: "BASE" };
    stampExampleListings(config, pack);
    const stamped = String(config.systemPrompt);
    expect(occurrences(stamped, BEAT_MARKER)).toBe(1);
    expect(stamped).toContain("Is that okay?");
    // the Aspen-fronted flow does NOT grow the presenter discovery layer
    expect(stamped).not.toContain("REALTOR DISCOVERY LAYER");
    // …and its approved standard capture shape stands untouched
    expect(stamped).toContain(
      "Michael Martinez will search for them and call them back",
    );
    expect(stamped).toContain(
      "take their name and best callback number so the callback can actually happen",
    );
    // the stamp stays idempotent with the beat attached
    stampExampleListings(config, pack);
    expect(occurrences(String(config.systemPrompt), BEAT_MARKER)).toBe(1);
  });

  it("the Sara segment rebuild path stays byte-identical: no opt, no beat", () => {
    const pack = examplePackBySlug("michael-martinez")!;
    const plain = buildExampleListingsLayer(pack);
    expect(plain).not.toContain(BEAT_MARKER);
    expect(buildExampleListingsLayer(pack, { verbalCapture: false })).toBe(plain);
    expect(buildExampleListingsLayer(pack, { presenter: false })).toBe(plain);
    // the opt alone (the stamp's route, minus the stamp) appends it once
    const opted = buildExampleListingsLayer(pack, { verbalCapture: true });
    expect(occurrences(opted, BEAT_MARKER)).toBe(1);
    expect(opted.startsWith(plain)).toBe(true);
  });

  it("every pack's beat names that pack's agent in the seller channel, with no placeholder left", () => {
    for (const pack of REALTOR_EXAMPLE_PACKS) {
      const own = buildVerbalCaptureConfirmation(pack.agentName);
      expect(own).toContain(`${pack.agentName}'s follow-up about their home`);
      expect(own).not.toContain("{agentName}");
      const config: Record<string, unknown> = { systemPrompt: "BASE" };
      stampExampleListings(config, pack);
      expect(String(config.systemPrompt)).toContain(BEAT_MARKER);
      expect(String(config.systemPrompt)).not.toContain("{agentName}");
    }
  });
});

describe("realtor discovery — round 2: arc discipline (2026-11-14, session 4f161ea7)", () => {
  const closeSlice = layer.slice(layer.indexOf("5) THE CLOSE"));
  const captureSlice = layer.slice(
    layer.indexOf("2) EARLY CAPTURE"),
    layer.indexOf("3) DISCOVERY"),
  );
  const arcSlice = layer.slice(
    layer.indexOf("THIRD, COME BACK — THE RETURN"),
    layer.indexOf("3S) SELLING"),
  );

  it("purpose is one of the core four — asked or confirmed before any search firms up", () => {
    // the core four are named as a set, purpose first among equals
    expect(layer).toContain(
      "the PURPOSE (live in it, rent it out, flip and resell it, a second home), the PRICE BRACKET, the AREA, narrowed, and the PROPERTY TYPE",
    );
    expect(layer).toContain(
      "Purpose is one of THE CORE FOUR (the gate below), first among equals",
    );
    expect(layer).toContain(
      "it must be asked or confirmed before any search firms up",
    );
    // banked from what they volunteer, never assumed from the ask
    expect(layer).toContain(
      "never assumed from the property they happen to ask about",
    );
    expect(layer).toContain("a search that firms up before its purpose is known");
  });

  it("purpose heads the resumable arc's return order, ahead of price", () => {
    const purpose = arcSlice.indexOf("the PURPOSE");
    const price = arcSlice.indexOf("the PRICE BRACKET");
    expect(purpose).toBeGreaterThan(-1);
    expect(price).toBeGreaterThan(-1);
    expect(purpose).toBeLessThan(price);
    expect(arcSlice).toContain(
      "the PURPOSE — what the home is for: live in it, rent it out, flip and resell it, or a second home — if it is still unknown",
    );
  });

  it("no early promise: the close is gated on the core four being banked or waved off", () => {
    expect(layer).toContain("THE CORE FOUR — AND NO EARLY PROMISE (hard rule)");
    expect(layer).toContain(
      "While any one of the four is still unknown — never asked, never volunteered, never confirmed — and the caller has not signalled they are done, the close is barred in every form",
    );
    // the evidence failure is named: the promise sentence itself,
    // said while purpose / area / type were still open
    expect(layer).toContain(
      "\"I'll get that list put together and sent to your email\" said while the purpose, the area or the type is still open is the close arriving early",
    );
    expect(layer).toContain("you didn't ask me what location I want");
    // the gate lives inside discovery, after the resumable arc
    const gate = layer.indexOf("NO EARLY PROMISE");
    expect(gate).toBeGreaterThan(layer.indexOf("A SEARCH QUESTION NEVER ENDS DISCOVERY"));
    expect(gate).toBeLessThan(layer.indexOf("5) THE CLOSE"));
    // and the close step itself opens on the gate
    expect(layer).toContain(
      "when the core four are banked or waved off (the gate in step 3), or the caller is ready to wrap up",
    );
  });

  it("a waved-off dimension counts as banked, and the caller's own wrap-up overrides the gate", () => {
    expect(layer).toContain("counts as BANKED: declined is an answer");
    expect(layer).toContain("never circle back to it");
    expect(layer).toContain("the gate binds YOUR timing, never the caller's");
    expect(layer).toContain("promise at once with what is banked");
    expect(layer).toContain("name each missing piece as refinable later");
    expect(layer).toContain("never as a reason to hold the list hostage");
  });

  it("recap integrity: the recap states only what the caller gave or confirmed", () => {
    expect(closeSlice).toContain("RECAP INTEGRITY (hard rule)");
    expect(closeSlice).toContain(
      "the recap may only state what the caller actually gave you or confirmed",
    );
    // the evidence failure is named verbatim: type recited as
    // settled when it was never discussed
    expect(closeSlice).toContain(
      "reciting \"a two-bed, two-bath condo or house\" as the caller's settled criteria when property type was never discussed is exactly the failure this rule exists to prevent",
    );
    // a still-open dimension is left out or labelled open — never
    // dressed up as the caller's answer
    expect(closeSlice).toContain(
      "an open question labelled open is honest; the same words presented as their answer are not",
    );
    // the same integrity binds the mid-discovery criteria read-back
    expect(closeSlice).toContain(
      "The same integrity binds the criteria read-back after a search answer (step 3)",
    );
  });

  it("a second search gets its own mini-arc: compact, banking volunteers, asking only what's missing", () => {
    expect(layer).toContain("A SECOND SEARCH IS A NEW SEARCH — THE MINI-ARC (hard rule)");
    expect(layer).toContain(
      "confirm its PURPOSE, its AREA, its TYPE and its BUDGET, and ask its one MUST-HAVE or deal-breaker question",
    );
    expect(layer).toContain("two or three conversational questions at most");
    expect(layer).toContain("ask ONLY what is missing");
    expect(layer).toContain(
      "never re-ask what the new search already told you",
    );
    // the evidence shape is named: everything volunteered in one
    // breath is confirmed crisply, not re-interrogated
    expect(layer).toContain(
      "a one-bed fixer-upper in Pompano and Deerfield, up to a hundred and fifty, to buy and flip",
    );
  });

  it("the two searches never leak into each other and stay distinct through the close", () => {
    expect(layer).toContain(
      "its budget is not the second's budget, its area is not the second's area, its purpose is not the second's purpose",
    );
    expect(layer).toContain("The core-four gate above applies to the new search too");
    expect(layer).toContain("recap each on its own terms");
    expect(layer).toContain("\"we'll put both lists together\"");
    expect(layer).toContain("never one blended list");
  });

  it("role containment: inside the simulation the presenter is the business, full stop", () => {
    expect(layer).toContain(
      "ROLE CONTAINMENT — INSIDE THE SIMULATION, YOU ARE THE BUSINESS (hard rule)",
    );
    // the rule frames the whole arc: it lands before the warm opening
    const containment = layer.indexOf("ROLE CONTAINMENT");
    expect(containment).toBeGreaterThan(-1);
    expect(containment).toBeLessThan(layer.indexOf("0) THE WARM OPENING"));
    // the banned shapes are named — the platform menu, the
    // how-it-works talk, the cannot-complete transfer narration
    expect(layer).toContain(
      "no menu of what the visitor might do next (keep trying the simulation, discuss implementation questions, book a quick call)",
    );
    expect(layer).toContain("no explaining how the demo or the service works");
    expect(layer).toContain(
      "no transfer explanations — narrating a transfer you cannot complete, or apologising for one, is platform talk too",
    );
    expect(layer).toContain("Never volunteer platform talk mid-inquiry");
  });

  it("the only doors out of the role are the visitor's — and the platform talk waits for the real end", () => {
    expect(layer).toContain(
      "The doors out of the role are the visitor's, never yours: they ask for a person, or they step out of the simulation themselves",
    );
    expect(layer).toContain(
      "The platform conversation and the demo close belong to the simulation's real end — after the step 5 close — never mid-inquiry",
    );
    expect(layer).toContain(
      "never attached to the recap, the promise or the capture: those beats end in role, full stop",
    );
    // in-role person asks still route through the script, untouched
    expect(layer).toContain(
      "the visitor asks for Michael Martinez or another person at this business (in role, the way the script directs)",
    );
  });

  it("channel completeness: an email-only capture leaves the offered text link open for one close ask", () => {
    expect(closeSlice).toContain("CHANNEL COMPLETENESS — THE ONE TEXT ASK (hard rule)");
    expect(closeSlice).toContain(
      "If the caller gave an email and no mobile number, the text half of that offer is still open",
    );
    // the ask itself, one easy line
    expect(closeSlice).toContain(
      "\"And if you'd like the link by text as well, what's the best mobile number for it?\"",
    );
    // the evidence moment is named: "both or just one?" never gets a
    // flat email-only answer that lets the text die in silence
    expect(closeSlice).toContain(
      "Never answer a \"both or just one?\" question with a flat \"email only, since that's what you gave me\" and let the text die in silence",
    );
    expect(closeSlice).toContain("answer honestly with the channel you have, then make the one ask");
  });

  it("the text ask is coordinated: verbal confirmation first, a decline final, never stacked on the re-offer", () => {
    expect(closeSlice).toContain(
      "goes through the verbal capture confirmation above — the digit-group read-back, what happens next, the spoken yes — before any text is promised on it",
    );
    expect(closeSlice).toContain(
      "the number is never asked again in this call",
    );
    // Amendment pin note (2026-11-15): Publish #72 as first
    // built pointed this coordination at a "step 5 capture ask";
    // with the step-2 early ask restored by the owner's
    // amendment, the coordination names the step-2 re-offer
    // again, exactly as the parent design had it. The discipline
    // — the two asks never stack — never changed.
    expect(closeSlice).toContain(
      "it is NOT the step 2 re-offer (that one is only for a caller who gave no details at all), the two never stack",
    );
    expect(closeSlice).toContain(
      "it never applies to a caller who declined the send itself",
    );
    // step 2 names the same coordination, so the capture discipline
    // and the channel ask can never be read as a third capture ask
    expect(captureSlice).toContain("step 5's channel completeness");
    expect(captureSlice).toContain(
      "completing a delivery channel for a send they already agreed to",
    );
  });

  it("the composed presenter layer carries each round-2 rule exactly once; the standard layer carries none", () => {
    const pack = examplePackBySlug("michael-martinez")!;
    const presenterLayer = buildExampleListingsLayer(pack, { presenter: true });
    for (const marker of [
      "ROLE CONTAINMENT",
      "NO EARLY PROMISE",
      "RECAP INTEGRITY",
      "THE MINI-ARC",
      "CHANNEL COMPLETENESS",
    ]) {
      expect(occurrences(presenterLayer, marker)).toBe(1);
    }
    const standardLayer = buildExampleListingsLayer(pack);
    for (const marker of [
      "ROLE CONTAINMENT",
      "NO EARLY PROMISE",
      "RECAP INTEGRITY",
      "MINI-ARC",
      "CHANNEL COMPLETENESS",
      "CORE FOUR",
    ]) {
      expect(standardLayer).not.toContain(marker);
    }
    // the round-2 rules ride in through the discovery layer only —
    // the verbal beat is still exactly once alongside them
    expect(occurrences(presenterLayer, "DETAILS DICTATED BY VOICE ARE CONFIRMED OUT LOUD")).toBe(1);
  });
});

describe("realtor discovery — the no-match move (Publish #62, 2026-11-15)", () => {
  it("a no-match is answered with the proactive yes, never a defense or a passive watch", () => {
    expect(layer).toContain("THE NO-MATCH MOVE");
    // Publish #72 pin change (justified): the yes used to carry
    // the list promise itself ("…and put the list together for
    // you") — the #69 live verification caught that phrasing
    // surfacing mid-pass, before the confirm gate. The yes is now
    // a search commitment only; the promise's words are reserved
    // for after the gate (see the Publish #72 block below).
    expect(layer).toContain("I'll search the broader market for exactly that.");
    expect(layer).not.toContain(
      "I'll search the broader market for exactly that and put the list together for you",
    );
    expect(layer).toContain("never offer to \"keep an eye out\"");
    expect(layer).toContain("do not defend the no: repeat the yes");
  });

  it("the no-match turn itself carries no capture ask", () => {
    expect(layer).toContain("The no-match turn itself carries NO capture ask");
  });
});

describe("realtor discovery — Publish #69: the Alex-pattern upgrade (2026-11-15, Ron's Frank test)", () => {
  const seqAt = layer.indexOf("THE DISCOVERY SEQUENCE");
  const seqSlice = layer.slice(seqAt, layer.indexOf("BUYING — FIRST, THE PURPOSE"));
  const guessSlice = layer.slice(
    layer.indexOf("NEVER BANK A GUESS"),
    seqAt,
  );
  const budgetSlice = layer.slice(
    layer.indexOf("A STATED BUDGET IS NEVER RE-ASKED (hard rule"),
    layer.indexOf("THE MONEY — SOFTLY, LAST"),
  );
  const noMatchSlice = layer.slice(
    layer.indexOf("THE NO-MATCH MOVE"),
    layer.indexOf("TRANSFER BEATS THE CLOSE"),
  );
  const closeSlice = layer.slice(layer.indexOf("5) THE CLOSE"));

  it("the sequence sits inside discovery: after the banking rules, before the purpose prose", () => {
    expect(seqAt).toBeGreaterThan(layer.indexOf("CRITERIA ACCUMULATE"));
    expect(seqAt).toBeGreaterThan(layer.indexOf("3) DISCOVERY"));
    expect(seqAt).toBeLessThan(layer.indexOf("3S) SELLING"));
    // the pass is a structure, not a form: step 4's manner still governs
    expect(seqSlice).toContain("never a form read aloud");
    expect(seqSlice).toContain("react first, one or two questions at a time");
  });

  it("the eight questions run in the task's order: purpose → areas → type → views → condition → garage/transport → price → down payment", () => {
    const marks = [
      "Q1 PURPOSE",
      "Q2 AREAS",
      "Q3 PROPERTY TYPE",
      "Q4 VIEWS AND SETTING",
      "Q5 CONDITION",
      "Q6 GARAGE AND TRANSPORT",
      "Q7 PRICE BALLPARK",
      "Q8 DOWN PAYMENT",
    ];
    const ats = marks.map((m) => seqSlice.indexOf(m));
    for (const at of ats) expect(at).toBeGreaterThan(-1);
    for (let i = 1; i < ats.length; i++) expect(ats[i]).toBeGreaterThan(ats[i - 1]);
    // purpose is the FIRST discovery question — before any area, before any number
    expect(seqSlice).toContain(
      "the first discovery question of the pass, before any area and before any number",
    );
  });

  it("purpose is asked as the Alex choice: live in it / fix up and flip / long-term hold", () => {
    expect(seqSlice).toContain(
      "Is this a home to live in, one to fix up and flip, or a long-term hold to rent out?",
    );
  });

  it("every question is a choice and carries exactly one why-line", () => {
    expect(occurrences(seqSlice, "Why-line:")).toBe(8);
    // the choices are named options a caller can simply pick from
    expect(seqSlice).toContain("A single-family home, a townhouse, or a condo?");
    expect(seqSlice).toContain("Waterfront, an ocean view, a golf view");
    expect(seqSlice).toContain(
      "Move-in ready, a light refresh, a fixer-upper you'd enjoy, or a full remodel?",
    );
    expect(seqSlice).toContain("one car, two cars, or is it a nice-to-have?");
    expect(seqSlice).toContain("ten percent, twenty, more?");
    // and the why-lines are practitioner reasoning, not filler
    expect(seqSlice).toContain(
      "Three-plus bedrooms gives you the strongest pool",
    );
    expect(seqSlice).toContain(
      "A must-have garage rules out whole streets of otherwise-perfect homes",
    );
  });

  it("condition is the presenter's question to ask — never left for the caller to volunteer", () => {
    expect(seqSlice).toContain(
      "Never wait for the caller to volunteer their condition criteria",
    );
    expect(seqSlice).toContain("this question is yours to ask, every pass");
  });

  it("a stall earns a labelled default — banked only on acceptance, never dressed as their answer", () => {
    expect(seqSlice).toContain("WHEN THEY STALL, OFFER A DEFAULT");
    expect(seqSlice).toContain("Most buyers start with three beds and two baths");
    expect(seqSlice).toContain("banked only when they accept it");
    expect(seqSlice).toContain(
      "never dressed up as an answer they gave",
    );
  });

  it("never bank a guess: an unclear answer is clarified before it can enter the list, a search or a recap", () => {
    // the discipline sits with the banking rules, ahead of the sequence
    expect(layer.indexOf("NEVER BANK A GUESS")).toBeGreaterThan(
      layer.indexOf("CRITERIA ACCUMULATE"),
    );
    expect(layer.indexOf("NEVER BANK A GUESS")).toBeLessThan(seqAt);
    expect(guessSlice).toContain(
      "it never enters the running list, it never drives a search, and it never appears in a recap",
    );
    // the clarification shape: best understanding named as a question
    expect(guessSlice).toContain(
      "I want to make sure I heard that right — did you say Pompano Beach?",
    );
    // places and numbers get the strictest reading — no rounding a
    // half-heard figure into a bracket, no sound-alike substitutions
    expect(guessSlice).toContain("PLACES AND NUMBERS GET THE STRICTEST READING");
    expect(guessSlice).toContain(
      "never round a half-heard figure up into a bracket",
    );
    expect(guessSlice).toContain(
      "never let a similar-sounding place stand in for the one they said",
    );
  });

  it("the Fort Lauderdale evidence is named: a city banked from a fragment the caller never said", () => {
    expect(guessSlice).toContain(
      'banked "Fort Lauderdale" as a search area from a fragment the caller never said',
    );
    expect(guessSlice).toContain(
      "a guessed fact in the list is worse than a missing one",
    );
    // a correction of the clarification is the confirmed item, banked warmly
    expect(guessSlice).toContain("no, Lauderhill, not Lauderdale");
    expect(guessSlice).toContain("bank the correction warmly and move on");
  });

  it("a stated budget is never re-asked: the $400k → 'closer to a million?' regression is banned by name", () => {
    expect(budgetSlice).toContain(
      "the moment a caller names a figure or picks a bracket",
    );
    expect(budgetSlice).toContain("that number is BANKED, and the money question is closed");
    // the failure shape itself, quoted so the model recognises it
    expect(budgetSlice).toContain(
      'asking a caller who just told you four hundred thousand whether he means "four hundred thousand, or closer to a million?"',
    );
    expect(budgetSlice).toContain("tells him you were not listening");
    // the bracket offer survives ONLY for a caller who named nothing
    expect(budgetSlice).toContain(
      "exists ONLY for a caller who has named no number at all",
    );
    // …and the approved bracket line itself still stands for that caller
    expect(layer).toContain("up to about five hundred, or closer to a million?");
    // the rule lands before the money paragraph it constrains
    expect(layer.indexOf("A STATED BUDGET IS NEVER RE-ASKED")).toBeLessThan(
      layer.indexOf("THE MONEY — SOFTLY, LAST"),
    );
  });

  it("the confirm gate: the recap ends with the gate question and the promise waits for a yes", () => {
    expect(closeSlice).toContain("THE CONFIRM GATE (hard rule");
    // the example recap itself now ends on the gate question
    expect(closeSlice).toContain(
      "up to about 400. Did I capture that all correctly?",
    );
    expect(closeSlice).toContain("THE RECAP IS A GATE, NOT A RITUAL");
    expect(closeSlice).toContain("and WAIT for the answer");
    expect(closeSlice).toContain(
      "The promise (the second beat below) is barred until they say yes",
    );
    // a correction is the gate working: it updates the running list,
    // is read back once, and the gate question is asked once more
    expect(closeSlice).toContain("a corrected item swaps, a new one adds");
    expect(closeSlice).toContain(
      "read the corrected items back once, and ask the gate question once more",
    );
    expect(closeSlice).toContain("only their yes releases the promise");
  });

  it("the gate covers everything banked — a quietly dropped garage or backyard is a failed recap", () => {
    expect(closeSlice).toContain("THE GATE COVERS EVERYTHING BANKED");
    expect(closeSlice).toContain(
      "a recap that quietly drops something they asked for, the two-car garage or the backyard, is a failed recap",
    );
    // two searches are each gated on their own terms
    expect(closeSlice).toContain("each is recapped on its own terms");
  });

  it("the gate confirms criteria, not contact details — the two confirmations never substitute", () => {
    expect(closeSlice).toContain("THE GATE CONFIRMS CRITERIA, NOT CONTACT DETAILS");
    expect(closeSlice).toContain(
      "criteria confirmed is not consent to send, and details confirmed is not criteria confirmed",
    );
  });

  it("the no-match path rests on confirmed criteria too: the gate runs before the promise there as well", () => {
    expect(noMatchSlice).toContain(
      "the capture that eventually follows a no-match rests on confirmed criteria only",
    );
    expect(noMatchSlice).toContain("Did I capture that all correctly?");
    expect(noMatchSlice).toContain(
      "still runs before the promise, exactly as it does on a matched search",
    );
    // and the no-match turn itself still carries no capture ask
    expect(noMatchSlice).toContain("The no-match turn itself carries NO capture ask");
  });

  it("the composed presenter layer carries each Publish #69 rule exactly once; the standard layer carries none", () => {
    const pack = examplePackBySlug("michael-martinez")!;
    const presenterLayer = buildExampleListingsLayer(pack, { presenter: true });
    // each rule's heading lands exactly once (Q2 and Q7 cross-refer
    // to two of the rules by name inside the sequence — those are
    // references, not second copies of the rules)
    for (const marker of [
      "THE DISCOVERY SEQUENCE — CHOICE QUESTIONS",
      "NEVER BANK A GUESS — AN UNCLEAR ANSWER IS CLARIFIED",
      "A STATED BUDGET IS NEVER RE-ASKED (hard rule",
      "THE CONFIRM GATE (hard rule",
    ]) {
      expect(occurrences(presenterLayer, marker)).toBe(1);
    }
    expect(presenterLayer).toContain(
      "a vague or half-heard one is clarified under NEVER BANK A GUESS",
    );
    expect(presenterLayer).toContain(
      "ONLY when the caller has named no figure yet (A STATED BUDGET IS NEVER RE-ASKED, below)",
    );
    const standardLayer = buildExampleListingsLayer(pack);
    for (const marker of [
      "THE DISCOVERY SEQUENCE",
      "NEVER BANK A GUESS",
      "A STATED BUDGET IS NEVER RE-ASKED",
      "CONFIRM GATE",
      "Did I capture that all correctly?",
    ]) {
      expect(standardLayer).not.toContain(marker);
    }
  });

  it("every presenter-fronted example inherits the Publish #69 rules", () => {
    for (const slug of Object.keys(REALTOR_EXAMPLE_PRESENTERS)) {
      const pack = examplePackBySlug(slug)!;
      const presenterLayer = buildExampleListingsLayer(pack, { presenter: true });
      expect(presenterLayer).toContain("THE DISCOVERY SEQUENCE");
      expect(presenterLayer).toContain("Did I capture that all correctly?");
    }
  });
});

describe("realtor discovery — criteria accumulate + transfer beats the close (Publish #63, 2026-11-15)", () => {
  it("criteria accumulate: a new area ADDS, a correction swaps only the corrected item", () => {
    expect(layer).toContain("CRITERIA ACCUMULATE — THE RUNNING LIST ONLY GROWS");
    expect(layer).toContain("ADDS to the list — it never replaces");
    expect(layer).toContain("swap ONLY that item");
    expect(layer).toContain("read the FULL accumulated list");
    // The evidence case: Deerfield + Pompano must survive Lauderhill arriving.
    expect(layer).toContain("Deerfield Beach and Pompano Beach and then adds Lauderhill is looking in THREE areas");
  });

  it("an explicit transfer request outranks the close and is never answered with a goodbye", () => {
    expect(layer).toContain("TRANSFER BEATS THE CLOSE");
    expect(layer).toContain("outranks every other beat");
    expect(layer).toContain("never answer a transfer request with a recap, a promise or a goodbye");
    expect(layer).toContain("is the request still standing, not a wrap-up signal");
  });
});

describe("realtor discovery — Publish #72: the discovery entry (2026-11-15, the #69 live verification)", () => {
  const step0At = layer.indexOf("0) THE WARM OPENING");
  const step1Slice = layer.slice(
    layer.indexOf("1) THE OPENER"),
    layer.indexOf("2) EARLY CAPTURE"),
  );
  const step2Slice = layer.slice(
    layer.indexOf("2) EARLY CAPTURE"),
    layer.indexOf("3) DISCOVERY"),
  );
  const seqSlice = layer.slice(
    layer.indexOf("THE DISCOVERY SEQUENCE"),
    layer.indexOf("BUYING — FIRST, THE PURPOSE"),
  );
  const closeSlice = layer.slice(layer.indexOf("5) THE CLOSE"));
  const noMatchSlice = layer.slice(
    layer.indexOf("THE NO-MATCH MOVE"),
    layer.indexOf("TRANSFER BEATS THE CLOSE"),
  );

  it("the greeting happens once: an inquiry already on the table is answered, not re-greeted", () => {
    expect(layer).toContain("THE GREETING HAPPENS ONCE");
    expect(layer).toContain(
      "Never greet the caller a second time inside this conversation",
    );
    expect(layer).toContain(
      "a caller who has already said what they are calling about is never left standing behind a bare greeting",
    );
    // the rule sits inside step 0, ahead of the opener it protects
    const at = layer.indexOf("THE GREETING HAPPENS ONCE");
    expect(at).toBeGreaterThan(step0At);
    expect(at).toBeLessThan(layer.indexOf("1) THE OPENER"));
  });

  it("the first discovery move: purpose unbanked → the purpose choice is the very next question", () => {
    expect(step1Slice).toContain("THE FIRST DISCOVERY MOVE");
    expect(step1Slice).toContain(
      "IF PURPOSE IS NOT YET BANKED, your very next question is the PURPOSE CHOICE",
    );
    // nothing takes that turn first — not the frame, not an area
    expect(step1Slice).toContain(
      "before areas, before property type, before any number, before the step-2 frame",
    );
    // a generic opening line sorts the road but banks no purpose
    expect(step1Slice).toContain("A GENERIC OPENING LINE IS NOT A PURPOSE ANSWER");
    expect(step1Slice).toContain(
      "purpose is UNBANKED and the purpose question is owed",
    );
  });

  it("purpose banked — host phase included — opens the pass at the first unbanked step, never re-asked", () => {
    expect(step1Slice).toContain("IF PURPOSE IS ALREADY BANKED");
    expect(step1Slice).toContain(
      "volunteered during the host phase before the segment began",
    );
    expect(step1Slice).toContain(
      "the pass opens at the FIRST UNBANKED STEP of the sequence instead",
    );
    expect(step1Slice).toContain("do NOT ask it again");
  });

  it("step 2 makes the one early ask — frame, reason and ask in one beat; the promise still waits for the gate", () => {
    // Amendment (2026-11-15, the owner's review): as first built,
    // this test pinned the deferral ("sets the frame and the
    // reason — and asks for nothing"). The owner reversed the
    // deferral — the early ask is his approved design — so the
    // pins now describe the restored step 2: the parent's beat,
    // with Publish #72's purpose-question precedence kept (the
    // ask lands after the purpose question when one was owed).
    expect(step2Slice).toContain(
      "EARLY CAPTURE — WITH THE REASON, AND NEVER FORCED",
    );
    expect(step2Slice).toContain("make the one early ask");
    expect(step2Slice).toContain(
      "after the purpose question when purpose had to be asked",
    );
    // the deferral's instructions are gone from the step
    expect(step2Slice).not.toContain("ask for NOTHING yet");
    expect(step2Slice).not.toContain("THE ASK ITSELF WAITS FOR THE GATE");
    // volunteered details remain the caller's move: confirmed,
    // banked, and never a shortcut past the pass or the gate
    expect(step2Slice).toContain(
      "a volunteered detail never shortens the discovery pass and never skips the gate",
    );
    // and the ask itself never unlocks the promise: the gate at
    // the close confirms the criteria exactly as if no details
    // had arrived yet
    expect(step2Slice).toContain(
      "the gate at the close confirms the CRITERIA exactly as if no details had arrived yet",
    );
  });

  it("question and why-line are one scripted unit, delivered together every time", () => {
    expect(seqSlice).toContain("QUESTION AND WHY-LINE ARE ONE SCRIPTED UNIT");
    expect(seqSlice).toContain(
      "the two halves are delivered TOGETHER, in that order, in the same turn, every time the question is asked",
    );
    expect(seqSlice).toContain("a sequence question asked bare");
    expect(seqSlice).toContain("is a half-asked question");
    // the unit rule adds no why-lines of its own: still exactly one
    // pinned why-line per question
    expect(occurrences(seqSlice, "Why-line:")).toBe(8);
  });

  it("no promise before the gate — the bar binds at the entry, mid-pass and every search answer; the capture ask is not the promise", () => {
    // Amendment (2026-11-15): as first built, this rule also
    // barred the capture ask until the gate. The owner's review
    // re-scoped it to the promise alone — the step-2 ask runs on
    // its own discipline and is explicitly carved out — so the
    // pins follow the rule's restored scope.
    expect(layer).toContain("NO PROMISE BEFORE THE GATE (hard rule");
    expect(layer).toContain(
      "the confirm gate (step 5) is the only door to the promise",
    );
    expect(layer).toContain(
      "a purpose volunteered in the first breath releases the PASS, never the promise",
    );
    // the capture ask is carved out by name: it is not a promise,
    // and the bar does not touch it
    expect(layer).toContain("THE CAPTURE ASK IS NOT A PROMISE");
    expect(layer).not.toContain("NO PROMISE, NO CAPTURE");
    // the rule sits inside discovery, after the core-four gate it
    // twins, before the mini-arc it also governs
    const at = layer.indexOf("NO PROMISE BEFORE THE GATE (hard rule");
    expect(at).toBeGreaterThan(layer.indexOf("THE CORE FOUR — AND NO EARLY PROMISE"));
    expect(at).toBeLessThan(layer.indexOf("A SECOND SEARCH IS A NEW SEARCH"));
  });

  it("the short gate: volunteering everything or pushing to skip earns a short gate, never a skipped one", () => {
    expect(layer).toContain("THE SHORT GATE — WHEN THE CALLER SHORT-CIRCUITS THE PASS");
    expect(layer).toContain(
      "they volunteer everything the pass would have asked",
    );
    expect(layer).toContain("or they push to skip ahead");
    expect(layer).toContain(
      "A caller in a hurry is owed a SHORT gate, never a SKIPPED one",
    );
    // step 5 carries the same gate, shortened — never skipped
    expect(closeSlice).toContain("THE SHORT GATE IS THIS SAME GATE, SHORTER");
    expect(closeSlice).toContain("Shortened, never skipped.");
    // and the core-four wrap-up override now routes through it
    expect(layer).toContain("the pass ends, but the gate itself is never skipped");
  });

  it("the no-match yes is a search commitment — the promise's words are reserved for after the gate", () => {
    expect(noMatchSlice).toContain(
      "The broader-market yes is a SEARCH commitment, not the list promise",
    );
    expect(noMatchSlice).toContain(
      "are the close's words, reserved until the confirm gate has run",
    );
    expect(noMatchSlice).not.toContain("put the list together for you");
    // capture after a no-match still rests on confirmed criteria,
    // and the ask itself lives at step 2 and the close — restored
    // by the amendment — never on the no-match turn (the turn
    // itself carries no capture ask; the pin below the Publish
    // #62 block holds that separately)
    expect(noMatchSlice).toContain(
      "capture lives at step 2 and step 5 only",
    );
  });

  it("the listings layer's flow paragraph is rewritten for presenters only; the standard layer keeps it", () => {
    const pack = examplePackBySlug("michael-martinez")!;
    const presenterLayer = buildExampleListingsLayer(pack, { presenter: true });
    expect(presenterLayer).not.toContain(
      "then capture the search: confirm the criteria back, offer that Michael Martinez will search and call them back",
    );
    expect(presenterLayer).toContain(
      "commit to searching the broader market for exactly those criteria",
    );
    expect(presenterLayer).toContain("no capture and no list promise on that turn");
    const standardLayer = buildExampleListingsLayer(pack);
    expect(standardLayer).toContain(
      "then capture the search: confirm the criteria back, offer that Michael Martinez will search and call them back, and take their name and best callback number if you do not already have them.",
    );
    expect(standardLayer).not.toContain("no capture and no list promise on that turn");
  });

  it("the composed presenter layer carries each Publish #72 rule exactly once; the standard layer carries none", () => {
    const pack = examplePackBySlug("michael-martinez")!;
    const presenterLayer = buildExampleListingsLayer(pack, { presenter: true });
    for (const marker of [
      "THE GREETING HAPPENS ONCE — AN INQUIRY ALREADY ON THE TABLE IS ANSWERED, NOT RE-GREETED (hard rule",
      "THE FIRST DISCOVERY MOVE — PURPOSE, ASKED, THE MOMENT THE ROAD IS CHOSEN (hard rule",
      "QUESTION AND WHY-LINE ARE ONE SCRIPTED UNIT",
      // amendment: the gate rule is promise-scoped (see the gate
      // test above); the marker follows the restored name
      "NO PROMISE BEFORE THE GATE (hard rule",
      "THE SHORT GATE — WHEN THE CALLER SHORT-CIRCUITS THE PASS",
    ]) {
      expect(occurrences(presenterLayer, marker)).toBe(1);
    }
    const standardLayer = buildExampleListingsLayer(pack);
    for (const marker of [
      "THE GREETING HAPPENS ONCE",
      "THE FIRST DISCOVERY MOVE",
      "ONE SCRIPTED UNIT",
      "NO PROMISE BEFORE THE GATE",
      "SHORT GATE",
      // the restored early ask is likewise presenter-only
      "make the one early ask",
    ]) {
      expect(standardLayer).not.toContain(marker);
    }
  });

  it("every presenter-fronted example inherits the Publish #72 entry rules", () => {
    for (const slug of Object.keys(REALTOR_EXAMPLE_PRESENTERS)) {
      const pack = examplePackBySlug(slug)!;
      const presenterLayer = buildExampleListingsLayer(pack, { presenter: true });
      expect(presenterLayer).toContain("THE FIRST DISCOVERY MOVE");
      // amendment: promise-scoped gate rule, restored early ask
      expect(presenterLayer).toContain("NO PROMISE BEFORE THE GATE");
      expect(presenterLayer).toContain("make the one early ask");
    }
  });
});
