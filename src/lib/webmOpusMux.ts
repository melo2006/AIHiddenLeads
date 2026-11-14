/**
 * Minimal WebM muxer for ONE Opus audio track (volume-speaker fix,
 * 2026-11-14). Just enough EBML to feed a MediaSource SourceBuffer:
 * an init segment (EBML header + Segment + Info + Tracks) followed by
 * one Cluster per encoded chunk, each holding a single SimpleBlock.
 *
 * Why this exists: the heard voice must reach the phone through a
 * plain media element playing a media RESOURCE (see
 * mediaElementPlayout.ts). MSE is the only live resource format a
 * page can produce, and for audio-only Opus in Chrome that means
 * WebM. No muxing library is bundled, and the subset needed here is
 * small and fully deterministic — hence this file, pinned by
 * webm-opus-mux.test.ts.
 *
 * Timeline: TimecodeScale is 1,000,000 (ticks = milliseconds).
 * Block timestamps are absolute on the caller's media timeline;
 * a cluster's Timestamp carries the block's millisecond and the
 * SimpleBlock's relative timecode is therefore 0.
 */

const concat = (parts: Uint8Array[]): Uint8Array => {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};

/** EBML variable-length size with a KNOWN value (shortest form). */
const vintSize = (value: number): Uint8Array => {
  // Capacities of the 1..4-byte forms (7/14/21/28 data bits).
  const forms: Array<{ bytes: number; capacity: number }> = [
    { bytes: 1, capacity: 0x7f },
    { bytes: 2, capacity: 0x3fff },
    { bytes: 3, capacity: 0x1fffff },
    { bytes: 4, capacity: 0xfffffff },
  ];
  for (const form of forms) {
    if (value < form.capacity) {
      const out = new Uint8Array(form.bytes);
      let v = value;
      for (let i = form.bytes - 1; i > 0; i--) {
        out[i] = v & 0xff;
        v = Math.floor(v / 256);
      }
      out[0] = v | (1 << (8 - form.bytes));
      return out;
    }
  }
  throw new Error(`webm size too large: ${value}`);
};

/** The 8-byte all-ones size: EBML "unknown size" (live segments). */
const UNKNOWN_SIZE = new Uint8Array([0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);

const element = (id: number[], payload: Uint8Array, unknownSize = false): Uint8Array =>
  concat([new Uint8Array(id), unknownSize ? UNKNOWN_SIZE : vintSize(payload.length), payload]);

const uintElement = (id: number[], value: number): Uint8Array => {
  const bytes: number[] = [];
  let v = value;
  do {
    bytes.unshift(v & 0xff);
    v = Math.floor(v / 256);
  } while (v > 0);
  return element(id, new Uint8Array(bytes));
};

const float64Element = (id: number[], value: number): Uint8Array => {
  const payload = new Uint8Array(8);
  new DataView(payload.buffer).setFloat64(0, value, false);
  return element(id, payload);
};

const stringElement = (id: number[], value: string): Uint8Array =>
  element(id, new TextEncoder().encode(value));

// Element IDs used below.
const ID = {
  EBML: [0x1a, 0x45, 0xdf, 0xa3],
  EBMLVersion: [0x42, 0x86],
  EBMLReadVersion: [0x42, 0xf7],
  EBMLMaxIDLength: [0x42, 0xf2],
  EBMLMaxSizeLength: [0x42, 0xf3],
  DocType: [0x42, 0x82],
  DocTypeVersion: [0x42, 0x87],
  DocTypeReadVersion: [0x42, 0x85],
  Segment: [0x18, 0x53, 0x80, 0x67],
  Info: [0x15, 0x49, 0xa9, 0x66],
  TimecodeScale: [0x2a, 0xd7, 0xb1],
  Tracks: [0x16, 0x54, 0xae, 0x6b],
  TrackEntry: [0xae],
  TrackNumber: [0xd7],
  TrackUID: [0x73, 0xc5],
  FlagLacing: [0x9c],
  TrackType: [0x83],
  CodecID: [0x86],
  CodecPrivate: [0x63, 0xa2],
  Audio: [0xe1],
  SamplingFrequency: [0xb5],
  Channels: [0x9f],
  Cluster: [0x1f, 0x43, 0xb6, 0x75],
  Timestamp: [0xe7],
  SimpleBlock: [0xa3],
} as const;

const TRACK_TYPE_AUDIO = 2;

/**
 * The OpusHead CodecPrivate block. `inputSampleRate` is the rate of
 * the PCM fed to the encoder (Gemini's 24 kHz); Opus always decodes
 * at 48 kHz, which is what the track's SamplingFrequency declares.
 * preSkip defaults to 0 — Chrome's encoder delay then shows up as a
 * few milliseconds of extra pipeline latency, far inside the playout
 * offset budget; when WebCodecs reports a real OpusHead in the
 * encoder metadata the caller passes THAT instead (see
 * mediaElementPlayout.ts).
 */
export function opusHead(inputSampleRate: number, channels = 1, preSkip = 0): Uint8Array {
  const head = new Uint8Array(19);
  head.set(new TextEncoder().encode("OpusHead"), 0);
  head[8] = 1; // version
  head[9] = channels;
  const view = new DataView(head.buffer);
  view.setUint16(10, preSkip, true);
  view.setUint32(12, inputSampleRate, true);
  view.setInt16(16, 0, true); // output gain
  head[18] = 0; // channel mapping family
  return head;
}

/** The MSE init segment: everything before the first Cluster. */
export function webmOpusInitSegment(codecPrivate: Uint8Array): Uint8Array {
  const ebml = element(
    ID.EBML,
    concat([
      uintElement(ID.EBMLVersion, 1),
      uintElement(ID.EBMLReadVersion, 1),
      uintElement(ID.EBMLMaxIDLength, 4),
      uintElement(ID.EBMLMaxSizeLength, 8),
      stringElement(ID.DocType, "webm"),
      uintElement(ID.DocTypeVersion, 2),
      uintElement(ID.DocTypeReadVersion, 2),
    ]),
  );
  const info = element(ID.Info, uintElement(ID.TimecodeScale, 1_000_000));
  const audio = element(
    ID.Audio,
    concat([float64Element(ID.SamplingFrequency, 48000), uintElement(ID.Channels, 1)]),
  );
  const trackEntry = element(
    ID.TrackEntry,
    concat([
      uintElement(ID.TrackNumber, 1),
      uintElement(ID.TrackUID, 1),
      uintElement(ID.TrackType, TRACK_TYPE_AUDIO),
      uintElement(ID.FlagLacing, 0),
      stringElement(ID.CodecID, "A_OPUS"),
      element(ID.CodecPrivate, codecPrivate),
      audio,
    ]),
  );
  const tracks = element(ID.Tracks, trackEntry);
  const segmentOpen = element(ID.Segment, concat([info, tracks]), true);
  return concat([ebml, segmentOpen]);
}

/**
 * One Cluster holding a single SimpleBlock for track 1.
 * `timecodeMs` is the block's absolute position on the media
 * timeline (the cluster Timestamp carries it; the block's relative
 * timecode is 0). Encoded Opus frames are all keyframes, so the
 * keyframe flag is always set.
 */
export function webmOpusCluster(timecodeMs: number, frame: Uint8Array): Uint8Array {
  const at = Math.max(0, Math.round(timecodeMs));
  const block = new Uint8Array(4 + frame.length);
  block[0] = 0x81; // track number 1, vint form
  const view = new DataView(block.buffer);
  view.setInt16(1, 0, false); // relative timecode
  block[3] = 0x80; // keyframe, no lacing
  block.set(frame, 4);
  return element(ID.Cluster, concat([uintElement(ID.Timestamp, at), element(ID.SimpleBlock, block)]));
}
