// WebM/Opus muxer (volume-speaker fix, 2026-11-14): the media
// element engine feeds a MediaSource from hand-built WebM, so the
// byte structure is pinned here — EBML header, a Segment opened
// with the unknown-size marker, Info with a 1 ms TimecodeScale, one
// A_OPUS track whose CodecPrivate is the OpusHead, and clusters
// whose Timestamp carries the block's absolute media time.
import { describe, expect, it } from "vitest";
import { opusHead, webmOpusCluster, webmOpusInitSegment } from "@/lib/webmOpusMux";

const findSub = (hay: Uint8Array, needle: number[]): number => {
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
};
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

describe("opusHead", () => {
  it("carries the magic, version, channel count and the input rate little-endian", () => {
    const head = opusHead(24000, 1, 0);
    expect(head.length).toBe(19);
    expect(String.fromCharCode(...head.slice(0, 8))).toBe("OpusHead");
    expect(head[8]).toBe(1);
    expect(head[9]).toBe(1);
    expect(new DataView(head.buffer).getUint32(12, true)).toBe(24000);
    expect(new DataView(head.buffer).getUint16(10, true)).toBe(0);
  });
});

describe("webmOpusInitSegment", () => {
  const init = webmOpusInitSegment(opusHead(24000));

  it("starts with the EBML header and declares DocType webm", () => {
    expect([...init.slice(0, 4)]).toEqual([0x1a, 0x45, 0xdf, 0xa3]);
    expect(findSub(init, ascii("webm"))).toBeGreaterThan(0);
  });

  it("opens the Segment with the unknown-size marker (a live segment)", () => {
    const at = findSub(init, [0x18, 0x53, 0x80, 0x67]);
    expect(at).toBeGreaterThan(0);
    expect([...init.slice(at + 4, at + 12)]).toEqual([0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
  });

  it("sets TimecodeScale to 1,000,000 (ticks are milliseconds)", () => {
    // 0x2AD7B1, size 0x83, value 0x0F4240
    expect(findSub(init, [0x2a, 0xd7, 0xb1, 0x83, 0x0f, 0x42, 0x40])).toBeGreaterThan(0);
  });

  it("declares one A_OPUS track with the OpusHead as CodecPrivate", () => {
    expect(findSub(init, ascii("A_OPUS"))).toBeGreaterThan(0);
    expect(findSub(init, ascii("OpusHead"))).toBeGreaterThan(0);
    // TrackType element (0x83) with value 2 (audio) appears inside the entry.
    expect(findSub(init, [0x83, 0x81, 0x02])).toBeGreaterThan(0);
  });
});

describe("webmOpusCluster", () => {
  it("wraps the frame in a SimpleBlock for track 1 with the keyframe flag set", () => {
    const frame = new Uint8Array([0x11, 0x22, 0x33]);
    const cluster = webmOpusCluster(1500, frame);
    expect([...cluster.slice(0, 4)]).toEqual([0x1f, 0x43, 0xb6, 0x75]);
    // Timestamp element: 0xE7, size 0x82, value 1500 = 0x05DC.
    expect(findSub(cluster, [0xe7, 0x82, 0x05, 0xdc])).toBeGreaterThan(0);
    // SimpleBlock: 0xA3, then block header 0x81 (track 1), relative
    // timecode 0x0000, flags 0x80 (keyframe), then the frame bytes.
    const at = findSub(cluster, [0xa3]);
    expect(at).toBeGreaterThan(0);
    expect(cluster[at + 2]).toBe(0x81);
    expect(cluster[at + 3]).toBe(0x00);
    expect(cluster[at + 4]).toBe(0x00);
    expect(cluster[at + 5]).toBe(0x80);
    expect([...cluster.slice(at + 6, at + 9)]).toEqual([0x11, 0x22, 0x33]);
  });

  it("clamps negative timecodes to 0", () => {
    const cluster = webmOpusCluster(-50, new Uint8Array([0x00]));
    expect(findSub(cluster, [0xe7, 0x81, 0x00])).toBeGreaterThan(0);
  });
});
