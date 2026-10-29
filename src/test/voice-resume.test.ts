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
  it("tells Aspen not to repeat the greeting", () => {
    const text = resumeInstruction("Assistant: Good morning!");
    expect(text).toContain("Do NOT repeat the opening greeting");
    expect(text).toContain("you're back");
  });
});

describe("homepage greeting", () => {
  it("confirms a known visitor name", () => {
    expect(greeting({ greeting: HOMEPAGE_GREETING, name: "Aspen" }, 9, "Mark Smith")).toContain("is your name Mark?");
  });
  it("asks for the name when unknown", () => {
    expect(greeting({ greeting: HOMEPAGE_GREETING, name: "Aspen" }, 9, "")).toContain("what is your name?");
  });
  it("prices the video avatar add-on at $79/month", () => {
    expect(HOMEPAGE_ADDONS.find(a => a.name.startsWith("Video Avatar"))?.usd).toBe(79);
  });
});
