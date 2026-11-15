// Local-first paired playout policy + scheduling (volume-stream
// fix, 2026-11-14): the mode resolution (URL kill switch beats the
// stored preference beats the local-first default) and the rule
// that the 0.4 s paired shift lives in EXACTLY ONE place — the
// audible schedule on the local path, the caption window on the
// stream path, never both, never neither for a paired chunk.
import { describe, expect, it } from "vitest";
import { resolveHeardEngine, resolvePairedAudibleMode } from "@/lib/pairedAudible";
import { pairedCaptionDelaySec, voiceChunkStartAt, PAIRED_CAPTION_DELAY_SEC } from "@/lib/avatarAudioTransition";

describe("resolvePairedAudibleMode", () => {
  it("defaults to local-first", () => {
    expect(resolvePairedAudibleMode("", null)).toBe("local");
    expect(resolvePairedAudibleMode(null, null)).toBe("local");
    expect(resolvePairedAudibleMode(undefined, undefined)).toBe("local");
  });

  it("the URL parameter is the kill switch and wins over storage", () => {
    expect(resolvePairedAudibleMode("?pairedAudible=stream", "local")).toBe("stream");
    expect(resolvePairedAudibleMode("?pairedAudible=local", "stream")).toBe("local");
    expect(resolvePairedAudibleMode("?demo=1&pairedAudible=stream", null)).toBe("stream");
  });

  it("the stored preference applies when the URL is silent", () => {
    expect(resolvePairedAudibleMode("", "stream")).toBe("stream");
    expect(resolvePairedAudibleMode("?demo=1", "stream")).toBe("stream");
  });

  it("unrecognized values fall through to the default", () => {
    expect(resolvePairedAudibleMode("?pairedAudible=bogus", "bogus")).toBe("local");
    expect(resolvePairedAudibleMode("?pairedAudible=", "")).toBe("local");
  });
});

describe("voiceChunkStartAt — the shift lives in the schedule only at a drained queue", () => {
  it("shift 0 is byte-identical to the legacy scheduling", () => {
    expect(voiceChunkStartAt(1, 1.2, 0)).toBe(1.2);
    expect(voiceChunkStartAt(2, 1.2, 0)).toBeCloseTo(2.12);
    expect(voiceChunkStartAt(2, 1.2)).toBeCloseTo(2.12);
  });

  it("a drained queue restarts shifted (headroom + shift)", () => {
    expect(voiceChunkStartAt(2, 1.2, PAIRED_CAPTION_DELAY_SEC)).toBeCloseTo(2.12 + PAIRED_CAPTION_DELAY_SEC);
  });

  it("a running queue chains unshifted — the run's first chunk already carried the shift", () => {
    expect(voiceChunkStartAt(1, 1.2, PAIRED_CAPTION_DELAY_SEC)).toBe(1.2);
    expect(voiceChunkStartAt(1.19, 1.2, PAIRED_CAPTION_DELAY_SEC)).toBe(1.2);
  });
});

describe("pairedCaptionDelaySec — the caption shift exists only on the stream path", () => {
  it("stream + paired keeps the legacy 0.4 s caption shift", () => {
    expect(pairedCaptionDelaySec(true, "stream")).toBe(PAIRED_CAPTION_DELAY_SEC);
  });

  it("local-first paired carries NO caption shift (the schedule has it)", () => {
    expect(pairedCaptionDelaySec(true, "local")).toBe(0);
  });

  it("non-paired chunks never shift in either mode", () => {
    expect(pairedCaptionDelaySec(false, "stream")).toBe(0);
    expect(pairedCaptionDelaySec(false, "local")).toBe(0);
  });
});

describe("resolveHeardEngine — the local path's heard engine (volume-speaker fix; #54 re-point)", () => {
  it("defaults to the blob/file media-element engine (Publish #54)", () => {
    expect(resolveHeardEngine("", null)).toBe("blob");
    expect(resolveHeardEngine(null, null)).toBe("blob");
    expect(resolveHeardEngine(undefined, undefined)).toBe("blob");
  });

  it("the MediaSource engine engages ONLY under its explicit opt-in", () => {
    expect(resolveHeardEngine("?heardEngine=element", null)).toBe("element");
    expect(resolveHeardEngine("?heardEngine=element", "blob")).toBe("element");
    expect(resolveHeardEngine("", "element")).toBe("element");
    // Nothing implicit ever selects it: silence, other params and
    // bogus values all land on the blob default.
    expect(resolveHeardEngine("?demo=1", null)).toBe("blob");
    expect(resolveHeardEngine("?heardEngine=bogus", "bogus")).toBe("blob");
  });

  it("?heardEngine=sink restores the Publish #48 media-sink graph and wins over storage", () => {
    expect(resolveHeardEngine("?heardEngine=sink", "element")).toBe("sink");
    expect(resolveHeardEngine("?heardEngine=blob", "sink")).toBe("blob");
    expect(resolveHeardEngine("?demo=1&heardEngine=sink", null)).toBe("sink");
  });

  it("the stored preference applies when the URL is silent", () => {
    expect(resolveHeardEngine("", "sink")).toBe("sink");
    expect(resolveHeardEngine("", "blob")).toBe("blob");
  });

  it("the paired-mode kill switch is independent of the engine switch", () => {
    // ?pairedAudible=stream bypasses BOTH element engines (the
    // local branch becomes a silent clock); resolving the engine
    // never changes the paired mode and vice versa.
    expect(resolvePairedAudibleMode("?pairedAudible=stream&heardEngine=blob", null)).toBe("stream");
    expect(resolvePairedAudibleMode("?pairedAudible=stream&heardEngine=element", null)).toBe("stream");
    expect(resolveHeardEngine("?pairedAudible=stream", null)).toBe("blob");
    expect(resolveHeardEngine("?pairedAudible=stream&heardEngine=element", null)).toBe("element");
  });
});
