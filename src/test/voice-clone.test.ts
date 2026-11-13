import { describe, expect, it, test } from "vitest";
import {
  MIN_CLONE_SECONDS, VOICE_CLONE_INSTRUCTIONS, VOICE_CLONE_SCRIPT,
  cloneAudioExtension, formatClock, isCloneAudioType, validateCloneSample,
} from "@/lib/voiceClone";
import { EMPTY } from "@/components/setup-wizard/wizardModel";

test("reading script is the approved copy, verbatim", () => {
  expect(VOICE_CLONE_SCRIPT).toBe(
    "Hello, and thank you for calling. My name is your new virtual receptionist, and I'm here to make sure you never miss an important call. Whether you're with a customer, on a job site, or enjoying a quiet evening at home, I'll answer professionally every single time. I can take a message, book an appointment, or connect the caller straight to you. From early morning to late at night, seven days a week, your business always sounds open, friendly, and ready to help. Questions? Just ask. I'd be delighted to show you what I can do — call us today at eight seven seven, eight six two, four nine four nine, and let's get started.",
  );
});

test("instructions card is the approved copy, verbatim", () => {
  expect([...VOICE_CLONE_INSTRUCTIONS]).toEqual([
    "Find a quiet room — no TV, music, or other voices in the background.",
    "Hold the phone or microphone about an arm's length away; speak at your normal volume.",
    "Read the text exactly as written, in your natural speaking voice — don't act or whisper.",
    "One take of about a minute is perfect. You can listen back and re-record as many times as you like.",
  ]);
});

test("script is long enough for a solid clone sample (115 words, ~50s read aloud)", () => {
  const words = VOICE_CLONE_SCRIPT.split(/\s+/).length;
  expect(words).toBe(115);
  expect(words).toBeGreaterThan(MIN_CLONE_SECONDS * 2);
});

describe("clone sample validation", () => {
  it("rejects an empty recording", () => {
    expect(validateCloneSample({ size: 0, durationSeconds: 0 })).toMatch(/empty/i);
  });
  it("rejects a sample shorter than the minimum", () => {
    const error = validateCloneSample({ size: 100_000, durationSeconds: MIN_CLONE_SECONDS - 5 });
    expect(error).toMatch(new RegExp(`${MIN_CLONE_SECONDS} seconds`));
  });
  it("accepts a one-minute sample", () => {
    expect(validateCloneSample({ size: 700_000, durationSeconds: 60 })).toBeNull();
  });
  it("accepts an unmeasurable duration when the size is sane (WebM Infinity case)", () => {
    expect(validateCloneSample({ size: 700_000, durationSeconds: null })).toBeNull();
  });
  it("rejects an oversized file", () => {
    expect(validateCloneSample({ size: 11 * 1024 * 1024, durationSeconds: 60 })).toMatch(/10 MB/);
  });
});

describe("audio helpers", () => {
  it("formats the recording timer", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(7)).toBe("0:07");
    expect(formatClock(65)).toBe("1:05");
    expect(formatClock(120)).toBe("2:00");
  });
  it("maps mime types to ElevenLabs file extensions", () => {
    expect(cloneAudioExtension("audio/webm;codecs=opus")).toBe("webm");
    expect(cloneAudioExtension("audio/mpeg")).toBe("mp3");
    expect(cloneAudioExtension("audio/mp4")).toBe("m4a");
    expect(cloneAudioExtension("audio/x-wav")).toBe("wav");
  });
  it("accepts clone audio types and falls back to extension", () => {
    expect(isCloneAudioType({ type: "audio/webm", name: "take.webm" })).toBe(true);
    expect(isCloneAudioType({ type: "", name: "voice.m4a" })).toBe(true);
    expect(isCloneAudioType({ type: "video/mp4", name: "clip.mp4" })).toBe(false);
    expect(isCloneAudioType({ type: "image/png", name: "photo.png" })).toBe(false);
  });
});

test("wizard starts with the cloned voice unselected", () => {
  expect(EMPTY.clonedVoiceSelected).toBe(false);
});
