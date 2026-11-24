// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  RECAP_RECOVERY_MIN_CHARS,
  priorRowLookupKeys,
  recapHasIdentifiableFacts,
  resumeGreetingAllowed,
  shouldRecoverPriorSession,
} from "../../supabase/functions/_shared/memory-bridge";
import {
  conversationalFactsBlock,
  conversationalFactsFromConfig,
  conversationalFactsFromUtterance,
  detectStatedBusiness,
  extractConversationalFactsFromRecap,
  mergeConversationalFacts,
} from "../../supabase/functions/_shared/conversational-facts";
import { capturedContactFromUnknown } from "../../supabase/functions/_shared/captured-contact";
import { resumeInstruction } from "../../supabase/functions/_shared/voice-config";
import { openingText } from "../../supabase/functions/_shared/session-opening";
import { memoryDiagDetail, memoryDiagPayload, memoryDiagSignature } from "@/lib/visitMemory";

// Fix batch 2026-11-24 — Ron's live sessions: Aspen said "Hey,
// you're back!" and then asked his name and business again. The
// recap that arrived was a 264-char tail stub; the old < 200-char
// synthesis gate let it pass, both prior-row lookup keys were tied
// to the rotating visitorKey, conversational name/business were
// never stamped as facts, and the scripted resume greeting fired
// on the stub anyway. Each describe below pins one link of the fix.

const read = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");

// A tail stub in the shape that actually arrived: only the last
// exchange, a couple of hundred chars, no facts anywhere.
const TAIL_STUB = [
  "Assistant: That is the Professional plan — it includes everything in Premium, plus the custom video avatar and priority support for your team.",
  "Visitor: Okay, and how long does setup take?",
  "Assistant: About twenty to thirty minutes, and Alex walks you through every step of it live.",
].join("\n");

// A full recap: long, and the visitor's name/business sit in the
// opening turns where the first-6 window keeps them.
const FULL_RECAP = [
  "Assistant: Good morning! I'm Aspen from AI Hidden Leads.",
  "Visitor: My name is Ron Melo and I run a pool cleaning company in Fort Lauderdale.",
  "Assistant: Great to meet you, Ron. What would you like to know first?",
  ...Array.from({ length: 40 }, (_, i) => `${i % 2 ? "Visitor" : "Assistant"}: Exchange ${i} about the plans, the avatar and setup.`),
].join("\n");

describe("(a) synthesis gate widening — shouldRecoverPriorSession", () => {
  it("the stub that disarmed the old gate now triggers recovery", () => {
    expect(TAIL_STUB.length).toBeGreaterThan(200); // passed the old < 200 gate
    expect(TAIL_STUB.length).toBeLessThan(RECAP_RECOVERY_MIN_CHARS);
    expect(shouldRecoverPriorSession({ resumeContext: TAIL_STUB })).toBe(true);
  });

  it("recovers on an absent or empty recap, and always on a reconnect", () => {
    expect(shouldRecoverPriorSession({})).toBe(true);
    expect(shouldRecoverPriorSession({ resumeContext: undefined })).toBe(true);
    expect(shouldRecoverPriorSession({ resumeContext: "   " })).toBe(true);
    expect(shouldRecoverPriorSession({ reconnect: true, resumeContext: FULL_RECAP })).toBe(true);
  });

  it("a LONG recap with no identifiable facts still recovers", () => {
    const longNoFacts = Array.from({ length: 30 }, (_, i) => `Assistant: Filler line ${i} about the plans and the weather and the setup steps in general terms.`).join("\n");
    expect(longNoFacts.length).toBeGreaterThan(RECAP_RECOVERY_MIN_CHARS);
    expect(recapHasIdentifiableFacts(longNoFacts)).toBe(false);
    expect(shouldRecoverPriorSession({ resumeContext: longNoFacts })).toBe(true);
  });

  it("a full recap — long AND fact-bearing — keeps the pre-fix behaviour: no recovery", () => {
    expect(FULL_RECAP.length).toBeGreaterThan(RECAP_RECOVERY_MIN_CHARS);
    expect(recapHasIdentifiableFacts(FULL_RECAP)).toBe(true);
    expect(shouldRecoverPriorSession({ resumeContext: FULL_RECAP })).toBe(false);
    expect(shouldRecoverPriorSession({ reconnect: false, resumeContext: FULL_RECAP })).toBe(false);
  });

  it("recapHasIdentifiableFacts reads the visitor's own words", () => {
    expect(recapHasIdentifiableFacts("Visitor: My name is Ron Melo.")).toBe(true);
    expect(recapHasIdentifiableFacts("Visitor: I run a pool cleaning company.")).toBe(true);
    expect(recapHasIdentifiableFacts("Visitor: My business is called Melo Pools.")).toBe(true);
    expect(recapHasIdentifiableFacts("Visitor: My website is melopools.com.")).toBe(true);
    expect(recapHasIdentifiableFacts("Visitor: Email me at ron@example.com.")).toBe(true);
    expect(recapHasIdentifiableFacts("Assistant: Let me tell you about our company and website.")).toBe(false);
    expect(recapHasIdentifiableFacts(TAIL_STUB)).toBe(false);
    expect(recapHasIdentifiableFacts("")).toBe(false);
    expect(recapHasIdentifiableFacts(undefined)).toBe(false);
  });
});

describe("(b) visitId prior-row lookup key selection", () => {
  it("adds the campaign visitId key only when the request carries one", () => {
    expect(priorRowLookupKeys({ visitId: "32c12961-71a7-494e-8c32-8b91fd1bd4eb" }))
      .toEqual(["visitorHash", "visitorKeyHash", "campaignVisitId"]);
    expect(priorRowLookupKeys({})).toEqual(["visitorHash", "visitorKeyHash"]);
    expect(priorRowLookupKeys({ visitId: "" })).toEqual(["visitorHash", "visitorKeyHash"]);
    expect(priorRowLookupKeys({ visitId: undefined })).toEqual(["visitorHash", "visitorKeyHash"]);
    expect(priorRowLookupKeys({ visitId: 42 })).toEqual(["visitorHash", "visitorKeyHash"]);
  });

  it("gemini-session consults the key plan and queries the visitId inside the stored campaign", () => {
    const session = read("supabase/functions/gemini-session/index.ts");
    expect(session).toContain("priorRowLookupKeys({ visitId: b.campaign?.visitId })");
    expect(session).toContain("lookupKeys.includes('campaignVisitId')");
    // The visitId lives in the prior row's config.campaign object.
    expect(session).toContain(".eq('config->campaign->>visitId', b.campaign?.visitId)");
    // The existing keys stay, in their original order of use.
    expect(session.indexOf(".eq('visitor_hash', priorVisitorHash)"))
      .toBeLessThan(session.indexOf(".eq('config->>visitorKeyHash', visitorKeyHash)"));
    expect(session.indexOf(".eq('config->>visitorKeyHash', visitorKeyHash)"))
      .toBeLessThan(session.indexOf(".eq('config->campaign->>visitId', b.campaign?.visitId)"));
  });
});

describe("(c) conversational facts — learn, stamp, feed back", () => {
  it("learns the name and business from one ordinary utterance", () => {
    const facts = conversationalFactsFromUtterance("My name is Ron Melo and I run a pool cleaning company in Fort Lauderdale.", null);
    expect(facts?.name).toBe("Ron Melo");
    expect(facts?.business).toBe("pool cleaning company in Fort Lauderdale");
  });

  it("detectStatedBusiness takes only explicit statement shapes", () => {
    expect(detectStatedBusiness("My business is called Melo Pools.")).toBe("Melo Pools");
    expect(detectStatedBusiness("My company is AiHiddenLeads")).toBe("AiHiddenLeads");
    expect(detectStatedBusiness("I own a small roofing company")).toBe("small roofing company");
    expect(detectStatedBusiness("I run into this problem every week")).toBe("");
    expect(detectStatedBusiness("How much does it cost?")).toBe("");
    expect(detectStatedBusiness("I'm looking for a receptionist")).toBe("");
  });

  it("ordinary conversation banks nothing and returns the same stamp", () => {
    const prev = mergeConversationalFacts(null, { name: "Ron Melo" });
    expect(conversationalFactsFromUtterance("Okay, and how long does setup take?", prev)).toBe(prev);
    expect(conversationalFactsFromUtterance("Thanks, that sounds good.", null)).toBeNull();
  });

  it("merges without erasing: an empty field never drops a learned one", () => {
    const first = mergeConversationalFacts(null, { name: "Ron Melo" });
    const second = mergeConversationalFacts(first, { business: "Melo Pools" });
    expect(second).toMatchObject({ name: "Ron Melo", business: "Melo Pools" });
    const third = mergeConversationalFacts(second, { name: "" });
    expect(third?.name).toBe("Ron Melo");
  });

  it("validates the stamp out of a stored config, and rejects empties", () => {
    expect(conversationalFactsFromConfig({ conversationalFacts: { name: "Ron Melo", business: "Melo Pools", updatedAt: "x" } }))
      .toMatchObject({ name: "Ron Melo", business: "Melo Pools" });
    expect(conversationalFactsFromConfig({ conversationalFacts: { name: "", business: "" } })).toBeNull();
    expect(conversationalFactsFromConfig({})).toBeNull();
    expect(conversationalFactsFromConfig(null)).toBeNull();
  });

  it("extracts facts from a recap's visitor lines — the bridge when no stamp landed", () => {
    const facts = extractConversationalFactsFromRecap(FULL_RECAP);
    expect(facts?.name).toBe("Ron Melo");
    expect(facts?.business).toContain("pool cleaning company");
    expect(extractConversationalFactsFromRecap(TAIL_STUB)).toBeNull();
    expect(extractConversationalFactsFromRecap("Assistant: My name is Aspen.")).toBeNull();
  });

  it("the prompt block states the facts as known, never re-asked — and fences them off from contact capture", () => {
    const block = conversationalFactsBlock({ name: "Ron Melo", business: "Melo Pools", updatedAt: "" });
    expect(block).toContain("Name: Ron Melo.");
    expect(block).toContain("Business: Melo Pools.");
    expect(block).toContain("never ask for their name or their business again");
    expect(block).toContain("NOT a captured contact");
    expect(conversationalFactsBlock(null)).toBe("");
  });

  it("a business alone is NOT a captured contact — contact semantics untouched", () => {
    expect(capturedContactFromUnknown({ business: "Melo Pools" })).toBeNull();
    expect(capturedContactFromUnknown({ name: "Ron Melo" })?.name).toBe("Ron Melo");
  });

  it("the proxy learns from utterances on homepage sessions and stamps the facts; gemini-session recovers and re-stamps them", () => {
    const proxy = read("supabase/functions/gemini-live-proxy/index.ts");
    expect(proxy).toContain("conversationalFactsFromUtterance(completedUtterance, conversationalFacts)");
    expect(proxy).toContain("config.homepageSales === true && completedUtterance");
    expect(proxy).toContain("conversationalFacts: snapshot");
    expect(proxy).toContain("conversationalFactsBlock(conversationalFacts)");
    expect(proxy).toContain("knownFacts: conversationalFacts");
    const session = read("supabase/functions/gemini-session/index.ts");
    expect(session).toContain("conversationalFactsFromConfig");
    expect(session).toContain("extractConversationalFactsFromRecap(effectiveResumeContext)");
    expect(session).toContain("if (knownFacts) config.conversationalFacts = knownFacts;");
  });
});

describe("(c) resume greeting gating — no welcome-back on a bare stub", () => {
  it("resumeGreetingAllowed requires a name, a business, facts, or substance", () => {
    expect(resumeGreetingAllowed(TAIL_STUB)).toBe(false);
    expect(resumeGreetingAllowed(TAIL_STUB, null)).toBe(false);
    expect(resumeGreetingAllowed(TAIL_STUB, { name: "Ron Melo" })).toBe(true);
    expect(resumeGreetingAllowed(TAIL_STUB, { business: "Melo Pools" })).toBe(true);
    expect(resumeGreetingAllowed(FULL_RECAP)).toBe(true);
    expect(resumeGreetingAllowed("")).toBe(false);
  });

  it("openingText on a bare stub carries NO scripted welcome-back", () => {
    const text = openingText({ preview: false, resumeContext: TAIL_STUB });
    expect(text).not.toContain("you're back");
    expect(text).toContain("only a fragment of the earlier conversation carried over");
    expect(text).toContain("do NOT open by asking for the visitor's name or business");
  });

  it("openingText on a fact-bearing recap keeps the scripted greeting, naming the facts", () => {
    const text = openingText({ preview: false, resumeContext: FULL_RECAP, knownFacts: { name: "Ron Melo", business: "Melo Pools" } });
    expect(text).toContain("you're back");
    expect(text).toContain("their name is Ron Melo");
    expect(text).toContain("their business is Melo Pools");
    expect(text).toContain("never ask for their name or their business again");
  });

  it("resumeInstruction without facts is byte-identical to the pre-fix shape", () => {
    const text = resumeInstruction("Assistant: Good morning!");
    expect(text).toContain("Hey, you're back!");
    expect(text).not.toContain("You already know this visitor");
  });
});

describe("(d) client memory diagnostic", () => {
  it("formats the turn count and recap char length for the record", () => {
    expect(memoryDiagDetail({ turns: 42, recapChars: 264 })).toBe("turns=42;recapChars=264");
    expect(memoryDiagDetail({ turns: 0, recapChars: 0 })).toBe("turns=0;recapChars=0");
    const payload = memoryDiagPayload("session-id", { turns: 3, recapChars: 1200 }, 123);
    expect(payload).toEqual({ sessionId: "session-id", detail: "turns=3;recapChars=1200", at: 123 });
    expect(memoryDiagSignature(payload)).toBe("session-id|turns=3;recapChars=1200");
  });

  it("the client stamps it at mint time and gemini-session stores it on the row", () => {
    const client = read("src/components/GeminiConversation.tsx");
    expect(client).toContain("stampMemoryDiag({ turns: memoryTurns.length, recapChars: resumeContext ? resumeContext.length : 0 })");
    expect(client).toContain("memoryDiag: payload");
    const session = read("supabase/functions/gemini-session/index.ts");
    expect(session).toContain("memoryDiag:memoryDiagSchema.optional()");
    expect(session).toContain("memoryDiag:[...priorMemory,memoryEntry].slice(-30)");
  });
});
