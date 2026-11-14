/**
 * Which path carries the presenter's AUDIBLE voice in a paired
 * (moving-avatar) session — the volume-stream fix (2026-11-14).
 *
 * Ron's fourth report of dead hardware volume keys on presenter
 * demos (2026-11-09 / 11-13 / 11-14 ×2) landed AFTER Publish #47's
 * media tap shipped. The tap re-originated Simli's returned WebRTC
 * stream through a WebAudio MediaStreamSource — but it left the
 * session's WebRTC audio footprint fully live (the LiveKit receiver
 * still renders into an element, and the tap's own AudioContext
 * still contains a live MediaStreamSource fed by an RTC track, the
 * exact graph shape the platform classifies with the
 * voice-communication channel). The one playout shape PROVEN
 * media-classified on Ron's phone is the voice-only one: locally
 * synthesized chunks (buffer sources) → WebAudio gain →
 * MediaStreamDestination → plain media element (the 2026-11-09
 * media-sink cure, never re-reported since).
 *
 * 'local' (the default): the Gemini chunk is played through that
 * proven local graph — scheduled PAIRED_CAPTION_DELAY_SEC late so
 * it lands on Simli's lips — while Simli still receives every chunk
 * for lip-sync and its returned audio is never made audible (the
 * element stays muted and the LiveKit audio publication is
 * unsubscribed where the SDK internals allow, so no RTC audio
 * receiver stays live in the page at all). The paired session's
 * audio footprint becomes identical to a voice-only session's.
 *
 * 'stream': Publish #47 behavior (media tap, direct element as
 * fallback) — kept intact as the fallback if the local path cannot
 * confirm, and reachable instantly as a kill switch: add
 * ?pairedAudible=stream to the demo URL (or set the
 * 'paired-audible' storage key) to A/B the two structures on the
 * same phone in the same sitting.
 */
export type PairedAudibleMode = "local" | "stream";

export const PAIRED_AUDIBLE_STORAGE_KEY = "paired-audible";
export const PAIRED_AUDIBLE_PARAM = "pairedAudible";

const asMode = (value: string | null | undefined): PairedAudibleMode | null =>
  value === "local" || value === "stream" ? value : null;

/**
 * Resolve the mode for a session: the URL parameter wins (a support
 * link can pin the structure), then the stored preference, then the
 * local-first default. Anything unrecognized falls through.
 */
export function resolvePairedAudibleMode(
  search: string | null | undefined,
  stored: string | null | undefined,
): PairedAudibleMode {
  let fromParam: string | null = null;
  if (search) {
    try {
      fromParam = new URLSearchParams(search).get(PAIRED_AUDIBLE_PARAM);
    } catch {
      fromParam = null;
    }
  }
  return asMode(fromParam) ?? asMode(stored) ?? "local";
}
