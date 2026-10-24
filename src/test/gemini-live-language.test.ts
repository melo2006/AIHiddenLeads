// @vitest-environment node
import { expect, test } from "vitest";

// Opt-in: uses the deployed lab and incurs Google usage, never runs on routine tests.
const liveUrl = process.env.GEMINI_LIVE_TEST_URL;
const liveTest = liveUrl ? test : test.skip;

async function conversation(prompts: string[]): Promise<string[]> {
  if (!liveUrl) throw new Error("Set GEMINI_LIVE_TEST_URL to run live language verification");
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(liveUrl);
    const replies: string[] = [];
    let transcript = "";
    let greeted = false;
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error("Live language verification timed out"));
    }, 60000);
    ws.onerror = () => { clearTimeout(timeout); reject(new Error("Live connection failed")); };
    ws.onclose = () => {
      clearTimeout(timeout);
      if (replies.length !== prompts.length) reject(new Error("Session ended before all replies arrived"));
    };
    ws.onmessage = (event) => {
      const msg = JSON.parse(String(event.data));
      if (msg.type === "aspen_transcript") transcript += msg.text;
      if (msg.type === "error" || msg.type === "closed") {
        clearTimeout(timeout); ws.close(); reject(new Error(String(msg.message || msg.reason)));
      }
      if (msg.type === "turn_complete") {
        if (!greeted) {
          greeted = true; transcript = "";
          ws.send(JSON.stringify({ type: "text", text: prompts[0] }));
          return;
        }
        replies.push(transcript); transcript = "";
        if (replies.length === prompts.length) {
          clearTimeout(timeout); ws.close(); resolve(replies);
        } else ws.send(JSON.stringify({ type: "text", text: prompts[replies.length] }));
      }
    };
  });
}

liveTest("defaults to English despite foreign greetings and reported airplane noise", async () => {
  const replies = await conversation([
    "Hola. Bonjour. I want to know about your services. There is airplane engine noise around me.",
    "Merci. What does your voice assistant do?",
  ]);
  for (const reply of replies) {
    expect(reply).toMatch(/\b(the|you|your|our|hello|can|what|happy|name)\b/i);
    expect(reply).not.toMatch(/\b(bienvenido|gracias|auf wiedersehen|bonjour|com certeza|falaremos)\b/i);
  }
}, 70000);

liveTest("allows Portuguese after an explicit caller language request", async () => {
  const [reply] = await conversation(["Please switch the conversation to Portuguese and tell me what your voice assistant does."]);
  expect(reply).toMatch(/\b(você|nosso|nossa|posso|assistente|português|chamadas|ligações|atender)\b/i);
}, 70000);

liveTest("starts an audible voice preview without a microphone or caller message", async () => {
  if (!liveUrl) throw new Error("Missing live test URL");
  const url = new URL(liveUrl);
  url.searchParams.set("preview", "1");
  const result = await new Promise<{ audioChunks: number; transcript: string }>((resolve, reject) => {
    const ws = new WebSocket(url);
    let audioChunks = 0;
    let transcript = "";
    const timeout = setTimeout(() => { ws.close(); reject(new Error("Preview timed out")); }, 30000);
    ws.onerror = () => { clearTimeout(timeout); reject(new Error("Preview connection failed")); };
    ws.onmessage = event => {
      const msg = JSON.parse(String(event.data));
      if (msg.type === "audio") audioChunks++;
      if (msg.type === "aspen_transcript") transcript += msg.text;
      if (msg.type === "error" || msg.type === "closed") { clearTimeout(timeout); ws.close(); reject(new Error(String(msg.message || msg.reason))); }
      if (msg.type === "turn_complete") { clearTimeout(timeout); ws.close(); resolve({ audioChunks, transcript }); }
    };
  });
  expect(result.audioChunks).toBeGreaterThan(0);
  expect(result.transcript).toMatch(/Aspen/i);
}, 40000);