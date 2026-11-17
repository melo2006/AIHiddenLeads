// ElevenLabs live mouth — pure helpers (2026-11-17).
//
// When an agent carries a ready ElevenLabs clone AND its per-agent
// live-voice toggle is on, gemini-session stamps the voice id into the
// session config as `elevenLabsVoiceId` and the Live proxy speaks the
// model's replies with ElevenLabs instead of the Gemini voice: Gemini
// still listens, understands and decides (its native audio is held,
// never forwarded), and the reply text — which the proxy already
// receives as output transcription — is chunked here into speakable
// pieces, synthesized by ElevenLabs TTS as 24 kHz PCM, and forwarded
// over the EXACT { type: 'audio' } wire shape the native path uses, so
// the client's locked playout (and its interruption contract) treats
// the substitute voice identically. This module is the pure half:
// text cleaning/chunking, PCM byte alignment, base64, and the cost
// estimate. The proxy owns the fetch/stream state machine.

/** Session-config gate: the ElevenLabs voice id gemini-session stamped,
 *  or null when the mouth is off for this session. */
export function elevenLabsMouthVoiceId(config: Record<string, unknown> | null | undefined): string | null {
  const id = config?.elevenLabsVoiceId;
  return typeof id === 'string' && id.trim() ? id.trim() : null;
}

/**
 * Make model text speakable: strip markdown emphasis/code markers the
 * model occasionally emits (they must never be read aloud as "asterisk"),
 * collapse all whitespace runs to single spaces, trim.
 */
export function cleanSpeechText(text: string): string {
  return text
    .replace(/[*_`#]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const SENTENCE_END = /[.!?…]+["')\]]*\s+/;
const CLAUSE_BREAK = /[,;:—–]\s+/;

/** Index just past the first sentence end in `text`, or -1. A sentence
 *  end is terminal punctuation (plus any closing quote/bracket) followed
 *  by whitespace — the whitespace requirement keeps decimals ("3.5")
 *  and mid-token punctuation from splitting a chunk. */
function sentenceEndIndex(text: string): number {
  const m = SENTENCE_END.exec(text);
  return m ? m.index + m[0].length : -1;
}

/** Index just past the LAST clause break at or after `min` and at or
 *  before `max`, or -1. */
function clauseBreakIndex(text: string, min: number, max: number): number {
  let best = -1;
  const re = new RegExp(CLAUSE_BREAK.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const end = m.index + m[0].length;
    if (end >= min && end <= max) best = end;
    if (m.index > max) break;
  }
  return best;
}

export interface SpeechChunker {
  /** Feed streamed reply text; returns the chunks that are complete
   *  enough to synthesize now (possibly none). */
  push(text: string): string[];
  /** End of turn: whatever remains, cleaned, as one final chunk
   *  (null when nothing speakable remains). */
  flush(): string | null;
  /** Unsent buffered text (diagnostics/tests). */
  pending(): string;
}

/**
 * Sentence chunker for streamed model text. The first chunk of a turn
 * flushes early — at the first sentence end, or at a clause break once
 * it holds FIRST_FLUSH_MIN chars, capped at FIRST_FLUSH_MAX — so the
 * visitor hears the reply start quickly; later chunks wait for full
 * sentences up to LATER_FLUSH_MAX. A chunk is emitted only when it
 * contains a letter or a digit (pure punctuation is dropped).
 */
export function createSpeechChunker(): SpeechChunker {
  const FIRST_FLUSH_MIN = 40;
  const FIRST_FLUSH_MAX = 120;
  const LATER_FLUSH_MAX = 260;
  let buffer = '';
  let emitted = 0;

  const speakable = (s: string) => /[\p{L}\p{N}]/u.test(s);

  function take(final: boolean): string[] {
    const out: string[] = [];
    for (;;) {
      const limit = emitted === 0 ? FIRST_FLUSH_MAX : LATER_FLUSH_MAX;
      const sEnd = sentenceEndIndex(buffer);
      if (sEnd > 0 && (final || sEnd <= limit)) {
        const chunk = cleanSpeechText(buffer.slice(0, sEnd));
        buffer = buffer.slice(sEnd);
        if (speakable(chunk)) { out.push(chunk); emitted += 1; }
        continue;
      }
      if (!final && buffer.length >= limit) {
        const min = emitted === 0 ? FIRST_FLUSH_MIN : 60;
        const clause = clauseBreakIndex(buffer, min, limit);
        if (clause > 0) {
          const chunk = cleanSpeechText(buffer.slice(0, clause));
          buffer = buffer.slice(clause);
          if (speakable(chunk)) { out.push(chunk); emitted += 1; }
          continue;
        }
        // No clause break in range: hard cut at the last word boundary
        // before the limit so a run-on sentence cannot stall the turn.
        const cut = buffer.lastIndexOf(' ', limit);
        if (cut > 0) {
          const chunk = cleanSpeechText(buffer.slice(0, cut));
          buffer = buffer.slice(cut + 1);
          if (speakable(chunk)) { out.push(chunk); emitted += 1; }
          continue;
        }
      }
      break;
    }
    return out;
  }

  return {
    push(text: string) {
      buffer += text;
      return take(false);
    },
    flush() {
      const chunks = take(true);
      const rest = cleanSpeechText(buffer);
      buffer = '';
      if (speakable(rest)) chunks.push(rest);
      emitted += chunks.length;
      return chunks.length ? chunks.join(' ') : null;
    },
    pending() {
      return buffer;
    },
  };
}

/**
 * PCM stream alignment: ElevenLabs returns a raw byte stream whose read
 * boundaries can split a 16-bit sample. Carry the odd trailing byte into
 * the next read so every emitted slice is whole samples (the client
 * decodes each forwarded message as Int16Array independently).
 */
export function mergePcmCarry(carry: Uint8Array, chunk: Uint8Array): { emit: Uint8Array; rest: Uint8Array } {
  const merged = new Uint8Array(carry.length + chunk.length);
  merged.set(carry, 0);
  merged.set(chunk, carry.length);
  const even = merged.length - (merged.length % 2);
  return { emit: merged.subarray(0, even), rest: merged.subarray(even) };
}

/** Chunk-wise base64 for byte arrays (btoa over slices — safe for the
 *  multi-hundred-KB turns a long reply can produce). */
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

/**
 * ElevenLabs TTS cost estimate: $0.30 per 1,000 characters — the
 * published API list estimate for the flash/turbo class (the account's
 * plan credits may price it lower; the ledger's est_cost_usd is an
 * estimate by design, never an invoice — same convention as the Gemini
 * audio estimates in voice-usage.ts).
 */
export const ELEVENLABS_TTS_USD_PER_CHARACTER = 0.0003;

export function elevenLabsTtsCostUsd(characters: number): number {
  if (!Number.isFinite(characters) || characters <= 0) return 0;
  return Math.round(characters * ELEVENLABS_TTS_USD_PER_CHARACTER * 1e6) / 1e6;
}
