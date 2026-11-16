import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { resumeRecap, visitMemoryAppend, visitMemoryDelete, visitMemoryGet } from "@/components/GeminiConversation";

// Ron's staging test (2026-11-16): a sales conversation (name +
// business gathered), then a THIN handoff-leg session (transfer
// announcement + welcome back), then one more drop. The post-drop
// session's recap held ONLY the handoff leg — Aspen had forgotten
// the visitor's name and business. Cause: flushLine replaced the
// visit store with the current session's `turns` array, and every
// new session starts from an empty array, so each session's first
// flushed line wiped all earlier sessions' history. The store must
// ACCUMULATE across every session of the visit.
describe("visit memory accumulates across sessions", () => {
  const key = "test-accumulation-homepage";

  it("a later session's recap still carries the first session's facts after a thin handoff leg", () => {
    visitMemoryDelete(key);
    // Session 1+2 of the visit: the sales conversation.
    visitMemoryAppend(key, { role: "assistant", text: "Good afternoon, and thanks for calling AI Hidden Leads! I'm Aspen. And may I have your name?" });
    visitMemoryAppend(key, { role: "user", text: "My name is Ronald." });
    visitMemoryAppend(key, { role: "assistant", text: "Thanks, Ronald. What kind of business do you run?" });
    visitMemoryAppend(key, { role: "user", text: "I own a locksmith business. I go to businesses and houses whenever they call me." });
    visitMemoryAppend(key, { role: "assistant", text: "Got it. And when you're out on a job, who answers your calls today?" });
    // The handoff leg: a fresh session whose own turns are only the
    // transfer announcement and the welcome back. Under the old
    // replace semantics these two turns became the ENTIRE store.
    visitMemoryAppend(key, { role: "assistant", text: "I'll transfer you to our sales director now. I'll stay right here until you're through." });
    visitMemoryAppend(key, { role: "user", text: "hungry" });
    visitMemoryAppend(key, { role: "assistant", text: "Welcome back! I hope your call with our sales director went well." });

    const recap = resumeRecap(visitMemoryGet(key));
    expect(recap).toContain("My name is Ronald.");
    expect(recap).toContain("locksmith business");
    expect(recap).toContain("Welcome back!");
    visitMemoryDelete(key);
  });

  it("the writers append instead of replacing the store with the session's turns", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "components", "GeminiConversation.tsx"), "utf8");
    // flushLine + the swap divider both append the single new turn.
    expect(source.match(/visitMemoryAppend\(agentId/g)?.length).toBeGreaterThanOrEqual(2);
    // The old replace-with-turns-array writes are gone.
    expect(source).not.toContain("visitMemorySet(agentId || \"homepage\", next)");
    expect(source).not.toContain("visitMemorySet(agentId || 'homepage', next)");
  });
});
