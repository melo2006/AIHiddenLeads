// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  RECAP_ELISION_LINE,
  RECAP_MAX_CHARS,
  buildTranscriptRecap,
  windowRecapLines,
  windowRecapText,
  type RecapTurn,
} from "../../supabase/functions/_shared/recap-builder";
import { RECAP_FACTS_RULE, resumeInstruction } from "../../supabase/functions/_shared/voice-config";
import {
  dropReconnectInstruction,
  personaDropInstruction,
  personaResumeInstruction,
} from "../../supabase/functions/_shared/session-opening";

// Publish #63 (2026-11-15): the recap windowing that replaced the
// last-8-turns / 1,500-char tail-slice. Ron's live retest evidence:
// the successor session forgot the name given at the start, the
// price bracket from the prior segment, and the first two of three
// cities — all structurally outside the old window.

const turn = (role: "user" | "assistant", text: string): RecapTurn => ({ role, text });

describe("recap windowing — first + last, never a blind tail-slice", () => {
  it("keeps the visitor's name from the first turns across a long conversation", () => {
    const turns: RecapTurn[] = [
      turn("assistant", "Hi, I'm Frank with Michael Martinez Realty. Who do I have the pleasure of speaking with?"),
      turn("user", "My name is Tony Miller."),
      turn("assistant", "Great to meet you, Tony. Are you looking to buy or sell?"),
      ...Array.from({ length: 60 }, (_, i) => turn(i % 2 ? "user" : "assistant", `Exchange number ${i} about the search.`)),
    ];
    const recap = windowRecapText(turns);
    expect(recap).toContain("Visitor: My name is Tony Miller.");
    expect(recap).toContain(`Exchange number 59`);
    expect(recap).toContain(RECAP_ELISION_LINE);
  });

  it("keeps criteria stated mid-conversation (inside the last-30 window)", () => {
    const turns: RecapTurn[] = [
      turn("assistant", "Hello and welcome."),
      turn("user", "Hi, this is Dana."),
      ...Array.from({ length: 10 }, (_, i) => turn("assistant", `Filler exchange ${i}.`)),
      turn("user", "I'm looking in Deerfield Beach and Pompano Beach, three hundred to four hundred thousand, and I need a two-car garage."),
      ...Array.from({ length: 10 }, (_, i) => turn("user", `More detail ${i}.`)),
    ];
    const recap = windowRecapText(turns);
    expect(recap).toContain("Deerfield Beach and Pompano Beach");
    expect(recap).toContain("two-car garage");
    expect(recap).toContain("Visitor: Hi, this is Dana.");
  });

  it("marks the elision only when turns were actually dropped", () => {
    const short = windowRecapText([turn("assistant", "Hi."), turn("user", "Hello.")]);
    expect(short).not.toContain(RECAP_ELISION_LINE);
    const exact = windowRecapText(Array.from({ length: 36 }, (_, i) => turn("assistant", `Turn ${i}.`)));
    expect(exact).not.toContain(RECAP_ELISION_LINE);
    const over = windowRecapText(Array.from({ length: 37 }, (_, i) => turn("assistant", `Turn ${i}.`)));
    expect(over).toContain(RECAP_ELISION_LINE);
    expect(over).toContain("Turn 0.");
    expect(over).toContain("Turn 36.");
    expect(over).not.toContain("Turn 6.");
  });

  it("respects the hard cap with fat turns, dropping whole recent lines from their start", () => {
    const fat = "This is a very long turn with a great deal of ordinary detail about the property search. ".repeat(12);
    const turns: RecapTurn[] = [
      turn("user", "My name is Tony Miller."),
      ...Array.from({ length: 40 }, (_, i) => turn("assistant", `Turn ${i}. ${fat}`)),
    ];
    const recap = windowRecapText(turns);
    expect(recap.length).toBeLessThanOrEqual(RECAP_MAX_CHARS);
    // The opening line — the name — is the last thing the cap may eat.
    expect(recap).toContain("Visitor: My name is Tony Miller.");
    expect(recap).toContain(RECAP_ELISION_LINE);
    // No surviving line is a severed fragment of a fat turn.
    for (const line of recap.split("\n")) {
      if (line === RECAP_ELISION_LINE) continue;
      expect(line.startsWith("Visitor: ") || line.startsWith("Assistant: ")).toBe(true);
    }
  });

  it("windowRecapLines passes short inputs through untouched", () => {
    const lines = ["Visitor: Hi", "Assistant: Hello"];
    expect(windowRecapLines(lines)).toEqual(lines);
    expect(windowRecapLines([])).toEqual([]);
  });
});

describe("buildTranscriptRecap — the server-side synthesis source", () => {
  it("maps stored fragments (caller -> Visitor) and windows them like the client recap", () => {
    const fragments = [
      { role: "assistant", text: "Hi, I'm Frank. Who am I speaking with?" },
      { role: "caller", text: "Tony Miller." },
      ...Array.from({ length: 50 }, (_, i) => ({ role: i % 2 ? "caller" : "assistant", text: `Stored exchange ${i}.` })),
    ];
    const recap = buildTranscriptRecap(fragments);
    expect(recap).toContain("Visitor: Tony Miller.");
    expect(recap).toContain("Stored exchange 49.");
    expect(recap).toContain(RECAP_ELISION_LINE);
  });

  it("returns undefined without an assistant fragment, and skips junk fragments", () => {
    expect(buildTranscriptRecap([{ role: "caller", text: "Hello?" }])).toBeUndefined();
    expect(buildTranscriptRecap("not an array")).toBeUndefined();
    expect(buildTranscriptRecap(null)).toBeUndefined();
    expect(buildTranscriptRecap([])).toBeUndefined();
    const recap = buildTranscriptRecap([
      null,
      { role: "system", text: "not conversation" },
      { role: "assistant", text: "" },
      { role: "assistant", text: "Real opening." },
      { role: "caller", text: 42 },
      { role: "caller", text: "Real answer." },
    ]);
    expect(recap).toBe("Assistant: Real opening.\nVisitor: Real answer.");
  });
});

describe("recap facts rule — the successor session treats the recap as known", () => {
  it("rides in the resume, drop-reconnect and persona resume/drop openings", () => {
    expect(resumeInstruction("Assistant: Hi")).toContain(RECAP_FACTS_RULE);
    expect(dropReconnectInstruction("Assistant: Hi")).toContain(RECAP_FACTS_RULE);
    expect(personaResumeInstruction({ persona: "frank" }, "Assistant: Hi")).toContain(RECAP_FACTS_RULE);
    expect(personaDropInstruction({ persona: "frank", drops: 1 }, "Assistant: Hi")).toContain(RECAP_FACTS_RULE);
  });

  it("names the failure it forbids: claiming the name or criteria are not recorded", () => {
    expect(RECAP_FACTS_RULE).toContain("never say or imply that you do not have their name");
    expect(RECAP_FACTS_RULE).toContain("never ask them to repeat anything the recap already contains");
  });
});

describe("gemini-session wiring — caps raised + server-side synthesis", () => {
  // gemini-session is a Deno entrypoint and cannot be imported into
  // vitest; its contract is pinned from the source, the same pattern
  // consent-scan-wiring.test.ts uses.
  const sessionSource = readFileSync(new URL("../../supabase/functions/gemini-session/index.ts", import.meta.url), "utf8");

  it("admits the full recap: resumeContext 16000, swapRecap 8000", () => {
    expect(sessionSource).toContain("resumeContext:z.string().max(16000)");
    expect(sessionSource).toContain("swapRecap:z.string().max(8000)");
    expect(sessionSource).not.toContain("resumeContext:z.string().max(1600)");
    expect(sessionSource).not.toContain("swapRecap:z.string().max(2400)");
  });

  it("synthesizes from a prior session's stored transcript and feeds it to the config", () => {
    expect(sessionSource).toContain("buildTranscriptRecap");
    expect(sessionSource).toContain("effectiveResumeContext");
    expect(sessionSource).toContain(":effectiveResumeContext)");
    // Only non-segment, non-preview authorizations with a thin or
    // absent client recap trigger the lookup.
    expect(sessionSource).toContain("!b.personaSegment && !b.preview && !b.draft && !b.share && !b.guide");
    expect(sessionSource).toContain("b.resumeContext.trim().length < 200");
  });

  it("Publish #64: stamps an IP-free visitorKeyHash into every stored config", () => {
    // The bare key hash — no forwarded address mixed in — computed
    // from the request's visitorKey via the shared hash() helper.
    expect(sessionSource).toContain("const visitorKeyHash = await hash(b.visitorKey);");
    // Stamped at the single final config assembly the RPC stores, so
    // every authorization's row carries it.
    expect(sessionSource).toContain("...config,visitorKeyHash,timeZone:effectiveTimeZone");
  });

  it("Publish #64: falls back to the key-hash lookup only when the visitor_hash lookup found no usable prior", () => {
    // The primary visitor_hash lookup stays exactly as #63 shipped it.
    expect(sessionSource).toContain(".eq('visitor_hash', priorVisitorHash)");
    expect(sessionSource).toContain("let prior = (priorRows || []).find(usablePrior);");
    // The fallback matches the prior row by the key hash stamped in
    // its stored config (jsonb text extraction), with the same
    // scoping chain as the primary lookup.
    expect(sessionSource).toContain(".eq('config->>visitorKeyHash', visitorKeyHash)");
    expect(sessionSource).toContain("fallbackQuery = fallbackQuery.eq('lead_id', b.leadId);");
    expect(sessionSource).toContain("fallbackQuery = fallbackQuery.eq('prospect_id', b.prospectId);");
    expect(sessionSource).toContain("else fallbackQuery = fallbackQuery.eq('agent_id', agentId);");
    // Ordering pin: the no-usable-prior gate opens before the
    // fallback query is built, so the fallback can never run (or
    // override the primary result) when the primary lookup matched.
    const gateIndex = sessionSource.indexOf("if (!prior) {");
    const fallbackIndex = sessionSource.indexOf(".eq('config->>visitorKeyHash', visitorKeyHash)");
    expect(gateIndex).toBeGreaterThan(-1);
    expect(fallbackIndex).toBeGreaterThan(gateIndex);
  });
});
