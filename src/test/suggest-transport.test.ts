import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

// Transport pin for the wizard suggest actions (2026-11-18 bug):
// createResponsesCall was built on the OpenAI Responses API
// (provider.responses), but its call sites point at Google's
// OpenAI-compatible endpoint, which has no Responses API —
// POST /v1beta/openai/v1/responses returns 404. Every
// `await result.text` then threw "No output generated. Check the
// stream for errors.", surfaced as HTTP 502 by suggestKnowledge /
// suggestIndustry / suggestGreeting and silently swallowed by the
// pack fallback in suggestServices / suggestGuardrails /
// suggestServiceArea. These pins keep the helper on the Chat
// Completions transport that Google's endpoint actually serves.
const readFn = (rel: string) =>
  fs.readFileSync(path.join(__dirname, "..", "..", "supabase", "functions", rel), "utf8");

describe("voice-agents suggest transport (responses.ts)", () => {
  const helper = readFn("voice-agents/responses.ts");

  it("uses the Chat Completions transport, not the Responses API", () => {
    expect(helper).toContain("provider.chat(");
    expect(helper).not.toContain("provider.responses(");
  });

  it("maps instructions to the chat system message", () => {
    expect(helper).toContain("system: instructions");
    expect(helper).not.toContain("{ instructions }");
  });

  it("sends no Responses-only provider options", () => {
    expect(helper).not.toContain("reasoning.encrypted_content");
    expect(helper).not.toContain("forceReasoning");
    expect(helper).not.toContain("store: false");
  });

  it("call sites still target Google's endpoint with gemini-2.5-flash", () => {
    const index = readFn("voice-agents/index.ts");
    const calls = index.match(/createResponsesCall\(req,\{baseURL:'https:\/\/generativelanguage\.googleapis\.com\/v1beta\/openai',apiKey,model:'gemini-2\.5-flash'\}/g) || [];
    // suggestGreeting, suggestKnowledge/suggestIndustry, suggestServices family
    expect(calls.length).toBeGreaterThanOrEqual(3);
  });
});
