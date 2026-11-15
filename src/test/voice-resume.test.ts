import { describe, expect, it } from "vitest";
import { resumeRecap } from "@/components/GeminiConversation";
import { greeting, resumeInstruction } from "../../supabase/functions/_shared/voice-config";
import { HOMEPAGE_ADDONS, HOMEPAGE_GREETING } from "../../supabase/functions/_shared/homepage-knowledge";

describe("same-visit resume", () => {
  it("has no recap before Aspen has spoken", () => {
    expect(resumeRecap([{ role: "user", text: "hi" }])).toBeUndefined();
  });
  it("recaps once the greeting has played", () => {
    expect(resumeRecap([{ role: "assistant", text: "Good morning!" }])).toContain("Assistant: Good morning!");
  });
  it("keeps the first turns and the freshest turns, with an elision between (Publish #63)", () => {
    const turns = [
      { role: "assistant" as const, text: "Good morning! I'm Aspen." },
      { role: "user" as const, text: "My name is Tony Miller." },
      ...Array.from({ length: 50 }, (_, i) => ({ role: (i % 2 ? "user" : "assistant") as "user" | "assistant", text: `Exchange ${i}.` })),
    ];
    const recap = resumeRecap(turns)!;
    expect(recap).toContain("Visitor: My name is Tony Miller.");
    expect(recap).toContain("Exchange 49.");
    expect(recap).toContain("[... middle of the conversation omitted ...]");
    expect(recap.length).toBeLessThanOrEqual(14000);
  });
  it("the recap-facts rule rides in the resume instruction (Publish #63)", () => {
    expect(resumeInstruction("Assistant: Good morning!")).toContain("RECAP FACTS ARE KNOWN, NOT MISSING");
  });
  it("tells Aspen not to repeat the greeting", () => {
    const text = resumeInstruction("Assistant: Good morning!");
    expect(text).toContain("Do NOT repeat the opening greeting");
    expect(text).toContain("you're back");
  });
});

describe("homepage greeting", () => {
  it("keeps name confirmation available for a later turn", () => {
    expect(greeting({ greeting: '{nameConfirm}', name: "Aspen" }, 9, "Mark Smith")).toContain("is your name Mark?");
    expect(greeting({ greeting: '{nameConfirm}', name: "Aspen" }, 9, "")).toContain("what is your name?");
  });
  it("prices the video avatar add-on at $79/month", () => {
    expect(HOMEPAGE_ADDONS.find(a => a.name.startsWith("Video Avatar"))?.usd).toBe(79);
  });
});
