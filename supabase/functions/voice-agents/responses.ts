import { createOpenAI } from "npm:@ai-sdk/openai";
import { streamText, type ModelMessage } from "npm:ai";

import {
  createLovableAiGatewayRunIdFetch,
  getLovableAiGatewayRunId,
  withLovableAiGatewayRunIdHeader,
} from "./run-id.ts";

export function createResponsesCall(
  request: Request,
  config: { baseURL: string; apiKey: string; model: string },
  messages: ModelMessage[],
  instructions?: string,
) {
  const runIdFetch = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(request));
  const provider = createOpenAI({
    baseURL: `${config.baseURL.replace(/\/+$/, "").replace(/\/v1$/, "")}/v1`,
    apiKey: config.apiKey,
    headers: { "Lovable-API-Key": config.apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });
  // Transport fix (2026-11-18): callers point this helper at Google's
  // OpenAI-compatible endpoint (generativelanguage.googleapis.com/v1beta/openai),
  // which serves Chat Completions but has NO Responses API — POST
  // /v1beta/openai/v1/responses returns 404, so the old Responses transport
  // produced an empty, errored stream and every `await result.text` threw
  // "No output generated. Check the stream for errors." (surfaced as HTTP 502
  // in suggestKnowledge / suggestIndustry / suggestGreeting, and silently
  // swallowed by the pack-fallback in suggestServices / suggestGuardrails /
  // suggestServiceArea). Use the chat transport instead; `instructions`
  // maps to the chat `system` message, and the Responses-only provider
  // options (store flag, forced reasoning, encrypted reasoning content)
  // are dropped — Google's chat endpoint neither needs nor accepts them.
  const result = streamText({
    model: provider.chat(config.model),
    ...(instructions ? { system: instructions } : {}),
    messages,
    abortSignal: request.signal,
  });
  return {
    result,
    response: () =>
      withLovableAiGatewayRunIdHeader(result.toUIMessageStreamResponse({ sendReasoning: true }), runIdFetch),
  };
}
