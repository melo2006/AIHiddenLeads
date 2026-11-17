// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MIC_SILENT_FIRST_CHECK_MS,
  MIC_SILENT_LEVEL_FLOOR,
  MIC_SILENT_MIN_LOUD_FRAMES,
  MIC_SILENT_RECHECK_MS,
  createMicFlowState,
  micDiagDetail,
  micDiagStamp,
  noteMicFrame,
  noteMicSessionLive,
  shouldShowSilentMicNotice,
  type MicSilentSnapshot,
} from "@/lib/micWatchdog";
import {
  READ_ALOUD_CHUNK_CHARS,
  READ_ALOUD_FIRST_CHUNK_CHARS,
  splitReadAloudChunks,
} from "@/lib/readAloudChunks";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const conversation = read("../components/GeminiConversation.tsx");
const chatWidget = read("../components/landing/demo-results/ChatWidget.tsx");
const homepageKnowledge = read("../../supabase/functions/_shared/homepage-knowledge.ts");
const en = JSON.parse(read("../i18n/locales/en.json")) as { panel: Record<string, string> };
const es = JSON.parse(read("../i18n/locales/es.json")) as { panel: Record<string, string> };
const ptBR = JSON.parse(read("../i18n/locales/pt-BR.json")) as { panel: Record<string, string> };

/**
 * Chat-fix6 (2026-11-16) — the five fixes from Ron's fix5 retest:
 * silent-mic rescue, noise-default alignment, dollars-first price
 * answers, chunked read-aloud, and the re-cut Aspen tile (the tile
 * is a binary asset; its verification is visual, in the handoff).
 */

const T0 = 2_000_000;

function silentSnapshot(overrides: Partial<MicSilentSnapshot> = {}): MicSilentSnapshot {
  return {
    now: T0 + MIC_SILENT_FIRST_CHECK_MS,
    live: true,
    handsFree: true,
    muted: false,
    paused: false,
    handoff: false,
    recoveryActive: false,
    liveSince: T0,
    frames: 100,
    loudFrames: 0,
    silentStage: 0,
    ...overrides,
  };
}

describe("fix6 item 1 — silent-mic detection: the 3b30cc34 fixture", () => {
  it("the floor sits above the dead stream's ceiling and far below real sound", () => {
    // Ron's dead stream printed amb=0.0000 for 122s: its level
    // stayed under 0.00005 the whole session.
    expect(MIC_SILENT_LEVEL_FLOOR).toBeGreaterThan(0.00005);
    // The panel's sound-detected meter trips ~0.007 and speech is
    // 0.01+: the floor must sit far below both so any real room
    // sound counts as loud.
    expect(MIC_SILENT_LEVEL_FLOOR).toBeLessThan(0.007);
    expect(MIC_SILENT_MIN_LOUD_FRAMES).toBe(3);
  });

  it("replaying Ron's session through the tracker yields zero loud frames and the notice fires on schedule", () => {
    const flow = createMicFlowState();
    noteMicSessionLive(flow, T0);
    // 956 frames over ~122.4s (~7.8 fps): digital dither under
    // 0.00005, plus ONE connect transient that crossed the energy
    // epsilon (his stamp's flow=1) but not the loud floor.
    for (let i = 0; i < 956; i += 1) {
      const rms = i === 10 ? 0.00015 : 0.00001;
      noteMicFrame(flow, rms, T0 + i * 128);
    }
    expect(flow.frames).toBe(956);
    expect(flow.energyFrames).toBe(1);
    expect(flow.loudFrames).toBe(0);

    const at = (now: number, stage: number) =>
      shouldShowSilentMicNotice(silentSnapshot({ now, frames: flow.frames, loudFrames: flow.loudFrames, silentStage: stage }));
    // Not before the first-check window.
    expect(at(T0 + MIC_SILENT_FIRST_CHECK_MS - 1, 0)).toBe(false);
    // Fires at ~5s after go-live.
    expect(at(T0 + MIC_SILENT_FIRST_CHECK_MS, 0)).toBe(true);
    // Dismissed (stage 1): quiet until the ~15s re-check, then once more.
    expect(at(T0 + MIC_SILENT_RECHECK_MS - 1, 1)).toBe(false);
    expect(at(T0 + MIC_SILENT_RECHECK_MS, 1)).toBe(true);
    // The re-check is the last surfacing.
    expect(at(T0 + 120_000, 2)).toBe(false);
  });

  it("never fires on a healthy mic: speech-level frames stand it down at every stage", () => {
    const flow = createMicFlowState();
    noteMicSessionLive(flow, T0);
    for (let i = 0; i < 40; i += 1) noteMicFrame(flow, 0.02, T0 + i * 128);
    expect(flow.loudFrames).toBeGreaterThanOrEqual(MIC_SILENT_MIN_LOUD_FRAMES);
    for (const stage of [0, 1]) {
      expect(shouldShowSilentMicNotice(silentSnapshot({ now: T0 + 120_000, loudFrames: flow.loudFrames, silentStage: stage }))).toBe(false);
    }
  });

  it("never fires on a quiet room with a working mic: breath/room ticks above the floor are enough", () => {
    const flow = createMicFlowState();
    noteMicSessionLive(flow, T0);
    // Near-silent room: dither frames, with a breath / room shift
    // crossing the floor a handful of times across the window.
    for (let i = 0; i < 200; i += 1) {
      noteMicFrame(flow, i % 40 === 0 ? 0.0008 : 0.00002, T0 + i * 128);
    }
    expect(flow.loudFrames).toBe(5);
    expect(shouldShowSilentMicNotice(silentSnapshot({ now: T0 + 60_000, loudFrames: flow.loudFrames }))).toBe(false);
  });

  it("stands down for the dead-path guard's shapes: no frames, dead track, watchdog due, deliberate silence", () => {
    expect(shouldShowSilentMicNotice(silentSnapshot({ frames: 0 }))).toBe(false);
    expect(shouldShowSilentMicNotice(silentSnapshot({ trackDead: true }))).toBe(false);
    expect(shouldShowSilentMicNotice(silentSnapshot({ watchdogActive: true }))).toBe(false);
    expect(shouldShowSilentMicNotice(silentSnapshot({ muted: true }))).toBe(false);
    expect(shouldShowSilentMicNotice(silentSnapshot({ paused: true }))).toBe(false);
    expect(shouldShowSilentMicNotice(silentSnapshot({ handsFree: false }))).toBe(false);
    expect(shouldShowSilentMicNotice(silentSnapshot({ live: false }))).toBe(false);
  });

  it("a new session resets the loud tier with the rest of the tracker", () => {
    const flow = createMicFlowState();
    noteMicSessionLive(flow, T0);
    noteMicFrame(flow, 0.05, T0 + 10);
    expect(flow.loudFrames).toBe(1);
    noteMicSessionLive(flow, T0 + 500_000);
    expect(flow.loudFrames).toBe(0);
    expect(flow.lastLoudAt).toBe(0);
  });

  it("the micDiag stamp carries silent=1 only when the notice fired", () => {
    const flow = createMicFlowState();
    noteMicSessionLive(flow, T0);
    const base = { event: "watchdog" as const, flow, permission: "granted", track: "live" as const, inputSec: 122.4 };
    expect(micDiagDetail(micDiagStamp({ ...base, silentMic: true }))).toContain("silent=1");
    expect(micDiagDetail(micDiagStamp(base))).not.toContain("silent=");
  });

  it("the component wires the guard: evaluator, stamp, both panel render sites, localized string", () => {
    expect(conversation).toContain("shouldShowSilentMicNotice({");
    expect(conversation).toContain("silentMic: silentMicFiredRef.current");
    expect(conversation).toContain("watchdogActive: watchdogDue");
    const notices = conversation.match(/panel\.micSilent/g) ?? [];
    expect(notices).toHaveLength(2);
    expect(conversation).toContain('onClick={() => setShowSettings(true)}>{t("panel.checkMicrophone")}');
    for (const locale of [en, es, ptBR]) {
      expect(locale.panel.micSilent).toBeTruthy();
      expect(locale.panel.micSilent.length).toBeGreaterThan(40);
    }
    expect(ptBR.panel.micSilent).not.toBe(en.panel.micSilent);
    expect(es.panel.micSilent).not.toBe(en.panel.micSilent);
  });
});

describe("fix6 item 2 — noise default alignment (noisy-room default)", () => {
  it("the factory start is strong and a saved value needs the manual marker", () => {
    expect(conversation).toContain('localStorage.getItem("voice-noise-filter-manual") === "1"');
    expect(conversation).toContain('return manual && (saved === "light" || saved === "strong") ? saved : "strong";');
  });

  it("the ambient auto-pick can never land on light by itself", () => {
    expect(conversation).toContain('const autoFilter = next.filter === "light" ? "balanced" : next.filter;');
  });

  it("only the manual chooser persists, and it writes the marker with the value", () => {
    expect(conversation).toContain('localStorage.setItem("voice-noise-filter", value); localStorage.setItem("voice-noise-filter-manual", "1");');
    expect(conversation).not.toContain('localStorage.setItem("voice-noise-filter", noiseFilter)');
  });
});

describe("fix6 item 3 — price answers in dollars first, both prompt homes", () => {
  it("the ChatWidget homepage plan block leads with dollars", () => {
    expect(chatWidget).toContain("Premium ($99/month");
    expect(chatWidget).toContain("Professional ($199/month");
    expect(chatWidget).toContain("Platinum ($349/month");
    expect(chatWidget).toContain("Never answer a money question with minutes alone");
  });

  it("HOMEPAGE_SALES_PROMPT leads with dollars and keeps the no-invention rules", () => {
    expect(homepageKnowledge).toContain("lead with the DOLLAR prices: Premium is $99 a month, Professional is $199 a month and Platinum is $349 a month");
    expect(homepageKnowledge).toContain("never answer a money question with minutes alone");
    expect(homepageKnowledge).toContain("there is no unlimited plan");
    expect(homepageKnowledge).toContain("never quote a price for a plan that does not exist");
  });
});

describe("fix6 item 4 — read-aloud chunking", () => {
  it("a short reply is a single chunk, unchanged", () => {
    const text = "Premium is $99 a month, and it includes 400 minutes.";
    expect(splitReadAloudChunks(text)).toEqual([text]);
  });

  it("empty text yields no chunks", () => {
    expect(splitReadAloudChunks("")).toEqual([]);
    expect(splitReadAloudChunks("   ")).toEqual([]);
  });

  it("a long reply: capped chunks, small first chunk, exact order and content preserved", () => {
    const sentence = "Aspen answers every call in under a second, day or night. ";
    const text = sentence.repeat(40).trim(); // ~2,280 chars
    const chunks = splitReadAloudChunks(text);
    expect(chunks.length).toBeGreaterThan(3);
    expect(chunks.join("")).toBe(text);
    expect(chunks[0].length).toBeLessThanOrEqual(READ_ALOUD_FIRST_CHUNK_CHARS);
    expect(chunks[0].trimEnd().endsWith(".")).toBe(true);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(READ_ALOUD_CHUNK_CHARS);
    // Well under the function's 800-char cap, so nothing truncates.
    for (const chunk of chunks) expect(chunk.length).toBeLessThan(800);
  });

  it("one giant sentence is hard-split at word boundaries without losing a character", () => {
    const text = Array.from({ length: 200 }, (_, i) => `word${i}`).join(" ");
    const chunks = splitReadAloudChunks(text);
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.join("")).toBe(text);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(READ_ALOUD_CHUNK_CHARS);
    expect(chunks[0].endsWith(" ")).toBe(true);
  });

  it("a spaceless over-long string is cut at the budget exactly", () => {
    const text = "a".repeat(1500);
    const chunks = splitReadAloudChunks(text);
    expect(chunks.join("")).toBe(text);
    expect(chunks.map((c) => c.length)).toEqual([READ_ALOUD_FIRST_CHUNK_CHARS, READ_ALOUD_CHUNK_CHARS, READ_ALOUD_CHUNK_CHARS, 60]);
  });

  it("the player fetches chunk 1 first, prefetches the next while playing, and caches per chunk", () => {
    expect(chatWidget).toContain("const chunks = splitReadAloudChunks(text);");
    expect(chatWidget).toContain("body: JSON.stringify({ text: chunks[i], voice: readAloudVoice })");
    expect(chatWidget).toContain("void getChunkUrl(i + 1).catch(");
    expect(chatWidget).toContain("chunkUrls[i] = url;");
    expect(chatWidget).toContain("signal: controller.signal");
    expect(chatWidget).toContain("audio.onended = () => { void playChunk(current + 1); };");
  });
});
