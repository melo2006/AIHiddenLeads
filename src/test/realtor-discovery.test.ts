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
